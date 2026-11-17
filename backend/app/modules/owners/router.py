"""Owners of trucks and trailers, their agreements, who owns each unit and who drives it."""
import uuid
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.crud import like
from app.core.deps import Principal, get_db, get_or_404, require
from app.core.errors import Invalid
from app.core.idempotency import run_idempotent
from app.core.money import money
from app.core.pagination import Page, envelope, paginate, parse_sort
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.expenses.models import Expense
from app.modules.fleet.models import UnitAssignment
from app.modules.maintenance.models import WorkOrder
from app.modules.owners import activity, service
from app.modules.owners import schemas as s
from app.modules.owners.models import PORTAL_PERMISSIONS, EquipmentOwnership, Owner, OwnerAgreement, OwnerContact
from app.modules.people.models import Person

router = APIRouter(prefix="/owners", tags=["owners"])
equipment_router = APIRouter(tags=["owners"])
READ = require("owners.read")
MANAGE = require("owners.manage")
COST_LABELS = {"insurance": "Physical damage", "occupational": "Occupational accident", "eld": "ELD and telematics",
               "plates": "IRP plates and permits"}


@router.get("/portal-permissions", summary="The owner portal's permissions and presets")
def portal_catalogue(p: Principal = Depends(READ)) -> dict:
    return {"permissions": [{"key": k, "label": v} for k, v in PORTAL_PERMISSIONS.items()], "presets": s.PRESETS_OUT}


@router.get("/summary", response_model=s.OwnerSummary)
def get_summary(p: Principal = Depends(READ), db: Session = Depends(get_db)):
    return service.summary(db)


@router.get("", response_model=Page[s.OwnerRow])
def list_owners(params: Annotated[s.OwnerListParams, Query()], p: Principal = Depends(READ), db: Session = Depends(get_db)):
    stmt = select(Owner)
    tab = params.tab
    if tab == "individuals" or params.entity_type == "individual":
        stmt = stmt.where(Owner.entity_type == "individual")
    if tab == "businesses" or params.entity_type == "business":
        stmt = stmt.where(Owner.entity_type == "business")
    if tab in ("onboarding", "ended"):
        stmt = stmt.where(Owner.status == tab)
    if params.status:
        stmt = stmt.where(Owner.status == params.status)
    if params.portal is not None:
        stmt = stmt.where(Owner.portal_enabled.is_(params.portal))
    ids = service.filter_ids(db, tab)
    if ids is not None:
        stmt = stmt.where(Owner.id.in_(ids))
    if params.agreement:
        stmt = stmt.where(Owner.id.in_(select(OwnerAgreement.owner_id).where(OwnerAgreement.kind == params.agreement)))
    name = func.coalesce(Owner.legal_name, select(func.concat(Person.first_name, " ", Person.last_name))
                         .where(Person.id == Owner.person_id).scalar_subquery())
    if params.q and params.q.strip():
        pattern = like(params.q.strip())
        contact = select(Person.id).where(or_((Person.first_name + " " + Person.last_name).ilike(pattern),
                                              Person.email.ilike(pattern), Person.phone.ilike(pattern)))
        stmt = stmt.where(or_(name.ilike(pattern), Owner.dba.ilike(pattern), Owner.email.ilike(pattern),
                              Owner.phone.ilike(pattern), Owner.city.ilike(pattern), Owner.person_id.in_(contact),
                              Owner.id.in_(select(OwnerContact.owner_id).where(OwnerContact.person_id.in_(contact)))))
    sortable = {"name": name, "created_at": Owner.created_at, "owner_since": Owner.owner_since, "status": Owner.status}
    rows, info = paginate(db, stmt, parse_sort(params.sort, sortable, "name"), Owner.id, cursor=params.cursor,
                          limit=params.limit, count=params.count)
    return envelope(service.rows_out(db, rows), info)


@router.post("", response_model=s.OwnerDetail, status_code=201)
def create_owner(body: s.OwnerCreate, p: Principal = Depends(MANAGE), db: Session = Depends(get_db),
                 idempotency_key: Annotated[str | None, Header()] = None):
    """Add an owner with their units, agreements, contacts and portal access, all at once."""
    def work():
        owner = service.create(db, p, body)
        db.flush()
        return 201, service.detail(db, p, owner)
    return run_idempotent(db, p, idempotency_key, "POST /owners", body.model_dump(mode="json"), work)


@router.get("/{owner_id}", response_model=s.OwnerDetail)
def get_owner(owner_id: uuid.UUID, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    return service.detail(db, p, service.get(db, owner_id))


@router.patch("/{owner_id}", response_model=s.OwnerDetail)
def update_owner(owner_id: uuid.UUID, body: s.OwnerUpdate, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    owner = service.get(db, owner_id, lock=True)
    service.update(db, p, owner, body)
    db.commit()
    return service.detail(db, p, owner)


@router.post("/{owner_id}/sensitive", response_model=s.OwnerSensitive,
             summary="Show tax ID, bank details and birth date (recorded in the audit log)")
def reveal(owner_id: uuid.UUID, p: Principal = Depends(require("owners.sensitive.read")), db: Session = Depends(get_db)):
    result = service.reveal(db, p, service.get(db, owner_id))
    db.commit()
    return result


@router.put("/{owner_id}/portal-permissions", response_model=s.OwnerDetail)
def set_portal_permissions(owner_id: uuid.UUID, body: s.PortalPermissionsIn, p: Principal = Depends(MANAGE),
                           db: Session = Depends(get_db)):
    """Turn the portal on or off and set its 12 permissions, or a preset. Applies on the owner's next click."""
    owner = service.get(db, owner_id, lock=True)
    before = {"enabled": owner.portal_enabled, "permissions": list(owner.portal_permissions or [])}
    perms = service._permissions(body)
    if perms is not None:
        owner.portal_permissions = perms
    if body.enabled is not None:
        owner.portal_enabled = body.enabled
    audit(db, p, "owner.portal_permissions_updated", "owner", owner.id,
          {"before": before, "after": {"enabled": owner.portal_enabled, "permissions": owner.portal_permissions}})
    db.commit()
    return service.detail(db, p, owner)


@router.post("/{owner_id}/portal-users", response_model=s.PortalUserOut, status_code=201)
def add_portal_user(owner_id: uuid.UUID, body: s.PortalUserIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    owner = service.get(db, owner_id, lock=True)
    out = service.add_portal_user(db, p, owner, body)
    db.commit()
    return out


@router.delete("/{owner_id}/portal-users/{user_id}", status_code=204)
def remove_portal_user(owner_id: uuid.UUID, user_id: uuid.UUID, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    service.remove_portal_user(db, p, service.get(db, owner_id, lock=True), user_id)
    db.commit()


@router.post("/{owner_id}/agreements", response_model=s.AgreementOut, status_code=201)
def add_agreement(owner_id: uuid.UUID, body: s.AgreementIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    owner = service.get(db, owner_id, lock=True)
    agreement = service._agreement(db, p, owner, body, body.effective_from or p.today())
    audit(db, p, "owner.agreement_added", "owner", owner.id, body.model_dump(mode="json"))
    db.commit()
    return s.AgreementOut.model_validate(agreement)


@router.patch("/{owner_id}/agreements/{agreement_id}", response_model=s.AgreementOut)
def update_agreement(owner_id: uuid.UUID, agreement_id: uuid.UUID, body: s.AgreementUpdate, p: Principal = Depends(MANAGE),
                     db: Session = Depends(get_db)):
    agreement = db.get(OwnerAgreement, agreement_id)
    if agreement is None or agreement.owner_id != owner_id:
        raise Invalid("Agreement not found", field="agreement_id")
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(agreement, key, value)
    if agreement.effective_to and agreement.effective_to < agreement.effective_from:
        raise Invalid("The agreement ends before it starts", field="effective_to")
    db.flush()
    audit(db, p, "owner.agreement_updated", "owner", owner_id, body.model_dump(mode="json", exclude_unset=True))
    db.commit()
    return s.AgreementOut.model_validate(agreement)


def _range(p: Principal, date_from: date | None, date_to: date | None) -> tuple[date, date]:
    today = p.today()
    hi = date_to or today
    lo = date_from or (hi - timedelta(days=hi.weekday()))
    if lo > hi:
        raise Invalid("The range ends before it starts", field="date_to")
    if (hi - lo).days > 731:
        raise Invalid("Pick a range of two years or less", field="date_from")
    return lo, hi


def owner_activity(db: Session, p: Principal, owner: Owner, lo: date, hi: date, unit_id: uuid.UUID | None,
                   *, hide_customers: bool = False) -> s.OwnerActivity:
    ws = activity.windows(db, owner.id, lo, hi, unit_id)
    now = activity.period(db, p, owner, lo, hi, unit_id, hide_customers=hide_customers, ws=ws)
    months = []
    for start in activity.month_starts(hi):
        end = min((start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1), hi)
        m = activity.period(db, p, owner, start, end, unit_id, hide_customers=hide_customers)
        by_unit = defaultdict(Decimal)
        for x in m.loads:
            by_unit[x.unit_number] += x.revenue
        months.append(s.MonthOut(month=start, revenue=m.revenue, owner_gross=m.owner_gross, net=m.net,
                                 by_unit=dict(by_unit)))
    numbers = dict(db.execute(select(Vehicle.id, Vehicle.unit_number).where(Vehicle.id.in_(
        [w.unit_id for w in ws if w.kind == "truck"]))).all())
    numbers |= dict(db.execute(select(Trailer.id, Trailer.unit_number).where(Trailer.id.in_(
        [w.unit_id for w in ws if w.kind == "trailer"]))).all())
    by_unit = []
    for unit, number in numbers.items():
        rows = [x for x in now.loads if x.unit_id == unit and x.status != "cancelled"]
        revenue = sum((x.revenue for x in rows), Decimal("0"))
        gross = sum((x.owner_gross for x in rows), Decimal("0")) + now.unit_rental.get(unit, Decimal("0"))
        costs = now.unit_costs.get(unit, Decimal("0"))
        fuel = now.unit_kinds.get((unit, "fuel"), Decimal("0"))
        pay = now.unit_kinds.get((unit, "driver_pay"), Decimal("0"))
        drivers = [x.driver_name for x in rows if x.driver_name]
        kind = next(w.kind for w in ws if w.unit_id == unit)
        by_unit.append(s.UnitFigures(unit_id=unit, unit_number=number, kind=kind, miles=sum(x.miles for x in rows),
                                     loads=len(rows), driver_name=max(set(drivers), key=drivers.count) if drivers else None,
                                     revenue=revenue, carrier_share=revenue - sum((x.owner_gross for x in rows), Decimal("0")),
                                     owner_gross=gross, fuel=fuel, driver_pay=pay, other_costs=costs - fuel - pay,
                                     owner_costs=costs, owner_net=gross - costs))
    by_unit.sort(key=lambda u: (u.kind != "truck", -u.miles, u.unit_number))
    open_trucks = {w.unit_id for w in ws if w.kind == "truck" and w.covers(hi)}
    live = [x for x in now.loads if x.status in activity.LIVE]
    return s.OwnerActivity(
        date_from=lo, date_to=hi, units=len({w.unit_id for w in ws if w.covers(hi)}), trucks=len(open_trucks),
        trucks_on_loads=len({x.unit_id for x in live}), loads=sum(1 for x in now.loads if x.status != "cancelled"),
        active_loads=len(live), miles=sum(x.miles for x in now.loads if x.status != "cancelled"),
        revenue=now.revenue, carrier_share=now.carrier_share, owner_gross=now.owner_gross, rental_gross=now.rental_gross,
        costs={k: money(v) for k, v in now.costs.items()}, owner_costs=now.owner_costs, net=now.net,
        load_rows=[s.LoadSplitOut(**x.__dict__) for x in now.loads], months=months, by_unit=by_unit,
        on_time=[s.WeekOnTime(**w) for w in activity.on_time_weeks(
            activity.period(db, p, owner, hi - timedelta(weeks=8), hi, unit_id, hide_customers=True).loads, hi)])


@router.get("/{owner_id}/activity", response_model=s.OwnerActivity,
            summary="Loads, revenue split, costs and net for a range; monthly series for the charts")
def get_activity(owner_id: uuid.UUID, date_from: date | None = None, date_to: date | None = None,
                 unit_id: uuid.UUID | None = None, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    lo, hi = _range(p, date_from, date_to)
    owner = service.get(db, owner_id)
    return owner_activity(db, p, owner, lo, hi, unit_id, hide_customers=not p.can("customers.read"))


def owner_fuel(db: Session, p: Principal, owner: Owner, lo: date, hi: date) -> s.OwnerFuel:
    ws = activity.windows(db, owner.id, activity.month_starts(hi)[0], hi)
    trucks = {w.unit_id for w in ws if w.kind == "truck"}
    trailers = {w.unit_id for w in ws if w.kind == "trailer"}
    numbers = dict(db.execute(select(Vehicle.id, Vehicle.unit_number).where(Vehicle.id.in_(trucks))).all())
    numbers |= dict(db.execute(select(Trailer.id, Trailer.unit_number).where(Trailer.id.in_(trailers))).all())
    drivers = {}
    fuel, other, months = [], [], defaultdict(lambda: {"owner": Decimal("0"), "carrier": Decimal("0")})
    expenses = list(db.scalars(select(Expense).where(
        or_(Expense.vehicle_id.in_(trucks), Expense.trailer_id.in_(trailers)),
        Expense.incurred_on >= activity.month_starts(hi)[0], Expense.incurred_on <= hi).order_by(Expense.incurred_on.desc())))
    ids = {e.driver_id for e in expenses if e.driver_id}
    if ids:
        drivers = {d.id: f"{d.first_name} {d.last_name}" for d in db.scalars(select(Driver).where(Driver.id.in_(ids)))}
    for e in expenses:
        unit = e.vehicle_id or e.trailer_id
        w = activity._window_on(ws, unit, e.incurred_on)
        if w is None:
            continue
        payer = activity.expense_payer(e, w.agreement)
        if e.category == "fuel":
            months[e.incurred_on.replace(day=1)][payer] += e.amount
        if not (lo <= e.incurred_on <= hi):
            continue
        row = s.ExpenseRow(id=e.id, incurred_on=e.incurred_on, category=e.category, unit_number=numbers.get(unit),
                           driver_name=drivers.get(e.driver_id), vendor=e.vendor, jurisdiction=e.jurisdiction,
                           gallons=e.gallons, amount=e.amount, paid_with=e.paid_with, payer=payer,
                           on_settlement=payer == "owner", settlement_id=None)
        (fuel if e.category == "fuel" else other).append(row)
    chargebacks = []
    for w in ws:
        if not w.covers(hi):
            continue
        for key, label in COST_LABELS.items():
            weekly = getattr(w.agreement, f"{key}_weekly")
            if weekly:
                chargebacks.append(s.Chargeback(label=label, unit_number=numbers.get(w.unit_id, ""), weekly=weekly,
                                                agreement_kind=w.agreement.kind))
    fuel_total = sum((x.amount for x in fuel), Decimal("0"))
    return s.OwnerFuel(
        date_from=lo, date_to=hi, fuel=fuel, other=other, chargebacks=chargebacks,
        months=[s.FuelMonth(month=m, owner=months[m]["owner"], carrier=months[m]["carrier"])
                for m in activity.month_starts(hi)],
        gallons=sum((x.gallons or Decimal("0") for x in fuel), Decimal("0")), fuel_total=fuel_total,
        owner_paid=sum((x.amount for x in fuel + other if x.payer == "owner"), Decimal("0")),
        carrier_paid=sum((x.amount for x in fuel + other if x.payer == "carrier"), Decimal("0")))


@router.get("/{owner_id}/fuel", response_model=s.OwnerFuel,
            summary="Fuel and expenses on the owner's units, who paid each, and fixed weekly chargebacks")
def get_fuel(owner_id: uuid.UUID, date_from: date | None = None, date_to: date | None = None,
             p: Principal = Depends(READ), db: Session = Depends(get_db)):
    lo, hi = _range(p, date_from, date_to)
    return owner_fuel(db, p, service.get(db, owner_id), lo, hi)


def owner_maintenance(db: Session, p: Principal, owner: Owner) -> s.OwnerMaintenance:
    today = p.today()
    rows = service.open_rows(db, owner_ids=[owner.id])
    agreements = {a.id: a for a in db.scalars(select(OwnerAgreement).where(OwnerAgreement.owner_id == owner.id))}
    payer = {(r.vehicle_id or r.trailer_id): agreements[r.agreement_id].maintenance_paid_by
             for r in rows if r.agreement_id in agreements}
    trucks = {v.id: v for v in db.scalars(select(Vehicle).where(Vehicle.id.in_([r.vehicle_id for r in rows if r.vehicle_id])))}
    trailers = {t.id: t for t in db.scalars(select(Trailer).where(Trailer.id.in_([r.trailer_id for r in rows if r.trailer_id])))}
    units = {**trucks, **trailers}
    orders = []
    for wo in db.scalars(select(WorkOrder).where(or_(WorkOrder.vehicle_id.in_(list(trucks)),
                                                     WorkOrder.trailer_id.in_(list(trailers))))
                         .order_by(WorkOrder.created_at.desc()).limit(200)):
        unit = wo.vehicle_id or wo.trailer_id
        orders.append(s.WorkOrderRow(id=wo.id, number=wo.number, unit_number=units[unit].unit_number, title=wo.title,
                                     status=wo.status, vendor=wo.vendor, opened_on=wo.created_at.date(),
                                     completed_on=wo.completed_at.date() if wo.completed_at else None,
                                     total_cost=wo.total_cost, payer=payer.get(unit, "carrier")))
    upcoming = []
    for unit in units.values():
        for label, due in (("Registration renewal", unit.registration_expiry), ("DOT annual inspection", unit.inspection_expiry),
                           ("Insurance renewal", unit.insurance_expiry)):
            if due and (due - today).days <= 60:
                upcoming.append(s.UpcomingItem(unit_number=unit.unit_number, label=label, due_on=due, days=(due - today).days))
    for wo in db.scalars(select(WorkOrder).where(or_(WorkOrder.vehicle_id.in_(list(trucks)),
                                                     WorkOrder.trailer_id.in_(list(trailers))),
                                                 WorkOrder.status == "open", WorkOrder.scheduled_for.is_not(None))):
        unit = units[wo.vehicle_id or wo.trailer_id]
        upcoming.append(s.UpcomingItem(unit_number=unit.unit_number, label=wo.title, due_on=wo.scheduled_for,
                                       days=(wo.scheduled_for - today).days))
    upcoming.sort(key=lambda u: u.due_on)
    return s.OwnerMaintenance(work_orders=orders, upcoming=upcoming)


@router.get("/{owner_id}/maintenance", response_model=s.OwnerMaintenance,
            summary="Work orders on the owner's units with who pays under each agreement, and what is coming up")
def get_maintenance(owner_id: uuid.UUID, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    return owner_maintenance(db, p, service.get(db, owner_id))


def owner_documents(db: Session, owner: Owner, *, portal_only: bool = False) -> list[s.OwnerDocument]:
    rows = service.open_rows(db, owner_ids=[owner.id])
    truck_ids = [r.vehicle_id for r in rows if r.vehicle_id]
    trailer_ids = [r.trailer_id for r in rows if r.trailer_id]
    trucks = dict(db.execute(select(Vehicle.id, Vehicle.unit_number).where(Vehicle.id.in_(truck_ids))).all())
    trailers = dict(db.execute(select(Trailer.id, Trailer.unit_number).where(Trailer.id.in_(trailer_ids))).all())
    from app.modules.documents.models import Document, DocumentLink
    stmt = (select(Document, DocumentLink).join(DocumentLink, DocumentLink.document_id == Document.id)
            .where(Document.upload_status == "uploaded",
                   or_((DocumentLink.entity_type == "owner") & (DocumentLink.entity_id == owner.id),
                       (DocumentLink.entity_type == "vehicle") & DocumentLink.entity_id.in_(list(trucks)),
                       (DocumentLink.entity_type == "trailer") & DocumentLink.entity_id.in_(list(trailers))))
            .order_by(Document.created_at.desc()))
    if portal_only:
        stmt = stmt.where(Document.in_portal.is_(True))
    out, seen = [], set()
    for doc, link in db.execute(stmt).tuples():
        if doc.id in seen:
            continue
        seen.add(doc.id)
        kind = {"owner": "owner", "vehicle": "truck", "trailer": "trailer"}[link.entity_type]
        attached = "Owner" if kind == "owner" else (trucks if kind == "truck" else trailers).get(link.entity_id, "")
        out.append(s.OwnerDocument(id=doc.id, type=doc.type, filename=doc.filename, attached_to=attached,
                                   attached_kind=kind, uploaded_at=doc.created_at, expires_on=doc.expires_on,
                                   review_status=doc.review_status, in_portal=doc.in_portal))
    return out


@router.get("/{owner_id}/documents", response_model=list[s.OwnerDocument],
            summary="Documents about the owner and their units; each shown in the portal or not")
def get_documents(owner_id: uuid.UUID, p: Principal = Depends(require("owners.read")), db: Session = Depends(get_db)):
    if not p.can("documents.read"):
        return []
    return owner_documents(db, service.get(db, owner_id))


@router.get("/{owner_id}/live", response_model=list[s.LiveUnit],
            summary="The owner's trucks: the load each is on and where it last reported from")
def get_live(owner_id: uuid.UUID, p: Principal = Depends(require("owners.read")), db: Session = Depends(get_db)):
    return service.live_units(db, service.get(db, owner_id), with_drivers=p.can("drivers.read"))


# ------------------------------------------------------------------ ownership and seats on a unit
@equipment_router.post("/equipment/ownership-transfers", response_model=list[s.OwnershipOut], status_code=201,
                       summary="Change who owns a truck or trailer from a date; the shares must add up to 100%")
def transfer(body: s.TransferIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    unit = service.transfer(db, p, body)
    db.commit()
    return ownership_history(db, vehicle_id=unit.id if body.vehicle_id else None,
                             trailer_id=unit.id if body.trailer_id else None)


def ownership_history(db: Session, *, vehicle_id=None, trailer_id=None, owner_id=None) -> list[s.OwnershipOut]:
    stmt = select(EquipmentOwnership, OwnerAgreement.kind).outerjoin(
        OwnerAgreement, OwnerAgreement.id == EquipmentOwnership.agreement_id)
    if vehicle_id:
        stmt = stmt.where(EquipmentOwnership.vehicle_id == vehicle_id)
    if trailer_id:
        stmt = stmt.where(EquipmentOwnership.trailer_id == trailer_id)
    if owner_id:
        stmt = stmt.where(EquipmentOwnership.owner_id == owner_id)
    rows = list(db.execute(stmt.order_by(EquipmentOwnership.effective_from.desc(), EquipmentOwnership.share_pct.desc())).tuples())
    owners = {o.id: o for o in db.scalars(select(Owner).where(Owner.id.in_([r.owner_id for r, _ in rows if r.owner_id])))}
    person_ids = [o.person_id for o in owners.values() if o.person_id]
    persons = {x.id: x for x in db.scalars(select(Person).where(Person.id.in_(person_ids)))}
    return [s.OwnershipOut.model_validate(r).model_copy(update={
        "owner_name": service.name_of(owners[r.owner_id], persons.get(owners[r.owner_id].person_id)) if r.owner_id else None,
        "agreement_kind": kind}) for r, kind in rows]


@equipment_router.get("/equipment/ownerships", response_model=list[s.OwnershipOut],
                      summary="Ownership history of a truck or trailer, or of an owner")
def list_ownerships(vehicle_id: uuid.UUID | None = None, trailer_id: uuid.UUID | None = None,
                    owner_id: uuid.UUID | None = None, p: Principal = Depends(require("equipment.read")),
                    db: Session = Depends(get_db)):
    if not (vehicle_id or trailer_id or owner_id):
        raise Invalid("Pass vehicle_id, trailer_id or owner_id", field="vehicle_id")
    return ownership_history(db, vehicle_id=vehicle_id, trailer_id=trailer_id, owner_id=owner_id)


def seat_history(db: Session, vehicle_id: uuid.UUID, today: date | None = None) -> list[s.SeatOut]:
    rows = list(db.scalars(select(UnitAssignment).where(UnitAssignment.vehicle_id == vehicle_id)
                           .order_by(UnitAssignment.effective_from.desc())))
    ids = {x for r in rows for x in (r.driver_id, r.co_driver_id) if x}
    drivers = {d.id: d for d in db.scalars(select(Driver).where(Driver.id.in_(ids)))}
    # A driver who is the person owning the truck at the time drives their own truck.
    owned = list(db.execute(select(EquipmentOwnership.effective_from, EquipmentOwnership.effective_to, Owner.person_id)
                            .join(Owner, Owner.id == EquipmentOwnership.owner_id)
                            .where(EquipmentOwnership.vehicle_id == vehicle_id)).tuples())

    def owner_person(day: date) -> uuid.UUID | None:
        return next((person for start, end, person in owned if start <= day and (end is None or end >= day) and person), None)

    out = []
    for r in rows:
        person = owner_person(r.effective_to or today or r.effective_from)
        out.append(s.SeatOut(id=r.id, vehicle_id=r.vehicle_id, driver=service._driver_ref(drivers[r.driver_id], person),
                             co_driver=service._driver_ref(drivers.get(r.co_driver_id), person) if r.co_driver_id else None,
                             team_split=r.team_split, effective_from=r.effective_from, effective_to=r.effective_to,
                             reason=r.reason, created_at=r.created_at))
    return out


@equipment_router.get("/vehicles/{vehicle_id}/seats", response_model=list[s.SeatOut],
                      summary="Who has driven a truck: the current seat assignment first")
def get_seats(vehicle_id: uuid.UUID, p: Principal = Depends(require("equipment.read")), db: Session = Depends(get_db)):
    get_or_404(db, Vehicle, vehicle_id, "Truck")
    return seat_history(db, vehicle_id, p.today())


def _unit_week(db: Session, p: Principal, kind: str, unit_id: uuid.UUID, lo: date, hi: date) -> s.UnitWeekOut:
    if hi < lo:
        raise Invalid("The period ends before it starts", field="date_to")
    if (hi - lo).days > 92:
        raise Invalid("Pick a period of at most three months", field="date_from")
    w = activity.unit_week(db, p, kind, unit_id, lo, hi)
    owners = p.can("owners.read")
    return s.UnitWeekOut(
        date_from=lo, date_to=hi, loads=w.loads, miles=w.miles, revenue=w.revenue,
        carrier_share=w.carrier_share if owners else w.revenue,
        owner_gross=w.owner_gross if owners else None, owner_costs=w.owner_costs if owners else None,
        net=w.net if owners else None, owners=w.owner_names if owners else [],
        driver_pay=w.driver_pay if p.can("settlements.read") else None,
        driver_pay_by=w.driver_pay_by if owners else None)


@equipment_router.get("/vehicles/{vehicle_id}/money", response_model=s.UnitWeekOut,
                      summary="A truck's money for a period: load revenue, the carrier's and owner's shares, driver pay")
def vehicle_money(vehicle_id: uuid.UUID, date_from: date, date_to: date,
                  p: Principal = Depends(require("loads.rates.read")), db: Session = Depends(get_db)):
    get_or_404(db, Vehicle, vehicle_id, "Truck")
    return _unit_week(db, p, "vehicle", vehicle_id, date_from, date_to)


@equipment_router.get("/trailers/{trailer_id}/money", response_model=s.UnitWeekOut,
                      summary="A trailer's money for a period: revenue on its loads, rental to its owner")
def trailer_money(trailer_id: uuid.UUID, date_from: date, date_to: date,
                  p: Principal = Depends(require("loads.rates.read")), db: Session = Depends(get_db)):
    get_or_404(db, Trailer, trailer_id, "Trailer")
    return _unit_week(db, p, "trailer", trailer_id, date_from, date_to)


@equipment_router.put("/vehicles/{vehicle_id}/seat", response_model=list[s.SeatOut],
                      summary="Set who drives a truck: a primary driver and, for a team, a co-driver and the split")
def set_seat(vehicle_id: uuid.UUID, body: s.SeatIn, p: Principal = Depends(require("dispatch.assign")),
             db: Session = Depends(get_db)):
    vehicle = db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id).with_for_update())
    if vehicle is None:
        raise Invalid("Truck not found", field="vehicle_id")
    service.seat(db, p, vehicle, body, p.today())
    audit(db, p, "vehicle.seat_assigned", "vehicle", vehicle.id, body.model_dump(mode="json"))
    db.commit()
    return seat_history(db, vehicle_id, p.today())


@equipment_router.delete("/vehicles/{vehicle_id}/seat", status_code=204, summary="Nobody drives this truck from today")
def clear_seat(vehicle_id: uuid.UUID, p: Principal = Depends(require("dispatch.assign")), db: Session = Depends(get_db)):
    vehicle = db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id).with_for_update())
    if vehicle is None:
        raise Invalid("Truck not found", field="vehicle_id")
    service.unseat(db, vehicle, p.today())
    audit(db, p, "vehicle.seat_cleared", "vehicle", vehicle.id)
    db.commit()
