"""What a dispatcher does with a load beyond editing it: moving it on the board, duplicating and repeating it, undoing
a cancel, approving its extra charges, sharing a tracking link with the customer, invoicing it, watching its reefer
and its check calls. Every change goes through the load service's lock, version and audit, so it shows in the
load's activity."""
import secrets
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import mail
from app.core.audit import audit
from app.core.deps import Principal
from app.core.errors import Conflict, Forbidden, Invalid, NotFound
from app.modules.customers.models import Customer, CustomerContact
from app.modules.dispatch.models import DispatchAssignment
from app.modules.loads import rules, service
from app.modules.loads import schemas as s
from app.modules.loads.models import (
    Load,
    LoadCharge,
    LoadItem,
    LoadStatusEvent,
    LoadStop,
    LoadTrackingLink,
    ReeferReading,
    TrackingEvent,
)

REEFER_BAND = 2.0
REEFER_DRIFT = 1.5
REEFER_ALERT_AFTER = timedelta(minutes=15)
UNDO_CANCEL = timedelta(minutes=10)
REPEAT_AHEAD_DAYS = 14


# ---------------------------------------------------------------- the board
def board_move(db: Session, p: Principal, load_id: uuid.UUID, body: s.BoardMoveIn) -> tuple[Load, rules.Move]:
    """Drop a card in a board column. The server applies the same rules the board shows; a move that isn't
    possible is refused with the reason."""
    load = service.lock_load(db, load_id, p)
    service.check_version(load, body.version)
    has_driver = service.active_assignment(db, load.id) is not None
    has_pod = any(d.review_status != "rejected" for d in service.pod_documents(db, load.id))
    move = rules.board_move(load.load_number, load.status, has_driver, has_pod, body.column)
    if not move.ok:
        raise Conflict(move.reason, code="BOARD_MOVE_REFUSED", details={"needs_assign": move.needs_assign})
    if move.action == "unassign":
        if not p.can("dispatch.assign"):
            raise Forbidden("Your role does not allow this", details={"required": ["dispatch.assign"]})
        from app.modules.dispatch import service as dispatch
        dispatch.unassign(db, p, load, reason="Moved back to Unassigned on the board")
    elif move.action:
        service.transition(db, p, load, move.action)
    return load, move


# ---------------------------------------------------------------- duplicate, repeat, undo
def duplicate(db: Session, p: Principal, load_id: uuid.UUID, *, shift_days: int = 0,
              parent: Load | None = None) -> Load:
    """A copy of a load as a new draft: same customer, route, freight and terms; no driver, no paperwork, no
    times at the stops. A repeat copy (`parent`) also leaves the rate out, for someone to confirm."""
    service.visible(db, p, load_id)
    src = db.get(Load, load_id)
    if src is None:
        raise NotFound("Load not found")
    rates = p.can("loads.rates.read") and parent is None
    load = Load(organization_id=p.org_id, load_number=service.next_load_number(db, p.org_id), status="draft",
                currency=src.currency, created_by=p.user_id, customer_id=src.customer_id, terminal_id=src.terminal_id,
                dispatch_team_id=p.scope.team_id if p.scope else src.dispatch_team_id,
                reference=src.reference if parent is None else None, commodity=src.commodity,
                equipment_type=src.equipment_type, weight_lbs=src.weight_lbs, miles=src.miles,
                instructions=src.instructions, customer_rate=src.customer_rate if rates else Decimal(0),
                fuel_surcharge_pct=src.fuel_surcharge_pct, detention_free_hours=src.detention_free_hours,
                detention_rate=src.detention_rate, reefer_set_point_f=src.reefer_set_point_f,
                checkcall_reminder_hours=src.checkcall_reminder_hours,
                recurrence_parent_id=parent.id if parent is not None else None)
    db.add(load)
    db.flush()
    shift = timedelta(days=shift_days)
    stops = [LoadStop(organization_id=p.org_id, load_id=load.id, seq=x.seq, type=x.type, handling=x.handling,
                      name=x.name, address=x.address, city=x.city, state=x.state, postal_code=x.postal_code,
                      contact_name=x.contact_name, contact_phone=x.contact_phone, instructions=x.instructions,
                      appt_start=x.appt_start + shift if x.appt_start and shift_days else None,
                      appt_end=x.appt_end + shift if x.appt_end and shift_days else None)
             for x in service.stops_of(db, src.id)]
    db.add_all(stops)
    for item in db.scalars(select(LoadItem).where(LoadItem.load_id == src.id)):
        db.add(LoadItem(organization_id=p.org_id, load_id=load.id, description=item.description,
                        quantity=item.quantity, unit=item.unit, weight_lbs=item.weight_lbs))
    db.flush()
    service.sync_route(load, stops)
    service.recalc_charges(db, load)
    db.add(LoadStatusEvent(organization_id=p.org_id, load_id=load.id, load_version=load.version, action="created",
                           from_status=None, to_status="draft", actor_user_id=p.user_id))
    audit(db, p, "load.created", "load", load.id, {"load_number": load.load_number, "status": "draft",
                                                   "copied_from": src.load_number})
    audit(db, p, "load.duplicated", "load", src.id, {"copy": load.load_number, "repeat": parent is not None})
    return load


def undo_cancel(db: Session, p: Principal, load_id: uuid.UUID, version: int) -> Load:
    """Put back a load cancelled in the last few minutes, as it was. The driver and truck come back too when they
    haven't been given other work since."""
    if not p.can("loads.cancel"):
        raise Forbidden("Your role does not allow this", details={"required": ["loads.cancel"]})
    load = service.lock_load(db, load_id, p)
    service.check_version(load, version)
    event = db.scalar(select(LoadStatusEvent).where(LoadStatusEvent.load_id == load.id)
                      .order_by(LoadStatusEvent.load_version.desc()).limit(1))
    if load.status != "cancelled" or event is None or event.action != "cancel":
        raise Conflict("Only a load that was just cancelled can be put back", code="WRONG_STATE")
    if datetime.now(UTC) - event.created_at > UNDO_CANCEL:
        raise Conflict("It’s been more than 10 minutes, so the cancel can’t be undone. Book the load again with "
                       "Duplicate.", code="TOO_LATE")
    back = event.from_status
    released = db.scalar(select(DispatchAssignment).where(
        DispatchAssignment.load_id == load.id, DispatchAssignment.status == "released",
        DispatchAssignment.release_reason == "Load cancelled").order_by(DispatchAssignment.released_at.desc()).limit(1))
    if released is not None:
        busy = db.scalar(select(DispatchAssignment.id).where(
            DispatchAssignment.status == "active",
            (DispatchAssignment.driver_id == released.driver_id) | (DispatchAssignment.vehicle_id == released.vehicle_id)))
        if busy is None:
            released.status, released.released_at, released.release_reason = "active", None, None
        else:
            back = "planned"
    if back == "on_hold":
        back = "planned"
    service.move(db, p, load, "undo_cancel", back, "Cancel undone")
    return load


# ---------------------------------------------------------------- charges
def review_charges(db: Session, p: Principal, load_id: uuid.UUID, charge_ids: list[uuid.UUID] | None,
                   verdict: str) -> Load:
    """Approve or reject extra charges. Pending charges hold up the invoice."""
    load = service.lock_load(db, load_id, p)
    service.guard_rates(db, p, load)
    stmt = select(LoadCharge).where(LoadCharge.load_id == load.id, LoadCharge.managed.is_(False))
    stmt = stmt.where(LoadCharge.id.in_(charge_ids)) if charge_ids else stmt.where(LoadCharge.status == "pending")
    charges = list(db.scalars(stmt))
    if charge_ids and len(charges) != len(set(charge_ids)):
        raise NotFound("Charge not found")
    for charge in charges:
        if charge.status != verdict:
            charge.status = verdict
            audit(db, p, "load.charge_reviewed", "load", load.id,
                  {"charge_id": str(charge.id), "type": charge.type, "verdict": verdict, "amount": str(charge.amount)})
    service.after_charge_change(db, p, load)
    return load


# ---------------------------------------------------------------- tracking link
def _link(db: Session, load_id: uuid.UUID) -> LoadTrackingLink | None:
    return db.scalar(select(LoadTrackingLink).where(LoadTrackingLink.load_id == load_id))


def contact_email(db: Session, customer_id: uuid.UUID) -> str | None:
    """Who a tracking link goes to: the customer's primary operations contact, else any contact, else billing."""
    found = db.scalar(select(CustomerContact.email).where(
        CustomerContact.customer_id == customer_id, CustomerContact.email.is_not(None))
        .order_by(CustomerContact.is_primary.desc(), (CustomerContact.kind == "operations").desc(),
                  CustomerContact.created_at).limit(1))
    return found or db.scalar(select(Customer.billing_email).where(Customer.id == customer_id))


def link_out(db: Session, load: Load, link: LoadTrackingLink | None) -> s.TrackingLinkOut | None:
    if link is None:
        return None
    return s.TrackingLinkOut(enabled=link.enabled, url_path=f"/track/{link.token}", show_eta=link.show_eta,
                             show_location=link.show_location, show_pod=link.show_pod, show_driver=link.show_driver,
                             sent_at=link.sent_at, sent_to=link.sent_to, expires_at=link.expires_at,
                             contact_email=contact_email(db, load.customer_id))


def set_link(db: Session, p: Principal, load_id: uuid.UUID, body: s.TrackingLinkIn) -> LoadTrackingLink:
    """Turn the customer's tracking link on or off and choose what it shows. Off stops it working at once."""
    load = service.lock_load(db, load_id, p)
    if load.status in ("cancelled", "draft"):
        raise Conflict("Tracking links are for loads that are booked and not cancelled")
    link = _link(db, load.id)
    changes = body.model_dump(exclude_none=True)
    if link is None:
        link = LoadTrackingLink(organization_id=p.org_id, load_id=load.id, token=secrets.token_urlsafe(24),
                                expires_at=load.delivered_at + service.TRACKING_LINK_LIFE if load.delivered_at else None)
        db.add(link)
        changes.setdefault("enabled", True)
        audit(db, p, "load.tracking_link", "load", load.id, {"change": "created"})
    for k, v in changes.items():
        setattr(link, k, v)
    db.flush()
    if "enabled" in changes or any(k.startswith("show_") for k in changes):
        audit(db, p, "load.tracking_link", "load", load.id,
              {"change": "on" if link.enabled else "off", **{k: v for k, v in changes.items() if k != "enabled"}})
    return link


def send_link(db: Session, p: Principal, load_id: uuid.UUID, body: s.TrackingSendIn) -> LoadTrackingLink:
    from app.core.config import get_settings
    load = service.lock_load(db, load_id, p)
    link = _link(db, load.id)
    if link is None or not link.enabled:
        raise Conflict("Turn the tracking link on first")
    to = (body.to or contact_email(db, load.customer_id) or "").strip()
    if "@" not in to:
        raise Invalid("Add an email for the customer’s contact, or type one", field="to")
    url = f"{get_settings().public_url.rstrip('/')}/track/{link.token}"
    text = body.message.strip()
    if url not in text:
        text = f"{text}\n\n{url}"
    mail.send(to, f"Tracking for load {load.load_number}" + (f" · {load.reference}" if load.reference else ""),
              f"{text}\n\n{p.org_name}")
    link.sent_at, link.sent_to = datetime.now(UTC), to
    audit(db, p, "load.tracking_link", "load", load.id, {"change": "sent", "to": to})
    return link


def public_tracking(token: str) -> s.PublicTracking:
    """The customer's view through a tracking link, with no sign-in. The token is looked up by a database function
    that only answers for links that are on and not expired; everything else reads inside that company."""
    from sqlalchemy import text

    from app.core.db import new_session
    from app.modules.organizations.models import Organization
    if not token or len(token) > 64:
        raise NotFound("This tracking link isn’t active")
    with new_session() as db:
        found = db.execute(text("SELECT organization_id, load_id FROM public_tracking_link(:t)"), {"t": token}).first()
    if found is None:
        raise NotFound("This tracking link isn’t active")
    org_id, load_id = found
    with new_session(org_id=org_id) as db:
        org = db.get(Organization, org_id)
        load = db.get(Load, load_id)
        link = _link(db, load_id)
        if load is None or link is None or not link.enabled or load.status == "cancelled":
            raise NotFound("This tracking link isn’t active")
        now = datetime.now(UTC)
        stops = service.stops_of(db, load.id)
        out = s.PublicTracking(
            company=org.name, load_number=load.load_number, reference=load.reference, status=load.status,
            status_label=service.STATUS_LABELS.get(load.status, load.status), timezone=org.timezone,
            updated_at=load.updated_at,
            stops=[s.PublicStop(type=x.type, city=x.city, state=x.state, appointment=x.appt_start or x.appt_end,
                                arrived_at=x.arrived_at, departed_at=x.departed_at) for x in stops])
        delivered = load.status in rules.DELIVERED
        if link.show_eta and not delivered:
            out.eta = service._list_extras(db, [load], now)[load.id]["eta"] or load.delivery_at
        assignment = service.active_assignment(db, load.id)
        if link.show_location and not delivered and assignment is not None:
            from app.modules.tracking import incidents
            pos = incidents.latest_positions(db, [assignment.vehicle_id]).get(assignment.vehicle_id)
            if pos is not None:
                from app.core import places
                lat, lon = float(pos.lat), float(pos.lon)
                out.position = {"lat": round(lat, 2), "lon": round(lon, 2), "recorded_at": pos.recorded_at.isoformat(),
                                "place": places.describe(lat, lon, pos.heading, True)}
        if link.show_driver and assignment is not None and not delivered:
            from app.modules.drivers.models import Driver
            driver = db.get(Driver, assignment.driver_id)
            if driver is not None:
                out.driver_name, out.driver_phone = f"{driver.first_name} {driver.last_name[:1]}.", driver.phone
        if link.show_pod and delivered:
            out.pod_available = any(d.review_status != "rejected" for d in service.pod_documents(db, load.id))
        return out


def public_pod(token: str) -> tuple[bytes, str, str]:
    """The proof of delivery through a tracking link, when the carrier chose to show it and the load is delivered."""
    from sqlalchemy import text

    from app.core.db import new_session
    from app.core.storage import get_storage
    with new_session() as db:
        found = db.execute(text("SELECT organization_id, load_id FROM public_tracking_link(:t)"), {"t": token}).first()
    if found is None:
        raise NotFound("This tracking link isn’t active")
    with new_session(org_id=found[0]) as db:
        load, link = db.get(Load, found[1]), _link(db, found[1])
        if load is None or link is None or not link.show_pod or load.status not in rules.DELIVERED:
            raise NotFound("No proof of delivery to show")
        docs = [d for d in service.pod_documents(db, load.id) if d.review_status != "rejected"]
        if not docs:
            raise NotFound("No proof of delivery to show")
        doc = docs[-1]
        return get_storage().get(doc.storage_key), doc.content_type, f"POD-{load.load_number}"


# ---------------------------------------------------------------- invoicing
def create_invoice(db: Session, p: Principal, load_id: uuid.UUID) -> uuid.UUID:
    """Invoice one load: its detention becomes a charge line, then a draft invoice is made with the load on it."""
    from app.modules.finance import schemas as fs
    from app.modules.finance import service as finance
    if not (p.can("invoices.create") and p.can("loads.rates.read")):
        raise Forbidden("Your role does not allow creating invoices")
    load = service.lock_load(db, load_id, p)
    view = detail_parts(db, p, load, datetime.now(UTC))
    blocking = [i for i in view["checklist"] if not i.done]
    if blocking:
        raise Conflict(f"Not ready to invoice: {blocking[0].label.lower()} is still open", code="NOT_READY",
                       details={"open": [i.key for i in blocking]})
    has_detention = db.scalar(select(LoadCharge.id).where(LoadCharge.load_id == load.id,
                                                          LoadCharge.type == "detention").limit(1))
    for line in view["money"].detention_parts if view["money"] and not has_detention else []:
        hours = (Decimal(line.billable_minutes) / 60).quantize(Decimal("0.01"))
        db.add(LoadCharge(organization_id=p.org_id, load_id=load.id, type="detention", quantity=max(hours, Decimal("0.01")),
                          rate=load.detention_rate, amount=line.amount, billable=True, status="approved",
                          description=f"Detention at {line.stop}"[:200]))
    db.flush()
    service.after_charge_change(db, p, load)
    invoice = finance.create_draft(db, p, fs.InvoiceCreate(customer_id=load.customer_id, load_ids=[load.id]))
    audit(db, p, "load.invoice_created", "load", load.id, {"invoice_id": str(invoice.id)})
    return invoice.id


# ---------------------------------------------------------------- reefer
def ingest_reefer(db: Session, p: Principal, body: s.ReeferIn) -> int:
    """Trailer temperatures from a reefer unit or telematics. Each reading is tied to the load the trailer (or
    truck) is hauling at the time."""
    from app.modules.equipment.models import Trailer, Vehicle
    count = 0
    active = {}
    for sample in body.samples:
        if sample.trailer_id is None and sample.vehicle_id is None:
            raise Invalid("Say which trailer or truck the reading is from", field="samples")
        if sample.trailer_id and db.get(Trailer, sample.trailer_id) is None:
            raise Invalid("Trailer not found", field="samples")
        if sample.vehicle_id and db.get(Vehicle, sample.vehicle_id) is None:
            raise Invalid("Truck not found", field="samples")
        key = (sample.trailer_id, sample.vehicle_id)
        if key not in active:
            stmt = select(DispatchAssignment.load_id).where(DispatchAssignment.status == "active")
            stmt = stmt.where(DispatchAssignment.trailer_id == sample.trailer_id) if sample.trailer_id else \
                stmt.where(DispatchAssignment.vehicle_id == sample.vehicle_id)
            active[key] = db.scalar(stmt.limit(1))
        db.add(ReeferReading(organization_id=p.org_id, load_id=active[key], trailer_id=sample.trailer_id,
                             vehicle_id=sample.vehicle_id, recorded_at=sample.recorded_at,
                             temp_f=Decimal(str(round(sample.temp_f, 1)))))
        count += 1
    db.flush()
    return count


def _reefer_state(set_point: float | None, temp: float | None) -> str:
    if set_point is None or temp is None:
        return "no_data"
    off = abs(temp - set_point)
    return "out_of_range" if off > REEFER_BAND else "drifting" if off > REEFER_DRIFT else "in_range"


def reefer_out(db: Session, load: Load, now: datetime) -> s.ReeferOut | None:
    if load.equipment_type != "reefer":
        return None
    sp = float(load.reefer_set_point_f) if load.reefer_set_point_f is not None else None
    rows = list(db.scalars(select(ReeferReading).where(ReeferReading.load_id == load.id,
                                                       ReeferReading.recorded_at >= now - timedelta(hours=12))
                           .order_by(ReeferReading.recorded_at)))
    current = float(rows[-1].temp_f) if rows else None
    state = _reefer_state(sp, current)
    words = {"no_data": "No readings yet" if sp is not None else "Set the temperature the load must stay at",
             "in_range": "In range", "drifting": "Drifting toward the edge of the range",
             "out_of_range": "Out of range"}
    text = words[state]
    if current is not None and sp is not None:
        text = f"{current:.1f}°F against {sp:.0f}°F set point · {text.lower()}"
    return s.ReeferOut(set_point_f=sp, low_f=sp - REEFER_BAND if sp is not None else None,
                       high_f=sp + REEFER_BAND if sp is not None else None, current_f=current, state=state, text=text,
                       readings=[s.ReeferPoint(at=r.recorded_at, temp_f=float(r.temp_f)) for r in rows[-200:]])


# ---------------------------------------------------------------- check calls
def check_call_state(db: Session, load: Load, now: datetime) -> s.CheckCallState:
    last = db.scalar(select(TrackingEvent.occurred_at).where(TrackingEvent.load_id == load.id,
                                                             TrackingEvent.kind == "check_call")
                     .order_by(TrackingEvent.occurred_at.desc()).limit(1))
    hours = load.checkcall_reminder_hours
    since = int((now - last).total_seconds() // 60) if last else None
    moving = load.status in service.ROLLING
    started = _rolling_since(db, load) if moving else None
    quiet_from = last or started
    overdue = bool(moving and hours and quiet_from and now - quiet_from > timedelta(hours=hours))
    if overdue:
        text = f"No check call in {rules._dur(int((now - quiet_from).total_seconds() // 60))}"
    elif last:
        text = f"Last check call {rules._dur(since)} ago"
    else:
        text = "No check calls yet"
    return s.CheckCallState(reminder_hours=hours, last_at=last, minutes_since=since, overdue=overdue, text=text)


def _rolling_since(db: Session, load: Load) -> datetime | None:
    return db.scalar(select(LoadStatusEvent.created_at).where(LoadStatusEvent.load_id == load.id,
                                                              LoadStatusEvent.action == "dispatch")
                     .order_by(LoadStatusEvent.created_at.desc()).limit(1))


# ---------------------------------------------------------------- repeats
def next_dates(days: list[int] | None, until: date | None, after: date, n: int = 3) -> list[date]:
    """The next pickup days of a weekly repeat, after `after`."""
    if not days:
        return []
    out, d = [], after + timedelta(days=1)
    while len(out) < n and (until is None or d <= until) and d <= after + timedelta(days=370):
        if d.weekday() in days:
            out.append(d)
        d += timedelta(days=1)
    return out


def recurrence_out(load: Load, today: date) -> s.RecurrenceOut | None:
    if not load.recurrence_days and load.recurrence_parent_id is None:
        return None
    return s.RecurrenceOut(days=list(load.recurrence_days or []), until=load.recurrence_until,
                           parent_id=load.recurrence_parent_id,
                           next_dates=next_dates(load.recurrence_days, load.recurrence_until, today))


# ---------------------------------------------------------------- the detail page's panels
def detail_parts(db: Session, p: Principal, load: Load, now: datetime) -> dict:
    """Money, the ready-to-invoice checklist, the tracking link, check calls, reefer, repeat and activity."""
    from app.modules.loads.activity import feed
    rates = p.can("loads.rates.read")
    out: dict = {"money": None, "checklist": [], "ready_to_invoice": False}
    if rates:
        costs = service.costs_of(db, p.org_id)
        charges = list(db.scalars(select(LoadCharge).where(LoadCharge.load_id == load.id)))
        dwell = service._dwell(db, [load.id], now)[load.id]
        m = service._money_of(load, dwell, costs, [rules.Charge(c.status, c.billable, c.amount)
                                                   for c in charges if not c.managed])
        out["money"] = m
        papers = service._list_extras(db, [load], now)[load.id]["papers"]
        terms = db.scalar(select(Customer.payment_terms_days).where(Customer.id == load.customer_id))
        items = rules.checklist(load.status, papers.model_dump(), m.pending, terms,
                                load.invoice_id is not None or load.billing_status != "unbilled")
        out["checklist"] = items
        out["ready_to_invoice"] = rules.ready(items)
    out["tracking_link"] = link_out(db, load, _link(db, load.id))
    out["check_calls"] = check_call_state(db, load, now)
    out["reefer"] = reefer_out(db, load, now)
    out["recurrence"] = recurrence_out(load, p.today())
    out["activity"] = [s.ActivityOut(id=a.id, kind=a.kind, text=a.text, tone=a.tone, actor_name=a.actor_name, at=a.at)
                       for a in feed(db, p, load.id)]
    return out


def money_out(m: rules.Money, load: Load, costs: rules.Costs) -> s.MoneyBreakdown:
    return s.MoneyBreakdown(
        line_haul=m.line_haul, fuel_pct=m.fuel_pct, fuel=m.fuel, detention=m.detention,
        detention_lines=[s.DetentionLine(stop=d.stop, dwell_minutes=d.dwell_minutes, billable_minutes=d.billable_minutes,
                                         amount=d.amount, explain=d.explain(load.detention_free_hours, load.detention_rate))
                         for d in m.detention_parts],
        detention_free_hours=load.detention_free_hours, detention_rate=load.detention_rate, charges=m.charges,
        pending_charges=m.pending, total=m.total, miles=m.miles, rate_per_mile=m.rate_per_mile, driver_pay=m.driver_pay,
        fuel_cost=m.fuel_cost, overhead=m.overhead, margin=m.margin, margin_pct=m.margin_pct, warning=m.warning,
        costs={"driver_pay_per_mile": costs.driver_pay_per_mile, "mpg": costs.mpg, "fuel_price": costs.fuel_price,
               "overhead_per_mile": costs.overhead_per_mile})


# ---------------------------------------------------------------- jobs (run by scripts/run_task_reminders.py)
def run_jobs(db: Session, p: Principal, now: datetime | None = None) -> int:
    """Make the repeat drafts that are due, flag loads with no check call for too long, and alert on reefers out of
    range. Safe to run as often as wanted: each thing is done once."""
    now = now or datetime.now(UTC)
    return make_repeats(db, p, now) + flag_quiet_loads(db, p, now) + alert_reefers(db, p, now)


def make_repeats(db: Session, p: Principal, now: datetime) -> int:
    """Drafts for each repeat pickup day in the next two weeks, without a driver or a rate."""
    zone = ZoneInfo(p.timezone)
    today = now.astimezone(zone).date()
    made = 0
    for src in db.scalars(select(Load).where(Load.recurrence_days.is_not(None), Load.status != "cancelled")):
        first = service.stops_of(db, src.id)
        start = (first[0].appt_start or first[0].appt_end) if first else None
        if start is None:
            continue
        origin = start.astimezone(zone).date()
        have = {x.pickup_at.astimezone(zone).date() for x in db.scalars(
            select(Load).where(Load.recurrence_parent_id == src.id)) if x.pickup_at}
        for day in next_dates(src.recurrence_days, src.recurrence_until, max(origin, today - timedelta(days=1)),
                              n=REPEAT_AHEAD_DAYS):
            if day > today + timedelta(days=REPEAT_AHEAD_DAYS) or day in have:
                continue
            duplicate(db, p, src.id, shift_days=(day - origin).days, parent=src)
            made += 1
    return made


def flag_quiet_loads(db: Session, p: Principal, now: datetime) -> int:
    """A task for whoever dispatched a moving load that has gone too long without a check call."""
    from app.modules.tasks.models import Task
    from app.modules.tasks.service import _notify
    flagged = 0
    for load in db.scalars(select(Load).where(Load.status.in_(service.ROLLING),
                                              Load.checkcall_reminder_hours.is_not(None))):
        state = check_call_state(db, load, now)
        if not state.overdue:
            continue
        key = f"checkcall:{load.id}"
        if db.scalar(select(Task.id).where(Task.source_key == key, Task.status == "open")):
            continue
        assignment = service.active_assignment(db, load.id)
        owner = (assignment.assigned_by if assignment else None) or load.created_by
        task = Task(organization_id=p.org_id, title=f"Check call due on {load.load_number}"[:200],
                    detail=f"{state.text}. Call the driver and log where the truck is."[:300], assignee_user_id=owner,
                    created_by=None, due_at=now, priority="high", source="reminder", source_key=key,
                    entity_type="load", entity_id=load.id, entity_label=load.load_number, action="Open",
                    why=f"The check-call reminder is every {load.checkcall_reminder_hours} h")
        db.add(task)
        db.flush()
        _notify(db, p, task, owner)
        audit(db, p, "load.check_call_overdue", "load", load.id, {"text": state.text})
        flagged += 1
    return flagged


def alert_reefers(db: Session, p: Principal, now: datetime) -> int:
    """When a reefer has been out of range for 15 minutes, tell dispatch (a task) and the driver, once."""
    from app.modules.messaging import service as messaging
    from app.modules.tasks.models import Task
    alerted = 0
    for load in db.scalars(select(Load).where(Load.status.in_(service.ROLLING), Load.equipment_type == "reefer",
                                              Load.reefer_set_point_f.is_not(None))):
        sp = float(load.reefer_set_point_f)
        rows = list(db.scalars(select(ReeferReading).where(
            ReeferReading.load_id == load.id, ReeferReading.recorded_at >= now - REEFER_ALERT_AFTER - timedelta(
                minutes=30)).order_by(ReeferReading.recorded_at)))
        if not rows or _reefer_state(sp, float(rows[-1].temp_f)) != "out_of_range":
            continue
        # Out of range since the last reading that wasn't.
        since = rows[-1].recorded_at
        for r in reversed(rows):
            if _reefer_state(sp, float(r.temp_f)) != "out_of_range":
                break
            since = r.recorded_at
        if rows[-1].recorded_at - since < REEFER_ALERT_AFTER:
            continue
        key = f"reefer:{load.id}"
        if db.scalar(select(Task.id).where(Task.source_key == key, Task.status == "open")):
            continue
        temp = float(rows[-1].temp_f)
        line = f"Reefer at {temp:.1f}°F on {load.load_number}, set point {sp:.0f}°F, out of range for 15+ min"
        assignment = service.active_assignment(db, load.id)
        owner = (assignment.assigned_by if assignment else None) or load.created_by
        db.add(Task(organization_id=p.org_id, title=f"Reefer out of range on {load.load_number}", detail=line[:300],
                    assignee_user_id=owner, due_at=now, priority="high", source="reminder", source_key=key,
                    entity_type="load", entity_id=load.id, entity_label=load.load_number, action="Open",
                    why="The trailer has been outside the ±2°F range for 15 minutes"))
        if assignment is not None:
            messaging.tell_driver(db, p.org_id, assignment.driver_id, event="reefer_alert",
                                  title=f"Check the reefer on {load.load_number}",
                                  body=f"The trailer reads {temp:.1f}°F; it should be {sp:.0f}°F. Check the unit and "
                                       "call dispatch.", load_id=load.id)
        audit(db, p, "load.reefer_alert", "load", load.id, {"temp_f": temp, "set_point_f": sp})
        alerted += 1
    return alerted

