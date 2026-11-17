"""Dispatch teams: who works which trucks. A dispatcher is on one team at a time and a truck is in one team at a
time, so adding either to a team moves it from the team it was in. Every change is written to the audit log in
words, which is where the screen's list of changes comes from."""
import re
import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core import scope as team_scope
from app.core.audit import audit
from app.core.deps import Principal
from app.core.errors import Conflict, Invalid, NotFound
from app.modules.access.resolve import dispatcher_roles
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Vehicle
from app.modules.fleet.models import UnitAssignment
from app.modules.loads.models import Load
from app.modules.organizations.models import AuditLog, Membership, Organization, User
from app.modules.teams.models import DispatchTeam, DispatchTeamMember, DispatchTeamVehicle

COLORS = ("#1F4FE0", "#0B6E7F", "#5B3FD9", "#B54708", "#137A3E", "#B42318", "#475467")
OPEN = ("planned", "assigned", "dispatched", "at_pickup", "in_transit", "at_delivery", "delivered", "pod_review",
        "on_hold")


def _names(db: Session, ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all()) if ids else {}


def _listing(items: list[str]) -> str:
    if len(items) <= 3:
        return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"
    return f"{', '.join(items[:2])} and {len(items) - 2} more"


def _change(db: Session, p: Principal, team_id: uuid.UUID | None, action: str, text: str, **extra: Any) -> None:
    audit(db, p, f"dispatch_team.{action}", "dispatch_team", team_id, {"text": text, **extra})


def _team(db: Session, team_id: uuid.UUID) -> DispatchTeam:
    team = db.get(DispatchTeam, team_id)
    if team is None:
        raise NotFound("Dispatch team not found")
    return team


def _check_version(team: DispatchTeam, version: int | None) -> None:
    if version is not None and version != team.version:
        raise Conflict("Someone else changed this team. Look at the latest and try again.", code="VERSION_CONFLICT",
                       details={"current_version": team.version})


def _dispatchers(db: Session, ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    found = dict(db.execute(select(User.id, User.full_name).join(Membership, Membership.user_id == User.id)
                            .where(User.id.in_(ids), Membership.active.is_(True),
                                   Membership.role.in_(dispatcher_roles(db)))).all())
    if set(ids) - set(found):
        raise Invalid("Only dispatchers on the team can be put on a dispatch team", field="user_ids")
    return found


def _clean_name(db: Session, name: str, team_id: uuid.UUID | None = None) -> str:
    clean = re.sub(r"\s+", " ", (name or "").strip())
    if not clean:
        raise Invalid("Name the team", field="name")
    stmt = select(DispatchTeam.id).where(func.lower(DispatchTeam.name) == clean.lower())
    taken = db.scalar(stmt.where(DispatchTeam.id != team_id) if team_id else stmt)
    if taken:
        raise Invalid("Another dispatch team has that name", field="name")
    return clean[:60]


def create(db: Session, p: Principal, *, name: str, color: str | None, unassigned_loads: str,
           user_ids: list[uuid.UUID], vehicle_ids: list[uuid.UUID], lead_user_id: uuid.UUID | None) -> DispatchTeam:
    used = set(db.scalars(select(DispatchTeam.color)))
    pick = color or next((c for c in COLORS if c not in used), COLORS[0])
    if pick not in COLORS:
        raise Invalid("Choose one of the team colors", field="color")
    team = DispatchTeam(organization_id=p.org_id, name=_clean_name(db, name), color=pick,
                        unassigned_loads=unassigned_loads, created_by=p.user_id)
    db.add(team)
    db.flush()
    _change(db, p, team.id, "created", f"created {team.name}")
    if user_ids:
        set_members(db, p, team, user_ids, lead_user_id)
    if vehicle_ids:
        set_vehicles(db, p, team, vehicle_ids)
    return team


def update(db: Session, p: Principal, team: DispatchTeam, *, version: int | None, name: str | None,
           color: str | None, unassigned_loads: str | None, lead_user_id: uuid.UUID | None,
           clear_lead: bool) -> DispatchTeam:
    _check_version(team, version)
    if name is not None and name.strip() != team.name:
        new = _clean_name(db, name, team.id)
        _change(db, p, team.id, "renamed", f"renamed {team.name} to {new}")
        team.name = new
    if color is not None and color != team.color:
        if color not in COLORS:
            raise Invalid("Choose one of the team colors", field="color")
        team.color = color
    if unassigned_loads is not None and unassigned_loads != team.unassigned_loads:
        team.unassigned_loads = unassigned_loads
        _change(db, p, team.id, "queue", f"set {team.name} to see " +
                ("every unassigned load" if unassigned_loads == "shared" else "only unassigned loads tagged for it"))
    if clear_lead or lead_user_id is not None:
        _lead(db, p, team, None if clear_lead else lead_user_id)
    team.version += 1
    return team


def _lead(db: Session, p: Principal, team: DispatchTeam, lead_user_id: uuid.UUID | None) -> None:
    if lead_user_id == team.lead_user_id:
        return
    if lead_user_id is not None and not db.scalar(select(DispatchTeamMember.id).where(
            DispatchTeamMember.team_id == team.id, DispatchTeamMember.user_id == lead_user_id)):
        raise Invalid("The lead must be one of the team's dispatchers", field="lead_user_id")
    team.lead_user_id = lead_user_id
    if lead_user_id:
        _change(db, p, team.id, "lead", f"made {_names(db, [lead_user_id]).get(lead_user_id)} lead of {team.name}")


def set_members(db: Session, p: Principal, team: DispatchTeam, user_ids: list[uuid.UUID],
                lead_user_id: uuid.UUID | None = None) -> None:
    """The team's dispatchers become exactly `user_ids`; those on another team move here."""
    wanted = list(dict.fromkeys(user_ids))
    names = _dispatchers(db, wanted) if wanted else {}
    current = {m.user_id: m for m in db.scalars(select(DispatchTeamMember).where(DispatchTeamMember.team_id == team.id))}
    elsewhere = {m.user_id: m for m in db.scalars(select(DispatchTeamMember).where(
        DispatchTeamMember.user_id.in_(wanted), DispatchTeamMember.team_id != team.id))} if wanted else {}
    others = dict(db.execute(select(DispatchTeam.id, DispatchTeam.name).where(
        DispatchTeam.id.in_({m.team_id for m in elsewhere.values()}))).all()) if elsewhere else {}
    removed = [uid for uid in current if uid not in wanted]
    if removed:
        db.execute(delete(DispatchTeamMember).where(DispatchTeamMember.team_id == team.id,
                                                    DispatchTeamMember.user_id.in_(removed)))
        gone = _names(db, removed)
        _change(db, p, team.id, "members", f"removed {_listing([gone.get(u, 'someone') for u in removed])} from {team.name}")
        if team.lead_user_id in removed:
            team.lead_user_id = None
    for uid in wanted:
        if uid in current:
            continue
        if uid in elsewhere:
            old = elsewhere[uid]
            other = others.get(old.team_id, "another team")
            db.delete(old)
            db.flush()
            if db.scalar(select(DispatchTeam.lead_user_id).where(DispatchTeam.id == old.team_id)) == uid:
                db.execute(DispatchTeam.__table__.update().where(DispatchTeam.id == old.team_id).values(lead_user_id=None))
            _change(db, p, team.id, "members", f"moved {names[uid]} from {other} to {team.name}")
        else:
            _change(db, p, team.id, "members", f"added {names[uid]} to {team.name}")
        db.add(DispatchTeamMember(organization_id=p.org_id, team_id=team.id, user_id=uid))
    db.flush()
    if lead_user_id is not None:
        _lead(db, p, team, lead_user_id)
    team.version += 1


def set_vehicles(db: Session, p: Principal, team: DispatchTeam, vehicle_ids: list[uuid.UUID]) -> None:
    """The team's trucks become exactly `vehicle_ids`; trucks in another team move here."""
    wanted = list(dict.fromkeys(vehicle_ids))
    units = dict(db.execute(select(Vehicle.id, Vehicle.unit_number).where(Vehicle.id.in_(wanted))).all()) if wanted else {}
    if set(wanted) - set(units):
        raise Invalid("Choose trucks from the fleet", field="vehicle_ids")
    current = set(db.scalars(select(DispatchTeamVehicle.vehicle_id).where(DispatchTeamVehicle.team_id == team.id)))
    removed = [v for v in current if v not in wanted]
    if removed:
        gone = dict(db.execute(select(Vehicle.id, Vehicle.unit_number).where(Vehicle.id.in_(removed))).all())
        db.execute(delete(DispatchTeamVehicle).where(DispatchTeamVehicle.team_id == team.id,
                                                     DispatchTeamVehicle.vehicle_id.in_(removed)))
        _change(db, p, team.id, "trucks", f"removed {_listing(sorted(gone.values()))} from {team.name}")
    added = [v for v in wanted if v not in current]
    if added:
        moved = db.execute(select(DispatchTeamVehicle.vehicle_id, DispatchTeam.name)
                           .join(DispatchTeam, DispatchTeam.id == DispatchTeamVehicle.team_id)
                           .where(DispatchTeamVehicle.vehicle_id.in_(added))).all()
        if moved:
            db.execute(delete(DispatchTeamVehicle).where(DispatchTeamVehicle.vehicle_id.in_([m[0] for m in moved])))
            db.flush()
            by_team: dict[str, list[str]] = {}
            for vid, other in moved:
                by_team.setdefault(other, []).append(units[vid])
            for other, unit_list in by_team.items():
                _change(db, p, team.id, "trucks", f"moved {_listing(sorted(unit_list))} from {other} to {team.name}")
        fresh = [units[v] for v in added if v not in {m[0] for m in moved}]
        if fresh:
            _change(db, p, team.id, "trucks", f"added {_listing(sorted(fresh))} to {team.name}")
        for vid in added:
            db.add(DispatchTeamVehicle(organization_id=p.org_id, team_id=team.id, vehicle_id=vid))
    db.flush()
    team.version += 1


def remove(db: Session, p: Principal, team: DispatchTeam) -> None:
    name = team.name
    db.execute(Load.__table__.update().where(Load.dispatch_team_id == team.id).values(dispatch_team_id=None))
    db.delete(team)
    _change(db, p, None, "deleted", f"deleted {name}; its dispatchers and trucks have no team now")


def set_default(db: Session, p: Principal, value: str) -> None:
    org = db.get(Organization, p.org_id)
    if org.dispatchers_without_team != value:
        org.dispatchers_without_team = value
        _change(db, p, None, "default", "set dispatchers on no team to see " +
                ("every truck" if value == "all" else "no trucks"))


def overview(db: Session, p: Principal) -> dict[str, Any]:
    teams = list(db.scalars(select(DispatchTeam).order_by(DispatchTeam.name)))
    members = list(db.scalars(select(DispatchTeamMember)))
    placed = dict(db.execute(select(DispatchTeamVehicle.vehicle_id, DispatchTeamVehicle.team_id)).all())
    trucks = list(db.scalars(select(Vehicle).where(Vehicle.status != "retired").order_by(Vehicle.unit_number)))
    seats = db.execute(select(UnitAssignment.vehicle_id, UnitAssignment.driver_id, UnitAssignment.co_driver_id)
                       .where(UnitAssignment.effective_to.is_(None))).all()
    driver_ids = {d for _, a, b in seats for d in (a, b) if d}
    drivers = {d.id: f"{d.first_name} {d.last_name}" for d in db.scalars(select(Driver).where(Driver.id.in_(driver_ids)))} \
        if driver_ids else {}
    seated = {v: " & ".join(drivers[x] for x in (a, b) if x in drivers) for v, a, b in seats}
    dispatchers = db.execute(select(User.id, User.full_name).join(Membership, Membership.user_id == User.id)
                             .where(Membership.active.is_(True), Membership.role.in_(dispatcher_roles(db)))
                             .order_by(User.full_name)).all()
    team_of = {m.user_id: m.team_id for m in members}
    names = _names(db, [t.created_by for t in teams if t.created_by])
    org = db.get(Organization, p.org_id)
    out_teams = []
    for t in teams:
        scope = team_scope.Scope(t.id, t.name, frozenset(v for v, tid in placed.items() if tid == t.id),
                                 t.unassigned_loads == "shared")
        open_loads = db.scalar(select(func.count()).select_from(Load).where(
            Load.status.in_(OPEN), team_scope.loads(scope))) or 0
        out_teams.append({
            "id": t.id, "name": t.name, "color": t.color, "unassigned_loads": t.unassigned_loads,
            "lead_user_id": t.lead_user_id, "created_at": t.created_at, "created_by_name": names.get(t.created_by),
            "version": t.version, "open_loads": open_loads,
            "dispatchers": [{"id": uid, "name": name, "lead": uid == t.lead_user_id}
                            for uid, name in dispatchers if team_of.get(uid) == t.id],
            "vehicles": [{"id": v.id, "unit_number": v.unit_number, "driver_name": seated.get(v.id) or None}
                         for v in trucks if placed.get(v.id) == t.id],
        })
    changes = db.execute(select(AuditLog.actor_user_id, AuditLog.data, AuditLog.created_at)
                         .where(AuditLog.entity_type == "dispatch_team").order_by(AuditLog.created_at.desc()).limit(12)).all()
    actors = _names(db, [c[0] for c in changes if c[0]])
    return {
        "teams": out_teams,
        "no_team": {"dispatchers": [{"id": uid, "name": name, "lead": False} for uid, name in dispatchers if uid not in team_of],
                    "vehicles": sum(1 for v in trucks if v.id not in placed)},
        "total_vehicles": len(trucks),
        "dispatchers_without_team": org.dispatchers_without_team,
        "dispatchers": [{"id": uid, "name": name, "team_id": team_of.get(uid)} for uid, name in dispatchers],
        "trucks": [{"id": v.id, "unit_number": v.unit_number, "driver_name": seated.get(v.id) or None,
                    "team_id": placed.get(v.id)} for v in trucks],
        "changes": [{"who": actors.get(a) or "FlyFleet", "what": (d or {}).get("text", ""), "at": at}
                    for a, d, at in changes],
        "colors": list(COLORS),
    }
