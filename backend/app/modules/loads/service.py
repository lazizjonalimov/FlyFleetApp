"""The load lifecycle (decision 0002).

A load's status is written in exactly one place, `move`, which also appends the immutable status event and
bumps the version. Routers never set a status themselves.
"""
import uuid
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import and_, delete, func, literal, or_, select, update
from sqlalchemy.orm import Session

from app.core import scope as team_scope
from app.core.audit import audit
from app.core.crud import like
from app.core.deps import Principal
from app.core.errors import Conflict, Forbidden, Invalid, NotFound
from app.core.money import money
from app.core.pagination import PageInfo, paginate, parse_sort
from app.modules.customers.models import Customer
from app.modules.dispatch import eligibility
from app.modules.dispatch.models import DispatchAssignment
from app.modules.documents.models import Document, DocumentLink
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.finance.models import Invoice
from app.modules.loads import rules
from app.modules.loads import schemas as s
from app.modules.loads.models import (
    Load,
    LoadCharge,
    LoadItem,
    LoadNote,
    LoadStatusEvent,
    LoadStop,
    LoadTrackingLink,
    TrackingEvent,
)
from app.modules.organizations.models import Membership, Organization, Terminal, User

# Until a truck is sent, the route itself can still be rebuilt.
ROUTE_EDITABLE = ("draft", "planned", "assigned")
ROLLING = ("dispatched", "at_pickup", "in_transit", "at_delivery")
REASSIGNABLE = ("assigned", *ROLLING)
CLOSED = ("completed", "cancelled")
# What a dispatcher is still working: everything except drafts and finished or cancelled loads.
ACTIVE = ("planned", "assigned", *ROLLING, "delivered", "pod_review", "on_hold")

# action -> statuses it may start from
TRANSITIONS: dict[str, tuple[str, ...]] = {
    "mark_ready": ("draft",),
    "assign": ("planned",),
    "unassign": ("assigned",),
    "dispatch": ("assigned",),
    "arrive": ("dispatched", "in_transit"),
    "depart": ("at_pickup", "at_delivery"),
    "pod_uploaded": ("delivered",),
    "approve_pod": ("pod_review",),
    "reject_pod": ("pod_review",),
    "hold": ("planned", "assigned", "dispatched"),
    "release": ("on_hold",),
    "cancel": ("draft", "planned", "assigned", "dispatched", "on_hold"),
}
PERMISSION = {
    "mark_ready": "loads.update", "dispatch": "dispatch.assign", "arrive": "loads.update",
    "depart": "loads.update", "approve_pod": "loads.close", "reject_pod": "loads.close",
    "hold": "loads.cancel", "release": "loads.cancel", "cancel": "loads.cancel",
}
NEEDS_REASON = ("hold", "cancel", "reject_pod")
STATUS_WORDS = {
    "draft": "a draft", "planned": "planned", "assigned": "assigned", "dispatched": "dispatched",
    "at_pickup": "at a pickup", "in_transit": "in transit", "at_delivery": "at a delivery",
    "delivered": "delivered", "pod_review": "waiting for proof-of-delivery review", "completed": "completed",
    "on_hold": "on hold", "cancelled": "cancelled",
}
ACTION_WORDS = {
    "mark_ready": "marked ready", "assign": "assigned", "unassign": "unassigned", "dispatch": "dispatched",
    "arrive": "marked as arrived", "depart": "marked as departed", "approve_pod": "completed",
    "reject_pod": "sent back for a new proof of delivery", "hold": "put on hold", "release": "released",
    "cancel": "cancelled", "reassign": "reassigned", "pod_uploaded": "sent for review",
}
FAR_FUTURE = datetime(9999, 1, 1, tzinfo=UTC)
TRACKING_LINK_LIFE = timedelta(days=7)


# ---------------------------------------------------------------- small helpers
def day_bounds(timezone: str, first: date, last: date | None = None) -> tuple[datetime, datetime]:
    """The instants that bound whole calendar days where the company operates."""
    zone = ZoneInfo(timezone)
    return (datetime.combine(first, time.min, zone),
            datetime.combine((last or first) + timedelta(days=1), time.min, zone))


def lock_load(db: Session, load_id: uuid.UUID, p: Principal | None = None) -> Load:
    """Fetch a load for a change. Concurrent writers queue here, so each one sees the other's result. With the
    caller, a load outside their dispatch team is not found, as if it didn't exist."""
    if p is not None and p.scope is not None and not db.scalar(
            select(Load.id).where(Load.id == load_id, team_scope.loads(p.scope))):
        raise NotFound("Load not found")
    load = db.scalar(select(Load).where(Load.id == load_id).with_for_update())
    if load is None:
        raise NotFound("Load not found")
    return load


def check_version(load: Load, version: int) -> None:
    if load.version != version:
        raise Conflict("Someone else changed this load while you were working. Review the latest details and "
                       "try again.", code="VERSION_CONFLICT",
                       details={"current_version": load.version, "your_version": version})


def illegal(load: Load, action: str) -> Conflict:
    return Conflict(f"A load that is {STATUS_WORDS[load.status]} can't be {ACTION_WORDS[action]}",
                    code="INVALID_TRANSITION",
                    details={"status": load.status, "action": action, "allowed_from": list(TRANSITIONS[action])})


def move(db: Session, p: Principal, load: Load, action: str, to: str, note: str | None = None) -> None:
    """Change a load's status. The single writer of `status`: appends the event and bumps the version."""
    start = load.status
    load.status = to
    load.version += 1
    db.add(LoadStatusEvent(organization_id=load.organization_id, load_id=load.id, load_version=load.version,
                           action=action, from_status=start, to_status=to, actor_user_id=p.user_id, note=note))
    audit(db, p, f"load.{action}", "load", load.id, {"from": start, "to": to, **({"note": note} if note else {})})


def next_load_number(db: Session, org_id: uuid.UUID) -> str:
    # The UPDATE takes the company's row lock, so two loads created together still get different numbers.
    seq, prefix = db.execute(
        update(Organization).where(Organization.id == org_id).values(load_seq=Organization.load_seq + 1)
        .returning(Organization.load_seq, Organization.load_number_prefix)).one()
    return f"{prefix}-{1000 + seq}"


def stops_of(db: Session, load_id: uuid.UUID) -> list[LoadStop]:
    return list(db.scalars(select(LoadStop).where(LoadStop.load_id == load_id).order_by(LoadStop.seq)))


def active_assignment(db: Session, load_id: uuid.UUID) -> DispatchAssignment | None:
    return db.scalar(select(DispatchAssignment).where(DispatchAssignment.load_id == load_id,
                                                      DispatchAssignment.status == "active"))


def pod_documents(db: Session, load_id: uuid.UUID) -> list[Document]:
    return list(db.scalars(
        select(Document).join(DocumentLink, DocumentLink.document_id == Document.id)
        .where(DocumentLink.entity_type == "load", DocumentLink.entity_id == load_id, Document.type == "pod",
               Document.upload_status == "uploaded")))


# ---------------------------------------------------------------- route and money
def check_stop_order(stops: list[s.StopIn]) -> None:
    previous = None
    for i, stop in enumerate(stops):
        at = stop.appt_start or stop.appt_end
        if at and previous and at < previous:
            raise Invalid("This stop is scheduled before the one above it", field=f"stops.{i}.appt_start")
        previous = at or previous


def check_route(stops) -> None:
    """A load that is ready to haul picks up first and delivers last."""
    if len(stops) < 2 or stops[0].type != "pickup" or stops[-1].type != "delivery":
        raise Invalid("A load needs at least one pickup followed by one delivery", field="stops")


def sync_route(load: Load, stops: list[LoadStop]) -> None:
    """Copy the ends of the route onto the load, where the board filters and sorts on them."""
    first, last = (stops[0], stops[-1]) if stops else (None, None)
    load.origin_city, load.origin_state = (first.city, first.state) if first else (None, None)
    load.destination_city, load.destination_state = (last.city, last.state) if last else (None, None)
    load.pickup_at = (first.appt_start or first.appt_end) if first else None
    load.delivery_at = (last.appt_end or last.appt_start) if last else None


def replace_stops(db: Session, load: Load, stops: list[s.StopIn]) -> list[LoadStop]:
    db.execute(delete(LoadStop).where(LoadStop.load_id == load.id))
    rows = [LoadStop(organization_id=load.organization_id, load_id=load.id, seq=i, **stop.model_dump())
            for i, stop in enumerate(stops, 1)]
    db.add_all(rows)
    db.flush()
    sync_route(load, rows)
    return rows


def charge_amount(quantity: Decimal, rate: Decimal) -> Decimal:
    return money(quantity * rate)


def sync_fuel_line(db: Session, load: Load) -> None:
    """The fuel surcharge is a charge line FlyFleet keeps equal to the rate × the load's fuel percent, so every
    report, invoice and total that adds up charges counts it the same way."""
    target = rules.fuel_surcharge(load.customer_rate or 0, load.fuel_surcharge_pct or 0)
    row = db.scalar(select(LoadCharge).where(LoadCharge.load_id == load.id, LoadCharge.managed.is_(True)))
    label = f"Fuel surcharge {rules._num(load.fuel_surcharge_pct or 0)}%"
    if target > 0 and row is None:
        db.add(LoadCharge(organization_id=load.organization_id, load_id=load.id, type="fuel_surcharge",
                          description=label, quantity=Decimal("1"), rate=target, amount=target, billable=True,
                          status="approved", managed=True))
    elif target > 0:
        row.rate = row.amount = target
        row.description, row.quantity, row.status, row.billable = label, Decimal("1"), "approved", True
    elif row is not None:
        db.delete(row)
    db.flush()


def recalc_charges(db: Session, load: Load) -> None:
    db.flush()
    sync_fuel_line(db, load)
    total = db.scalar(select(func.coalesce(func.sum(LoadCharge.amount), 0))
                      .where(LoadCharge.load_id == load.id, LoadCharge.billable.is_(True),
                             LoadCharge.status != "rejected"))
    load.charges_total = Decimal(total)
    if load.customer_rate + load.charges_total < 0:
        raise Invalid("Deductions can't be larger than the load's rate and charges")


def sync_draft_invoice(db: Session, load: Load) -> None:
    """A load sitting on a draft invoice keeps that draft in step with its rate and charges."""
    if load.invoice_id and load.billing_status == "unbilled":
        from app.modules.finance.service import sync_draft  # finance depends on loads, not the other way round
        db.flush()
        sync_draft(db, db.get(Invoice, load.invoice_id))


def editable(load: Load, p: Principal) -> s.Editable:
    can = p.can("loads.update")
    unbilled = load.status != "cancelled" and load.billing_status == "unbilled"
    return s.Editable(
        details=can and unbilled,
        customer=can and unbilled and load.status in ROUTE_EDITABLE and load.invoice_id is None,
        stops=can and load.status in ROUTE_EDITABLE,
        schedule=can and load.status in (*ROUTE_EDITABLE, *ROLLING, "on_hold"),
        rates=can and unbilled and p.can("loads.rates.read"),
    )


def guard_rates(db: Session, p: Principal, load: Load) -> None:
    """Charges follow the same rule as the rate: open until the load is invoiced."""
    if not p.can("loads.rates.read"):
        raise Forbidden("Your role does not allow changing rates")
    if load.status == "cancelled":
        raise Conflict("A cancelled load can't be changed")
    if load.billing_status != "unbilled":
        raise Conflict("This load has been invoiced. Void the invoice to change its charges.")


def guard_open(db: Session, p: Principal, load: Load) -> None:
    if load.status == "cancelled":
        raise Conflict("A cancelled load can't be changed")
    if load.billing_status != "unbilled":
        raise Conflict("This load has been invoiced and can no longer be changed")


def after_charge_change(db: Session, p: Principal, load: Load) -> None:
    recalc_charges(db, load)
    load.version += 1
    sync_draft_invoice(db, load)


def after_item_change(db: Session, p: Principal, load: Load) -> None:
    load.version += 1


# ---------------------------------------------------------------- create and edit
def _customer_for_booking(db: Session, customer_id: uuid.UUID) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise Invalid("Customer not found", field="customer_id")
    if customer.status != "active":
        raise Invalid("This customer is archived. Restore it to book loads.", field="customer_id")
    return customer


def _check_terminal(db: Session, terminal_id: uuid.UUID | None) -> None:
    if terminal_id is not None and db.get(Terminal, terminal_id) is None:
        raise Invalid("Terminal not found", field="terminal_id")


def create_load(db: Session, p: Principal, body: s.LoadCreate) -> Load:
    _customer_for_booking(db, body.customer_id)
    _check_terminal(db, body.terminal_id)
    check_stop_order(body.stops)
    if body.status == "planned":
        check_route(body.stops)
    open_money = (MONEY_FIELDS - {"customer_rate"}) & body.model_fields_set
    if not p.can("loads.rates.read") and (body.charges or open_money):
        raise Forbidden("Your role does not allow setting rates or charges")
    recurrence = _recurrence(body.recurrence)

    load = Load(organization_id=p.org_id, load_number=next_load_number(db, p.org_id), status=body.status,
                currency=p.currency, created_by=p.user_id,
                # Booked by a dispatch team's dispatcher: the load is the team's until it is on a truck.
                dispatch_team_id=p.scope.team_id if p.scope else None,
                recurrence_days=recurrence[0], recurrence_until=recurrence[1],
                **body.model_dump(exclude={"status", "stops", "items", "charges", "recurrence"}))
    db.add(load)
    db.flush()
    replace_stops(db, load, body.stops)
    for item in body.items:
        db.add(LoadItem(organization_id=p.org_id, load_id=load.id, **item.model_dump()))
    for charge in body.charges:
        db.add(LoadCharge(organization_id=p.org_id, load_id=load.id, **charge.model_dump(),
                          amount=charge_amount(charge.quantity, charge.rate)))
    recalc_charges(db, load)
    db.add(LoadStatusEvent(organization_id=p.org_id, load_id=load.id, load_version=load.version, action="created",
                           from_status=None, to_status=load.status, actor_user_id=p.user_id))
    audit(db, p, "load.created", "load", load.id,
          {"load_number": load.load_number, "customer_id": str(load.customer_id), "status": load.status})
    return load


def update_load(db: Session, p: Principal, load_id: uuid.UUID, body: s.LoadUpdate) -> Load:
    load = lock_load(db, load_id, p)
    check_version(load, body.version)
    changes = body.model_dump(exclude_unset=True, exclude={"version"})
    for required in ("customer_id", "equipment_type", "customer_rate", *MONEY_FIELDS - {"customer_rate"}):
        if required in changes and changes[required] is None:
            raise Invalid("This field can't be empty", field=required)
    if "recurrence" in changes:
        days, until = _recurrence(body.recurrence)
        changes.pop("recurrence")
        if (days, until) != (load.recurrence_days, load.recurrence_until):
            changes["recurrence_days"], changes["recurrence_until"] = days, until
    changes = {k: v for k, v in changes.items() if getattr(load, k) != v}
    if not changes:
        return load

    guard_open(db, p, load)
    may = editable(load, p)
    if MONEY_FIELDS & set(changes) and not may.rates:
        raise Forbidden("Your role does not allow changing rates")
    if "customer_id" in changes:
        if not may.customer:
            raise Conflict("The customer can't be changed once the load has been dispatched or added to an "
                           "invoice")
        _customer_for_booking(db, changes["customer_id"])
    if "equipment_type" in changes and load.status not in ROUTE_EDITABLE:
        raise Conflict("The equipment type can't be changed once the load has been dispatched")
    if "terminal_id" in changes:
        _check_terminal(db, changes["terminal_id"])

    for k, v in changes.items():
        setattr(load, k, v)
    load.version += 1
    if {"customer_rate", "fuel_surcharge_pct"} & set(changes):
        recalc_charges(db, load)
        sync_draft_invoice(db, load)
    said = {"recurrence" if k.startswith("recurrence_") else k for k in changes}
    audit(db, p, "load.updated", "load", load.id, body.model_dump(mode="json", include=said))
    return load


MONEY_FIELDS = {"customer_rate", "fuel_surcharge_pct", "detention_free_hours", "detention_rate"}


def _recurrence(r: s.Recurrence | None) -> tuple[list[int] | None, date | None]:
    """Repeat days, Monday first, and the last day to repeat on."""
    if r is None:
        return None, None
    if r.until is not None and r.until < date.today() - timedelta(days=1):
        raise Invalid("The repeat can't end in the past", field="recurrence.until")
    return sorted(set(r.days)), r.until


def set_stops(db: Session, p: Principal, load_id: uuid.UUID, body: s.StopsReplace) -> Load:
    load = lock_load(db, load_id, p)
    check_version(load, body.version)
    if load.status not in ROUTE_EDITABLE:
        raise Conflict("Stops can't be added, removed or reordered once the load has been dispatched. You can "
                       "still change a stop's appointment.", code="INVALID_TRANSITION")
    check_stop_order(body.stops)
    if load.status != "draft":
        check_route(body.stops)
    before = len(stops_of(db, load.id))
    replace_stops(db, load, body.stops)
    if load.miles is not None and before >= 2 and len(body.stops) != before:
        # Each stop added or taken out of a built route is about 35 miles of detour.
        load.miles = max(0, load.miles + rules.EXTRA_STOP_MILES * (len(body.stops) - before))
    load.version += 1
    audit(db, p, "load.stops_changed", "load", load.id, {"stops": len(body.stops)})
    return load


def patch_stop(db: Session, p: Principal, load_id: uuid.UUID, stop_id: uuid.UUID, body: s.StopPatch) -> Load:
    load = lock_load(db, load_id, p)
    check_version(load, body.version)
    if not editable(load, p).schedule:
        raise Conflict("This load's schedule can no longer be changed")
    stops = stops_of(db, load_id)
    stop = next((x for x in stops if x.id == stop_id), None)
    if stop is None:
        raise NotFound("Stop not found")
    if stop.departed_at:
        raise Conflict("The truck has already left this stop")
    changes = body.model_dump(exclude_unset=True, exclude={"version"})
    for k, v in changes.items():
        setattr(stop, k, v)
    if stop.appt_start and stop.appt_end and stop.appt_end < stop.appt_start:
        raise Invalid("The appointment can't end before it starts", field="appt_end")
    sync_route(load, stops)
    load.version += 1
    audit(db, p, "load.stop_updated", "load", load.id,
          {"stop": stop.seq, **body.model_dump(mode="json", exclude_unset=True, exclude={"version"})})
    return load


def visible(db: Session, p: Principal, load_id: uuid.UUID) -> None:
    """A load outside the caller's dispatch team is not found, as if it didn't exist."""
    if db.scalar(team_scope.where(select(Load.id).where(Load.id == load_id), team_scope.loads(p.scope))) is None:
        raise NotFound("Load not found")


def add_note(db: Session, p: Principal, load_id: uuid.UUID, body: s.NoteIn) -> LoadNote:
    visible(db, p, load_id)
    note = LoadNote(organization_id=p.org_id, load_id=load_id, body=body.body.strip(), author_user_id=p.user_id)
    db.add(note)
    db.flush()
    audit(db, p, "load.note_added", "load", load_id)
    return note


def add_tracking(db: Session, p: Principal, load_id: uuid.UUID, body: s.TrackingIn, *,
                 source: str = "dispatcher") -> TrackingEvent:
    visible(db, p, load_id)
    load = db.get(Load, load_id)
    if load.status in CLOSED or load.status == "draft":
        raise Conflict("Check calls are recorded on loads that are under way")
    now = datetime.now(UTC)
    when = body.occurred_at or now
    if when > now + timedelta(minutes=5):
        raise Invalid("That time is in the future", field="occurred_at")
    if not (body.city or body.note):
        raise Invalid("Give a location or a note", field="note")
    event = TrackingEvent(organization_id=p.org_id, load_id=load_id, kind=body.kind, occurred_at=when,
                          city=body.city, state=body.state, note=body.note, source=source,
                          via=body.via, eta=body.eta, actor_user_id=p.user_id)
    db.add(event)
    db.flush()
    if body.kind == "check_call":
        place = ", ".join(x for x in (body.city, body.state) if x)
        audit(db, p, "load.check_call", "load", load_id, {"place": place, "via": body.via})
    return event


# ---------------------------------------------------------------- transitions
def transition(db: Session, p: Principal, load: Load, action: str, *, reason: str | None = None,
               stop_id: uuid.UUID | None = None, occurred_at: datetime | None = None,
               check_permission: bool = True, notify: bool = True) -> Load:
    """Apply one lifecycle action to a locked load, or raise explaining why it isn't allowed."""
    if check_permission and not p.can(PERMISSION[action]):
        raise Forbidden("Your role does not allow this", details={"required": [PERMISSION[action]]})
    if load.status not in TRANSITIONS[action]:
        raise illegal(load, action)
    note = (reason or "").strip() or None
    if action in NEEDS_REASON and not note:
        raise Invalid("Give a reason", field="reason")
    now = datetime.now(UTC)
    when = occurred_at or now
    if when > now + timedelta(minutes=5):
        raise Invalid("That time is in the future", field="occurred_at")

    if action == "mark_ready":
        _customer_for_booking(db, load.customer_id)
        check_route(stops_of(db, load.id))
        move(db, p, load, action, "planned")

    elif action == "dispatch":
        assignment = active_assignment(db, load.id)
        if assignment is None:
            raise Conflict("Assign a driver and a truck before dispatching", code="ASSIGNMENT_REQUIRED")
        # Things can change between assigning and sending the truck (an expired medical card, a unit pulled
        # for repair), so the same checks run again here.
        problems = eligibility.blocking(eligibility.check_trio(
            db, load, db.get(Driver, assignment.driver_id), db.get(Vehicle, assignment.vehicle_id),
            db.get(Trailer, assignment.trailer_id) if assignment.trailer_id else None, p.today(), now))
        if problems:
            raise Conflict(problems[0].message, code="ASSIGNMENT_CONFLICT",
                           details={"reasons": [r.model_dump(mode="json") for r in problems]})
        move(db, p, load, action, "dispatched", note)
        if notify:
            from app.modules.messaging import service as messaging
            messaging.on_dispatched(db, p, load, assignment)

    elif action in ("arrive", "depart"):
        stops = stops_of(db, load.id)
        index = next((i for i, x in enumerate(stops) if x.departed_at is None), None)
        if index is None:
            raise illegal(load, action)
        stop = stops[index]
        if stop_id and stop_id != stop.id:
            raise Conflict("That isn't the stop the truck is at. Refresh and try again.", code="STATE_CONFLICT",
                           details={"expected_stop_id": str(stop.id)})
        if action == "arrive":
            if index and when < stops[index - 1].departed_at:
                raise Invalid("The arrival can't be earlier than the departure from the previous stop",
                              field="occurred_at")
            stop.arrived_at = when
            move(db, p, load, action, "at_pickup" if stop.type == "pickup" else "at_delivery", note)
        else:
            if stop.arrived_at is None:
                raise illegal(load, action)
            if when < stop.arrived_at:
                raise Invalid("The departure can't be earlier than the arrival", field="occurred_at")
            stop.departed_at = when
            if index < len(stops) - 1:
                move(db, p, load, action, "in_transit", note)
            else:
                load.delivered_at = when
                link = db.scalar(select(LoadTrackingLink).where(LoadTrackingLink.load_id == load.id))
                if link is not None:
                    link.expires_at = when + TRACKING_LINK_LIFE
                assignment = active_assignment(db, load.id)
                if assignment:  # the driver and equipment are free again
                    assignment.status, assignment.released_at = "completed", now
                move(db, p, load, action, "delivered", note)
                if any(d.review_status == "pending" for d in pod_documents(db, load.id)):
                    move(db, p, load, "pod_uploaded", "pod_review")

    elif action == "pod_uploaded":
        move(db, p, load, action, "pod_review")

    elif action in ("approve_pod", "reject_pod"):
        pods = pod_documents(db, load.id)
        pending = [d for d in pods if d.review_status == "pending"]
        if action == "approve_pod":
            if not [d for d in pods if d.review_status != "rejected"]:
                raise Conflict("Upload the proof of delivery before completing the load", code="POD_REQUIRED")
            verdict, to = "approved", "completed"
        else:
            verdict, to = "rejected", "delivered"
        for doc in pending:
            doc.review_status, doc.reviewed_by, doc.reviewed_at = verdict, p.user_id, now
            doc.review_note = note if verdict == "rejected" else None
        move(db, p, load, action, to, note)

    elif action == "hold":
        load.held_from_status = load.status
        move(db, p, load, action, "on_hold", note)

    elif action == "release":
        to, load.held_from_status = load.held_from_status or "planned", None
        move(db, p, load, action, to, note)

    elif action == "cancel":
        assignment = active_assignment(db, load.id)
        if assignment:
            assignment.status, assignment.released_at = "released", now
            assignment.release_reason = "Load cancelled"
        load.held_from_status = None
        move(db, p, load, action, "cancelled", note)

    db.flush()
    return load


def on_pod_uploaded(db: Session, p: Principal, load_id: uuid.UUID) -> None:
    """Called when a proof of delivery lands on a load: a delivered load moves into review by itself."""
    load = lock_load(db, load_id)
    if load.status == "delivered":
        move(db, p, load, "pod_uploaded", "pod_review")


def allowed_actions(load: Load, p: Principal) -> list[str]:
    actions = [a for a, perm in PERMISSION.items() if load.status in TRANSITIONS[a] and p.can(perm)]
    if p.can("dispatch.assign"):
        if load.status in TRANSITIONS["assign"]:
            actions.append("assign")
        if load.status in TRANSITIONS["unassign"]:
            actions.append("unassign")
        if load.status in REASSIGNABLE:
            actions.append("reassign")
    return actions


# ---------------------------------------------------------------- reading
def _risk(code: str, message: str, **why) -> s.Risk:
    label, reason = rules.risk_reason(code, **why)
    return s.Risk(code=code, message=message, label=label, reason=reason)


def risks(load: Load, now: datetime) -> list[s.Risk]:
    """What could go wrong with a load, each with a short label and the reason in plain words."""
    out = []
    minutes = lambda at: int((at - now).total_seconds() // 60)  # noqa: E731
    if load.pickup_at and load.status in ("planned", "assigned", "dispatched"):
        if load.pickup_at < now:
            out.append(_risk("LATE_PICKUP", "The pickup appointment has passed",
                             cause=f"The pickup appointment passed {rules._dur(-minutes(load.pickup_at))} ago"))
        elif load.status == "planned" and load.pickup_at < now + timedelta(hours=24):
            out.append(_risk("UNASSIGNED_SOON", "Picks up within 24 hours and has no driver",
                             pickup_in_minutes=minutes(load.pickup_at)))
    if load.delivery_at and load.status in ROLLING and load.delivery_at < now:
        out.append(_risk("LATE_DELIVERY", "The delivery appointment has passed", late_by_minutes=-minutes(load.delivery_at),
                         cause="The delivery appointment has passed"))
    if load.status == "delivered":
        out.append(_risk("MISSING_POD", "Waiting for proof of delivery"))
    return out


def late_reason(risk_list: list[s.Risk], late_by: int, eta_known: bool) -> None:
    """With a live ETA, a running-late load says by how much against the appointment."""
    for r in risk_list:
        if r.code == "LATE_DELIVERY" and eta_known and late_by > 0:
            r.reason = f"ETA +{rules._dur(late_by)} past the delivery appointment"


def view_conditions(p: Principal, now: datetime) -> dict:
    """SQL for each named view. `at_risk` and `missing_pod` mirror `risks` above."""
    start, end = day_bounds(p.timezone, p.today())
    late_pickup = and_(Load.status.in_(("planned", "assigned", "dispatched")), Load.pickup_at < now)
    late_delivery = and_(Load.status.in_(ROLLING), Load.delivery_at < now)
    unassigned_soon = and_(Load.status == "planned", Load.pickup_at < now + timedelta(hours=24))
    return {
        "active": Load.status.in_(ACTIVE),
        "unassigned": Load.status == "planned",
        "pickups_today": and_(Load.pickup_at >= start, Load.pickup_at < end, Load.status.in_(ACTIVE)),
        "deliveries_today": and_(Load.delivery_at >= start, Load.delivery_at < end, Load.status.in_(ACTIVE)),
        "at_risk": or_(late_pickup, late_delivery, unassigned_soon),
        "in_transit": Load.status.in_(ROLLING),
        "missing_pod": Load.status == "delivered",
        "on_hold": Load.status == "on_hold",
        "ready_to_invoice": and_(Load.status == "completed", Load.billing_status == "unbilled",
                                 Load.invoice_id.is_(None)),
        # The dashboard's cards, so a card's number and the list it opens are the same query.
        # Picking up within 24 hours (or already past) with no driver.
        "unassigned_soon": unassigned_soon,
        # Every load with a delivery appointment (narrowed by delivery_from / delivery_to), drafts and cancelled aside.
        "deliveries": and_(Load.delivery_at.is_not(None), Load.status.not_in(("draft", "cancelled"))),
        # Late or at risk now, or delivered after the appointment (narrowed by delivery_from / delivery_to).
        "late_or_at_risk": or_(late_pickup, late_delivery, unassigned_soon,
                               and_(Load.delivered_at.is_not(None), Load.delivery_at.is_not(None),
                                    Load.delivered_at > Load.delivery_at)),
    }


def board_summary(db: Session, p: Principal, terminal_id: uuid.UUID | None = None) -> s.BoardSummary:
    conditions = view_conditions(p, datetime.now(UTC))
    stmt = select(*[func.count().filter(conditions[name]).label(name) for name in s.BoardSummary.model_fields])
    stmt = team_scope.where(stmt.select_from(Load), team_scope.loads(p.scope))
    if terminal_id:
        stmt = stmt.where(Load.terminal_id == terminal_id)
    return s.BoardSummary(**db.execute(stmt).one()._asdict())


def _rows():
    """A load with its customer and whoever is (or was last) hauling it."""
    hauling = and_(DispatchAssignment.load_id == Load.id, DispatchAssignment.status.in_(("active", "completed")))
    return (
        select(Load, Customer.name, DispatchAssignment.id, DispatchAssignment.status, Driver.id, Driver.first_name,
               Driver.last_name, Vehicle.id, Vehicle.unit_number, Trailer.id, Trailer.unit_number)
        .join(Customer, Customer.id == Load.customer_id)
        .outerjoin(DispatchAssignment, hauling)
        .outerjoin(Driver, Driver.id == DispatchAssignment.driver_id)
        .outerjoin(Vehicle, Vehicle.id == DispatchAssignment.vehicle_id)
        .outerjoin(Trailer, Trailer.id == DispatchAssignment.trailer_id)
    )


def _item(row, p: Principal, now: datetime) -> dict:
    (load, customer_name, assignment_id, assignment_status, driver_id, first, last, vehicle_id, unit, trailer_id,
     trailer_unit) = row
    assignment = None
    if assignment_id:
        assignment = s.AssignmentBrief(
            id=assignment_id, status=assignment_status, driver=s.Ref(id=driver_id, name=f"{first} {last}"),
            vehicle=s.Ref(id=vehicle_id, name=unit),
            trailer=s.Ref(id=trailer_id, name=trailer_unit) if trailer_id else None)
    rates = p.can("loads.rates.read")
    return dict(
        id=load.id, load_number=load.load_number, status=load.status, billing_status=load.billing_status,
        version=load.version, customer=s.Ref(id=load.customer_id, name=customer_name),
        terminal_id=load.terminal_id, reference=load.reference, equipment_type=load.equipment_type,
        origin_city=load.origin_city, origin_state=load.origin_state, destination_city=load.destination_city,
        destination_state=load.destination_state, pickup_at=load.pickup_at, delivery_at=load.delivery_at,
        delivered_at=load.delivered_at, miles=load.miles, weight_lbs=load.weight_lbs, bol_number=load.bol_number,
        pickup_number=load.pickup_number, delivery_number=load.delivery_number,
        revenue=(load.customer_rate + load.charges_total) if rates else None, currency=load.currency,
        assignment=assignment, risks=risks(load, now), created_at=load.created_at, updated_at=load.updated_at)


RISK_FILTERS = {"at_risk": "at_risk", "unassigned": "unassigned_soon", "missing_pod": "missing_pod"}


def costs_of(db: Session, org_id: uuid.UUID) -> rules.Costs:
    """The company's own cost rates, which the margin estimate uses."""
    row = db.execute(select(Organization.cost_driver_pay_per_mile, Organization.cost_mpg, Organization.cost_fuel_price,
                            Organization.cost_overhead_per_mile).where(Organization.id == org_id)).first()
    return rules.Costs(*row) if row else rules.Costs()


def _filtered(p: Principal, params: s.LoadListParams, now: datetime, *, default_view: str | None = None,
              skip: frozenset[str] = frozenset()):
    """The list's query with every filter applied, except the ones named in `skip` (a facet counts its own values
    as if it weren't chosen)."""
    stmt = team_scope.where(_rows(), team_scope.loads(p.scope))
    conditions = view_conditions(p, now)
    view = params.view or default_view
    if view:
        stmt = stmt.where(conditions[view])
    if params.status and "status" not in skip:
        stmt = stmt.where(Load.status.in_(params.status))
    for name, column, values in (("customer", Load.customer_id, params.customer_ids),
                                 ("driver", DispatchAssignment.driver_id, params.driver_ids),
                                 ("equipment", Load.equipment_type, params.equipment_types)):
        if values and name not in skip:
            stmt = stmt.where(column.in_(values))
    if params.risks and "risk" not in skip:
        stmt = stmt.where(or_(*[conditions[RISK_FILTERS[r]] for r in params.risks]))
    for column, value in ((Load.billing_status, params.billing_status), (Load.customer_id, params.customer_id),
                          (Load.terminal_id, params.terminal_id), (Load.equipment_type, params.equipment_type),
                          (DispatchAssignment.driver_id, params.driver_id),
                          (DispatchAssignment.vehicle_id, params.vehicle_id),
                          (DispatchAssignment.trailer_id, params.trailer_id)):
        if value is not None:
            stmt = stmt.where(column == value)
    for column, value in ((Load.origin_state, params.origin_state),
                          (Load.destination_state, params.destination_state)):
        if value:
            stmt = stmt.where(func.lower(column) == value.strip().lower())
    for column, first, last in ((Load.pickup_at, params.pickup_from, params.pickup_to),
                                (Load.delivery_at, params.delivery_from, params.delivery_to)):
        if first:
            stmt = stmt.where(column >= day_bounds(p.timezone, first)[0])
        if last:
            stmt = stmt.where(column < day_bounds(p.timezone, last)[1])
    if params.q:
        pattern = like(params.q.strip())
        stmt = stmt.where(or_(*[c.ilike(pattern) for c in (
            Load.load_number, Load.reference, Load.bol_number, Load.pickup_number, Load.delivery_number,
            Customer.name, Load.origin_city, Load.destination_city, Driver.first_name, Driver.last_name,
            func.concat(Driver.first_name, " ", Driver.last_name))]))
    return stmt


def _margin_sql(costs: rules.Costs):
    """The margin estimate in SQL, for sorting: revenue less the per-mile costs (detention estimates aside)."""
    per_mile = costs.driver_pay_per_mile + costs.overhead_per_mile + (
        costs.fuel_price / costs.mpg if costs.mpg else Decimal(0))
    return Load.customer_rate + Load.charges_total - func.coalesce(Load.miles, 0) * literal(per_mile)


def list_loads(db: Session, p: Principal, params: s.LoadListParams, *,
               default_view: str | None = None) -> tuple[list[s.LoadListItem], PageInfo]:
    now = datetime.now(UTC)
    stmt = _filtered(p, params, now, default_view=default_view)
    rates = p.can("loads.rates.read")
    costs = costs_of(db, p.org_id) if rates else None
    sortable = {
        "created_at": Load.created_at, "updated_at": Load.updated_at, "status": Load.status,
        "customer": Customer.name, "load_number": Load.load_number, "miles": func.coalesce(Load.miles, 0),
        "equipment": Load.equipment_type, "driver": func.coalesce(Driver.last_name, ""),
        "pickup_at": func.coalesce(Load.pickup_at, literal(FAR_FUTURE)),
        "delivery_at": func.coalesce(Load.delivery_at, literal(FAR_FUTURE)),
    }
    if rates:
        sortable["revenue"] = Load.customer_rate + Load.charges_total
        sortable["margin"] = _margin_sql(costs)
    rows, info = paginate(db, stmt, parse_sort(params.sort, sortable, "-created_at"), Load.id,
                          cursor=params.cursor, limit=params.limit, count=params.count)
    loads = [row[0] for row in rows]
    extras = _list_extras(db, loads, now)
    margins = _margins(db, loads, costs, now) if rates else {}
    out = []
    for row in rows:
        item = s.LoadListItem(**_item(row, p, now), **extras[row[0].id], **margins.get(row[0].id, {}))
        late_reason(item.risks, item.late_by_minutes, item.eta is not None)
        out.append(item)
    return out, info


def _dwell(db: Session, load_ids: list[uuid.UUID], now: datetime) -> dict[uuid.UUID, list[tuple[str, int | None]]]:
    out: dict[uuid.UUID, list[tuple[str, int | None]]] = {i: [] for i in load_ids}
    if not load_ids:
        return out
    for stop in db.scalars(select(LoadStop).where(LoadStop.load_id.in_(load_ids)).order_by(LoadStop.seq)):
        out[stop.load_id].append((stop.name or stop.city, rules.dwell_minutes(stop.arrived_at, stop.departed_at,
                                                                                       now)))
    return out


def _money_of(load: Load, dwell, costs: rules.Costs, charges: list[rules.Charge] | None = None) -> rules.Money:
    """The rules' money for a load. Without its charge lines, the charges other than fuel are taken as one sum."""
    fuel = rules.fuel_surcharge(load.customer_rate, load.fuel_surcharge_pct or 0)
    if charges is None:
        charges = [rules.Charge("approved", True, Decimal(load.charges_total) - fuel)]
    return rules.money(load.customer_rate, load.fuel_surcharge_pct or 0, load.miles, dwell, load.detention_free_hours,
                       load.detention_rate, charges, costs)


def _margins(db: Session, loads: list[Load], costs: rules.Costs, now: datetime) -> dict[uuid.UUID, dict]:
    dwell = _dwell(db, [x.id for x in loads], now)
    out = {}
    for load in loads:
        m = _money_of(load, dwell[load.id], costs)
        out[load.id] = {"margin": m.margin, "margin_pct": m.margin_pct}
    return out


def facets(db: Session, p: Principal, params: s.LoadListParams) -> s.LoadFacets:
    """For each filter, how many loads each of its values would show with the other filters as they are."""
    from app.modules.messaging.service import EQUIPMENT as EQUIPMENT_LABELS
    now = datetime.now(UTC)

    def counted(dimension: str, column, *extra):
        stmt = _filtered(p, params, now, skip=frozenset({dimension}))
        return db.execute(stmt.with_only_columns(column, *extra, func.count(func.distinct(Load.id)))
                          .group_by(column, *extra).order_by(func.count(func.distinct(Load.id)).desc())).all()

    status = [s.FacetValue(value=v, label=STATUS_LABELS.get(v, v), count=n) for v, n in counted("status", Load.status)]
    customer = [s.FacetValue(value=str(v), label=name, count=n)
                for v, name, n in counted("customer", Load.customer_id, Customer.name)]
    equipment = [s.FacetValue(value=v, label=EQUIPMENT_LABELS.get(v, v), count=n)
                 for v, n in counted("equipment", Load.equipment_type)]
    driver = [s.FacetValue(value=str(v) if v else "", label=f"{first} {last}" if v else "No driver", count=n)
              for v, first, last, n in counted("driver", Driver.id, Driver.first_name, Driver.last_name)]
    conditions = view_conditions(p, now)
    base = _filtered(p, params, now, skip=frozenset({"risk"}))
    risk_counts = db.execute(base.with_only_columns(*[
        func.count(func.distinct(Load.id)).filter(conditions[c]).label(k) for k, c in RISK_FILTERS.items()])).one()
    risk = [s.FacetValue(value=k, label=RISK_LABELS[k], count=getattr(risk_counts, k)) for k in RISK_FILTERS]
    return s.LoadFacets(status=status, customer=customer, equipment=equipment, driver=driver, risk=risk)


STATUS_LABELS = {"draft": "Draft", "planned": "Planned", "assigned": "Assigned", "dispatched": "Dispatched",
                 "at_pickup": "At pickup", "in_transit": "In transit", "at_delivery": "At delivery",
                 "delivered": "Delivered", "pod_review": "POD review", "completed": "Completed", "on_hold": "On hold",
                 "cancelled": "Cancelled"}
RISK_LABELS = {"at_risk": "At risk", "unassigned": "No driver soon", "missing_pod": "POD missing"}


PAPERS = ("rate_confirmation", "bol", "pod")


def _list_extras(db: Session, loads: list[Load], now: datetime) -> dict[uuid.UUID, dict]:
    """For a page of loads: which of the three papers each has, when its truck reaches the last delivery, and why
    it is held."""
    from app.modules.documents.models import Document, DocumentLink
    from app.modules.tracking import incidents
    out = {load.id: {"papers": s.LoadPapers(), "eta": None, "late_by_minutes": 0, "hold_reason": None} for load in loads}
    if not loads:
        return out
    ids = list(out)
    for load_id, kind in db.execute(
            select(DocumentLink.entity_id, Document.type).join(Document, Document.id == DocumentLink.document_id)
            .where(DocumentLink.entity_type == "load", DocumentLink.entity_id.in_(ids), Document.type.in_(PAPERS),
                   Document.upload_status == "uploaded", Document.review_status != "rejected")).all():
        setattr(out[load_id]["papers"], kind, True)
    rolling = [load for load in loads if load.status in ROLLING]
    if rolling:
        roads = {road.load.id: road for road in incidents.on_the_road(db).values()}
        positions = incidents.latest_positions(db, [roads[load.id].vehicle_id for load in rolling if load.id in roads])
        for load in rolling:
            road = roads.get(load.id)
            if road is None:
                continue
            at, last = incidents.delivery_eta(road, positions.get(road.vehicle_id), now)
            if at is None:
                continue
            appt = (last.appt_end or last.appt_start) if last is not None else None
            out[load.id]["eta"] = at
            out[load.id]["late_by_minutes"] = int((at - appt).total_seconds() // 60) if appt and at > appt else 0
    held = [load.id for load in loads if load.status == "on_hold"]
    if held:
        for load_id, note in db.execute(
                select(LoadStatusEvent.load_id, LoadStatusEvent.note)
                .where(LoadStatusEvent.load_id.in_(held), LoadStatusEvent.action == "hold")
                .order_by(LoadStatusEvent.load_id, LoadStatusEvent.created_at.desc())
                .distinct(LoadStatusEvent.load_id)).all():
            out[load_id]["hold_reason"] = note
    return out


def _names(db: Session, user_ids) -> dict[uuid.UUID, str]:
    ids = {u for u in user_ids if u}
    if not ids:
        return {}
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all())


def load_detail(db: Session, p: Principal, load_id: uuid.UUID) -> s.LoadDetail:
    now = datetime.now(UTC)
    row = db.execute(team_scope.where(_rows().where(Load.id == load_id), team_scope.loads(p.scope))).first()
    if row is None:
        raise NotFound("Load not found")
    load: Load = row[0]
    rates = p.can("loads.rates.read")

    notes = list(db.scalars(select(LoadNote).where(LoadNote.load_id == load_id).order_by(LoadNote.created_at.desc())))
    events = list(db.scalars(select(LoadStatusEvent).where(LoadStatusEvent.load_id == load_id)
                             .order_by(LoadStatusEvent.load_version)))
    tracking = list(db.scalars(select(TrackingEvent).where(TrackingEvent.load_id == load_id)
                               .order_by(TrackingEvent.occurred_at.desc())))
    history = db.execute(
        select(DispatchAssignment, Driver.first_name, Driver.last_name, Vehicle.unit_number, Trailer.unit_number)
        .join(Driver, Driver.id == DispatchAssignment.driver_id)
        .join(Vehicle, Vehicle.id == DispatchAssignment.vehicle_id)
        .outerjoin(Trailer, Trailer.id == DispatchAssignment.trailer_id)
        .where(DispatchAssignment.load_id == load_id).order_by(DispatchAssignment.created_at.desc())).all()
    names = _names(db, [*(n.author_user_id for n in notes), *(e.actor_user_id for e in events),
                        *(t.actor_user_id for t in tracking), *(a.assigned_by for a, *_ in history)])
    # What a driver did, they did in the driver app: their sign-in is the app's.
    actors = {e.actor_user_id for e in events if e.actor_user_id}
    drivers_signed_in = set(db.scalars(select(Membership.user_id).where(
        Membership.role == "driver", Membership.user_id.in_(actors)))) if actors else set()
    charges = list(db.scalars(select(LoadCharge).where(LoadCharge.load_id == load_id)
                              .order_by(LoadCharge.created_at))) if rates else []
    invoice = db.get(Invoice, load.invoice_id) if load.invoice_id and p.can("invoices.read") else None
    from app.modules.loads import workflow
    parts = workflow.detail_parts(db, p, load, now)
    money_part = workflow.money_out(parts.pop("money"), load, costs_of(db, p.org_id)) if parts["money"] else None
    parts.pop("money", None)
    if money_part is not None:
        parts["checklist"] = [s.LoadChecklistItem(**vars(i)) for i in parts["checklist"]]
    margin = {"margin": money_part.margin, "margin_pct": money_part.margin_pct} if money_part else {}
    stops = stops_of(db, load_id)
    item = _item(row, p, now)
    extras = _list_extras(db, [load], now)[load.id]

    detail = s.LoadDetail(
        **item, **extras, **margin, **parts, money=money_part,
        seal_number=load.seal_number,
        fuel_surcharge_pct=load.fuel_surcharge_pct if rates else None,
        detention_free_hours=load.detention_free_hours,
        detention_rate=load.detention_rate if rates else None,
        commodity=load.commodity, instructions=load.instructions,
        customer_rate=load.customer_rate if rates else None, charges_total=load.charges_total if rates else None,
        held_from_status=load.held_from_status,
        invoice=s.InvoiceRef(id=invoice.id, invoice_number=invoice.invoice_number, status=invoice.status)
        if invoice else None,
        stops=[s.StopOut.model_validate(x).model_copy(update={
            "dwell_minutes": rules.dwell_minutes(x.arrived_at, x.departed_at, now)}) for x in stops],
        items=[s.ItemOut.model_validate(i) for i in db.scalars(
            select(LoadItem).where(LoadItem.load_id == load_id).order_by(LoadItem.created_at))],
        charges=[s.ChargeOut.model_validate(c) for c in charges],
        notes=[s.NoteOut(id=n.id, body=n.body, author_name=names.get(n.author_user_id), created_at=n.created_at)
               for n in notes],
        events=[s.StatusEventOut(id=e.id, action=e.action, from_status=e.from_status, to_status=e.to_status,
                                 actor_name=names.get(e.actor_user_id), note=e.note, created_at=e.created_at,
                                 source="system" if e.actor_user_id is None else
                                 "driver app" if e.actor_user_id in drivers_signed_in else "web")
                for e in events],
        tracking=[s.TrackingOut(id=t.id, kind=t.kind, occurred_at=t.occurred_at, city=t.city, state=t.state,
                                note=t.note, source=t.source, via=t.via, eta=t.eta,
                                actor_name=names.get(t.actor_user_id))
                  for t in tracking],
        assignments=[s.AssignmentOut(
            id=a.id, status=a.status, driver=s.Ref(id=a.driver_id, name=f"{first} {last}"),
            vehicle=s.Ref(id=a.vehicle_id, name=unit),
            trailer=s.Ref(id=a.trailer_id, name=trailer_unit) if a.trailer_id else None,
            assigned_at=a.created_at, assigned_by_name=names.get(a.assigned_by), released_at=a.released_at,
            release_reason=a.release_reason) for a, first, last, unit, trailer_unit in history],
        allowed_actions=allowed_actions(load, p), editable=editable(load, p),
        position=_position(db, load, row, now), pod_requested_at=_pod_requests(db, load))
    late_reason(detail.risks, detail.late_by_minutes, detail.eta is not None)
    return detail


def _position(db: Session, load: Load, row, now: datetime) -> s.LoadPosition | None:
    """The hauling truck's latest position, how fresh it is, and the road miles still to the last delivery."""
    from app.core import places
    from app.modules.tracking import incidents
    from app.modules.tracking.service import freshness
    vehicle_id, assignment_status = row[7], row[3]
    if vehicle_id is None or assignment_status not in ("active", "completed"):
        return None
    pos = incidents.latest_positions(db, [vehicle_id]).get(vehicle_id)
    if pos is None:
        return s.LoadPosition(freshness="none", recorded_at=None, source=None, accuracy_m=None, speed_mph=None, lat=None,
                              lon=None, place=None, remaining_miles=None)
    remaining = None
    last = db.scalar(select(LoadStop).where(LoadStop.load_id == load.id, LoadStop.type == "delivery")
                     .order_by(LoadStop.seq.desc()).limit(1))
    if last is not None and last.arrived_at is None:
        where = places.locate(last.city, last.state)
        if where is not None:
            km = places.km(float(pos.lat), float(pos.lon), *where) * incidents.ROAD_FACTOR
            remaining = round(km / 1.609344)
    elif last is not None:
        remaining = 0
    lat, lon = float(pos.lat), float(pos.lon)
    return s.LoadPosition(freshness=freshness(pos.recorded_at, now), recorded_at=pos.recorded_at, source=pos.source,
                          accuracy_m=pos.accuracy_m, speed_mph=float(pos.speed_mph) if pos.speed_mph is not None else None,
                          lat=lat, lon=lon, place=places.describe(lat, lon, pos.heading, True), remaining_miles=remaining)


def _pod_requests(db: Session, load: Load) -> list[datetime]:
    """When the driver was asked for the proof of delivery, from the load's missing-POD alert."""
    if load.status != "delivered":
        return []
    from app.modules.tracking.models import Incident
    data = db.scalar(select(Incident.data).where(Incident.kind == "pod_missing", Incident.load_id == load.id,
                                                 Incident.state != "resolved")) or {}
    return [datetime.fromisoformat(at) for at in data.get("pod_requests_at", [])]
