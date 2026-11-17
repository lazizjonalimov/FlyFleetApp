"""Owner settlements: what an owner is paid for a week, with a section per unit.

A draft is built from the owner's activity for the period (app/modules/owners/activity.py): their share of each
delivered load on their units under the agreement in force, rental by the mile and by the trailer week, and the
costs their agreements put on them (fuel, the driver pay the carrier ran for them itemized per driver, weekly
chargebacks, repairs) and the escrow deposit. A load, expense or work order is on at most one owner settlement
that isn't void. Approval numbers the settlement and fixes it; the database then refuses any change to it or its
lines. Later corrections are dated adjustments on the next settlement.
"""
import uuid
from collections import defaultdict
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.deps import Principal
from app.core.errors import Conflict, Invalid, NotFound
from app.core.money import money
from app.modules.organizations.models import Organization
from app.modules.owners import activity
from app.modules.owners.models import Owner
from app.modules.settlements.owner_models import OwnerSettlement, OwnerSettlementLine

ZERO = Decimal("0")
DONE = ("delivered", "pod_review", "completed")
COST_KINDS = {"fuel": "fuel", "driver_pay": "driver_pay_run", "repairs": "repairs", "other": "other",
              "insurance": "insurance", "occupational": "occupational", "eld": "eld", "plates": "plates",
              "escrow": "escrow"}


def lock(db: Session, settlement_id: uuid.UUID) -> OwnerSettlement:
    st = db.scalar(select(OwnerSettlement).where(OwnerSettlement.id == settlement_id).with_for_update())
    if st is None:
        raise NotFound("Settlement not found")
    return st


def check_version(st: OwnerSettlement, version: int) -> None:
    if st.version != version:
        raise Conflict("Someone else changed this settlement while you were working. Review the latest figures and "
                       "try again.", code="VERSION_CONFLICT", details={"current_version": st.version, "your_version": version})


def require_draft(st: OwnerSettlement) -> None:
    if st.status != "draft":
        raise Conflict(f"A{'n' if st.status == 'approved' else ''} {st.status} settlement can't be changed",
                       code="SETTLEMENT_NOT_DRAFT")


def _taken(db: Session, st: OwnerSettlement, column) -> set:
    rows = db.scalars(select(column).join(OwnerSettlement, OwnerSettlement.id == OwnerSettlementLine.settlement_id)
                      .where(OwnerSettlement.status != "void", OwnerSettlement.id != st.id, column.is_not(None)))
    return set(rows)


def recalculate(db: Session, p: Principal, st: OwnerSettlement) -> None:
    """Rebuild the draft's lines from its sources; lines entered by hand stay."""
    require_draft(st)
    owner = db.get(Owner, st.owner_id)
    ws = activity.windows(db, owner.id, st.period_start, st.period_end)
    per = activity.period(db, p, owner, st.period_start, st.period_end, hide_customers=True, ws=ws)
    loads_taken = _taken(db, st, OwnerSettlementLine.load_id)
    expenses_taken = _taken(db, st, OwnerSettlementLine.expense_id)
    orders_taken = _taken(db, st, OwnerSettlementLine.work_order_id)
    unit_kind = {w.unit_id: w.kind for w in ws}
    db.execute(delete(OwnerSettlementLine).where(OwnerSettlementLine.settlement_id == st.id,
                                                 OwnerSettlementLine.manual.is_(False)))
    position = 0

    def add(**kw) -> None:
        nonlocal position
        unit = kw.pop("unit_id", None)
        is_trailer = unit is not None and unit_kind.get(unit) == "trailer"
        position += 1
        db.add(OwnerSettlementLine(organization_id=st.organization_id, settlement_id=st.id, position=position,
                                   vehicle_id=None if is_trailer else unit, trailer_id=unit if is_trailer else None, **kw))

    on_settlement: set[uuid.UUID] = set()
    for x in sorted(per.loads, key=lambda r: (r.day, r.load_number)):
        if x.status not in DONE or x.load_id in loads_taken:
            continue
        on_settlement.add(x.load_id)
        lane = " → ".join(v for v in (x.origin, x.destination) if v)
        add(kind="load_share", unit_id=x.unit_id, load_id=x.load_id, description=f"{x.load_number}{f' · {lane}' if lane else ''}",
            detail=f"{x.miles:,} mi" if x.miles else None, load_revenue=x.revenue, carrier_share=x.carrier_share,
            quantity=Decimal("1"), rate=x.owner_gross, amount=x.owner_gross)
    # Driver pay the carrier ran for the owner: one line per driver and unit, with the miles and rate.
    runs: dict[tuple, list[activity.Item]] = defaultdict(list)
    for it in per.items:
        if it.kind == "driver_pay":
            if it.load_id in on_settlement:
                runs[(it.driver_id, it.unit_id)].append(it)
            continue
        if it.expense_id and it.expense_id in expenses_taken:
            continue
        if it.work_order_id and it.work_order_id in orders_taken:
            continue
        if not it.amount:
            continue
        kind = "rental_week" if it.kind == "rental_week" else COST_KINDS.get(it.kind, "other")
        sign = 1 if kind == "rental_week" else -1
        add(kind=kind, unit_id=it.unit_id, expense_id=it.expense_id, work_order_id=it.work_order_id,
            description=it.description or kind.replace("_", " ").capitalize(), detail=it.detail or None,
            quantity=it.quantity if it.quantity > 0 else Decimal("1"), rate=it.rate if it.rate is not None else it.amount,
            amount=money(sign * it.amount))
    for (driver_id, unit_id), items in runs.items():
        total = sum((i.amount for i in items), ZERO)
        miles = sum((i.quantity for i in items), ZERO)
        add(kind="driver_pay_run", unit_id=unit_id, driver_id=driver_id, description=items[0].description.replace(
            "Driver pay · ", "Driver pay run · "), detail=f"{len(items)} load{'s' if len(items) != 1 else ''} · "
            f"{int(miles):,} mi", quantity=miles if miles > 0 else Decimal("1"), rate=items[0].rate or total, amount=-total)
    db.flush()
    totals(db, st)
    st.calculated_at = datetime.now(UTC)


def totals(db: Session, st: OwnerSettlement) -> None:
    lines = list(db.scalars(select(OwnerSettlementLine).where(OwnerSettlementLine.settlement_id == st.id)))
    by = defaultdict(lambda: ZERO)
    for line in lines:
        by[line.kind] += line.amount
    st.load_revenue = sum((line.load_revenue or ZERO for line in lines), ZERO)
    st.carrier_share = sum((line.carrier_share or ZERO for line in lines), ZERO)
    st.owner_gross = by["load_share"] + by["rental_week"] + max(by["adjustment"], ZERO)
    st.fuel = -by["fuel"]
    st.driver_pay_run = -by["driver_pay_run"]
    st.escrow = -by["escrow"]
    st.net = sum((line.amount for line in lines), ZERO)
    st.other_costs = st.owner_gross - st.net - st.fuel - st.driver_pay_run - st.escrow


def create(db: Session, p: Principal, owner_id: uuid.UUID, start: date, end: date, *, final: bool = False,
           notes: str | None = None) -> OwnerSettlement:
    if end < start:
        raise Invalid("The period ends before it starts", field="period_end")
    owner = db.scalar(select(Owner).where(Owner.id == owner_id).with_for_update())
    if owner is None:
        raise Invalid("Owner not found", field="owner_id")
    if owner.status == "onboarding":
        raise Conflict("No settlements until the owner's lease is signed and they are active", code="OWNER_ONBOARDING")
    if db.scalar(select(OwnerSettlement.id).where(OwnerSettlement.owner_id == owner_id, OwnerSettlement.status == "draft")):
        raise Conflict("This owner already has a draft settlement. Finish or void it first.", code="DRAFT_EXISTS")
    if db.scalar(select(OwnerSettlement.id).where(OwnerSettlement.owner_id == owner_id, OwnerSettlement.status != "void",
                                                  OwnerSettlement.period_start == start)):
        raise Conflict("This owner already has a settlement for that week", code="DUPLICATE_PERIOD")
    st = OwnerSettlement(organization_id=p.org_id, owner_id=owner_id, period_start=start, period_end=end, final=final,
                         currency=p.currency, notes=notes, created_by=p.user_id)
    db.add(st)
    db.flush()
    recalculate(db, p, st)
    audit(db, p, "owner_settlement.created", "owner_settlement", st.id,
          {"owner_id": str(owner_id), "period": [start.isoformat(), end.isoformat()], "net": str(st.net)})
    return st


def add_line(db: Session, p: Principal, st: OwnerSettlement, kind: str, description: str, amount: Decimal,
             unit_id: uuid.UUID | None = None) -> None:
    require_draft(st)
    signed = amount if kind == "adjustment" else -abs(amount)
    db.add(OwnerSettlementLine(organization_id=p.org_id, settlement_id=st.id, kind=kind, vehicle_id=unit_id,
                               description=description.strip(), quantity=Decimal("1"), rate=abs(amount), amount=money(signed),
                               manual=True, position=10_000))
    db.flush()
    totals(db, st)
    st.version += 1
    audit(db, p, "owner_settlement.line_added", "owner_settlement", st.id,
          {"kind": kind, "description": description, "amount": str(signed)})


def approve(db: Session, p: Principal, st: OwnerSettlement) -> None:
    require_draft(st)
    recalculate(db, p, st)  # the last look at the sources before the settlement is fixed
    if not db.scalar(select(func.count()).select_from(OwnerSettlementLine).where(OwnerSettlementLine.settlement_id == st.id)):
        raise Conflict("There is nothing to pay on this settlement", code="SETTLEMENT_EMPTY")
    seq = db.execute(update(Organization).where(Organization.id == p.org_id)
                     .values(settlement_seq=Organization.settlement_seq + 1).returning(Organization.settlement_seq)).scalar_one()
    st.number = f"OS-{1000 + seq}"
    st.status, st.approved_by, st.approved_at = "approved", p.user_id, datetime.now(UTC)
    st.version += 1
    audit(db, p, "owner_settlement.approved", "owner_settlement", st.id, {"number": st.number, "net": str(st.net)})


def pay(db: Session, p: Principal, st: OwnerSettlement, paid_on: date, method: str, reference: str | None) -> None:
    if st.status != "approved":
        raise Conflict("Only an approved settlement can be paid", code="SETTLEMENT_NOT_APPROVED")
    st.status, st.paid_on, st.paid_method, st.paid_reference, st.paid_by = "paid", paid_on, method, reference, p.user_id
    st.version += 1
    audit(db, p, "owner_settlement.paid", "owner_settlement", st.id,
          {"paid_on": paid_on.isoformat(), "method": method, "net": str(st.net)})


def void(db: Session, p: Principal, st: OwnerSettlement, reason: str) -> None:
    if st.status in ("paid", "void"):
        raise Conflict(f"A {st.status} settlement can't be voided", code="SETTLEMENT_FINAL")
    st.status, st.voided_at, st.void_reason = "void", datetime.now(UTC), reason.strip()
    st.version += 1
    audit(db, p, "owner_settlement.voided", "owner_settlement", st.id, {"reason": reason.strip()})


def escrow_movements(db: Session, owner_id: uuid.UUID) -> Decimal:
    """Escrow deposited on approved and paid settlements, less refunds (escrow lines paid back)."""
    total = db.scalar(select(func.coalesce(func.sum(OwnerSettlementLine.amount), 0))
                      .join(OwnerSettlement, OwnerSettlement.id == OwnerSettlementLine.settlement_id)
                      .where(OwnerSettlement.owner_id == owner_id, OwnerSettlement.status.in_(("approved", "paid")),
                             OwnerSettlementLine.kind == "escrow"))
    return -Decimal(total or 0)
