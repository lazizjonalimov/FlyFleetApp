"""What an owner's equipment earned and cost over a period, worked out from loads, expenses, work orders and
the agreements each unit runs under. Load revenue, the carrier's share, driver pay and the owner's settlement
are kept apart:

    load_revenue  = line haul + fuel surcharge + accessorials
    owner_gross   = owner_pct x line haul + fsc_pct x fuel surcharge (+ accessorials when passed through)
                    or, for a rental, per_mile x miles + per_trailer_week x trailer weeks
    carrier_share = load_revenue - owner_gross
    owner_net     = owner_gross - chargebacks (fuel when the owner pays it, driver pay the carrier ran for the
                    owner, insurance, ELD, plates, repairs under the agreement) - escrow deposits

Figures here are worked out live for screens; the settlement is what is paid, and it locks when approved.
"""
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import Principal
from app.core.money import money
from app.modules.customers.models import Customer
from app.modules.dispatch.models import DispatchAssignment
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.expenses.models import Expense
from app.modules.loads.models import Load, LoadCharge, LoadStop
from app.modules.maintenance.models import WorkOrder
from app.modules.owners.models import EquipmentOwnership, Owner, OwnerAgreement

ZERO = Decimal("0")
HUNDRED = Decimal("100")
LIVE = ("assigned", "dispatched", "at_pickup", "in_transit", "at_delivery")
DONE = ("delivered", "pod_review", "completed")


@dataclass
class Window:
    """An ownership row as a date range with its terms."""
    unit_id: uuid.UUID
    kind: str  # truck | trailer
    start: date
    end: date | None
    share: Decimal
    agreement: OwnerAgreement

    def covers(self, day: date) -> bool:
        return self.start <= day and (self.end is None or day <= self.end)

    def overlap_days(self, lo: date, hi: date) -> int:
        a, b = max(lo, self.start), min(hi, self.end or hi)
        return max((b - a).days + 1, 0)


@dataclass
class LoadSplit:
    load_id: uuid.UUID
    load_number: str
    status: str
    unit_id: uuid.UUID
    unit_number: str
    driver_id: uuid.UUID | None
    driver_name: str | None
    customer_name: str | None
    origin: str | None
    destination: str | None
    pickup_at: datetime | None
    delivered_at: datetime | None
    day: date
    miles: int
    revenue: Decimal
    line_haul: Decimal
    fuel_surcharge: Decimal
    accessorials: Decimal
    owner_gross: Decimal
    carrier_share: Decimal
    driver_pay: Decimal
    agreement_kind: str
    on_time: bool | None


@dataclass
class Item:
    """One charge (or rental earning) and what it came from."""
    kind: str
    unit_id: uuid.UUID | None
    amount: Decimal
    description: str = ""
    detail: str = ""
    quantity: Decimal = Decimal("1")
    rate: Decimal | None = None
    load_id: uuid.UUID | None = None
    expense_id: uuid.UUID | None = None
    work_order_id: uuid.UUID | None = None
    driver_id: uuid.UUID | None = None


@dataclass
class Period:
    loads: list[LoadSplit] = field(default_factory=list)
    costs: dict[str, Decimal] = field(default_factory=lambda: defaultdict(lambda: ZERO))
    rental_gross: Decimal = ZERO
    unit_costs: dict[uuid.UUID, Decimal] = field(default_factory=lambda: defaultdict(lambda: ZERO))
    unit_kinds: dict[tuple[uuid.UUID, str], Decimal] = field(default_factory=lambda: defaultdict(lambda: ZERO))
    unit_rental: dict[uuid.UUID, Decimal] = field(default_factory=lambda: defaultdict(lambda: ZERO))
    # Every charge and rental amount with what it came from, for settlement lines.
    items: list[Item] = field(default_factory=list)

    def charge(self, unit: uuid.UUID | None, kind: str, amount: Decimal, **info) -> None:
        self.costs[kind] += amount
        if unit is not None:
            self.unit_costs[unit] += amount
            self.unit_kinds[(unit, kind)] += amount
        self.items.append(Item(kind=kind, unit_id=unit, amount=amount, **info))

    @property
    def revenue(self) -> Decimal:
        return sum((x.revenue for x in self.loads if x.status not in ("cancelled",)), ZERO)

    @property
    def owner_gross(self) -> Decimal:
        return sum((x.owner_gross for x in self.loads), ZERO) + self.rental_gross

    @property
    def carrier_share(self) -> Decimal:
        return self.revenue - sum((x.owner_gross for x in self.loads), ZERO)

    @property
    def owner_costs(self) -> Decimal:
        return sum(self.costs.values(), ZERO)

    @property
    def net(self) -> Decimal:
        return self.owner_gross - self.owner_costs


def windows(db: Session, owner_id: uuid.UUID, lo: date, hi: date, unit_id: uuid.UUID | None = None) -> list[Window]:
    stmt = (select(EquipmentOwnership, OwnerAgreement)
            .join(OwnerAgreement, OwnerAgreement.id == EquipmentOwnership.agreement_id)
            .where(EquipmentOwnership.owner_id == owner_id, EquipmentOwnership.effective_from <= hi,
                   or_(EquipmentOwnership.effective_to.is_(None), EquipmentOwnership.effective_to >= lo)))
    if unit_id:
        stmt = stmt.where(or_(EquipmentOwnership.vehicle_id == unit_id, EquipmentOwnership.trailer_id == unit_id))
    return [Window(unit_id=r.vehicle_id or r.trailer_id, kind="truck" if r.vehicle_id else "trailer",
                   start=r.effective_from, end=r.effective_to, share=r.share_pct / HUNDRED, agreement=a)
            for r, a in db.execute(stmt).tuples()]


def _window_on(ws: list[Window], unit_id: uuid.UUID, day: date) -> Window | None:
    return next((w for w in ws if w.unit_id == unit_id and w.covers(day)), None)


def _local_day(at: datetime | None, tz: str) -> date | None:
    return at.astimezone(ZoneInfo(tz)).date() if at else None


def driver_pay(driver: Driver | None, miles: int, revenue: Decimal) -> Decimal:
    """What a driver earns on a load under their pay terms (the settlement is authoritative)."""
    if driver is None:
        return ZERO
    if driver.pay_type == "per_mile":
        return money(driver.pay_rate * miles)
    if driver.pay_type == "percent":
        return money(revenue * driver.pay_rate / HUNDRED)
    return money(driver.pay_rate)


def split(load: Load, fsc: Decimal, w: Window) -> tuple[Decimal, Decimal, Decimal, Decimal, Decimal]:
    """(revenue, line haul, fuel surcharge, accessorials, owner gross) for the owner's share of a load."""
    line_haul = money(load.customer_rate * w.share)
    fuel_surcharge = money(fsc * w.share)
    accessorials = money((load.charges_total - fsc) * w.share)
    revenue = line_haul + fuel_surcharge + accessorials
    a = w.agreement
    if load.status == "cancelled":
        return ZERO, ZERO, ZERO, ZERO, ZERO
    if a.kind == "rental":
        gross = money((a.per_mile or ZERO) * (load.miles or 0) * w.share) if w.kind == "truck" else ZERO
    else:
        gross = money(line_haul * (a.owner_pct or ZERO) / HUNDRED + fuel_surcharge * (a.fsc_pct or ZERO) / HUNDRED
                      + (accessorials if a.accessorials_to_owner else ZERO))
    return revenue, line_haul, fuel_surcharge, accessorials, gross


def period(db: Session, p: Principal, owner: Owner, lo: date, hi: date, unit_id: uuid.UUID | None = None,
           *, hide_customers: bool = False, ws: list[Window] | None = None) -> Period:
    ws = ws if ws is not None else windows(db, owner.id, lo, hi, unit_id)
    out = Period()
    if not ws:
        return out
    trucks = {w.unit_id for w in ws if w.kind == "truck"}
    trailers = {w.unit_id for w in ws if w.kind == "trailer"}
    units = {v.id: v.unit_number for v in db.scalars(select(Vehicle).where(Vehicle.id.in_(trucks)))}
    units |= {t.id: t.unit_number for t in db.scalars(select(Trailer).where(Trailer.id.in_(trailers)))}
    tz = p.timezone
    start = datetime.combine(lo, datetime.min.time(), ZoneInfo(tz))
    end = datetime.combine(hi + timedelta(days=1), datetime.min.time(), ZoneInfo(tz))

    # Loads on the owner's trucks: delivered in the period, or picked up in it and not delivered yet.
    rows = db.execute(
        select(Load, DispatchAssignment, Driver, Customer.name)
        .join(DispatchAssignment, (DispatchAssignment.load_id == Load.id)
              & DispatchAssignment.status.in_(("active", "completed")))
        .outerjoin(Driver, Driver.id == DispatchAssignment.driver_id)
        .outerjoin(Customer, Customer.id == Load.customer_id)
        .where(DispatchAssignment.vehicle_id.in_(trucks),
               or_((Load.delivered_at >= start) & (Load.delivered_at < end),
                   Load.delivered_at.is_(None) & (Load.pickup_at >= start) & (Load.pickup_at < end),
                   Load.delivered_at.is_(None) & Load.status.in_(LIVE) & (Load.pickup_at < end))))
    loads = list(rows.tuples())
    fsc = defaultdict(lambda: ZERO)
    if loads:
        for load_id, amount in db.execute(select(LoadCharge.load_id, func.sum(LoadCharge.amount))
                                          .where(LoadCharge.load_id.in_([x[0].id for x in loads]),
                                                 LoadCharge.type == "fuel_surcharge").group_by(LoadCharge.load_id)):
            fsc[load_id] = amount or ZERO
    due = {}
    if loads:
        last = (select(LoadStop.load_id, LoadStop.arrived_at, func.coalesce(LoadStop.appt_end, LoadStop.appt_start).label("due"))
                .distinct(LoadStop.load_id).where(LoadStop.load_id.in_([x[0].id for x in loads]))
                .order_by(LoadStop.load_id, LoadStop.seq.desc()))
        for r in db.execute(last):
            due[r.load_id] = (r.arrived_at, r.due)
    for load, assignment, driver, customer_name in loads:
        day = _local_day(load.delivered_at or load.pickup_at, tz) or lo
        w = _window_on(ws, assignment.vehicle_id, day)
        if w is None:
            continue
        revenue, line_haul, fuel_surcharge, accessorials, gross = split(load, fsc[load.id], w)
        pay = ZERO
        if driver is not None and driver.employer_owner_id == owner.id and driver.pay_by == "carrier_for_owner" \
                and load.status in DONE:
            pay = driver_pay(driver, load.miles or 0, load.customer_rate + load.charges_total)
        arrived, due_at = due.get(load.id, (None, None))
        on_time = (arrived <= due_at) if arrived and due_at and load.status in DONE else None
        out.loads.append(LoadSplit(
            load_id=load.id, load_number=load.load_number, status=load.status, unit_id=assignment.vehicle_id,
            unit_number=units.get(assignment.vehicle_id, ""), driver_id=driver.id if driver else None,
            driver_name=f"{driver.first_name} {driver.last_name}" if driver else None,
            customer_name=None if hide_customers else customer_name,
            origin=", ".join(x for x in (load.origin_city, load.origin_state) if x) or None,
            destination=", ".join(x for x in (load.destination_city, load.destination_state) if x) or None,
            pickup_at=load.pickup_at, delivered_at=load.delivered_at, day=day, miles=load.miles or 0,
            revenue=revenue, line_haul=line_haul, fuel_surcharge=fuel_surcharge, accessorials=accessorials,
            owner_gross=gross, carrier_share=revenue - gross, driver_pay=pay, agreement_kind=w.agreement.kind,
            on_time=on_time))
        if pay:
            out.charge(assignment.vehicle_id, "driver_pay", pay,
                       description=f"Driver pay · {driver.first_name} {driver.last_name}", detail=load.load_number,
                       quantity=Decimal(load.miles or 1), rate=driver.pay_rate, load_id=load.id,
                       driver_id=driver.id)
    out.loads.sort(key=lambda x: (x.day, x.load_number), reverse=True)

    # Expenses on the owner's units: who pays follows the agreement in force that day.
    for e in db.scalars(select(Expense).where(
            or_(Expense.vehicle_id.in_(trucks), Expense.trailer_id.in_(trailers)),
            Expense.incurred_on >= lo, Expense.incurred_on <= hi)):
        unit = e.vehicle_id or e.trailer_id
        w = _window_on(ws, unit, e.incurred_on)
        if w is None or expense_payer(e, w.agreement) != "owner":
            continue
        key = "fuel" if e.category == "fuel" else ("repairs" if e.category in ("repairs", "tires") else "other")
        label = {"fuel": "Fuel", "repairs": "Repair", "other": e.category.replace("_", " ").capitalize()}[key]
        out.charge(unit, key, money(e.amount * w.share), description=f"{label}{f' · {e.vendor}' if e.vendor else ''}",
                   detail=" · ".join(x for x in (f"{e.incurred_on:%b} {e.incurred_on.day}", e.jurisdiction or "",
                                                f"{e.gallons:.1f} gal" if e.gallons else "") if x),
                   expense_id=e.id)

    # Repairs on work orders completed in the period, when the agreement says the owner pays for maintenance.
    for wo in db.scalars(select(WorkOrder).where(
            or_(WorkOrder.vehicle_id.in_(trucks), WorkOrder.trailer_id.in_(trailers)),
            WorkOrder.status == "completed", WorkOrder.completed_at >= start, WorkOrder.completed_at < end)):
        unit = wo.vehicle_id or wo.trailer_id
        w = _window_on(ws, unit, _local_day(wo.completed_at, tz) or lo)
        if w is None or w.agreement.maintenance_paid_by != "owner" or not wo.total_cost:
            continue
        out.charge(unit, "repairs", money(wo.total_cost * w.share), description=f"Repair · {wo.title}",
                   detail=f"Work order {wo.number}", work_order_id=wo.id)

    # Fixed weekly chargebacks and rental terms, by the days each unit was the owner's in the period.
    for w in ws:
        days = w.overlap_days(lo, hi)
        if not days:
            continue
        weeks = Decimal(days) / Decimal(7)
        a = w.agreement
        for key, weekly in (("insurance", a.insurance_weekly), ("occupational", a.occupational_weekly),
                            ("eld", a.eld_weekly), ("plates", a.plates_weekly)):
            if weekly:
                out.charge(w.unit_id, key, money(weekly * weeks * w.share), description=CHARGE_LABELS[key],
                           detail="Weekly, under the agreement", quantity=weeks.quantize(Decimal("0.01")), rate=weekly)
        if a.kind == "rental" and w.kind == "trailer" and a.per_trailer_week:
            rent = money(a.per_trailer_week * weeks * w.share)
            out.rental_gross += rent
            out.unit_rental[w.unit_id] += rent
            out.items.append(Item(kind="rental_week", unit_id=w.unit_id, amount=rent, description="Trailer rental",
                                  detail="By the trailer week", quantity=weeks.quantize(Decimal("0.01")),
                                  rate=a.per_trailer_week))
    # Escrow: a weekly deposit per truck until the target is reached.
    if owner.escrow_weekly:
        truck_weeks = sum((Decimal(w.overlap_days(lo, hi)) / Decimal(7) for w in ws if w.kind == "truck"), ZERO)
        deposit = money(owner.escrow_weekly * truck_weeks)
        from app.modules.owners.service import escrow_balance
        room = max(owner.escrow_target - escrow_balance(db, owner), ZERO) if owner.escrow_target else deposit
        if min(deposit, room):
            out.charge(None, "escrow", min(deposit, room), description="Escrow deposit",
                       detail="Held for the owner · interest paid quarterly")
    return out


CHARGE_LABELS = {"insurance": "Physical damage insurance", "occupational": "Occupational accident insurance",
                 "eld": "ELD and telematics", "plates": "IRP plates and permits"}


def expense_payer(e: Expense, a: OwnerAgreement) -> str:
    """Who pays for an expense on an owner's unit under its agreement: 'owner' (deducted on their settlement)
    or 'carrier'."""
    if e.category == "fuel":
        return a.fuel_paid_by
    if e.category in ("repairs", "tires"):
        return a.maintenance_paid_by
    if e.category in ("tolls", "scales", "permits", "parking"):
        return "owner" if a.kind == "owner_operator_lease" else "carrier"
    return "carrier"


def month_starts(hi: date, n: int = 6) -> list[date]:
    first = hi.replace(day=1)
    out = []
    for _ in range(n):
        out.append(first)
        first = (first - timedelta(days=1)).replace(day=1)
    return list(reversed(out))


def on_time_weeks(splits: list[LoadSplit], hi: date, n: int = 8) -> list[dict]:
    monday = hi - timedelta(days=hi.weekday())
    weeks = [monday - timedelta(weeks=i) for i in range(n - 1, -1, -1)]
    out = []
    for start in weeks:
        judged = [x for x in splits if x.on_time is not None and start <= x.day < start + timedelta(days=7)]
        out.append({"week_start": start, "on_time": sum(1 for x in judged if x.on_time),
                    "late": sum(1 for x in judged if not x.on_time), "judged": len(judged)})
    return out


@dataclass
class UnitWeek:
    """One truck's or trailer's money over a period, whoever owns it."""
    loads: int = 0
    miles: int = 0
    revenue: Decimal = ZERO
    owner_gross: Decimal | None = None
    owner_costs: Decimal | None = None
    driver_pay: Decimal = ZERO
    driver_pay_by: str | None = None
    owner_names: list[str] = field(default_factory=list)

    @property
    def carrier_share(self) -> Decimal:
        return self.revenue - (self.owner_gross or ZERO)

    @property
    def net(self) -> Decimal | None:
        return None if self.owner_gross is None else self.owner_gross - (self.owner_costs or ZERO)


def unit_week(db: Session, p: Principal, kind: str, unit_id: uuid.UUID, lo: date, hi: date) -> UnitWeek:
    """Load revenue on a unit in the period, what went to its owners under their agreements, the owners' costs
    on it, and the pay its drivers earned on the loads delivered (by their pay terms; the settlement is what is
    paid). A unit with no owner in the period is all the carrier's."""
    from app.modules.owners.service import name_of
    from app.modules.people.models import Person

    out = UnitWeek()
    tz = p.timezone
    start = datetime.combine(lo, datetime.min.time(), ZoneInfo(tz))
    end = datetime.combine(hi + timedelta(days=1), datetime.min.time(), ZoneInfo(tz))
    col = DispatchAssignment.vehicle_id if kind == "vehicle" else DispatchAssignment.trailer_id
    rows = db.execute(
        select(Load, Driver)
        .join(DispatchAssignment, (DispatchAssignment.load_id == Load.id)
              & DispatchAssignment.status.in_(("active", "completed")))
        .outerjoin(Driver, Driver.id == DispatchAssignment.driver_id)
        .where(col == unit_id, Load.status != "cancelled",
               or_((Load.delivered_at >= start) & (Load.delivered_at < end),
                   Load.delivered_at.is_(None) & (Load.pickup_at >= start) & (Load.pickup_at < end),
                   Load.delivered_at.is_(None) & Load.status.in_(LIVE) & (Load.pickup_at < end)))).tuples().all()
    for load, driver in rows:
        out.loads += 1
        out.miles += load.miles or 0
        out.revenue += load.customer_rate + load.charges_total
        if load.status in DONE:
            out.driver_pay += driver_pay(driver, load.miles or 0, load.customer_rate + load.charges_total)
    own = EquipmentOwnership.vehicle_id if kind == "vehicle" else EquipmentOwnership.trailer_id
    owner_ids = list(dict.fromkeys(db.scalars(
        select(EquipmentOwnership.owner_id).where(own == unit_id, EquipmentOwnership.owner_id.is_not(None),
                                                  EquipmentOwnership.effective_from <= hi,
                                                  or_(EquipmentOwnership.effective_to.is_(None),
                                                      EquipmentOwnership.effective_to >= lo))
        .order_by(EquipmentOwnership.effective_from.desc()))))
    if owner_ids:
        out.owner_gross, out.owner_costs = ZERO, ZERO
        owners = {o.id: o for o in db.scalars(select(Owner).where(Owner.id.in_(owner_ids)))}
        persons = {x.id: x for x in db.scalars(select(Person).where(Person.id.in_(
            [o.person_id for o in owners.values() if o.person_id])))}
        for owner_id in owner_ids:
            owner = owners[owner_id]
            out.owner_names.append(name_of(owner, persons.get(owner.person_id)))
            per = period(db, p, owner, lo, hi, unit_id)
            out.owner_gross += per.owner_gross
            out.owner_costs += per.owner_costs
        # Who pays the driver follows the agreement in force at the end of the period.
        latest = windows(db, owner_ids[0], lo, hi, unit_id)
        current = next((w for w in sorted(latest, key=lambda w: w.start, reverse=True)), None)
        out.driver_pay_by = current.agreement.driver_pay_by if current else "carrier"
    else:
        out.driver_pay_by = "carrier"
    out.driver_pay = money(out.driver_pay)
    return out
