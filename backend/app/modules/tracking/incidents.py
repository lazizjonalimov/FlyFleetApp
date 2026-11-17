"""Incidents: one per episode, whatever raised it. Speed rules read the positions trucks send; the other kinds are
worked out from the company's records (a load past its appointment, a truck at a dock too long, a load waiting
for a driver). Each incident has a state, an owner and a trail of who was told and what was done.

Record-based incidents are kept in step with the records by `sync`: raised when the condition starts, updated
while it lasts, and resolved on their own once it clears. A person acknowledges and resolves the rest.
"""
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, or_, select, text, update
from sqlalchemy.orm import Session

from app.core import places
from app.core.audit import audit
from app.core.deps import Principal
from app.core.errors import Conflict, Invalid
from app.modules.customers.models import Customer
from app.modules.dispatch.models import DispatchAssignment
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.fleet.models import UnitAssignment
from app.modules.loads.models import Load, LoadStop
from app.modules.loads.service import ROLLING
from app.modules.maintenance.models import WorkOrder
from app.modules.organizations.models import Membership, Organization, User
from app.modules.tracking import policies
from app.modules.tracking.models import AlertPolicy, Incident, IncidentEvent, VehiclePosition

PREFIX = {"speeding": "SPD", "yard_speed": "YRD", "dwell": "DWL", "gps_stale": "GPS", "late": "LTE", "at_risk": "RSK",
          "unassigned": "UNA", "pod_missing": "POD", "out_of_service": "OOS", "documents": "DOC"}
LABEL = {"speeding": "Speeding", "yard_speed": "Yard speed", "dwell": "Dwell", "gps_stale": "GPS stale", "late": "Late",
         "at_risk": "At risk", "unassigned": "Unassigned", "pod_missing": "POD missing",
         "out_of_service": "Out of service", "documents": "Documents"}
GROUPS = {"speeding": ("speeding", "yard_speed"), "late": ("late", "at_risk", "unassigned"),
          "documents": ("pod_missing", "documents"), "equipment": ("gps_stale", "out_of_service")}
# Kinds kept in step with the records: resolved on their own once the condition clears.
RECORD_KINDS = ("dwell", "gps_stale", "late", "at_risk", "unassigned", "pod_missing", "out_of_service", "documents")
SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}
AVERAGE_KMH = 88.0  # 55 mph, the planning speed for an ETA from the truck's last position
ROAD_FACTOR = 1.2   # roads are longer than the straight line


def duration(delta: timedelta) -> str:
    minutes = max(0, int(delta.total_seconds() // 60))
    if minutes < 60:
        return f"{minutes} min"
    hours, rest = divmod(minutes, 60)
    if hours < 48:
        return f"{hours}h {rest:02d}m" if rest else f"{hours} h"
    return f"{hours // 24} days"


def clock(p: Principal, at: datetime) -> str:
    return at.astimezone(ZoneInfo(p.timezone or "UTC")).strftime("%H:%M")


def _lock(db: Session, org_id: uuid.UUID) -> None:
    """One evaluation at a time per company, so an episode can't be raised twice."""
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"incidents:{org_id}"})


def _number(db: Session, org_id: uuid.UUID, kind: str) -> str:
    seq = db.execute(update(Organization).where(Organization.id == org_id)
                     .values(incident_seq=Organization.incident_seq + 1)
                     .returning(Organization.incident_seq)).scalar_one()
    return f"{PREFIX[kind]}-{seq:04d}"


def _event(db: Session, row: Incident, kind: str, at: datetime, text_: str, tone: str = "info",
           actor: uuid.UUID | None = None) -> None:
    db.add(IncidentEvent(organization_id=row.organization_id, incident_id=row.id, kind=kind, at=at, text=text_[:300],
                         tone=tone, actor_user_id=actor))


def _people(db: Session, role: str) -> list[tuple[uuid.UUID, str]]:
    return list(db.execute(select(User.id, User.full_name).join(Membership, Membership.user_id == User.id)
                           .where(Membership.role == role, Membership.active.is_(True)).order_by(User.full_name)).all())


def _who(db: Session, row: Incident, who: str) -> tuple[uuid.UUID | None, str | None]:
    """The person a recipient line means for this incident."""
    if who == "dispatcher_on_duty" and row.load_id:
        by = db.scalar(select(DispatchAssignment.assigned_by).where(DispatchAssignment.load_id == row.load_id,
                                                                    DispatchAssignment.status.in_(("active", "completed")))
                       .order_by(DispatchAssignment.created_at.desc()).limit(1))
        if by:
            name = db.scalar(select(User.full_name).where(User.id == by))
            if name:
                return by, name
    role = {"dispatcher_on_duty": "dispatcher", "safety_manager": "safety_manager",
            "fleet_manager": "fleet_manager"}.get(who)
    if role:
        found = _people(db, role) or _people(db, "admin") or _people(db, "owner")
        if found:
            return found[0]
    return None, None


def _channels(channels: list[str]) -> str:
    names = [policies.CHANNELS.get(c, c) for c in channels]
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


STANDARD = [{"who": "dispatcher_on_duty", "channels": ["in_app"], "when": "immediately"}]


def _notify(db: Session, row: Incident, policy: AlertPolicy | None, at: datetime) -> None:
    """Tell the people the policy names, the way it says. Only in-app reaches people today; channels that need a
    messaging connection are recorded as not sent, so nobody believes a driver was texted when they weren't."""
    for r in (policy.recipients if policy else STANDARD):
        if r.get("when") == "unacknowledged":
            row.escalate_at = row.detected_at + timedelta(minutes=r.get("after_minutes", 10))
            row.data = {**(row.data or {}), "escalate_to": r["who"], "escalate_channels": r["channels"]}
            continue
        reached = [c for c in r["channels"] if c in policies.CONNECTED]
        missed = [c for c in r["channels"] if c not in policies.CONNECTED]
        if r["who"] == "driver":
            _alert_driver(db, row, policy, r["channels"], at)
            continue
        user_id, name = _who(db, row, r["who"])
        if not name:
            continue
        label = policies.WHO.get(r["who"], r["who"])
        if reached:
            _event(db, row, "notified", at, f"{'Dispatch' if r['who'] == 'dispatcher_on_duty' else label} notified · "
                   f"{name} · {_channels(reached)}", "info")
            if row.state == "open":
                row.state = "notified"
            if row.owner_user_id is None:
                row.owner_user_id = user_id
        if missed:
            _event(db, row, "notified", at, f"{_channels(missed)} to the {label.lower()} not sent · not connected yet", "mu")


def _alert_driver(db: Session, row: Incident, policy: AlertPolicy | None, channels: list[str], at: datetime) -> None:
    """Send the policy's words to the driver. The driver app carries it when they are on the app (an app push
    needs a push connection, so the alert waits in the app's inbox); Telegram and SMS need a messaging connection.
    The alert also shows as a card in the driver's conversation, saying what reached them."""
    from app.modules.messaging import service as messaging
    driver = db.get(Driver, row.driver_id) if row.driver_id else None
    if driver is None:
        return
    name = f"{driver.first_name} {driver.last_name}"
    company = db.scalar(select(Organization.name).where(Organization.id == row.organization_id)) or "FlyFleet"
    unit = db.scalar(select(Vehicle.unit_number).where(Vehicle.id == row.vehicle_id)) if row.vehicle_id else None
    started = (row.data or {}).get("started_at")
    minutes = max(1, round((row.last_seen_at - datetime.fromisoformat(started)).total_seconds() / 60)) if started else 0
    threshold = (row.data or {}).get("threshold") or (policy.settings.get("threshold_mph") if policy else "")
    text_ = ((policy.message if policy and policy.message else None) or f"FlyFleet — {company}\n{row.title}.")
    text_ = (text_.replace("{company}", company).replace("{unit}", unit or "the truck")
             .replace("{threshold}", f"{threshold:g}" if isinstance(threshold, int | float) else str(threshold))
             .replace("{minutes}", str(minutes)))
    wanted = ["app" if c in ("app_push", "push", "in_app") else c for c in channels]
    lat, lon = (row.data or {}).get("lat"), (row.data or {}).get("lon")
    where = places.describe(float(lat), float(lon)) if lat is not None and lon is not None else None
    if where and where.startswith("Near "):
        where = "near " + where[5:]
    msg = messaging.tell_driver(
        db, row.organization_id, driver.id, event="alert", title=f"{LABEL[row.kind]} alert sent to driver",
        body=" · ".join(x for x in (row.title, where, f"policy {policy.name} v{policy.version}" if policy else None) if x),
        driver_text=text_, load_id=row.load_id, incident_id=row.id, channels=wanted)
    reached = messaging.reached(msg)
    missed = [c for c in channels if (("app" if c in ("app_push", "push", "in_app") else c) not in reached)]
    if reached:
        _event(db, row, "notified", at, f"Driver alerted · {name} · driver app", "info")
    if missed and reached:
        _event(db, row, "notified", at, f"{_channels(missed)} to the driver not sent · not connected yet", "mu")
    elif missed:
        why = []
        if any(c in ("app_push", "push", "in_app") for c in missed):
            why.append(f"{driver.first_name} isn't on the driver app")
        others = [c for c in missed if c not in ("app_push", "push", "in_app")]
        if others:
            why.append(f"{_channels(others)} {'is' if len(others) == 1 else 'are'}n't connected yet")
        _event(db, row, "notified", at, f"Driver not alerted · {' · '.join(why)}", "mu")


def _upsert(db: Session, p: Principal, *, kind: str, key: str, severity: str, title: str, detail: str | None,
            at: datetime, state: str = "open", vehicle_id: uuid.UUID | None = None, driver_id: uuid.UUID | None = None,
            load_id: uuid.UUID | None = None, policy: AlertPolicy | None = None, peak: float | None = None,
            data: dict[str, Any] | None = None, detected: str | None = None,
            since: datetime | None = None) -> tuple[Incident, bool]:
    """Raise an incident for an episode, or bring the open one up to date. `since` is when the condition began
    (the appointment that passed, the delivery, the last position), shown as when it was detected."""
    row = db.scalar(select(Incident).where(Incident.episode_key == key, Incident.state != "resolved"))
    if row is not None:
        row.title, row.detail, row.severity, row.last_seen_at = title, detail, severity, max(row.last_seen_at, at)
        row.cleared_at = None
        if peak is not None:
            row.peak = max(float(row.peak or 0), peak)
        if data:
            row.data = {**(row.data or {}), **data}
        if row.state == "watching" and state != "watching":
            row.state = "open"
            _event(db, row, "detected", at, detected or f"Now {title.lower()}", "warn")
            _notify(db, row, policy, at)
        return row, False
    row = Incident(organization_id=p.org_id, number=_number(db, p.org_id, kind), kind=kind, severity=severity,
                   state=state, episode_key=key, title=title, detail=detail, vehicle_id=vehicle_id, driver_id=driver_id,
                   load_id=load_id, policy_id=policy.id if policy else None,
                   policy_version=policy.version if policy else None, detected_at=min(since or at, at), last_seen_at=at,
                   peak=peak, data=data or {})
    db.add(row)
    db.flush()
    _event(db, row, "detected", at, detected or f"Detected — {title[0].lower()}{title[1:]}",
           "warn" if state == "watching" else "bad" if severity == "high" else "warn")
    if state != "watching":
        _notify(db, row, policy, at)
    return row, True


def _resolve(db: Session, row: Incident, at: datetime, why: str, actor: uuid.UUID | None = None) -> None:
    row.state, row.resolved_at, row.resolved_by, row.resolution = "resolved", at, actor, why[:300]
    row.escalate_at = None if row.escalated_at is None else row.escalate_at
    row.version += 1
    _event(db, row, "resolved", at, f"Cleared — {why}" if actor is None else f"Resolved — {why}", "ok", actor)


# ---------------------------------------------------------------- who is driving what
@dataclass
class OnTheRoad:
    load: Load
    vehicle_id: uuid.UUID
    driver_id: uuid.UUID
    customer: str
    stops: list[LoadStop] = field(default_factory=list)

    @property
    def next_stop(self) -> LoadStop | None:
        return next((s for s in self.stops if s.departed_at is None), None)


def on_the_road(db: Session) -> dict[uuid.UUID, OnTheRoad]:
    """Loads being hauled now, by truck."""
    rows = db.execute(select(Load, DispatchAssignment.vehicle_id, DispatchAssignment.driver_id, Customer.name)
                      .join(DispatchAssignment, and_(DispatchAssignment.load_id == Load.id,
                                                     DispatchAssignment.status == "active"))
                      .join(Customer, Customer.id == Load.customer_id)
                      .where(Load.status.in_(ROLLING))).all()
    out: dict[uuid.UUID, OnTheRoad] = {}
    for load, vehicle_id, driver_id, customer in rows:
        out[vehicle_id] = OnTheRoad(load, vehicle_id, driver_id, customer)
    if out:
        by_load = {r.load.id: r for r in out.values()}
        for stop in db.scalars(select(LoadStop).where(LoadStop.load_id.in_(list(by_load))).order_by(LoadStop.seq)):
            by_load[stop.load_id].stops.append(stop)
    return out


def seated(db: Session, vehicle_ids: list[uuid.UUID]) -> dict[uuid.UUID, uuid.UUID]:
    if not vehicle_ids:
        return {}
    return dict(db.execute(select(UnitAssignment.vehicle_id, UnitAssignment.driver_id)
                           .where(UnitAssignment.vehicle_id.in_(vehicle_ids), UnitAssignment.effective_to.is_(None))).all())


def latest_positions(db: Session, vehicle_ids: list[uuid.UUID] | None = None) -> dict[uuid.UUID, VehiclePosition]:
    stmt = select(VehiclePosition).distinct(VehiclePosition.vehicle_id).order_by(
        VehiclePosition.vehicle_id, VehiclePosition.recorded_at.desc())
    if vehicle_ids is not None:
        if not vehicle_ids:
            return {}
        stmt = stmt.where(VehiclePosition.vehicle_id.in_(vehicle_ids))
    return {r.vehicle_id: r for r in db.scalars(stmt)}


def eta(road: OnTheRoad, position: VehiclePosition | None, now: datetime) -> tuple[datetime | None, LoadStop | None]:
    """When the truck reaches its next stop: the straight-line distance from its last position, stretched to road
    miles, at planning speed. None without a recent position or a stop that can be put on the map."""
    stop = road.next_stop
    if stop is None or position is None or stop.arrived_at is not None:
        return None, stop
    if now - position.recorded_at > timedelta(hours=2):
        return None, stop
    where = places.locate(stop.city, stop.state)
    if where is None:
        return None, stop
    hours = places.km(float(position.lat), float(position.lon), *where) * ROAD_FACTOR / AVERAGE_KMH
    return max(now, position.recorded_at + timedelta(hours=hours)), stop


# ---------------------------------------------------------------- speed rules, from positions
def evaluate_speed(db: Session, p: Principal, vehicle_ids: list[uuid.UUID], now: datetime) -> list[Incident]:
    """Run the speed rules over the trucks that just reported. One incident per episode: more speeding inside the
    cooldown belongs to the same episode, however many samples see it."""
    raised: list[Incident] = []
    _lock(db, p.org_id)
    roads = on_the_road(db)
    seats = seated(db, vehicle_ids)
    for kind in ("speeding", "yard_speed"):
        for policy in policies.enabled(db, p, kind):
            st = policy.settings
            limit = st["threshold_mph"] + st.get("tolerance_mph", 0)
            cooldown = timedelta(minutes=st["cooldown_minutes"])
            for vid in vehicle_ids:
                if not policies.applies(policy, vid):
                    continue
                since = now - cooldown - timedelta(minutes=st["min_minutes"] + 30)
                samples = list(db.scalars(select(VehiclePosition).where(VehiclePosition.vehicle_id == vid,
                                                                        VehiclePosition.recorded_at >= since)
                                          .order_by(VehiclePosition.recorded_at)))
                if kind == "yard_speed":
                    samples = [s for s in samples if policies.in_yard(db, s.lat, s.lon)]
                key = f"{kind}:{policy.id}:{vid}"
                current = db.scalar(select(Incident).where(Incident.episode_key == key, Incident.state != "resolved"))
                found = policies.runs(samples, st)
                if not found:
                    usable = [s for s in samples if policies.usable(s, st)]
                    if current and current.cleared_at is None and usable and float(usable[-1].speed_mph) <= limit:
                        current.cleared_at = usable[-1].recorded_at
                    continue
                start, end, peak = found[-1]
                last = max((s for s in samples if s.recorded_at <= end), key=lambda s: s.recorded_at)
                road = roads.get(vid)
                place = places.describe(float(last.lat), float(last.lon), last.heading, True)
                title = f"Above {limit:g} mph for {duration(end - start)}"
                if current is not None:
                    if current.cleared_at is None or start - current.last_seen_at <= cooldown:
                        current.title, current.last_seen_at, current.cleared_at = title, end, None
                        current.peak = max(float(current.peak or 0), peak)
                        current.detail = f"Peak {float(current.peak):.0f} mph · {place} · {current.number}"
                        current.data = {**(current.data or {}), "lat": float(last.lat), "lon": float(last.lon)}
                        continue
                    current.episode_key = f"{key}:{current.id}"  # that episode is over; this is a new one
                recent = db.scalar(select(func.max(Incident.last_seen_at)).where(
                    Incident.policy_id == policy.id, Incident.vehicle_id == vid, Incident.state == "resolved"))
                if recent and start - recent <= cooldown:
                    continue  # the episode someone just resolved, still inside its cooldown
                row, _ = _upsert(db, p, kind=kind, key=key, severity="high" if kind == "speeding" else "medium",
                                 title=title, detail=None, at=end, vehicle_id=vid,
                                 driver_id=road.driver_id if road else seats.get(vid),
                                 load_id=road.load.id if road else None, policy=policy, peak=peak,
                                 data={"limit": limit, "threshold": st["threshold_mph"], "started_at": start.isoformat(),
                                       "lat": float(last.lat), "lon": float(last.lon)},
                                 detected=f"Detected — above {limit:g} mph for {duration(end - start)}")
                row.detail = f"Peak {peak:.0f} mph · {place} · {row.number}"
                raised.append(row)
    return raised


# ---------------------------------------------------------------- everything else, from the records
def _when(p: Principal, at: datetime) -> str:
    local = at.astimezone(ZoneInfo(p.timezone or "UTC")).date()
    days = (p.today() - local).days
    return "today" if days <= 0 else "yesterday" if days == 1 else f"{local:%b} {local.day}"


def sync(db: Session, p: Principal) -> None:
    """Bring the record-based incidents in step with the records, and escalate the ones nobody acknowledged. Run
    on every read of the alerts or the live fleet, so a change shows at once."""
    now = datetime.now(UTC)
    _lock(db, p.org_id)
    seen: set[str] = set()

    def keep(**kw: Any) -> None:
        seen.add(kw["key"])
        _upsert(db, p, **kw)

    roads = on_the_road(db)
    latest = latest_positions(db)
    stale_policies = policies.enabled(db, p, "gps_stale")
    dwell_policies = policies.enabled(db, p, "dwell")

    # GPS stale: a truck that has been reporting, on a load, and has gone quiet.
    for policy in stale_policies:
        minutes = policy.settings.get("minutes", 15)
        trucks = list(roads) if policy.settings.get("only_on_loads", True) else list(latest)
        for vid in trucks:
            pos = latest.get(vid)
            if pos is None or now - pos.recorded_at > timedelta(hours=24) or not policies.applies(policy, vid):
                continue  # never reported, or not tracked: nothing to go stale
            quiet = now - pos.recorded_at
            if quiet >= timedelta(minutes=minutes):
                road = roads.get(vid)
                keep(kind="gps_stale", key=f"gps_stale:{vid}", severity="medium",
                     title=f"No position for {duration(quiet)}",
                     detail=f"Last seen {places.describe(float(pos.lat), float(pos.lon))[0].lower()}"
                            f"{places.describe(float(pos.lat), float(pos.lon))[1:]} {clock(p, pos.recorded_at)}",
                     at=now, vehicle_id=vid, driver_id=road.driver_id if road else None,
                     load_id=road.load.id if road else None, policy=policy, since=pos.recorded_at,
                     data={"last_seen_at": pos.recorded_at.isoformat()})

    # Dwell: at a stop since arriving, watched first, an incident once past the policy's hours.
    for policy in dwell_policies:
        hours, watch = policy.settings.get("hours", 2), policy.settings.get("watch_from_minutes", 30)
        for road in roads.values():
            for stop in road.stops:
                if stop.arrived_at is None or stop.departed_at is not None:
                    continue
                stay = now - stop.arrived_at
                if stay < timedelta(minutes=watch):
                    continue
                over = stay >= timedelta(hours=hours)
                where = stop.name or f"{stop.city}{', ' + stop.state if stop.state else ''}"
                keep(kind="dwell", key=f"dwell:{stop.id}", severity="medium" if over else "low",
                     state="open" if over else "watching",
                     title=f"At {stop.type} for {duration(stay)}",
                     detail=f"{where} · {'detention running' if over else f'detention starts at {hours:g} h'}",
                     at=now, vehicle_id=road.vehicle_id, driver_id=road.driver_id, load_id=road.load.id,
                     policy=policy, detected=f"Past {hours:g} h at {where}" if over else f"Arrived at {where}",
                     since=stop.arrived_at)

    # Late and at risk: appointments passed, or an ETA that misses them.
    for road in roads.values():
        load = road.load
        position = latest.get(road.vehicle_id)
        arrive, stop = eta(road, position, now)
        if stop is None or stop.arrived_at is not None:
            continue
        appt = stop.appt_end or stop.appt_start
        if appt is None:
            continue
        where = stop.name or f"{stop.city}{', ' + stop.state if stop.state else ''}"
        if now > appt:
            title = (f"ETA {duration(arrive - appt)} past appointment" if arrive
                     else f"{duration(now - appt)} past the appointment")
            keep(kind="late", key=f"late:{load.id}:{stop.id}", severity="high", title=title,
                 detail=f"{where} · appt {clock(p, appt)}", at=now, vehicle_id=road.vehicle_id,
                 driver_id=road.driver_id, load_id=load.id, data={"eta": arrive.isoformat() if arrive else None},
                 since=appt)
        elif arrive and arrive > appt + timedelta(minutes=15):
            keep(kind="at_risk", key=f"at_risk:{load.id}:{stop.id}", severity="high",
                 title=f"Will miss the {clock(p, appt)} appointment", detail=f"ETA {clock(p, arrive)} · {where}",
                 at=now, vehicle_id=road.vehicle_id, driver_id=road.driver_id, load_id=load.id,
                 data={"eta": arrive.isoformat()})
    # Loads not on the road yet that are already late for pickup.
    waiting = db.execute(select(Load, Customer.name).join(Customer, Customer.id == Load.customer_id)
                         .where(Load.status.in_(("planned", "assigned")), Load.pickup_at.is_not(None))).all()
    for load, customer in waiting:
        if load.pickup_at < now:
            keep(kind="late", key=f"late:{load.id}:pickup", severity="high",
                 title=f"Pickup {duration(now - load.pickup_at)} past the appointment",
                 detail=f"{customer} · {load.origin_city or ''} · appt {clock(p, load.pickup_at)}".replace(" ·  ·", " ·"),
                 at=now, load_id=load.id, since=load.pickup_at)
        elif load.status == "planned" and load.pickup_at < now + timedelta(hours=24):
            left = load.pickup_at - now
            keep(kind="unassigned", key=f"unassigned:{load.id}", severity="high" if left < timedelta(hours=4) else "medium",
                 title=f"Pickup in {duration(left)} with no driver",
                 detail=" · ".join(x for x in (customer, load.origin_city) if x), at=now, load_id=load.id,
                 since=max(load.created_at, load.pickup_at - timedelta(hours=24)))

    # Delivered without proof of delivery.
    for load, customer in db.execute(select(Load, Customer.name).join(Customer, Customer.id == Load.customer_id)
                                     .where(Load.status == "delivered")).all():
        delivered = load.delivered_at or load.updated_at
        keep(kind="pod_missing", key=f"pod:{load.id}", severity="medium",
             title=f"Delivered {_when(p, delivered)}, no POD",
             detail=" · ".join(x for x in (customer, load.destination_city) if x), at=now, load_id=load.id,
             since=delivered)

    # Out of service: a truck or trailer held out by an open repair, or set out of service.
    repairs = db.execute(select(WorkOrder).where(WorkOrder.out_of_service.is_(True),
                                                 WorkOrder.status.in_(("open", "in_progress")))).scalars().all()
    held = set()
    for wo in repairs:
        unit = wo.vehicle_id or wo.trailer_id
        if unit is None or unit in held:
            continue
        held.add(unit)
        keep(kind="out_of_service", key=f"oos:{unit}", severity="medium", title=wo.title,
             detail=f"{wo.number} · {'in the shop' if wo.status == 'in_progress' else 'waiting to start'}", at=now,
             vehicle_id=wo.vehicle_id, since=wo.created_at,
             data={"work_order_id": str(wo.id), "trailer_id": str(wo.trailer_id) if wo.trailer_id else None})
    for model, word in ((Vehicle, "Truck"), (Trailer, "Trailer")):
        for unit in db.scalars(select(model).where(model.status == "out_of_service")):
            if unit.id in held:
                continue
            keep(kind="out_of_service", key=f"oos:{unit.id}", severity="medium", title=f"{word} out of service",
                 detail=unit.notes[:120] if unit.notes else "No open repair", at=now,
                 vehicle_id=unit.id if model is Vehicle else None,
                 data={"trailer_id": str(unit.id)} if model is Trailer else None)

    # Paperwork that has run out, which keeps a driver or unit off the road.
    from app.modules.safety.router import items
    from app.modules.safety.rules import ITEM_LABELS
    t = items()
    for row in db.execute(select(t).where(t.c.expires_on < p.today(), t.c.blocks_dispatch.is_(True))).mappings():
        label = ITEM_LABELS.get(row["item"], str(row["item"]).replace("_", " ").capitalize())
        keep(kind="documents", key=f"doc:{row['entity_type']}:{row['entity_id']}:{row['item']}", severity="high",
             title=f"{label} expired", detail=f"{row['entity_label']} · {row['expires_on']:%b} {row['expires_on'].day}",
             at=now, since=datetime.combine(row["expires_on"] + timedelta(days=1), datetime.min.time(),
                                            ZoneInfo(p.timezone or "UTC")),
             vehicle_id=row["entity_id"] if row["entity_type"] == "vehicle" else None,
             driver_id=row["entity_id"] if row["entity_type"] == "driver" else None,
             data={"entity_type": row["entity_type"], "entity_id": str(row["entity_id"])})

    # What cleared on its own.
    reasons = {"dwell": "left the stop", "gps_stale": "positions coming in again", "late": "arrived",
               "at_risk": "back on time", "unassigned": "a driver was assigned", "pod_missing": "proof of delivery in",
               "out_of_service": "back in service", "documents": "renewed"}
    for row in db.scalars(select(Incident).where(Incident.state != "resolved", Incident.kind.in_(RECORD_KINDS))):
        if row.episode_key not in seen:
            _resolve(db, row, now, reasons.get(row.kind, "cleared"))

    # Escalations nobody acknowledged in time.
    for row in db.scalars(select(Incident).where(Incident.state.in_(("open", "notified")), Incident.escalate_at <= now,
                                                 Incident.escalated_at.is_(None))):
        who = (row.data or {}).get("escalate_to", "safety_manager")
        channels = (row.data or {}).get("escalate_channels", [])
        _, name = _who(db, row, who)
        row.escalated_at = now
        reached = [c for c in channels if c in policies.CONNECTED]
        how = _channels(reached) if reached else f"shown in app · {_channels(channels)} not connected yet"
        _event(db, row, "escalated", now, f"Escalated to {policies.WHO.get(who, who).lower()} · {name or 'nobody set'} · "
               f"{how}", "warn")


# ---------------------------------------------------------------- what people do
def act(db: Session, p: Principal, row: Incident, action: str, *, version: int | None = None, note: str | None = None,
        owner_id: uuid.UUID | None = None) -> Incident:
    if version is not None and version != row.version:
        raise Conflict("Someone else changed this incident. Look at the latest and try again.",
                       code="VERSION_CONFLICT", details={"current_version": row.version})
    now = datetime.now(UTC)
    name = db.scalar(select(User.full_name).where(User.id == p.user_id)) or "Someone"
    if action == "acknowledge":
        if row.state not in ("open", "notified", "watching"):
            raise Conflict("Only an open incident can be acknowledged", code="WRONG_STATE")
        row.state, row.acknowledged_by, row.acknowledged_at = "acknowledged", p.user_id, now
        if row.escalated_at is None:
            row.escalate_at = None
        if row.owner_user_id is None:
            row.owner_user_id = p.user_id
        _event(db, row, "acknowledged", now, f"{name} acknowledged{' · ' + note.strip() if note and note.strip() else ''}",
               "ok", p.user_id)
    elif action == "resolve":
        if row.state == "resolved":
            raise Conflict("This incident is already resolved", code="WRONG_STATE")
        _resolve(db, row, now, (note or "").strip() or "resolved", p.user_id)
        return _audited(db, p, row, action, note)
    elif action == "reopen":
        if row.state != "resolved":
            raise Conflict("Only a resolved incident can be reopened", code="WRONG_STATE")
        if db.scalar(select(Incident.id).where(Incident.episode_key == row.episode_key, Incident.state != "resolved")):
            raise Conflict("A newer incident for the same thing is open", code="ALREADY_OPEN")
        row.state, row.resolved_at, row.resolved_by, row.resolution = "open", None, None, None
        _event(db, row, "reopened", now, f"{name} reopened it", "warn", p.user_id)
    elif action == "assign":
        if owner_id is None:
            raise Invalid("Choose who owns it", field="owner_id")
        owner = db.scalar(select(User.full_name).join(Membership, Membership.user_id == User.id)
                          .where(User.id == owner_id, Membership.active.is_(True)))
        if owner is None:
            raise Invalid("Not a member of this company", field="owner_id")
        row.owner_user_id = owner_id
        _event(db, row, "owner", now, f"{name} gave it to {owner}", "info", p.user_id)
    elif action == "note":
        if not note or not note.strip():
            raise Invalid("Write the note", field="note")
        _event(db, row, "note", now, f"{name}: {note.strip()}", "mu", p.user_id)
    else:
        raise Invalid("Unknown action", field="action")
    row.version += 1
    return _audited(db, p, row, action, note)


def _audited(db: Session, p: Principal, row: Incident, action: str, note: str | None) -> Incident:
    audit(db, p, f"incident.{action}", "incident", row.id, {"number": row.number, "state": row.state,
                                                           **({"note": note.strip()[:200]} if note and note.strip() else {})})
    return row


def counts(db: Session) -> dict[str, int]:
    rows = dict(db.execute(select(Incident.kind, func.count()).where(Incident.state != "resolved")
                           .group_by(Incident.kind)).all())
    out = {"open": sum(rows.values())}
    for group, kinds in GROUPS.items():
        out[group] = sum(rows.get(k, 0) for k in kinds)
    out["high"] = db.scalar(select(func.count()).select_from(Incident).where(Incident.state != "resolved",
                                                                            Incident.severity == "high")) or 0
    return out


def visible(stmt, p: Principal):
    """Each role sees the kinds it works on: dispatch the road, safety the papers and the speed, everyone else what
    they can already see elsewhere."""
    kinds = set()
    if p.can("tracking.read"):
        kinds |= {"speeding", "yard_speed", "gps_stale", "dwell"}
    if p.can("loads.read"):
        kinds |= {"late", "at_risk", "unassigned", "pod_missing", "dwell"}
    if p.can("safety.read"):
        kinds |= {"documents"}
    if p.can("maintenance.read") or p.can("equipment.read"):
        kinds |= {"out_of_service"}
    return stmt.where(Incident.kind.in_(sorted(kinds)) if kinds else or_(False))
