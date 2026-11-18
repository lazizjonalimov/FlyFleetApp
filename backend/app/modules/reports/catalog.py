"""The rest of the report catalog: on-time delivery, loads by status, loads waiting for their proof of delivery,
equipment utilization, expiring documents, expenses by category and driver statements. Read-only, worked out when
asked for, each downloadable as the CSV of what it shows."""
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import Date, Float, and_, cast, func, literal, select, true
from sqlalchemy.orm import Session

from app.core import scope as team_scope
from app.core.deps import Principal, get_db, require
from app.core.errors import Forbidden
from app.core.money import ZERO, money
from app.modules.customers.models import Customer
from app.modules.dispatch.models import DispatchAssignment
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Vehicle
from app.modules.expenses.models import CATEGORIES, Expense
from app.modules.loads import service as loads
from app.modules.loads.models import STATUSES, Load, LoadStop
from app.modules.reports.router import Format, Report, ReportColumn, _deliver, _range
from app.modules.safety.matrix import company_files
from app.modules.safety.router import items as compliance_items
from app.modules.safety.router import scoped
from app.modules.safety.rules import ITEM_LABELS, ORGANIZATION_ITEMS
from app.modules.safety.settings import checklist_of
from app.modules.settlements.models import DriverSettlement

router = APIRouter(tags=["reports"])

TARGET_PCT = 95
# An appointment with no window is met by arriving within 15 minutes of it.
GRACE = timedelta(minutes=15)
NOT_COUNTED = ("cancelled", "on_hold")
# Lanes with fewer deliveries than this say too little to be called the weakest.
LANE_MINIMUM = 3

STATUS_LABELS = {
    "draft": "Draft", "planned": "Planned", "assigned": "Assigned", "dispatched": "Dispatched",
    "at_pickup": "At pickup", "in_transit": "In transit", "at_delivery": "At delivery", "delivered": "Delivered",
    "pod_review": "POD in review", "completed": "Completed", "on_hold": "On hold", "cancelled": "Cancelled",
}
CATEGORY_LABELS = {"fuel": "Fuel", "tolls": "Tolls", "lumper": "Lumper", "scales": "Scales", "parking": "Parking",
                   "permits": "Permits", "repairs": "Repairs", "tires": "Tires", "insurance": "Insurance",
                   "lodging": "Lodging", "meals": "Meals", "advance": "Cash advance", "other": "Other"}
UNIT_KINDS = {"driver": "Driver", "vehicle": "Truck", "trailer": "Trailer", "organization": "Company"}


def _one(value: Decimal | float) -> Decimal:
    """To one decimal place, halves rounded up, as a share is read."""
    return Decimal(value).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def _pct(part: int, whole: int) -> Decimal | None:
    return _one(Decimal(100 * part) / Decimal(whole)) if whole else None


# ---------------------------------------------------------------- on-time delivery
class OnTimeWeek(BaseModel):
    week_start: date = Field(description="The Monday the week starts on, in the company's time zone")
    deliveries: int
    on_time: int
    pct: Decimal | None


class OnTimeCustomer(BaseModel):
    customer_id: uuid.UUID
    name: str
    deliveries: int
    on_time: int
    late: int
    pct: Decimal
    avg_late_minutes: int | None


class OnTimeLane(BaseModel):
    origin: str
    destination: str
    deliveries: int
    pct: Decimal


class OnTimeReport(BaseModel):
    """Delivery stops judged against their appointment, by week and by customer."""
    date_from: date
    date_to: date
    weeks: int
    timezone: str
    target_pct: int
    deliveries: int
    on_time: int
    late: int
    pct: Decimal | None
    previous_pct: Decimal | None = Field(description="The same number of weeks just before")
    previous_deliveries: int
    avg_late_minutes: int | None
    median_late_minutes: int | None
    weakest_lane: OnTimeLane | None = Field(description=f"The lane with the lowest share on time, of those with "
                                                        f"{LANE_MINIMUM} or more deliveries")
    by_week: list[OnTimeWeek]
    by_customer: list[OnTimeCustomer]


def _judged(p: Principal, lo: datetime, hi: datetime, customer_id: uuid.UUID | None):
    """Each delivery stop reached in the period that had an appointment: whether it was on time, how late if not."""
    due = func.coalesce(LoadStop.appt_end, LoadStop.appt_start + GRACE)
    on_time = LoadStop.arrived_at <= due
    stmt = (select(
        cast(func.date_trunc("week", func.timezone(p.timezone, LoadStop.arrived_at)), Date).label("week"),
        Load.customer_id.label("customer_id"), Customer.name.label("customer"),
        Load.origin_city.label("origin_city"), Load.origin_state.label("origin_state"),
        Load.destination_city.label("destination_city"), Load.destination_state.label("destination_state"),
        on_time.label("on_time"),
        (func.extract("epoch", LoadStop.arrived_at - due) / 60).label("late_minutes"))
        .select_from(LoadStop).join(Load, Load.id == LoadStop.load_id).join(Customer, Customer.id == Load.customer_id)
        .where(LoadStop.type == "delivery", LoadStop.appt_start.is_not(None), LoadStop.arrived_at >= lo,
               LoadStop.arrived_at < hi, Load.status.not_in(NOT_COUNTED)))
    if customer_id:
        stmt = stmt.where(Load.customer_id == customer_id)
    return team_scope.where(stmt, team_scope.loads(p.scope)).subquery("judged")


def _totals(db: Session, t) -> tuple[int, int, float | None, float | None]:
    late = ~t.c.on_time
    row = db.execute(select(
        func.count(), func.count().filter(t.c.on_time), func.avg(t.c.late_minutes).filter(late),
        func.percentile_cont(0.5).within_group(cast(t.c.late_minutes, Float)).filter(late)).select_from(t)).one()
    return row[0], row[1], row[2], row[3]


@router.get("/reports/on-time", response_model=OnTimeReport)
def on_time_report(weeks: int = Query(default=8, ge=1, le=52), customer_id: uuid.UUID | None = None,
                   format: Format = "json", p: Principal = Depends(require("reports.read")),
                   db: Session = Depends(get_db)):
    """On-time delivery: the share of delivery stops reached by the end of their appointment window (or within 15
    minutes of a fixed appointment), week by week, with the customers and the lane that fare worst."""
    today = p.today()
    start = today - timedelta(days=today.weekday()) - timedelta(weeks=weeks - 1)
    t = _judged(p, *loads.day_bounds(p.timezone, start, today), customer_id)
    deliveries, on_time, avg_late, median_late = _totals(db, t)
    before = _judged(p, *loads.day_bounds(p.timezone, start - timedelta(weeks=weeks), start - timedelta(days=1)),
                     customer_id)
    previous, previous_on_time, _, _ = _totals(db, before)

    counted = {row.week: row for row in db.execute(
        select(t.c.week, func.count().label("n"), func.count().filter(t.c.on_time).label("ok"))
        .group_by(t.c.week))}
    by_week = []
    for i in range(weeks):
        week = start + timedelta(weeks=i)
        row = counted.get(week)
        by_week.append(OnTimeWeek(week_start=week, deliveries=row.n if row else 0, on_time=row.ok if row else 0,
                                  pct=_pct(row.ok, row.n) if row else None))

    late = ~t.c.on_time
    share = func.count().filter(t.c.on_time) * 1.0 / func.count()
    by_customer = [OnTimeCustomer(
        customer_id=r.customer_id, name=r.customer, deliveries=r.n, on_time=r.ok, late=r.n - r.ok,
        pct=_pct(r.ok, r.n), avg_late_minutes=round(r.avg_late) if r.avg_late is not None else None)
        for r in db.execute(
            select(t.c.customer_id, t.c.customer, func.count().label("n"), func.count().filter(t.c.on_time).label("ok"),
                   func.avg(t.c.late_minutes).filter(late).label("avg_late"))
            .group_by(t.c.customer_id, t.c.customer).order_by(share, func.count().desc(), t.c.customer))]

    lane = db.execute(
        select(t.c.origin_city, t.c.origin_state, t.c.destination_city, t.c.destination_state,
               func.count().label("n"), func.count().filter(t.c.on_time).label("ok"))
        .group_by(t.c.origin_city, t.c.origin_state, t.c.destination_city, t.c.destination_state)
        .having(func.count() >= LANE_MINIMUM).order_by(share, func.count().desc()).limit(1)).first()
    place = lambda city, state: ", ".join(x for x in (city, state) if x) or "Unknown"   # noqa: E731
    weakest = OnTimeLane(origin=place(lane.origin_city, lane.origin_state),
                         destination=place(lane.destination_city, lane.destination_state),
                         deliveries=lane.n, pct=_pct(lane.ok, lane.n)) if lane else None

    report = OnTimeReport(
        date_from=start, date_to=today, weeks=weeks, timezone=p.timezone, target_pct=TARGET_PCT,
        deliveries=deliveries, on_time=on_time, late=deliveries - on_time, pct=_pct(on_time, deliveries),
        previous_pct=_pct(previous_on_time, previous), previous_deliveries=previous,
        avg_late_minutes=round(avg_late) if avg_late is not None else None,
        median_late_minutes=round(median_late) if median_late is not None else None,
        weakest_lane=weakest, by_week=by_week, by_customer=by_customer)
    if format == "json":
        return report
    return _deliver(db, p, Report(
        name="on-time-delivery", title="On-time delivery by customer", date_from=start, date_to=today,
        currency=p.currency,
        columns=[ReportColumn(key="label", label="Customer"),
                 ReportColumn(key="deliveries", label="Deliveries", kind="number"),
                 ReportColumn(key="on_time", label="On time", kind="number"),
                 ReportColumn(key="late", label="Late", kind="number"),
                 ReportColumn(key="pct", label="On-time %", kind="percent"),
                 ReportColumn(key="avg_late", label="Average lateness (min)", kind="number")],
        rows=[{"label": c.name, "deliveries": c.deliveries, "on_time": c.on_time, "late": c.late, "pct": c.pct,
               "avg_late": c.avg_late_minutes} for c in by_customer],
        totals={"label": "Total", "deliveries": deliveries, "on_time": on_time, "late": deliveries - on_time,
                "pct": report.pct, "avg_late": report.avg_late_minutes}), format)


# ---------------------------------------------------------------- operational tables
@router.get("/reports/loads-by-status", response_model=Report)
def loads_by_status(date_from: date | None = None, date_to: date | None = None, format: Format = "json",
                    p: Principal = Depends(require("reports.read")), db: Session = Depends(get_db)):
    """Where the loads picking up in the period stand now."""
    start, end = _range(p, date_from, date_to)
    lo, hi = loads.day_bounds(p.timezone, start, end)
    when = func.coalesce(Load.pickup_at, Load.created_at)
    rates = p.can("loads.rates.read")
    stmt = (select(Load.status, func.count().label("n"), func.coalesce(func.sum(Load.miles), 0).label("miles"),
                   func.coalesce(func.sum(Load.customer_rate + Load.charges_total), 0).label("revenue"))
            .where(when >= lo, when < hi).group_by(Load.status))
    found = {r.status: r for r in db.execute(team_scope.where(stmt, team_scope.loads(p.scope)))}
    total = sum(r.n for r in found.values())
    rows = []
    for status in STATUSES:
        if status in found:
            r = found[status]
            row = {"label": STATUS_LABELS[status], "loads": r.n, "share": _pct(r.n, total), "miles": int(r.miles)}
            rows.append(row | ({"revenue": money(r.revenue)} if rates else {}))
    columns = [ReportColumn(key="label", label="Status"), ReportColumn(key="loads", label="Loads", kind="number"),
               ReportColumn(key="share", label="Share", kind="percent"),
               ReportColumn(key="miles", label="Miles", kind="number")]
    totals = {"label": "Total", "loads": total, "share": _pct(total, total), "miles": sum(r["miles"] for r in rows)}
    if rates:
        columns.append(ReportColumn(key="revenue", label="Revenue", kind="money"))
        totals["revenue"] = sum((r["revenue"] for r in rows), ZERO)
    return _deliver(db, p, Report(name="loads-by-status", title="Loads by status", date_from=start, date_to=end,
                                  currency=p.currency, columns=columns, rows=rows, totals=totals), format)


def _driver_on(load_id):
    driver = func.concat(Driver.first_name, literal(" "), Driver.last_name)
    return (select(driver).select_from(DispatchAssignment).join(Driver, Driver.id == DispatchAssignment.driver_id)
            .where(DispatchAssignment.load_id == load_id, DispatchAssignment.status.in_(("active", "completed")))
            .order_by(DispatchAssignment.created_at.desc()).limit(1).correlate(Load).scalar_subquery())


@router.get("/reports/awaiting-pod", response_model=Report)
def awaiting_pod(format: Format = "json", p: Principal = Depends(require("reports.read")),
                 db: Session = Depends(get_db)):
    """Loads delivered whose proof of delivery hasn't been approved: they can't be invoiced until it is."""
    today = p.today()
    rates = p.can("loads.rates.read")
    delivered_on = func.date(func.timezone(p.timezone, Load.delivered_at))
    stmt = (select(Load.load_number, Customer.name.label("customer"), _driver_on(Load.id).label("driver"),
                   delivered_on.label("delivered_on"), Load.status, (Load.customer_rate + Load.charges_total)
                   .label("revenue"))
            .join(Customer, Customer.id == Load.customer_id)
            .where(Load.status.in_(("delivered", "pod_review")))
            .order_by(Load.delivered_at.nulls_last(), Load.load_number))
    rows = []
    for r in db.execute(team_scope.where(stmt, team_scope.loads(p.scope))):
        row = {"label": r.load_number, "customer": r.customer, "driver": r.driver or "", "delivered": r.delivered_on,
               "waiting": (today - r.delivered_on).days if r.delivered_on else None,
               "pod": "In review" if r.status == "pod_review" else "Not received"}
        rows.append(row | ({"revenue": money(r.revenue)} if rates else {}))
    columns = [ReportColumn(key="label", label="Load"), ReportColumn(key="customer", label="Customer"),
               ReportColumn(key="driver", label="Driver"), ReportColumn(key="delivered", label="Delivered", kind="date"),
               ReportColumn(key="waiting", label="Days waiting", kind="number"),
               ReportColumn(key="pod", label="Proof of delivery")]
    totals = {"label": "Total", "customer": f"{len(rows)} loads"}
    if rates:
        columns.append(ReportColumn(key="revenue", label="Revenue", kind="money"))
        totals["revenue"] = sum((r["revenue"] for r in rows), ZERO)
    return _deliver(db, p, Report(name="awaiting-pod", title="Delivered, awaiting POD", date_from=None, date_to=today,
                                  currency=p.currency, columns=columns, rows=rows, totals=totals), format)


@router.get("/reports/utilization", response_model=Report)
def utilization(date_from: date | None = None, date_to: date | None = None, format: Format = "json",
                p: Principal = Depends(require("reports.read")), db: Session = Depends(get_db)):
    """How much of the period each truck spent on a load: from arriving at the first pickup to delivering."""
    start, end = _range(p, date_from, date_to)
    lo, hi = loads.day_bounds(p.timezone, start, end)
    now = datetime.now(UTC)
    until = min(hi, now)
    first_arrival = (select(func.min(LoadStop.arrived_at)).where(LoadStop.load_id == Load.id)
                     .correlate(Load).scalar_subquery())
    began = func.coalesce(first_arrival, Load.pickup_at)
    ended = func.coalesce(Load.delivered_at, literal(now))
    overlap = func.greatest(0, func.extract("epoch", func.least(ended, literal(until)) - func.greatest(began, literal(lo))))
    rolling = ("at_pickup", "in_transit", "at_delivery", "delivered", "pod_review", "completed")
    delivered_here = and_(Load.status.in_(("delivered", "pod_review", "completed")), Load.delivered_at >= lo,
                          Load.delivered_at < hi)
    work = (select(DispatchAssignment.vehicle_id.label("vehicle_id"), overlap.label("seconds"),
                   delivered_here.label("delivered"), Load.miles.label("miles"))
            .select_from(DispatchAssignment).join(Load, Load.id == DispatchAssignment.load_id)
            .where(DispatchAssignment.status.in_(("active", "completed")), Load.status.in_(rolling),
                   began < literal(until), ended > literal(lo)).subquery("work"))
    stmt = (select(Vehicle.unit_number, func.coalesce(func.sum(work.c.seconds), 0).label("seconds"),
                   func.count().filter(work.c.delivered).label("loads"),
                   func.coalesce(func.sum(work.c.miles).filter(work.c.delivered), 0).label("miles"))
            .select_from(Vehicle).outerjoin(work, work.c.vehicle_id == Vehicle.id)
            .where(Vehicle.status != "retired").group_by(Vehicle.id, Vehicle.unit_number))
    stmt = team_scope.where(stmt, team_scope.vehicles(p.scope, Vehicle.id))
    span = max((until - lo).total_seconds(), 1)
    rows = sorted(({"label": r.unit_number, "loads": r.loads, "miles": int(r.miles),
                    "days": _one(float(r.seconds) / 86400),
                    "utilization": min(Decimal(100), _one(100 * float(r.seconds) / span))}
                   for r in db.execute(stmt)), key=lambda r: (-r["utilization"], r["label"]))
    fleet = sum((r["utilization"] for r in rows), Decimal(0)) / len(rows) if rows else None
    return _deliver(db, p, Report(
        name="equipment-utilization", title="Equipment utilization", date_from=start, date_to=end, currency=p.currency,
        columns=[ReportColumn(key="label", label="Truck"), ReportColumn(key="loads", label="Loads delivered", kind="number"),
                 ReportColumn(key="miles", label="Miles", kind="number"),
                 ReportColumn(key="days", label="Days on a load", kind="number"),
                 ReportColumn(key="utilization", label="Utilization", kind="percent")],
        rows=rows, totals={"label": "Fleet", "loads": sum(r["loads"] for r in rows), "miles": sum(r["miles"] for r in rows),
                           "days": sum((r["days"] for r in rows), Decimal(0)),
                           "utilization": _one(fleet) if fleet is not None else None}), format)


@router.get("/reports/expiring", response_model=Report)
def expiring(days: int = Query(default=60, ge=1, le=365), format: Format = "json",
             p: Principal = Depends(require("reports.read")), db: Session = Depends(get_db)):
    """Licenses, medical cards, registrations, insurance and the company's own filings that have run out or run out
    within the next `days` days, soonest first."""
    today = p.today()
    horizon = today + timedelta(days=days)
    t = compliance_items(checklist_of(db))
    stmt = (select(t.c.entity_type, t.c.entity_label, t.c.item, t.c.expires_on)
            .where(t.c.expires_on.is_not(None), t.c.expires_on <= horizon,
                   scoped(t, p.scope) if p.scope is not None else true())
            .order_by(t.c.expires_on, t.c.entity_label))
    found = [(r.entity_type, r.entity_label, ITEM_LABELS.get(r.item, r.item), r.expires_on) for r in db.execute(stmt)]
    if p.scope is None:
        for item, doc in company_files(db).items():
            if item in ORGANIZATION_ITEMS and doc.expires_on and doc.expires_on <= horizon:
                found.append(("organization", "Company file", ORGANIZATION_ITEMS[item], doc.expires_on))
    found.sort(key=lambda x: (x[3], x[1]))
    rows = [{"label": label, "kind": UNIT_KINDS.get(kind, kind.title()), "item": item, "expires": on,
             "left": (on - today).days, "state": "Expired" if on < today else "Expiring"}
            for kind, label, item, on in found]
    return _deliver(db, p, Report(
        name="expiring-documents", title="Expiring documents", date_from=today, date_to=horizon, currency=p.currency,
        columns=[ReportColumn(key="label", label="Holder"), ReportColumn(key="kind", label="Kind"),
                 ReportColumn(key="item", label="Item"), ReportColumn(key="expires", label="Expires", kind="date"),
                 ReportColumn(key="left", label="Days left", kind="number"), ReportColumn(key="state", label="State")],
        rows=rows), format)


# ---------------------------------------------------------------- financial tables
@router.get("/reports/expenses", response_model=Report)
def expenses_by_category(date_from: date | None = None, date_to: date | None = None, format: Format = "json",
                         p: Principal = Depends(require("reports.read")), db: Session = Depends(get_db)):
    """What was spent in the period, by category."""
    if not p.can("expenses.read"):
        raise Forbidden("Your role does not allow seeing expenses")
    start, end = _range(p, date_from, date_to)
    found = {r.category: r for r in db.execute(
        select(Expense.category, func.count().label("n"), func.coalesce(func.sum(Expense.amount), 0).label("amount"))
        .where(Expense.incurred_on >= start, Expense.incurred_on <= end).group_by(Expense.category))}
    total = sum((Decimal(r.amount) for r in found.values()), ZERO)
    rows = sorted(({"label": CATEGORY_LABELS.get(c, c.title()), "count": found[c].n, "amount": money(found[c].amount),
                    "share": _one(Decimal(100) * Decimal(found[c].amount) / total) if total else None}
                   for c in CATEGORIES if c in found), key=lambda r: -r["amount"])
    return _deliver(db, p, Report(
        name="expenses-by-category", title="Expenses by category", date_from=start, date_to=end, currency=p.currency,
        columns=[ReportColumn(key="label", label="Category"), ReportColumn(key="count", label="Expenses", kind="number"),
                 ReportColumn(key="amount", label="Amount", kind="money"),
                 ReportColumn(key="share", label="Share", kind="percent")],
        rows=rows, totals={"label": "Total", "count": sum(r["count"] for r in rows), "amount": total,
                           "share": Decimal(100) if total else None}), format)


@router.get("/reports/driver-statements", response_model=Report)
def driver_statements(date_from: date | None = None, date_to: date | None = None, format: Format = "json",
                      p: Principal = Depends(require("reports.read")), db: Session = Depends(get_db)):
    """Each driver's statements for pay periods ending in the period: earned, reimbursed, deducted and paid."""
    if not p.can("settlements.read"):
        raise Forbidden("Your role does not allow seeing driver pay")
    start, end = _range(p, date_from, date_to)
    s = DriverSettlement
    name = func.concat(Driver.first_name, literal(" "), Driver.last_name)
    stmt = (select(name.label("label"), func.count().label("n"), func.sum(s.earnings).label("earnings"),
                   func.sum(s.reimbursements).label("reimbursements"), func.sum(s.deductions).label("deductions"),
                   func.sum(s.net_pay).label("net"),
                   func.coalesce(func.sum(s.net_pay).filter(s.status == "paid"), 0).label("paid"))
            .join(Driver, Driver.id == s.driver_id)
            .where(s.status != "void", s.period_end >= start, s.period_end <= end)
            .group_by(Driver.id, name).order_by(func.sum(s.net_pay).desc(), name))
    keys = ("earnings", "reimbursements", "deductions", "net", "paid")
    rows = [{"label": r.label, "statements": r.n, **{k: money(getattr(r, k)) for k in keys}} for r in db.execute(stmt)]
    return _deliver(db, p, Report(
        name="driver-statements", title="Driver statements", date_from=start, date_to=end, currency=p.currency,
        columns=[ReportColumn(key="label", label="Driver"),
                 ReportColumn(key="statements", label="Statements", kind="number"),
                 ReportColumn(key="earnings", label="Earnings", kind="money"),
                 ReportColumn(key="reimbursements", label="Reimbursements", kind="money"),
                 ReportColumn(key="deductions", label="Deductions", kind="money"),
                 ReportColumn(key="net", label="Net pay", kind="money"),
                 ReportColumn(key="paid", label="Paid", kind="money")],
        rows=rows, totals={"label": "Total", "statements": sum(r["statements"] for r in rows),
                           **{k: sum((r[k] for r in rows), ZERO) for k in keys}}), format)
