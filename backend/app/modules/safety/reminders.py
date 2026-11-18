"""Expiry reminders. Once a night, at the company's hour, every dated item running out within the lead times gets
one reminder for the tightest window it has reached: 60, 30, 14, 7 and 1 days out by default. A driver hears about
their own papers by the channels the rules name; the people named for copies get a task that follows the item
until it is renewed. Each reminder is sent once per item, expiry date and window, and none marks anything
compliant: a reviewer approves the replacement.

Runs from `scripts/run_reminders.py` on a schedule, and catches up on its own when the compliance pages are read
after a run was due, so a missed night is never lost.
"""
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.deps import Principal
from app.modules.dispatch.eligibility import qualifications_by_driver
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.organizations.models import AuditLog
from app.modules.safety.matrix import _pending, company_files
from app.modules.safety.models import ComplianceReminder, ComplianceSettings
from app.modules.safety.rules import ITEM_LABELS, ORGANIZATION_ITEMS, fmt, latest, lower
from app.modules.safety.settings import settings_of, stored
from app.modules.tasks.models import Task

# Channels a reminder can go by. Only the driver app reaches anyone today; the others need a messaging connection
# in Integrations and are recorded as not sent until then.
CHANNELS = {"app": "Driver app", "telegram": "Telegram", "sms": "SMS", "email": "Email"}
CONNECTED = ("app",)
COPY_TO = {"safety_manager": "Safety team", "fleet_manager": "Fleet managers"}


@dataclass
class Due:
    entity_type: str
    entity_id: uuid.UUID
    entity_label: str
    item: str
    expires_on: date
    days_left: int


def _zone(p: Principal) -> ZoneInfo:
    return ZoneInfo(p.timezone or "UTC")


def last_due(row: ComplianceSettings, p: Principal, now: datetime) -> datetime:
    """The most recent scheduled run at or before now."""
    local = now.astimezone(_zone(p))
    at = datetime.combine(local.date(), time(row.run_hour), _zone(p))
    return at if at <= local else at - timedelta(days=1)


def next_run(row: ComplianceSettings, p: Principal, now: datetime) -> datetime:
    return last_due(row, p, now) + timedelta(days=1)


def _lock(db: Session, org_id: uuid.UUID) -> None:
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"reminders:{org_id}"})


def due_items(db: Session, p: Principal, horizon: int) -> tuple[list[Due], set[tuple[uuid.UUID, str]]]:
    """Every dated item running out within the horizon and not yet run out, less those whose replacement is
    waiting for a reviewer (returned apart, by record and item)."""
    today = p.today()
    until = today + timedelta(days=horizon)
    out: list[Due] = []

    def add(entity_type: str, entity_id: uuid.UUID, label: str, item: str, expires_on: date | None) -> None:
        if expires_on is not None and today <= expires_on <= until:
            out.append(Due(entity_type, entity_id, label, item, expires_on, (expires_on - today).days))

    drivers = list(db.scalars(select(Driver).where(Driver.status == "active")))
    quals = qualifications_by_driver(db, [d.id for d in drivers])
    for d in drivers:
        name = f"{d.first_name} {d.last_name}"
        add("driver", d.id, name, "cdl", d.cdl_expiry)
        add("driver", d.id, name, "medical", d.medical_cert_expiry)
        for q in latest(quals.get(d.id, [])).values():
            add("driver", d.id, name, q.type, q.expires_on)
    for entity_type, model, word in (("vehicle", Vehicle, "Truck"), ("trailer", Trailer, "Trailer")):
        for u in db.scalars(select(model).where(model.status != "retired")):
            for item in ("insurance", "registration", "inspection"):
                add(entity_type, u.id, f"{word} {u.unit_number}", item, getattr(u, f"{item}_expiry"))
    for item, doc in company_files(db).items():
        if doc.review_status != "pending":
            add("organization", p.org_id, ORGANIZATION_ITEMS[item], item, doc.expires_on)
    # A replacement already sent needs a reviewer, not another reminder.
    waiting: set[tuple[uuid.UUID, str]] = set()
    for entity_type in ("driver", "vehicle", "trailer", "organization"):
        waiting |= set(_pending(db, entity_type, list({x.entity_id for x in out if x.entity_type == entity_type})))
    return [x for x in out if (x.entity_id, x.item) not in waiting], waiting


def _label(item: str) -> str:
    return ORGANIZATION_ITEMS.get(item) or ITEM_LABELS.get(item, item.replace("_", " ").capitalize())


def _when(days: int) -> str:
    return "today" if days == 0 else "tomorrow" if days == 1 else f"in {days} days"


def _people(db: Session, role: str) -> list[uuid.UUID]:
    from app.modules.tracking.incidents import _people as people
    found = people(db, role) or people(db, "admin") or people(db, "owner")
    return [user_id for user_id, _ in found]


def _copy(db: Session, p: Principal, due: Due, role: str, sent: str) -> bool:
    """The task that follows an item for the people a copy goes to: one per item and expiry, kept up to date."""
    people = _people(db, role)
    if not people:
        return False
    key = f"reminder:{due.entity_type}:{due.entity_id}:{due.item}:{due.expires_on}:{role}"
    label = _label(due.item)
    values = {"title": f"{label} expires {_when(due.days_left)} · {due.entity_label}"[:200],
              "detail": f"Expires {fmt(due.expires_on)}. {sent}"[:300],
              "due_at": datetime.combine(due.expires_on, time(23, 59, 59), _zone(p)), "all_day": True,
              "priority": "high" if due.days_left <= 7 else "medium"}
    task = db.scalar(select(Task).where(Task.source_key == key, Task.status == "open"))
    if task is None:
        target = {"driver": "driver", "vehicle": "vehicle", "trailer": "trailer"}.get(due.entity_type)
        db.add(Task(organization_id=p.org_id, assignee_user_id=people[0], source="reminder", source_key=key,
                    entity_type=target, entity_id=due.entity_id if target else None,
                    entity_label=due.entity_label[:60], action="Open" if target else None, **values))
    else:
        for k, v in values.items():
            setattr(task, k, v)
        task.version += 1
    return True


def _settle_tasks(db: Session, p: Principal, due: list[Due], waiting: set[tuple[uuid.UUID, str]]) -> None:
    """Close the reminder tasks of items no longer coming due: renewed, sent for review, or run out (a fleet
    alert takes over then)."""
    live = {f"reminder:{d.entity_type}:{d.entity_id}:{d.item}:{d.expires_on}" for d in due}
    for task in db.scalars(select(Task).where(Task.source == "reminder", Task.status == "open")):
        if not task.source_key or task.source_key.rsplit(":", 1)[0] in live:
            continue
        _, _, entity_id, item, expires = task.source_key.split(":")[:5]
        task.outcome = ("Replacement sent for review" if (uuid.UUID(entity_id), item) in waiting
                        else "Ran out: now a fleet alert" if date.fromisoformat(expires) < p.today() else "Renewed")
        task.status, task.done_at = "done", datetime.now(UTC)
        task.version += 1


def run(db: Session, p: Principal, now: datetime | None = None) -> int:
    """Send what is due. Returns how many reminders went out."""
    now = now or datetime.now(UTC)
    _lock(db, p.org_id)
    row = settings_of(db, p.org_id)
    row.last_run_at = now
    if not row.reminders_enabled or not row.lead_days:
        return 0
    leads = sorted(row.lead_days)
    due, waiting = due_items(db, p, leads[-1])
    sent = 0
    for x in due:
        window = next(lead for lead in leads if x.days_left <= lead)
        new_id = db.execute(insert(ComplianceReminder).values(
            id=uuid.uuid4(), organization_id=p.org_id, entity_type=x.entity_type, entity_id=x.entity_id,
            entity_label=x.entity_label[:120], item=x.item, expires_on=x.expires_on, lead_days=window, sent_at=now,
        ).on_conflict_do_nothing(constraint="uq_compliance_reminders_window").returning(ComplianceReminder.id)).scalar()
        if new_id is None:
            continue  # this window's reminder already went out
        reminder = db.get(ComplianceReminder, new_id)
        label = _label(x.item)
        deliveries: list[dict] = []
        how = "No reminder to the driver: this item isn't theirs."
        if x.entity_type == "driver":
            from app.modules.messaging.service import tell_driver
            msg = tell_driver(
                db, p.org_id, x.entity_id, event="compliance.reminder",
                title=f"{label} expires {_when(x.days_left)}",
                body=f"Your {lower(label)} expires on {fmt(x.expires_on)}. Send a photo of the new one in the app; "
                     f"the safety team reviews it before it counts.",
                channels=row.channels)
            reminder.message_id = msg.id
            deliveries = [{"to": "driver", **d} for d in msg.deliveries]
            reached = [CHANNELS.get(d["channel"], d["channel"]) for d in msg.deliveries if d["status"] != "not_sent"]
            how = f"Reminder sent to the driver by {', '.join(reached)}." if reached else \
                "The driver couldn't be reached: not on the app, and no messaging channel connected."
        for role in row.copy_to:
            if _copy(db, p, x, role, how):
                deliveries.append({"to": role, "channel": "task", "status": "sent"})
        reminder.deliveries = deliveries
        reminder.failed = not any(d["status"] != "not_sent" for d in deliveries)
        sent += 1
    _settle_tasks(db, p, due, waiting)
    if sent:
        # Sent by FlyFleet on schedule, not by whoever happened to open a page.
        db.add(AuditLog(organization_id=p.org_id, actor_user_id=None, action="compliance.reminders_sent",
                        entity_type="organization", entity_id=p.org_id, data={"count": sent}))
    return sent


def catch_up(db: Session, p: Principal, now: datetime | None = None) -> None:
    """Run now if a scheduled run has passed since the last one."""
    now = now or datetime.now(UTC)
    row = stored(db)
    if row is not None and row.last_run_at is not None and row.last_run_at >= last_due(row, p, now):
        return
    if row is not None and not row.reminders_enabled:
        return
    run(db, p, now)
    db.flush()


def week_counts(db: Session, p: Principal, now: datetime | None = None) -> tuple[int, int]:
    """Reminders sent this week (since Monday, company time), and how many reached nobody."""
    now = now or datetime.now(UTC)
    local = now.astimezone(_zone(p)).date()
    monday = datetime.combine(local - timedelta(days=local.weekday()), time(0), _zone(p))
    sent, failed = db.execute(select(func.count(), func.count().filter(ComplianceReminder.failed.is_(True)))
                              .where(ComplianceReminder.sent_at >= monday)).one()
    return sent, failed
