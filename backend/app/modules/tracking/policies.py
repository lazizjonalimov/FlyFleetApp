"""Fleet alert policies: the rules that turn positions and records into incidents, and who is told. A company
starts with the four standard rules; every save is a new version, and an incident keeps the version that raised
it."""
import copy
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.deps import Principal
from app.core.errors import Conflict, Invalid
from app.modules.tracking.models import AlertPolicy, AlertPolicyVersion, Geofence, VehiclePosition

CHANNELS = {"in_app": "In app", "push": "Push", "app_push": "App push", "telegram": "Telegram", "sms": "SMS",
            "email": "Email"}
# Channels that reach people today. The others need a messaging connection in Integrations.
CONNECTED = {"in_app"}
WHO = {"driver": "Driver", "dispatcher_on_duty": "Dispatcher on duty", "safety_manager": "Safety manager",
       "fleet_manager": "Fleet manager"}

SPEED_IGNORE = {"max_accuracy_m": 50, "max_age_minutes": 5, "min_mph": 0, "max_mph": 110}
DEFAULTS: list[dict[str, Any]] = [
    {"kind": "speeding", "name": "Highway sustained speeding", "enabled": True,
     "settings": {"source": "telematics", "threshold_mph": 70, "tolerance_mph": 3, "min_minutes": 2,
                  "cooldown_minutes": 20, **SPEED_IGNORE},
     "recipients": [{"who": "driver", "channels": ["telegram", "app_push"], "when": "immediately"},
                    {"who": "dispatcher_on_duty", "channels": ["in_app", "push"], "when": "immediately"},
                    {"who": "safety_manager", "channels": ["email", "sms"], "when": "unacknowledged",
                     "after_minutes": 10}],
     "message": "FlyFleet — {company} Dispatch\nYour truck has been above {threshold} mph for {minutes} minutes. "
                "Please slow down when it's safe. Reply OK to acknowledge."},
    {"kind": "yard_speed", "name": "Yard speed over 10 mph", "enabled": False,
     "settings": {"source": "telematics", "threshold_mph": 10, "tolerance_mph": 0, "min_minutes": 0.5,
                  "cooldown_minutes": 20, **SPEED_IGNORE},
     "recipients": [{"who": "driver", "channels": ["app_push"], "when": "immediately"},
                    {"who": "fleet_manager", "channels": ["in_app"], "when": "immediately"}],
     "message": "FlyFleet — {company}\nPlease keep under {threshold} mph in the yard."},
    {"kind": "dwell", "name": "Dwell at a stop over 2 h", "enabled": True,
     "settings": {"hours": 2, "watch_from_minutes": 30},
     "recipients": [{"who": "dispatcher_on_duty", "channels": ["in_app"], "when": "immediately"}],
     "message": None},
    {"kind": "gps_stale", "name": "GPS stale over 15 min", "enabled": True,
     "settings": {"minutes": 15, "only_on_loads": True},
     "recipients": [{"who": "dispatcher_on_duty", "channels": ["in_app"], "when": "immediately"}],
     "message": None},
]
EVERYWHERE = {"trucks": "all", "hours": "all_day"}


ORDER = {"speeding": 0, "yard_speed": 1, "dwell": 2, "gps_stale": 3}


def _ordered(rows: list[AlertPolicy]) -> list[AlertPolicy]:
    return sorted(rows, key=lambda r: (ORDER.get(r.kind, 9), r.name))


def ensure(db: Session, p: Principal) -> list[AlertPolicy]:
    """The company's policies, starting it with the standard four the first time."""
    rows = list(db.scalars(select(AlertPolicy)))
    if rows:
        return _ordered(rows)
    for spec in DEFAULTS:
        row = AlertPolicy(organization_id=p.org_id, kind=spec["kind"], name=spec["name"], enabled=spec["enabled"],
                          version=1, settings=copy.deepcopy(spec["settings"]),
                          recipients=copy.deepcopy(spec["recipients"]), message=spec["message"],
                          applies_to=dict(EVERYWHERE), updated_by=None)
        db.add(row)
        db.flush()
        _snapshot(db, row, None, "Standard rule")
    return _ordered(list(db.scalars(select(AlertPolicy))))


def _snapshot(db: Session, row: AlertPolicy, user_id: uuid.UUID | None, note: str | None) -> None:
    db.add(AlertPolicyVersion(organization_id=row.organization_id, policy_id=row.id, version=row.version, name=row.name,
                              enabled=row.enabled, settings=copy.deepcopy(row.settings),
                              recipients=copy.deepcopy(row.recipients), message=row.message,
                              applies_to=copy.deepcopy(row.applies_to), note=note, saved_by=user_id))


def enabled(db: Session, p: Principal, kind: str) -> list[AlertPolicy]:
    return [x for x in ensure(db, p) if x.kind == kind and x.enabled]


def _number(value: Any, field: str, lo: float, hi: float) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError) as e:
        raise Invalid(f"Enter a number for {field.replace('_', ' ')}", field=f"settings.{field}") from e
    if not lo <= n <= hi:
        raise Invalid(f"{field.replace('_', ' ').capitalize()} must be between {lo:g} and {hi:g}",
                      field=f"settings.{field}")
    return n


def clean_settings(kind: str, settings: dict[str, Any]) -> dict[str, Any]:
    if kind in ("speeding", "yard_speed"):
        out = {"source": settings.get("source") if settings.get("source") in ("telematics", "driver_app") else "telematics",
               "threshold_mph": _number(settings.get("threshold_mph"), "threshold_mph", 5, 100),
               "tolerance_mph": _number(settings.get("tolerance_mph", 0), "tolerance_mph", 0, 15),
               "min_minutes": _number(settings.get("min_minutes"), "min_minutes", 0.25, 60),
               "cooldown_minutes": _number(settings.get("cooldown_minutes"), "cooldown_minutes", 1, 240),
               "max_accuracy_m": _number(settings.get("max_accuracy_m", 50), "max_accuracy_m", 5, 1000),
               "max_age_minutes": _number(settings.get("max_age_minutes", 5), "max_age_minutes", 1, 120),
               "min_mph": _number(settings.get("min_mph", 0), "min_mph", 0, 50),
               "max_mph": _number(settings.get("max_mph", 110), "max_mph", 60, 200)}
        if out["min_mph"] >= out["max_mph"]:
            raise Invalid("The slowest speed kept must be below the fastest", field="settings.min_mph")
        return out
    if kind == "dwell":
        return {"hours": _number(settings.get("hours"), "hours", 0.25, 48),
                "watch_from_minutes": _number(settings.get("watch_from_minutes", 30), "watch_from_minutes", 0, 600)}
    return {"minutes": _number(settings.get("minutes"), "minutes", 2, 1440),
            "only_on_loads": bool(settings.get("only_on_loads", True))}


def clean_recipients(recipients: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for r in recipients:
        if r.get("who") not in WHO:
            raise Invalid("Choose who is told", field="recipients")
        channels = [c for c in r.get("channels", []) if c in CHANNELS]
        if not channels:
            raise Invalid(f"Choose how the {WHO[r['who']].lower()} is told", field="recipients")
        when = r.get("when") if r.get("when") in ("immediately", "unacknowledged") else "immediately"
        row = {"who": r["who"], "channels": channels, "when": when}
        if when == "unacknowledged":
            row["after_minutes"] = int(_number(r.get("after_minutes", 10), "after_minutes", 1, 240))
        out.append(row)
    return out


def save(db: Session, p: Principal, row: AlertPolicy | None, *, kind: str, name: str, enabled_: bool,
         settings: dict[str, Any], recipients: list[dict[str, Any]], message: str | None,
         applies_to: dict[str, Any], version: int | None, note: str | None) -> AlertPolicy:
    """Save a policy as its next version (or a new policy as version 1)."""
    name = name.strip()
    if not name:
        raise Invalid("Give the policy a name", field="name")
    settings = clean_settings(kind, settings)
    recipients = clean_recipients(recipients)
    trucks = applies_to.get("trucks", "all")
    if trucks != "all" and not (isinstance(trucks, list) and trucks):
        raise Invalid("Choose the trucks the policy applies to, or all trucks", field="applies_to")
    applies = {"trucks": trucks, "hours": applies_to.get("hours", "all_day")}
    if row is None:
        row = AlertPolicy(organization_id=p.org_id, kind=kind, name=name, enabled=enabled_, version=1, settings=settings,
                          recipients=recipients, message=(message or "").strip() or None, applies_to=applies,
                          updated_by=p.user_id)
        db.add(row)
        db.flush()
        action = "alert_policy.created"
    else:
        if version is not None and version != row.version:
            raise Conflict(f"Someone saved v{row.version} while you were editing. Open it again to see their changes.",
                           code="VERSION_CONFLICT", details={"current_version": row.version})
        row.name, row.enabled, row.settings, row.recipients = name, enabled_, settings, recipients
        row.message, row.applies_to = (message or "").strip() or None, applies
        row.version += 1
        row.updated_by = p.user_id
        action = "alert_policy.saved"
    _snapshot(db, row, p.user_id, (note or "").strip() or None)
    audit(db, p, action, "alert_policy", row.id, {"name": row.name, "version": row.version, "enabled": row.enabled,
                                                  "settings": settings})
    return row


def applies(policy: AlertPolicy, vehicle_id: uuid.UUID) -> bool:
    trucks = (policy.applies_to or {}).get("trucks", "all")
    return trucks == "all" or str(vehicle_id) in {str(x) for x in trucks}


def usable(sample: VehiclePosition, settings: dict[str, Any]) -> bool:
    """Whether a speed sample is trustworthy enough to count: accurate, fresh when it arrived, and plausible."""
    if sample.speed_mph is None:
        return False
    if sample.accuracy_m is not None and sample.accuracy_m > settings.get("max_accuracy_m", 50):
        return False
    if sample.received_at and sample.received_at - sample.recorded_at > timedelta(minutes=settings.get("max_age_minutes", 5)):
        return False
    return settings.get("min_mph", 0) <= float(sample.speed_mph) <= settings.get("max_mph", 110)


def in_yard(db: Session, lat: Decimal, lon: Decimal) -> bool:
    from app.core.places import km
    for g in db.scalars(select(Geofence).where(Geofence.kind == "yard", Geofence.active.is_(True))):
        if km(float(lat), float(lon), float(g.lat), float(g.lon)) * 1000 <= g.radius_m:
            return True
    return False


def runs(samples: list[VehiclePosition], settings: dict[str, Any]) -> list[tuple[datetime, datetime, float]]:
    """Each stretch where a truck stayed above the limit for at least the time the policy asks: its start, end
    and top speed. Samples that aren't trustworthy are left out."""
    limit = settings["threshold_mph"] + settings.get("tolerance_mph", 0)
    out, run = [], []
    for s in samples:
        if not usable(s, settings):
            continue
        if float(s.speed_mph) > limit:
            run.append(s)
            continue
        if run and (run[-1].recorded_at - run[0].recorded_at) >= timedelta(minutes=settings["min_minutes"]):
            out.append((run[0].recorded_at, run[-1].recorded_at, max(float(x.speed_mph) for x in run)))
        run = []
    if run and (run[-1].recorded_at - run[0].recorded_at) >= timedelta(minutes=settings["min_minutes"]):
        out.append((run[0].recorded_at, run[-1].recorded_at, max(float(x.speed_mph) for x in run)))
    return out


def preview(db: Session, p: Principal, policy: AlertPolicy, settings: dict[str, Any] | None, days: int = 7) -> dict:
    """What a speed rule would have done over the last days on the company's real positions: samples above the
    threshold, how many incidents it would have raised (one per episode), and the worst one's speed trace."""
    from datetime import UTC
    settings = clean_settings(policy.kind, settings or policy.settings)
    now = datetime.now(UTC)
    since = now - timedelta(days=days)
    if policy.kind not in ("speeding", "yard_speed"):
        return {"kind": policy.kind, "days": days, "samples": 0, "above": 0, "trucks": 0, "incidents": 0,
                "episodes": [], "trace": None}
    rows = list(db.scalars(select(VehiclePosition).where(VehiclePosition.recorded_at >= since)
                           .order_by(VehiclePosition.vehicle_id, VehiclePosition.recorded_at)))
    by_truck: dict[uuid.UUID, list[VehiclePosition]] = {}
    for r in rows:
        if applies(policy, r.vehicle_id):
            by_truck.setdefault(r.vehicle_id, []).append(r)
    threshold = settings["threshold_mph"]
    above = [r for rs in by_truck.values() for r in rs if r.speed_mph is not None and float(r.speed_mph) > threshold]
    episodes = []
    for vehicle_id, rs in by_truck.items():
        last_end: datetime | None = None
        for start, end, peak in runs(rs, settings):
            # One incident per episode: another stretch inside the cooldown is the same episode.
            if last_end and start - last_end <= timedelta(minutes=settings["cooldown_minutes"]):
                episodes[-1]["end"], episodes[-1]["peak"] = end, max(episodes[-1]["peak"], peak)
            else:
                episodes.append({"vehicle_id": vehicle_id, "start": start, "end": end, "peak": peak})
            last_end = end
    trace = None
    if episodes:
        worst = max(episodes, key=lambda e: (e["peak"], e["end"] - e["start"]))
        window = [r for r in by_truck[worst["vehicle_id"]]
                  if worst["start"] - timedelta(minutes=15) <= r.recorded_at <= worst["end"] + timedelta(minutes=10)
                  and r.speed_mph is not None]
        trace = {"vehicle_id": worst["vehicle_id"], "start": worst["start"], "end": worst["end"],
                 "points": [{"at": r.recorded_at, "mph": float(r.speed_mph)} for r in window]}
    return {"kind": policy.kind, "days": days, "samples": len(rows), "above": len(above),
            "trucks": len({r.vehicle_id for r in above}), "incidents": len(episodes),
            "episodes": [{**e, "peak": round(e["peak"], 1)} for e in episodes[-20:]], "trace": trace}
