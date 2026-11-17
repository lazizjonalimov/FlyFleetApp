"""Owner settlements, the weekly run that drafts every payee's statement, and the pay file."""
import csv
import io
import uuid
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.crud import ListParams, like
from app.core.deps import Principal, get_db, require
from app.core.errors import Conflict, Invalid
from app.core.money import Money
from app.core.pagination import Page, envelope, paginate, parse_sort
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.fleet.models import UnitAssignment
from app.modules.loads.models import Load
from app.modules.organizations.models import AuditLog, User
from app.modules.owners import activity
from app.modules.owners import service as owners
from app.modules.owners.models import Owner
from app.modules.people.models import Person
from app.modules.settlements import owner_service as service
from app.modules.settlements import service as driver_service
from app.modules.settlements.models import DriverSettlement
from app.modules.settlements.owner_models import OwnerSettlement, OwnerSettlementLine
from app.modules.settlements.schemas import SettlementCreate

router = APIRouter(tags=["owner settlements"])
READ = require("settlements.read")
MANAGE = require("settlements.manage")


class OwnerSettlementRow(BaseModel):
    id: uuid.UUID
    number: str | None
    status: str
    final: bool
    owner_id: uuid.UUID
    owner_name: str
    entity_type: str
    category: str
    period_start: date
    period_end: date
    trucks: int
    trailers: int
    loads: int
    load_revenue: Money
    carrier_share: Money
    owner_gross: Money
    fuel: Money
    driver_pay_run: Money
    other_costs: Money
    escrow: Money
    net: Money
    approved_at: datetime | None
    paid_on: date | None
    version: int


class OwnerLineOut(BaseModel):
    id: uuid.UUID
    kind: str
    description: str
    detail: str | None
    load_id: uuid.UUID | None
    driver_id: uuid.UUID | None
    load_revenue: Money | None
    carrier_share: Money | None
    quantity: Decimal
    rate: Decimal
    amount: Money
    manual: bool


class OwnerNotOnIt(BaseModel):
    what: str
    value: str
    why: str


class OwnerAgreementLite(BaseModel):
    kind: str
    owner_pct: Decimal | None
    fsc_pct: Decimal | None
    per_mile: Decimal | None
    per_trailer_week: Decimal | None
    fuel_paid_by: str
    driver_pay_by: str


class OwnerSection(BaseModel):
    unit_id: uuid.UUID | None
    unit_number: str
    kind: str
    title: str
    agreement_kind: str | None
    agreement: OwnerAgreementLite | None = None
    driver: str | None
    lines: list[OwnerLineOut]
    gross: Money
    net: Money
    not_on_it: list[OwnerNotOnIt]


class OwnerTrailEntry(BaseModel):
    who: str
    what: str
    when: datetime


class OwnerSettlementDetail(OwnerSettlementRow):
    notes: str | None
    sections: list[OwnerSection]
    general: list[OwnerLineOut]
    escrow_balance: Money
    escrow_target: Money
    escrow_weekly: Money
    pay_day: str
    payment_method: str
    account_last4: str | None
    trail: list[OwnerTrailEntry]
    allowed_actions: list[str]


class OwnerSettlementListParams(ListParams):
    status: Literal["draft", "approved", "paid", "void"] | None = None
    owner_id: uuid.UUID | None = None
    period_from: date | None = None
    period_to: date | None = None


class OwnerSettlementCreate(BaseModel):
    owner_id: uuid.UUID
    period_start: date
    period_end: date
    final: bool = False
    notes: str | None = Field(None, max_length=2000)


class OwnerVersioned(BaseModel):
    version: int


class OwnerLineIn(OwnerVersioned):
    kind: Literal["adjustment", "other"] = "adjustment"
    description: str = Field(min_length=1, max_length=300)
    amount: Decimal = Field(max_digits=12, decimal_places=2)
    unit_id: uuid.UUID | None = None


class OwnerPayIn(OwnerVersioned):
    paid_on: date
    method: Literal["ach", "check", "direct_deposit", "cash", "other"] = "ach"
    reference: str | None = Field(None, max_length=80)


class OwnerVoidIn(OwnerVersioned):
    reason: str = Field(min_length=3, max_length=300)


class StatementsSummary(BaseModel):
    period_start: date
    period_end: date
    driver_pay: Money
    drivers: int
    driver_pay_run: Money
    pay_run_owners: int
    pay_run_drivers: int
    owner_net: Money
    owner_settlements: int
    owner_trucks: int
    owner_trailers: int
    escrow_held: Money
    escrow_due: list[dict]


class SettlementRunIn(BaseModel):
    period_start: date
    period_end: date


class SettlementRunOut(BaseModel):
    drivers_created: int
    owners_created: int
    skipped: list[dict]


def _names(db: Session, owner_ids) -> dict[uuid.UUID, tuple[str, str, str]]:
    owners_ = list(db.scalars(select(Owner).where(Owner.id.in_(list(owner_ids)))))
    persons = {x.id: x for x in db.scalars(select(Person).where(Person.id.in_([o.person_id for o in owners_ if o.person_id])))}
    cats = owners.categories(db, owners_)
    return {o.id: (owners.name_of(o, persons.get(o.person_id)), o.entity_type, cats[o.id]) for o in owners_}


def _rows(db: Session, settlements: list[OwnerSettlement]) -> list[OwnerSettlementRow]:
    names = _names(db, {st.owner_id for st in settlements})
    units = defaultdict(lambda: (set(), set(), set()))
    for sid, vehicle_id, trailer_id, load_id in db.execute(
            select(OwnerSettlementLine.settlement_id, OwnerSettlementLine.vehicle_id, OwnerSettlementLine.trailer_id,
                   OwnerSettlementLine.load_id).where(OwnerSettlementLine.settlement_id.in_([st.id for st in settlements]))):
        t, r, loads = units[sid]
        if vehicle_id:
            t.add(vehicle_id)
        if trailer_id:
            r.add(trailer_id)
        if load_id:
            loads.add(load_id)
    out = []
    for st in settlements:
        name, entity, cat = names.get(st.owner_id, ("", "", "non_operating"))
        t, r, loads = units[st.id]
        out.append(OwnerSettlementRow(
            id=st.id, number=st.number, status=st.status, final=st.final, owner_id=st.owner_id, owner_name=name,
            entity_type=entity, category=cat, period_start=st.period_start, period_end=st.period_end, trucks=len(t),
            trailers=len(r), loads=len(loads), load_revenue=st.load_revenue, carrier_share=st.carrier_share,
            owner_gross=st.owner_gross, fuel=st.fuel, driver_pay_run=st.driver_pay_run, other_costs=st.other_costs,
            escrow=st.escrow, net=st.net, approved_at=st.approved_at, paid_on=st.paid_on, version=st.version))
    return out


@router.get("/owner-settlements", response_model=Page[OwnerSettlementRow])
def list_owner_settlements(params: Annotated[OwnerSettlementListParams, Query()], p: Principal = Depends(READ),
                           db: Session = Depends(get_db)):
    stmt = select(OwnerSettlement)
    if params.status:
        stmt = stmt.where(OwnerSettlement.status == params.status)
    if params.owner_id:
        stmt = stmt.where(OwnerSettlement.owner_id == params.owner_id)
    if params.period_from:
        stmt = stmt.where(OwnerSettlement.period_end >= params.period_from)
    if params.period_to:
        stmt = stmt.where(OwnerSettlement.period_start <= params.period_to)
    if params.q and params.q.strip():
        pattern = like(params.q.strip())
        matching = select(Owner.id).where(or_(Owner.legal_name.ilike(pattern), Owner.dba.ilike(pattern),
                                              Owner.person_id.in_(select(Person.id).where(
                                                  (Person.first_name + " " + Person.last_name).ilike(pattern)))))
        stmt = stmt.where(or_(OwnerSettlement.owner_id.in_(matching), OwnerSettlement.number.ilike(pattern)))
    sortable = {"period_end": OwnerSettlement.period_end, "net": OwnerSettlement.net, "created_at": OwnerSettlement.created_at}
    rows, info = paginate(db, stmt, parse_sort(params.sort, sortable, "-period_end"), OwnerSettlement.id,
                          cursor=params.cursor, limit=params.limit, count=params.count)
    return envelope(_rows(db, rows), info)


def _week(p: Principal) -> tuple[date, date]:
    from datetime import timedelta
    today = p.today()
    monday = today - timedelta(days=today.weekday())
    return monday - timedelta(days=7), monday - timedelta(days=1)


@router.get("/owner-settlements/summary", response_model=StatementsSummary,
            summary="The Statements screen's figures for a week (default: last full week)")
def statements_summary(period_start: date | None = None, period_end: date | None = None, p: Principal = Depends(READ),
                       db: Session = Depends(get_db)):
    lo, hi = (period_start, period_end) if period_start and period_end else _week(p)
    drivers = list(db.scalars(select(DriverSettlement).where(DriverSettlement.status != "void",
                                                             DriverSettlement.period_start == lo)))
    driver_rows = {d.id: d for d in db.scalars(select(Driver).where(Driver.id.in_([s.driver_id for s in drivers])))}
    run = [s for s in drivers if driver_rows.get(s.driver_id) and driver_rows[s.driver_id].pay_by == "carrier_for_owner"]
    own = list(db.scalars(select(OwnerSettlement).where(OwnerSettlement.status != "void", OwnerSettlement.period_start == lo)))
    rows = _rows(db, own)
    all_owners = list(db.scalars(select(Owner)))
    held = sum((owners.escrow_balance(db, o) for o in all_owners), Decimal("0"))
    due = [{"owner_id": str(o.id), "name": owners.name_of(o, db.get(Person, o.person_id) if o.person_id else None),
            "amount": str(owners.escrow_balance(db, o)), "ended_on": o.ended_on.isoformat() if o.ended_on else None}
           for o in all_owners if o.status == "ended" and owners.escrow_balance(db, o) > 0]
    return StatementsSummary(
        period_start=lo, period_end=hi,
        driver_pay=sum((s.net_pay for s in drivers if s not in run), Decimal("0")), drivers=len(drivers) - len(run),
        driver_pay_run=sum((s.net_pay for s in run), Decimal("0")),
        pay_run_owners=len({driver_rows[s.driver_id].employer_owner_id for s in run}), pay_run_drivers=len(run),
        owner_net=sum((s.net for s in own), Decimal("0")), owner_settlements=len(own),
        owner_trucks=sum(r.trucks for r in rows), owner_trailers=sum(r.trailers for r in rows), escrow_held=held,
        escrow_due=due)


def _detail(db: Session, p: Principal, st: OwnerSettlement) -> OwnerSettlementDetail:
    row = _rows(db, [st])[0]
    owner = db.get(Owner, st.owner_id)
    lines = list(db.scalars(select(OwnerSettlementLine).where(OwnerSettlementLine.settlement_id == st.id)
                            .order_by(OwnerSettlementLine.position)))
    vehicle_ids = {x.vehicle_id for x in lines if x.vehicle_id}
    trailer_ids = {x.trailer_id for x in lines if x.trailer_id}
    for r in owners.open_rows(db, owner_ids=[owner.id], on=st.period_end):
        (vehicle_ids if r.vehicle_id else trailer_ids).add(r.vehicle_id or r.trailer_id)
    vehicles = {v.id: v for v in db.scalars(select(Vehicle).where(Vehicle.id.in_(vehicle_ids)))}
    trailers = {t.id: t for t in db.scalars(select(Trailer).where(Trailer.id.in_(trailer_ids)))}
    windows = {w.unit_id: w for w in activity.windows(db, owner.id, st.period_start, st.period_end)}
    seats = {s.vehicle_id: s for s in db.scalars(select(UnitAssignment).where(
        UnitAssignment.vehicle_id.in_(vehicle_ids), UnitAssignment.effective_from <= st.period_end,
        or_(UnitAssignment.effective_to.is_(None), UnitAssignment.effective_to >= st.period_start)))}
    names = {d.id: f"{d.first_name} {d.last_name}" for d in db.scalars(select(Driver).where(Driver.id.in_(
        [x for s in seats.values() for x in (s.driver_id, s.co_driver_id) if x])))}

    def out(line: OwnerSettlementLine) -> OwnerLineOut:
        return OwnerLineOut(id=line.id, kind=line.kind, description=line.description, detail=line.detail, load_id=line.load_id,
                       driver_id=line.driver_id, load_revenue=line.load_revenue, carrier_share=line.carrier_share,
                       quantity=line.quantity, rate=line.rate, amount=line.amount, manual=line.manual)

    sections = []
    for unit_id, unit in [*vehicles.items(), *trailers.items()]:
        mine = [x for x in lines if (x.vehicle_id or x.trailer_id) == unit_id]
        w = windows.get(unit_id)
        a = w.agreement if w else None
        seat = seats.get(unit_id)
        driver = None
        if seat:
            driver = names.get(seat.driver_id, "") + (f" & {names.get(seat.co_driver_id, '')}" if seat.co_driver_id else "")
        not_on_it = []
        if a and isinstance(unit, Vehicle):
            if a.fuel_paid_by == "carrier":
                not_on_it.append(OwnerNotOnIt(what=f"Fuel for {unit.unit_number}", value="Not on it",
                                         why=f"{p.org_name} buys fuel under this unit’s agreement"))
            if a.driver_pay_by == "carrier" and driver:
                not_on_it.append(OwnerNotOnIt(what=f"{driver}’s pay", value="Driver statement",
                                         why=f"{p.org_name} pays its company driver on a driver statement"))
            if a.driver_pay_by == "owner" and driver:
                not_on_it.append(OwnerNotOnIt(what=f"{driver}’s pay", value="Not in FlyFleet",
                                         why="The owner pays this driver directly"))
        earned = [x for x in mine if x.kind in ("load_share", "rental_week") or (x.kind == "adjustment" and x.amount > 0)]
        gross = sum((x.amount for x in earned), Decimal("0"))
        title = " ".join(str(v) for v in (unit.year, unit.make, getattr(unit, "model", None)) if v) or (
            "Truck" if isinstance(unit, Vehicle) else f"{unit.type.replace('_', ' ')} trailer")
        sections.append(OwnerSection(
            unit_id=unit_id, unit_number=unit.unit_number, kind="truck" if isinstance(unit, Vehicle) else "trailer",
            title=title, agreement_kind=a.kind if a else None,
            agreement=OwnerAgreementLite(kind=a.kind, owner_pct=a.owner_pct, fsc_pct=a.fsc_pct, per_mile=a.per_mile,
                                         per_trailer_week=a.per_trailer_week, fuel_paid_by=a.fuel_paid_by,
                                         driver_pay_by=a.driver_pay_by) if a else None,
            driver=driver, lines=[out(x) for x in mine], gross=gross, net=sum((x.amount for x in mine), Decimal("0")),
            not_on_it=not_on_it))
    sections.sort(key=lambda s: (s.kind != "truck", s.unit_number))
    general = [out(x) for x in lines if not (x.vehicle_id or x.trailer_id)]
    users = {}
    trail = []
    for entry in db.scalars(select(AuditLog).where(AuditLog.entity_type == "owner_settlement", AuditLog.entity_id == st.id)
                            .order_by(AuditLog.created_at)):
        if entry.actor_user_id and entry.actor_user_id not in users:
            users[entry.actor_user_id] = db.scalar(select(User.full_name).where(User.id == entry.actor_user_id)) or "Someone"
        trail.append(OwnerTrailEntry(who=users.get(entry.actor_user_id, "System"), when=entry.created_at,
                                what={"owner_settlement.created": "Prepared from delivered loads, expenses and the agreements",
                                      "owner_settlement.approved": f"Approved for payment as {st.number}",
                                      "owner_settlement.paid": "Paid", "owner_settlement.voided": f"Voided: {st.void_reason}",
                                      "owner_settlement.line_added": "Added a line by hand"}.get(entry.action, entry.action)))
    actions = {"draft": ["recalculate", "add_line", "approve", "void"], "approved": ["pay", "void"]}.get(st.status, [])
    return OwnerSettlementDetail(**row.model_dump(), notes=st.notes, sections=sections, general=general,
                                 escrow_balance=owners.escrow_balance(db, owner), escrow_target=owner.escrow_target,
                                 escrow_weekly=owner.escrow_weekly, pay_day=owner.pay_day, payment_method=owner.payment_method,
                                 account_last4=owner.account_last4, trail=trail,
                                 allowed_actions=[a for a in actions if p.can("settlements.manage")])


@router.post("/owner-settlements", response_model=OwnerSettlementDetail, status_code=201)
def create_owner_settlement(body: OwnerSettlementCreate, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    st = service.create(db, p, body.owner_id, body.period_start, body.period_end, final=body.final, notes=body.notes)
    db.commit()
    return _detail(db, p, st)


@router.get("/owner-settlements/{settlement_id}", response_model=OwnerSettlementDetail)
def get_owner_settlement(settlement_id: uuid.UUID, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    st = db.get(OwnerSettlement, settlement_id)
    if st is None:
        raise Invalid("Settlement not found", field="settlement_id")
    return _detail(db, p, st)


@router.post("/owner-settlements/{settlement_id}/recalculate", response_model=OwnerSettlementDetail)
def recalculate(settlement_id: uuid.UUID, body: OwnerVersioned, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    st = service.lock(db, settlement_id)
    service.check_version(st, body.version)
    service.recalculate(db, p, st)
    st.version += 1
    db.commit()
    return _detail(db, p, st)


@router.post("/owner-settlements/{settlement_id}/lines", response_model=OwnerSettlementDetail, status_code=201)
def add_line(settlement_id: uuid.UUID, body: OwnerLineIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    st = service.lock(db, settlement_id)
    service.check_version(st, body.version)
    service.add_line(db, p, st, body.kind, body.description, body.amount, body.unit_id)
    db.commit()
    return _detail(db, p, st)


@router.post("/owner-settlements/{settlement_id}/approve", response_model=OwnerSettlementDetail)
def approve(settlement_id: uuid.UUID, body: OwnerVersioned, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    st = service.lock(db, settlement_id)
    service.check_version(st, body.version)
    owner = db.get(Owner, st.owner_id)
    person = db.get(Person, owner.person_id) if owner.person_id else None
    if person is not None and person.user_id == p.user_id:
        raise Conflict("You can't approve your own settlement. Someone else with access approves it.",
                       code="SELF_APPROVAL")
    service.approve(db, p, st)
    db.commit()
    return _detail(db, p, st)


@router.post("/owner-settlements/{settlement_id}/pay", response_model=OwnerSettlementDetail)
def pay(settlement_id: uuid.UUID, body: OwnerPayIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    st = service.lock(db, settlement_id)
    service.check_version(st, body.version)
    service.pay(db, p, st, body.paid_on, body.method, body.reference)
    db.commit()
    return _detail(db, p, st)


@router.post("/owner-settlements/{settlement_id}/void", response_model=OwnerSettlementDetail)
def void(settlement_id: uuid.UUID, body: OwnerVoidIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    st = service.lock(db, settlement_id)
    service.check_version(st, body.version)
    service.void(db, p, st, body.reason)
    db.commit()
    return _detail(db, p, st)


def _owner_operator_drivers(db: Session) -> set[uuid.UUID]:
    """Drivers who drive a unit they own: paid only on their owner settlement, never on a driver statement."""
    owned = {(r.vehicle_id, r.owner_id) for r in owners.open_rows(db) if r.vehicle_id and r.owner_id}
    owner_person = dict(db.execute(select(Owner.id, Owner.person_id).where(Owner.person_id.is_not(None))).all())
    out = set()
    for seat in db.scalars(select(UnitAssignment).where(UnitAssignment.effective_to.is_(None))):
        for driver_id in (seat.driver_id, seat.co_driver_id):
            if not driver_id:
                continue
            person = db.scalar(select(Driver.person_id).where(Driver.id == driver_id))
            if any(v == seat.vehicle_id and owner_person.get(o) == person for v, o in owned):
                out.add(driver_id)
    return out


@router.post("/settlement-runs", response_model=SettlementRunOut, status_code=201,
             summary="Draft every driver and owner settlement for a week")
def run(body: SettlementRunIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    if body.period_end < body.period_start:
        raise Invalid("The period ends before it starts", field="period_end")
    created_d = created_o = 0
    skipped = []
    own_ops = _owner_operator_drivers(db)
    for d in db.scalars(select(Driver).where(Driver.status == "active").order_by(Driver.last_name)):
        name = f"{d.first_name} {d.last_name}"
        if d.id in own_ops:
            skipped.append({"name": name, "reason": "Paid on their owner settlement"})
            continue
        if d.pay_by == "owner":
            skipped.append({"name": name, "reason": "The owner pays this driver outside FlyFleet"})
            continue
        if db.scalar(select(DriverSettlement.id).where(DriverSettlement.driver_id == d.id, DriverSettlement.status != "void",
                                                       DriverSettlement.period_start == body.period_start)):
            skipped.append({"name": name, "reason": "Already has a statement for this week"})
            continue
        if db.scalar(select(DriverSettlement.id).where(DriverSettlement.driver_id == d.id, DriverSettlement.status == "draft")):
            skipped.append({"name": name, "reason": "Has an open draft for another week"})
            continue
        driver_service.create(db, p, SettlementCreate(driver_id=d.id, period_start=body.period_start,
                                                      period_end=body.period_end))
        created_d += 1
    for o in db.scalars(select(Owner).where(Owner.status.in_(("active", "suspended")))):
        try:
            with db.begin_nested():
                service.create(db, p, o.id, body.period_start, body.period_end)
            created_o += 1
        except Conflict as e:
            skipped.append({"name": owners.name_of(o, db.get(Person, o.person_id) if o.person_id else None), "reason": e.message})
    db.commit()
    return SettlementRunOut(drivers_created=created_d, owners_created=created_o, skipped=skipped)


@router.get("/settlement-pay-file", summary="Approved statements for a week as a CSV pay file",
            response_class=Response, responses={200: {"content": {"text/csv": {}}}})
def pay_file(period_start: date = Query(...), p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Payee", "Type", "Statement", "Period", "Amount", "Method", "Account"])
    for st, d in db.execute(select(DriverSettlement, Driver).join(Driver, Driver.id == DriverSettlement.driver_id)
                            .where(DriverSettlement.status == "approved", DriverSettlement.period_start == period_start)):
        writer.writerow([f"{d.first_name} {d.last_name}", "Driver pay", st.number,
                         f"{st.period_start}..{st.period_end}", f"{st.net_pay:.2f}", "", ""])
    names = {}
    for st in db.scalars(select(OwnerSettlement).where(OwnerSettlement.status == "approved",
                                                       OwnerSettlement.period_start == period_start)):
        if st.owner_id not in names:
            names.update(_names(db, [st.owner_id]))
        owner = db.get(Owner, st.owner_id)
        account = f"••{owner.account_last4}" if owner.account_last4 else ""
        writer.writerow([names[st.owner_id][0], "Owner settlement", st.number, f"{st.period_start}..{st.period_end}",
                         f"{st.net:.2f}", owner.payment_method.upper(), account])
    return Response(buffer.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="pay-file-{period_start}.csv"'})


# Loads delivered on an owner's units, for the settlement's load table.
@router.get("/owner-settlements/{settlement_id}/loads", response_model=list[dict])
def settlement_loads(settlement_id: uuid.UUID, p: Principal = Depends(READ), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.execute(select(OwnerSettlementLine, Load).join(Load, Load.id == OwnerSettlementLine.load_id)
                      .where(OwnerSettlementLine.settlement_id == settlement_id, OwnerSettlementLine.kind == "load_share")
                      .order_by(Load.delivered_at))
    return [{"load_id": str(load.id), "load_number": load.load_number,
             "delivered_at": load.delivered_at.isoformat() if load.delivered_at else None,
             "origin": ", ".join(x for x in (load.origin_city, load.origin_state) if x), "destination": ", ".join(
                 x for x in (load.destination_city, load.destination_state) if x), "miles": load.miles,
             "line_haul": str(load.customer_rate), "charges": str(load.charges_total),
             "total": str(line.load_revenue or 0), "owner_share": str(line.amount)} for line, load in rows]

