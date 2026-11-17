"""Dispatch team scope: what part of the fleet a dispatcher sees.

A dispatcher on a dispatch team sees the team's trucks and everything tied to them: the loads on those trucks (and
unassigned loads tagged for the team, or every unassigned load when the team works the shared queue), the drivers
seated on or hauling with those trucks, and their positions and alerts. Everyone else sees the whole fleet, except
dispatchers on no team when the company has chosen that they see nothing until they are put on one.

The scope narrows what a role can already see; it never adds access. Each endpoint that reads loads, trucks,
drivers or alerts applies the clauses here, so pages, search, the map, exports and counts agree.
"""
import uuid
from dataclasses import dataclass

from sqlalchemy import ColumnElement, and_, false, or_, select, true
from sqlalchemy.orm import Session

from app.core.errors import NotFound


@dataclass(frozen=True)
class Scope:
    team_id: uuid.UUID | None
    team_name: str | None
    vehicle_ids: frozenset[uuid.UUID]
    # Unassigned loads: all of them (assignable only to the team's trucks), or only those tagged for the team.
    shared_queue: bool
    lead_name: str | None = None


def load_scope(db: Session, *, user_id: uuid.UUID | None = None, team_id: uuid.UUID | None = None,
               without_team: str = "all") -> Scope | None:
    """The scope of a dispatcher (by `user_id`), or of a team (by `team_id`, for a preview). None: the whole fleet."""
    from app.modules.organizations.models import User
    from app.modules.teams.models import DispatchTeam, DispatchTeamMember, DispatchTeamVehicle
    stmt = select(DispatchTeam.id, DispatchTeam.name, DispatchTeam.unassigned_loads, DispatchTeam.lead_user_id)
    if team_id is not None:
        row = db.execute(stmt.where(DispatchTeam.id == team_id)).first()
        if row is None:
            raise NotFound("Dispatch team not found")
    else:
        row = db.execute(stmt.join(DispatchTeamMember, DispatchTeamMember.team_id == DispatchTeam.id)
                         .where(DispatchTeamMember.user_id == user_id)).first()
        if row is None:
            return None if without_team == "all" else Scope(None, None, frozenset(), False)
    vehicles = frozenset(db.scalars(select(DispatchTeamVehicle.vehicle_id).where(DispatchTeamVehicle.team_id == row.id)))
    # Who the team's view is shown as: its lead, else the first of its dispatchers.
    lead = db.scalar(select(User.full_name).where(User.id == row.lead_user_id)) if row.lead_user_id else None
    lead = lead or db.scalar(select(User.full_name).join(DispatchTeamMember, DispatchTeamMember.user_id == User.id)
                             .where(DispatchTeamMember.team_id == row.id).order_by(User.full_name).limit(1))
    return Scope(row.id, row.name, vehicles, row.unassigned_loads == "shared", lead)


def _ids(scope: Scope) -> list[uuid.UUID]:
    return sorted(scope.vehicle_ids)


def vehicles(scope: Scope | None, column) -> ColumnElement | None:
    """Trucks the scope covers."""
    if scope is None:
        return None
    return column.in_(_ids(scope)) if scope.vehicle_ids else false()


def has_vehicle(scope: Scope | None, vehicle_id: uuid.UUID | None) -> bool:
    return scope is None or (vehicle_id is not None and vehicle_id in scope.vehicle_ids)


def loads(scope: Scope | None, load_id=None, team_column=None) -> ColumnElement | None:
    """Loads on the scope's trucks, and the unassigned loads it works."""
    if scope is None:
        return None
    from app.modules.dispatch.models import DispatchAssignment
    from app.modules.loads.models import Load
    load_id = load_id if load_id is not None else Load.id
    team_column = team_column if team_column is not None else Load.dispatch_team_id
    held = select(DispatchAssignment.load_id).where(DispatchAssignment.status.in_(("active", "completed")))
    on_team = held.where(DispatchAssignment.vehicle_id.in_(_ids(scope))) if scope.vehicle_ids else None
    queue = true() if scope.shared_queue else (team_column == scope.team_id if scope.team_id else false())
    waiting = and_(load_id.notin_(held), queue)
    return or_(load_id.in_(on_team), waiting) if on_team is not None else waiting


def drivers(scope: Scope | None, column) -> ColumnElement | None:
    """Drivers seated on the scope's trucks, or hauling a load with one."""
    if scope is None:
        return None
    if not scope.vehicle_ids:
        return false()
    from app.modules.dispatch.models import DispatchAssignment
    from app.modules.fleet.models import UnitAssignment
    ids = _ids(scope)
    seat = UnitAssignment.effective_to.is_(None) & UnitAssignment.vehicle_id.in_(ids)
    hauling = (DispatchAssignment.status == "active") & DispatchAssignment.vehicle_id.in_(ids)
    return or_(column.in_(select(UnitAssignment.driver_id).where(seat)),
               column.in_(select(UnitAssignment.co_driver_id).where(seat, UnitAssignment.co_driver_id.is_not(None))),
               column.in_(select(DispatchAssignment.driver_id).where(hauling)),
               column.in_(select(DispatchAssignment.co_driver_id).where(hauling,
                                                                       DispatchAssignment.co_driver_id.is_not(None))))


def incidents(scope: Scope | None) -> ColumnElement | None:
    """Alerts about the scope's trucks, or about its loads and drivers when no truck is named. Alerts tied to no
    truck, load or driver (a trailer out of service) are the whole company's."""
    if scope is None:
        return None
    from app.modules.drivers.models import Driver
    from app.modules.loads.models import Load
    from app.modules.tracking.models import Incident
    on_truck = vehicles(scope, Incident.vehicle_id)
    tied = or_(Incident.load_id.in_(select(Load.id).where(loads(scope))),
               Incident.driver_id.in_(select(Driver.id).where(drivers(scope, Driver.id))))
    loose = and_(Incident.load_id.is_(None), Incident.driver_id.is_(None))
    return or_(on_truck, and_(Incident.vehicle_id.is_(None), or_(tied, loose)))


def where(stmt, clause: ColumnElement | None):
    """`stmt` narrowed by a scope clause, or unchanged when there is no scope."""
    return stmt if clause is None else stmt.where(clause)
