"""The shipment portal: what a customer's sign-in sees of the carrier, and nothing else.

A portal sign-in is tied to one customer. It sees that customer's shipments (never a draft), where the truck is
while their freight is on it, the bill of lading and the approved proof of delivery, and the customer's issued
invoices. Rates, pay, drivers and every other customer stay out: the responses are built here, field by field,
rather than borrowed from the console's. Writing to dispatch lands in the carrier's Messages inbox.

Staff with access to customers can open the same views for a customer (`customer_id`), to see what it sees.
"""
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core import places
from app.core.audit import audit
from app.core.deps import Principal, get_db, get_principal, require
from app.core.errors import Conflict, Forbidden, Invalid, NotFound
from app.core.money import ZERO, Money
from app.core.security import hash_password
from app.core.storage import get_storage
from app.modules.customers.models import Customer
from app.modules.dispatch.models import DispatchAssignment
from app.modules.documents.models import Document, DocumentLink
from app.modules.finance.models import Invoice, InvoiceLine
from app.modules.finance.service import paid_amounts
from app.modules.loads import schemas as ls
from app.modules.loads import service as loads
from app.modules.loads.models import Load, LoadStop
from app.modules.messaging import service as messaging
from app.modules.messaging.models import Conversation, Message
from app.modules.organizations.models import Membership, Organization, User
from app.modules.tracking.incidents import latest_positions

router = APIRouter(prefix="/portal/customer", tags=["customer portal"])
staff_router = APIRouter(prefix="/customers", tags=["customers"])

ACTIVE = ("planned", "assigned", "dispatched", "at_pickup", "in_transit", "at_delivery", "on_hold")
DELIVERED = ("delivered", "pod_review", "completed")
ROLLING = ("at_pickup", "in_transit", "at_delivery")
STATE = {**{s: "scheduled" for s in ("planned", "assigned", "dispatched")}, "at_pickup": "at_pickup",
         "in_transit": "in_transit", "at_delivery": "in_transit", **{s: "delivered" for s in DELIVERED},
         "on_hold": "on_hold", "cancelled": "cancelled"}
PortalState = Literal["scheduled", "at_pickup", "in_transit", "delivered", "on_hold", "cancelled"]
SHARED_TYPES = ("bol", "pod")
DOC_LABEL = {"bol": "Bill of lading", "pod": "Proof of delivery"}


@dataclass
class Scope:
    principal: Principal
    customer: Customer
    preview: bool


def scope(customer_id: uuid.UUID | None = Query(None, description="Staff only: see the portal as this customer does"),
          p: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> Scope:
    if p.role == "customer":
        mine = db.scalar(select(Membership.customer_id).where(Membership.user_id == p.user_id,
                                                              Membership.organization_id == p.org_id))
        customer = db.get(Customer, mine) if mine else None
        if customer is None:
            raise Forbidden("This sign-in isn't linked to a customer")
        return Scope(p, customer, preview=False)
    if customer_id and p.can("customers.read"):
        customer = db.get(Customer, customer_id)
        if customer is None:
            raise NotFound("Customer not found")
        return Scope(p, customer, preview=True)
    raise Forbidden("The shipment portal is for customers")


# ---------------------------------------------------------------- shapes
class CustomerPortalHome(BaseModel):
    carrier: str
    customer_id: uuid.UUID
    customer: str
    user_name: str
    preview: bool
    timezone: str
    active: int
    delivered: int


class CustomerShipment(BaseModel):
    id: uuid.UUID
    load_number: str
    reference: str | None = Field(description="The customer's own number for it: PO or order")
    state: PortalState
    origin: str
    destination: str
    pickup_at: datetime | None
    delivery_at: datetime | None
    eta: datetime | None
    late_by_minutes: int
    delivered_at: datetime | None
    pod_available: bool


class ShipmentStop(BaseModel):
    type: str
    name: str | None
    place: str
    appt_start: datetime | None
    appt_end: datetime | None
    arrived_at: datetime | None
    departed_at: datetime | None


class CustomerDocument(BaseModel):
    id: uuid.UUID | None
    type: str
    label: str
    load_number: str | None = None
    filename: str | None
    available: bool
    note: str | None = Field(description="Why it can't be had yet")
    at: datetime | None = None


class ShipmentMilestone(BaseModel):
    key: Literal["booked", "picked_up", "in_transit", "delivered"]
    label: str
    done: bool
    current: bool
    at: datetime | None = Field(description="When it happened, or when it is expected")
    expected: bool = False


class ShipmentPosition(BaseModel):
    place: str
    at: datetime
    progress: float = Field(description="How far along, 0 to 1, by straight-line distance")


class ShipmentUpdate(BaseModel):
    body: str
    at: datetime


class CustomerShipmentDetail(CustomerShipment):
    equipment_type: str
    stops: list[ShipmentStop]
    milestones: list[ShipmentMilestone]
    position: ShipmentPosition | None
    update: ShipmentUpdate | None = Field(description="The carrier's latest message about this shipment")
    documents: list[CustomerDocument]


class CustomerInvoice(BaseModel):
    id: uuid.UUID
    invoice_number: str
    issue_date: date
    due_date: date | None
    total: Money
    balance: Money
    currency: str
    status: Literal["open", "overdue", "paid"]
    loads: list[str]


class CustomerPortalMessage(BaseModel):
    id: uuid.UUID
    mine: bool = Field(description="Written from the customer's side")
    author: str
    body: str
    at: datetime
    load_number: str | None


class CustomerPortalMessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    load_id: uuid.UUID | None = None


def _place(city: str | None, state: str | None) -> str:
    return ", ".join(x for x in (city, state) if x) or "—"


def _shipment(item: ls.LoadListItem, pods: set[uuid.UUID]) -> CustomerShipment:
    return CustomerShipment(
        id=item.id, load_number=item.load_number, reference=item.reference, state=STATE[item.status],
        origin=_place(item.origin_city, item.origin_state), destination=_place(item.destination_city, item.destination_state),
        pickup_at=item.pickup_at, delivery_at=item.delivery_at, eta=item.eta if item.status in ROLLING else None,
        late_by_minutes=item.late_by_minutes if item.status in ROLLING else 0, delivered_at=item.delivered_at,
        pod_available=item.id in pods)


def _pods(db: Session, load_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    """The loads whose proof of delivery has been approved."""
    if not load_ids:
        return set()
    return set(db.scalars(select(DocumentLink.entity_id).join(Document, Document.id == DocumentLink.document_id).where(
        DocumentLink.entity_type == "load", DocumentLink.entity_id.in_(load_ids), Document.type == "pod",
        Document.review_status == "approved", Document.upload_status == "uploaded")))


def _shipments(db: Session, sc: Scope, statuses: tuple[str, ...], q: str | None = None,
               limit: int = 100) -> list[CustomerShipment]:
    items, _ = loads.list_loads(db, sc.principal, ls.LoadListParams(
        customer_id=sc.customer.id, status=list(statuses), q=q or None, limit=limit, sort="-pickup_at"))
    return [_shipment(i, _pods(db, [x.id for x in items])) for i in items]


def _load(db: Session, sc: Scope, load_id: uuid.UUID) -> Load:
    load = db.get(Load, load_id)
    if load is None or load.customer_id != sc.customer.id or load.status == "draft":
        raise NotFound("Shipment not found")
    return load


def _documents(db: Session, load_ids: list[uuid.UUID]) -> list[tuple[Document, uuid.UUID]]:
    if not load_ids:
        return []
    return list(db.execute(select(Document, DocumentLink.entity_id).join(DocumentLink, DocumentLink.document_id == Document.id)
                           .where(DocumentLink.entity_type == "load", DocumentLink.entity_id.in_(load_ids),
                                  Document.type.in_(SHARED_TYPES), Document.upload_status == "uploaded",
                                  Document.review_status != "rejected")
                           .order_by(Document.created_at.desc())).all())


def _shared(doc: Document) -> bool:
    """A bill of lading is shared once it is in; a proof of delivery once the carrier has approved it."""
    return doc.type == "bol" or doc.review_status == "approved"


# ---------------------------------------------------------------- reading
@router.get("", response_model=CustomerPortalHome)
def home(sc: Scope = Depends(scope), db: Session = Depends(get_db)):
    org = db.get(Organization, sc.principal.org_id)
    active, delivered = db.execute(select(func.count().filter(Load.status.in_(ACTIVE)),
                                          func.count().filter(Load.status.in_(DELIVERED)))
                                   .where(Load.customer_id == sc.customer.id)).one()
    return CustomerPortalHome(carrier=org.name, customer_id=sc.customer.id, customer=sc.customer.name,
                      user_name=sc.principal.full_name, preview=sc.preview, timezone=sc.principal.timezone,
                      active=active or 0, delivered=delivered or 0)


@router.get("/shipments", response_model=list[CustomerShipment])
def shipments(view: Literal["active", "delivered", "all"] = "active", q: str | None = Query(None, max_length=60),
              sc: Scope = Depends(scope), db: Session = Depends(get_db)):
    """The customer's shipments, searchable by their PO or the load number."""
    statuses = ACTIVE if view == "active" else DELIVERED if view == "delivered" else (*ACTIVE, *DELIVERED, "cancelled")
    return _shipments(db, sc, statuses, q)


@router.get("/shipments/{load_id}", response_model=CustomerShipmentDetail)
def shipment(load_id: uuid.UUID, sc: Scope = Depends(scope), db: Session = Depends(get_db)):
    load = _load(db, sc, load_id)
    items, _ = loads.list_loads(db, sc.principal, ls.LoadListParams(customer_id=sc.customer.id, q=load.load_number,
                                                                     limit=5))
    item = next((i for i in items if i.id == load.id), None)
    if item is None:
        raise NotFound("Shipment not found")
    base = _shipment(item, _pods(db, [load.id]))
    stops = list(db.scalars(select(LoadStop).where(LoadStop.load_id == load.id).order_by(LoadStop.seq)))
    pickups = [s for s in stops if s.type == "pickup"]
    picked = pickups[-1].departed_at if pickups and pickups[-1].departed_at else None
    rolling = load.status in ROLLING
    # Steps finished get a check; the one underway (at the pickup, or on the road) is marked as current.
    done = {"booked": True, "picked_up": picked is not None or load.status in (*DELIVERED, "in_transit", "at_delivery"),
            "in_transit": load.status in DELIVERED, "delivered": load.status in DELIVERED}
    current = {"at_pickup": "picked_up", "in_transit": "in_transit", "at_delivery": "in_transit"}.get(load.status)
    milestones = [
        ShipmentMilestone(key="booked", label="Booked", done=True, current=current == "booked", at=load.created_at),
        ShipmentMilestone(key="picked_up", label="Picked up", done=done["picked_up"], current=current == "picked_up",
                  at=picked or load.pickup_at, expected=picked is None),
        ShipmentMilestone(key="in_transit", label="In transit", done=done["in_transit"], current=current == "in_transit",
                  at=base.eta if rolling else None, expected=True),
        ShipmentMilestone(key="delivered", label="Delivered", done=done["delivered"], current=current == "delivered",
                  at=load.delivered_at or load.delivery_at, expected=load.delivered_at is None),
    ]

    position = None
    if rolling:
        truck = db.scalar(select(DispatchAssignment.vehicle_id).where(
            DispatchAssignment.load_id == load.id, DispatchAssignment.status == "active"))
        seen = latest_positions(db, [truck]).get(truck) if truck else None
        if seen and datetime.now(UTC) - seen.recorded_at <= timedelta(hours=2):
            lat, lon = float(seen.lat), float(seen.lon)
            start = places.locate(load.origin_city, load.origin_state)
            end = places.locate(load.destination_city, load.destination_state)
            progress = 0.5
            if start and end:
                gone, left = places.km(start[0], start[1], lat, lon), places.km(lat, lon, end[0], end[1])
                progress = max(0.0, min(1.0, gone / (gone + left))) if gone + left else 0.0
            position = ShipmentPosition(place=places.describe(lat, lon), at=seen.recorded_at, progress=round(progress, 3))

    said = db.execute(select(Message.body, Message.created_at).join(Conversation, Conversation.id == Message.conversation_id)
                      .where(Conversation.kind == "customer", Conversation.customer_id == sc.customer.id,
                             Message.load_id == load.id, Message.direction == "out")
                      .order_by(Message.created_at.desc()).limit(1)).first()
    docs = _documents(db, [load.id])
    papers = []
    for kind in SHARED_TYPES:
        mine = [d for d, _ in docs if d.type == kind]
        doc = next((d for d in mine if _shared(d)), None)
        papers.append(CustomerDocument(
            id=doc.id if doc else None, type=kind, label=DOC_LABEL[kind], filename=doc.filename if doc else None,
            available=doc is not None, at=doc.created_at if doc else None,
            note=None if doc else ("After delivery" if kind == "pod" and load.status not in DELIVERED
                                   else "Being checked" if mine else "Not in yet")))
    return CustomerShipmentDetail(
        **base.model_dump(), equipment_type=load.equipment_type,
        stops=[ShipmentStop(type=s.type, name=s.name, place=_place(s.city, s.state), appt_start=s.appt_start,
                          appt_end=s.appt_end, arrived_at=s.arrived_at, departed_at=s.departed_at) for s in stops],
        milestones=milestones, position=position,
        update=ShipmentUpdate(body=said.body, at=said.created_at) if said else None, documents=papers)


@router.get("/documents", response_model=list[CustomerDocument])
def documents(sc: Scope = Depends(scope), db: Session = Depends(get_db)):
    """Every bill of lading and approved proof of delivery on the customer's shipments, newest first."""
    numbers = dict(db.execute(select(Load.id, Load.load_number).where(Load.customer_id == sc.customer.id,
                                                                     Load.status != "draft")).all())
    return [CustomerDocument(id=d.id, type=d.type, label=DOC_LABEL[d.type], load_number=numbers.get(load_id),
                           filename=d.filename, available=True, note=None, at=d.created_at)
            for d, load_id in _documents(db, list(numbers)) if _shared(d)]


@router.get("/documents/{document_id}/download")
def download(document_id: uuid.UUID, sc: Scope = Depends(scope), db: Session = Depends(get_db)):
    numbers = list(db.scalars(select(Load.id).where(Load.customer_id == sc.customer.id, Load.status != "draft")))
    doc = next((d for d, _ in _documents(db, numbers) if d.id == document_id and _shared(d)), None)
    if doc is None:
        raise NotFound("Document not found")
    try:
        data = get_storage().get(doc.storage_key)
    except FileNotFoundError as e:
        raise NotFound("The file is missing from storage") from e
    audit(db, sc.principal, "document.downloaded", "document", doc.id, {"portal": "customer"})
    db.commit()
    return Response(content=data, media_type=doc.content_type, headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(doc.filename)}",
        "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox"})


@router.get("/invoices", response_model=list[CustomerInvoice])
def invoices(sc: Scope = Depends(scope), db: Session = Depends(get_db)):
    """The customer's issued invoices: what is owed, what is late, what is paid."""
    rows = list(db.scalars(select(Invoice).where(Invoice.customer_id == sc.customer.id,
                                                 Invoice.status.in_(("issued", "paid")))
                           .order_by(Invoice.issue_date.desc(), Invoice.invoice_number.desc())))
    paid = paid_amounts(db, [i.id for i in rows])
    lines = {}
    if rows:
        for invoice_id, number in db.execute(
                select(InvoiceLine.invoice_id, Load.load_number).join(Load, Load.id == InvoiceLine.load_id)
                .where(InvoiceLine.invoice_id.in_([i.id for i in rows])).distinct()):
            lines.setdefault(invoice_id, []).append(number)
    today = sc.principal.today()
    out = []
    for i in rows:
        balance = i.total - paid.get(i.id, ZERO) if i.status == "issued" else ZERO
        status = "paid" if i.status == "paid" else "overdue" if i.due_date and i.due_date < today else "open"
        out.append(CustomerInvoice(id=i.id, invoice_number=i.invoice_number, issue_date=i.issue_date, due_date=i.due_date,
                                 total=i.total, balance=balance, currency=i.currency, status=status,
                                 loads=sorted(lines.get(i.id, []))))
    return out


# ---------------------------------------------------------------- writing to dispatch
def _conversation(db: Session, sc: Scope) -> Conversation | None:
    return db.scalar(select(Conversation).where(Conversation.kind == "customer", Conversation.customer_id == sc.customer.id,
                                                Conversation.contact_id.is_(None)))


@router.get("/messages", response_model=list[CustomerPortalMessage])
def messages(sc: Scope = Depends(scope), db: Session = Depends(get_db)):
    """What the customer and the carrier's dispatch have written each other, oldest first."""
    conv = _conversation(db, sc)
    if conv is None:
        return []
    rows = db.execute(select(Message, Load.load_number).outerjoin(Load, Load.id == Message.load_id)
                      .where(Message.conversation_id == conv.id, Message.direction.in_(("in", "out")))
                      .order_by(Message.created_at.desc()).limit(50)).all()
    org = db.get(Organization, sc.principal.org_id)
    return [CustomerPortalMessage(id=m.id, mine=m.direction == "in", author=(m.author_name or sc.customer.name)
                          if m.direction == "in" else org.name, body=m.body, at=m.created_at, load_number=number)
            for m, number in reversed(rows)]


@router.post("/messages", response_model=CustomerPortalMessage, status_code=201)
def write(body: CustomerPortalMessageIn, sc: Scope = Depends(scope), db: Session = Depends(get_db)):
    """Write to the carrier's dispatch. It arrives in their Messages, from the customer."""
    if sc.preview:
        raise Forbidden("A preview can't write as the customer")
    load_number = None
    if body.load_id:
        load_number = _load(db, sc, body.load_id).load_number
    conv = _conversation(db, sc)
    if conv is None:
        conv = Conversation(organization_id=sc.principal.org_id, kind="customer", customer_id=sc.customer.id,
                            created_by=sc.principal.user_id)
        db.add(conv)
        db.flush()
    msg = messaging._post(db, conv, direction="in", body=body.body.strip(), author_user_id=sc.principal.user_id,
                          author_name=sc.principal.full_name, via="portal", load_id=body.load_id)
    audit(db, sc.principal, "message.received", "conversation", conv.id, {"via": "portal", "message_id": str(msg.id)})
    db.commit()
    return CustomerPortalMessage(id=msg.id, mine=True, author=msg.author_name or sc.customer.name, body=msg.body,
                         at=msg.created_at, load_number=load_number)


# ---------------------------------------------------------------- who at the customer signs in
class CustomerPortalUserIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=120)
    password: str | None = Field(None, min_length=10, max_length=200,
                                 description="Temporary password, needed only for a new sign-in")


class CustomerPortalUserOut(BaseModel):
    user_id: uuid.UUID
    full_name: str
    email: str
    active: bool
    signed_in: bool
    invited_at: datetime
    existing_account: bool = Field(False, description="They already had a FlyFleet sign-in and keep their password")


def portal_users(db: Session, customer_id: uuid.UUID) -> list[CustomerPortalUserOut]:
    rows = db.execute(select(Membership, User).join(User, User.id == Membership.user_id)
                      .where(Membership.customer_id == customer_id, Membership.role == "customer")
                      .order_by(User.full_name)).all()
    return [CustomerPortalUserOut(user_id=u.id, full_name=u.full_name, email=u.email, active=m.active,
                          signed_in=u.last_organization_id is not None, invited_at=m.created_at) for m, u in rows]


def _customer(db: Session, customer_id: uuid.UUID) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise NotFound("Customer not found")
    return customer


@staff_router.get("/{customer_id}/portal-users", response_model=list[CustomerPortalUserOut])
def list_portal_users(customer_id: uuid.UUID, p: Principal = Depends(require("customers.read")),
                      db: Session = Depends(get_db)):
    return portal_users(db, _customer(db, customer_id).id)


@staff_router.post("/{customer_id}/portal-users", response_model=CustomerPortalUserOut, status_code=201)
def add_portal_user(customer_id: uuid.UUID, body: CustomerPortalUserIn, p: Principal = Depends(require("customers.manage")),
                    db: Session = Depends(get_db)):
    """Give someone at the customer a sign-in to the shipment portal. An existing FlyFleet sign-in keeps its
    password; a new one gets the temporary password given here."""
    customer = _customer(db, customer_id)
    existing = db.execute(text("SELECT id, full_name FROM auth_lookup_user(:e)"), {"e": body.email}).first()
    if existing:
        if db.scalar(select(Membership).where(Membership.user_id == existing.id, Membership.organization_id == p.org_id)):
            raise Conflict("This person already signs in to the company. Portal access needs a separate sign-in.",
                           code="DUPLICATE_REFERENCE", field_errors={"email": "Already a member"})
        uid = existing.id
    else:
        if not body.password:
            raise Invalid("Set a temporary password for a new sign-in", field="password")
        uid = db.execute(text("SELECT auth_create_user(:e, :n, :h)"),
                         {"e": body.email, "n": body.full_name.strip(), "h": hash_password(body.password)}).scalar_one()
    db.add(Membership(organization_id=p.org_id, user_id=uid, role="customer", customer_id=customer.id))
    db.flush()
    audit(db, p, "customer.portal_user_added", "customer", customer.id,
          {"email": body.email.lower(), "existing_account": existing is not None})
    out = next(u for u in portal_users(db, customer.id) if u.user_id == uid)
    db.commit()
    return out.model_copy(update={"existing_account": existing is not None})


@staff_router.delete("/{customer_id}/portal-users/{user_id}", status_code=204)
def remove_portal_user(customer_id: uuid.UUID, user_id: uuid.UUID, p: Principal = Depends(require("customers.manage")),
                       db: Session = Depends(get_db)):
    membership = db.scalar(select(Membership).where(Membership.user_id == user_id, Membership.customer_id == customer_id,
                                                    Membership.role == "customer"))
    if membership is None:
        raise NotFound("Portal user not found")
    db.delete(membership)
    audit(db, p, "customer.portal_user_removed", "customer", customer_id, {"user_id": str(user_id)})
    db.commit()


def has_portal(db: Session, customer_id: uuid.UUID | None) -> bool:
    """Whether anyone at the customer signs in to the shipment portal, so messages to them are seen there."""
    if customer_id is None:
        return False
    return db.scalar(select(Membership.id).where(Membership.customer_id == customer_id, Membership.role == "customer",
                                                 Membership.active.is_(True)).limit(1)) is not None

