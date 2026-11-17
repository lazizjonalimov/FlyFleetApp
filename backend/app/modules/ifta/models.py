import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

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
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TenantScoped


class IftaRate(Base, IdMixin, TenantScoped):
    """A jurisdiction's fuel tax rate for a quarter, from the IFTA, Inc. tax matrix. Kept per quarter so a return
    keeps the rates it was worked out with."""
    __tablename__ = "ifta_rates"
    quarter: Mapped[str] = mapped_column(String(6))  # 2026Q4
    jurisdiction: Mapped[str] = mapped_column(String(2))
    fuel_type: Mapped[str] = mapped_column(String(10), default="diesel", server_default="diesel")
    rate: Mapped[Decimal] = mapped_column(Numeric(8, 4))
    # Some jurisdictions add a surcharge on every taxable gallon, with no credit for fuel bought there.
    surcharge: Mapped[Decimal] = mapped_column(Numeric(8, 4), default=Decimal("0"), server_default="0")
    source: Mapped[str] = mapped_column(String(10), default="manual", server_default="manual")
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("organization_id", "quarter", "jurisdiction", "fuel_type", name="uq_ifta_rates_quarter"),
        CheckConstraint("rate >= 0 AND surcharge >= 0", name="rate_nonneg"),
        CheckConstraint("quarter ~ '^[0-9]{4}Q[1-4]$'", name="quarter_valid"),
    )


class IftaTrip(Base, IdMixin, TenantScoped):
    """Miles a truck ran, split by jurisdiction: from GPS, imported from a file, or entered by hand for a truck
    without GPS (marked manual on the return)."""
    __tablename__ = "ifta_trips"
    vehicle_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    trip_date: Mapped[date] = mapped_column(Date)
    load_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    source: Mapped[str] = mapped_column(String(10))  # gps | import | manual
    odometer_start: Mapped[int | None] = mapped_column(Integer)
    odometer_end: Mapped[int | None] = mapped_column(Integer)
    # Imported miles can be held for review; a return can't be approved while any are held.
    held: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    note: Mapped[str | None] = mapped_column(String(300))
    import_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("source IN ('gps', 'import', 'manual')", name="source_valid"),
        CheckConstraint("odometer_end IS NULL OR odometer_start IS NULL OR odometer_end >= odometer_start",
                        name="odometer_order"),
        ForeignKeyConstraint(["organization_id", "vehicle_id"], ["vehicles.organization_id", "vehicles.id"],
                             name="fk_ifta_trips_vehicle", ondelete="CASCADE"),
        UniqueConstraint("organization_id", "id"),
        Index("ix_ifta_trips_org_date", "organization_id", "trip_date"),
    )


class IftaTripMiles(Base, IdMixin, TenantScoped):
    __tablename__ = "ifta_trip_miles"
    trip_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    jurisdiction: Mapped[str] = mapped_column(String(2))
    miles: Mapped[Decimal] = mapped_column(Numeric(10, 1))

    __table_args__ = (
        CheckConstraint("miles >= 0", name="miles_nonneg"),
        ForeignKeyConstraint(["organization_id", "trip_id"], ["ifta_trips.organization_id", "ifta_trips.id"],
                             name="fk_ifta_trip_miles_trip", ondelete="CASCADE"),
        Index("ix_ifta_trip_miles_org_trip", "organization_id", "trip_id"),
    )


class IftaReturn(Base, IdMixin, TenantScoped):
    """A quarter's fuel tax return: worked out live while miles and fuel are collected, then reviewed, approved
    (the lines are fixed with the rates used), filed with the base jurisdiction, and paid or carried as a credit."""
    __tablename__ = "ifta_returns"
    quarter: Mapped[str] = mapped_column(String(6))
    status: Mapped[str] = mapped_column(String(12), default="collecting", server_default="collecting")
    base_jurisdiction: Mapped[str | None] = mapped_column(String(2))
    lines: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    total_miles: Mapped[Decimal | None] = mapped_column(Numeric(12, 1))
    total_gallons: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    net_tax: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    filed_on: Mapped[date | None] = mapped_column(Date)
    filed_reference: Mapped[str | None] = mapped_column(String(80))
    paid_on: Mapped[date | None] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")

    __table_args__ = (
        UniqueConstraint("organization_id", "quarter", name="uq_ifta_returns_quarter"),
        CheckConstraint("status IN ('collecting', 'in_review', 'approved', 'filed', 'paid')", name="status_valid"),
    )
