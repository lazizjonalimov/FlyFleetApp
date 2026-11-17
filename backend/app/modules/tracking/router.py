"""Live fleet, fleet alerts and alert policies."""
import csv
import io
import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import BigInteger, case, cast, extract, func, or_, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.deps import Principal, get_db, get_or_404, require
from app.core.errors import Invalid, NotFound
from app.core.pagination import Page, Sort, envelope, paginate
from app.modules.dispatch.models import DispatchAssignment
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Vehicle
from app.modules.fleet.models import UnitAssignment
from app.modules.loads.models import Load
from app.modules.organizations.models import User
from app.modules.tracking import incidents, policies, service
from app.modules.tracking.models import AlertPolicy, AlertPolicyVersion, Geofence, Incident

router = APIRouter(tags=["tracking"])
READ = require("tracking.read")
ALERTS = require("incidents.read")
POLICIES = require("alert_policies.manage")


# ---------------------------------------------------------------- positions in
class SampleIn(BaseModel):
    vehicle_id: uuid.UUID
    recorded_at: datetime
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    speed_mph: float | None = Field(default=None, ge=0, le=200)
    heading: int | None = Field(default=None, ge=0, le=359)
    accuracy_m: int | None = Field(default=None, ge=0, le=100000)
    odometer_mi: int | None = Field(default=None, ge=0)


class PositionsIn(BaseModel):
    source: Literal["telematics", "manual"] = "telematics"
    samples: list[SampleIn] = Field(min_length=1, max_length=1000)


class IngestOut(BaseModel):
    received: int
    kept: int
    duplicates: int
    incidents: int


@router.post("/positions", response_model=IngestOut, summary="Truck positions from telematics or another integration")
def positions(body: PositionsIn, p: Principal = Depends(require("tracking.ingest")), db: Session = Depends(get_db)):
    out = service.ingest(db, p, [s.model_dump() for s in body.samples], body.source)
    db.commit()
    return IngestOut(**out)


class DriverSampleIn(BaseModel):
    recorded_at: datetime
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    speed_mph: float | None = Field(default=None, ge=0, le=200)
    heading: int | None = Field(default=None, ge=0, le=359)
    accuracy_m: int | None = Field(default=None, ge=0, le=100000)


class DriverPositionsIn(BaseModel):
    samples: list[DriverSampleIn] = Field(min_length=1, max_length=500)


@router.post("/driver/positions", response_model=IngestOut,
             summary="The driver app's GPS, for the truck the driver is in: their load's truck, or their seat")
def driver_positions(body: DriverPositionsIn, p: Principal = Depends(require("driver.self")), db: Session = Depends(get_db)):
    driver = db.scalar(select(Driver).where(Driver.user_id == p.user_id))
    if driver is None:
        raise NotFound("Driver")
    truck = db.scalar(select(DispatchAssignment.vehicle_id).join(Load, Load.id == DispatchAssignment.load_id)
                      .where(DispatchAssignment.status == "active",
                             or_(DispatchAssignment.driver_id == driver.id, DispatchAssignment.co_driver_id == driver.id),
                             Load.status.in_(incidents.ROLLING)).limit(1)) \
        or db.scalar(select(UnitAssignment.vehicle_id).where(UnitAssignment.effective_to.is_(None),
                                                             or_(UnitAssignment.driver_id == driver.id,
                                                                 UnitAssignment.co_driver_id == driver.id)).limit(1))
    if truck is None:
        raise Invalid("You aren't in a truck right now", field="samples")
    samples = [{**s.model_dump(), "vehicle_id": truck, "driver_id": driver.id} for s in body.samples]
    out = service.ingest(db, p, samples, "driver_app")
    db.commit()
    return IngestOut(**out)


# ---------------------------------------------------------------- the live fleet
class LivePosition(BaseModel):
    lat: float
    lon: float
    speed_mph: float | None
    heading: int | None
    recorded_at: datetime
    received_at: datetime
    accuracy_m: int | None
    source: str


class LiveLoad(BaseModel):
    id: uuid.UUID
    load_number: str
    status: str
    lane: str
    customer: str
    next_stop: str | None
    # Where the next stop's city is, [latitude, longitude], when it is a known place.
    next_stop_at: tuple[float, float] | None
    eta: datetime | None
    appointment: datetime | None
    late_by_minutes: int
    # At the load's last delivery: from the truck's position through the stops still ahead, at planning speed.
    delivery_eta: datetime | None = None
    delivery_appointment: datetime | None = None
    delivery_late_by_minutes: int = 0


class FleetPerson(BaseModel):
    id: uuid.UUID | None
    name: str | None


class LiveIncident(BaseModel):
    id: uuid.UUID
    number: str
    kind: str
    label: str
    severity: str
    state: str
    title: str


class LiveVehicle(BaseModel):
    vehicle_id: uuid.UUID
    unit_number: str
    status: str
    driver: FleetPerson | None
    position: LivePosition | None
    freshness: Literal["live", "delayed", "stale", "none"]
    moving: bool
    place: str | None
    line: str
    load: LiveLoad | None
    incident: LiveIncident | None


class LiveCounts(BaseModel):
    all: int
    moving: int
    stopped: int
    alerts: int
    stale: int


class Fence(BaseModel):
    id: uuid.UUID
    name: str
    kind: str
    lat: float
    lon: float
    radius_m: int


class LiveOut(BaseModel):
    now: datetime
    vehicles: list[LiveVehicle]
    counts: LiveCounts
    reporting: int
    sources: list[str]
    geofences: list[Fence]


@router.get("/fleet/live", response_model=LiveOut,
            summary="Every truck: where it last was, how fresh that is, its load and alert")
def live(p: Principal = Depends(READ), db: Session = Depends(get_db)):
    incidents.sync(db, p)
    out = service.live(db, p)
    db.commit()
    return LiveOut(**out)


class TrackPoint(BaseModel):
    at: datetime
    lat: float
    lon: float
    mph: float | None
    heading: int | None


class IncidentEventOut(BaseModel):
    at: datetime
    kind: str
    text: str
    tone: str


class Pending(BaseModel):
    at: datetime
    text: str


class PolicyRef(BaseModel):
    id: uuid.UUID
    name: str
    version: int


class FleetUnit(BaseModel):
    id: uuid.UUID | None
    unit_number: str | None


class FleetLoad(BaseModel):
    id: uuid.UUID | None
    load_number: str | None


class IncidentOut(BaseModel):
    id: uuid.UUID
    number: str
    kind: str
    label: str
    severity: str
    state: str
    title: str
    detail: str | None
    vehicle: FleetUnit | None
    driver: FleetPerson | None
    load: FleetLoad | None
    detected_at: datetime
    last_seen_at: datetime
    cleared_at: datetime | None
    peak: float | None
    data: dict[str, Any]
    owner: FleetPerson | None
    acknowledged_at: datetime | None
    acknowledged_by_name: str | None
    resolved_at: datetime | None
    resolved_by_name: str | None
    resolution: str | None
    policy: PolicyRef | None
    version: int
    pending: Pending | None
    events: list[IncidentEventOut]


class TrackOut(BaseModel):
    vehicle_id: uuid.UUID
    since: datetime
    until: datetime
    points: list[TrackPoint]
    miles: float
    incident: IncidentOut | None


@router.get("/fleet/vehicles/{vehicle_id}/track", response_model=TrackOut,
            summary="A truck's trail and speed over a period (two hours by default), with its open alert")
def track(vehicle_id: uuid.UUID, since: datetime | None = None, until: datetime | None = None,
          p: Principal = Depends(READ), db: Session = Depends(get_db)):
    get_or_404(db, Vehicle, vehicle_id, "Truck")
    return TrackOut(**service.track(db, p, vehicle_id, since, until))


# ---------------------------------------------------------------- geofences
class FenceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: Literal["customer", "yard", "shop", "other"] = "customer"
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    radius_m: int = Field(default=400, ge=50, le=20000)
    customer_id: uuid.UUID | None = None


@router.get("/geofences", response_model=list[Fence], summary="Places with a circle around them")
def geofences(p: Principal = Depends(READ), db: Session = Depends(get_db)):
    return [Fence(id=g.id, name=g.name, kind=g.kind, lat=float(g.lat), lon=float(g.lon), radius_m=g.radius_m)
            for g in db.scalars(select(Geofence).where(Geofence.active.is_(True)).order_by(Geofence.name))]


@router.post("/geofences", response_model=Fence, status_code=201, summary="Draw a circle around a place")
def add_geofence(body: FenceIn, p: Principal = Depends(POLICIES), db: Session = Depends(get_db)):
    g = Geofence(organization_id=p.org_id, name=body.name.strip(), kind=body.kind, lat=body.lat, lon=body.lon,
                 radius_m=body.radius_m, customer_id=body.customer_id, created_by=p.user_id)
    db.add(g)
    db.flush()
    audit(db, p, "geofence.created", "geofence", g.id, body.model_dump(mode="json"))
    db.commit()
    return Fence(id=g.id, name=g.name, kind=g.kind, lat=float(g.lat), lon=float(g.lon), radius_m=g.radius_m)


@router.delete("/geofences/{geofence_id}", status_code=204, summary="Stop using a geofence")
def remove_geofence(geofence_id: uuid.UUID, p: Principal = Depends(POLICIES), db: Session = Depends(get_db)):
    g = get_or_404(db, Geofence, geofence_id, "Geofence")
    g.active = False
    audit(db, p, "geofence.removed", "geofence", g.id, {"name": g.name})
    db.commit()


# ---------------------------------------------------------------- incidents
Group = Literal["open", "speeding", "late", "documents", "equipment", "resolved"]


class IncidentRow(BaseModel):
    id: uuid.UUID
    number: str
    kind: str
    label: str
    severity: str
    state: str
    title: str
    detail: str | None
    vehicle: FleetUnit | None
    driver: FleetPerson | None
    load: FleetLoad | None
    detected_at: datetime
    owner: FleetPerson | None
    version: int


class IncidentCounts(BaseModel):
    open: int
    speeding: int
    late: int
    documents: int
    equipment: int
    high: int


class IncidentParams(BaseModel):
    group: Group = "open"
    kind: list[str] = Field(default_factory=list)
    owner_id: list[uuid.UUID] = Field(default_factory=list)
    vehicle_id: uuid.UUID | None = None
    load_id: uuid.UUID | None = None
    q: str | None = Field(default=None, max_length=100)
    cursor: str | None = None
    limit: int = Field(default=25, ge=1, le=200)
    count: bool = True
    format: Literal["json", "csv"] = "json"


def _rows(p: Principal, params: IncidentParams):
    driver_name = func.concat(Driver.first_name, " ", Driver.last_name)
    stmt = (select(Incident, Vehicle.unit_number, driver_name, Load.load_number, User.full_name)
            .outerjoin(Vehicle, Vehicle.id == Incident.vehicle_id)
            .outerjoin(Driver, Driver.id == Incident.driver_id)
            .outerjoin(Load, Load.id == Incident.load_id)
            .outerjoin(User, User.id == Incident.owner_user_id))
    stmt = incidents.visible(stmt, p)
    if params.group == "resolved":
        stmt = stmt.where(Incident.state == "resolved")
    else:
        stmt = stmt.where(Incident.state != "resolved")
        if params.group != "open":
            stmt = stmt.where(Incident.kind.in_(incidents.GROUPS[params.group]))
    if params.kind:
        stmt = stmt.where(Incident.kind.in_(params.kind))
    if params.owner_id:
        stmt = stmt.where(Incident.owner_user_id.in_(params.owner_id))
    if params.vehicle_id:
        stmt = stmt.where(Incident.vehicle_id == params.vehicle_id)
    if params.load_id:
        stmt = stmt.where(Incident.load_id == params.load_id)
    if params.q and params.q.strip():
        term = f"%{params.q.strip().lower()}%"
        fields = (Incident.title, func.coalesce(Incident.detail, ""), Incident.number,
                  func.coalesce(Vehicle.unit_number, ""), driver_name, func.coalesce(Load.load_number, ""))
        stmt = stmt.where(or_(*(func.lower(f).like(term) for f in fields)))
    return stmt


def _priority():
    """Unacknowledged first, then watching, then acknowledged; worst first; newest first."""
    state_rank = case((Incident.state.in_(("open", "notified")), 0), (Incident.state == "watching", 1), else_=2)
    severity_rank = case((Incident.severity == "high", 0), (Incident.severity == "medium", 1), else_=2)
    return (cast(state_rank, BigInteger) * 10**12 + cast(severity_rank, BigInteger) * 10**11
            - cast(extract("epoch", Incident.detected_at), BigInteger))


def _row(r) -> IncidentRow:
    row, unit, driver, load, owner = r
    return IncidentRow(id=row.id, number=row.number, kind=row.kind, label=incidents.LABEL[row.kind], severity=row.severity,
                       state=row.state, title=row.title, detail=row.detail,
                       vehicle=FleetUnit(id=row.vehicle_id, unit_number=unit) if row.vehicle_id else None,
                       driver=FleetPerson(id=row.driver_id, name=driver) if row.driver_id else None,
                       load=FleetLoad(id=row.load_id, load_number=load) if row.load_id else None, detected_at=row.detected_at,
                       owner=FleetPerson(id=row.owner_user_id, name=owner) if row.owner_user_id else None, version=row.version)


@router.get("/incidents", response_model=Page[IncidentRow], summary="Fleet alerts: one incident per episode",
            responses={200: {"content": {"text/csv": {}}}})
def list_incidents(params: Annotated[IncidentParams, Query()], p: Principal = Depends(ALERTS), db: Session = Depends(get_db)):
    incidents.sync(db, p)
    db.commit()
    stmt = _rows(p, params)
    if params.group == "resolved":
        sort = Sort("resolved", func.coalesce(Incident.resolved_at, Incident.detected_at), True)
    else:
        sort = Sort("priority", _priority(), False)
    if params.format == "csv":
        rows = db.execute(stmt.order_by(sort.column.desc() if sort.descending else sort.column, Incident.id).limit(5000)).all()
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["Number", "Type", "Incident", "Detail", "Truck", "Driver", "Load", "Detected", "State", "Owner"])
        for r in rows:
            x = _row(r)
            w.writerow([x.number, x.label, x.title, x.detail or "", x.vehicle.unit_number if x.vehicle else "",
                        x.driver.name if x.driver else "", x.load.load_number if x.load else "",
                        x.detected_at.isoformat(), x.state, x.owner.name if x.owner else ""])
        audit(db, p, "incidents.exported", "incident", None, {"group": params.group, "rows": len(rows)})
        db.commit()
        return Response(content="﻿" + out.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="fleet-alerts-{params.group}.csv"'})
    rows, info = paginate(db, stmt, sort, Incident.id, cursor=params.cursor, limit=params.limit, count=params.count)
    return envelope([_row(r) for r in rows], info)


@router.get("/incidents/counts", response_model=IncidentCounts, summary="Open incidents by tab")
def incident_counts(p: Principal = Depends(ALERTS), db: Session = Depends(get_db)):
    incidents.sync(db, p)
    db.commit()
    base = incidents.visible(select(Incident.kind, Incident.severity).where(Incident.state != "resolved"), p).subquery()
    rows = db.execute(select(base.c.kind, base.c.severity, func.count()).group_by(base.c.kind, base.c.severity)).all()
    by_kind: dict[str, int] = {}
    high = 0
    for kind, severity, n in rows:
        by_kind[kind] = by_kind.get(kind, 0) + n
        high += n if severity == "high" else 0
    groups = {g: sum(by_kind.get(k, 0) for k in kinds) for g, kinds in incidents.GROUPS.items()}
    return IncidentCounts(open=sum(by_kind.values()), high=high, **groups)


def _one(db: Session, p: Principal, incident_id: uuid.UUID) -> Incident:
    row = db.scalar(incidents.visible(select(Incident).where(Incident.id == incident_id), p))
    if row is None:
        raise NotFound("Incident")
    return row


@router.get("/incidents/{incident_id}", response_model=IncidentOut, summary="An incident with its trail")
def get_incident(incident_id: uuid.UUID, p: Principal = Depends(ALERTS), db: Session = Depends(get_db)):
    return IncidentOut(**service.incident_view(db, p, _one(db, p, incident_id)))


class IncidentActionIn(BaseModel):
    action: Literal["acknowledge", "resolve", "reopen", "assign", "note"]
    version: int | None = None
    note: str | None = Field(default=None, max_length=300)
    owner_id: uuid.UUID | None = None


@router.post("/incidents/{incident_id}/actions", response_model=IncidentOut,
             summary="Acknowledge, resolve, reopen, give to someone, or add a note")
def incident_action(incident_id: uuid.UUID, body: IncidentActionIn, p: Principal = Depends(require("incidents.manage")),
                    db: Session = Depends(get_db)):
    row = _one(db, p, incident_id)
    incidents.act(db, p, row, body.action, version=body.version, note=body.note, owner_id=body.owner_id)
    db.commit()
    return IncidentOut(**service.incident_view(db, p, row))


# ---------------------------------------------------------------- alert policies
class Recipient(BaseModel):
    who: Literal["driver", "dispatcher_on_duty", "safety_manager", "fleet_manager"]
    channels: list[Literal["in_app", "push", "app_push", "telegram", "sms", "email"]] = Field(min_length=1)
    when: Literal["immediately", "unacknowledged"] = "immediately"
    after_minutes: int | None = Field(default=None, ge=1, le=240)


class PolicyIn(BaseModel):
    kind: Literal["speeding", "yard_speed", "dwell", "gps_stale"]
    name: str = Field(min_length=1, max_length=80)
    enabled: bool = True
    settings: dict[str, Any]
    recipients: list[Recipient] = Field(min_length=1, max_length=6)
    message: str | None = Field(default=None, max_length=600)
    applies_to: dict[str, Any] = Field(default_factory=lambda: {"trucks": "all", "hours": "all_day"})
    version: int | None = None
    note: str | None = Field(default=None, max_length=300)


class PolicyOut(BaseModel):
    id: uuid.UUID
    kind: str
    name: str
    enabled: bool
    version: int
    settings: dict[str, Any]
    recipients: list[dict[str, Any]]
    message: str | None
    applies_to: dict[str, Any]
    updated_at: datetime
    updated_by_name: str | None
    open_incidents: int


class ChannelOut(BaseModel):
    key: str
    label: str
    connected: bool


class PoliciesOut(BaseModel):
    policies: list[PolicyOut]
    channels: list[ChannelOut]
    has_yard: bool


def _policy_out(db: Session, row: AlertPolicy) -> PolicyOut:
    name = db.scalar(select(User.full_name).where(User.id == row.updated_by)) if row.updated_by else None
    n = db.scalar(select(func.count()).select_from(Incident).where(Incident.policy_id == row.id,
                                                                   Incident.state != "resolved")) or 0
    return PolicyOut(id=row.id, kind=row.kind, name=row.name, enabled=row.enabled, version=row.version,
                     settings=row.settings, recipients=row.recipients, message=row.message, applies_to=row.applies_to,
                     updated_at=row.updated_at, updated_by_name=name, open_incidents=n)


@router.get("/alert-policies", response_model=PoliciesOut, summary="Fleet alert policies, and the channels that reach people")
def list_policies(p: Principal = Depends(ALERTS), db: Session = Depends(get_db)):
    rows = policies.ensure(db, p)
    db.commit()
    has_yard = bool(db.scalar(select(func.count()).select_from(Geofence).where(Geofence.kind == "yard",
                                                                              Geofence.active.is_(True))))
    return PoliciesOut(policies=[_policy_out(db, r) for r in rows], has_yard=has_yard,
                       channels=[ChannelOut(key=k, label=v, connected=k in policies.CONNECTED)
                                 for k, v in policies.CHANNELS.items()])


@router.post("/alert-policies", response_model=PolicyOut, status_code=201, summary="A new policy, as version 1")
def add_policy(body: PolicyIn, p: Principal = Depends(POLICIES), db: Session = Depends(get_db)):
    policies.ensure(db, p)
    row = policies.save(db, p, None, kind=body.kind, name=body.name, enabled_=body.enabled, settings=body.settings,
                        recipients=[r.model_dump(exclude_none=True) for r in body.recipients], message=body.message,
                        applies_to=body.applies_to, version=None, note=body.note)
    db.commit()
    return _policy_out(db, row)


@router.put("/alert-policies/{policy_id}", response_model=PolicyOut, summary="Save a policy as its next version")
def save_policy(policy_id: uuid.UUID, body: PolicyIn, p: Principal = Depends(POLICIES), db: Session = Depends(get_db)):
    row = get_or_404(db, AlertPolicy, policy_id, "Policy")
    if body.kind != row.kind:
        raise Invalid("A policy keeps its kind; start a new policy for another kind", field="kind")
    policies.save(db, p, row, kind=row.kind, name=body.name, enabled_=body.enabled, settings=body.settings,
                  recipients=[r.model_dump(exclude_none=True) for r in body.recipients], message=body.message,
                  applies_to=body.applies_to, version=body.version, note=body.note)
    db.commit()
    return _policy_out(db, row)


class VersionOut(BaseModel):
    version: int
    name: str
    enabled: bool
    settings: dict[str, Any]
    recipients: list[dict[str, Any]]
    message: str | None
    note: str | None
    saved_at: datetime
    saved_by_name: str | None


@router.get("/alert-policies/{policy_id}/versions", response_model=list[VersionOut], summary="Every saved version, newest first")
def policy_versions(policy_id: uuid.UUID, p: Principal = Depends(ALERTS), db: Session = Depends(get_db)):
    get_or_404(db, AlertPolicy, policy_id, "Policy")
    rows = db.execute(select(AlertPolicyVersion, User.full_name).outerjoin(User, User.id == AlertPolicyVersion.saved_by)
                      .where(AlertPolicyVersion.policy_id == policy_id).order_by(AlertPolicyVersion.version.desc())).all()
    return [VersionOut(version=v.version, name=v.name, enabled=v.enabled, settings=v.settings, recipients=v.recipients,
                       message=v.message, note=v.note, saved_at=v.saved_at, saved_by_name=name) for v, name in rows]


class PreviewIn(BaseModel):
    settings: dict[str, Any] | None = None
    days: int = Field(default=7, ge=1, le=30)


class Episode(BaseModel):
    vehicle_id: uuid.UUID
    unit_number: str | None = None
    start: datetime
    end: datetime
    peak: float


class TracePoint(BaseModel):
    at: datetime
    mph: float


class Trace(BaseModel):
    vehicle_id: uuid.UUID
    unit_number: str | None = None
    start: datetime
    end: datetime
    points: list[TracePoint]


class PreviewOut(BaseModel):
    kind: str
    days: int
    samples: int
    above: int
    trucks: int
    incidents: int
    episodes: list[Episode]
    trace: Trace | None


@router.post("/alert-policies/{policy_id}/preview", response_model=PreviewOut,
             summary="What the rule (as saved, or as edited) would have done over recent days of real positions")
def preview_policy(policy_id: uuid.UUID, body: PreviewIn, p: Principal = Depends(ALERTS), db: Session = Depends(get_db)):
    row = get_or_404(db, AlertPolicy, policy_id, "Policy")
    out = policies.preview(db, p, row, body.settings, body.days)
    units = dict(db.execute(select(Vehicle.id, Vehicle.unit_number)).all())
    for e in out["episodes"]:
        e["unit_number"] = units.get(e["vehicle_id"])
    if out["trace"]:
        out["trace"]["unit_number"] = units.get(out["trace"]["vehicle_id"])
    return PreviewOut(**out)

