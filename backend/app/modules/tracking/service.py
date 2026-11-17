"""Truck positions: taken in from telematics or the driver app, and read back as the live fleet and each truck's
trail. A position older than 2 minutes is delayed, older than 15 minutes stale."""
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core import places
from app.core import scope as team_scope
from app.core.audit import audit
from app.core.deps import Principal
from app.core.errors import Invalid, NotFound
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Vehicle
from app.modules.loads.models import Load
from app.modules.tracking import incidents, policies
from app.modules.tracking.models import Geofence, Incident, IncidentEvent, VehiclePosition

LIVE, DELAYED = timedelta(minutes=2), timedelta(minutes=15)
MOVING_MPH = 3
SOURCE_LABEL = {"telematics": "Vehicle telematics", "driver_app": "Driver app GPS", "manual": "Entered by hand"}


def freshness(at: datetime | None, now: datetime) -> str:
    if at is None:
        return "none"
    age = now - at
    return "live" if age <= LIVE else "delayed" if age <= DELAYED else "stale"


def ingest(db: Session, p: Principal, samples: list[dict[str, Any]], source: str) -> dict[str, int]:
    """Keep the samples (the same one sent twice is kept once), then run the speed rules on the trucks that
    reported and clear the GPS-stale incidents of trucks that came back."""
    now = datetime.now(UTC)
    known = set(db.scalars(select(Vehicle.id).where(Vehicle.id.in_({s["vehicle_id"] for s in samples}))))
    rows = []
    for i, s in enumerate(samples):
        if s["vehicle_id"] not in known:
            raise Invalid("Truck not found", field=f"samples.{i}.vehicle_id")
        if s["recorded_at"] > now + timedelta(minutes=2):
            raise Invalid("A position can't be from the future", field=f"samples.{i}.recorded_at")
        if s["recorded_at"] < now - timedelta(days=30):
            raise Invalid("Positions older than 30 days aren't taken", field=f"samples.{i}.recorded_at")
        rows.append({"organization_id": p.org_id, "vehicle_id": s["vehicle_id"], "driver_id": s.get("driver_id"),
                     "recorded_at": s["recorded_at"], "lat": Decimal(str(round(s["lat"], 6))),
                     "lon": Decimal(str(round(s["lon"], 6))),
                     "speed_mph": Decimal(str(round(s["speed_mph"], 1))) if s.get("speed_mph") is not None else None,
                     "heading": s.get("heading"), "accuracy_m": s.get("accuracy_m"), "odometer_mi": s.get("odometer_mi"),
                     "source": source})
    stmt = insert(VehiclePosition).values(rows).on_conflict_do_nothing(constraint="uq_vehicle_positions_sample")
    accepted = db.execute(stmt.returning(VehiclePosition.id)).fetchall()
    vehicles = sorted({r["vehicle_id"] for r in rows}, key=str)
    raised = incidents.evaluate_speed(db, p, vehicles, now)
    latest = incidents.latest_positions(db, vehicles)
    for row in db.scalars(select(Incident).where(Incident.kind == "gps_stale", Incident.state != "resolved",
                                                 Incident.vehicle_id.in_(vehicles))):
        pos = latest.get(row.vehicle_id)
        if pos and now - pos.recorded_at < LIVE:
            incidents._resolve(db, row, now, "positions coming in again")
    audit(db, p, "positions.received", "vehicle", vehicles[0] if len(vehicles) == 1 else None,
          {"source": source, "samples": len(rows), "kept": len(accepted), "trucks": len(vehicles),
           "incidents": [r.number for r in raised]})
    return {"received": len(rows), "kept": len(accepted), "duplicates": len(rows) - len(accepted),
            "incidents": len(raised)}


def _driver_names(db: Session, ids: set) -> dict:
    ids = {x for x in ids if x}
    return {d.id: f"{d.first_name} {d.last_name}" for d in db.scalars(select(Driver).where(Driver.id.in_(ids)))} if ids else {}


def live(db: Session, p: Principal) -> dict:
    """Every truck in service with where it last was, how fresh that is, what it is hauling and its open alert."""
    now = datetime.now(UTC)
    trucks = list(db.scalars(team_scope.where(select(Vehicle).where(Vehicle.status != "retired"),
                                              team_scope.vehicles(p.scope, Vehicle.id)).order_by(Vehicle.unit_number)))
    ids = [t.id for t in trucks]
    latest = incidents.latest_positions(db, ids)
    roads = incidents.on_the_road(db)
    seats = incidents.seated(db, ids)
    alerts: dict[uuid.UUID, Incident] = {}
    for row in db.scalars(incidents.visible(select(Incident).where(Incident.state.in_(("open", "notified", "acknowledged")),
                                                                    Incident.vehicle_id.in_(ids)), p)):
        best = alerts.get(row.vehicle_id)
        if best is None or (incidents.SEVERITY_ORDER[row.severity], row.state == "acknowledged") < \
                (incidents.SEVERITY_ORDER[best.severity], best.state == "acknowledged"):
            alerts[row.vehicle_id] = row
    names = _driver_names(db, {r.driver_id for r in roads.values()} | set(seats.values()))
    fences = list(db.scalars(select(Geofence).where(Geofence.active.is_(True)).order_by(Geofence.name)))

    def inside(lat: float, lon: float) -> Geofence | None:
        return next((g for g in fences if places.km(lat, lon, float(g.lat), float(g.lon)) * 1000 <= g.radius_m), None)

    out = []
    for t in trucks:
        pos = latest.get(t.id)
        road = roads.get(t.id)
        fresh = freshness(pos.recorded_at if pos else None, now)
        speed = float(pos.speed_mph) if pos and pos.speed_mph is not None else None
        moving = speed is not None and speed >= MOVING_MPH and fresh in ("live", "delayed")
        fence = inside(float(pos.lat), float(pos.lon)) if pos and not moving else None
        place = (f"At {fence.name}" if fence
                 else places.describe(float(pos.lat), float(pos.lon), pos.heading, moving) if pos else None)
        alert = alerts.get(t.id)
        stop = road.next_stop if road else None
        at_stop = stop is not None and stop.arrived_at is not None and stop.departed_at is None
        arrive, _ = incidents.eta(road, pos, now) if road else (None, None)
        appt = (stop.appt_end or stop.appt_start) if stop else None
        if alert and alert.kind in ("speeding", "yard_speed"):
            status = f"{place} · {incidents.LABEL[alert.kind].lower()}" if place else incidents.LABEL[alert.kind]
        elif at_stop:
            where = stop.name or stop.city
            status = f"At {stop.type} · {where} · {incidents.duration(now - stop.arrived_at)}"
        elif pos is None:
            status = "No position yet"
        elif fresh == "stale":
            status = f"{place} · last seen {incidents.clock(p, pos.recorded_at)}"
        elif moving:
            status = place + (f" · {incidents.LABEL[alert.kind].lower()}" if alert else "")
        else:
            where = place[0].lower() + place[1:] if fence else place
            status = f"Stopped · {where}" if road else f"Parked · {where}"
        driver_id = road.driver_id if road else seats.get(t.id)
        out.append({
            "vehicle_id": t.id, "unit_number": t.unit_number, "status": t.status,
            "driver": {"id": driver_id, "name": names.get(driver_id)} if driver_id else None,
            "position": {"lat": float(pos.lat), "lon": float(pos.lon), "speed_mph": speed, "heading": pos.heading,
                         "recorded_at": pos.recorded_at, "received_at": pos.received_at, "accuracy_m": pos.accuracy_m,
                         "source": pos.source} if pos else None,
            "freshness": fresh, "moving": moving, "place": place, "line": status,
            "load": {"id": road.load.id, "load_number": road.load.load_number, "status": road.load.status,
                     "lane": f"{road.load.origin_city or '—'} → {road.load.destination_city or '—'}",
                     "customer": road.customer, "next_stop": (stop.name or stop.city) if stop else None,
                     "next_stop_at": places.locate(stop.city, stop.state) if stop else None,
                     "eta": arrive, "appointment": appt,
                     "late_by_minutes": int((arrive - appt).total_seconds() // 60) if arrive and appt and arrive > appt else 0}
            if road else None,
            "incident": {"id": alert.id, "number": alert.number, "kind": alert.kind, "label": incidents.LABEL[alert.kind],
                         "severity": alert.severity, "state": alert.state, "title": alert.title} if alert else None,
        })
    reporting = sum(1 for x in out if x["freshness"] in ("live", "delayed"))
    sources = sorted({x["position"]["source"] for x in out if x["position"] and x["freshness"] != "none"})
    counts = {"all": len(out), "moving": sum(1 for x in out if x["moving"]),
              "stopped": sum(1 for x in out if x["position"] and not x["moving"] and x["freshness"] in ("live", "delayed")),
              "alerts": sum(1 for x in out if x["incident"]),
              "stale": sum(1 for x in out if x["freshness"] in ("stale",))}
    return {"now": now, "vehicles": out, "counts": counts, "reporting": reporting, "sources": sources,
            "geofences": [{"id": g.id, "name": g.name, "kind": g.kind, "lat": float(g.lat), "lon": float(g.lon),
                           "radius_m": g.radius_m} for g in fences]}


def track(db: Session, p: Principal, vehicle_id: uuid.UUID, since: datetime | None, until: datetime | None) -> dict:
    """A truck's trail, its speed over time, and the alert it has open, with that alert's trail of events."""
    if not team_scope.has_vehicle(p.scope, vehicle_id):
        raise NotFound("Truck not found")
    now = datetime.now(UTC)
    until = until or now
    since = since or until - timedelta(hours=2)
    if until - since > timedelta(days=2):
        raise Invalid("Show up to two days at a time", field="since")
    rows = list(db.scalars(select(VehiclePosition).where(VehiclePosition.vehicle_id == vehicle_id,
                                                         VehiclePosition.recorded_at >= since,
                                                         VehiclePosition.recorded_at <= until)
                           .order_by(VehiclePosition.recorded_at).limit(5000)))
    points = [{"at": r.recorded_at, "lat": float(r.lat), "lon": float(r.lon),
               "mph": float(r.speed_mph) if r.speed_mph is not None else None, "heading": r.heading} for r in rows]
    alert = db.scalar(incidents.visible(select(Incident).where(Incident.vehicle_id == vehicle_id,
                                                               Incident.state != "resolved"), p)
                      .order_by(Incident.detected_at.desc()).limit(1))
    km = sum(places.km(a["lat"], a["lon"], b["lat"], b["lon"]) for a, b in zip(points, points[1:], strict=False))
    return {"vehicle_id": vehicle_id, "since": since, "until": until, "points": points, "miles": round(km / 1.609, 1),
            "incident": incident_view(db, p, alert) if alert else None}


def incident_view(db: Session, p: Principal, row: Incident) -> dict:
    from app.modules.organizations.models import User
    events = list(db.scalars(select(IncidentEvent).where(IncidentEvent.incident_id == row.id).order_by(IncidentEvent.at,
                                                                                                        IncidentEvent.created_at)))
    users = {row.owner_user_id, row.acknowledged_by, row.resolved_by}
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_({u for u in users if u}))).all()) \
        if any(users) else {}
    unit = db.scalar(select(Vehicle.unit_number).where(Vehicle.id == row.vehicle_id)) if row.vehicle_id else None
    load = db.scalar(select(Load.load_number).where(Load.id == row.load_id)) if row.load_id else None
    driver = _driver_names(db, {row.driver_id}).get(row.driver_id) if row.driver_id else None
    policy = None
    if row.policy_id:
        from app.modules.tracking.models import AlertPolicy
        found = db.get(AlertPolicy, row.policy_id)
        if found:
            policy = {"id": found.id, "name": found.name, "version": row.policy_version or found.version}
    pending = None
    if row.escalate_at and row.escalated_at is None and row.state in ("open", "notified"):
        who = (row.data or {}).get("escalate_to", "safety_manager")
        pending = {"at": row.escalate_at, "text": f"Escalates to {policies.WHO.get(who, who).lower()} if not acknowledged"}
    return {"id": row.id, "number": row.number, "kind": row.kind, "label": incidents.LABEL[row.kind],
            "severity": row.severity, "state": row.state, "title": row.title, "detail": row.detail,
            "vehicle": {"id": row.vehicle_id, "unit_number": unit} if row.vehicle_id else None,
            "driver": {"id": row.driver_id, "name": driver} if row.driver_id else None,
            "load": {"id": row.load_id, "load_number": load} if row.load_id else None,
            "detected_at": row.detected_at, "last_seen_at": row.last_seen_at, "cleared_at": row.cleared_at,
            "peak": float(row.peak) if row.peak is not None else None, "data": row.data or {},
            "owner": {"id": row.owner_user_id, "name": names.get(row.owner_user_id)} if row.owner_user_id else None,
            "acknowledged_at": row.acknowledged_at, "acknowledged_by_name": names.get(row.acknowledged_by),
            "resolved_at": row.resolved_at, "resolved_by_name": names.get(row.resolved_by), "resolution": row.resolution,
            "policy": policy, "version": row.version, "pending": pending,
            "events": [{"at": e.at, "kind": e.kind, "text": e.text, "tone": e.tone} for e in events]}
