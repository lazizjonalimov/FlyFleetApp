import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.core.db import Base, IdMixin, TenantScoped, TimestampMixin

EQUIPMENT_TYPES = ("dry_van", "reefer", "flatbed", "step_deck", "box_truck", "tanker", "other")
EQUIPMENT_SQL = str(EQUIPMENT_TYPES)
# Stored status. "Assigned" and "available" are worked out from current assignments, never stored.
STATUSES = ("active", "in_maintenance", "out_of_service", "retired", "transferred")
OWNERSHIP = ("owned", "leased", "owner_operator")


class Vehicle(Base, IdMixin, TenantScoped, TimestampMixin):
    """Power unit (truck or tractor)."""
    __tablename__ = "vehicles"
    unit_number: Mapped[str] = mapped_column(String(40))
    vin: Mapped[str | None] = mapped_column(String(25))
    plate: Mapped[str | None] = mapped_column(String(20))
    plate_state: Mapped[str | None] = mapped_column(String(2))
    make: Mapped[str | None] = mapped_column(String(60))
    model: Mapped[str | None] = mapped_column(String(60))
    year: Mapped[int | None] = mapped_column(Integer)
    # e.g. "Sleeper", "Day cab", as on the registration's body type.
    body: Mapped[str | None] = mapped_column(String(40))
    gvwr: Mapped[int | None] = mapped_column(Integer)
    # The registered owner's name as printed on the registration.
    registered_owner: Mapped[str | None] = mapped_column(String(200))
    # The telematics provider's device or vehicle id, so positions map to this truck.
    telematics_device: Mapped[str | None] = mapped_column(String(80))
    engine: Mapped[str | None] = mapped_column(String(80))
    transmission: Mapped[str | None] = mapped_column(String(80))
    fuel_capacity_gal: Mapped[int | None] = mapped_column(Integer)
    ownership: Mapped[str] = mapped_column(String(20), default="owned", server_default="owned")
    terminal_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    odometer: Mapped[int | None] = mapped_column(Integer)
    insurance_expiry: Mapped[date | None] = mapped_column(Date)
    registration_expiry: Mapped[date | None] = mapped_column(Date)
    inspection_expiry: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active")
    notes: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (
        UniqueConstraint("organization_id", "id"),
        UniqueConstraint("organization_id", "unit_number"),
        ForeignKeyConstraint(["organization_id", "terminal_id"], ["terminals.organization_id", "terminals.id"],
                             name="fk_vehicles_terminal"),
        Index("ix_vehicles_org_created", "organization_id", "created_at", "id"),
        CheckConstraint("status IN " + str(STATUSES), name="status_valid"),
        CheckConstraint("ownership IN " + str(OWNERSHIP), name="ownership_valid"),
        CheckConstraint("odometer IS NULL OR odometer >= 0", name="odometer_nonneg"),
        CheckConstraint("gvwr IS NULL OR gvwr > 0", name="gvwr_pos"),
        CheckConstraint("fuel_capacity_gal IS NULL OR fuel_capacity_gal > 0", name="tank_pos"),
    )


class Trailer(Base, IdMixin, TenantScoped, TimestampMixin):
    __tablename__ = "trailers"
    unit_number: Mapped[str] = mapped_column(String(40))
    type: Mapped[str] = mapped_column(String(20), default="dry_van", server_default="dry_van")
    # When the type is "other": what it is, as the company calls it (an end dump, a lowboy).
    type_other: Mapped[str | None] = mapped_column(String(40))
    vin: Mapped[str | None] = mapped_column(String(25))
    plate: Mapped[str | None] = mapped_column(String(20))
    plate_state: Mapped[str | None] = mapped_column(String(2))
    make: Mapped[str | None] = mapped_column(String(60))
    model: Mapped[str | None] = mapped_column(String(60))
    year: Mapped[int | None] = mapped_column(Integer)
    # A tracker's asset tag, so the trailer shows on the map.
    tracker: Mapped[str | None] = mapped_column(String(80))
    length_ft: Mapped[int | None] = mapped_column(Integer)
    ownership: Mapped[str] = mapped_column(String(20), default="owned", server_default="owned")
    terminal_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    insurance_expiry: Mapped[date | None] = mapped_column(Date)
    registration_expiry: Mapped[date | None] = mapped_column(Date)
    inspection_expiry: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active")
    notes: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (
        UniqueConstraint("organization_id", "id"),
        UniqueConstraint("organization_id", "unit_number"),
        ForeignKeyConstraint(["organization_id", "terminal_id"], ["terminals.organization_id", "terminals.id"],
                             name="fk_trailers_terminal"),
        Index("ix_trailers_org_created", "organization_id", "created_at", "id"),
        CheckConstraint("type IN " + EQUIPMENT_SQL, name="type_valid"),
        CheckConstraint("status IN " + str(STATUSES), name="status_valid"),
        CheckConstraint("ownership IN " + str(OWNERSHIP), name="ownership_valid"),
    )


class UnitTransfer(Base, IdMixin, TenantScoped):
    """One side of a move between two companies of an account: 'out' in the company the unit left (where it stays
    as "transferred"), 'in' in the company that received a new record of it. Nothing financial moves."""
    __tablename__ = "unit_transfers"
    direction: Mapped[str] = mapped_column(String(3))
    kind: Mapped[str] = mapped_column(String(7))
    unit_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    unit_number: Mapped[str] = mapped_column(String(40))
    vin: Mapped[str | None] = mapped_column(String(25))
    other_organization_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    other_organization_name: Mapped[str] = mapped_column(String(160))
    other_unit_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    effective_on: Mapped[date] = mapped_column(Date)
    performed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    details: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        Index("ix_unit_transfers_org_unit", "organization_id", "unit_id"),
        CheckConstraint("direction IN ('out', 'in')", name="direction_valid"),
        CheckConstraint("kind IN ('vehicle', 'trailer')", name="kind_valid"),
    )
