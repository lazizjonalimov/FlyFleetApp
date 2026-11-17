"""Messages with drivers, customers and teammates, and the driver app's side of the same conversation."""
import uuid
from datetime import date, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, Response
from pydantic import AwareDatetime, BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import Principal, get_db, get_or_404, require
from app.core.errors import NotFound
from app.modules.drivers.models import Driver
from app.modules.messaging import service
from app.modules.messaging.models import Conversation, ConversationRead

router = APIRouter(tags=["messages"])
READ = require("messages.read")
SEND = require("messages.send")

Kind = Literal["driver", "customer", "team"]
ChannelKey = Literal["app", "telegram", "sms", "email", "in_app"]


class ChannelState(BaseModel):
    key: str
    label: str
    connected: bool
    state: Literal["connected", "not_connected", "not_invited", "off"]
    detail: str


class ConversationItem(BaseModel):
    id: uuid.UUID
    kind: Kind
    name: str
    initials: str
    tone: Literal["late", "brand", "mu"]
    channel: Literal["app", "email", "team", "none"]
    subtitle: str | None
    driver_id: uuid.UUID | None
    customer_id: uuid.UUID | None
    last: str | None
    last_at: datetime | None
    unread: int


class ConversationCounts(BaseModel):
    all: int
    unread: int
    drivers: int
    customers: int
    team: int


class ConversationList(BaseModel):
    items: list[ConversationItem]
    counts: ConversationCounts
    unread_total: int


class Delivery(BaseModel):
    channel: str
    status: Literal["sent", "delivered", "read", "not_sent"]
    reason: str | None = None
    at: datetime | None = None
    delivered_at: datetime | None = None
    read_at: datetime | None = None


class MessageLoad(BaseModel):
    id: uuid.UUID
    load_number: str | None


class MessageAttachment(BaseModel):
    id: uuid.UUID
    filename: str
    type: str


class MessageOut(BaseModel):
    id: uuid.UUID
    kind: Literal["text", "system"]
    event: str | None
    direction: Literal["out", "in", "internal", "system"]
    title: str | None
    body: str
    author_user_id: uuid.UUID | None
    author_driver_id: uuid.UUID | None
    author_name: str | None
    created_at: datetime
    deliveries: list[Delivery]
    via: str | None
    load: MessageLoad | None
    incident_id: uuid.UUID | None
    attachments: list[MessageAttachment]
    driver_text: str | None = Field(description="What the driver was shown, when it differs from the card")


class ThreadLoad(BaseModel):
    id: uuid.UUID
    load_number: str
    status: str
    lane: str
    short_lane: str
    customer: str | None
    next_stop: str | None
    appointment: datetime | None
    eta: datetime | None
    late_by_minutes: int
    equipment: str
    truck: str | None


class ThreadIncident(BaseModel):
    id: uuid.UUID
    number: str
    kind: str
    label: str
    state: str
    title: str
    peak: float | None
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    driver_replied_at: datetime | None
    vehicle_id: uuid.UUID | None


class ThreadDriver(BaseModel):
    id: uuid.UUID
    name: str
    phone: str | None
    status: str
    hire_date: date | None
    truck: str | None


class ThreadContact(BaseModel):
    id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    title: str | None


class ThreadCustomer(BaseModel):
    id: uuid.UUID
    name: str
    contact: ThreadContact | None


class ThreadMember(BaseModel):
    id: uuid.UUID
    name: str | None


class Draft(BaseModel):
    state: Literal["none", "ready", "dismissed"]
    text: str | None
    sources: list[str]
    for_message_id: uuid.UUID


class Thread(ConversationItem):
    channels: list[ChannelState]
    messages: list[MessageOut]
    has_more: bool
    load: ThreadLoad | None
    incident: ThreadIncident | None
    driver: ThreadDriver | None
    customer: ThreadCustomer | None
    members: list[ThreadMember]
    quick_replies: list[str]
    assistant: bool = Field(description="Whether suggested replies are turned on")
    draft: Draft | None


class ConversationIn(BaseModel):
    kind: Kind
    driver_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=120)
    members: list[uuid.UUID] = Field(default_factory=list, max_length=50)


class MessageIn(BaseModel):
    body: str = Field(default="", max_length=4000)
    channels: list[ChannelKey] | None = Field(default=None, description="Left out: every channel that can carry it")
    load_id: uuid.UUID | None = None
    document_ids: list[uuid.UUID] = Field(default_factory=list, max_length=5)


class DraftIn(BaseModel):
    shorter: bool = False


class UnreadOut(BaseModel):
    unread: int


class DriverChannels(BaseModel):
    driver_id: uuid.UUID
    conversation_id: uuid.UUID | None
    channels: list[ChannelState]


def _thread(db: Session, p: Principal, conv: Conversation, before: datetime | None = None) -> dict[str, Any]:
    return service.thread(db, p, conv, before)


# ---------------------------------------------------------------- the console
@router.get("/conversations", response_model=ConversationList)
def list_conversations(tab: Literal["all", "unread", "drivers", "customers", "team"] = "all", q: str | None = None,
                       p: Principal = Depends(READ), db: Session = Depends(get_db)):
    """Conversations with something in them, the latest first, with how many messages are unread."""
    return service.listing(db, p, tab, q)


@router.get("/conversations/unread", response_model=UnreadOut)
def unread(p: Principal = Depends(READ), db: Session = Depends(get_db)):
    return {"unread": service.total_unread(db, p)}


@router.post("/conversations", response_model=Thread, status_code=201)
def start_conversation(body: ConversationIn, response: Response, p: Principal = Depends(SEND),
                       db: Session = Depends(get_db)):
    """The conversation to write in. A driver has one conversation, so asking again returns it (200)."""
    conv, created = service.start(db, p, kind=body.kind, driver_id=body.driver_id, customer_id=body.customer_id,
                                  contact_id=body.contact_id, title=body.title, members=body.members)
    db.commit()
    if not created:
        response.status_code = 200
    return _thread(db, p, conv)


@router.get("/conversations/{conversation_id}", response_model=Thread)
def get_conversation(conversation_id: uuid.UUID, before: AwareDatetime | None = None, p: Principal = Depends(READ),
                     db: Session = Depends(get_db)):
    return _thread(db, p, service.get(db, p, conversation_id), before)


@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut, status_code=201)
def send_message(conversation_id: uuid.UUID, body: MessageIn, p: Principal = Depends(SEND),
                 db: Session = Depends(get_db)):
    conv = service.get(db, p, conversation_id)
    msg = service.send(db, p, conv, body=body.body, channels=body.channels, load_id=body.load_id,
                       document_ids=body.document_ids)
    db.commit()
    return service.present(db, [msg])[0]


@router.post("/conversations/{conversation_id}/read", status_code=204)
def read_conversation(conversation_id: uuid.UUID, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    service.mark_read(db, p, service.get(db, p, conversation_id))
    db.commit()


@router.post("/conversations/{conversation_id}/draft", response_model=Draft)
def draft_reply(conversation_id: uuid.UUID, body: DraftIn, p: Principal = Depends(SEND), db: Session = Depends(get_db)):
    """A suggested reply to their latest message. Only ever a suggestion: nothing is sent."""
    conv = service.get(db, p, conversation_id)
    out = service.write_draft(db, p, conv, shorter=body.shorter)
    db.commit()
    return out


@router.delete("/conversations/{conversation_id}/draft", status_code=204)
def dismiss_draft(conversation_id: uuid.UUID, p: Principal = Depends(SEND), db: Session = Depends(get_db)):
    service.dismiss_draft(db, service.get(db, p, conversation_id))
    db.commit()


@router.get("/drivers/{driver_id}/channels", response_model=DriverChannels)
def driver_channels(driver_id: uuid.UUID, p: Principal = Depends(require("drivers.read")),
                    db: Session = Depends(get_db)):
    """How messages and alerts reach a driver."""
    driver = get_or_404(db, Driver, driver_id, "Driver")
    conv = db.scalar(select(Conversation.id).where(Conversation.kind == "driver", Conversation.driver_id == driver.id))
    return {"driver_id": driver.id, "conversation_id": conv if p.can("messages.read") else None,
            "channels": service.driver_channels(db, driver)}


# ---------------------------------------------------------------- the driver app
DRIVER = require("driver.self")


class DriverMessage(BaseModel):
    id: uuid.UUID
    kind: Literal["text", "system"]
    event: str | None
    mine: bool
    title: str | None
    body: str
    author_name: str | None
    created_at: datetime
    load: MessageLoad | None
    attachments: list[MessageAttachment]
    status: Literal["sent", "delivered", "read"] | None = Field(description="For the driver's own messages: whether "
                                                                             "the office has seen it")


class DriverInbox(BaseModel):
    messages: list[DriverMessage]


class DriverMessageIn(BaseModel):
    body: str = Field(default="", max_length=4000)
    load_id: uuid.UUID | None = None
    document_ids: list[uuid.UUID] = Field(default_factory=list, max_length=5)


class InboxReadOut(BaseModel):
    read: int


def _me(db: Session, p: Principal) -> Driver:
    driver = db.scalar(select(Driver).where(Driver.user_id == p.user_id))
    if driver is None:
        raise NotFound("No driver profile is linked to this sign-in")
    return driver


def _for_driver(db: Session, msgs: list) -> list[dict[str, Any]]:
    seen = db.scalar(select(func.max(ConversationRead.last_read_at)).where(
        ConversationRead.conversation_id.in_({m.conversation_id for m in msgs}))) if msgs else None
    out = []
    for m in service.present(db, msgs):
        mine = m["direction"] == "in"
        out.append({"id": m["id"], "kind": m["kind"], "event": m["event"], "mine": mine,
                    "title": m["title"], "body": m["driver_text"] or m["body"],
                    "author_name": "Dispatch" if m["direction"] in ("out", "system") else m["author_name"],
                    "created_at": m["created_at"], "load": m["load"], "attachments": m["attachments"],
                    "status": ("read" if seen and seen >= m["created_at"] else "delivered") if mine else None})
    return out


@router.get("/driver/messages", response_model=DriverInbox)
def driver_messages(after: AwareDatetime | None = None, p: Principal = Depends(DRIVER), db: Session = Depends(get_db)):
    """The driver's conversation with the office. Fetching it marks what was waiting as delivered."""
    msgs = service.driver_inbox(db, p, _me(db, p), after)
    db.commit()
    return {"messages": _for_driver(db, msgs)}


@router.post("/driver/messages", response_model=DriverMessage, status_code=201)
def driver_message(body: DriverMessageIn, p: Principal = Depends(DRIVER), db: Session = Depends(get_db)):
    msg = service.driver_send(db, p, _me(db, p), body=body.body, load_id=body.load_id, document_ids=body.document_ids)
    db.commit()
    return _for_driver(db, [msg])[0]


@router.post("/driver/messages/read", response_model=InboxReadOut)
def driver_messages_read(p: Principal = Depends(DRIVER), db: Session = Depends(get_db)):
    """The driver opened the conversation: what the office sent is read."""
    n = service.driver_read(db, p, _me(db, p))
    db.commit()
    return {"read": n}
