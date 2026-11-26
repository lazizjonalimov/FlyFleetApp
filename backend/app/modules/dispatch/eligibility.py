"""Who and what can haul a load, and why not.

The same checks back the assignment panel (to explain) and the assignment itself (to enforce), so what the
dispatcher is shown is exactly what the API will accept.
"""
import uuid
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.crud import like
from app.modules.dispatch.models import DispatchAssignment
from app.modules.drivers.models import Driver, DriverQualification
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.loads.models import Load
from app.modules.owners.service import blocked_units
from app.modules.safety.rules import FileItem, driver_issues, unit_issues
from app.modules.safety.settings import checklist_of

# A load in one of these states has a claim on its driver and equipment.
HOLDS_RESOURCES = ("assigned", "dispatched", "at_pickup", "in_transit", "at_delivery", "on_hold")
IN_PROGRESS = ("dispatched", "at_pickup", "in_transit", "at_delivery")
# Loads that need no trailer.
NO_TRAILER = ("box_truck",)

Kind = Literal["driver", "vehicle", "trailer"]


class Reason(BaseModel):
    code: str
    message: str
    severity: Literal["blocking", "warning"]
    load_id: uuid.UUID | None = None
    load_number: str | None = None


class OtherLoad(BaseModel):
    id: uuid.UUID
    load_number: str
    status: str
    pickup_at: datetime | None
    delivery_at: datetime | None


class Seat(BaseModel):
    """The truck a driver is seated in, the trailer it last pulled, and where it last reported from."""
    vehicle_id: uuid.UUID
    unit_number: str
    trailer_unit: str | None = None
    trailer_type: str | None = None
    place: str | None = None
    position_minutes: int | None = None
    miles_to_pickup: int | None = None
    moving: bool | None = None


class Candidate(BaseModel):
    id: uuid.UUID
    name: str
    detail: str | None
    terminal_id: uuid.UUID | None
    eligible: bool
    reasons: list[Reason]
    current_load: OtherLoad | None
    seat: Seat | None = None
    # What speaks for this driver: near the pickup, free that day, papers good past delivery, the right trailer.
    strengths: list[str] = []


class EligibleResources(BaseModel):
    load_id: uuid.UUID
    load_number: str
    needs_trailer: bool
    drivers: list[Candidate]
    vehicles: list[Candidate]
    trailers: list[Candidate]


def overlaps(load: Load, other: OtherLoad, now: datetime) -> bool:
    """Would hauling `load` collide with `other`?

    A load that is under way holds its driver and equipment from now until it delivers, however late it is
    running. Without both windows there is nothing to compare, so it counts as a collision.
    """
    start, end = other.pickup_at, other.delivery_at
    if other.status in IN_PROGRESS or other.status == "on_hold":
        start = min(start, now) if start else now
        end = max(end, now) if end else None
    if None in (load.pickup_at, load.delivery_at, start, end):
        return True
    return load.pickup_at < end and start < load.delivery_at


def commitments(db: Session, load: Load) -> dict[tuple[Kind, uuid.UUID], list[OtherLoad]]:
    """Every other load that currently has a claim on a driver, truck or trailer."""
    rows = db.execute(
        select(DispatchAssignment.driver_id, DispatchAssignment.vehicle_id, DispatchAssignment.trailer_id,
               Load.id, Load.load_number, Load.status, Load.pickup_at, Load.delivery_at)
        .join(Load, Load.id == DispatchAssignment.load_id)
        .where(DispatchAssignment.status == "active", Load.id != load.id, Load.status.in_(HOLDS_RESOURCES))
        .order_by(Load.pickup_at.nulls_last())
    ).all()
    out: dict[tuple[Kind, uuid.UUID], list[OtherLoad]] = {}
    for driver_id, vehicle_id, trailer_id, *rest in rows:
        other = OtherLoad(id=rest[0], load_number=rest[1], status=rest[2], pickup_at=rest[3], delivery_at=rest[4])
        for kind, rid in (("driver", driver_id), ("vehicle", vehicle_id), ("trailer", trailer_id)):
            if rid:
                out.setdefault((kind, rid), []).append(other)
    return out


def _schedule(load: Load, others: list[OtherLoad], now: datetime, what: str) -> list[Reason]:
    return [Reason(code="SCHEDULE_CONFLICT", severity="blocking", load_id=o.id, load_number=o.load_number,
                   message=f"{what} is on load {o.load_number} at the same time")
            for o in others if overlaps(load, o, now)]


def _compliance(issues) -> list[Reason]:
    # "Nothing on file" is not a reason to stop a truck; it shows up in the expirations queue instead.
    return [Reason(code=i.code, message=i.message, severity=i.severity) for i in issues if i.severity != "info"]


def driver_reasons(load: Load, driver: Driver, qualifications, others: list[OtherLoad], today: date,
                   now: datetime, checklist: list[FileItem] | None = None) -> list[Reason]:
    reasons: list[Reason] = []
    if driver.status != "active":
        reasons.append(Reason(code="DRIVER_NOT_ACTIVE", severity="blocking",
                              message=f"Driver is {driver.status.replace('_', ' ')}"))
    reasons += _compliance(driver_issues(driver, qualifications, today, checklist))
    reasons += _schedule(load, others, now, "Driver")
    if load.terminal_id and driver.terminal_id and driver.terminal_id != load.terminal_id:
        reasons.append(Reason(code="OTHER_TERMINAL", severity="warning", message="Based at another terminal"))
    return reasons


def unit_reasons(load: Load, unit: Vehicle | Trailer, others: list[OtherLoad], today: date, now: datetime,
                 what: str, owner_block: str | None = None) -> list[Reason]:
    reasons: list[Reason] = []
    if unit.status != "active":
        reasons.append(Reason(code="UNIT_NOT_ACTIVE", severity="blocking",
                              message=f"{what} is {unit.status.replace('_', ' ')}"))
    if owner_block:
        # Owned equipment runs only once its owner is set up: lease, title, W-9, insurance and ACH on file.
        reasons.append(Reason(code="OWNER_NOT_READY", severity="blocking", message=owner_block))
    reasons += _compliance(unit_issues(unit, today))
    reasons += _schedule(load, others, now, what)
    if isinstance(unit, Trailer) and unit.type != load.equipment_type:
        reasons.append(Reason(code="EQUIPMENT_MISMATCH", severity="warning",
                              message=f"Trailer is a {unit.type.replace('_', ' ')}; the load calls for "
                                      f"{load.equipment_type.replace('_', ' ')}"))
    if load.terminal_id and unit.terminal_id and unit.terminal_id != load.terminal_id:
        reasons.append(Reason(code="OTHER_TERMINAL", severity="warning", message="Based at another terminal"))
    return reasons


def blocking(reasons: list[Reason]) -> list[Reason]:
    return [r for r in reasons if r.severity == "blocking"]


def qualifications_by_driver(db: Session, driver_ids) -> dict[uuid.UUID, list[DriverQualification]]:
    out: dict[uuid.UUID, list[DriverQualification]] = {}
    if driver_ids:
        for q in db.scalars(select(DriverQualification).where(DriverQualification.driver_id.in_(driver_ids))):
            out.setdefault(q.driver_id, []).append(q)
    return out


def check_trio(db: Session, load: Load, driver: Driver, vehicle: Vehicle, trailer: Trailer | None, today: date,
               now: datetime) -> list[Reason]:
    """Everything wrong with assigning exactly these three to the load. Call it with the rows locked."""
    held = commitments(db, load)
    quals = qualifications_by_driver(db, [driver.id]).get(driver.id, [])
    blocked = blocked_units(db, [vehicle.id], [trailer.id] if trailer is not None else None)
    reasons = driver_reasons(load, driver, quals, held.get(("driver", driver.id), []), today, now, checklist_of(db))
    reasons += unit_reasons(load, vehicle, held.get(("vehicle", vehicle.id), []), today, now, "Truck",
                            blocked.get(vehicle.id))
    if trailer is not None:
        reasons += unit_reasons(load, trailer, held.get(("trailer", trailer.id), []), today, now, "Trailer",
                                blocked.get(trailer.id))
    return reasons


def _on_day(other: OtherLoad, day: date, zone: str) -> bool:
    """Whether another load takes up any of that day."""
    start = other.pickup_at or other.delivery_at
    end = other.delivery_at or other.pickup_at
    if start is None or end is None:
        return False
    tz = ZoneInfo(zone)
    return start.astimezone(tz).date() <= day <= end.astimezone(tz).date()


def _seats(db: Session, load: Load | None, driver_ids: list[uuid.UUID], now: datetime) -> dict[uuid.UUID, Seat]:
    """For each driver: the truck they're seated in, the trailer it last pulled, where it last reported from and
    how far that is from the load's pickup."""
    from app.core import places
    from app.modules.fleet.models import UnitAssignment
    from app.modules.loads.models import LoadStop
    from app.modules.tracking import incidents
    if not driver_ids:
        return {}
    rows = db.execute(select(UnitAssignment.driver_id, UnitAssignment.co_driver_id, Vehicle.id, Vehicle.unit_number)
                      .join(Vehicle, Vehicle.id == UnitAssignment.vehicle_id)
                      .where(UnitAssignment.effective_to.is_(None),
                             or_(UnitAssignment.driver_id.in_(driver_ids), UnitAssignment.co_driver_id.in_(driver_ids)))).all()
    by_driver: dict[uuid.UUID, tuple[uuid.UUID, str]] = {}
    for driver_id, co_driver_id, vehicle_id, unit in rows:
        by_driver[driver_id] = (vehicle_id, unit)
        if co_driver_id:
            by_driver[co_driver_id] = (vehicle_id, unit)
    vehicle_ids = list({vid for vid, _ in by_driver.values()})
    pulled: dict[uuid.UUID, tuple[str, str]] = {}
    for vehicle_id, unit, kind in db.execute(
            select(DispatchAssignment.vehicle_id, Trailer.unit_number, Trailer.type)
            .join(Trailer, Trailer.id == DispatchAssignment.trailer_id)
            .where(DispatchAssignment.vehicle_id.in_(vehicle_ids)).order_by(DispatchAssignment.created_at.desc())).all():
        pulled.setdefault(vehicle_id, (unit, kind))
    positions = incidents.latest_positions(db, vehicle_ids)
    pickup = db.scalar(select(LoadStop).where(LoadStop.load_id == load.id, LoadStop.type == "pickup")
                       .order_by(LoadStop.seq).limit(1)) if load is not None else None
    there = places.locate(pickup.city, pickup.state) if pickup is not None else None
    out: dict[uuid.UUID, Seat] = {}
    for driver_id, (vehicle_id, unit) in by_driver.items():
        seat = Seat(vehicle_id=vehicle_id, unit_number=unit, trailer_unit=pulled.get(vehicle_id, (None, None))[0],
                    trailer_type=pulled.get(vehicle_id, (None, None))[1])
        pos = positions.get(vehicle_id)
        if pos is not None and now - pos.recorded_at < timedelta(days=2):
            lat, lon = float(pos.lat), float(pos.lon)
            seat.place = places.describe(lat, lon)
            seat.position_minutes = int((now - pos.recorded_at).total_seconds() // 60)
            seat.moving = pos.speed_mph is not None and float(pos.speed_mph) >= 3
            if there is not None:
                seat.miles_to_pickup = round(places.km(lat, lon, *there) * incidents.ROAD_FACTOR / 1.609344)
        out[driver_id] = seat
    return out


def evaluate(db: Session, load: Load, today: date, now: datetime, *, q: str | None = None,
             terminal_id: uuid.UUID | None = None, limit: int = 200, scope=None, zone: str = "UTC") -> EligibleResources:
    """Every driver, truck and trailer that could be considered for the load, eligible ones first. A dispatch
    team's dispatcher is offered the team's trucks and the drivers on them."""
    from app.core import scope as team_scope
    held = commitments(db, load)

    def pick(model, search: tuple, order):
        stmt = select(model).where(model.status.notin_(("terminated", "retired")))
        if model is Vehicle:
            stmt = team_scope.where(stmt, team_scope.vehicles(scope, Vehicle.id))
        elif model is Driver:
            stmt = team_scope.where(stmt, team_scope.drivers(scope, Driver.id))
        if terminal_id:
            stmt = stmt.where(model.terminal_id == terminal_id)
        if q:
            pattern = like(q.strip())
            condition = search[0].ilike(pattern)
            for column in search[1:]:
                condition = condition | column.ilike(pattern)
            stmt = stmt.where(condition)
        return list(db.scalars(stmt.order_by(*order).limit(limit)))

    def current(others: list[OtherLoad]) -> OtherLoad | None:
        under_way = [o for o in others if o.status in IN_PROGRESS]
        return (under_way or others or [None])[0]

    def ranked(candidates: list[Candidate]) -> list[Candidate]:
        far = 10**9
        return sorted(candidates, key=lambda c: (not c.eligible, c.seat.miles_to_pickup if c.seat and
                                                 c.seat.miles_to_pickup is not None else far,
                                                 len(c.reasons), c.name.lower()))

    drivers = pick(Driver, (Driver.first_name, Driver.last_name, Driver.employee_number),
                   (Driver.last_name, Driver.first_name))
    quals = qualifications_by_driver(db, [d.id for d in drivers])
    checklist = checklist_of(db)
    seats = _seats(db, load, [d.id for d in drivers], now)
    pickup_day = load.pickup_at.astimezone(ZoneInfo(zone)).date() if load.pickup_at else None
    delivery_day = load.delivery_at.astimezone(ZoneInfo(zone)).date() if load.delivery_at else pickup_day
    driver_out = []
    for d in drivers:
        others = held.get(("driver", d.id), [])
        reasons = driver_reasons(load, d, quals.get(d.id, []), others, today, now, checklist)
        seat = seats.get(d.id)
        strengths: list[str] = []
        if seat is not None and seat.miles_to_pickup is not None:
            miles = seat.miles_to_pickup
            strengths.append(f"{miles:,} mi from pickup" if miles >= 1 else "Under 1 mi from pickup")
        if pickup_day is not None and not [o for o in others if _on_day(o, pickup_day, zone)]:
            strengths.append("Free all day")
        if d.medical_cert_expiry and delivery_day and d.medical_cert_expiry >= delivery_day:
            strengths.append(f"Medical card valid to {d.medical_cert_expiry:%b %Y}")
        if seat is not None and seat.trailer_type == load.equipment_type:
            strengths.append(f"{load.equipment_type.replace('_', ' ').capitalize()} matches")
        if seat is not None and seat.position_minutes is not None and 30 <= seat.position_minutes < 24 * 60:
            age = seat.position_minutes
            reasons.append(Reason(code="LOCATION_OLD", severity="warning",
                                  message=f"Location {age // 60} h {age % 60} min old" if age >= 60 else
                                  f"Location {age} min old"))
        driver_out.append(Candidate(id=d.id, name=f"{d.first_name} {d.last_name}",
                                    detail=d.driver_type.replace("_", " "), terminal_id=d.terminal_id,
                                    eligible=not blocking(reasons), reasons=reasons, current_load=current(others),
                                    seat=seat, strengths=strengths))

    def units(model, kind: Kind, what: str) -> list[Candidate]:
        out = []
        candidates = pick(model, (model.unit_number, model.plate, model.vin), (model.unit_number,))
        ids = [u.id for u in candidates]
        blocked = blocked_units(db, ids if kind == "vehicle" else None, ids if kind == "trailer" else None)
        for u in candidates:
            others = held.get((kind, u.id), [])
            reasons = unit_reasons(load, u, others, today, now, what, blocked.get(u.id))
            detail = (u.type.replace("_", " ") if isinstance(u, Trailer)
                      else " ".join(str(x) for x in (u.year, u.make, u.model) if x) or None)
            out.append(Candidate(id=u.id, name=u.unit_number, detail=detail, terminal_id=u.terminal_id,
                                 eligible=not blocking(reasons), reasons=reasons, current_load=current(others)))
        return out

    return EligibleResources(
        load_id=load.id, load_number=load.load_number, needs_trailer=load.equipment_type not in NO_TRAILER,
        drivers=ranked(driver_out), vehicles=ranked(units(Vehicle, "vehicle", "Truck")),
        trailers=ranked(units(Trailer, "trailer", "Trailer")))


def current_loads(db: Session, kind: Kind, ids) -> dict[uuid.UUID, OtherLoad]:
    """For lists: the load each driver or unit is on now, or failing that the next one it is booked on."""
    if not ids:
        return {}
    column = {"driver": DispatchAssignment.driver_id, "vehicle": DispatchAssignment.vehicle_id,
              "trailer": DispatchAssignment.trailer_id}[kind]
    rows = db.execute(
        select(column, Load.id, Load.load_number, Load.status, Load.pickup_at, Load.delivery_at)
        .join(Load, Load.id == DispatchAssignment.load_id)
        .where(DispatchAssignment.status == "active", column.in_(ids), Load.status.in_(HOLDS_RESOURCES))
        .order_by(Load.pickup_at.nulls_last())
    ).all()
    out: dict[uuid.UUID, OtherLoad] = {}
    for rid, load_id, number, status, pickup_at, delivery_at in rows:
        other = OtherLoad(id=load_id, load_number=number, status=status, pickup_at=pickup_at, delivery_at=delivery_at)
        if rid not in out or (other.status in IN_PROGRESS and out[rid].status not in IN_PROGRESS):
            out[rid] = other
    return out
