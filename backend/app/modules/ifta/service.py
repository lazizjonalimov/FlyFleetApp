"""Fuel tax (IFTA): miles by truck and jurisdiction, fuel bought by jurisdiction, and the quarterly return.

    fleet MPG        = total miles / total gallons
    taxable gallons  = taxable miles in a jurisdiction / fleet MPG
    net gallons      = taxable gallons - tax-paid gallons bought there
    tax              = net gallons x rate (+ taxable gallons x surcharge, where there is one)

A negative net is a credit, which offsets what is due in other jurisdictions on the same return. The return is
worked out live while the quarter's miles and fuel are collected; once approved its lines are fixed with the rates
used, so later changes to miles, fuel or rates don't change a return that has been approved or filed.
"""
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.deps import Principal
from app.core.errors import Conflict, Invalid
from app.core.states import ALL, code_of
from app.modules.dispatch.models import DispatchAssignment
from app.modules.documents.models import Document, DocumentLink
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Vehicle
from app.modules.expenses.models import Expense
from app.modules.fleet.models import UnitAssignment
from app.modules.ifta.models import IftaRate, IftaReturn, IftaTrip, IftaTripMiles
from app.modules.loads.models import Load
from app.modules.organizations.models import Organization

ZERO = Decimal("0")
STEPS = ("collecting", "in_review", "approved", "filed", "paid")


# ---------------------------------------------------------------- quarters
def quarter_of(day: date) -> str:
    return f"{day.year}Q{(day.month - 1) // 3 + 1}"


def parse(quarter: str) -> tuple[int, int]:
    if len(quarter) != 6 or quarter[4] != "Q" or not quarter[:4].isdigit() or quarter[5] not in "1234":
        raise Invalid("A quarter is written like 2026Q4", field="quarter")
    return int(quarter[:4]), int(quarter[5])


def bounds(quarter: str) -> tuple[date, date]:
    year, q = parse(quarter)
    start = date(year, 3 * (q - 1) + 1, 1)
    end = date(year + (q == 4), (3 * q) % 12 + 1, 1) - timedelta(days=1)
    return start, end


def previous(quarter: str) -> str:
    year, q = parse(quarter)
    return f"{year - 1}Q4" if q == 1 else f"{year}Q{q - 1}"


def due_date(quarter: str) -> date:
    """The last day of the month after the quarter ends."""
    end = bounds(quarter)[1]
    month_after = date(end.year + (end.month == 12), end.month % 12 + 1, 1)
    return date(month_after.year + (month_after.month == 12), month_after.month % 12 + 1, 1) - timedelta(days=1)


def label(quarter: str) -> str:
    year, q = parse(quarter)
    return f"Q{q} {year}"


def base_of(db: Session, p: Principal) -> str | None:
    org = db.get(Organization, p.org_id)
    return code_of(org.state) if org else None


# ---------------------------------------------------------------- miles and fuel
@dataclass
class Collected:
    miles: dict[tuple[uuid.UUID, str], Decimal] = field(default_factory=lambda: defaultdict(lambda: ZERO))
    sources: dict[uuid.UUID, set[str]] = field(default_factory=lambda: defaultdict(set))
    held: list[IftaTrip] = field(default_factory=list)
    trips: list[IftaTrip] = field(default_factory=list)
    gallons_by_state: dict[str, Decimal] = field(default_factory=lambda: defaultdict(lambda: ZERO))
    gallons_by_truck: dict[uuid.UUID, Decimal] = field(default_factory=lambda: defaultdict(lambda: ZERO))
    amount: Decimal = ZERO
    purchases: int = 0

    @property
    def total_miles(self) -> Decimal:
        return sum(self.miles.values(), ZERO)

    @property
    def total_gallons(self) -> Decimal:
        return sum(self.gallons_by_state.values(), ZERO)

    def miles_by_state(self) -> dict[str, Decimal]:
        out: dict[str, Decimal] = defaultdict(lambda: ZERO)
        for (_, j), m in self.miles.items():
            out[j] += m
        return out


def collect(db: Session, quarter: str) -> Collected:
    start, end = bounds(quarter)
    c = Collected()
    trips = list(db.scalars(select(IftaTrip).where(IftaTrip.trip_date >= start, IftaTrip.trip_date <= end)))
    c.trips = trips
    if trips:
        by_id = {t.id: t for t in trips}
        for row in db.scalars(select(IftaTripMiles).where(IftaTripMiles.trip_id.in_(list(by_id)))):
            trip = by_id[row.trip_id]
            c.miles[(trip.vehicle_id, row.jurisdiction)] += row.miles
            c.sources[trip.vehicle_id].add(trip.source)
        c.held = [t for t in trips if t.held]
    fuel = (Expense.category == "fuel") & (Expense.incurred_on >= start) & (Expense.incurred_on <= end)
    for e in db.scalars(select(Expense).where(fuel)):
        gallons = e.gallons or ZERO
        if e.jurisdiction:
            c.gallons_by_state[e.jurisdiction] += gallons
        if e.vehicle_id:
            c.gallons_by_truck[e.vehicle_id] += gallons
        c.amount += e.amount
        c.purchases += 1
    return c


def rates_for(db: Session, quarter: str) -> dict[str, IftaRate]:
    return {r.jurisdiction: r for r in db.scalars(select(IftaRate).where(IftaRate.quarter == quarter,
                                                                          IftaRate.fuel_type == "diesel"))}


def compute(db: Session, quarter: str) -> tuple[list[dict], dict]:
    """The return's lines by jurisdiction, and its totals, from what has been collected so far."""
    c = collect(db, quarter)
    rates = rates_for(db, quarter)
    miles = c.miles_by_state()
    total_miles, total_gallons = c.total_miles, c.total_gallons
    mpg = (total_miles / total_gallons) if total_gallons else None
    lines = []
    for j in sorted(set(miles) | set(c.gallons_by_state), key=lambda x: -(miles.get(x, ZERO))):
        m = miles.get(j, ZERO)
        taxable = (m / mpg).quantize(Decimal("1")) if mpg else ZERO
        paid = c.gallons_by_state.get(j, ZERO).quantize(Decimal("1"))
        net = taxable - paid
        rate = rates.get(j)
        tax = None
        if rate is not None:
            tax = (net * rate.rate + taxable * rate.surcharge).quantize(Decimal("0.01"))
        lines.append({"jurisdiction": j, "name": ALL.get(j, j), "total_miles": str(m), "taxable_miles": str(m),
                      "taxable_gallons": str(taxable), "tax_paid_gallons": str(paid), "net_gallons": str(net),
                      "rate": str(rate.rate) if rate else None, "surcharge": str(rate.surcharge) if rate else None,
                      "tax": str(tax) if tax is not None else None})
    known = [Decimal(x["tax"]) for x in lines if x["tax"] is not None]
    totals = {
        "total_miles": str(total_miles), "total_gallons": str(total_gallons.quantize(Decimal("0.001"))),
        "mpg": str(mpg.quantize(Decimal("0.01"))) if mpg else None,
        "net_tax": str(sum(known, ZERO).quantize(Decimal("0.01"))),
        "missing_rates": [x["jurisdiction"] for x in lines if x["tax"] is None],
        "held_trips": len(c.held), "amount": str(c.amount), "purchases": c.purchases,
        "trucks": len({v for (v, _) in c.miles} | set(c.gallons_by_truck)),
        "sources": sorted({s for v in c.sources.values() for s in v}),
    }
    return lines, totals


def get_return(db: Session, quarter: str, *, lock: bool = False) -> IftaReturn | None:
    stmt = select(IftaReturn).where(IftaReturn.quarter == quarter)
    if lock:
        stmt = stmt.with_for_update()
    return db.scalar(stmt)


def view(db: Session, p: Principal, quarter: str) -> dict:
    """The return as the screen shows it: fixed lines once approved, live ones before."""
    r = get_return(db, quarter)
    if r is not None and r.lines is not None:
        lines = r.lines
        _, live = compute(db, quarter)
        totals = {**live, "total_miles": str(r.total_miles), "total_gallons": str(r.total_gallons),
                  "net_tax": str(r.net_tax), "mpg": str((r.total_miles / r.total_gallons).quantize(Decimal("0.01")))
                  if r.total_gallons else None, "missing_rates": []}
    else:
        lines, totals = compute(db, quarter)
    start, end = bounds(quarter)
    status = r.status if r else "collecting"
    return {"quarter": quarter, "label": label(quarter), "status": status, "estimate": r is None or r.lines is None,
            "period_start": start, "period_end": end, "due_on": due_date(quarter),
            "base": (r.base_jurisdiction if r and r.base_jurisdiction else base_of(db, p)), "lines": lines, **totals,
            "version": r.version if r else 0, "filed_on": r.filed_on if r else None,
            "filed_reference": r.filed_reference if r else None, "paid_on": r.paid_on if r else None,
            "reviewed_at": r.reviewed_at if r else None, "approved_at": r.approved_at if r else None,
            "reviewed_by": r.reviewed_by if r else None, "approved_by": r.approved_by if r else None}


def transition(db: Session, p: Principal, quarter: str, action: str, version: int, *, filed_on: date | None = None,
               reference: str | None = None, paid_on: date | None = None, note: str | None = None) -> IftaReturn:
    r = get_return(db, quarter, lock=True)
    if r is None:
        r = IftaReturn(organization_id=p.org_id, quarter=quarter, status="collecting", base_jurisdiction=base_of(db, p))
        db.add(r)
        db.flush()
    elif r.version != version:
        raise Conflict("Someone else changed this return while you were working. Review the latest figures and try "
                       "again.", code="VERSION_CONFLICT", details={"current_version": r.version})
    start, end = bounds(quarter)
    if action == "review":
        if r.status != "collecting":
            raise Conflict("The return is already past collecting", code="WRONG_STATUS")
        if p.today() <= end:
            raise Conflict(f"The quarter runs to {end:%b} {end.day}. Review starts once it is over.", code="QUARTER_OPEN")
        r.status, r.reviewed_by, r.reviewed_at = "in_review", p.user_id, datetime.now(UTC)
    elif action == "approve":
        if r.status != "in_review":
            raise Conflict("Review the return before approving it", code="WRONG_STATUS")
        lines, totals = compute(db, quarter)
        if totals["held_trips"]:
            raise Conflict(f"{totals['held_trips']} imported trips are held for review. Release or remove them first.",
                           code="HELD_MILES")
        if totals["missing_rates"]:
            raise Conflict(f"Add this quarter's rates for {', '.join(totals['missing_rates'])} first",
                           code="MISSING_RATES")
        if not r.base_jurisdiction:
            r.base_jurisdiction = base_of(db, p)
        if not r.base_jurisdiction:
            raise Conflict("Set the company's state (the base jurisdiction) in Settings first", code="NO_BASE")
        r.lines, r.total_miles = lines, Decimal(totals["total_miles"])
        r.total_gallons, r.net_tax = Decimal(totals["total_gallons"]), Decimal(totals["net_tax"])
        r.status, r.approved_by, r.approved_at = "approved", p.user_id, datetime.now(UTC)
    elif action == "reopen":
        if r.status not in ("in_review", "approved"):
            raise Conflict("Only a return that isn't filed can be reopened", code="WRONG_STATUS")
        r.status, r.lines, r.approved_by, r.approved_at = "in_review", None, None, None
    elif action == "file":
        if r.status != "approved":
            raise Conflict("Approve the return before filing it", code="WRONG_STATUS")
        r.status, r.filed_on, r.filed_reference = "filed", filed_on or p.today(), (reference or "").strip() or None
    elif action == "pay":
        if r.status != "filed":
            raise Conflict("File the return before recording the payment", code="WRONG_STATUS")
        r.status, r.paid_on = "paid", paid_on or p.today()
    else:
        raise Invalid("Unknown action", field="action")
    if note:
        r.note = note.strip()
    r.version += 1
    audit(db, p, f"ifta_return.{action}", "ifta_return", r.id, {"quarter": quarter, "status": r.status,
                                                               "net_tax": str(r.net_tax) if r.net_tax is not None else None})
    return r


# ---------------------------------------------------------------- trips
def add_trip(db: Session, p: Principal, *, vehicle_id: uuid.UUID, trip_date: date, miles: list[tuple[str, Decimal]],
             source: str = "manual", load_id: uuid.UUID | None = None, odometer_start: int | None = None,
             odometer_end: int | None = None, held: bool = False, note: str | None = None,
             import_id: uuid.UUID | None = None) -> IftaTrip:
    if db.get(Vehicle, vehicle_id) is None:
        raise Invalid("Truck not found", field="vehicle_id")
    if load_id and db.get(Load, load_id) is None:
        raise Invalid("Load not found", field="load_id")
    if trip_date > p.today():
        raise Invalid("A trip can't be in the future", field="trip_date")
    clean = []
    for j, m in miles:
        code = code_of(j)
        if not code:
            raise Invalid(f"“{j}” isn't a US state or Canadian province", field="miles")
        if m <= 0:
            continue
        clean.append((code, m))
    if not clean:
        raise Invalid("Enter the miles in at least one state", field="miles")
    total = sum((m for _, m in clean), ZERO)
    if odometer_start is not None and odometer_end is not None:
        if odometer_end < odometer_start:
            raise Invalid("The end reading is below the start", field="odometer_end")
        driven = Decimal(odometer_end - odometer_start)
        if abs(driven - total) > max(Decimal("2"), driven * Decimal("0.02")):
            raise Invalid(f"The odometer shows {driven:,.0f} miles but the states add up to {total:,.1f}",
                          field="odometer_end")
    r = get_return(db, quarter_of(trip_date))
    if r is not None and r.status in ("approved", "filed", "paid"):
        raise Conflict(f"The {label(quarter_of(trip_date))} return is {r.status}. Reopen it first.", code="RETURN_LOCKED")
    trip = IftaTrip(organization_id=p.org_id, vehicle_id=vehicle_id, trip_date=trip_date, load_id=load_id, source=source,
                    odometer_start=odometer_start, odometer_end=odometer_end, held=held, note=note, import_id=import_id,
                    created_by=p.user_id)
    db.add(trip)
    db.flush()
    for code, m in clean:
        db.add(IftaTripMiles(organization_id=p.org_id, trip_id=trip.id, jurisdiction=code, miles=m))
    return trip


# ---------------------------------------------------------------- purchases
def purchase_checks(db: Session, expenses: list[Expense]) -> dict[uuid.UUID, tuple[str, str, uuid.UUID | None]]:
    """What each purchase needs, as (tone, label, load id): matched to the load the truck was on, or a flag."""
    out: dict[uuid.UUID, tuple[str, str, uuid.UUID | None]] = {}
    trucks = {e.vehicle_id for e in expenses if e.vehicle_id}
    vehicles = {v.id: v for v in db.scalars(select(Vehicle).where(Vehicle.id.in_(trucks)))} if trucks else {}
    days = [e.incurred_on for e in expenses]
    loads: dict[uuid.UUID, list[tuple[date, date, str, uuid.UUID]]] = defaultdict(list)
    if trucks and days:
        lo, hi = min(days) - timedelta(days=5), max(days) + timedelta(days=1)
        rows = db.execute(select(DispatchAssignment.vehicle_id, Load.id, Load.load_number, Load.pickup_at,
                                 Load.delivered_at, Load.delivery_at)
                          .join(Load, Load.id == DispatchAssignment.load_id)
                          .where(DispatchAssignment.vehicle_id.in_(trucks),
                                 DispatchAssignment.status.in_(("active", "completed")),
                                 Load.pickup_at <= datetime.combine(hi, datetime.min.time(), UTC),
                                 or_(Load.delivered_at.is_(None),
                                     Load.delivered_at >= datetime.combine(lo, datetime.min.time(), UTC)))).all()
        for vehicle_id, load_id, number, pickup, delivered, delivery in rows:
            start = pickup.date() if pickup else lo
            end = (delivered or delivery or datetime.combine(hi, datetime.min.time(), UTC)).date()
            loads[vehicle_id].append((start, end, number, load_id))
    receipts = set(db.scalars(select(DocumentLink.entity_id).join(Document, Document.id == DocumentLink.document_id)
                              .where(DocumentLink.entity_type == "expense", Document.type == "receipt",
                                     Document.review_status == "pending",
                                     DocumentLink.entity_id.in_([e.id for e in expenses])))) if expenses else set()
    seen: dict[tuple, uuid.UUID] = {}
    for e in sorted(expenses, key=lambda x: x.created_at):
        key = (e.vehicle_id, e.incurred_on, e.amount)
        duplicate = e.vehicle_id is not None and key in seen
        seen.setdefault(key, e.id)
        v = vehicles.get(e.vehicle_id) if e.vehicle_id else None
        if e.category != "fuel":
            out[e.id] = ("warn", "Non-fuel items", None)
        elif duplicate:
            out[e.id] = ("warn", "Possible duplicate", None)
        elif v is not None and v.fuel_capacity_gal and e.gallons and e.gallons > v.fuel_capacity_gal:
            out[e.id] = ("bad", "Over tank capacity", None)
        elif e.id in receipts:
            out[e.id] = ("info", "Receipt · needs review", None)
        elif not e.vehicle_id:
            out[e.id] = ("warn", "No truck", None)
        elif not e.jurisdiction:
            out[e.id] = ("warn", "No state", None)
        else:
            match = next(((n, lid) for s, end, n, lid in loads.get(e.vehicle_id, []) if s <= e.incurred_on <= end), None)
            out[e.id] = ("ok", f"Matched · {match[0]}", match[1]) if match else ("mu", "Between loads", None)
    return out


def seat_drivers(db: Session, vehicle_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not vehicle_ids:
        return {}
    rows = db.execute(select(UnitAssignment.vehicle_id, Driver.first_name, Driver.last_name)
                      .join(Driver, Driver.id == UnitAssignment.driver_id)
                      .where(UnitAssignment.vehicle_id.in_(vehicle_ids), UnitAssignment.effective_to.is_(None))).all()
    return {v: f"{f} {last}" for v, f, last in rows}


def mileage(db: Session, quarter: str) -> dict:
    """Miles by truck and jurisdiction, each truck's MPG, where its miles came from, and the gaps to review."""
    c = collect(db, quarter)
    vehicle_ids = list({v for (v, _) in c.miles} | set(c.gallons_by_truck))
    vehicles = {v.id: v for v in db.scalars(select(Vehicle).where(Vehicle.id.in_(vehicle_ids)))} if vehicle_ids else {}
    drivers = seat_drivers(db, vehicle_ids)
    by_state = c.miles_by_state()
    states = [j for j, _ in sorted(by_state.items(), key=lambda kv: -kv[1])]
    rows, gaps = [], []
    for vid in sorted(vehicle_ids, key=lambda x: vehicles[x].unit_number if x in vehicles else ""):
        v = vehicles.get(vid)
        miles = {j: str(c.miles.get((vid, j), ZERO)) for j in states if c.miles.get((vid, j))}
        total = sum((c.miles.get((vid, j), ZERO) for j in states), ZERO)
        gallons = c.gallons_by_truck.get(vid, ZERO)
        held = [t for t in c.held if t.vehicle_id == vid]
        rows.append({"vehicle_id": vid, "unit_number": v.unit_number if v else "", "driver": drivers.get(vid),
                     "miles": miles, "total": str(total), "gallons": str(gallons),
                     "mpg": str((total / gallons).quantize(Decimal("0.1"))) if gallons and total else None,
                     "sources": sorted(c.sources.get(vid, set())), "held": len(held)})
        if gallons and not total:
            gaps.append({"vehicle_id": vid, "unit_number": v.unit_number if v else "", "kind": "no_miles",
                         "title": f"{v.unit_number if v else 'A truck'} bought fuel but has no miles",
                         "detail": f"{gallons:,.1f} gal this quarter. Import its miles or add its trips."})
        for t in held:
            gaps.append({"vehicle_id": vid, "unit_number": v.unit_number if v else "", "kind": "held", "trip_id": t.id,
                         "title": f"{v.unit_number if v else 'A truck'} · {t.trip_date:%b} {t.trip_date.day} held for review",
                         "detail": t.note or "Imported miles held until someone checks them."})
    return {"quarter": quarter, "states": states, "rows": rows, "gaps": gaps,
            "totals": {j: str(by_state[j]) for j in states}, "total": str(c.total_miles)}


def receipts(db: Session, limit: int = 8) -> list[dict]:
    docs = list(db.scalars(select(Document).where(Document.type == "receipt", Document.upload_status == "uploaded")
                           .order_by(Document.created_at.desc()).limit(limit)))
    links = defaultdict(list)
    for link in db.scalars(select(DocumentLink).where(DocumentLink.document_id.in_([d.id for d in docs]))):
        links[link.document_id].append(link)
    out = []
    for d in docs:
        on_expense = [x for x in links[d.id] if x.entity_type == "expense"]
        status = ("Matched", "ok") if on_expense else ("Review", "info")
        out.append({"document_id": d.id, "filename": d.filename, "created_at": d.created_at, "status": status[0],
                    "tone": status[1], "expense_id": on_expense[0].entity_id if on_expense else None})
    return out


def rates_view(db: Session, quarter: str) -> list[dict]:
    now, before = rates_for(db, quarter), rates_for(db, previous(quarter))
    miles = collect(db, quarter).miles_by_state()
    out = []
    for j in sorted(set(now) | set(miles), key=lambda x: (-(miles.get(x, ZERO)), x)):
        r, prev = now.get(j), before.get(j)
        change = None
        if r is not None and prev is not None:
            change = str((r.rate - prev.rate).quantize(Decimal("0.0001")))
        out.append({"jurisdiction": j, "name": ALL.get(j, j), "rate": str(r.rate) if r else None,
                    "surcharge": str(r.surcharge) if r else None, "change": change,
                    "miles": str(miles.get(j, ZERO)), "source": r.source if r else None,
                    "updated_at": r.updated_at if r else None})
    return out


def set_rates(db: Session, p: Principal, quarter: str, rows: list[tuple[str, Decimal, Decimal]], source: str) -> int:
    parse(quarter)
    r = get_return(db, quarter)
    if r is not None and r.status in ("approved", "filed", "paid"):
        raise Conflict(f"The {label(quarter)} return is {r.status}; it keeps the rates it was approved with.",
                       code="RETURN_LOCKED")
    existing = {x.jurisdiction: x for x in db.scalars(select(IftaRate).where(IftaRate.quarter == quarter,
                                                                              IftaRate.fuel_type == "diesel"))}
    for j, rate, surcharge in rows:
        code = code_of(j)
        if not code:
            raise Invalid(f"“{j}” isn't a US state or Canadian province", field="rates")
        if rate < 0 or rate > 5 or surcharge < 0 or surcharge > 5:
            raise Invalid(f"The rate for {code} doesn't look like dollars per gallon", field="rates")
        row = existing.get(code)
        if row is None:
            db.add(IftaRate(organization_id=p.org_id, quarter=quarter, jurisdiction=code, rate=rate, surcharge=surcharge,
                            source=source, updated_by=p.user_id))
        else:
            row.rate, row.surcharge, row.source, row.updated_by = rate, surcharge, source, p.user_id
    audit(db, p, "ifta.rates_set", "ifta_rate", None, {"quarter": quarter, "count": len(rows), "source": source})
    return len(rows)


# ---------------------------------------------------------------- the fuel report
def weekly(db: Session, p: Principal, weeks: int = 8) -> dict:
    """Fuel cost per mile and the diesel price by week, and MPG by truck against the fleet average."""
    today = p.today()
    monday = today - timedelta(days=today.weekday())
    out = []
    for i in range(weeks - 1, -1, -1):
        start = monday - timedelta(days=7 * i)
        end = start + timedelta(days=6)
        amount, gallons = db.execute(select(func.coalesce(func.sum(Expense.amount), 0),
                                            func.coalesce(func.sum(Expense.gallons), 0))
                                     .where(Expense.category == "fuel", Expense.incurred_on >= start,
                                            Expense.incurred_on <= end)).one()
        miles = db.scalar(select(func.coalesce(func.sum(IftaTripMiles.miles), 0))
                          .join(IftaTrip, IftaTrip.id == IftaTripMiles.trip_id)
                          .where(IftaTrip.trip_date >= start, IftaTrip.trip_date <= end)) or ZERO
        amount, gallons, miles = Decimal(amount), Decimal(gallons), Decimal(miles)
        out.append({"week_start": start, "amount": str(amount), "gallons": str(gallons), "miles": str(miles),
                    "cost_per_mile": str((amount / miles).quantize(Decimal("0.001"))) if miles else None,
                    "price_per_gallon": str((amount / gallons).quantize(Decimal("0.001"))) if gallons else None,
                    "mpg": str((miles / gallons).quantize(Decimal("0.01"))) if gallons and miles else None})
    q = quarter_of(today)
    m = mileage(db, q)
    _, totals = compute(db, q)
    return {"weeks": out, "trucks": [{"unit_number": r["unit_number"], "driver": r["driver"], "mpg": r["mpg"]}
                                     for r in m["rows"] if r["mpg"]],
            "fleet_mpg": totals["mpg"], "quarter": q, "amount": totals["amount"], "gallons": totals["total_gallons"],
            "net_tax": totals["net_tax"], "miles": totals["total_miles"]}
