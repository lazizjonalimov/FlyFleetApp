"""Tasks: one person's list of things to do.

Everything that happens to a task (created, done, reopened, snoozed, given to someone, priority or due changed,
waiting on another task, escalated, commented on) is written to the task's own history and to the audit log.

Teammates give each other tasks. A fleet alert gives the person who owns it a task saying what to do about it; the
task follows the alert when it changes hands and closes when the alert is resolved (a speeding alert: once someone
acknowledges it). One alert never gives two tasks, and a task someone closed by hand isn't given again.
"""
import uuid
from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core import mail
from app.core.audit import audit
from app.core.deps import Principal
from app.core.errors import Conflict, Forbidden, Invalid, NotFound
from app.modules.customers.models import Customer
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.finance.models import Invoice
from app.modules.loads.models import Load, LoadStop
from app.modules.organizations.models import Membership, User, UserPreference
from app.modules.settlements.models import DriverSettlement
from app.modules.tasks.models import Task, TaskEvent
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
# The promise an alert's task keeps, with a clock on it.
SLA = {"unassigned": "Pickup", "late": "Customer update", "at_risk": "Customer update", "dwell": "Detention",
       "pod_missing": "POD for invoicing"}
# Who looks after an alert nobody owns yet.
ALERT_WHO = {"documents": "safety_manager", "out_of_service": "fleet_manager"}
ACKNOWLEDGE_CLOSES = ("speeding", "yard_speed")
# Everyone on the team except the driver app's and the portals' sign-ins.
APP_ROLES = ("driver", "customer", "owner_portal")


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
    sla_label, sla_at = SLA.get(row.kind, (None, None)), None
    if sla_label:
        sla_at = load.pickup_at if row.kind == "unassigned" and load and load.pickup_at else due
    closes = "Closes by itself when the alert is acknowledged" if row.kind in ACKNOWLEDGE_CLOSES \
        else "Closes by itself when the alert is resolved"
    return {"title": title[:200], "detail": (detail or "")[:300] or None, "due_at": due, "all_day": all_day,
            "priority": row.severity, "action": action, "entity_type": entity[0], "entity_id": entity[1],
            "entity_label": (entity[2] or "")[:60] or None,
            "why": f"Fleet alert {row.number}: {row.title}"[:300], "auto_close": closes,
            "sla_label": sla_label, "sla_at": sla_at if sla_label else None}


def _alert_owner(db: Session, row: Incident) -> uuid.UUID | None:
    if row.owner_user_id:
        return row.owner_user_id
    who, _ = incidents._who(db, row, ALERT_WHO.get(row.kind, "dispatcher_on_duty"))
    return who


def _close(task: Task, outcome: str, by: uuid.UUID | None = None, db: Session | None = None) -> None:
    task.status, task.done_at, task.done_by, task.outcome = "done", datetime.now(UTC), by, outcome[:200]
    task.snoozed_until = None
    task.version += 1
    if db is not None:  # closed by its alert, not by a person
        db.add(TaskEvent(organization_id=task.organization_id, task_id=task.id, kind="history",
                         text=f"Closed by itself · {outcome}"[:500], actor_user_id=by))


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
                _close(task, f"Acknowledged{' by ' + who if who else ''}", row.acknowledged_by, db)
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
            _close(task, "Alert removed", db=db)
        elif row.resolved_by:
            who = db.scalar(select(User.full_name).where(User.id == row.resolved_by))
            _close(task, f"Resolved by {who}" if who else "Resolved", row.resolved_by, db)
        else:
            _close(task, f"Cleared — {row.resolution}" if row.resolution else "Cleared", db=db)
    db.flush()


def refresh(db: Session, p: Principal) -> None:
    """Bring alerts, and the tasks they give, up to date before showing tasks."""
    incidents.sync(db, p)
    db.flush()
    sync_alerts(db, p)


# ---------------------------------------------------------------- tasks people give
# Full-access roles see their team's tasks and take what is escalated, Administrators first.
MANAGERS = ("admin", "owner")
REMINDERS_KEY = "tasks.reminders"
REMINDER_DEFAULTS: dict[str, Any] = {"summary": True, "send_at": "07:00", "via": "email", "before_due": True,
                                     "on_assign": True}
STEP_LIMIT = 30
DONE_KEPT = timedelta(days=30)


def manages(p: Principal) -> bool:
    return p.role in MANAGERS


def _member(db: Session, user_id: uuid.UUID) -> str:
    name = db.scalar(select(User.full_name).join(Membership, Membership.user_id == User.id)
                     .where(User.id == user_id, Membership.active.is_(True), Membership.role.notin_(APP_ROLES)))
    if name is None:
        raise Invalid("Choose someone on the team", field="assignee_user_id")
    return name


# What a task can be about: the record, the field that names it, and the permission it takes to open it.
ENTITIES: dict[str, tuple[Any, str | None, str]] = {
    "load": (Load, "load_number", "loads.read"),
    "driver": (Driver, None, "drivers.read"),
    "vehicle": (Vehicle, "unit_number", "equipment.read"),
    "trailer": (Trailer, "unit_number", "equipment.read"),
    "customer": (Customer, "name", "customers.read"),
    "invoice": (Invoice, "invoice_number", "invoices.read"),
    "statement": (DriverSettlement, "number", "settlements.read"),
}
NOUN = {"load": "load", "driver": "driver", "vehicle": "truck", "trailer": "trailer", "customer": "customer",
        "invoice": "invoice", "statement": "driver statement"}


def hidden_types(p: Principal) -> list[str]:
    """The kinds of record this person's role can't open: tasks about them are not shown to them."""
    return [kind for kind, (_, _, perm) in ENTITIES.items() if not p.can(perm)]


def visible(p: Principal) -> list:
    hidden = hidden_types(p)
    return [or_(Task.entity_type.is_(None), Task.entity_type.notin_(hidden))] if hidden else []


def _entity(db: Session, entity_type: str | None, entity_id: uuid.UUID | None,
            ref: str | None = None) -> tuple[str | None, uuid.UUID | None, str | None]:
    ref = (ref or "").strip()
    if entity_type is None and entity_id is None and not ref:
        return None, None, None
    if entity_type not in ENTITIES:
        raise Invalid("Choose what the task is about", field="entity_id")
    model, attr, _ = ENTITIES[entity_type]
    row = None
    if entity_id is not None:
        row = db.get(model, entity_id)
    elif ref:
        if model is Driver:
            row = db.scalar(select(Driver).where(func.concat(Driver.first_name, " ", Driver.last_name).ilike(ref)).limit(1))
        else:
            row = db.scalar(select(model).where(func.upper(getattr(model, attr)) == ref.upper()).limit(1))
    else:
        raise Invalid(f"Enter the {NOUN[entity_type]}’s ID", field="entity_ref")
    if row is None:
        raise Invalid(f"No {NOUN[entity_type]} {ref} found" if ref else f"{NOUN[entity_type].capitalize()} not found",
                      field="entity_ref" if ref else "entity_id")
    label = f"{row.first_name} {row.last_name}" if model is Driver else (getattr(row, attr) or "Draft")
    return entity_type, row.id, str(label)[:60]


def _log(db: Session, p: Principal, task: Task, action: str, line: str, data: dict[str, Any] | None = None) -> None:
    """One line in the task's history, and the same change in the audit log."""
    db.add(TaskEvent(organization_id=p.org_id, task_id=task.id, kind="history", text=line[:500], actor_user_id=p.user_id))
    audit(db, p, f"task.{action}", "task", task.id, {"title": task.title, **(data or {})})


def _steps(lines: list[str] | None) -> list[dict[str, Any]]:
    out = [{"text": text.strip()[:200], "done": False} for text in (lines or []) if text and text.strip()]
    if len(out) > STEP_LIMIT:
        raise Invalid(f"Up to {STEP_LIMIT} steps", field="subtasks")
    return out


def _check_blocker(db: Session, task: Task | None, blocked_by: uuid.UUID | None) -> Task | None:
    if blocked_by is None:
        return None
    blocker = db.get(Task, blocked_by)
    if blocker is None:
        raise Invalid("That task isn’t there any more", field="blocked_by")
    if task is not None:
        if blocker.id == task.id:
            raise Invalid("A task can’t wait on itself", field="blocked_by")
        seen, at = set(), blocker
        while at is not None and at.blocked_by and at.id not in seen:  # waiting on something that waits on this one
            seen.add(at.id)
            if at.blocked_by == task.id:
                raise Invalid(f"‘{blocker.title}’ is waiting on this task", field="blocked_by")
            at = db.get(Task, at.blocked_by)
    return blocker


def reminder_settings(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    saved = db.scalar(select(UserPreference.value).where(UserPreference.user_id == user_id,
                                                         UserPreference.key == REMINDERS_KEY))
    return {**REMINDER_DEFAULTS, **(saved if isinstance(saved, dict) else {})}


def _notify(db: Session, p: Principal, task: Task, user_id: uuid.UUID | None) -> bool:
    """Tell someone they were given a task, by email, unless they turned that off. Not when it's your own."""
    if user_id is None or user_id == p.user_id or not reminder_settings(db, user_id)["on_assign"]:
        return False
    email = db.scalar(select(User.email).where(User.id == user_id))
    if not email:
        return False
    due = f"\nDue {_clock(p, task.due_at)}." if task.due_at else ""
    mail.send(email, f"{p.full_name} gave you a task: {task.title}"[:200],
              f"{task.title}\n{task.detail or ''}{due}\n\nOpen My tasks in FlyFleet ({p.org_name}) to see it.")
    return True


def _can_change(p: Principal, task: Task) -> None:
    mine = task.assignee_user_id == p.user_id or task.created_by == p.user_id
    if not mine and not p.can("tasks.assign"):
        raise Forbidden("Only the person it's for, or who gave it, can change this task")


def _version(task: Task, version: int | None) -> None:
    if version is not None and version != task.version:
        raise Conflict("Someone else changed this task. Look at the latest and try again.", code="VERSION_CONFLICT",
                       details={"current_version": task.version})


def create(db: Session, p: Principal, *, title: str, detail: str | None, assignee_user_id: uuid.UUID | None,
           due_at: datetime | None, all_day: bool, priority: str, entity_type: str | None,
           entity_id: uuid.UUID | None, entity_ref: str | None = None, why: str | None = None,
           subtasks: list[str] | None = None, recurrence: str = "none", blocked_by: uuid.UUID | None = None) -> Task:
    assignee = assignee_user_id or p.user_id
    if assignee != p.user_id and not p.can("tasks.assign"):
        raise Forbidden("Your role does not allow giving tasks to others")
    name = (title or "").strip()
    if len(name) < 3:
        raise Invalid("Say what needs doing in at least 3 characters", field="title")
    who = _member(db, assignee)
    if all_day and due_at is not None:
        due_at = end_of_day(p, due_at.astimezone(_tz(p)).date())
    kind, eid, label = _entity(db, entity_type, entity_id, entity_ref)
    _check_blocker(db, None, blocked_by)
    task = Task(organization_id=p.org_id, title=name[:200], detail=(detail or "").strip()[:300] or None,
                assignee_user_id=assignee, created_by=p.user_id, due_at=due_at, all_day=bool(all_day and due_at),
                priority=priority, source="recurring" if recurrence != "none" else "manual", entity_type=kind,
                entity_id=eid, entity_label=label, action="Open" if kind else None,
                why=(why or "").strip()[:300] or None, subtasks=_steps(subtasks), recurrence=recurrence,
                blocked_by=blocked_by)
    db.add(task)
    db.flush()
    told = _notify(db, p, task, assignee)
    line = "Created" + (f" for {who}" if assignee != p.user_id else "") + (" · notified by email" if told else "")
    _log(db, p, task, "created", line, {"assignee": str(assignee), "recurrence": recurrence})
    return task


def _months(at: datetime, n: int) -> datetime:
    import calendar
    month = at.month - 1 + n
    year, month = at.year + month // 12, month % 12 + 1
    return at.replace(year=year, month=month, day=min(at.day, calendar.monthrange(year, month)[1]))


def _repeat(db: Session, p: Principal, task: Task) -> Task:
    """The next one of a repeating task: the same task, its steps unticked, due one period on (and in the future)."""
    now = datetime.now(UTC)
    def step(at: datetime) -> datetime:
        return _months(at, 1) if task.recurrence == "monthly" else at + timedelta(days=1 if task.recurrence == "daily" else 7)
    due = step(task.due_at or end_of_day(p))
    while due <= now:
        due = step(due)
    nxt = Task(organization_id=p.org_id, title=task.title, detail=task.detail, assignee_user_id=task.assignee_user_id,
               created_by=task.created_by, due_at=due, all_day=task.all_day, priority=task.priority, source="recurring",
               entity_type=task.entity_type, entity_id=task.entity_id, entity_label=task.entity_label,
               action=task.action, why=task.why, recurrence=task.recurrence,
               subtasks=[{"text": s["text"], "done": False} for s in task.subtasks or []])
    db.add(nxt)
    db.flush()
    _log(db, p, nxt, "created", f"Created · repeats {task.recurrence}, after the last one was done",
         {"recurrence": task.recurrence, "previous": str(task.id)})
    return nxt


def _assign(db: Session, p: Principal, task: Task, user_id: uuid.UUID, how: str = "Given to", extra: str = "",
            action: str = "assign") -> str:
    if user_id != p.user_id and not p.can("tasks.assign"):
        raise Forbidden("Your role does not allow giving tasks to others")
    who = _member(db, user_id)
    before = task.assignee_user_id
    task.assignee_user_id = user_id
    if task.incident_id:  # the alert changes hands with its task
        row = db.get(Incident, task.incident_id)
        if row is not None and row.state != "resolved" and row.owner_user_id != user_id:
            incidents.act(db, p, row, "assign", owner_id=user_id)
    told = _notify(db, p, task, user_id)
    _log(db, p, task, action, f"{how} {who}{extra}" + (" · notified by email" if told else ""),
         {"from": str(before) if before else None, "to": str(user_id), "notified": told})
    return who


def _escalation_target(db: Session, task: Task) -> uuid.UUID:
    rows = db.execute(select(User.id).join(Membership, Membership.user_id == User.id)
                      .where(Membership.active.is_(True), Membership.role.in_(MANAGERS))
                      .order_by(case((Membership.role == "admin", 0), else_=1), User.full_name)).scalars().all()
    for user_id in rows:
        if user_id != task.assignee_user_id:
            return user_id
    raise Conflict("There’s nobody to escalate this to. Add an Administrator or another Main Admin.", code="NO_ONE")


def _complete(db: Session, p: Principal, task: Task, outcome: str | None) -> Task | None:
    if task.status != "open":
        raise Conflict("This task is already closed", code="WRONG_STATE")
    if task.blocked_by:
        blocker = db.get(Task, task.blocked_by)
        if blocker is not None and blocker.status == "open":
            raise Conflict(f"Finish ‘{blocker.title}’ first", code="BLOCKED", details={"blocked_by": str(blocker.id)})
    _close(task, (outcome or "").strip() or "Done", p.user_id)
    _log(db, p, task, "complete", "Marked done" + (f" · {outcome.strip()}" if outcome and outcome.strip() else ""))
    return _repeat(db, p, task) if task.recurrence != "none" else None


def act(db: Session, p: Principal, task: Task, action: str, *, version: int | None = None,
        assignee_user_id: uuid.UUID | None = None, note: str | None = None,
        until: datetime | None = None) -> tuple[Task, Task | None]:
    """Do one thing to a task. Returns the task, and the next one when completing a repeating task gave one."""
    _version(task, version)
    _can_change(p, task)
    nxt = None
    if action == "complete":
        nxt = _complete(db, p, task, note)
    elif action == "reopen":
        if task.status == "open":
            raise Conflict("This task is open", code="WRONG_STATE")
        if task.source_key and db.scalar(select(Task.id).where(Task.source_key == task.source_key, Task.status == "open")):
            raise Conflict("A newer task for the same alert is open", code="ALREADY_OPEN")
        task.status, task.done_at, task.done_by, task.outcome = "open", None, None, None
        _log(db, p, task, "reopen", "Reopened")
    elif action == "assign":
        if assignee_user_id is None:
            raise Invalid("Choose who it's for", field="assignee_user_id")
        if assignee_user_id != task.assignee_user_id:
            _assign(db, p, task, assignee_user_id)
    elif action == "snooze":
        if task.status != "open":
            raise Conflict("Only an open task can be snoozed", code="WRONG_STATE")
        if until is None or until <= datetime.now(UTC):
            raise Invalid("Choose a time later than now", field="until")
        task.snoozed_until = until
        _log(db, p, task, "snooze", f"Snoozed until {_clock(p, until)}", {"until": until.isoformat()})
    elif action == "unsnooze":
        if task.snoozed_until is None:
            raise Conflict("This task isn’t snoozed", code="WRONG_STATE")
        task.snoozed_until = None
        _log(db, p, task, "unsnooze", "Back on the list")
    elif action == "escalate":
        if task.status != "open":
            raise Conflict("Only an open task can be escalated", code="WRONG_STATE")
        target = _escalation_target(db, task)
        before = task.priority
        task.priority, task.escalated, task.snoozed_until = "high", True, None
        _assign(db, p, task, target, "Escalated to", " · priority High", "escalate")
        audit(db, p, "task.priority", "task", task.id, {"title": task.title, "from": before, "to": "high"})
    elif action == "cancel":
        if task.status != "open":
            raise Conflict("This task is already closed", code="WRONG_STATE")
        task.status, task.done_at, task.done_by, task.outcome = "cancelled", datetime.now(UTC), p.user_id, \
            ((note or "").strip() or "Cancelled")[:200]
        _log(db, p, task, "cancel", f"Cancelled · {task.outcome}")
    else:
        raise Invalid("Unknown action", field="action")
    task.version += 1
    return task, nxt


PRIORITY_LABEL = {"high": "High", "medium": "Medium", "low": "Low"}


def update(db: Session, p: Principal, task: Task, changes: dict[str, Any], version: int | None = None) -> Task:
    """Change a task's details. Each change is a line in its history and in the audit log."""
    _version(task, version)
    _can_change(p, task)
    if "title" in changes:
        name = (changes["title"] or "").strip()
        if len(name) < 3:
            raise Invalid("Say what needs doing in at least 3 characters", field="title")
        if name != task.title:
            task.title = name[:200]
            _log(db, p, task, "update", f"Renamed to ‘{task.title}’")
    if "detail" in changes and (changes["detail"] or None) != task.detail:
        task.detail = (changes["detail"] or "").strip()[:300] or None
        _log(db, p, task, "update", "Details changed")
    if "priority" in changes and changes["priority"] != task.priority:
        before = task.priority
        task.priority = changes["priority"]
        _log(db, p, task, "priority", f"Priority {PRIORITY_LABEL[before]} → {PRIORITY_LABEL[task.priority]}",
             {"from": before, "to": task.priority})
    if "due_at" in changes or "all_day" in changes:
        due = changes.get("due_at", task.due_at)
        all_day = bool(changes.get("all_day", task.all_day) and due)
        if all_day and due is not None:
            due = end_of_day(p, due.astimezone(_tz(p)).date())
        if due != task.due_at or all_day != task.all_day:
            task.due_at, task.all_day = due, all_day
            when = "no date" if due is None else (_day(p, due) if all_day else f"{_day(p, due)} {due.astimezone(_tz(p)):%H:%M}")
            _log(db, p, task, "due", f"Due {when}", {"due_at": due.isoformat() if due else None})
    if changes.get("assignee_user_id") and changes["assignee_user_id"] != task.assignee_user_id:
        _assign(db, p, task, changes["assignee_user_id"])
    if "blocked_by" in changes and changes["blocked_by"] != task.blocked_by:
        blocker = _check_blocker(db, task, changes["blocked_by"])
        task.blocked_by = blocker.id if blocker else None
        _log(db, p, task, "dependency", f"Waiting on ‘{blocker.title}’" if blocker else "No longer waiting on another task",
             {"blocked_by": str(blocker.id) if blocker else None})
    if "subtasks" in changes:
        steps = [{"text": (s.get("text") or "").strip()[:200], "done": bool(s.get("done"))}
                 for s in changes["subtasks"] or [] if (s.get("text") or "").strip()]
        if len(steps) > STEP_LIMIT:
            raise Invalid(f"Up to {STEP_LIMIT} steps", field="subtasks")
        old = task.subtasks or []
        if steps != old:
            same = [s["text"] for s in steps] == [s["text"] for s in old]
            ticked = [s for s, o in zip(steps, old, strict=False) if s["done"] != o["done"]] if same else []
            line = (f"{'Ticked' if ticked[0]['done'] else 'Unticked'} ‘{ticked[0]['text']}’" if len(ticked) == 1
                    else f"Checklist changed · {sum(s['done'] for s in steps)} of {len(steps)} done")
            task.subtasks = steps
            _log(db, p, task, "checklist", line, {"done": sum(s["done"] for s in steps), "of": len(steps)})
    task.version += 1
    return task


def comment(db: Session, p: Principal, task: Task, text: str) -> TaskEvent:
    body = (text or "").strip()
    if not body:
        raise Invalid("Write a comment", field="text")
    _can_change(p, task)
    event = TaskEvent(organization_id=p.org_id, task_id=task.id, kind="comment", text=body[:500], actor_user_id=p.user_id)
    db.add(event)
    db.flush()
    audit(db, p, "task.commented", "task", task.id, {"title": task.title, "length": len(body)})
    return event


def suggested_message(db: Session, task: Task) -> str | None:
    """What to tell the customer, for a task that asks for it (an alert about a late load)."""
    if task.action != "Notify" or task.entity_type != "load" or not task.entity_id:
        return None
    load = db.get(Load, task.entity_id)
    if load is None or load.customer_id is None:
        return None
    news = f" {task.detail}." if task.detail else ""
    return (f"Hello, an update on load {load.load_number}: it is running behind its appointment.{news} "
            "We’ll keep you posted until it’s delivered.")


def send_to_customer(db: Session, p: Principal, task: Task, body: str) -> tuple[Task, Task | None]:
    """Send the update to the load's customer, then mark the task done."""
    from app.modules.messaging import service as messaging
    if not p.can("messages.send"):
        raise Forbidden("Your role does not allow sending messages")
    _can_change(p, task)
    load = db.get(Load, task.entity_id) if task.entity_type == "load" and task.entity_id else None
    if load is None or load.customer_id is None:
        raise Conflict("This task isn’t about a customer’s load", code="NO_CUSTOMER")
    conv, _ = messaging.start(db, p, kind="customer", customer_id=load.customer_id)
    messaging.send(db, p, conv, body=body, channels=None, load_id=load.id)
    nxt = _complete(db, p, task, "Customer told")
    task.version += 1
    return task, nxt


def get(db: Session, task_id: uuid.UUID) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise NotFound("Task not found")
    return task


def _awake():
    return or_(Task.snoozed_until.is_(None), Task.snoozed_until <= datetime.now(UTC))


def mine_filter(p: Principal, tab: str, team: bool = False):
    """Which tasks a tab lists. The team's view (for full-access roles) lists everyone's."""
    now = datetime.now(UTC)
    who = [] if team and manages(p) else [Task.assignee_user_id == p.user_id]
    seen = visible(p)
    if tab == "queue":  # everything the screen sorts into its tabs, views and calendar
        recent = and_(Task.status.in_(("done", "cancelled")), Task.done_at >= now - DONE_KEPT)
        if team and manages(p):
            return [or_(Task.status == "open", recent), *seen]
        return [or_(Task.assignee_user_id == p.user_id,
                    and_(Task.created_by == p.user_id, Task.assignee_user_id != p.user_id, Task.status == "open")),
                or_(Task.status == "open", recent), *seen]
    if tab == "by_me":
        return [Task.created_by == p.user_id, Task.assignee_user_id != p.user_id, Task.status == "open", *seen]
    if tab == "done":
        return [*who, Task.status.in_(("done", "cancelled")), *seen]
    if tab == "snoozed":
        return [*who, Task.status == "open", Task.snoozed_until > now, *seen]
    if tab == "today":
        return [*who, Task.status == "open", _awake(), Task.due_at <= end_of_day(p), *seen]
    return [*who, Task.status == "open", _awake(), *seen]


def counts(db: Session, p: Principal) -> dict[str, int]:
    def n(*where) -> int:
        return db.scalar(select(func.count()).select_from(Task).where(*where)) or 0
    out = {tab: n(*mine_filter(p, tab)) for tab in ("open", "today", "by_me", "snoozed")}
    out["done"] = n(*mine_filter(p, "done"), Task.done_at >= datetime.now(UTC) - DONE_KEPT)
    out["overdue"] = n(*mine_filter(p, "open"), Task.due_at < datetime.now(UTC))
    hidden = hidden_types(p)
    out["hidden"] = n(Task.assignee_user_id == p.user_id, Task.status == "open", Task.entity_type.in_(hidden)) if hidden else 0
    return out


def insights(db: Session, p: Principal, team: bool = False) -> dict[str, Any]:
    """How the queue is going, from the tasks themselves: done today, how long tasks take to close, what is
    overdue or about to miss its promise, the last seven days, and (for full-access roles) who holds what."""
    now = datetime.now(UTC)
    who = [] if team and manages(p) else [Task.assignee_user_id == p.user_id]
    seen = visible(p)
    today = p.today()
    start = datetime.combine(today - timedelta(days=6), time(0), _tz(p))
    done = db.execute(select(Task.created_at, Task.done_at).where(*who, *seen, Task.status == "done",
                                                                  Task.done_at >= start)).all()
    per_day = {today - timedelta(days=i): 0 for i in range(6, -1, -1)}
    for _, at in done:
        day = at.astimezone(_tz(p)).date()
        if day in per_day:
            per_day[day] += 1
    spans = [(at - made).total_seconds() / 60 for made, at in done if made and at and at >= made]
    open_ = [*who, *seen, Task.status == "open", _awake()]
    out: dict[str, Any] = {
        "done_today": per_day[today],
        "avg_close_minutes": round(sum(spans) / len(spans)) if spans else None,
        "overdue": db.scalar(select(func.count()).select_from(Task).where(*open_, Task.due_at < now)) or 0,
        "sla_at_risk": db.scalar(select(func.count()).select_from(Task).where(
            *open_, Task.sla_at.is_not(None), Task.sla_at < now + timedelta(hours=2))) or 0,
        "per_day": [{"day": day, "done": count} for day, count in per_day.items()],
        "per_person": [],
    }
    if manages(p):
        rows = db.execute(select(User.full_name, func.count()).join(Task, Task.assignee_user_id == User.id)
                          .where(*seen, Task.status == "open", _awake()).group_by(User.full_name)
                          .order_by(func.count().desc(), User.full_name)).all()
        out["per_person"] = [{"name": name, "open": count} for name, count in rows]
    return out


# ---------------------------------------------------------------- reminders, sent by FlyFleet
def send_reminders(db: Session, p: Principal, now: datetime | None = None) -> int:
    """For each person on the team: the morning summary once a day at the time they chose, and a note 30 minutes
    before a task is due. Email goes out now; Telegram isn't connected yet, so a Telegram-only choice waits."""
    now = now or datetime.now(UTC)
    sent = 0
    people = db.execute(select(User.id, User.email, User.full_name).join(Membership, Membership.user_id == User.id)
                        .where(Membership.active.is_(True), Membership.role.notin_(APP_ROLES))).all()
    local = now.astimezone(_tz(p))
    for user_id, email, name in people:
        prefs = reminder_settings(db, user_id)
        if prefs["via"] not in ("email", "both") or not email:
            continue
        mine = [Task.assignee_user_id == user_id, Task.status == "open",
                or_(Task.snoozed_until.is_(None), Task.snoozed_until <= now)]
        if prefs["summary"] and f"{local:%H:%M}" >= prefs["send_at"]:
            key = f"{REMINDERS_KEY}.summary_on"
            last = db.scalar(select(UserPreference.value).where(UserPreference.user_id == user_id, UserPreference.key == key))
            if last != local.date().isoformat():
                n_open = db.scalar(select(func.count()).select_from(Task).where(*mine)) or 0
                n_today = db.scalar(select(func.count()).select_from(Task).where(*mine, Task.due_at <= end_of_day(p))) or 0
                n_late = db.scalar(select(func.count()).select_from(Task).where(*mine, Task.due_at < now)) or 0
                mail.send(email, f"Your tasks today: {n_open} open · {n_today} due today · {n_late} overdue",
                          f"Good morning {name.split(' ')[0]},\n\n{n_open} open · {n_today} due today · {n_late} overdue."
                          f"\n\nOpen My tasks in FlyFleet ({p.org_name}) to start.")
                stmt = insert(UserPreference).values(organization_id=p.org_id, user_id=user_id, key=key,
                                                     value=local.date().isoformat())
                db.execute(stmt.on_conflict_do_update(index_elements=["organization_id", "user_id", "key"],
                                                      set_={"value": stmt.excluded.value}))
                sent += 1
        if prefs["before_due"]:
            soon = db.scalars(select(Task).where(*mine, Task.all_day.is_(False), Task.due_at > now,
                                                 Task.due_at <= now + timedelta(minutes=30))).all()
            for task in soon:
                if db.scalar(select(TaskEvent.id).where(TaskEvent.task_id == task.id, TaskEvent.kind == "history",
                                                        TaskEvent.text.like("Reminder emailed%"))):
                    continue
                mail.send(email, f"Due at {_clock(p, task.due_at)}: {task.title}"[:200],
                          f"{task.title}\n{task.detail or ''}\n\nDue in under 30 minutes.")
                db.add(TaskEvent(organization_id=p.org_id, task_id=task.id, kind="history",
                                 text=f"Reminder emailed to {name}, 30 minutes before it’s due"))
                sent += 1
    db.flush()
    return sent


# ---------------------------------------------------------------- saved views
VIEWS_SEEDED = "tasks.views_seeded"
STARTER_VIEWS = [("High priority", {"tab": "open", "priority": "high"}), ("Assigned by me", {"tab": "by_me"})]


def seed_views(db: Session, p: Principal) -> None:
    """Two views to start from, once: anyone can remove them, and they don't come back."""
    from app.modules.organizations.models import SavedView
    if db.scalar(select(UserPreference.id).where(UserPreference.user_id == p.user_id, UserPreference.key == VIEWS_SEEDED)):
        return
    for name, params in STARTER_VIEWS:
        db.add(SavedView(organization_id=p.org_id, owner_user_id=p.user_id, resource="tasks", name=name, params=params))
    stmt = insert(UserPreference).values(organization_id=p.org_id, user_id=p.user_id, key=VIEWS_SEEDED, value=True)
    db.execute(stmt.on_conflict_do_nothing(index_elements=["organization_id", "user_id", "key"]))
    db.flush()
