"""Putting a driver and equipment on a load, safely when several dispatchers work at once."""
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import scope as team_scope
from app.core.audit import audit
from app.core.deps import Principal
from app.core.errors import Conflict, Forbidden, Invalid
from app.modules.dispatch import eligibility
from app.modules.dispatch.models import DispatchAssignment
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.fleet.models import UnitAssignment
from app.modules.loads import service as loads
from app.modules.loads.models import Load, LoadStatusEvent
from app.modules.teams.models import DispatchTeamVehicle


def _lock(db: Session, model, id_: uuid.UUID | None, field: str, label: str):
    """Lock one driver, truck or trailer for the rest of the transaction.

    Two dispatchers booking the same driver onto different loads both stop here; the second one continues
    only after the first has committed, and then sees the first one's assignment in the conflict check.
    Rows are always locked in the same order (driver, truck, trailer), so two requests can't deadlock.
    """
    if id_ is None:
        return None
    row = db.scalar(select(model).where(model.id == id_).with_for_update())
    if row is None:
        raise Invalid(f"{label} not found", field=field)
    return row


def _who_booked(db: Session, problems: list, driver: Driver) -> dict:
    """For a clash with another load: who put the driver on it, and when, so the board can say so."""
    from app.modules.organizations.models import User
    clash = next((r for r in problems if r.load_id), None)
    if clash is None:
        return {}
    row = db.execute(select(DispatchAssignment.assigned_by, DispatchAssignment.created_at)
                     .where(DispatchAssignment.load_id == clash.load_id, DispatchAssignment.status == "active")).first()
    if row is None:
        return {"load_id": str(clash.load_id), "load_number": clash.load_number}
    by = db.scalar(select(User.full_name).where(User.id == row.assigned_by)) if row.assigned_by else None
    return {"load_id": str(clash.load_id), "load_number": clash.load_number, "driver": f"{driver.first_name} {driver.last_name}",
            "assigned_by": by, "assigned_at": row.created_at.isoformat()}


def assign(db: Session, p: Principal, load: Load, driver_id: uuid.UUID, vehicle_id: uuid.UUID,
           trailer_id: uuid.UUID | None, *, reason: str | None = None) -> DispatchAssignment:
    """Assign a planned load, or replace the driver and equipment on one that already has them."""
    replacing = load.status in loads.REASSIGNABLE
    if not replacing and load.status not in loads.TRANSITIONS["assign"]:
        raise loads.illegal(load, "assign")
    note = (reason or "").strip() or None
    if load.status in loads.ROLLING and not note:
        raise Invalid("Say why the load is changing hands while it is under way", field="reason")

    driver = _lock(db, Driver, driver_id, "driver_id", "Driver")
    vehicle = _lock(db, Vehicle, vehicle_id, "vehicle_id", "Truck")
    trailer = _lock(db, Trailer, trailer_id, "trailer_id", "Trailer")
    if not team_scope.has_vehicle(p.scope, vehicle.id):
        raise Forbidden(f"{vehicle.unit_number} isn’t one of your dispatch team’s trucks",
                        details={"vehicle_id": str(vehicle.id)})
    # A load on a team's truck is that team's, and stays tagged for it if it comes off the truck.
    team = db.scalar(select(DispatchTeamVehicle.team_id).where(DispatchTeamVehicle.vehicle_id == vehicle.id))
    if team is not None:
        load.dispatch_team_id = team

    now = datetime.now(UTC)
    problems = eligibility.blocking(eligibility.check_trio(db, load, driver, vehicle, trailer, p.today(), now))
    if problems:
        raise Conflict(problems[0].message if len(problems) == 1
                       else f"{problems[0].message}, and {len(problems) - 1} more problem(s)",
                       code="ASSIGNMENT_CONFLICT",
                       details={"reasons": [r.model_dump(mode="json") for r in problems],
                                **_who_booked(db, problems, driver)})

    current = loads.active_assignment(db, load.id)
    if current and (current.driver_id, current.vehicle_id, current.trailer_id) == (driver_id, vehicle_id, trailer_id):
        return current  # nothing to change
    if current:
        current.status, current.released_at = "released", now
        current.release_reason = note or "Reassigned"
        db.flush()  # the old row must stop being active before the new one is inserted

    # A team truck carries both seats: the co-driver comes from the truck's seat assignment.
    seat = db.scalar(select(UnitAssignment).where(UnitAssignment.vehicle_id == vehicle_id,
                                                  UnitAssignment.effective_to.is_(None)))
    co_driver_id = None
    if seat is not None and seat.co_driver_id:
        co_driver_id = seat.co_driver_id if seat.driver_id == driver_id else (
            seat.driver_id if seat.co_driver_id == driver_id else None)
    assignment = DispatchAssignment(organization_id=p.org_id, load_id=load.id, driver_id=driver_id,
                                    co_driver_id=co_driver_id, vehicle_id=vehicle_id, trailer_id=trailer_id,
                                    assigned_by=p.user_id)
    db.add(assignment)
    db.flush()
    data = {"driver_id": str(driver_id), "vehicle_id": str(vehicle_id),
            "trailer_id": str(trailer_id) if trailer_id else None}
    if replacing:
        load.version += 1
        db.add(LoadStatusEvent(organization_id=p.org_id, load_id=load.id, load_version=load.version,
                               action="reassign", from_status=load.status, to_status=load.status,
                               actor_user_id=p.user_id, note=note))
        audit(db, p, "load.reassign", "load", load.id, {**data, "note": note})
    else:
        loads.move(db, p, load, "assign", "assigned", note)
        audit(db, p, "dispatch.assigned", "load", load.id, data)
    return assignment


def unassign(db: Session, p: Principal, load: Load, *, reason: str | None = None) -> None:
    if load.status not in loads.TRANSITIONS["unassign"]:
        raise loads.illegal(load, "unassign")
    note = (reason or "").strip() or None
    current = loads.active_assignment(db, load.id)
    if current:
        current.status, current.released_at = "released", datetime.now(UTC)
        current.release_reason = note or "Unassigned"
    loads.move(db, p, load, "unassign", "planned", note)


UNDO_WINDOW = timedelta(minutes=30)


def undo(db: Session, p: Principal, load: Load, assignment: DispatchAssignment) -> None:
    if load.status not in ("assigned", "dispatched"):
        raise Conflict("The truck is already on its way to or at the pickup, so this can’t be undone. Reassign it "
                       "instead.", code="WRONG_STATE")
    now = datetime.now(UTC)
    if now - assignment.created_at > UNDO_WINDOW:
        raise Conflict("It’s been more than 30 minutes, so this can’t be undone. Release or reassign it instead.",
                       code="TOO_LATE")
    told = load.status == "dispatched"
    assignment.status, assignment.released_at, assignment.release_reason = "released", now, "Undone"
    loads.move(db, p, load, "undo_assign", "planned", "Assignment undone")
    if told:
        from app.modules.messaging import service as messaging
        messaging.tell_driver(db, p.org_id, assignment.driver_id, event="load_recalled",
                              title=f"Load {load.load_number} was taken back",
                              body="Dispatch changed the plan: this load is no longer yours.", load_id=load.id)
    audit(db, p, "dispatch.undone", "load", load.id, {"driver_id": str(assignment.driver_id), "was_dispatched": told})


def reschedule(db: Session, p: Principal, load: Load, days: int) -> None:
    if days == 0:
        raise Invalid("Choose another day", field="days")
    if load.status not in ("draft", "planned", "assigned", "dispatched"):
        raise Conflict("A load already under way can’t be moved to another day", code="WRONG_STATE")
    stops = loads.stops_of(db, load.id)
    if any(s.arrived_at for s in stops):
        raise Conflict("The truck has reached a stop, so this load can’t be moved", code="WRONG_STATE")
    by = timedelta(days=days)
    for stop in stops:
        stop.appt_start = stop.appt_start + by if stop.appt_start else None
        stop.appt_end = stop.appt_end + by if stop.appt_end else None
    load.pickup_at = load.pickup_at + by if load.pickup_at else None
    load.delivery_at = load.delivery_at + by if load.delivery_at else None
    db.flush()
    current = loads.active_assignment(db, load.id)
    if current is not None:
        problems = eligibility.blocking(eligibility.check_trio(
            db, load, db.get(Driver, current.driver_id), db.get(Vehicle, current.vehicle_id),
            db.get(Trailer, current.trailer_id) if current.trailer_id else None, p.today(), datetime.now(UTC)))
        if problems:
            raise Conflict(f"Not moved: {problems[0].message}", code="ASSIGNMENT_CONFLICT",
                           details={"reasons": [r.model_dump(mode="json") for r in problems]})
    load.version += 1
    note = f"Moved {abs(days)} day{'s' if abs(days) != 1 else ''} {'later' if days > 0 else 'earlier'}"
    db.add(LoadStatusEvent(organization_id=p.org_id, load_id=load.id, load_version=load.version, action="reschedule",
                           from_status=load.status, to_status=load.status, actor_user_id=p.user_id, note=note))
    audit(db, p, "load.rescheduled", "load", load.id, {"days": days, "stops": len(stops)})


def best_match(db: Session, p: Principal, load_ids: list[uuid.UUID]) -> tuple[list[dict], list[dict]]:
    from app.core.errors import AppError
    rows = list(db.scalars(select(Load).where(Load.id.in_(load_ids)).order_by(Load.pickup_at.nulls_last())))
    assigned, failed = [], []
    for row in rows:
        try:
            with db.begin_nested():
                loads.visible(db, p, row.id)
                load = loads.lock_load(db, row.id, p)
                if load.status != "planned":
                    raise Conflict("It already has a driver, or isn’t ready to plan", code="WRONG_STATE")
                found = eligibility.evaluate(db, load, p.today(), datetime.now(UTC), scope=p.scope, zone=p.timezone or "UTC")
                driver = next((d for d in found.drivers if d.eligible), None)
                if driver is None:
                    raise Conflict(next((d.reasons[0].message for d in found.drivers if d.reasons), "No driver is free"),
                                   code="NO_DRIVER")
                trucks = [v for v in found.vehicles if v.eligible]
                truck = next((v for v in trucks if driver.seat and v.id == driver.seat.vehicle_id), None) or \
                    (trucks[0] if trucks else None)
                if truck is None:
                    raise Conflict("No truck is free for it", code="NO_TRUCK")
                trailer = None
                if found.needs_trailer:
                    trailer = next((t for t in found.trailers if t.eligible), None)
                    if trailer is None:
                        raise Conflict("No suitable trailer is free for it", code="NO_TRAILER")
                made = assign(db, p, load, driver.id, truck.id, trailer.id if trailer else None,
                              reason="Best match from the dispatch board")
                db.flush()
                assigned.append({"load_id": load.id, "load_number": load.load_number, "driver": driver.name,
                                 "assignment_id": made.id, "version": load.version})
        except AppError as error:
            failed.append({"load_id": row.id, "load_number": row.load_number, "reason": error.message})
    missing = set(load_ids) - {r.id for r in rows}
    failed += [{"load_id": i, "load_number": "?", "reason": "Load not found"} for i in missing]
    return assigned, failed
