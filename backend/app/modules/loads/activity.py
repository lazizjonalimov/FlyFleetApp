"""A load's activity feed: every change to a load, who made it and when, in words. Written from the audit entry each
change already makes, so nothing that is audited is missing here. Rows are only ever added. Lines about money are
marked, and only shown to roles that may see rates."""
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import Principal

SYSTEM = uuid.UUID(int=0)
MONEY_FIELDS = {"customer_rate", "fuel_surcharge_pct", "detention_free_hours", "detention_rate"}
FIELD_WORDS = {
    "reference": "PO number", "bol_number": "BOL number", "pickup_number": "pickup number",
    "delivery_number": "delivery number", "seal_number": "seal number", "commodity": "commodity",
    "equipment_type": "equipment", "weight_lbs": "weight", "miles": "miles", "instructions": "instructions",
    "customer_id": "customer", "terminal_id": "terminal", "customer_rate": "line haul",
    "fuel_surcharge_pct": "fuel surcharge", "detention_free_hours": "detention free time",
    "detention_rate": "detention rate", "reefer_set_point_f": "reefer set point",
    "checkcall_reminder_hours": "check-call reminder", "recurrence": "repeat",
}
STATUS_WORDS = {"draft": "draft", "planned": "planned", "assigned": "assigned", "dispatched": "dispatched",
                "at_pickup": "at pickup", "in_transit": "in transit", "at_delivery": "at delivery",
                "delivered": "delivered", "pod_review": "POD review", "completed": "completed", "on_hold": "on hold",
                "cancelled": "cancelled"}
TONE = {"cancel": "bad", "hold": "warn", "reject_pod": "warn", "approve_pod": "ok", "depart": "info"}


def describe(action: str, data: dict[str, Any] | None) -> tuple[str, str, str, bool] | None:
    """(kind, text, tone, money) for an audited load change, or None for one that isn't a change to the load."""
    d = data or {}
    name = action.split(".", 1)[1] if "." in action else action
    if action == "load.bols_printed":
        return None
    if action.startswith(("load_charge.", "load_item.")):
        what = "a charge" if action.startswith("load_charge") else "an item"
        verb = {"created": "added", "updated": "changed", "deleted": "removed"}.get(name, name)
        return ("charges" if what == "a charge" else "items"), f"{verb} {what}", "info", what == "a charge"
    if action == "load.charge_reviewed":
        return "charges", f"{d.get('verdict', 'reviewed')} the {d.get('type', 'charge').replace('_', ' ')} charge", \
            "ok" if d.get("verdict") == "approved" else "warn", True
    if action == "load.check_call":
        via = {"phone": "by phone", "driver_app": "from the driver app", "text": "by text", "eld": "from the ELD",
               "email": "by email"}.get(d.get("via") or "", "")
        return "check_call", " ".join(x for x in ("logged a check call", f"at {d['place']}" if d.get("place") else "",
                                                  via) if x), "info", False
    if action == "load.check_call_overdue":
        return "check_call", d.get("text", "No check call for too long") + " · dispatch was given a task", "warn", False
    if action == "load.reefer_alert":
        return "reefer", f"reefer out of range at {d.get('temp_f')}°F · dispatch and the driver were told", "bad", False
    if action == "load.tracking_link":
        words = {"created": "made a tracking link for the customer", "on": "turned the tracking link on or changed "
                 "what it shows", "off": "turned the tracking link off", "sent": f"sent the tracking link to {d.get('to')}"}
        return "tracking_link", words.get(d.get("change"), "changed the tracking link"), "info", False
    if action == "load.duplicated":
        return "created", f"copied this load to {d.get('copy')}" + (" (repeat)" if d.get("repeat") else ""), "info", False
    if action == "load.invoice_created":
        return "invoice", "made a draft invoice for the load", "ok", True
    if action == "load.created":
        text = "created the load" + (" as a draft" if d.get("status") == "draft" else "")
        if d.get("copied_from"):
            text += f", copied from {d['copied_from']}"
        return "created", text, "info", False
    if action == "load.updated":
        fields = [k for k in d if k != "version"]
        words = ", ".join(FIELD_WORDS.get(k, k.replace("_", " ")) for k in fields) or "details"
        return "updated", f"changed the {words}", "info", any(k in MONEY_FIELDS for k in fields)
    if action == "load.stops_changed":
        return "stops", f"changed the stops ({d.get('stops', '?')} in all)", "info", False
    if action == "load.stop_updated":
        return "stops", f"changed stop {d.get('stop', '')}".strip(), "info", False
    if action == "load.note_added":
        return "note", "added a note", "info", False
    if action == "load.pod_requested":
        return "documents", f"asked {d.get('driver', 'the driver')} for the proof of delivery", "info", False
    if action == "load.rescheduled":
        days = int(d.get("days", 0))
        when = f"{abs(days)} day{'s' if abs(days) != 1 else ''} {'later' if days > 0 else 'earlier'}"
        return "schedule", f"moved the load {when}", "info", False
    if action in ("dispatch.assigned", "load.reassign"):
        text = "assigned a driver and equipment" if action == "dispatch.assigned" else "reassigned the load"
        return "assignment", text, "info", False
    if action == "dispatch.undone":
        return "assignment", "took the assignment back", "warn", False
    if "from" in d and "to" in d:
        note = f" · {d['note']}" if d.get("note") else ""
        text = f"moved the load from {STATUS_WORDS.get(d['from'], d['from'])} to {STATUS_WORDS.get(d['to'], d['to'])}"
        return "status", text + note, TONE.get(name, "info"), False
    return "other", name.replace("_", " "), "info", False


def add(db: Session, p: Principal, load_id: uuid.UUID, kind: str, text: str, *, tone: str = "info",
        money: bool = False, data: dict[str, Any] | None = None) -> None:
    from app.modules.loads.models import LoadActivity
    system = p.user_id == SYSTEM
    db.add(LoadActivity(organization_id=p.org_id, load_id=load_id, kind=kind, text=text[:500], tone=tone,
                        data={**(data or {}), **({"money": True} if money else {})},
                        actor_user_id=None if system else p.user_id, actor_name="FlyFleet" if system else p.full_name))


def from_audit(db: Session, p: Principal, action: str, load_id: uuid.UUID, data: dict[str, Any] | None) -> None:
    found = describe(action, data)
    if found is not None:
        kind, text, tone, money = found
        add(db, p, load_id, kind, text, tone=tone, money=money, data={"action": action})


def feed(db: Session, p: Principal, load_id: uuid.UUID, limit: int = 100):
    from app.modules.loads.models import LoadActivity
    rows = db.scalars(select(LoadActivity).where(LoadActivity.load_id == load_id)
                      .order_by(LoadActivity.at.desc(), LoadActivity.id).limit(limit))
    rates = p.can("loads.rates.read")
    return [r for r in rows if rates or not (r.data or {}).get("money")]
