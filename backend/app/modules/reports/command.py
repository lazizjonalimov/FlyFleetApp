"""The dashboard's command center: the day at a glance, operations, money, the fleet and its drivers, and a calendar.

Each block here is the one source of its numbers: the dashboard's tabs and the reports behind them both read these
endpoints, so a figure never differs between the two. Every figure is worked out from the company's own records when
asked for; where a record a figure needs isn't kept (no fuel bought, no positions sent), the figure is left empty and
the screen says so, rather than guessed.
"""
import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import Date, and_, cast, func, or_, select
from sqlalchemy.orm import Session

from app.core import scope as team_scope
from app.core.deps import Principal, get_db, require
from app.core.errors import Forbidden, Invalid, NotFound
from app.core.money import ZERO, money
from app.modules.customers.models import Customer
from app.modules.dispatch.models import DispatchAssignment
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Vehicle
from app.modules.loads import service as loads
from app.modules.loads.models import Load, LoadStatusEvent, LoadStop
from app.modules.reports.catalog import TARGET_PCT, _judged, on_time_report
from app.modules.tracking.incidents import LABEL as INCIDENT_LABEL
from app.modules.tracking.models import Incident, VehiclePosition

router = APIRouter(tags=["dashboard"])
READ = require("dashboard.read", "reports.read")
DELIVERED = ("delivered", "pod_review", "completed")
SAFETY_KINDS = ("speeding", "yard_speed")
SEVERITY_POINTS = {"high": 5, "medium": 2, "low": 1}


def _rev():
    return Load.customer_rate + Load.charges_total


def _place(city: str | None, state: str | None) -> str:
    return ", ".join(x for x in (city, state) if x) or "Unknown"


def _pct(part: float, whole: float) -> int | None:
    return round(100 * part / whole) if whole else None


def _monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


# ---------------------------------------------------------------- the day at a glance
class Progress(BaseModel):
    done: float
    of: float | None
    pct: int | None
    text: str


class ScorePart(BaseModel):
    label: str
    value: int | None
    weight: int


class DayOut(BaseModel):
    today: date
    timezone: str
    summary: str
    unassigned: int
    late: int
    missing_pod: int
    delivered: Progress
    revenue: Progress | None = Field(description="Delivered revenue today against last month's daily average; "
                                                 "empty for roles that can't see rates")
    on_time: Progress
    score: int | None = Field(description="Operations score, 0-100; empty when nothing is on the road")
    score_parts: list[ScorePart]
    definition: str


def _count(db: Session, p: Principal, condition) -> int:
    stmt = team_scope.where(select(func.count()).select_from(Load).where(condition), team_scope.loads(p.scope))
    return db.scalar(stmt) or 0


def day(db: Session, p: Principal) -> DayOut:
    now = datetime.now(UTC)
    today = p.today()
    views = loads.view_conditions(p, now)
    lo, hi = loads.day_bounds(p.timezone, today)
    unassigned = _count(db, p, views["unassigned_soon"])
    late = _count(db, p, views["at_risk"])
    missing = _count(db, p, views["missing_pod"])
    due_today = _count(db, p, and_(Load.delivery_at >= lo, Load.delivery_at < hi, Load.status.not_in(("draft", "cancelled"))))
    done_today = _count(db, p, and_(Load.delivery_at >= lo, Load.delivery_at < hi, Load.status.in_(DELIVERED)))
    t = _judged(p, lo, hi, None)
    judged, on_time = db.execute(select(func.count(), func.count().filter(t.c.on_time)).select_from(t)).one()
    revenue = None
    if p.can("loads.rates.read"):
        got = db.scalar(team_scope.where(select(func.coalesce(func.sum(_rev()), 0)).where(
            Load.status.in_(DELIVERED), Load.delivered_at >= lo, Load.delivered_at < hi), team_scope.loads(p.scope)))
        last_end = today.replace(day=1) - timedelta(days=1)
        a, b = loads.day_bounds(p.timezone, last_end.replace(day=1), last_end)
        last = db.scalar(team_scope.where(select(func.coalesce(func.sum(_rev()), 0)).where(
            Load.status.in_(DELIVERED), Load.delivered_at >= a, Load.delivered_at < b), team_scope.loads(p.scope)))
        target = money(Decimal(last) / last_end.day) if last else None
        revenue = Progress(done=float(got), of=float(target) if target else None,
                           pct=_pct(float(got), float(target)) if target else None,
                           text="Last month's daily average" if target else "No revenue last month to compare with")
    active = _count(db, p, Load.status.in_(loads.ROLLING + ("planned", "assigned")))
    parts = [ScorePart(label="On time today", value=_pct(on_time, judged), weight=50),
             ScorePart(label="Not late or at risk", value=100 - (_pct(late, active) or 0) if active else None, weight=30),
             ScorePart(label="Covered within 24 h", value=100 - (_pct(unassigned, active) or 0) if active else None, weight=20)]
    known = [x for x in parts if x.value is not None]
    score = round(sum(x.value * x.weight for x in known) / sum(x.weight for x in known)) if known and active else None
    bits = [f"{done_today} of {due_today} deliveries done" if due_today else "No deliveries due today"]
    if late:
        bits.append(f"{late} late or at risk")
    if unassigned:
        bits.append(f"{unassigned} without a driver")
    return DayOut(
        today=today, timezone=p.timezone, summary=" · ".join(bits), unassigned=unassigned, late=late,
        missing_pod=missing,
        delivered=Progress(done=done_today, of=due_today, pct=_pct(done_today, due_today),
                           text=f"{done_today} of {due_today} delivered"),
        revenue=revenue,
        on_time=Progress(done=on_time, of=judged, pct=_pct(on_time, judged),
                         text=f"{on_time} of {judged} on time" if judged else "No deliveries reached yet"),
        score=score, score_parts=parts,
        definition="Operations score: half on-time delivery today, 30% loads not late or at risk, 20% loads with a "
                   "driver within 24 hours of pickup, out of the loads on the road or waiting to go.")


@router.get("/dashboard/day", response_model=DayOut)
def dashboard_day(p: Principal = Depends(require("dashboard.read")), db: Session = Depends(get_db)):
    if not p.can("loads.read"):
        raise Forbidden("Your role does not allow seeing loads")
    return day(db, p)


# ---------------------------------------------------------------- operations
class Tile(BaseModel):
    key: str
    label: str
    count: int
    sub: str
    tone: str
    params: dict[str, str | list[str]] = Field(description="The Loads list parameters that show these loads")


class Activity(BaseModel):
    at: datetime
    tone: str
    text: str
    load_id: uuid.UUID | None = None
    load_number: str | None = None


class OnTime(BaseModel):
    pct: float | None
    target_pct: int
    deliveries: int
    weeks: list[float | None] = Field(description="On-time % per week, oldest first")
    week_starts: list[date]


class Dwell(BaseModel):
    facility: str
    visits: int
    avg_minutes: int
    longest_minutes: int


class City(BaseModel):
    name: str
    state: str
    lat: float
    lon: float


class OperationsOut(BaseModel):
    cities: list[City] = Field(description="Large US cities, to label the live map")
    tiles: list[Tile]
    activity: list[Activity]
    on_time: OnTime
    heatmap: list[list[int]] = Field(description="Pickups by weekday (Monday first) and two-hour block, last 8 weeks")
    heatmap_weeks: int
    dwell: list[Dwell]
    dwell_days: int


STATUS_WORD = {"assigned": "assigned", "dispatched": "dispatched", "at_pickup": "arrived at pickup",
               "in_transit": "picked up", "at_delivery": "arrived at delivery", "delivered": "delivered",
               "pod_review": "POD received", "completed": "completed", "cancelled": "cancelled",
               "on_hold": "put on hold", "planned": "planned"}
STATUS_TONE = {"delivered": "ok", "completed": "ok", "pod_review": "info", "cancelled": "bad", "on_hold": "warn",
               "in_transit": "brand", "at_pickup": "teal", "at_delivery": "teal", "dispatched": "brand"}


def operations(db: Session, p: Principal) -> OperationsOut:
    now = datetime.now(UTC)
    today = p.today()
    views = loads.view_conditions(p, now)
    lo, hi = loads.day_bounds(p.timezone, today)
    rolling_today = and_(Load.delivery_at >= lo, Load.delivery_at < hi)
    tiles = [
        Tile(key="in_transit", label="In transit", count=_count(db, p, Load.status == "in_transit"),
             sub=f"{_count(db, p, and_(Load.status == 'in_transit', rolling_today))} deliver today", tone="brand",
             params={"status": ["in_transit"]}),
        Tile(key="at_pickup", label="At pickup", count=_count(db, p, Load.status == "at_pickup"),
             sub="Loading now", tone="teal", params={"status": ["at_pickup"]}),
        Tile(key="at_delivery", label="At delivery", count=_count(db, p, Load.status == "at_delivery"),
             sub="Unloading now", tone="info", params={"status": ["at_delivery"]}),
        Tile(key="late", label="Late or at risk", count=_count(db, p, views["at_risk"]),
             sub="Past an appointment, or no driver soon", tone="bad", params={"view": "at_risk"}),
        Tile(key="unassigned", label="Unassigned", count=_count(db, p, views["unassigned_soon"]),
             sub="Pick up within 24 h, no driver", tone="warn", params={"view": "unassigned_soon"}),
    ]

    events = db.execute(team_scope.where(
        select(LoadStatusEvent.created_at, LoadStatusEvent.to_status, Load.id, Load.load_number, Load.destination_city,
               Load.origin_city).join(Load, Load.id == LoadStatusEvent.load_id)
        .where(LoadStatusEvent.created_at >= lo, LoadStatusEvent.created_at < hi)
        .order_by(LoadStatusEvent.created_at.desc()).limit(30), team_scope.loads(p.scope))).all()
    activity = [Activity(at=at, tone=STATUS_TONE.get(to, "mu"), load_id=lid, load_number=number,
                         text=f"{number} {STATUS_WORD.get(to, to.replace('_', ' '))}"
                              + (f" · {dest}" if to in ("delivered", "at_delivery") and dest else
                                 f" · {origin}" if to in ("at_pickup", "in_transit") and origin else ""))
                for at, to, lid, number, dest, origin in events]
    if p.can("incidents.read"):
        alerts = db.execute(team_scope.where(
            select(Incident.detected_at, Incident.severity, Incident.title, Incident.number)
            .where(Incident.detected_at >= lo, Incident.detected_at < hi)
            .order_by(Incident.detected_at.desc()).limit(15), team_scope.incidents(p.scope))).all()
        activity += [Activity(at=at, tone="bad" if sev == "high" else "warn", text=f"{number} · {title}")
                     for at, sev, title, number in alerts]
    activity.sort(key=lambda a: a.at, reverse=True)

    report = on_time_report(weeks=5, customer_id=None, format="json", p=p, db=db)
    on_time = OnTime(pct=float(report.pct) if report.pct is not None else None, target_pct=TARGET_PCT,
                     deliveries=report.deliveries, weeks=[float(w.pct) if w.pct is not None else None for w in report.by_week],
                     week_starts=[w.week_start for w in report.by_week])

    weeks = 8
    a, _ = loads.day_bounds(p.timezone, today - timedelta(weeks=weeks))
    local = func.timezone(p.timezone, LoadStop.appt_start)
    grid = [[0] * 12 for _ in range(7)]
    rows = db.execute(team_scope.where(
        select(func.extract("isodow", local).label("dow"), func.floor(func.extract("hour", local) / 2).label("block"),
               func.count()).join(Load, Load.id == LoadStop.load_id)
        .where(LoadStop.type == "pickup", LoadStop.appt_start >= a, LoadStop.appt_start < hi,
               Load.status.not_in(("draft", "cancelled")))
        .group_by("dow", "block"), team_scope.loads(p.scope))).all()
    for dow, block, n in rows:
        grid[int(dow) - 1][int(block)] = n

    days = 30
    since, _ = loads.day_bounds(p.timezone, today - timedelta(days=days))
    facility = func.coalesce(LoadStop.name, LoadStop.city)
    minutes = func.extract("epoch", func.coalesce(LoadStop.departed_at, func.now()) - LoadStop.arrived_at) / 60
    dwell = [Dwell(facility=f"{name}" + (f", {city}" if city and city != name else ""), visits=n,
                   avg_minutes=round(avg), longest_minutes=round(top))
             for name, city, n, avg, top in db.execute(team_scope.where(
                 select(facility, LoadStop.city, func.count(), func.avg(minutes), func.max(minutes))
                 .join(Load, Load.id == LoadStop.load_id)
                 .where(LoadStop.arrived_at >= since, LoadStop.arrived_at.is_not(None))
                 .group_by(facility, LoadStop.city).order_by(func.avg(minutes).desc()).limit(8),
                 team_scope.loads(p.scope))).all()]
    from app.core.places import _places
    cities = [City(name=n, state=st, lat=la, lon=lo) for n, st, la, lo, pop in _places()
              if pop >= 250_000 and n not in ("Brooklyn", "Queens", "Manhattan", "The Bronx", "Staten Island")]
    return OperationsOut(cities=cities, tiles=tiles, activity=activity[:30], on_time=on_time, heatmap=grid, heatmap_weeks=weeks,
                         dwell=dwell, dwell_days=days)


@router.get("/dashboard/operations", response_model=OperationsOut)
def dashboard_operations(p: Principal = Depends(READ), db: Session = Depends(get_db)):
    """Live status, the day's events, on-time delivery, when pickups happen and where trucks wait longest."""
    if not p.can("loads.read"):
        raise Forbidden("Your role does not allow seeing loads")
    return operations(db, p)


class SpeedHour(BaseModel):
    hour: datetime
    avg_mph: float | None
    max_mph: float | None


class TruckOut(BaseModel):
    vehicle_id: uuid.UUID
    unit_number: str
    hours: list[SpeedHour] = Field(description="The last seven hours, oldest first")
    miles_today: int | None


@router.get("/dashboard/trucks/{vehicle_id}", response_model=TruckOut)
def dashboard_truck(vehicle_id: uuid.UUID, p: Principal = Depends(require("tracking.read")),
                    db: Session = Depends(get_db)):
    """A truck's speed hour by hour over the last seven hours, from the positions it sent."""
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None or not team_scope.has_vehicle(p.scope, vehicle_id):
        raise NotFound("Truck not found")
    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    start = now - timedelta(hours=6)
    hour = func.date_trunc("hour", VehiclePosition.recorded_at)
    got = {h.replace(tzinfo=UTC) if h.tzinfo is None else h: (avg, top) for h, avg, top in db.execute(
        select(hour, func.avg(VehiclePosition.speed_mph), func.max(VehiclePosition.speed_mph))
        .where(VehiclePosition.vehicle_id == vehicle_id, VehiclePosition.recorded_at >= start).group_by(hour))}
    hours = []
    for i in range(7):
        at = start + timedelta(hours=i)
        avg, top = next(((v[0], v[1]) for k, v in got.items() if k == at), (None, None))
        hours.append(SpeedHour(hour=at, avg_mph=round(float(avg), 1) if avg is not None else None,
                               max_mph=float(top) if top is not None else None))
    lo, _ = loads.day_bounds(p.timezone, p.today())
    odo = db.execute(select(func.min(VehiclePosition.odometer_mi), func.max(VehiclePosition.odometer_mi))
                     .where(VehiclePosition.vehicle_id == vehicle_id, VehiclePosition.recorded_at >= lo)).one()
    return TruckOut(vehicle_id=vehicle.id, unit_number=vehicle.unit_number, hours=hours,
                    miles_today=(odo[1] - odo[0]) if odo[0] is not None and odo[1] is not None else None)


# ---------------------------------------------------------------- money
FINANCE = ("loads.rates.read", "invoices.read", "expenses.read")


def finance_access(p: Principal) -> bool:
    """Roles that see what loads earn, what is invoiced and what is spent."""
    return all(p.can(x) for x in FINANCE)


def _need_finance(p: Principal) -> None:
    if not finance_access(p):
        raise Forbidden("Your role does not include finance")


def _revenue(db: Session, p: Principal, first: date, last: date) -> tuple[Decimal, int, int]:
    """Revenue, miles and loads delivered between two days, both inclusive."""
    a, b = loads.day_bounds(p.timezone, first, last)
    total, miles, n = db.execute(select(func.coalesce(func.sum(_rev()), 0), func.coalesce(func.sum(Load.miles), 0),
                                        func.count()).where(Load.status.in_(DELIVERED), Load.delivered_at >= a,
                                                            Load.delivered_at < b)).one()
    return Decimal(total), int(miles), n


def _cost(db: Session, first: date, last: date) -> Decimal:
    """Expenses recorded (cash advances aside: they come back out of pay) and driver pay on statements."""
    from app.modules.expenses.models import Expense
    from app.modules.settlements.models import DriverSettlement
    spent = db.scalar(select(func.coalesce(func.sum(Expense.amount), 0)).where(
        Expense.category != "advance", Expense.incurred_on >= first, Expense.incurred_on <= last)) or 0
    pay = db.scalar(select(func.coalesce(func.sum(DriverSettlement.earnings), 0)).where(
        DriverSettlement.status != "void", DriverSettlement.period_end >= first, DriverSettlement.period_end <= last)) or 0
    return Decimal(spent) + Decimal(pay)


def _month_start(day: date, back: int = 0) -> date:
    first = day.replace(day=1)
    for _ in range(back):
        first = (first - timedelta(days=1)).replace(day=1)
    return first


def _month_end(first: date) -> date:
    return (first + timedelta(days=32)).replace(day=1) - timedelta(days=1)


def _receivable(db: Session) -> Decimal:
    from app.modules.finance.models import Invoice, Payment, PaymentAllocation
    paid = (select(func.coalesce(func.sum(PaymentAllocation.amount), 0))
            .join(Payment, Payment.id == PaymentAllocation.payment_id)
            .where(PaymentAllocation.invoice_id == Invoice.id, Payment.status == "recorded")
            .correlate(Invoice).scalar_subquery())
    return Decimal(db.scalar(select(func.coalesce(func.sum(Invoice.total - paid), 0)).where(Invoice.status == "issued")) or 0)


class MoneyTile(BaseModel):
    key: str
    label: str
    value: Decimal | None
    unit: Literal["money", "percent", "per_mile", "days"]
    good: Literal["up", "down"]
    change: Decimal | None = Field(description="Against the same stretch of last month")
    change_text: str
    tone: Literal["good", "bad", "neutral"]
    series: list[Decimal | None] = Field(description="Seven months, oldest first, this month so far last")
    definition: str


class WeekMoney(BaseModel):
    week_start: date
    revenue: Decimal
    cost: Decimal
    margin: Decimal
    prior_revenue: Decimal
    prior_cost: Decimal


class Goal(BaseModel):
    goal: Decimal | None
    so_far: Decimal
    pct: int | None
    projected: Decimal | None
    days_left: int
    basis: str


class Bucket(BaseModel):
    key: str
    label: str
    amount: Decimal
    share: int | None


class CashWeek(BaseModel):
    week_start: date
    cash_in: Decimal
    cash_out: Decimal
    net: Decimal


class LaneCustomer(BaseModel):
    name: str
    revenue: Decimal
    loads: int


class Lane(BaseModel):
    key: str
    origin: str
    destination: str
    loads: int
    miles: int
    revenue: Decimal
    cost: Decimal
    profit: Decimal
    margin_pct: int | None
    weeks: list[Decimal] = Field(description="Revenue per week, last 8 weeks, oldest first")
    customers: list[LaneCustomer]


class FinancialOut(BaseModel):
    today: date
    tiles: list[MoneyTile]
    weeks: list[WeekMoney]
    totals: dict[str, Decimal]
    goal: Goal
    aging: list[Bucket]
    aging_total: Decimal
    cash: list[CashWeek]
    lanes: list[Lane]
    lane_days: int
    definitions: dict[str, str]


def _tile(key, label, unit, good, series: list[Decimal | None], change_base: Decimal | None, definition) -> MoneyTile:
    value = series[-1]
    change = (value - change_base) if value is not None and change_base is not None else None
    if change is None or change == 0:
        tone, text = "neutral", ("No change vs last month" if change == 0 else "No figure for last month")
    else:
        tone = "good" if (change > 0) == (good == "up") else "bad"
        size = {"money": f"${abs(change):,.0f}", "percent": f"{abs(change):.1f} pts",
                "per_mile": f"${abs(change):.2f}", "days": f"{abs(change):.0f} days"}[unit]
        text = f"{'▲' if change > 0 else '▼'} {size} vs last month"
    return MoneyTile(key=key, label=label, value=value, unit=unit, good=good, change=change, change_text=text,
                     tone=tone, series=series, definition=definition)


def lanes(db: Session, p: Principal, days: int = 90) -> list[Lane]:
    from app.modules.expenses.models import Expense
    from app.modules.settlements.models import DriverSettlement, SettlementLine
    today = p.today()
    a, b = loads.day_bounds(p.timezone, today - timedelta(days=days - 1), today)
    pay = (select(SettlementLine.load_id, func.sum(SettlementLine.amount).label("pay"))
           .join(DriverSettlement, DriverSettlement.id == SettlementLine.settlement_id)
           .where(DriverSettlement.status != "void", SettlementLine.kind.in_(("load_pay", "accessorial")),
                  SettlementLine.load_id.is_not(None)).group_by(SettlementLine.load_id).subquery())
    spent = (select(Expense.load_id, func.sum(Expense.amount).label("spent"))
             .where(Expense.load_id.is_not(None), Expense.category != "advance").group_by(Expense.load_id).subquery())
    rows = db.execute(
        select(Load.origin_city, Load.origin_state, Load.destination_city, Load.destination_state, Customer.name,
               cast(func.date_trunc("week", func.timezone(p.timezone, Load.delivered_at)), Date).label("week"),
               _rev().label("rev"), func.coalesce(Load.miles, 0).label("miles"),
               (func.coalesce(pay.c.pay, 0) + func.coalesce(spent.c.spent, 0)).label("cost"))
        .join(Customer, Customer.id == Load.customer_id)
        .outerjoin(pay, pay.c.load_id == Load.id).outerjoin(spent, spent.c.load_id == Load.id)
        .where(Load.status.in_(DELIVERED), Load.delivered_at >= a, Load.delivered_at < b)).all()
    first_week = _monday(today) - timedelta(weeks=7)
    grouped: dict[tuple, dict] = {}
    for r in rows:
        key = (_place(r.origin_city, r.origin_state), _place(r.destination_city, r.destination_state))
        g = grouped.setdefault(key, {"loads": 0, "miles": 0, "revenue": ZERO, "cost": ZERO,
                                     "weeks": [ZERO] * 8, "customers": defaultdict(lambda: [ZERO, 0])})
        g["loads"] += 1
        g["miles"] += int(r.miles)
        g["revenue"] += Decimal(r.rev)
        g["cost"] += Decimal(r.cost)
        i = (r.week - first_week).days // 7
        if 0 <= i < 8:
            g["weeks"][i] += Decimal(r.rev)
        g["customers"][r.name][0] += Decimal(r.rev)
        g["customers"][r.name][1] += 1
    out = []
    for (origin, destination), g in sorted(grouped.items(), key=lambda kv: -kv[1]["revenue"])[:15]:
        profit = g["revenue"] - g["cost"]
        out.append(Lane(key=f"{origin} → {destination}", origin=origin, destination=destination, loads=g["loads"],
                        miles=g["miles"], revenue=money(g["revenue"]), cost=money(g["cost"]), profit=money(profit),
                        margin_pct=_pct(float(profit), float(g["revenue"])),
                        weeks=[money(w) for w in g["weeks"]],
                        customers=[LaneCustomer(name=n, revenue=money(v[0]), loads=v[1]) for n, v in
                                   sorted(g["customers"].items(), key=lambda kv: -kv[1][0])[:3]]))
    return out


def aging(db: Session, p: Principal) -> tuple[list[Bucket], Decimal]:
    from app.modules.reports.router import ar_aging
    totals = ar_aging(format="json", p=p, db=db).totals or {}
    labels = [("current", "Not yet due"), ("days_1_30", "1–30 days"), ("days_31_60", "31–60 days"),
              ("days_61_90", "61–90 days"), ("days_over_90", "Over 90 days")]
    whole = Decimal(totals.get("total", 0) or 0)
    return [Bucket(key=k, label=label, amount=money(Decimal(totals.get(k, 0) or 0)),
                   share=_pct(float(totals.get(k, 0) or 0), float(whole))) for k, label in labels], money(whole)


def cash(db: Session, p: Principal) -> list[CashWeek]:
    """Four weeks from this Monday. In: what customers owe on issued invoices, in the week it falls due (anything
    already overdue in the first). Out: approved driver statements not yet paid (in the first week), and each week
    the average weekly spend of the last eight weeks."""
    from app.modules.expenses.models import Expense
    from app.modules.finance.models import Invoice, Payment, PaymentAllocation
    from app.modules.settlements.models import DriverSettlement
    start = _monday(p.today())
    paid = (select(func.coalesce(func.sum(PaymentAllocation.amount), 0))
            .join(Payment, Payment.id == PaymentAllocation.payment_id)
            .where(PaymentAllocation.invoice_id == Invoice.id, Payment.status == "recorded")
            .correlate(Invoice).scalar_subquery())
    owed = db.execute(select(Invoice.due_date, Invoice.total - paid).where(Invoice.status == "issued")).all()
    cash_in = [ZERO] * 4
    for due, balance in owed:
        if balance is None or balance <= 0:
            continue
        i = 0 if due is None or due < start else (due - start).days // 7
        if i < 4:
            cash_in[i] += Decimal(balance)
    approved = Decimal(db.scalar(select(func.coalesce(func.sum(DriverSettlement.net_pay), 0)).where(
        DriverSettlement.status == "approved")) or 0)
    spent = Decimal(db.scalar(select(func.coalesce(func.sum(Expense.amount), 0)).where(
        Expense.category != "advance", Expense.incurred_on >= start - timedelta(weeks=8),
        Expense.incurred_on < start)) or 0) / 8
    out = []
    for i in range(4):
        o = spent + (approved if i == 0 else ZERO)
        out.append(CashWeek(week_start=start + timedelta(weeks=i), cash_in=money(cash_in[i]), cash_out=money(o),
                            net=money(cash_in[i] - o)))
    return out


def financial(db: Session, p: Principal, weeks: int = 12) -> FinancialOut:
    today = p.today()
    # Seven months, the last so far; the comparison is the same stretch of last month.
    months = [_month_start(today, i) for i in range(6, -1, -1)]
    ends = [_month_end(m) for m in months[:-1]] + [today]
    figures = [(*_revenue(db, p, m, e), _cost(db, m, e)) for m, e in zip(months, ends, strict=True)]
    last_first = months[-2]
    stretch_end = min(_month_end(last_first), last_first + (today - months[-1]))
    l_rev, l_miles, _, l_cost = (*_revenue(db, p, last_first, stretch_end), _cost(db, last_first, stretch_end))

    def ratio(cost, rev):
        return money(Decimal(100) * cost / rev) if rev else None

    def per(x, miles):
        return money(x / miles) if miles else None
    receivable = _receivable(db)
    billed_90, _, _ = _revenue(db, p, today - timedelta(days=89), today)
    dso = money(receivable / billed_90 * 90) if billed_90 else None
    tiles = [
        _tile("revenue_mtd", "Revenue, month to date", "money", "up", [money(f[0]) for f in figures], money(l_rev),
              "Revenue of loads delivered this month: the customer rate plus billable charges."),
        _tile("operating_ratio", "Operating ratio", "percent", "down", [ratio(f[3], f[0]) for f in figures],
              ratio(l_cost, l_rev), "Costs as a share of revenue. Under 100% means the month made money."),
        _tile("revenue_per_mile", "Revenue per mile", "per_mile", "up", [per(f[0], f[1]) for f in figures],
              per(l_rev, l_miles), "Revenue divided by the loaded miles of the loads delivered."),
        _tile("cost_per_mile", "Cost per mile", "per_mile", "down", [per(f[3], f[1]) for f in figures],
              per(l_cost, l_miles), "Costs divided by the loaded miles of the loads delivered."),
        _tile("dso", "Days sales outstanding", "days", "down", [None] * 6 + [dso], None,
              "What customers owe now, divided by the revenue of the last 90 days, times 90."),
    ]

    start = _monday(today) - timedelta(weeks=weeks - 1)
    prior = start - timedelta(weeks=weeks)
    out_weeks, totals = [], {"revenue": ZERO, "cost": ZERO, "margin": ZERO, "prior_revenue": ZERO, "prior_cost": ZERO}
    for i in range(weeks):
        a = start + timedelta(weeks=i)
        b = min(a + timedelta(days=6), today)
        pa = prior + timedelta(weeks=i)
        rev, cost = _revenue(db, p, a, b)[0], _cost(db, a, b)
        prev, pcost = _revenue(db, p, pa, pa + timedelta(days=6))[0], _cost(db, pa, pa + timedelta(days=6))
        w = WeekMoney(week_start=a, revenue=money(rev), cost=money(cost), margin=money(rev - cost),
                      prior_revenue=money(prev), prior_cost=money(pcost))
        out_weeks.append(w)
        for k in totals:
            totals[k] += getattr(w, k)

    goal_value = money(figures[-2][0]) if figures[-2][0] else None
    so_far = figures[-1][0]
    month_days = _month_end(months[-1]).day
    projected = money(so_far / today.day * month_days) if today.day else None
    goal = Goal(goal=goal_value, so_far=money(so_far), pct=_pct(float(so_far), float(goal_value)) if goal_value else None,
                projected=projected, days_left=month_days - today.day,
                basis="Goal: last month's revenue" if goal_value else "No revenue last month to set a goal from")
    buckets, owed = aging(db, p)
    return FinancialOut(
        today=today, tiles=tiles, weeks=out_weeks, totals=totals, goal=goal, aging=buckets, aging_total=owed,
        cash=cash(db, p), lanes=lanes(db, p), lane_days=90,
        definitions={
            "revenue": "Revenue: the customer rate plus billable charges of loads delivered, by delivery date.",
            "cost": "Cost: expenses recorded (cash advances aside) by date incurred, plus driver pay on statements by "
                    "the end of their pay period.",
            "lanes": "Lanes: loads delivered in the last 90 days by pickup and delivery city. Cost is the driver pay "
                     "and the expenses recorded against each load.",
            "cash": "Cash forecast: in, what customers owe on issued invoices in the week each is due (overdue in the "
                    "first week); out, approved driver statements not yet paid (first week) plus the average weekly "
                    "spend of the last eight weeks.",
        })


@router.get("/dashboard/financial", response_model=FinancialOut)
def dashboard_financial(weeks: int = Query(default=12, description="4, 12 or 26"), p: Principal = Depends(READ),
                        db: Session = Depends(get_db)):
    """Money: the month's figures, revenue and cost by week, the month's goal, receivables, cash and lanes."""
    if weeks not in (4, 12, 26):
        raise Invalid("Choose 4, 12 or 26 weeks", field="weeks")
    _need_finance(p)
    return financial(db, p, weeks)


# ---------------------------------------------------------------- the fleet and its drivers
PM_INTERVAL_MI = 25_000
IDLE_GAP = timedelta(minutes=30)


class FleetStat(BaseModel):
    key: str
    label: str
    value: Decimal | None
    unit: str
    sub: str
    definition: str


class StatusSlice(BaseModel):
    key: Literal["driving", "at_dock", "available", "in_shop"]
    label: str
    count: int


class DriverWeek(BaseModel):
    week_start: date
    score: int | None


class RecentLoad(BaseModel):
    load_id: uuid.UUID
    load_number: str
    lane: str
    delivered_on: date | None
    on_time: bool | None


class DriverRank(BaseModel):
    driver_id: uuid.UUID
    name: str
    score: int | None
    miles: int
    loads: int
    on_time_pct: int | None
    incidents: int
    weeks: list[DriverWeek]
    recent: list[RecentLoad]


class Expiring(BaseModel):
    holder: str
    kind: str
    item: str
    expires: date
    days_left: int


class Service(BaseModel):
    vehicle_id: uuid.UUID
    unit_number: str
    miles_since: int | None
    pct_used: int | None
    last_service: date | None


class SafetyWeek(BaseModel):
    week_start: date
    incidents: int
    score: int | None


class TypeCount(BaseModel):
    kind: str
    label: str
    count: int


class FleetOut(BaseModel):
    stats: list[FleetStat]
    status: list[StatusSlice]
    working_pct: int | None
    drivers: list[DriverRank]
    expiring_counts: dict[str, int]
    expiring: list[Expiring]
    maintenance: list[Service]
    pm_interval_mi: int
    safety: list[SafetyWeek]
    by_type: list[TypeCount]
    definitions: dict[str, str]


def _safety_score(points: int, miles: int) -> int | None:
    """100, less 10 for each alert point per 1,000 miles (high 5, medium 2, low 1)."""
    if not miles:
        return None if not points else 0
    return max(0, round(100 - 10 * points * 1000 / miles))


def _driver_score(on_time: int | None, safety: int | None) -> int | None:
    known = [(v, w) for v, w in ((on_time, 60), (safety, 40)) if v is not None]
    return round(sum(v * w for v, w in known) / sum(w for _, w in known)) if known else None


def fleet(db: Session, p: Principal) -> FleetOut:
    from app.modules.expenses.models import Expense
    from app.modules.maintenance.models import WorkOrder
    from app.modules.reports.catalog import expiring as expiring_report
    now = datetime.now(UTC)
    today = p.today()
    since_day = today - timedelta(days=29)
    since, until = loads.day_bounds(p.timezone, since_day, today)
    vscope = lambda col: team_scope.vehicles(p.scope, col)  # noqa: E731

    # trucks: what each is doing now
    trucks = db.execute(team_scope.where(select(Vehicle.id, Vehicle.unit_number, Vehicle.status, Vehicle.odometer)
                                         .where(Vehicle.status != "retired"), vscope(Vehicle.id))).all()
    doing = dict(db.execute(select(DispatchAssignment.vehicle_id, Load.status)
                            .join(Load, Load.id == DispatchAssignment.load_id)
                            .where(DispatchAssignment.status == "active", Load.status.in_(loads.ROLLING + ("assigned",)))).all())
    counts = {"driving": 0, "at_dock": 0, "available": 0, "in_shop": 0}
    for vid, _, status, _ in trucks:
        if status in ("in_maintenance", "out_of_service"):
            counts["in_shop"] += 1
        elif doing.get(vid) in ("at_pickup", "at_delivery"):
            counts["at_dock"] += 1
        elif doing.get(vid) in ("dispatched", "in_transit"):
            counts["driving"] += 1
        else:
            counts["available"] += 1
    labels = {"driving": "Driving", "at_dock": "At a dock", "available": "Available", "in_shop": "In the shop"}
    status = [StatusSlice(key=k, label=labels[k], count=v) for k, v in counts.items()]
    working = _pct(counts["driving"] + counts["at_dock"], len(trucks))

    # loads delivered in the last 30 days, by driver
    last = (select(LoadStop.load_id, LoadStop.arrived_at, func.coalesce(LoadStop.appt_end, LoadStop.appt_start).label("due"))
            .distinct(LoadStop.load_id).order_by(LoadStop.load_id, LoadStop.seq.desc()).subquery())
    eight = _monday(today) - timedelta(weeks=7)
    w_lo, _ = loads.day_bounds(p.timezone, eight)
    hauled = db.execute(team_scope.where(
        select(Driver.id, Driver.first_name, Driver.last_name, Load.id, Load.load_number, Load.origin_city,
               Load.origin_state, Load.destination_city, Load.destination_state, Load.miles, Load.delivered_at,
               last.c.arrived_at, last.c.due)
        .join(DispatchAssignment, (DispatchAssignment.load_id == Load.id)
              & DispatchAssignment.status.in_(("active", "completed")))
        .join(Driver, Driver.id == DispatchAssignment.driver_id).outerjoin(last, last.c.load_id == Load.id)
        .where(Load.status.in_(DELIVERED), Load.delivered_at >= w_lo).order_by(Load.delivered_at.desc()),
        vscope(DispatchAssignment.vehicle_id))).all()
    alerts = db.execute(team_scope.where(
        select(Incident.driver_id, Incident.kind, Incident.severity, Incident.detected_at)
        .where(Incident.detected_at >= w_lo), team_scope.incidents(p.scope))).all()

    zone = ZoneInfo(p.timezone)

    def week_of(at: datetime) -> int:
        return (_monday(at.astimezone(zone).date()) - eight).days // 7

    people: dict[uuid.UUID, dict] = {}
    for r in hauled:
        d = people.setdefault(r[0], {"name": f"{r[1]} {r[2]}", "loads": 0, "miles": 0, "judged": 0, "ok": 0,
                                     "points": 0, "incidents": 0, "weeks": [[0, 0, 0, 0] for _ in range(8)],
                                     "recent": []})
        ok = (r.arrived_at <= r.due) if r.arrived_at and r.due else None
        i = week_of(r.delivered_at)
        if 0 <= i < 8:
            wk = d["weeks"][i]
            wk[0] += int(r.miles or 0)
            if ok is not None:
                wk[1] += 1
                wk[2] += int(ok)
        if r.delivered_at >= since:
            d["loads"] += 1
            d["miles"] += int(r.miles or 0)
            if ok is not None:
                d["judged"] += 1
                d["ok"] += int(ok)
        if len(d["recent"]) < 5:
            d["recent"].append(RecentLoad(load_id=r[3], load_number=r.load_number,
                                          lane=f"{_place(r.origin_city, r.origin_state)} → "
                                               f"{_place(r.destination_city, r.destination_state)}",
                                          delivered_on=r.delivered_at.date() if r.delivered_at else None, on_time=ok))
    for driver_id, kind, severity, at in alerts:
        if kind not in SAFETY_KINDS or driver_id not in people:
            continue
        d = people[driver_id]
        i = week_of(at)
        if 0 <= i < 8:
            d["weeks"][i][3] += SEVERITY_POINTS.get(severity, 1)
        if at >= since:
            d["points"] += SEVERITY_POINTS.get(severity, 1)
            d["incidents"] += 1
    ranks = []
    for driver_id, d in people.items():
        on_time = _pct(d["ok"], d["judged"])
        weeks = [DriverWeek(week_start=eight + timedelta(weeks=i),
                            score=_driver_score(_pct(w[2], w[1]), _safety_score(w[3], w[0])) if w[0] or w[1] else None)
                 for i, w in enumerate(d["weeks"])]
        if not d["loads"]:
            continue
        ranks.append(DriverRank(driver_id=driver_id, name=d["name"], miles=d["miles"], loads=d["loads"],
                                on_time_pct=on_time, incidents=d["incidents"],
                                score=_driver_score(on_time, _safety_score(d["points"], d["miles"])),
                                weeks=weeks, recent=d["recent"]))
    ranks.sort(key=lambda r: (-(r.score if r.score is not None else -1), -r.miles, r.name))

    # fleet figures
    gallons = db.scalar(select(func.sum(Expense.gallons)).where(
        Expense.category == "fuel", Expense.incurred_on >= since_day,
        Expense.incurred_on <= today)) if p.can("expenses.read") else None
    fleet_miles = sum(r.miles for r in ranks)
    mpg = (Decimal(fleet_miles) / Decimal(gallons)).quantize(Decimal("0.1")) if gallons and fleet_miles else None
    window = {"partition_by": VehiclePosition.vehicle_id, "order_by": VehiclePosition.recorded_at}
    gap = func.lag(VehiclePosition.recorded_at).over(**window)
    prev_speed = func.lag(VehiclePosition.speed_mph).over(**window)
    seq = (select(VehiclePosition.recorded_at.label("at"), gap.label("before"), VehiclePosition.speed_mph.label("speed"),
                  prev_speed.label("prev"))
           .where(VehiclePosition.recorded_at >= now - timedelta(days=7)))
    seq = team_scope.where(seq, vscope(VehiclePosition.vehicle_id)).subquery()
    idle_seconds = db.scalar(select(func.coalesce(func.sum(func.extract("epoch", seq.c.at - seq.c.before)), 0)).where(
        seq.c.speed < 1, seq.c.prev < 1, seq.c.at - seq.c.before <= IDLE_GAP)) or 0
    reporting = db.scalar(team_scope.where(select(func.count(func.distinct(VehiclePosition.vehicle_id))).where(
        VehiclePosition.recorded_at >= now - timedelta(days=7)), vscope(VehiclePosition.vehicle_id))) or 0
    idle = (Decimal(idle_seconds) / 3600 / 7 / reporting).quantize(Decimal("0.1")) if reporting else None
    points = sum(SEVERITY_POINTS.get(sev, 1) for _, kind, sev, at in alerts if kind in SAFETY_KINDS and at >= since)
    safety_score = _safety_score(points, fleet_miles)

    # service intervals
    last_service = {vid: (odo, done) for vid, odo, done in db.execute(
        select(WorkOrder.vehicle_id, WorkOrder.odometer, WorkOrder.completed_at)
        .distinct(WorkOrder.vehicle_id).where(WorkOrder.status == "completed", WorkOrder.vehicle_id.is_not(None),
                                              WorkOrder.odometer.is_not(None))
        .order_by(WorkOrder.vehicle_id, WorkOrder.completed_at.desc()))}
    latest_odo = dict(db.execute(select(VehiclePosition.vehicle_id, func.max(VehiclePosition.odometer_mi))
                                 .group_by(VehiclePosition.vehicle_id)).all())
    service = []
    for vid, unit, _, odo in trucks:
        now_odo = max(x for x in (odo, latest_odo.get(vid), 0) if x is not None)
        done = last_service.get(vid)
        since_mi = now_odo - done[0] if done and now_odo else None
        service.append(Service(vehicle_id=vid, unit_number=unit, miles_since=since_mi,
                               pct_used=_pct(since_mi, PM_INTERVAL_MI) if since_mi is not None else None,
                               last_service=done[1].date() if done and done[1] else None))
    service.sort(key=lambda s: -(s.pct_used if s.pct_used is not None else -1))
    due = sum(1 for s in service if s.pct_used is not None and s.pct_used >= 90)

    # papers
    exp = []
    if p.can("safety.read"):
        exp = [Expiring(holder=r["label"], kind=r["kind"], item=r["item"], expires=r["expires"], days_left=r["left"])
               for r in expiring_report(days=60, format="json", p=p, db=db).rows]
    exp_counts = {"expired": sum(1 for e in exp if e.days_left < 0),
                  "7": sum(1 for e in exp if 0 <= e.days_left <= 7), "30": sum(1 for e in exp if 0 <= e.days_left <= 30),
                  "60": sum(1 for e in exp if 0 <= e.days_left <= 60)}

    # safety by week and by kind
    weekly_miles = [0] * 8
    for d in people.values():
        for i, w in enumerate(d["weeks"]):
            weekly_miles[i] += w[0]
    weekly = [[0, 0] for _ in range(8)]
    kinds: dict[str, int] = defaultdict(int)
    for _, kind, sev, at in alerts:
        i = week_of(at)
        if 0 <= i < 8 and kind in SAFETY_KINDS:
            weekly[i][0] += 1
            weekly[i][1] += SEVERITY_POINTS.get(sev, 1)
        if at >= since:
            kinds[kind] += 1
    safety = [SafetyWeek(week_start=eight + timedelta(weeks=i), incidents=n,
                         score=_safety_score(pts, weekly_miles[i])) for i, (n, pts) in enumerate(weekly)]
    by_type = [TypeCount(kind=k, label=INCIDENT_LABEL.get(k, k.replace("_", " ").capitalize()), count=n)
               for k, n in sorted(kinds.items(), key=lambda kv: -kv[1])]
    stats = [
        FleetStat(key="mpg", label="Average MPG", value=mpg, unit="mpg",
                  sub="Last 30 days" if mpg is not None else "Needs fuel purchases with gallons",
                  definition="Loaded miles delivered in the last 30 days, divided by the gallons of fuel bought."),
        FleetStat(key="idle", label="Idle time", value=idle, unit="h/day",
                  sub=f"Per reporting truck · {reporting} reporting" if idle is not None else "No positions in the last 7 days",
                  definition="Time trucks reported standing still (under 1 mph) over the last 7 days, per reporting truck "
                             "per day. Gaps over 30 minutes between positions aren't counted."),
        FleetStat(key="safety", label="Fleet safety score", value=Decimal(safety_score) if safety_score is not None else None,
                  unit="/100", sub=f"{points} alert points in 30 days",
                  definition="100, less 10 for each alert point per 1,000 miles over the last 30 days. Speeding is "
                             "5 points when high, 2 medium, 1 low."),
        FleetStat(key="maintenance", label="Maintenance due", value=Decimal(due), unit="trucks",
                  sub=f"90% or more of the {PM_INTERVAL_MI:,}-mile interval",
                  definition=f"Trucks that have run 90% or more of the {PM_INTERVAL_MI:,}-mile service interval since "
                             "their last completed work order with an odometer reading."),
    ]
    return FleetOut(stats=stats, status=status, working_pct=working, drivers=ranks[:25], expiring_counts=exp_counts,
                    expiring=exp[:25], maintenance=service[:20], pm_interval_mi=PM_INTERVAL_MI, safety=safety,
                    by_type=by_type, definitions={
                        "score": "Driver score: 60% on-time delivery, 40% safety (as the fleet safety score, per "
                                 "driver), over the last 30 days.",
                        "status": "Fleet status: trucks driving (dispatched or loaded), at a dock (at pickup or "
                                  "delivery), available, or in the shop (in maintenance or out of service).",
                    })


@router.get("/dashboard/fleet", response_model=FleetOut)
def dashboard_fleet(p: Principal = Depends(READ), db: Session = Depends(get_db)):
    """The fleet and its drivers: fuel, idling, safety, what each truck is doing, the drivers' standing, papers
    running out, service due and the safety trend."""
    if not (p.can("drivers.read") and p.can("equipment.read")):
        raise Forbidden("Your role does not allow seeing drivers and trucks")
    return fleet(db, p)


# ---------------------------------------------------------------- the calendar
Category = Literal["pickup", "delivery", "maintenance", "expiration", "billing"]
CATEGORY_LABEL = {"pickup": "Pickups", "delivery": "Deliveries", "maintenance": "Maintenance",
                  "expiration": "Expirations", "billing": "Billing and payroll"}


class EventTarget(BaseModel):
    screen: str
    id: uuid.UUID | None = None
    kind: str | None = None


class CalendarEvent(BaseModel):
    id: str
    date: date
    time: str | None
    category: Category
    type: str
    title: str
    who: str | None
    lane: str | None
    reference: str | None
    past: bool
    target: EventTarget


class CalendarOut(BaseModel):
    date_from: date
    date_to: date
    today: date
    categories: dict[str, str] = Field(description="The categories this role sees, with their names")
    events: list[CalendarEvent]


def calendar(db: Session, p: Principal, first: date, last: date) -> CalendarOut:
    """Every dated thing between two days, from one place, so the month, the week, the agenda and the drawer agree."""
    from app.modules.finance.models import Invoice
    from app.modules.maintenance.models import WorkOrder
    from app.modules.reports.catalog import expiring as expiring_report
    from app.modules.settlements.models import DriverSettlement
    today = p.today()
    now = datetime.now(UTC)
    zone = ZoneInfo(p.timezone)
    lo, hi = loads.day_bounds(p.timezone, first, last)
    events: list[CalendarEvent] = []
    seen: dict[str, str] = {}
    if p.can("loads.read"):
        seen |= {"pickup": CATEGORY_LABEL["pickup"], "delivery": CATEGORY_LABEL["delivery"]}
        driver = (select(DispatchAssignment.load_id, func.concat(Driver.first_name, " ", Driver.last_name).label("name"))
                  .join(Driver, Driver.id == DispatchAssignment.driver_id)
                  .where(DispatchAssignment.status.in_(("active", "completed"))).subquery())
        for stop_id, kind, at, city, state, _name, lid, number, oc, os_, dc, ds, who in db.execute(team_scope.where(
                select(LoadStop.id, LoadStop.type, LoadStop.appt_start, LoadStop.city, LoadStop.state, LoadStop.name,
                       Load.id, Load.load_number, Load.origin_city, Load.origin_state, Load.destination_city,
                       Load.destination_state, driver.c.name)
                .join(Load, Load.id == LoadStop.load_id).outerjoin(driver, driver.c.load_id == Load.id)
                .where(LoadStop.type.in_(("pickup", "delivery")), LoadStop.appt_start >= lo, LoadStop.appt_start < hi,
                       Load.status.not_in(("draft", "cancelled")))
                .order_by(LoadStop.appt_start), team_scope.loads(p.scope))).all():
            local = at.astimezone(zone)
            events.append(CalendarEvent(
                id=f"stop:{stop_id}", date=local.date(), time=f"{local:%H:%M}", category=kind,
                type="Pickup" if kind == "pickup" else "Delivery",
                title=f"{'Pickup' if kind == 'pickup' else 'Delivery'} · {number} · {_place(city, state)}",
                who=who, lane=f"{_place(oc, os_)} → {_place(dc, ds)}", reference=number, past=at < now,
                target=EventTarget(screen="load", id=lid)))
    if p.can("maintenance.read"):
        seen["maintenance"] = CATEGORY_LABEL["maintenance"]
        for wid, number, title, on, status, unit in db.execute(team_scope.where(
                select(WorkOrder.id, WorkOrder.number, WorkOrder.title, WorkOrder.scheduled_for, WorkOrder.status,
                       Vehicle.unit_number).outerjoin(Vehicle, Vehicle.id == WorkOrder.vehicle_id)
                .where(WorkOrder.scheduled_for >= first, WorkOrder.scheduled_for <= last,
                       WorkOrder.status != "cancelled"), team_scope.vehicles(p.scope, WorkOrder.vehicle_id))).all():
            events.append(CalendarEvent(
                id=f"wo:{wid}", date=on, time=None, category="maintenance", type="Work order",
                title=f"{title}" + (f" · {unit}" if unit else ""), who=unit, lane=None, reference=number,
                past=on < today or status == "completed", target=EventTarget(screen="maintenance", id=wid)))
    if p.can("safety.read") and p.can("reports.read"):
        seen["expiration"] = CATEGORY_LABEL["expiration"]
        horizon = max(1, min(365, (last - today).days))
        for i, r in enumerate(expiring_report(days=horizon, format="json", p=p, db=db).rows):
            if not first <= r["expires"] <= last:
                continue
            events.append(CalendarEvent(
                id=f"exp:{i}:{r['expires']}", date=r["expires"], time=None, category="expiration", type=r["item"],
                title=f"{r['item']} · {r['label']}", who=r["label"], lane=None, reference=r["kind"],
                past=r["expires"] < today, target=EventTarget(screen="safety")))
    if p.can("invoices.read") or p.can("settlements.read"):
        seen["billing"] = CATEGORY_LABEL["billing"]
    if p.can("invoices.read"):
        for iid, number, due, customer in db.execute(
                select(Invoice.id, Invoice.invoice_number, Invoice.due_date, Customer.name)
                .join(Customer, Customer.id == Invoice.customer_id)
                .where(Invoice.status == "issued", Invoice.due_date >= first, Invoice.due_date <= last)).all():
            events.append(CalendarEvent(
                id=f"inv:{iid}", date=due, time=None, category="billing", type="Invoice due",
                title=f"Invoice {number} due · {customer}", who=customer, lane=None, reference=number,
                past=due < today, target=EventTarget(screen="invoices", id=iid)))
    if p.can("settlements.read"):
        for sid, number, end, paid_on, _status, first_name, last_name in db.execute(
                select(DriverSettlement.id, DriverSettlement.number, DriverSettlement.period_end,
                       DriverSettlement.paid_on, DriverSettlement.status, Driver.first_name, Driver.last_name)
                .join(Driver, Driver.id == DriverSettlement.driver_id)
                .where(DriverSettlement.status != "void",
                       or_(and_(DriverSettlement.period_end >= first, DriverSettlement.period_end <= last),
                           and_(DriverSettlement.paid_on >= first, DriverSettlement.paid_on <= last)))).all():
            on = paid_on if paid_on and first <= paid_on <= last else end
            events.append(CalendarEvent(
                id=f"stmt:{sid}", date=on, time=None, category="billing",
                type="Driver paid" if on == paid_on else "Pay period ends",
                title=f"{'Paid' if on == paid_on else 'Pay period ends'} · {first_name} {last_name}",
                who=f"{first_name} {last_name}", lane=None, reference=number or "Draft statement",
                past=on < today, target=EventTarget(screen="stmt", id=sid)))
    events.sort(key=lambda e: (e.date, e.time or "99", e.title))
    return CalendarOut(date_from=first, date_to=last, today=today, categories=seen, events=events)


@router.get("/dashboard/calendar", response_model=CalendarOut)
def dashboard_calendar(date_from: date, date_to: date, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    """Pickups, deliveries, maintenance, expirations, invoices due and driver pay, day by day."""
    if date_to < date_from or (date_to - date_from).days > 100:
        raise Invalid("Choose up to 100 days", field="date_to")
    return calendar(db, p, date_from, date_to)


# ---------------------------------------------------------------- sharing the dashboard
TAB_NEEDS: dict[str, tuple[str, ...]] = {
    "overview": ("dashboard.read",), "operations": ("loads.read", "dispatch.read"),
    "financial": FINANCE, "fleet": ("drivers.read", "equipment.read"), "calendar": ("dashboard.read",)}
TAB_LABEL = {"overview": "Overview", "operations": "Operations", "financial": "Financial", "fleet": "Fleet & drivers",
             "calendar": "Calendar"}
OPS_ROLES = ("owner", "admin", "dispatcher", "fleet_manager", "safety_manager")
SHARE_KEY = "dashboard.share"


def tabs_for(p: Principal) -> list[str]:
    """The dashboard tabs a role opens. Accounting works from Overview, Financial and Calendar."""
    out = []
    for tab, needs in TAB_NEEDS.items():
        if tab in ("operations", "fleet") and p.role == "accountant":
            continue
        if all(p.can(x) for x in needs):
            out.append(tab)
    return out


class ShareIn(BaseModel):
    frequency: Literal["daily", "weekly", "monthly"]
    send_at: Literal["06:30", "07:00", "07:30", "08:00", "08:30", "09:00"]
    recipients: Literal["me", "ops", "everyone"]
    tabs: list[Literal["overview", "operations", "financial", "fleet", "calendar"]] = Field(min_length=1)
    now: bool = Field(default=False, description="Send it now as well as saving the schedule")


class ShareOut(BaseModel):
    saved: bool
    sent_to: list[str]


def _people(db: Session, p: Principal, who: str) -> list[tuple[uuid.UUID, str, str, str]]:
    from app.modules.organizations.models import Membership, User
    stmt = (select(User.id, User.full_name, User.email, Membership.role).join(Membership, Membership.user_id == User.id)
            .where(Membership.active.is_(True), Membership.role.notin_(("driver", "customer", "owner_portal"))))
    if who == "me":
        stmt = stmt.where(User.id == p.user_id)
    elif who == "ops":
        stmt = stmt.where(or_(Membership.role.in_(OPS_ROLES), User.id == p.user_id))
    return list(db.execute(stmt.order_by(User.full_name)).all())


def digest(db: Session, p: Principal, tabs: list[str]) -> str:
    """The summary one person gets: only the tabs their role opens."""
    lines = []
    allowed = [t for t in tabs if t in tabs_for(p)]
    if "overview" in allowed and p.can("loads.read"):
        d = day(db, p)
        lines.append(f"Overview: {d.summary}." + (f" Operations score {d.score}/100." if d.score is not None else ""))
    if "operations" in allowed:
        o = operations(db, p)
        lines.append("Operations: " + " · ".join(f"{t.label} {t.count}" for t in o.tiles) + "."
                     + (f" On time, last 5 weeks: {o.on_time.pct}%." if o.on_time.pct is not None else ""))
    if "financial" in allowed:
        f = financial(db, p, 4)
        tile = f.tiles[0]
        lines.append(f"Financial: revenue this month ${tile.value:,.0f} ({tile.change_text}). "
                     f"Customers owe ${f.aging_total:,.0f}.")
    if "fleet" in allowed:
        fl = fleet(db, p)
        lines.append("Fleet & drivers: " + " · ".join(
            f"{s.label} {'—' if s.value is None else f'{s.value} {s.unit}'}" for s in fl.stats) + ".")
    if "calendar" in allowed:
        c = calendar(db, p, p.today(), p.today() + timedelta(days=6))
        lines.append(f"Calendar: {len(c.events)} things in the next 7 days.")
    return "\n".join(lines) or "Nothing in this summary is open to your role."


def send_digest(db: Session, p: Principal, settings: dict[str, Any]) -> list[str]:
    from app.core import mail
    from app.core.permissions import permissions_for
    sent = []
    for user_id, name, email, role in _people(db, p, settings["recipients"]):
        them = Principal(user_id=user_id, org_id=p.org_id, role=role, full_name=name, email=email, timezone=p.timezone,
                         currency=p.currency, org_name=p.org_name, org_slug=p.org_slug,
                         granted=frozenset(permissions_for(role)))
        body = digest(db, them, settings["tabs"])
        mail.send(email, f"{p.org_name or 'FlyFleet'} dashboard · {p.today():%a %b} {p.today().day}",
                  f"Hello {name.split(' ')[0]},\n\n{body}\n\nOpen the dashboard in FlyFleet for the details.")
        sent.append(name)
    return sent


@router.post("/dashboard/share", response_model=ShareOut)
def share_dashboard(body: ShareIn, p: Principal = Depends(require("dashboard.read")), db: Session = Depends(get_db)):
    """Save when the dashboard is emailed and to whom; with `now`, send it at once. Each person gets only the tabs
    their own role opens."""
    from sqlalchemy.dialects.postgresql import insert

    from app.core.audit import audit
    from app.modules.organizations.models import UserPreference
    if body.recipients != "me" and not p.can("users.manage") and p.role not in ("owner", "admin"):
        raise Forbidden("Only a Main Admin or Administrator can send the dashboard to others")
    settings = body.model_dump(exclude={"now"})
    stmt = insert(UserPreference).values(organization_id=p.org_id, user_id=p.user_id, key=SHARE_KEY, value=settings)
    db.execute(stmt.on_conflict_do_update(index_elements=["organization_id", "user_id", "key"],
                                          set_={"value": stmt.excluded.value}))
    sent = send_digest(db, p, settings) if body.now else []
    audit(db, p, "dashboard.shared", "dashboard", None, {**settings, "sent": len(sent)})
    db.commit()
    return ShareOut(saved=True, sent_to=sent)


def send_scheduled(db: Session, p: Principal, now: datetime | None = None) -> int:
    """For the scheduled runner: each saved dashboard schedule that is due, once per day."""
    from sqlalchemy.dialects.postgresql import insert

    from app.modules.organizations.models import Membership, User, UserPreference
    now = now or datetime.now(UTC)
    local = now.astimezone(ZoneInfo(p.timezone))
    count = 0
    saved = db.execute(select(UserPreference.user_id, UserPreference.value).where(UserPreference.key == SHARE_KEY))
    for user_id, value in saved.all():
        if not isinstance(value, dict) or f"{local:%H:%M}" < value.get("send_at", "99"):
            continue
        if value.get("frequency") == "weekly" and local.weekday() != 0:
            continue
        if value.get("frequency") == "monthly" and local.day != 1:
            continue
        key = f"{SHARE_KEY}.sent_on"
        last = db.scalar(select(UserPreference.value).where(UserPreference.user_id == user_id, UserPreference.key == key))
        if last == local.date().isoformat():
            continue
        row = db.execute(select(User.full_name, User.email, Membership.role).join(Membership, Membership.user_id == User.id)
                         .where(User.id == user_id, Membership.active.is_(True))).first()
        if row is None:
            continue
        from app.core.permissions import permissions_for
        sender = Principal(user_id=user_id, org_id=p.org_id, role=row.role, full_name=row.full_name, email=row.email,
                           timezone=p.timezone, currency=p.currency, org_name=p.org_name,
                           granted=frozenset(permissions_for(row.role)))
        send_digest(db, sender, value)
        stmt = insert(UserPreference).values(organization_id=p.org_id, user_id=user_id, key=key, value=local.date().isoformat())
        db.execute(stmt.on_conflict_do_update(index_elements=["organization_id", "user_id", "key"],
                                              set_={"value": stmt.excluded.value}))
        count += 1
    db.flush()
    return count
