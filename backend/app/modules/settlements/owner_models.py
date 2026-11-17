import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.core.db import Base, IdMixin, TenantScoped, TimestampMixin

OWNER_LINE_KINDS = ("load_share", "rental_week", "fuel", "driver_pay_run", "insurance", "occupational", "eld",
                    "plates", "repairs", "other", "escrow", "adjustment")
ZERO = Decimal("0")


class OwnerSettlement(Base, IdMixin, TenantScoped, TimestampMixin):
    """What an owner is paid for a period: their share of the loads their units hauled, less the costs their
    agreements put on them, in a section per unit. draft -> approved -> paid, or void. Approved means fixed:
    later changes are dated adjustments on the next settlement."""
    __tablename__ = "owner_settlements"
    number: Mapped[str | None] = mapped_column(String(30))
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="draft", server_default="draft")
    final: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    currency: Mapped[str] = mapped_column(String(3), default="USD", server_default="USD")
    load_revenue: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=ZERO, server_default="0")
    carrier_share: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=ZERO, server_default="0")
    owner_gross: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=ZERO, server_default="0")
    fuel: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=ZERO, server_default="0")
    driver_pay_run: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=ZERO, server_default="0")
    other_costs: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=ZERO, server_default="0")
    escrow: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=ZERO, server_default="0")
    net: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=ZERO, server_default="0")
    notes: Mapped[str | None] = mapped_column(Text)
    calculated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_on: Mapped[date | None] = mapped_column(Date)
    paid_method: Mapped[str | None] = mapped_column(String(20))
    paid_reference: Mapped[str | None] = mapped_column(String(80))
    paid_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    void_reason: Mapped[str | None] = mapped_column(String(300))
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    __table_args__ = (
        UniqueConstraint("organization_id", "id"),
        UniqueConstraint("organization_id", "number"),
        ForeignKeyConstraint(["organization_id", "owner_id"], ["owners.organization_id", "owners.id"],
                             name="fk_owner_settlements_owner"),
        Index("ix_owner_settlements_org_period", "organization_id", "period_end", "id"),
        Index("ix_owner_settlements_org_owner", "organization_id", "owner_id", "status"),
        # One statement per payee per period, and one draft per owner at a time.
        Index("uq_owner_settlements_period", "organization_id", "owner_id", "period_start", unique=True,
              postgresql_where=text("status <> 'void'")),
        Index("uq_owner_settlements_one_draft", "organization_id", "owner_id", unique=True,
              postgresql_where=text("status = 'draft'")),
        CheckConstraint("status IN ('draft', 'approved', 'paid', 'void')", name="status_valid"),
        CheckConstraint("period_end >= period_start", name="period_valid"),
        CheckConstraint("status = 'draft' OR number IS NOT NULL", name="number_when_approved"),
        CheckConstraint("paid_method IS NULL OR paid_method IN ('ach', 'check', 'direct_deposit', 'cash', 'other')",
                        name="paid_method_valid"),
    )


class OwnerSettlementLine(Base, IdMixin, TenantScoped):
    """One line of an owner settlement, in the section of the unit it belongs to. Amounts are signed: what the
    owner earns is positive, chargebacks and escrow deposits negative. Lines worked out from loads, expenses,
    work orders and agreements are rebuilt on recalculation; lines entered by hand are kept."""
    __tablename__ = "owner_settlement_lines"
    settlement_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    kind: Mapped[str] = mapped_column(String(15))
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    trailer_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    load_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    expense_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    work_order_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    driver_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    description: Mapped[str] = mapped_column(String(300))
    detail: Mapped[str | None] = mapped_column(String(300))
    # For a load: what the customer paid and what the carrier kept, beside the owner's share in `amount`.
    load_revenue: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    carrier_share: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("1"), server_default="1")
    rate: Mapped[Decimal] = mapped_column(Numeric(12, 4))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    manual: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "settlement_id"],
                             ["owner_settlements.organization_id", "owner_settlements.id"],
                             name="fk_owner_settlement_lines_settlement", ondelete="CASCADE"),
        ForeignKeyConstraint(["organization_id", "load_id"], ["loads.organization_id", "loads.id"],
                             name="fk_owner_settlement_lines_load"),
        Index("ix_owner_settlement_lines_org_settlement", "organization_id", "settlement_id"),
        Index("ix_owner_settlement_lines_org_load", "organization_id", "load_id"),
        Index("ix_owner_settlement_lines_org_expense", "organization_id", "expense_id"),
        CheckConstraint("kind IN " + str(OWNER_LINE_KINDS), name="kind_valid"),
        CheckConstraint("quantity > 0", name="quantity_pos"),
    )
