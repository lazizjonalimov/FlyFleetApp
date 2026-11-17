"""Messages: one conversation per driver, conversations with a customer's contacts, and team conversations.

Every message is kept in FlyFleet whatever carried it, with what happened on each channel: sent, delivered, read,
or not sent and why. The driver app works today: it collects messages from the API, so a message is delivered once
the app has fetched it and read once the driver has opened the conversation. Telegram, SMS and email need a
messaging connection the company hasn't set up yet, so they are shown as not connected and nothing goes by them.
A message that no channel can carry isn't sent at all; FlyFleet never pretends someone was told.
"""
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core import scope as team_scope
from app.core.audit import audit
from app.core.deps import Principal
from app.core.errors import Conflict, Forbidden, Invalid, NotFound
from app.modules.customers.models import Customer, CustomerContact
from app.modules.dispatch.models import DispatchAssignment
from app.modules.documents.models import Document
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.loads.models import Load, LoadStop
from app.modules.messaging.models import Conversation, ConversationRead, Message
from app.modules.organizations.models import Membership, User

LABEL = {"app": "App", "telegram": "Telegram", "sms": "SMS", "email": "Email", "in_app": "In app"}
# What a dispatcher most often needs to say to a driver, one click away.
QUICK_REPLIES = ["Call me when stopped", "Send a BOL photo", "Running late?"]
EQUIPMENT = {"dry_van": "Dry van", "reefer": "Reefer", "flatbed": "Flatbed", "step_deck": "Step deck",
             "power_only": "Power only", "tanker": "Tanker", "other": "Other"}
# Loads a driver is on, in the order they matter: on the road first, then the next one, then the last delivered.
ON_ROAD = ("dispatched", "at_pickup", "in_transit", "at_delivery")


def initials(name: str) -> str:
    parts = [x for x in name.replace("·", " ").split() if x[:1].isalnum()]
    return ((parts[0][0] + (parts[1][0] if len(parts) > 1 else "")) if parts else "?").upper()


def _name(d: Driver) -> str:
    return f"{d.first_name} {d.last_name}".strip()


def _user_name(db: Session, user_id: uuid.UUID | None) -> str | None:
    return db.scalar(select(User.full_name).where(User.id == user_id)) if user_id else None


# ---------------------------------------------------------------- channels
def on_app(db: Session, driver: Driver) -> bool:
    """Whether the driver signs in to the driver app, so messages reach them there."""
    if driver.user_id is None:
        return False
    return bool(db.scalar(select(Membership.active).where(Membership.user_id == driver.user_id)))


def driver_channels(db: Session, driver: Driver) -> list[dict[str, Any]]:
    app = on_app(db, driver)
    return [
        {"key": "app", "label": "Driver app", "connected": app,
         "state": "connected" if app else ("off" if driver.user_id else "not_invited"),
         "detail": "Messages, alerts and load updates" if app
         else "Their sign-in is turned off" if driver.user_id else "Not signed up to the driver app yet"},
        {"key": "telegram", "label": "Telegram", "connected": False, "state": "not_connected",
         "detail": "Telegram isn't connected for the company yet"},
        {"key": "sms", "label": "SMS fallback", "connected": False, "state": "not_connected",
         "detail": "No SMS provider is connected yet"},
    ]


def customer_channels(contact: CustomerContact | None) -> list[dict[str, Any]]:
    return [{"key": "email", "label": "Email", "connected": False, "state": "not_connected",
             "detail": "Email isn't connected yet" + (f" · {contact.email}" if contact and contact.email else "")}]


TEAM_CHANNELS = [{"key": "in_app", "label": "In app", "connected": True, "state": "connected",
                  "detail": "Shown to the people in this conversation"}]


def channels_of(db: Session, conv: Conversation) -> list[dict[str, Any]]:
    if conv.kind == "driver":
        return driver_channels(db, db.get(Driver, conv.driver_id))
    if conv.kind == "customer":
        return customer_channels(db.get(CustomerContact, conv.contact_id) if conv.contact_id else None)
    return TEAM_CHANNELS


def _deliveries(channels: list[str], available: set[str], at: datetime) -> list[dict[str, Any]]:
    out = []
    for c in channels:
        if c in available:
            out.append({"channel": c, "status": "sent", "at": at.isoformat()})
        else:
            out.append({"channel": c, "status": "not_sent", "reason": "not_connected"})
    return out


# ---------------------------------------------------------------- conversations
def driver_conversation(db: Session, org_id: uuid.UUID, driver_id: uuid.UUID,
                        created_by: uuid.UUID | None = None) -> Conversation:
    """A driver's one conversation, made the first time anyone needs it."""
    db.execute(insert(Conversation).values(id=uuid.uuid4(), organization_id=org_id, kind="driver", driver_id=driver_id,
                                           created_by=created_by)
               .on_conflict_do_nothing(index_elements=["organization_id", "driver_id"],
                                       index_where=Conversation.kind == "driver"))
    return db.scalar(select(Conversation).where(Conversation.kind == "driver", Conversation.driver_id == driver_id))


def get(db: Session, p: Principal, conversation_id: uuid.UUID) -> Conversation:
    conv = db.scalar(_visible(select(Conversation).where(Conversation.id == conversation_id), p))
    if conv is None:
        raise NotFound("Conversation not found")
    return conv


def start(db: Session, p: Principal, *, kind: str, driver_id: uuid.UUID | None = None,
          customer_id: uuid.UUID | None = None, contact_id: uuid.UUID | None = None, title: str | None = None,
          members: list[uuid.UUID] | None = None) -> tuple[Conversation, bool]:
    """Open the conversation to write in: the driver's own, a customer contact's, or a new team conversation."""
    if kind == "driver":
        if driver_id is None or db.scalar(team_scope.where(select(Driver.id).where(Driver.id == driver_id),
                                                           team_scope.drivers(p.scope, Driver.id))) is None:
            raise Invalid("Choose a driver", field="driver_id")
        existing = db.scalar(select(Conversation.id).where(Conversation.kind == "driver",
                                                           Conversation.driver_id == driver_id))
        return driver_conversation(db, p.org_id, driver_id, p.user_id), existing is None
    if kind == "customer":
        if customer_id is None or db.get(Customer, customer_id) is None:
            raise Invalid("Choose a customer", field="customer_id")
        if contact_id is not None:
            contact = db.get(CustomerContact, contact_id)
            if contact is None or contact.customer_id != customer_id:
                raise Invalid("Choose one of the customer's contacts", field="contact_id")
        found = db.scalar(select(Conversation).where(Conversation.kind == "customer",
                                                     Conversation.customer_id == customer_id,
                                                     Conversation.contact_id.is_(None) if contact_id is None
                                                     else Conversation.contact_id == contact_id))
        if found:
            return found, False
        conv = Conversation(organization_id=p.org_id, kind="customer", customer_id=customer_id, contact_id=contact_id,
                            created_by=p.user_id)
        db.add(conv)
        db.flush()
        return conv, True
    if kind == "team":
        name = (title or "").strip()
        if not name:
            raise Invalid("Name the conversation", field="title")
        people = {str(m) for m in (members or [])} | {str(p.user_id)}
        known = {str(u) for u in db.scalars(select(Membership.user_id).where(
            Membership.user_id.in_([uuid.UUID(m) for m in people]), Membership.active.is_(True),
            Membership.role.notin_(("driver", "customer", "owner_portal"))))}
        if people - known:
            raise Invalid("Everyone in a team conversation must be on the team", field="members")
        if len(known) < 2:
            raise Invalid("Add at least one teammate", field="members")
        conv = Conversation(organization_id=p.org_id, kind="team", title=name[:120], members=sorted(known),
                            created_by=p.user_id)
        db.add(conv)
        db.flush()
        return conv, True
    raise Invalid("Choose who the conversation is with", field="kind")


def _post(db: Session, conv: Conversation, *, direction: str, body: str, kind: str = "text",
          title: str | None = None, event: str | None = None, author_user_id: uuid.UUID | None = None,
          author_driver_id: uuid.UUID | None = None, author_name: str | None = None,
          deliveries: list[dict[str, Any]] | None = None, via: str | None = None, load_id: uuid.UUID | None = None,
          incident_id: uuid.UUID | None = None, document_ids: list[uuid.UUID] | None = None,
          data: dict[str, Any] | None = None) -> Message:
    msg = Message(organization_id=conv.organization_id, conversation_id=conv.id, kind=kind, event=event,
                  direction=direction, author_user_id=author_user_id, author_driver_id=author_driver_id,
                  author_name=author_name, title=title, body=body, load_id=load_id, incident_id=incident_id,
                  document_ids=[str(d) for d in (document_ids or [])], deliveries=deliveries or [], via=via,
                  data=data or {})
    db.add(msg)
    db.flush()
    db.refresh(msg)
    conv.last_message_at = msg.created_at
    return msg


def _documents(db: Session, p: Principal, ids: list[uuid.UUID], *, driver: bool = False) -> list[uuid.UUID]:
    out = []
    for doc_id in dict.fromkeys(ids):
        doc = db.get(Document, doc_id)
        if doc is None or doc.upload_status != "uploaded" or (driver and doc.uploaded_by != p.user_id):
            raise Invalid("Attach a file that has finished uploading", field="document_ids")
        out.append(doc.id)
    if len(out) > 5:
        raise Invalid("Attach up to 5 files", field="document_ids")
    return out


def _load_ref(db: Session, load_id: uuid.UUID | None) -> uuid.UUID | None:
    if load_id is not None and db.get(Load, load_id) is None:
        raise Invalid("Load not found", field="load_id")
    return load_id


def send(db: Session, p: Principal, conv: Conversation, *, body: str, channels: list[str] | None,
         load_id: uuid.UUID | None = None, document_ids: list[uuid.UUID] | None = None) -> Message:
    """A teammate writes in a conversation. It goes by every channel asked for that can carry it."""
    text = (body or "").strip()
    if not text and not document_ids:
        raise Invalid("Write a message", field="body")
    offered = channels_of(db, conv)
    available = {c["key"] for c in offered if c["connected"]}
    wanted = list(dict.fromkeys(channels or [c["key"] for c in offered if c["connected"]]))
    unknown = [c for c in wanted if c not in {x["key"] for x in offered}]
    if unknown:
        raise Invalid(f"{LABEL.get(unknown[0], unknown[0])} isn't a way to reach this conversation", field="channels")
    if not [c for c in wanted if c in available]:
        who = "the driver" if conv.kind == "driver" else "the customer"
        raise Conflict(f"Nothing can carry this message to {who} yet: " +
                       "; ".join(c["detail"][0].lower() + c["detail"][1:] for c in offered) + ".",
                       code="NO_CHANNEL")
    docs = _documents(db, p, document_ids or [])
    author = _user_name(db, p.user_id)
    msg = _post(db, conv, direction="internal" if conv.kind == "team" else "out", body=text,
                author_user_id=p.user_id, author_name=author,
                deliveries=[] if conv.kind == "team" else _deliveries([c for c in wanted if c in available], available,
                                                                      datetime.now(UTC)),
                via="in_app" if conv.kind == "team" else None, load_id=_load_ref(db, load_id), document_ids=docs)
    mark_read(db, p, conv, msg.created_at)
    audit(db, p, "message.sent", "conversation", conv.id,
          {"message_id": str(msg.id), "channels": wanted, "attachments": len(docs)})
    return msg


def mark_read(db: Session, p: Principal, conv: Conversation, at: datetime | None = None) -> None:
    at = at or conv.last_message_at or datetime.now(UTC)
    db.execute(insert(ConversationRead).values(id=uuid.uuid4(), organization_id=p.org_id, conversation_id=conv.id,
                                               user_id=p.user_id, last_read_at=at)
               .on_conflict_do_update(constraint="uq_conversation_reads",
                                      set_={"last_read_at": func.greatest(ConversationRead.last_read_at, at)}))


# ---------------------------------------------------------------- FlyFleet's own cards in a driver's conversation
def tell_driver(db: Session, org_id: uuid.UUID, driver_id: uuid.UUID, *, event: str, title: str, body: str,
                driver_text: str | None = None, load_id: uuid.UUID | None = None,
                incident_id: uuid.UUID | None = None, channels: list[str] | None = None) -> Message:
    """Put a card in the driver's conversation (a load dispatched to them, an alert) and send it to them by the
    channels asked for that work. The card says what reached them."""
    driver = db.get(Driver, driver_id)
    conv = driver_conversation(db, org_id, driver_id)
    available = {"app"} if on_app(db, driver) else set()
    wanted = list(dict.fromkeys(channels or ["app"]))
    deliveries = _deliveries(wanted, available, datetime.now(UTC))
    for d in deliveries:
        if d["channel"] == "app" and d["status"] == "not_sent":
            d["reason"] = "not_on_app"
    return _post(db, conv, kind="system", event=event, direction="system", title=title, body=body,
                 deliveries=deliveries, load_id=load_id, incident_id=incident_id,
                 data={"driver_text": driver_text} if driver_text else {})


def reached(msg: Message) -> list[str]:
    return [d["channel"] for d in msg.deliveries if d["status"] != "not_sent"]


def _local(p_tz: str | None, at: datetime, today: datetime | None = None) -> str:
    tz = ZoneInfo(p_tz or "UTC")
    local = at.astimezone(tz)
    now = (today or datetime.now(UTC)).astimezone(tz)
    return f"{local:%H:%M}" if local.date() == now.date() else f"{local:%b} {local.day} {local:%H:%M}"


def on_dispatched(db: Session, p: Principal, load: Load, assignment: DispatchAssignment) -> None:
    """A load sent to a driver shows in their conversation, and in their app when they are on it."""
    stops = list(db.scalars(select(LoadStop).where(LoadStop.load_id == load.id).order_by(LoadStop.seq)))
    pickup = next((s for s in stops if s.type == "pickup"), None)
    delivery = next((s for s in reversed(stops) if s.type == "delivery"), None)
    parts = [f"{load.origin_city or '—'} → {load.destination_city or '—'}"]
    if pickup and (pickup.appt_start or pickup.appt_end):
        parts.append(f"pickup {_local(p.timezone, pickup.appt_start or pickup.appt_end)}")
    if delivery and (delivery.appt_start or delivery.appt_end):
        parts.append(f"delivery appointment {_local(p.timezone, delivery.appt_start or delivery.appt_end)}")
    for driver_id in (assignment.driver_id, assignment.co_driver_id):
        if driver_id is None:
            continue
        driver = db.get(Driver, driver_id)
        tell_driver(db, p.org_id, driver_id, event="load_dispatched",
                    title=f"Load {load.load_number} dispatched to {driver.first_name}", body=" · ".join(parts),
                    load_id=load.id)


def request_pod(db: Session, p: Principal, load: Load) -> dict[str, Any]:
    """Ask the driver who hauled a delivered load for its signed proof of delivery: a card in their conversation,
    and in the driver app when they are on it. Each ask is counted on the load's missing-POD alert."""
    from app.modules.tracking import incidents
    from app.modules.tracking.models import Incident
    if load.status != "delivered":
        raise Conflict("A proof of delivery can be asked for once the load is delivered and until one is in",
                       code="WRONG_STATE")
    hauled = db.scalar(select(DispatchAssignment).where(DispatchAssignment.load_id == load.id,
                                                        DispatchAssignment.status.in_(("active", "completed")))
                       .order_by(DispatchAssignment.created_at.desc()).limit(1))
    if hauled is None:
        raise Conflict("Nobody hauled this load, so there is no driver to ask", code="NO_DRIVER")
    driver = db.get(Driver, hauled.driver_id)
    customer = db.scalar(select(Customer.name).where(Customer.id == load.customer_id))
    where = ", ".join(x for x in (customer, load.destination_city) if x)
    msg = tell_driver(db, p.org_id, driver.id, event="pod_request", title=f"Proof of delivery needed for {load.load_number}",
                      body=f"{where} · upload the signed POD in the app" if where else "Upload the signed POD in the app",
                      load_id=load.id)
    sent = "app" in reached(msg)
    now = datetime.now(UTC)
    times = 1
    row = db.scalar(select(Incident).where(Incident.kind == "pod_missing", Incident.load_id == load.id,
                                           Incident.state != "resolved"))
    who = _user_name(db, p.user_id) or "Someone"
    if row is not None:
        times = int((row.data or {}).get("pod_requests", 0)) + 1
        row.data = {**(row.data or {}), "pod_requests": times, "pod_requested_at": now.isoformat()}
        how = "driver app" if sent else "not sent: not on the driver app"
        incidents._event(db, row, "requested", now, f"{who} asked {_name(driver)} for the POD · {how}",
                         "info" if sent else "warn", p.user_id)
    audit(db, p, "load.pod_requested", "load", load.id, {"driver": _name(driver), "sent": sent, "times": times})
    return {"driver": _name(driver), "sent": sent, "times": times, "conversation_id": msg.conversation_id}


def on_driver_replied(db: Session, driver: Driver, msg: Message) -> None:
    """A reply from a driver who was just alerted goes on the alert's trail. It doesn't acknowledge the alert:
    someone in the office still does that."""
    from app.modules.tracking import incidents
    from app.modules.tracking.models import Incident
    since = msg.created_at - timedelta(hours=2)
    alerted = db.scalars(select(Message.incident_id).where(
        Message.conversation_id == msg.conversation_id, Message.event == "alert", Message.incident_id.is_not(None),
        Message.created_at >= since)).all()
    for row in db.scalars(select(Incident).where(Incident.id.in_(set(alerted)), Incident.state != "resolved")):
        if (row.data or {}).get("driver_replied_at"):
            continue
        row.data = {**(row.data or {}), "driver_replied_at": msg.created_at.isoformat(), "driver_replied_via": "app"}
        quote = msg.body if len(msg.body) <= 80 else msg.body[:79] + "…"
        incidents._event(db, row, "replied", msg.created_at, f"{_name(driver)} replied in the app · “{quote}”", "info")


# ---------------------------------------------------------------- the driver's side
def driver_inbox(db: Session, p: Principal, driver: Driver, after: datetime | None = None) -> list[Message]:
    """What the driver app shows. Fetching it is what delivers the messages waiting for the app."""
    conv = driver_conversation(db, p.org_id, driver.id)
    stmt = select(Message).where(Message.conversation_id == conv.id, Message.direction.in_(("out", "in", "system")))
    if after is not None:
        stmt = stmt.where(Message.created_at > after)
    rows = list(db.scalars(stmt.order_by(Message.created_at.desc()).limit(200)))[::-1]
    now = datetime.now(UTC).isoformat()
    for m in rows:
        if any(d["channel"] == "app" and d["status"] == "sent" for d in m.deliveries):
            m.deliveries = [{**d, "status": "delivered", "delivered_at": now} if d["channel"] == "app" and d["status"] == "sent"
                            else d for d in m.deliveries]
    # Only what was sent to the app is the driver's to see; a card that didn't reach them stays office-side.
    return [m for m in rows if m.direction == "in" or any(d["channel"] == "app" and d["status"] != "not_sent"
                                                          for d in m.deliveries)]


def driver_read(db: Session, p: Principal, driver: Driver) -> int:
    conv = driver_conversation(db, p.org_id, driver.id)
    now = datetime.now(UTC).isoformat()
    changed = 0
    for m in db.scalars(select(Message).where(Message.conversation_id == conv.id, Message.direction.in_(("out", "system")))):
        if any(d["channel"] == "app" and d["status"] in ("sent", "delivered") for d in m.deliveries):
            m.deliveries = [{**d, "status": "read", "read_at": now, **({} if d.get("delivered_at") else {"delivered_at": now})}
                            if d["channel"] == "app" and d["status"] in ("sent", "delivered") else d for d in m.deliveries]
            changed += 1
    return changed


def driver_send(db: Session, p: Principal, driver: Driver, *, body: str, load_id: uuid.UUID | None = None,
                document_ids: list[uuid.UUID] | None = None) -> Message:
    text = (body or "").strip()
    if not text and not document_ids:
        raise Invalid("Write a message", field="body")
    if load_id is not None and not db.scalar(select(DispatchAssignment.id).where(
            DispatchAssignment.load_id == load_id, DispatchAssignment.driver_id == driver.id)):
        raise Forbidden("That isn't one of your loads")
    docs = _documents(db, p, document_ids or [], driver=True)
    conv = driver_conversation(db, p.org_id, driver.id)
    msg = _post(db, conv, direction="in", body=text, author_driver_id=driver.id, author_name=_name(driver), via="app",
                load_id=load_id, document_ids=docs)
    driver_read(db, p, driver)
    on_driver_replied(db, driver, msg)
    return msg


# ---------------------------------------------------------------- what the console shows
def unread_counts(db: Session, p: Principal, ids: list[uuid.UUID] | None = None) -> dict[uuid.UUID, int]:
    """Messages from drivers, customers and teammates someone hasn't read yet, by conversation."""
    read = select(ConversationRead.conversation_id, ConversationRead.last_read_at).where(
        ConversationRead.user_id == p.user_id).subquery()
    stmt = (select(Message.conversation_id, func.count())
            .join(read, read.c.conversation_id == Message.conversation_id, isouter=True)
            .where(or_(Message.direction == "in",
                       and_(Message.direction == "internal", Message.author_user_id != p.user_id)),
                   or_(read.c.last_read_at.is_(None), Message.created_at > read.c.last_read_at))
            .group_by(Message.conversation_id))
    if ids is not None:
        stmt = stmt.where(Message.conversation_id.in_(ids))
    return dict(db.execute(stmt).all())


def _visible(stmt, p: Principal):
    stmt = stmt.where(or_(Conversation.kind != "team", Conversation.members.contains([str(p.user_id)])))
    # A dispatch team's dispatcher talks with the drivers on the team's trucks.
    drivers = team_scope.drivers(p.scope, Conversation.driver_id)
    return stmt if drivers is None else stmt.where(or_(Conversation.kind != "driver", drivers))


def total_unread(db: Session, p: Principal) -> int:
    ids = list(db.scalars(_visible(select(Conversation.id), p)))
    return sum(unread_counts(db, p, ids).values()) if ids else 0


def current_load(db: Session, driver_id: uuid.UUID) -> Load | None:
    """The load to show beside a driver's conversation: the one they are hauling, else their next one, else the
    one they delivered last."""
    rows = db.execute(select(Load, DispatchAssignment.status).join(DispatchAssignment, DispatchAssignment.load_id == Load.id)
                      .where(or_(DispatchAssignment.driver_id == driver_id, DispatchAssignment.co_driver_id == driver_id),
                             DispatchAssignment.status.in_(("active", "completed")),
                             Load.status.notin_(("cancelled", "draft")))
                      .order_by(Load.pickup_at.desc().nulls_last())).all()

    def rank(row) -> tuple:
        load, status = row
        if load.status in ON_ROAD:
            return (0, 0)
        if status == "active" and load.status in ("assigned", "planned"):
            return (1, (load.pickup_at or datetime.max.replace(tzinfo=UTC)).timestamp())
        return (2, -(load.delivered_at or load.pickup_at or datetime.min.replace(tzinfo=UTC)).timestamp())
    return min(rows, key=rank)[0] if rows else None


def load_card(db: Session, p: Principal, load: Load) -> dict[str, Any]:
    from app.modules.tracking import incidents
    now = datetime.now(UTC)
    customer = db.scalar(select(Customer.name).where(Customer.id == load.customer_id))
    assignment = db.scalar(select(DispatchAssignment).where(DispatchAssignment.load_id == load.id,
                                                            DispatchAssignment.status.in_(("active", "completed")))
                           .order_by(DispatchAssignment.created_at.desc()).limit(1))
    stops = list(db.scalars(select(LoadStop).where(LoadStop.load_id == load.id).order_by(LoadStop.seq)))
    stop = next((s for s in stops if s.departed_at is None), None)
    arrive = None
    if assignment and load.status in ON_ROAD:
        road = incidents.OnTheRoad(load, assignment.vehicle_id, assignment.driver_id, customer or "")
        road.stops = stops
        position = incidents.latest_positions(db, [assignment.vehicle_id]).get(assignment.vehicle_id)
        arrive, _ = incidents.eta(road, position, now)
    appt = (stop.appt_end or stop.appt_start) if stop else None
    trailer = db.get(Trailer, assignment.trailer_id) if assignment and assignment.trailer_id else None
    truck = db.get(Vehicle, assignment.vehicle_id) if assignment else None
    equipment = " · ".join(x for x in (EQUIPMENT.get(load.equipment_type, load.equipment_type.replace("_", " ").capitalize()),
                                         f"trailer {trailer.unit_number}" if trailer else None) if x)
    return {"id": load.id, "load_number": load.load_number, "status": load.status,
            "lane": f"{load.origin_city or '—'}{', ' + load.origin_state if load.origin_state else ''} → "
                    f"{load.destination_city or '—'}{', ' + load.destination_state if load.destination_state else ''}",
            "short_lane": f"{load.origin_city or '—'} → {load.destination_city or '—'}",
            "customer": customer, "next_stop": (stop.name or stop.city) if stop else None,
            "appointment": appt, "eta": arrive,
            "late_by_minutes": int((arrive - appt).total_seconds() // 60) if arrive and appt and arrive > appt else 0,
            "equipment": equipment, "truck": truck.unit_number if truck else None}


def incident_card(db: Session, driver_id: uuid.UUID) -> dict[str, Any] | None:
    """The latest alert the driver was sent, while it is still worth seeing beside the conversation."""
    from app.modules.tracking.incidents import LABEL as KIND_LABEL
    from app.modules.tracking.models import Incident
    row = db.scalar(select(Incident).where(Incident.driver_id == driver_id, Incident.kind.in_(("speeding", "yard_speed")),
                                           Incident.detected_at >= datetime.now(UTC) - timedelta(days=1))
                    .order_by(Incident.detected_at.desc()).limit(1))
    if row is None:
        return None
    return {"id": row.id, "number": row.number, "kind": row.kind, "label": KIND_LABEL[row.kind], "state": row.state,
            "title": row.title, "peak": float(row.peak) if row.peak is not None else None,
            "acknowledged_at": row.acknowledged_at, "resolved_at": row.resolved_at,
            "driver_replied_at": (row.data or {}).get("driver_replied_at"), "vehicle_id": row.vehicle_id}


def summary(db: Session, p: Principal, conv: Conversation, last: Message | None, unread: int,
            late: set[uuid.UUID]) -> dict[str, Any]:
    if conv.kind == "driver":
        d = db.get(Driver, conv.driver_id)
        name, tone = _name(d), "late" if conv.driver_id in late else "brand"
        channel = "app" if on_app(db, d) else "none"
    elif conv.kind == "customer":
        customer = db.get(Customer, conv.customer_id)
        contact = db.get(CustomerContact, conv.contact_id) if conv.contact_id else None
        name, tone, channel = customer.name, "mu", "email"
        sub = contact.name if contact else None
    else:
        name, tone, channel = conv.title or "Team", "mu", "team"
    preview = None
    if last is not None:
        text = last.title if last.kind == "system" else (last.body or ("Sent a file" if last.document_ids else ""))
        if last.direction == "out" or (last.direction == "internal" and last.author_user_id == p.user_id):
            preview = f"You: {text}" if last.author_user_id == p.user_id else f"{(last.author_name or '').split(' ')[0]}: {text}"
        elif last.direction == "internal" or (last.direction == "in" and conv.kind == "customer"):
            preview = f"{(last.author_name or '').split(' ')[0]}: {text}"
        else:
            preview = text
    return {"id": conv.id, "kind": conv.kind, "name": name, "initials": initials(name), "tone": tone,
            "channel": channel, "subtitle": sub if conv.kind == "customer" else None,
            "driver_id": conv.driver_id, "customer_id": conv.customer_id,
            "last": preview, "last_at": conv.last_message_at, "unread": unread}


def _late_drivers(db: Session) -> set[uuid.UUID]:
    from app.modules.tracking.models import Incident
    return set(db.scalars(select(Incident.driver_id).where(Incident.state != "resolved", Incident.driver_id.is_not(None),
                                                          Incident.kind.in_(("late", "at_risk", "speeding")))))


def listing(db: Session, p: Principal, tab: str, q: str | None, limit: int = 100) -> dict[str, Any]:
    convs = list(db.scalars(_visible(select(Conversation), p).where(Conversation.last_message_at.is_not(None))
                            .order_by(Conversation.last_message_at.desc()).limit(500)))
    unread = unread_counts(db, p, [c.id for c in convs]) if convs else {}
    lasts: dict[uuid.UUID, Message] = {}
    if convs:
        for m in db.scalars(select(Message).distinct(Message.conversation_id)
                            .where(Message.conversation_id.in_([c.id for c in convs]))
                            .order_by(Message.conversation_id, Message.created_at.desc())):
            lasts[m.conversation_id] = m
    late = _late_drivers(db)
    rows = [summary(db, p, c, lasts.get(c.id), unread.get(c.id, 0), late) for c in convs]
    needle = (q or "").strip().lower()
    if needle:
        hits = set()
        if len(needle) >= 2:
            hits = set(db.scalars(select(Message.conversation_id).where(
                Message.conversation_id.in_([c.id for c in convs]),
                or_(Message.body.ilike(f"%{needle}%"), Message.title.ilike(f"%{needle}%"))).distinct()))
        rows = [r for r in rows if needle in r["name"].lower() or (r["subtitle"] or "").lower().find(needle) >= 0
                or r["id"] in hits]
    counts = {"all": len(rows), "unread": sum(1 for r in rows if r["unread"]),
              "drivers": sum(1 for r in rows if r["kind"] == "driver"),
              "customers": sum(1 for r in rows if r["kind"] == "customer"),
              "team": sum(1 for r in rows if r["kind"] == "team")}
    pick = {"unread": lambda r: r["unread"] > 0, "drivers": lambda r: r["kind"] == "driver",
            "customers": lambda r: r["kind"] == "customer", "team": lambda r: r["kind"] == "team"}.get(tab)
    return {"items": [r for r in rows if pick is None or pick(r)][:limit], "counts": counts,
            "unread_total": sum(r["unread"] for r in rows)}


def present(db: Session, msgs: list[Message]) -> list[dict[str, Any]]:
    doc_ids = {uuid.UUID(d) for m in msgs for d in m.document_ids}
    docs = {d.id: d for d in db.scalars(select(Document).where(Document.id.in_(doc_ids)))} if doc_ids else {}
    loads = {x.id: x.load_number for x in db.scalars(select(Load).where(Load.id.in_({m.load_id for m in msgs if m.load_id})))}
    out = []
    for m in msgs:
        out.append({"id": m.id, "kind": m.kind, "event": m.event, "direction": m.direction, "title": m.title,
                    "body": m.body, "author_user_id": m.author_user_id, "author_driver_id": m.author_driver_id,
                    "author_name": m.author_name, "created_at": m.created_at, "deliveries": m.deliveries, "via": m.via,
                    "load": {"id": m.load_id, "load_number": loads.get(m.load_id)} if m.load_id else None,
                    "incident_id": m.incident_id,
                    "attachments": [{"id": docs[uuid.UUID(d)].id, "filename": docs[uuid.UUID(d)].filename,
                                     "type": docs[uuid.UUID(d)].type} for d in m.document_ids if uuid.UUID(d) in docs],
                    "driver_text": (m.data or {}).get("driver_text")})
    return out


def thread(db: Session, p: Principal, conv: Conversation, before: datetime | None = None, limit: int = 100) -> dict[str, Any]:
    from app.modules.messaging import assistant
    stmt = select(Message).where(Message.conversation_id == conv.id)
    if before is not None:
        stmt = stmt.where(Message.created_at < before)
    rows = list(db.scalars(stmt.order_by(Message.created_at.desc()).limit(limit + 1)))
    more = len(rows) > limit
    msgs = rows[:limit][::-1]
    late = _late_drivers(db)
    head = summary(db, p, conv, msgs[-1] if msgs else None, unread_counts(db, p, [conv.id]).get(conv.id, 0), late)
    out: dict[str, Any] = {**head, "channels": channels_of(db, conv), "messages": present(db, msgs), "has_more": more,
                           "load": None, "incident": None, "driver": None, "customer": None, "members": [],
                           "quick_replies": [], "assistant": assistant.enabled(), "draft": None}
    if conv.kind == "driver":
        d = db.get(Driver, conv.driver_id)
        load = current_load(db, d.id)
        card = load_card(db, p, load) if load else None
        out["driver"] = {"id": d.id, "name": _name(d), "phone": d.phone, "status": d.status, "hire_date": d.hire_date,
                         "truck": card["truck"] if card else None}
        out["load"] = card
        out["incident"] = incident_card(db, d.id)
        out["quick_replies"] = QUICK_REPLIES
    elif conv.kind == "customer":
        customer = db.get(Customer, conv.customer_id)
        contact = db.get(CustomerContact, conv.contact_id) if conv.contact_id else None
        out["customer"] = {"id": customer.id, "name": customer.name,
                           "contact": {"id": contact.id, "name": contact.name, "email": contact.email,
                                       "phone": contact.phone, "title": contact.title} if contact else None}
        recent = db.scalar(select(Load).where(Load.customer_id == customer.id, Load.status.in_(ON_ROAD))
                           .order_by(Load.pickup_at.desc().nulls_last()).limit(1))
        out["load"] = load_card(db, p, recent) if recent else None
    else:
        names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_([uuid.UUID(m) for m in conv.members]))).all())
        out["members"] = [{"id": uuid.UUID(m), "name": names.get(uuid.UUID(m))} for m in conv.members]
    last_in = next((m for m in reversed(msgs) if m.direction in ("in", "out", "internal")), None)
    draft = conv.draft or {}
    if last_in is not None and last_in.direction == "in" and draft.get("for_message_id") == str(last_in.id):
        out["draft"] = {"state": draft.get("state", "ready"), "text": draft.get("text"), "sources": draft.get("sources", []),
                        "for_message_id": last_in.id}
    elif last_in is not None and last_in.direction == "in":
        out["draft"] = {"state": "none", "text": None, "sources": [], "for_message_id": last_in.id}
    return out



# ---------------------------------------------------------------- suggested replies
def write_draft(db: Session, p: Principal, conv: Conversation, *, shorter: bool = False) -> dict[str, Any]:
    """Ask the assistant for a reply to the latest message from the driver or customer. Kept on the conversation
    so it is written once; a person decides whether to use it."""
    from app.modules.messaging import assistant
    if not assistant.enabled():
        raise Conflict("Suggested replies aren't turned on for this company", code="ASSISTANT_OFF")
    msgs = list(db.scalars(select(Message).where(Message.conversation_id == conv.id)
                           .order_by(Message.created_at.desc()).limit(12)))[::-1]
    last = next((m for m in reversed(msgs) if m.direction in ("in", "out", "internal")), None)
    if last is None or last.direction != "in":
        raise Conflict("There's no message from them to reply to", code="NOTHING_TO_REPLY")
    tz = p.timezone
    sources: list[assistant.Source] = []
    for i, m in enumerate(msgs):
        at = _local(tz, m.created_at)
        if m.kind == "system":
            sources.append(assistant.Source(f"m{i}", f"update at {at}", f"[{at}] FlyFleet: {m.title}. {m.body}"))
            continue
        who = "Dispatcher" if m.direction in ("out", "internal") else (m.author_name or "Them")
        sources.append(assistant.Source(f"m{i}", f"message at {at}", f"[{at}] {who}: {m.body}"))
    recipient = "a teammate"
    if conv.kind == "driver":
        d = db.get(Driver, conv.driver_id)
        recipient = f"{_name(d)}, one of the company's drivers"
        load = current_load(db, d.id)
    elif conv.kind == "customer":
        recipient = f"{db.scalar(select(Customer.name).where(Customer.id == conv.customer_id))}, a customer"
        load = db.scalar(select(Load).where(Load.customer_id == conv.customer_id, Load.status.in_(ON_ROAD))
                         .order_by(Load.pickup_at.desc().nulls_last()).limit(1))
    else:
        load = None
    if load is not None:
        card = load_card(db, p, load)
        sources.append(assistant.Source("load", card["load_number"],
                                        f"Load {card['load_number']}: {card['status'].replace('_', ' ')}, {card['lane']}, "
                                        f"customer {card['customer']}, next stop {card['next_stop'] or 'none'}"))
        if card["appointment"] or card["eta"]:
            parts = [f"appointment {_local(tz, card['appointment'])}" if card["appointment"] else None,
                     f"ETA {_local(tz, card['eta'])}" if card["eta"] else None,
                     f"{card['late_by_minutes']} min late" if card["late_by_minutes"] else None]
            sources.append(assistant.Source("eta", f"{card['load_number']} ETA",
                                            f"Next stop {card['next_stop']}: " + ", ".join(x for x in parts if x)))
    previous = (conv.draft or {}).get("text") if shorter and (conv.draft or {}).get("for_message_id") == str(last.id) else None
    try:
        text, used = assistant.draft(writer=_user_name(db, p.user_id) or "the dispatcher", recipient=recipient,
                                     sources=sources, previous=previous)
    except assistant.AssistantError as e:
        raise Conflict(str(e), code="ASSISTANT_UNAVAILABLE") from e
    conv.draft = {"for_message_id": str(last.id), "state": "ready", "text": text, "sources": [s.label for s in used]}
    return {"state": "ready", "text": text, "sources": conv.draft["sources"], "for_message_id": last.id}


def dismiss_draft(db: Session, conv: Conversation) -> None:
    last = db.scalar(select(Message).where(Message.conversation_id == conv.id, Message.direction.in_(("in", "out", "internal")))
                     .order_by(Message.created_at.desc()).limit(1))
    if last is not None:
        conv.draft = {"for_message_id": str(last.id), "state": "dismissed"}
