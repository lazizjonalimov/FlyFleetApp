"""Tasks: one person's list of things to do.

Teammates give each other tasks. A fleet alert gives the person who owns it a task saying what to do about it; the
task follows the alert when it changes hands and closes when the alert is resolved (a speeding alert: once someone
acknowledges it). One alert never gives two tasks, and a task someone closed by hand isn't given again.
"""
import uuid
from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.deps import Principal
from app.core.errors import Conflict, Forbidden, Invalid, NotFound
from app.modules.customers.models import Customer
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Vehicle
from app.modules.loads.models import Load, LoadStop
from app.modules.organizations.models import Membership, User
from app.modules.tasks.models import Task
from app.modules.tracking import incidents
from app.modules.tracking.models import Incident

# What an alert asks of its owner, and the one verb the list offers for it.
ALERT_TASK: dict[str, tuple[str, str]] = {
    "unassigned": ("Assign a driver to {load}", "Assign"),
    "late": ("Tell {customer} about the {load} delay", "Notify"),
    "at_risk": ("Tell {customer} about the {load} delay", "Notify"),
    "speeding": ("Acknowledge speeding incident {number}", "Open"),
    "yard_speed": ("Acknowledge yard speed incident {number}", "Open"),
    "pod_missing": ("Request POD for {load}", "Request"),
    "dwell": ("Watch detention at {stop}", "Open"),
    "gps_stale": ("Check on {unit}: no position", "Open"),
    "out_of_service": ("Get {unit} back in service", "Open"),
    "documents": ("Renew {what}", "Open"),
}
# Who looks after an alert nobody owns yet.
ALERT_WHO = {"documents": "safety_manager", "out_of_service": "fleet_manager"}
ACKNOWLEDGE_CLOSES = ("speeding", "yard_speed")
STAFF_ROLES = ("owner", "admin", "dispatcher", "safety_manager", "fleet_manager", "accountant", "viewer")


def _tz(p: Principal) -> ZoneInfo:
    return ZoneInfo(p.timezone or "UTC")


def end_of_day(p: Principal, day=None) -> datetime:
    day = day or p.today()
    return datetime.combine(day, time(23, 59, 59), _tz(p))


def _clock(p: Principal, at: datetime) -> str:
    local = at.astimezone(_tz(p))
    return f"{local:%H:%M}" if local.date() == p.today() else f"{local:%b} {local.day} {local:%H:%M}"


def _day(p: Principal, at: datetime) -> str:
    local = at.astimezone(_tz(p)).date()
    days = (local - p.today()).days
    return "today" if days == 0 else "yesterday" if days == -1 else "tomorrow" if days == 1 else f"{local:%b} {local.day}"


# ---------------------------------------------------------------- tasks from fleet alerts
def _from_alert(db: Session, p: Principal, row: Incident) -> dict[str, Any]:
    load = db.get(Load, row.load_id) if row.load_id else None
    unit = db.scalar(select(Vehicle.unit_number).where(Vehicle.id == row.vehicle_id)) if row.vehicle_id else None
    driver = db.get(Driver, row.driver_id) if row.driver_id else None
    driver_name = f"{driver.first_name} {driver.last_name}" if driver else None
    customer = db.scalar(select(Customer.name).where(Customer.id == load.customer_id)) if load else None
    stop = None
    if load is not None and row.kind == "dwell":
        stop = db.scalar(select(LoadStop).where(LoadStop.load_id == load.id, LoadStop.arrived_at.is_not(None),
                                                LoadStop.departed_at.is_(None)).order_by(LoadStop.seq).limit(1))
    what = row.title.removesuffix(" expired")
    template, action = ALERT_TASK[row.kind]
    title = template.format(load=load.load_number if load else "the load", customer=customer or "the customer",
                            number=row.number, stop=(stop.name or stop.city) if stop else "the stop",
                            unit=unit or "the truck", what=what[0].lower() + what[1:] if what else "paperwork")
    due, all_day = row.detected_at, False
    detail = row.detail
    if row.kind == "unassigned" and load and load.pickup_at:
        due = load.pickup_at - timedelta(hours=1)
        detail = f"Pickup {_clock(p, load.pickup_at)}" + (f" in {load.origin_city}" if load.origin_city else "")
    elif row.kind in ("late", "at_risk") and load:
        eta = (row.data or {}).get("eta")
        appt = None
        if row.kind == "late" and row.episode_key.endswith(":pickup"):
            appt = load.pickup_at
        else:
            nxt = db.scalar(select(LoadStop).where(LoadStop.load_id == load.id, LoadStop.arrived_at.is_(None))
                            .order_by(LoadStop.seq).limit(1))
            appt = (nxt.appt_end or nxt.appt_start) if nxt else None
        if eta and appt:
            detail = f"ETA {_clock(p, datetime.fromisoformat(eta))} vs {_clock(p, appt)} appointment"
        else:
            detail = f"{row.title} · {row.detail}" if row.detail else row.title
    elif row.kind in ACKNOWLEDGE_CLOSES:
        parts = [unit, driver_name, f"{float(row.peak):.0f} mph peak" if row.peak is not None else None]
        detail = " · ".join(x for x in parts if x)
    elif row.kind == "pod_missing" and load:
        delivered = load.delivered_at or row.detected_at
        detail = f"Delivered {_day(p, delivered)} · invoicing blocked"
        due, all_day = end_of_day(p), True
    elif row.kind == "dwell" and stop is not None:
        hours = 2.0
        if row.policy_id:
            from app.modules.tracking.models import AlertPolicy
            policy = db.get(AlertPolicy, row.policy_id)
            hours = float((policy.settings if policy else {}).get("hours", 2))
        detail = f"{driver_name or unit or 'The truck'} at {stop.type} since {_clock(p, stop.arrived_at)}"
        due = stop.arrived_at + timedelta(hours=hours)
    elif row.kind == "gps_stale":
        detail = f"{row.title} · {row.detail}" if row.detail else row.title
    elif row.kind in ("out_of_service", "documents"):
        due, all_day = end_of_day(p), True
    if load is not None:
        entity = ("load", load.id, load.load_number)
    elif row.vehicle_id and unit:
        entity = ("vehicle", row.vehicle_id, unit)
    elif driver is not None:
        entity = ("driver", driver.id, driver_name)
    else:
        entity = (None, None, None)
    if row.kind in ACKNOWLEDGE_CLOSES and unit:
        entity = ("vehicle", row.vehicle_id, unit)
    return {"title": title[:200], "detail": (detail or "")[:300] or None, "due_at": due, "all_day": all_day,
            "priority": row.severity, "action": action, "entity_type": entity[0], "entity_id": entity[1],
            "entity_label": (entity[2] or "")[:60] or None}


def _alert_owner(db: Session, row: Incident) -> uuid.UUID | None:
    if row.owner_user_id:
        return row.owner_user_id
    who, _ = incidents._who(db, row, ALERT_WHO.get(row.kind, "dispatcher_on_duty"))
    return who


def _close(task: Task, outcome: str, by: uuid.UUID | None = None) -> None:
    task.status, task.done_at, task.done_by, task.outcome = "done", datetime.now(UTC), by, outcome[:200]
    task.version += 1


def sync_alerts(db: Session, p: Principal) -> None:
    """Keep the tasks that alerts give in step with the alerts."""
    live = list(db.scalars(select(Incident).where(Incident.state != "resolved")))
    open_tasks = {t.incident_id: t for t in db.scalars(select(Task).where(Task.source == "incident", Task.status == "open"))}
    given = set(db.scalars(select(Task.incident_id).where(Task.source == "incident",
                                                          Task.incident_id.in_([r.id for r in live])))) if live else set()
    for row in live:
        task = open_tasks.pop(row.id, None)
        handled = row.kind in ACKNOWLEDGE_CLOSES and row.state == "acknowledged"
        if handled:
            if task is not None:
                who = db.scalar(select(User.full_name).where(User.id == row.acknowledged_by)) if row.acknowledged_by else None
                _close(task, f"Acknowledged{' by ' + who if who else ''}", row.acknowledged_by)
            continue
        if task is None and row.id in given:
            continue  # closed by hand while the alert stays open: not given again
        owner = _alert_owner(db, row)
        if owner is None:
            continue
        values = _from_alert(db, p, row)
        if task is None:
            db.add(Task(organization_id=p.org_id, assignee_user_id=owner, source="incident", incident_id=row.id,
                        source_key=f"incident:{row.id}", **values))
            continue
        changed = {k: v for k, v in values.items() if getattr(task, k) != v}
        if row.owner_user_id and task.assignee_user_id != row.owner_user_id:
            changed["assignee_user_id"] = row.owner_user_id
        if changed:
            for k, v in changed.items():
                setattr(task, k, v)
            task.version += 1
    # Tasks whose alert is over.
    for task in open_tasks.values():
        row = db.get(Incident, task.incident_id) if task.incident_id else None
        if row is None:
            _close(task, "Alert removed")
        elif row.resolved_by:
            who = db.scalar(select(User.full_name).where(User.id == row.resolved_by))
            _close(task, f"Resolved by {who}" if who else "Resolved", row.resolved_by)
        else:
            _close(task, f"Cleared — {row.resolution}" if row.resolution else "Cleared")
    db.flush()


def refresh(db: Session, p: Principal) -> None:
    """Bring alerts, and the tasks they give, up to date before showing tasks."""
    incidents.sync(db, p)
    db.flush()
    sync_alerts(db, p)


# ---------------------------------------------------------------- tasks people give
def _member(db: Session, user_id: uuid.UUID) -> str:
    name = db.scalar(select(User.full_name).join(Membership, Membership.user_id == User.id)
                     .where(User.id == user_id, Membership.active.is_(True), Membership.role.in_(STAFF_ROLES)))
    if name is None:
        raise Invalid("Choose someone on the team", field="assignee_user_id")
    return name


ENTITIES = {"load": (Load, "load_number"), "driver": (Driver, None), "vehicle": (Vehicle, "unit_number"),
            "customer": (Customer, "name")}


def _entity(db: Session, entity_type: str | None, entity_id: uuid.UUID | None) -> tuple[str | None, uuid.UUID | None, str | None]:
    if entity_type is None and entity_id is None:
        return None, None, None
    if entity_type not in ENTITIES or entity_id is None:
        raise Invalid("Choose what the task is about", field="entity_id")
    model, attr = ENTITIES[entity_type]
    row = db.get(model, entity_id)
    if row is None:
        raise Invalid(f"{entity_type.capitalize()} not found", field="entity_id")
    label = f"{row.first_name} {row.last_name}" if model is Driver else getattr(row, attr)
    return entity_type, entity_id, str(label)[:60]


def create(db: Session, p: Principal, *, title: str, detail: str | None, assignee_user_id: uuid.UUID | None,
           due_at: datetime | None, all_day: bool, priority: str, entity_type: str | None,
           entity_id: uuid.UUID | None) -> Task:
    name = (title or "").strip()
    if not name:
        raise Invalid("Say what needs doing", field="title")
    assignee = assignee_user_id or p.user_id
    if assignee != p.user_id and not p.can("tasks.assign"):
        raise Forbidden("Your role does not allow giving tasks to others")
    _member(db, assignee)
    if all_day and due_at is not None:
        due_at = end_of_day(p, due_at.astimezone(_tz(p)).date())
    kind, eid, label = _entity(db, entity_type, entity_id)
    task = Task(organization_id=p.org_id, title=name[:200], detail=(detail or "").strip()[:300] or None,
                assignee_user_id=assignee, created_by=p.user_id, due_at=due_at, all_day=bool(all_day and due_at),
                priority=priority, source="manual", entity_type=kind, entity_id=eid, entity_label=label,
                action="Open" if kind else None)
    db.add(task)
    db.flush()
    audit(db, p, "task.created", "task", task.id, {"title": task.title, "assignee": str(assignee)})
    return task


def act(db: Session, p: Principal, task: Task, action: str, *, version: int | None = None,
        assignee_user_id: uuid.UUID | None = None, note: str | None = None) -> Task:
    if version is not None and version != task.version:
        raise Conflict("Someone else changed this task. Look at the latest and try again.", code="VERSION_CONFLICT",
                       details={"current_version": task.version})
    mine = task.assignee_user_id == p.user_id or task.created_by == p.user_id
    if not mine and not p.can("tasks.assign"):
        raise Forbidden("Only the person it's for, or who gave it, can change this task")
    if action == "complete":
        if task.status != "open":
            raise Conflict("This task is already closed", code="WRONG_STATE")
        _close(task, (note or "").strip() or "Done", p.user_id)
    elif action == "reopen":
        if task.status == "open":
            raise Conflict("This task is open", code="WRONG_STATE")
        if task.source_key and db.scalar(select(Task.id).where(Task.source_key == task.source_key, Task.status == "open")):
            raise Conflict("A newer task for the same alert is open", code="ALREADY_OPEN")
        task.status, task.done_at, task.done_by, task.outcome = "open", None, None, None
        task.version += 1
    elif action == "assign":
        if assignee_user_id is None:
            raise Invalid("Choose who it's for", field="assignee_user_id")
        if assignee_user_id != p.user_id and not p.can("tasks.assign"):
            raise Forbidden("Your role does not allow giving tasks to others")
        _member(db, assignee_user_id)
        task.assignee_user_id = assignee_user_id
        task.version += 1
        if task.incident_id:  # the alert changes hands with its task
            row = db.get(Incident, task.incident_id)
            if row is not None and row.state != "resolved" and row.owner_user_id != assignee_user_id:
                incidents.act(db, p, row, "assign", owner_id=assignee_user_id)
    elif action == "cancel":
        if task.status != "open":
            raise Conflict("This task is already closed", code="WRONG_STATE")
        task.status, task.done_at, task.done_by, task.outcome = "cancelled", datetime.now(UTC), p.user_id, \
            ((note or "").strip() or "Cancelled")[:200]
        task.version += 1
    else:
        raise Invalid("Unknown action", field="action")
    audit(db, p, f"task.{action}", "task", task.id, {"title": task.title})
    return task


def get(db: Session, task_id: uuid.UUID) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise NotFound("Task not found")
    return task


def mine_filter(p: Principal, tab: str):
    if tab == "by_me":
        return [Task.created_by == p.user_id, Task.assignee_user_id != p.user_id, Task.status == "open"]
    if tab == "done":
        return [Task.assignee_user_id == p.user_id, Task.status.in_(("done", "cancelled"))]
    if tab == "today":
        return [Task.assignee_user_id == p.user_id, Task.status == "open", Task.due_at <= end_of_day(p)]
    return [Task.assignee_user_id == p.user_id, Task.status == "open"]


def counts(db: Session, p: Principal) -> dict[str, int]:
    out = {tab: db.scalar(select(func.count()).select_from(Task).where(*mine_filter(p, tab))) or 0
           for tab in ("open", "today", "by_me")}
    out["overdue"] = db.scalar(select(func.count()).select_from(Task).where(
        Task.assignee_user_id == p.user_id, Task.status == "open", Task.due_at < datetime.now(UTC))) or 0
    return out
