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
    audit(db, p, f"ifta_return.{action}", "ifta_return", r.id, {
        "quarter": quarter, "status": r.status, "net_tax": str(r.net_tax) if r.net_tax is not None else None,
        **({"reference": r.filed_reference} if action == "file" and r.filed_reference else {})})
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


PAID = {"fuel_card": "Fuel card", "company_card": "Company card", "cash": "Cash", "check": "Check", "ach": "ACH",
        "driver": "Driver paid"}


def receipts(db: Session, limit: int = 6) -> list[dict]:
    """Scanned receipts, newest first: saved as a purchase (and whether someone still has to check it), or waiting
    to be read and saved."""
    docs = list(db.scalars(select(Document).where(Document.type == "receipt", Document.upload_status == "uploaded")
                           .order_by(Document.created_at.desc()).limit(limit)))
    links = defaultdict(list)
    for link in db.scalars(select(DocumentLink).where(DocumentLink.document_id.in_([d.id for d in docs]))):
        links[link.document_id].append(link)
    expense_ids = [x.entity_id for d in docs for x in links[d.id] if x.entity_type == "expense"]
    expenses = {e.id: e for e in db.scalars(select(Expense).where(Expense.id.in_(expense_ids)))} if expense_ids else {}
    drivers = {d.id: f"{d.first_name} {d.last_name}" for d in db.scalars(select(Driver).where(Driver.id.in_(
        [e.driver_id for e in expenses.values() if e.driver_id])))} if expenses else {}
    out = []
    for d in docs:
        e = next((expenses[x.entity_id] for x in links[d.id] if x.entity_type == "expense" and x.entity_id in expenses),
                 None)
        if e is None:
            out.append({"document_id": d.id, "title": d.filename, "detail": f"Uploaded {d.created_at:%b} {d.created_at.day}"
                        " · not saved as a purchase yet", "created_at": d.created_at, "status": "Review", "tone": "info",
                        "expense_id": None, "filename": d.filename})
            continue
        where = " · ".join(x for x in (e.vendor, e.jurisdiction) if x) or d.filename
        detail = " · ".join(x for x in (PAID.get(e.paid_with or "", ""), drivers.get(e.driver_id) if e.driver_id else "",
                                         f"{e.incurred_on:%b} {e.incurred_on.day}", f"${e.amount:,.2f}") if x)
        pending = d.review_status == "pending"
        out.append({"document_id": d.id, "title": where, "detail": detail, "created_at": d.created_at,
                    "status": "Review" if pending else "Matched", "tone": "info" if pending else "ok",
                    "expense_id": e.id, "filename": d.filename})
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
def weekly(db: Session, p: Principal, weeks: int = 8, vehicle_id: uuid.UUID | None = None) -> dict:
    """Fuel cost per mile and the diesel price by week, MPG by truck against the fleet average, and the quarter
    against the one before it. With a truck, the weeks are that truck's."""
    today = p.today()
    monday = today - timedelta(days=today.weekday())
    out = []
    for i in range(weeks - 1, -1, -1):
        start = monday - timedelta(days=7 * i)
        end = start + timedelta(days=6)
        fuel = select(func.coalesce(func.sum(Expense.amount), 0), func.coalesce(func.sum(Expense.gallons), 0)) \
            .where(Expense.category == "fuel", Expense.incurred_on >= start, Expense.incurred_on <= end)
        driven = select(func.coalesce(func.sum(IftaTripMiles.miles), 0)).join(IftaTrip, IftaTrip.id == IftaTripMiles.trip_id) \
            .where(IftaTrip.trip_date >= start, IftaTrip.trip_date <= end)
        if vehicle_id:
            fuel = fuel.where(Expense.vehicle_id == vehicle_id)
            driven = driven.where(IftaTrip.vehicle_id == vehicle_id)
        amount, gallons = db.execute(fuel).one()
        miles = db.scalar(driven) or ZERO
        amount, gallons, miles = Decimal(amount), Decimal(gallons), Decimal(miles)
        out.append({"week_start": start, "amount": str(amount), "gallons": str(gallons), "miles": str(miles),
                    "cost_per_mile": str((amount / miles).quantize(Decimal("0.001"))) if miles else None,
                    "price_per_gallon": str((amount / gallons).quantize(Decimal("0.001"))) if gallons else None,
                    "mpg": str((miles / gallons).quantize(Decimal("0.01"))) if gallons and miles else None})
    q = quarter_of(today)
    m = mileage(db, q)
    lines, totals = compute(db, q)
    _, before = compute(db, previous(q))

    def per_mile(t: dict) -> str | None:
        miles = Decimal(t["total_miles"])
        return str((Decimal(t["amount"]) / miles).quantize(Decimal("0.001"))) if miles else None

    base = base_of(db, p)
    base_line = next((x for x in lines if x["jurisdiction"] == base), None)
    return {"weeks": out, "trucks": [{"vehicle_id": r["vehicle_id"], "unit_number": r["unit_number"], "driver": r["driver"],
                                      "mpg": r["mpg"], "miles": r["total"], "gallons": r["gallons"]}
                                     for r in m["rows"] if r["mpg"]],
            "fleet_mpg": totals["mpg"], "quarter": q, "amount": totals["amount"], "gallons": totals["total_gallons"],
            "net_tax": totals["net_tax"], "miles": totals["total_miles"], "cost_per_mile": per_mile(totals),
            "previous_cost_per_mile": per_mile(before), "previous_mpg": before["mpg"], "base": base,
            "base_tax": base_line["tax"] if base_line else None, "missing_rates": totals["missing_rates"]}


# ---------------------------------------------------------------- where the miles came from, and the return's history
def _names(db: Session, ids: set) -> dict:
    from app.modules.organizations.models import User
    ids = {x for x in ids if x}
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all()) if ids else {}


def _miles_by_trip(db: Session, trip_ids: list[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
    if not trip_ids:
        return {}
    return {t: Decimal(m) for t, m in db.execute(select(IftaTripMiles.trip_id, func.sum(IftaTripMiles.miles))
                                                 .where(IftaTripMiles.trip_id.in_(trip_ids))
                                                 .group_by(IftaTripMiles.trip_id)).all()}


def sources(db: Session, quarter: str) -> list[dict]:
    """The latest mileage imports, and the trips entered by hand this quarter, truck by truck."""
    from app.modules.intake.models import Import
    start, end = bounds(quarter)
    imports = list(db.scalars(select(Import).where(Import.kind == "mileage").order_by(Import.created_at.desc()).limit(5)))
    trips = list(db.scalars(select(IftaTrip).where(or_(
        IftaTrip.import_id.in_([i.id for i in imports]) if imports else False,
        (IftaTrip.source == "manual") & (IftaTrip.trip_date >= start) & (IftaTrip.trip_date <= end)))))
    miles = _miles_by_trip(db, [t.id for t in trips])
    names = _names(db, {i.created_by for i in imports} | {t.created_by for t in trips})
    units = {v.id: v.unit_number for v in db.scalars(select(Vehicle).where(Vehicle.id.in_({t.vehicle_id for t in trips})))} \
        if trips else {}
    out = []
    for imp in imports:
        mine = [t for t in trips if t.import_id == imp.id]
        total = sum((miles.get(t.id, ZERO) for t in mine), ZERO)
        held = sum(1 for t in mine if t.held)
        who = names.get(imp.created_by, "")
        when = f"{imp.created_at:%b} {imp.created_at.day}"
        if imp.status == "mapping":
            status, tone, detail = "Check", "warn", f"{len(imp.rows)} rows · not imported yet · {who}"
        else:
            status, tone = ("Held", "info") if held else ("Imported", "ok")
            detail = f"{len(mine)} trips · {total:,.0f} mi · {who} · {when}"
        out.append({"kind": "import", "ext": "CSV" if imp.filename.lower().endswith(".csv") else "XLSX",
                    "title": imp.filename, "detail": detail, "status": status, "tone": tone, "import_id": imp.id,
                    "vehicle_id": None, "at": imp.created_at})
    manual: dict[uuid.UUID, list[IftaTrip]] = defaultdict(list)
    for t in trips:
        if t.source == "manual" and start <= t.trip_date <= end:
            manual[t.vehicle_id].append(t)
    for vehicle_id, mine in manual.items():
        last = max(mine, key=lambda t: t.created_at)
        total = sum((miles.get(t.id, ZERO) for t in mine), ZERO)
        out.append({"kind": "manual", "ext": "✎", "title": f"Manual · {units.get(vehicle_id, '')}",
                    "detail": f"{len(mine)} {'trip' if len(mine) == 1 else 'trips'} · {total:,.0f} mi · "
                              f"{names.get(last.created_by, '')} · {last.created_at:%b} {last.created_at.day}",
                    "status": "Manual", "tone": "info", "import_id": None, "vehicle_id": vehicle_id,
                    "at": last.created_at})
    return sorted(out, key=lambda x: x["at"], reverse=True)


HISTORY = {"review": ("started the review", "info"), "approve": ("approved the return", "ok"),
           "reopen": ("reopened the return", "warn"), "file": ("filed the return", "brand"),
           "pay": ("recorded the payment", "ok")}


def history(db: Session, r: IftaReturn | None) -> list[dict]:
    from app.modules.organizations.models import AuditLog
    if r is None:
        return []
    rows = list(db.scalars(select(AuditLog).where(AuditLog.entity_type == "ifta_return", AuditLog.entity_id == r.id)
                           .order_by(AuditLog.created_at)))
    names = _names(db, {x.actor_user_id for x in rows})
    out = []
    for x in rows:
        action = x.action.removeprefix("ifta_return.")
        what, tone = HISTORY.get(action, (action.replace("_", " "), "mu"))
        data = x.data or {}
        if action == "approve" and data.get("net_tax") is not None:
            net = Decimal(data["net_tax"])
            what += f" · {'credit of ' if net < 0 else ''}${abs(net):,.2f}{'' if net < 0 else ' due'}"
        if action == "file" and data.get("reference"):
            what += f" · confirmation {data['reference']}"
        if action == "pay" and data.get("net_tax") is not None:
            net = Decimal(data["net_tax"])
            what = f"carried the credit, ${abs(net):,.2f}" if net < 0 else f"recorded the payment, ${net:,.2f}"
        out.append({"who": names.get(x.actor_user_id, "FlyFleet"), "what": what, "when": x.created_at, "tone": tone})
    return out


# ---------------------------------------------------------------- the return as a PDF
def _money(value: str | None) -> str:
    if value is None:
        return "—"
    d = Decimal(value)
    return f"({abs(d):,.2f})" if d < 0 else f"{d:,.2f}"


def return_pdf(db: Session, p: Principal, quarter: str) -> bytes:
    """The jurisdiction schedule of the return: miles, taxable and tax-paid gallons, rate and tax by state, then
    the miles by truck and state they come from."""
    from app.core import pdf
    v = view(db, p, quarter)
    org = db.get(Organization, p.org_id)
    pages: list[pdf.Page] = [pdf.Page()]
    page = pages[0]
    y = 744.0

    def need(space: float) -> None:
        nonlocal page, y
        if y - space < 60:
            page = pdf.Page()
            pages.append(page)
            y = 744.0

    start, end = v["period_start"], v["period_end"]
    page.text(48, y, "IFTA quarterly fuel tax return", 15, bold=True)
    y -= 18
    page.text(48, y, f"{org.name if org else ''} · {v['label']} · {start:%b} {start.day} – {end:%b} {end.day}, {end.year}",
              9, grey=True)
    y -= 13
    if v["status"] in ("approved", "filed", "paid") and not v["estimate"]:
        state = {"approved": "Approved", "filed": f"Filed {v['filed_on']:%b} {v['filed_on'].day}" if v["filed_on"] else "Filed",
                 "paid": "Paid"}[v["status"]]
    else:
        today = p.today()
        state = f"Estimate as of {today:%b} {today.day}, {today.year}"
    base = ALL.get(v["base"] or "", v["base"] or "not set")
    due = v["due_on"]
    page.text(48, y, f"Base jurisdiction {base} · due {due:%b} {due.day}, {due.year} · {state}", 9, grey=True)
    y -= 28
    for i, (lbl, val) in enumerate((("Total miles", f"{Decimal(v['total_miles']):,.0f}"),
                                    ("Total gallons", f"{Decimal(v['total_gallons']):,.0f}"),
                                    ("Fleet MPG", v["mpg"] or "—"),
                                    ("Net tax (credit)", _money(v["net_tax"])))):
        page.text(48 + i * 130, y, lbl, 8, grey=True)
        page.text(48 + i * 130, y - 15, val, 13, bold=True)
    y -= 44
    cols = (("Jurisdiction", 48, False), ("Total miles", 230, True), ("Taxable miles", 295, True),
            ("Taxable gal", 355, True), ("Tax-paid gal", 415, True), ("Net gal", 463, True), ("Rate", 510, True),
            ("Tax (credit)", 564, True))

    def header() -> None:
        nonlocal y
        for name, x, right in cols:
            page.text(x, y, name, 8, bold=True, right=right)
        y -= 6
        page.rule(48, y, 564)
        y -= 13

    header()
    for line in v["lines"]:
        need(16)
        if y == 744.0:
            header()
        cells = (f"{line['name']} ({line['jurisdiction']})", f"{Decimal(line['total_miles']):,.0f}",
                 f"{Decimal(line['taxable_miles']):,.0f}", f"{Decimal(line['taxable_gallons']):,.0f}",
                 f"{Decimal(line['tax_paid_gallons']):,.0f}", f"{Decimal(line['net_gallons']):,.0f}",
                 f"{Decimal(line['rate']):.4f}" if line["rate"] else "no rate", _money(line["tax"]))
        for (_, x, right), cell in zip(cols, cells, strict=True):
            page.text(x, y, cell, 9, right=right)
        y -= 6
        page.rule(48, y, 564, 0.3)
        y -= 12
    need(30)
    totals = ("Total", f"{Decimal(v['total_miles']):,.0f}", f"{Decimal(v['total_miles']):,.0f}",
              f"{sum(Decimal(x['taxable_gallons']) for x in v['lines']):,.0f}", f"{Decimal(v['total_gallons']):,.0f}", "",
              "", _money(v["net_tax"]))
    for (_, x, right), cell in zip(cols, totals, strict=True):
        page.text(x, y, cell, 9, bold=True, right=right)
    y -= 24
    need(40)
    page.text(48, y, f"Fleet MPG {v['mpg'] or '—'} = total miles ÷ total gallons. Taxable gallons = taxable miles ÷ MPG; "
                     "net = taxable − tax-paid gallons;", 8, grey=True)
    y -= 11
    page.text(48, y, "a negative net is a credit, which offsets what is due in other jurisdictions on the same return.",
              8, grey=True)
    y -= 30
    m = mileage(db, quarter)
    need(60)
    page.text(48, y, "Miles by truck and jurisdiction", 11, bold=True)
    y -= 18
    for name, x, right in (("Truck", 48, False), ("Jurisdiction", 160, False), ("Miles", 330, True),
                           ("Source", 360, False)):
        page.text(x, y, name, 8, bold=True, right=right)
    y -= 6
    page.rule(48, y, 564)
    y -= 13
    for row in m["rows"]:
        for j, miles in row["miles"].items():
            need(16)
            page.text(48, y, row["unit_number"], 9)
            page.text(160, y, f"{ALL.get(j, j)} ({j})", 9)
            page.text(330, y, f"{Decimal(miles):,.1f}", 9, right=True)
            page.text(360, y, ", ".join(s.upper() if s == "gps" else s for s in row["sources"]) or "—", 9)
            y -= 16
    for i, pg in enumerate(pages, 1):
        pg.text(48, 36, f"Prepared with FlyFleet · {v['label']} · page {i} of {len(pages)}", 7, grey=True)
    return pdf.render(pages)
