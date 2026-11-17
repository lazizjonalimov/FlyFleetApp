"""What needs a person, one row per thing.

Operations roles get the open fleet alerts they work on; finance roles get the paperwork and money waiting on
someone. Each row says what it is, which record, when it started and the one thing to do about it, so the
dashboard can act on it in place.
"""
import uuid
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import scope as team_scope
from app.core.deps import Principal
from app.core.money import money
from app.modules.customers.models import Customer
from app.modules.dispatch.models import DispatchAssignment
from app.modules.documents.models import Document, DocumentLink
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.finance.models import Invoice, Payment, PaymentAllocation
from app.modules.loads.models import Load, LoadStop
from app.modules.maintenance.models import Inspection, InspectionDefect
from app.modules.settlements.models import DriverSettlement
from app.modules.tracking import incidents
from app.modules.tracking.incidents import clock, duration
from app.modules.tracking.models import Incident

Tone = Literal["bad", "warn", "info", "late"]
Action = Literal["review", "acknowledge", "assign", "request_pod", "check", "follow_up", "open", "view"]


class AttentionItem(BaseModel):
    key: str
    kind: str
    tag: str
    tone: Tone
    title: str
    ref: str | None
    ref_code: bool
    detail: str
    at: datetime
    action: Action
    action_label: str
    incident_id: uuid.UUID | None = None
    incident_version: int | None = None
    load_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    trailer_id: uuid.UUID | None = None
    driver_id: uuid.UUID | None = None
    # A record the action opens when it isn't a load, truck or driver: an inspection, work order, invoice,
    # statement or customer.
    target_type: str | None = None
    target_id: uuid.UUID | None = None


class AttentionOut(BaseModel):
    view: Literal["operations", "billing"]
    total: int
    items: list[AttentionItem]


# The order the dashboard lists them in: what is about to go wrong on the road first.
ORDER = {"late": 0, "at_risk": 0, "speeding": 1, "yard_speed": 1, "unassigned": 2, "pod_missing": 3, "inspection": 4,
         "out_of_service": 4, "gps_stale": 5, "documents": 6, "dwell": 7,
         "pod_review": 0, "invoice_overdue": 2, "statement": 3, "credit": 4}
SEVERITY = {"high": 0, "medium": 1, "low": 2}
ARTICLE = {"roadside": "a roadside", "annual": "an annual", "pre_trip": "a pre-trip", "post_trip": "a post-trip"}


def billing_view(p: Principal) -> bool:
    """Finance roles that don't run the road see the billing overview instead of operations."""
    return p.can("invoices.read") and not p.can("dispatch.read") and not p.can("tracking.read")


def _day_word(p: Principal, at: datetime) -> str:
    local = at.astimezone(ZoneInfo(p.timezone or "UTC")).date()
    days = (local - p.today()).days
    return "today" if days == 0 else "tomorrow" if days == 1 else "yesterday" if days == -1 else f"on {local:%b} {local.day}"


def _where(name: str | None, city: str | None) -> str:
    return ", ".join(x for x in (name, city) if x) or "the stop"


def _asked(times: int) -> str:
    return f"driver asked {'once' if times == 1 else 'twice' if times == 2 else f'{times} times'}"


def _pod_requests(load: Load | None, row: Incident | None = None) -> int:
    data = (row.data if row is not None else None) or {}
    return int(data.get("pod_requests", 0))


# ---------------------------------------------------------------- operations: the open fleet alerts
def _operations(db: Session, p: Principal) -> list[AttentionItem]:
    if not p.can("incidents.read"):
        return []
    incidents.sync(db, p)
    driver_name = func.concat(Driver.first_name, " ", Driver.last_name)
    stmt = (select(Incident, Vehicle.unit_number, driver_name, Load, Customer.name)
            .outerjoin(Vehicle, Vehicle.id == Incident.vehicle_id)
            .outerjoin(Driver, Driver.id == Incident.driver_id)
            .outerjoin(Load, Load.id == Incident.load_id)
            .outerjoin(Customer, Customer.id == Load.customer_id)
            .where(Incident.state.not_in(("resolved", "watching"))))
    rows = db.execute(incidents.visible(stmt, p).order_by(Incident.detected_at.desc()).limit(300)).all()
    stop_ids = []
    for row, *_ in rows:
        if row.kind in ("at_risk", "late") and row.episode_key.count(":") == 2 and not row.episode_key.endswith(":pickup"):
            stop_ids.append(row.episode_key.rsplit(":", 1)[1])
    stops = {str(s.id): s for s in db.scalars(select(LoadStop).where(LoadStop.id.in_(
        [uuid.UUID(x) for x in stop_ids if _uuid(x)])))} if stop_ids else {}
    trailer_units = _trailer_units(db, rows)
    from_inspection = _inspections_behind(db, rows)
    has_driver = _drivers_on(db, [row.load_id for row, *_ in rows if row.kind == "pod_missing" and row.load_id])

    out: list[AttentionItem] = []
    for row, unit, driver, load, customer in rows:
        if row.kind in ("speeding", "yard_speed") and row.state == "acknowledged":
            continue  # someone has it; the alert stays on the alerts screen until resolved
        base = {"incident_id": row.id, "incident_version": row.version, "load_id": row.load_id,
                "vehicle_id": row.vehicle_id, "driver_id": row.driver_id, "at": row.detected_at,
                "key": str(row.id), "kind": row.kind}
        number = load.load_number if load is not None else None
        if row.kind == "at_risk":
            stop = stops.get(row.episode_key.rsplit(":", 1)[1])
            eta = (row.data or {}).get("eta")
            appt = (stop.appt_end or stop.appt_start) if stop is not None else None
            what = "Pickup" if stop is not None and stop.type == "pickup" else "Delivery"
            detail = _where(stop.name if stop else None, stop.city if stop else None)
            if eta and appt:
                detail += f" · ETA {clock(p, datetime.fromisoformat(eta))} vs appt {clock(p, appt)}"
            out.append(AttentionItem(**base, tag="At risk", tone="bad", title=f"{what} will miss its appointment",
                                     ref=number, ref_code=True, detail=detail, action="review", action_label="Review"))
        elif row.kind == "late":
            out.append(AttentionItem(**base, tag="Late", tone="late", title=row.title, ref=number, ref_code=True,
                                     detail=row.detail or "", action="review", action_label="Review"))
        elif row.kind in ("speeding", "yard_speed"):
            parts = (row.detail or "").split(" · ")
            place = parts[1] if len(parts) > 2 else None
            detail = " · ".join(x for x in (driver, place, f"peak {float(row.peak):.0f} mph" if row.peak is not None else None,
                                            "not acknowledged") if x)
            manage = p.can("incidents.manage")
            out.append(AttentionItem(**base, tag=incidents.LABEL[row.kind], tone="bad" if row.kind == "speeding" else "warn",
                                     title=row.title, ref=unit, ref_code=True, detail=detail,
                                     action="acknowledge" if manage else "view",
                                     action_label="Acknowledge" if manage else "View"))
        elif row.kind == "unassigned":
            detail = _where(customer, load.origin_city if load else None)
            title = "Pickup with no driver"
            if load is not None and load.pickup_at is not None:
                title = f"Pickup {_day_word(p, load.pickup_at)} with no driver"
                left = load.pickup_at - datetime.now(UTC)
                detail += f" · pickup {clock(p, load.pickup_at)}"
                detail += f" (in {duration(left)})" if left.total_seconds() > 0 else ""
            assign = p.can("dispatch.assign")
            out.append(AttentionItem(**base, tag="Unassigned", tone="warn", title=title, ref=number, ref_code=True,
                                     detail=detail, action="assign" if assign else "review",
                                     action_label="Assign" if assign else "Review"))
        elif row.kind == "pod_missing":
            asked = _pod_requests(load, row)
            detail = _where(customer, load.destination_city if load else None) + " · invoicing blocked until received"
            if asked:
                detail += f" · {_asked(asked)}"
            can_ask = (p.can("loads.update") or p.can("loads.close")) and row.load_id in has_driver
            out.append(AttentionItem(**base, tag="POD missing", tone="bad", title=row.title, ref=number, ref_code=True,
                                     detail=detail, action="request_pod" if can_ask else "review",
                                     action_label="Request POD" if can_ask else "Review"))
        elif row.kind == "out_of_service":
            trailer_id = (row.data or {}).get("trailer_id")
            ref = unit or trailer_units.get(trailer_id)
            found = from_inspection.get(row.id)
            if found is not None:
                inspection, defects, inspected_driver = found
                word = "Trailer" if inspection.trailer_id else "Truck"
                detail = " · ".join(x for x in (
                    inspection.location, f"{defects} violation{'s' if defects != 1 else ''}" if defects else None,
                    f"{inspected_driver}’s report" if inspected_driver else None) if x)
                out.append(AttentionItem(**{**base, "kind": "inspection"}, tag="Inspection", tone="bad",
                                         title=f"{word} put out of service at {ARTICLE.get(inspection.kind, 'an')} inspection",
                                         ref=ref, ref_code=True, detail=detail, action="review", action_label="Review",
                                         trailer_id=uuid.UUID(trailer_id) if trailer_id else None,
                                         target_type="inspection", target_id=inspection.id))
            else:
                wo = (row.data or {}).get("work_order_id")
                out.append(AttentionItem(**base, tag="Out of service", tone="bad", title=row.title, ref=ref, ref_code=True,
                                         detail=row.detail or "", action="open", action_label="Open",
                                         trailer_id=uuid.UUID(trailer_id) if trailer_id else None,
                                         target_type="work_order" if wo else None, target_id=uuid.UUID(wo) if wo else None))
        elif row.kind == "gps_stale":
            seen = (row.detail or "").removeprefix("Last seen ")
            detail = " · ".join(x for x in (driver, f"last seen {seen}" if seen else None) if x)
            out.append(AttentionItem(**base, tag="GPS stale", tone="warn", title=row.title, ref=unit, ref_code=True,
                                     detail=detail, action="check", action_label="Check"))
        elif row.kind == "documents":
            data = row.data or {}
            label, _, expired = (row.detail or "").rpartition(" · ")
            kind = data.get("entity_type")
            out.append(AttentionItem(**base, tag="Expired", tone="bad", title=row.title, ref=label or None,
                                     ref_code=kind in ("vehicle", "trailer"),
                                     detail=f"Can’t be dispatched until renewed · expired {expired}" if expired else
                                     "Can’t be dispatched until renewed",
                                     action="review", action_label="Review",
                                     trailer_id=uuid.UUID(data["entity_id"]) if kind == "trailer" else None))
        elif row.kind == "dwell":
            out.append(AttentionItem(**base, tag="Dwell", tone="info", title=row.title, ref=unit or number, ref_code=True,
                                     detail=row.detail or "", action="open", action_label="Open"))
    sev = {r.id: SEVERITY.get(r.severity, 2) for r, *_ in rows}
    out.sort(key=lambda i: (ORDER.get(i.kind, 9), sev.get(i.incident_id, 2), -i.at.timestamp()))
    return out


def _uuid(text: str) -> bool:
    try:
        uuid.UUID(text)
        return True
    except ValueError:
        return False


def _trailer_units(db: Session, rows) -> dict[str, str]:
    ids = {(r.data or {}).get("trailer_id") for r, *_ in rows if r.kind in ("out_of_service", "documents")}
    ids |= {(r.data or {}).get("entity_id") for r, *_ in rows if r.kind == "documents"
            and (r.data or {}).get("entity_type") == "trailer"}
    ids = [uuid.UUID(x) for x in ids if x and _uuid(x)]
    if not ids:
        return {}
    return {str(i): u for i, u in db.execute(select(Trailer.id, Trailer.unit_number).where(Trailer.id.in_(ids))).all()}


def _inspections_behind(db: Session, rows) -> dict[uuid.UUID, tuple[Inspection, int, str | None]]:
    """For each out-of-service alert that an inspection caused: that inspection, how many violations it found and
    the driver it was recorded with."""
    out: dict[uuid.UUID, tuple[Inspection, int, str | None]] = {}
    for row, *_ in rows:
        if row.kind != "out_of_service":
            continue
        data = row.data or {}
        inspection = None
        if data.get("work_order_id"):
            inspection = db.scalar(select(Inspection).join(InspectionDefect, InspectionDefect.inspection_id == Inspection.id)
                                   .where(InspectionDefect.work_order_id == uuid.UUID(data["work_order_id"])).limit(1))
        else:
            unit = row.vehicle_id or (uuid.UUID(data["trailer_id"]) if data.get("trailer_id") else None)
            if unit is not None:
                column = Inspection.vehicle_id if row.vehicle_id else Inspection.trailer_id
                inspection = db.scalar(select(Inspection).where(column == unit, Inspection.result == "out_of_service")
                                       .order_by(Inspection.inspected_on.desc(), Inspection.created_at.desc()).limit(1))
                # Only when the unit went out of service because of it, not an older inspection.
                if inspection is not None and inspection.created_at < row.detected_at - timedelta(days=1):
                    inspection = None
        if inspection is None:
            continue
        defects = db.scalar(select(func.count()).select_from(InspectionDefect)
                            .where(InspectionDefect.inspection_id == inspection.id)) or 0
        name = None
        if inspection.driver_id:
            d = db.get(Driver, inspection.driver_id)
            name = f"{d.first_name} {d.last_name}" if d else None
        out[row.id] = (inspection, defects, name)
    return out


def _drivers_on(db: Session, load_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    """The loads with a driver to ask: whoever hauled them."""
    if not load_ids:
        return set()
    return set(db.scalars(select(DispatchAssignment.load_id).where(DispatchAssignment.load_id.in_(load_ids),
                                                                  DispatchAssignment.status.in_(("active", "completed")))))


# ---------------------------------------------------------------- billing: paperwork and money waiting on someone
def _billing(db: Session, p: Principal) -> list[AttentionItem]:
    out: list[AttentionItem] = []
    zone = ZoneInfo(p.timezone or "UTC")
    if p.can("loads.read"):
        # Proof of delivery uploaded and waiting for review.
        rows = db.execute(team_scope.where(
            select(Load, Customer.name).join(Customer, Customer.id == Load.customer_id).where(Load.status == "pod_review"),
            team_scope.loads(p.scope)).order_by(Load.updated_at).limit(50)).all()
        uploaded = _pod_uploaded(db, [load.id for load, _ in rows])
        for load, customer in rows:
            at = uploaded.get(load.id) or load.updated_at
            out.append(AttentionItem(key=f"pod_review:{load.id}", kind="pod_review", tag="POD review", tone="info",
                                     title="POD uploaded, needs review", ref=load.load_number, ref_code=True,
                                     detail=" · ".join(x for x in (customer, load.destination_city) if x), at=at,
                                     action="review", action_label="Review", load_id=load.id))
        # Delivered without one, which keeps the load from being invoiced.
        rows = db.execute(team_scope.where(
            select(Load, Customer.name).join(Customer, Customer.id == Load.customer_id).where(Load.status == "delivered"),
            team_scope.loads(p.scope)).order_by(Load.delivered_at).limit(50)).all()
        asks = dict(db.execute(select(Incident.load_id, Incident.data).where(
            Incident.kind == "pod_missing", Incident.state != "resolved",
            Incident.load_id.in_([load.id for load, _ in rows]))).all()) if rows else {}
        drivers = _drivers_on(db, [load.id for load, _ in rows])
        for load, customer in rows:
            delivered = load.delivered_at or load.updated_at
            local = delivered.astimezone(zone).date()
            asked = int((asks.get(load.id) or {}).get("pod_requests", 0))
            detail = " · ".join(x for x in (customer, f"delivered {local:%b} {local.day}",
                                            _asked(asked) if asked else None) if x)
            can_ask = (p.can("loads.update") or p.can("loads.close")) and load.id in drivers
            out.append(AttentionItem(key=f"pod_missing:{load.id}", kind="pod_missing", tag="POD missing", tone="bad",
                                     title="Can’t invoice — no POD", ref=load.load_number, ref_code=True, detail=detail,
                                     at=delivered, action="request_pod" if can_ask else "review",
                                     action_label="Request" if can_ask else "Review", load_id=load.id))
    if p.can("invoices.read"):
        today = p.today()
        paid = (select(func.coalesce(func.sum(PaymentAllocation.amount), 0))
                .join(Payment, Payment.id == PaymentAllocation.payment_id)
                .where(PaymentAllocation.invoice_id == Invoice.id, Payment.status == "recorded")
                .correlate(Invoice).scalar_subquery())
        balance = (Invoice.total - paid).label("balance")
        rows = db.execute(select(Invoice, Customer.name, balance).join(Customer, Customer.id == Invoice.customer_id)
                          .where(Invoice.status == "issued", Invoice.due_date < today, Invoice.total - paid > 0)
                          .order_by(Invoice.due_date).limit(50)).all()
        for invoice, customer, owed in rows:
            days = (today - invoice.due_date).days
            out.append(AttentionItem(key=f"invoice:{invoice.id}", kind="invoice_overdue", tag="Overdue", tone="bad",
                                     title=f"Invoice {days} day{'s' if days != 1 else ''} past due",
                                     ref=invoice.invoice_number, ref_code=True,
                                     detail=f"{customer} · {_money(owed, invoice.currency)} open",
                                     at=datetime.combine(invoice.due_date, time(0), zone), action="follow_up",
                                     action_label="Follow up", target_type="invoice", target_id=invoice.id))
        # Customers who owe more than their credit limit: new loads for them need a word with finance.
        owed_by = (select(Invoice.customer_id, func.sum(Invoice.total - paid).label("owed"))
                   .where(Invoice.status == "issued").group_by(Invoice.customer_id).subquery())
        for customer, owed in db.execute(select(Customer, owed_by.c.owed).join(owed_by, owed_by.c.customer_id == Customer.id)
                                          .where(Customer.credit_limit.is_not(None), owed_by.c.owed > Customer.credit_limit)
                                          .limit(20)).all():
            out.append(AttentionItem(key=f"credit:{customer.id}", kind="credit", tag="Credit", tone="warn",
                                     title="Customer over their credit limit", ref=customer.name, ref_code=False,
                                     detail=f"{_money(owed, p.currency)} open · limit {_money(customer.credit_limit, p.currency)}"
                                            " · new loads need approval",
                                     at=customer.updated_at or customer.created_at, action="open", action_label="Open",
                                     target_type="customer", target_id=customer.id))
    if p.can("settlements.read"):
        rows = db.execute(select(DriverSettlement, Driver.first_name, Driver.last_name)
                          .join(Driver, Driver.id == DriverSettlement.driver_id)
                          .where(DriverSettlement.status == "draft").order_by(DriverSettlement.period_end).limit(50)).all()
        for st, first, last in rows:
            period = f"{st.period_start:%b} {st.period_start.day} – {st.period_end:%b} {st.period_end.day}"
            if st.period_start.month == st.period_end.month:
                period = f"{st.period_start:%b} {st.period_start.day} – {st.period_end.day}"
            out.append(AttentionItem(key=f"statement:{st.id}", kind="statement", tag="Approval", tone="warn",
                                     title="Statement waiting for approval", ref=f"{first} {last}", ref_code=False,
                                     detail=f"{period} · net {_money(st.net_pay, st.currency)}", at=st.created_at,
                                     action="review", action_label="Review", driver_id=st.driver_id,
                                     target_type="settlement", target_id=st.id))
    out.sort(key=lambda i: (ORDER.get(i.kind, 9), i.at))
    return out


def _pod_uploaded(db: Session, load_ids: list[uuid.UUID]) -> dict[uuid.UUID, datetime]:
    if not load_ids:
        return {}
    return dict(db.execute(select(DocumentLink.entity_id, func.max(Document.created_at))
                           .join(Document, Document.id == DocumentLink.document_id)
                           .where(DocumentLink.entity_type == "load", DocumentLink.entity_id.in_(load_ids),
                                  Document.type == "pod").group_by(DocumentLink.entity_id)).all())


def _money(amount: Decimal | None, currency: str) -> str:
    value = money(amount or 0)
    return f"${value:,.2f}" if currency == "USD" else f"{currency} {value:,.2f}"


def attention(db: Session, p: Principal, limit: int) -> AttentionOut:
    view = "billing" if billing_view(p) else "operations"
    items = _billing(db, p) if view == "billing" else _operations(db, p)
    return AttentionOut(view=view, total=len(items), items=items[:limit])


def next_hours(p: Principal, hours: int = 4) -> tuple[datetime, datetime]:
    """Now, and the top of the hour about `hours` from now, in the company's time."""
    now = datetime.now(UTC)
    zone = ZoneInfo(p.timezone or "UTC")
    until = (now + timedelta(hours=hours)).astimezone(zone).replace(minute=0, second=0, microsecond=0)
    return now, until


__all__ = ["AttentionItem", "AttentionOut", "attention", "billing_view", "next_hours"]
