"""The figures above the trucks, trailers and drivers tables, and the values their filters offer.

Each figure is counted in the database for the whole company, whatever page of the table is open. The filter
values are the ones the company's own records hold (the makes it runs, the years, its owners), with counts.
"""
import uuid
from collections import Counter
from datetime import timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core import scope as team_scope
from app.core.deps import Principal, get_db, require
from app.modules.dispatch.models import DispatchAssignment
from app.modules.drivers.models import Driver, DriverQualification
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.fleet.models import UnitAssignment
from app.modules.intake.service import next_unit_number
from app.modules.loads.models import Load
from app.modules.maintenance.models import WorkOrder
from app.modules.organizations.models import Terminal
from app.modules.owners.models import EquipmentOwnership, Owner
from app.modules.people.models import Person
from app.modules.safety.rules import QUALIFICATION_LABELS, driver_issues, latest, lower
from app.modules.safety.settings import checklist_of

LIVE = ("assigned", "dispatched", "at_pickup", "in_transit", "at_delivery")
OFF_ROAD = ("in_maintenance", "out_of_service")

router = APIRouter(tags=["fleet"])


class Count(BaseModel):
    value: str
    label: str
    count: int


class TruckSummary(BaseModel):
    total: int
    active: int
    on_loads: int
    available: int
    in_maintenance: int
    out_of_service: int
    retired: int
    company: int
    owner_units: int
    owners: int
    # Trucks on a load now, and trucks that hauled anything last week, as a share of trucks in service.
    utilization_pct: int | None
    last_week_pct: int | None
    available_at: list[Count]
    teams: list[str]
    makes: list[Count]
    years: list[Count]
    owner_list: list[Count]
    # The next free unit number in the company's own numbering, for the add form.
    next_unit_number: str | None = None


class TrailerSummary(BaseModel):
    total: int
    active: int
    loaded: int
    empty: int
    in_shop: int
    retired: int
    by_type: list[Count]
    owner_units: int
    owner_list: list[Count]
    utilization_pct: int | None
    yard_at: list[Count]
    reefers: int
    reefers_loaded: int
    # Papers that lapse, and planned service, in the next 60 days.
    service_due: int
    service_due_detail: list[Count]
    makes: list[Count]
    years: list[Count]
    next_unit_number: str | None = None


class DriverSummary(BaseModel):
    total: int
    active: int
    inactive: int
    dispatchable: int
    blocked: int
    on_load: int
    available: int
    team_pairs: int
    teams: list[str]
    owner_operators: int
    owners_drivers: int
    expiring: int
    expiring_detail: list[Count]
    endorsements: list[Count]


def _counts(values, labels: dict[str, str] | None = None, *, numeric_desc: bool = False) -> list[Count]:
    c = Counter(v for v in values if v not in (None, ""))
    items = sorted(c.items(), key=(lambda kv: -int(kv[0])) if numeric_desc else (lambda kv: (-kv[1], str(kv[0]))))
    return [Count(value=str(v), label=(labels or {}).get(str(v), str(v)), count=n) for v, n in items]


def _pct(part: int, whole: int) -> int | None:
    return round(100 * part / whole) if whole else None


def _busy_ids(db: Session, column) -> set[uuid.UUID]:
    return set(db.scalars(select(column).join(Load, Load.id == DispatchAssignment.load_id)
                          .where(DispatchAssignment.status == "active", Load.status.in_(LIVE), column.is_not(None))))


def _owners_of(db: Session, column) -> dict[uuid.UUID, list[tuple[uuid.UUID, str]]]:
    rows = db.execute(select(column, Owner.id, Owner.legal_name, Person.first_name, Person.last_name)
                      .join(Owner, Owner.id == EquipmentOwnership.owner_id)
                      .outerjoin(Person, Person.id == Owner.person_id)
                      .where(EquipmentOwnership.effective_to.is_(None), column.is_not(None))).all()
    out: dict[uuid.UUID, list[tuple[uuid.UUID, str]]] = {}
    for unit, owner_id, legal, first, last in rows:
        out.setdefault(unit, []).append((owner_id, legal or f"{first or ''} {last or ''}".strip() or "Owner"))
    return out


def _place_of(db: Session, units, terminals: dict[uuid.UUID, str], col) -> dict[uuid.UUID, str]:
    """Where an idle unit is: the city of its last stop, or its home terminal."""
    from app.modules.equipment.router import last_places
    kind = "vehicle" if col is DispatchAssignment.vehicle_id else "trailer"
    places = last_places(db, kind, [u.id for u in units])
    out = {}
    for u in units:
        place = places.get(u.id)
        out[u.id] = terminals.get(u.terminal_id) or (place.place.split(",")[0] if place and place.place else "") or "No terminal"
    return out


@router.get("/vehicles/summary", response_model=TruckSummary, summary="The trucks table's figures and filter values")
def truck_summary(p: Principal = Depends(require("equipment.read")), db: Session = Depends(get_db)):
    trucks = list(db.scalars(team_scope.where(select(Vehicle), team_scope.vehicles(p.scope, Vehicle.id))))
    busy = _busy_ids(db, DispatchAssignment.vehicle_id)
    owners = _owners_of(db, EquipmentOwnership.vehicle_id) if p.can("owners.read") else {}
    active = [v for v in trucks if v.status == "active"]
    in_service = [v for v in trucks if v.status != "retired"]
    idle = [v for v in active if v.id not in busy]
    terminals = dict(db.execute(select(Terminal.id, Terminal.name)).all())
    where = _place_of(db, idle, terminals, DispatchAssignment.vehicle_id)
    today = p.today()
    week_ago = today - timedelta(days=today.weekday() + 7)
    hauled = set(db.scalars(select(DispatchAssignment.vehicle_id).join(Load, Load.id == DispatchAssignment.load_id)
                            .where(DispatchAssignment.status.in_(("active", "completed")),
                                   func.date(Load.pickup_at) <= week_ago + timedelta(days=6),
                                   or_(Load.delivered_at.is_(None), func.date(Load.delivered_at) >= week_ago))))
    seats = list(db.scalars(select(UnitAssignment).where(UnitAssignment.effective_to.is_(None),
                                                         UnitAssignment.co_driver_id.is_not(None))))
    names = {d.id: (d.first_name, d.last_name) for d in db.scalars(select(Driver).where(Driver.id.in_(
        [x for s in seats for x in (s.driver_id, s.co_driver_id)])))}
    numbers = {v.id: v.unit_number for v in trucks}

    def pair(s: UnitAssignment) -> str:
        a, b = names.get(s.driver_id, ("", "")), names.get(s.co_driver_id, ("", ""))
        who = f"{a[1]}s" if a[1] and a[1] == b[1] else f"{a[0]} and {b[0]}"
        return f"{numbers.get(s.vehicle_id, '')} {who}"

    owned = {u for u in owners}
    return TruckSummary(
        total=len(trucks), active=len(active), on_loads=len([v for v in trucks if v.id in busy]),
        available=len(idle), in_maintenance=len([v for v in trucks if v.status == "in_maintenance"]),
        out_of_service=len([v for v in trucks if v.status == "out_of_service"]),
        retired=len([v for v in trucks if v.status == "retired"]),
        company=len([v for v in in_service if v.id not in owned]), owner_units=len([v for v in in_service if v.id in owned]),
        owners=len({o for v in in_service for o, _ in owners.get(v.id, [])}),
        utilization_pct=_pct(len([v for v in in_service if v.id in busy]), len(in_service)),
        last_week_pct=_pct(len([v for v in in_service if v.id in hauled]), len(in_service)),
        available_at=_counts(where.values()), teams=sorted(pair(s) for s in seats),
        makes=_counts(v.make for v in trucks), years=_counts((v.year for v in trucks), numeric_desc=True),
        owner_list=[Count(value=str(o), label=n, count=c) for (o, n), c in
                    Counter(x for v in trucks for x in owners.get(v.id, [])).most_common()],
        next_unit_number=next_unit_number(db, Vehicle))


@router.get("/trailers/summary", response_model=TrailerSummary, summary="The trailers table's figures and filter values")
def trailer_summary(p: Principal = Depends(require("equipment.read")), db: Session = Depends(get_db)):
    trailers = list(db.scalars(select(Trailer)))
    busy = _busy_ids(db, DispatchAssignment.trailer_id)
    owners = _owners_of(db, EquipmentOwnership.trailer_id) if p.can("owners.read") else {}
    in_service = [t for t in trailers if t.status != "retired"]
    idle = [t for t in trailers if t.status == "active" and t.id not in busy]
    terminals = dict(db.execute(select(Terminal.id, Terminal.name)).all())
    where = _place_of(db, idle, terminals, DispatchAssignment.trailer_id)
    today = p.today()
    horizon = today + timedelta(days=60)
    due: Counter = Counter()
    for t in in_service:
        for label, when in (("registration", t.registration_expiry), ("insurance", t.insurance_expiry),
                            ("annual inspection", t.inspection_expiry)):
            if when and when <= horizon:
                due[label] += 1
    planned = db.execute(select(WorkOrder.title).where(WorkOrder.trailer_id.is_not(None), WorkOrder.status == "open",
                                                       WorkOrder.scheduled_for <= horizon)).scalars().all()
    if planned:
        due["planned service"] += len(planned)
    labels = {"dry_van": "Dry vans", "reefer": "Reefers", "flatbed": "Flatbeds", "step_deck": "Step decks",
              "box_truck": "Box trucks", "tanker": "Tankers", "other": "Other"}
    reefers = [t for t in in_service if t.type == "reefer"]
    return TrailerSummary(
        total=len(trailers), active=len([t for t in trailers if t.status == "active"]),
        loaded=len([t for t in trailers if t.id in busy]), empty=len(idle),
        in_shop=len([t for t in trailers if t.status in OFF_ROAD]), retired=len([t for t in trailers if t.status == "retired"]),
        by_type=_counts((t.type for t in in_service), labels), owner_units=len([t for t in in_service if t.id in owners]),
        owner_list=[Count(value=str(o), label=n, count=c) for (o, n), c in
                    Counter(x for t in trailers for x in owners.get(t.id, [])).most_common()],
        utilization_pct=_pct(len([t for t in in_service if t.id in busy]), len(in_service)),
        yard_at=_counts(where.values()), reefers=len(reefers), reefers_loaded=len([t for t in reefers if t.id in busy]),
        service_due=sum(due.values()), service_due_detail=[Count(value=k, label=k, count=n) for k, n in due.most_common()],
        makes=_counts(t.make for t in trailers), years=_counts((t.year for t in trailers), numeric_desc=True),
        next_unit_number=next_unit_number(db, Trailer))


def _plural(kind: str) -> str:
    """ "mvr" -> "MVRs", "clearinghouse" -> "clearinghouse queries", "twic" -> "TWIC cards"."""
    if kind == "mvr":
        return "MVRs"
    label = lower(QUALIFICATION_LABELS.get(kind, "other paper"))
    return label[:-1] + "ies" if label.endswith("y") else label + "s"


@router.get("/drivers/summary", response_model=DriverSummary, summary="The drivers table's figures and filter values")
def driver_summary(p: Principal = Depends(require("drivers.read")), db: Session = Depends(get_db)):
    drivers = list(db.scalars(team_scope.where(select(Driver), team_scope.drivers(p.scope, Driver.id))))
    today = p.today()
    soon = today + timedelta(days=30)
    quals = list(db.scalars(select(DriverQualification)))
    by_driver: dict = {}
    for q in quals:
        by_driver.setdefault(q.driver_id, []).append(q)
    checklist = checklist_of(db)
    active = [d for d in drivers if d.status == "active"]

    def blocked(d: Driver) -> bool:
        """As dispatch decides it: the same rules, the company's own qualification file."""
        return any(i.severity == "blocking" for i in driver_issues(d, by_driver.get(d.id, []), today, checklist))

    busy = _busy_ids(db, DispatchAssignment.driver_id) | _busy_ids(db, DispatchAssignment.co_driver_id)
    seats = list(db.scalars(select(UnitAssignment).where(UnitAssignment.effective_to.is_(None),
                                                         UnitAssignment.co_driver_id.is_not(None))))
    by_id = {d.id: d for d in drivers}
    numbers = dict(db.execute(select(Vehicle.id, Vehicle.unit_number)).all())

    def pair(s: UnitAssignment) -> str:
        a, b = by_id.get(s.driver_id), by_id.get(s.co_driver_id)
        if not a or not b:
            return ""
        who = f"{a.last_name}s" if a.last_name == b.last_name else f"{a.first_name} and {b.first_name}"
        return f"{who} on {numbers.get(s.vehicle_id, '')}"

    owner_persons = set(db.scalars(select(Owner.person_id).where(Owner.person_id.is_not(None))))
    expiring: Counter = Counter()
    for d in active:
        if d.medical_cert_expiry and today <= d.medical_cert_expiry <= soon:
            expiring["medical cards"] += 1
        if d.cdl_expiry and today <= d.cdl_expiry <= soon:
            expiring["CDLs"] += 1
    active_ids = {d.id for d in active}
    for q in (q for held in by_driver.values() for q in latest(held).values()):
        if q.driver_id in active_ids and q.expires_on and today <= q.expires_on <= soon:
            expiring[_plural(q.type)] += 1
    endorsements = [e.strip() for d in active for e in (d.endorsements or "").replace(",", " ").split() if e.strip()]
    return DriverSummary(
        total=len(drivers), active=len(active), inactive=len([d for d in drivers if d.status != "active"]),
        dispatchable=len([d for d in active if not blocked(d)]), blocked=len([d for d in active if blocked(d)]),
        on_load=len([d for d in drivers if d.id in busy]),
        available=len([d for d in active if d.id not in busy and not blocked(d)]),
        team_pairs=len(seats), teams=sorted(x for x in (pair(s) for s in seats) if x),
        owner_operators=len([d for d in drivers if d.person_id in owner_persons]),
        owners_drivers=len([d for d in drivers if d.employer_owner_id]),
        expiring=sum(expiring.values()), expiring_detail=[Count(value=k, label=k, count=n) for k, n in expiring.most_common()],
        endorsements=_counts(endorsements, {"H": "H · Hazmat", "N": "N · Tank", "T": "T · Doubles/triples",
                                            "X": "X · Tank and hazmat", "P": "P · Passenger", "S": "S · School bus"}))
