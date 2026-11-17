"""Loads from a spreadsheet: each row a load with its customer, pickup and delivery, appointments and rate. Every row
is checked before anything is saved; the loads are then booked through the same rules as the form, as drafts, so
someone looks them over and marks them ready before they are offered for dispatch."""
import re
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.deps import Principal
from app.core.errors import Conflict, Forbidden, Invalid, NotFound
from app.modules.customers.models import Customer
from app.modules.intake.normalize import equipment_type, normalize
from app.modules.loads.models import Load

# Appointment times as files write them: "14:00", "2:00 PM", "2pm", "1400", or a window "08:00-10:00".
_CLOCK = re.compile(r"^\s*(\d{1,2})(?::?(\d{2}))?\s*([ap]\.?m\.?)?\s*$", re.I)
EQUIPMENT_KEYS = ("dry_van", "reefer", "flatbed", "step_deck", "power_only", "tanker", "other")


def clock(text: str) -> time | None:
    match = _CLOCK.match(text)
    if not match:
        return None
    hour, minute = int(match.group(1)), int(match.group(2) or 0)
    half = (match.group(3) or "").lower().replace(".", "")
    if half:
        if not 1 <= hour <= 12:
            return None
        hour = hour % 12 + (12 if half == "pm" else 0)
    if hour > 23 or minute > 59:
        return None
    return time(hour, minute)


def window(text: str | None) -> tuple[time | None, time | None, bool]:
    """A time or a window from a cell: (start, end, readable)."""
    if not text or not text.strip():
        return None, None, True
    parts = re.split(r"\s*(?:-|–|\bto\b)\s*", text.strip(), maxsplit=1)
    start = clock(parts[0])
    end = clock(parts[1]) if len(parts) > 1 else None
    if start is None or (len(parts) > 1 and end is None):
        return None, None, False
    return start, end, True


def appointment(day: date, text: str | None, zone: ZoneInfo) -> tuple[datetime, datetime | None]:
    """The appointment for a stop: a time or a window that day, or the whole day when the file gives no time."""
    start, end, _ = window(text)
    if start is None:
        return datetime.combine(day, time(0, 0), zone), datetime.combine(day, time(23, 59), zone)
    return datetime.combine(day, start, zone), datetime.combine(day, end, zone) if end else None


def _customers(db: Session) -> dict[str, Customer]:
    return {c.name.strip().lower(): c for c in db.scalars(select(Customer).where(Customer.status != "archived"))}


def check(db: Session, p: Principal, imp, values) -> tuple[list, set[int], dict[int, object]]:
    """Every row's problems: what is missing or unreadable, a stop that delivers before it picks up, the same load
    twice in the file or already in FlyFleet, and customers FlyFleet doesn't know yet."""
    from app.modules.intake.imports import FIELDS, RowIssue
    cols = {c.key: c for c in FIELDS["loads"]}
    issues: list = []
    blocked: set[int] = set()
    new_customers: dict[int, object] = {}
    known = _customers(db)
    booked = {(customer_id, (ref or "").strip().lower()): number for customer_id, ref, number in db.execute(
        select(Load.customer_id, Load.reference, Load.load_number).where(Load.reference.is_not(None),
                                                                         Load.status != "cancelled")).all()}
    seen: dict[tuple[str, str], int] = {}
    for index, row in enumerate(imp.rows):
        n = index + 2
        v = values(imp, row)
        name = v.get("customer", "")
        title = " · ".join(x for x in (name, v.get("reference")) if x) or f"Row {n}"
        problems: list[str] = []
        for key, text in v.items():
            col = cols.get(key)
            if col is None:
                continue
            if col.type in ("date", "state", "int", "money") and normalize(col.type, text) is None:
                what = {"date": "a date", "state": "a state"}.get(col.type, "a number")
                problems.append(f"{col.label} “{text}” isn't {what}")
            if col.type == "time" and not window(text)[2]:
                problems.append(f"{col.label} “{text}” isn't a time")
        for key, label in (("customer", "customer"), ("pickup_city", "pickup city"), ("pickup_date", "pickup date"),
                           ("delivery_city", "delivery city"), ("delivery_date", "delivery date")):
            if not v.get(key):
                problems.append(f"No {label}")
        pickup, delivery = normalize("date", v.get("pickup_date")), normalize("date", v.get("delivery_date"))
        if pickup and delivery and delivery < pickup:
            problems.append("Delivers before it picks up")
        ref = (v.get("reference") or "").strip().lower()
        if ref and name:
            key = (name.strip().lower(), ref)
            if key in seen:
                problems.append(f"Same customer and reference as row {seen[key]}")
            else:
                seen[key] = n
            customer = known.get(name.strip().lower())
            if customer is not None and (customer.id, ref) in booked:
                problems.append(f"Already in FlyFleet as {booked[(customer.id, ref)]}")
        if problems:
            blocked.add(n)
            issues.append(RowIssue(row=n, title=title, message=problems[0], tone="bad", actions=[], decision=None))
            continue
        if name.strip().lower() not in known:
            if not p.can("customers.manage"):
                blocked.add(n)
                issues.append(RowIssue(row=n, title=title, tone="bad", actions=[], decision=None,
                                       message=f"Customer “{name}” isn't in FlyFleet; your role can't add customers"))
                continue
            new_customers[n] = name
            issues.append(RowIssue(row=n, title=title, tone="warn", actions=["update", "skip"],
                                   decision=imp.decisions.get(str(n), "update"),
                                   message=f"“{name}” isn't a customer yet: added as one, or the row skipped"))
    return issues, blocked, new_customers


def commit(db: Session, p: Principal, imp, values) -> dict:
    """Book each ready row as a draft load through the load's own rules; add the new customers chosen for it."""
    from app.modules.loads import schemas as ls
    from app.modules.loads import service as loads
    if imp.status != "mapping":
        raise Conflict("This import is finished", code="IMPORT_DONE")
    _, blocked, new_customers = check(db, p, imp, values)
    zone = ZoneInfo(p.timezone or "UTC")
    known = _customers(db)
    created, skipped, added, failed, numbers = 0, 0, 0, [], []
    for index, row in enumerate(imp.rows):
        n = index + 2
        if n in blocked or (n in new_customers and imp.decisions.get(str(n), "update") != "update"):
            skipped += 1
            continue
        v = values(imp, row)
        name = v["customer"].strip()
        customer = known.get(name.lower())
        try:
            if customer is None:
                customer = Customer(organization_id=p.org_id, name=name[:160])
                db.add(customer)
                db.flush()
                known[name.lower()] = customer
                audit(db, p, "customer.created", "customer", customer.id, {"import_id": str(imp.id), "row": n})
                added += 1
            stops = []
            for kind in ("pickup", "delivery"):
                start, end = appointment(date.fromisoformat(normalize("date", v[f"{kind}_date"])), v.get(f"{kind}_time"), zone)
                stops.append(ls.StopIn(type=kind, name=v.get(f"{kind}_name"), city=v[f"{kind}_city"],
                                       state=normalize("state", v.get(f"{kind}_state")), appt_start=start, appt_end=end))
            equipment = equipment_type(v["equipment"]) if v.get("equipment") else "dry_van"
            body = ls.LoadCreate(
                customer_id=customer.id, status="draft", reference=v.get("reference"), commodity=v.get("commodity"),
                equipment_type=equipment if equipment in EQUIPMENT_KEYS else "other",
                weight_lbs=int(normalize("int", v["weight_lbs"])) if v.get("weight_lbs") else None,
                miles=int(normalize("int", v["miles"])) if v.get("miles") else None,
                customer_rate=normalize("money", v["rate"]) if v.get("rate") else "0", stops=stops)
            load = loads.create_load(db, p, body)
            db.flush()
            numbers.append(load.load_number)
            created += 1
        except ValidationError as e:
            failed.append({"row": n, "message": "; ".join(err["msg"] for err in e.errors())[:200]})
        except (Invalid, Conflict, NotFound, Forbidden) as e:
            failed.append({"row": n, "message": e.message})
    return {"created": created, "updated": 0, "skipped": skipped, "failed": failed, "due_soon": [],
            "customers_added": added, "loads": numbers[:200]}


def count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(Load)) or 0

