import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.core.crypto import EncryptedText
from app.core.db import Base, IdMixin, TenantScoped, TimestampMixin

OWNER_STATUSES = ("onboarding", "active", "suspended", "ended")
ENTITY_TYPES = ("individual", "business")
BUSINESS_TYPES = ("llc", "corporation", "partnership", "sole_proprietor")
# Terms live on each unit's agreement, never on the person.
AGREEMENT_KINDS = ("owner_operator_lease", "equipment_lease", "fleet_lease", "rental")
FUEL_PAID_BY = ("owner", "carrier")
# carrier: the carrier employs and pays the driver on its own driver statement.
# owner: the owner pays their driver outside FlyFleet.
# carrier_for_owner: the carrier runs the driver's pay and charges it back to the owner, itemized per driver.
# owner_drives: the owner drives the unit and is paid only on their owner settlement.
DRIVER_PAY_BY = ("carrier", "owner", "carrier_for_owner", "owner_drives")
MAINTENANCE_PAID_BY = ("owner", "carrier")

# What an owner's portal users may open. The API checks these on every portal read, export and download.
PORTAL_PERMISSIONS: dict[str, str] = {
    "equipment": "View owned equipment",
    "locations": "View live truck locations",
    "drivers": "View assigned drivers",
    "loads": "View loads",
    "completed": "View completed loads",
    "fuel": "View fuel transactions",
    "expenses": "View expenses",
    "statements": "View financial statements",
    "maintenance": "View maintenance records",
    "documents": "View documents",
    "download": "Download statements",
    "performance": "View performance reports",
}
PORTAL_PRESETS: dict[str, tuple[str, list[str]]] = {
    "full": ("Full owner", list(PORTAL_PERMISSIONS)),
    "monitor": ("Monitor only", ["equipment", "locations", "loads", "completed", "maintenance", "performance"]),
    "bookkeeper": ("Bookkeeper", ["statements", "fuel", "expenses", "documents", "download"]),
}


class Owner(Base, IdMixin, TenantScoped, TimestampMixin):
    """Someone who owns trucks or trailers working for the carrier: a person (individual) or a business.

    Whether an owner is an owner-operator is never typed: it is worked out from who drives the units they own
    today. Ownership, who drives a unit and who employs the driver are separate records with their own dates."""
    __tablename__ = "owners"
    entity_type: Mapped[str] = mapped_column(String(12))
    # individual: the one person who is the owner. business: the contacts in owner_contacts act for it.
    person_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    legal_name: Mapped[str | None] = mapped_column(String(200))
    business_type: Mapped[str | None] = mapped_column(String(20))
    ein: Mapped[str | None] = mapped_column("ein_encrypted", EncryptedText())
    ein_hash: Mapped[str | None] = mapped_column(String(64))
    ein_last4: Mapped[str | None] = mapped_column(String(4))
    dba: Mapped[str | None] = mapped_column(String(200))
    # Where statements and portal invitations go.
    email: Mapped[str | None] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(40))
    street: Mapped[str | None] = mapped_column(String(200))
    city: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(2))
    postal_code: Mapped[str | None] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(12), default="onboarding", server_default="onboarding")
    owner_since: Mapped[date | None] = mapped_column(Date)
    ended_on: Mapped[date | None] = mapped_column(Date)
    end_reason: Mapped[str | None] = mapped_column(String(300))
    # Settlement and payment.
    pay_frequency: Mapped[str] = mapped_column(String(10), default="weekly", server_default="weekly")
    pay_day: Mapped[str] = mapped_column(String(10), default="friday", server_default="friday")
    payment_method: Mapped[str] = mapped_column(String(10), default="ach", server_default="ach")
    bank_name: Mapped[str | None] = mapped_column(String(120))
    routing_number: Mapped[str | None] = mapped_column("routing_number_encrypted", EncryptedText())
    account_number: Mapped[str | None] = mapped_column("account_number_encrypted", EncryptedText())
    account_last4: Mapped[str | None] = mapped_column(String(4))
    ach_authorized: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Escrow: a weekly deposit per truck until the target is reached; interest paid quarterly.
    escrow_weekly: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), server_default="0")
    escrow_target: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"), server_default="0")
    escrow_opening_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"), server_default="0")
    # Owner portal.
    portal_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    portal_permissions: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    notes: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (
        UniqueConstraint("organization_id", "id"),
        ForeignKeyConstraint(["organization_id", "person_id"], ["persons.organization_id", "persons.id"],
                             name="fk_owners_person"),
        Index("uq_owners_person", "organization_id", "person_id", unique=True,
              postgresql_where=text("person_id IS NOT NULL")),
        Index("ix_owners_org_created", "organization_id", "created_at", "id"),
        Index("ix_owners_org_ein", "organization_id", "ein_hash"),
        CheckConstraint("entity_type IN " + str(ENTITY_TYPES), name="entity_valid"),
        CheckConstraint("(entity_type = 'individual' AND person_id IS NOT NULL) OR "
                        "(entity_type = 'business' AND legal_name IS NOT NULL AND person_id IS NULL)",
                        name="entity_shape"),
        CheckConstraint("business_type IS NULL OR business_type IN " + str(BUSINESS_TYPES), name="business_type_valid"),
        CheckConstraint("status IN " + str(OWNER_STATUSES), name="status_valid"),
        CheckConstraint("status <> 'ended' OR ended_on IS NOT NULL", name="ended_has_date"),
        CheckConstraint("pay_frequency IN ('weekly','biweekly')", name="frequency_valid"),
        CheckConstraint("payment_method IN ('ach','check')", name="payment_valid"),
        CheckConstraint("escrow_weekly >= 0 AND escrow_target >= 0", name="escrow_nonneg"),
    )


class OwnerContact(Base, IdMixin, TenantScoped, TimestampMixin):
    """A person who acts for an owner: a business's principal, its bookkeeper. Contacts are persons too."""
    __tablename__ = "owner_contacts"
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    title: Mapped[str | None] = mapped_column(String(80))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Signs the lease and approves settlement disputes.
    signs: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    note: Mapped[str | None] = mapped_column(String(200))
    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "owner_id"], ["owners.organization_id", "owners.id"],
                             name="fk_owner_contacts_owner", ondelete="CASCADE"),
        ForeignKeyConstraint(["organization_id", "person_id"], ["persons.organization_id", "persons.id"],
                             name="fk_owner_contacts_person"),
        UniqueConstraint("organization_id", "owner_id", "person_id"),
        Index("uq_owner_contacts_primary", "organization_id", "owner_id", unique=True,
              postgresql_where=text("is_primary")),
    )


class OwnerAgreement(Base, IdMixin, TenantScoped, TimestampMixin):
    """The terms a unit runs under: how load revenue splits between the carrier and the owner, and who pays
    for fuel, the driver, insurance and repairs. Each ownership row points at one agreement."""
    __tablename__ = "owner_agreements"
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    kind: Mapped[str] = mapped_column(String(24))
    reference: Mapped[str | None] = mapped_column(String(60))
    signed_on: Mapped[date | None] = mapped_column(Date)
    effective_from: Mapped[date] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date)
    # Percentage terms: owner_gross = owner_pct x line haul + fsc_pct x fuel surcharge (+ accessorials).
    owner_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    fsc_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    accessorials_to_owner: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Rental terms: per mile driven and per trailer week.
    per_mile: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    per_trailer_week: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    fuel_paid_by: Mapped[str] = mapped_column(String(10), default="owner", server_default="owner")
    driver_pay_by: Mapped[str] = mapped_column(String(20), default="carrier", server_default="carrier")
    maintenance_paid_by: Mapped[str] = mapped_column(String(10), default="owner", server_default="owner")
    # Fixed weekly chargebacks per unit, each listed in the lease with how it is calculated.
    insurance_weekly: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), server_default="0")
    occupational_weekly: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), server_default="0")
    eld_weekly: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), server_default="0")
    plates_weekly: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), server_default="0")
    document_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    notes: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (
        UniqueConstraint("organization_id", "id"),
        ForeignKeyConstraint(["organization_id", "owner_id"], ["owners.organization_id", "owners.id"],
                             name="fk_owner_agreements_owner", ondelete="CASCADE"),
        ForeignKeyConstraint(["organization_id", "document_id"], ["documents.organization_id", "documents.id"],
                             name="fk_owner_agreements_document", ondelete="SET NULL"),
        Index("ix_owner_agreements_org_owner", "organization_id", "owner_id"),
        CheckConstraint("kind IN " + str(AGREEMENT_KINDS), name="kind_valid"),
        CheckConstraint("fuel_paid_by IN " + str(FUEL_PAID_BY), name="fuel_valid"),
        CheckConstraint("driver_pay_by IN " + str(DRIVER_PAY_BY), name="driver_pay_valid"),
        CheckConstraint("maintenance_paid_by IN " + str(MAINTENANCE_PAID_BY), name="maintenance_valid"),
        CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="dates_valid"),
        CheckConstraint("(kind = 'rental') = (per_mile IS NOT NULL OR per_trailer_week IS NOT NULL)",
                        name="rental_terms"),
        CheckConstraint("kind = 'rental' OR owner_pct IS NOT NULL", name="share_terms"),
        CheckConstraint("owner_pct IS NULL OR (owner_pct >= 0 AND owner_pct <= 100)", name="owner_pct_range"),
        CheckConstraint("fsc_pct IS NULL OR (fsc_pct >= 0 AND fsc_pct <= 100)", name="fsc_pct_range"),
    )


class EquipmentOwnership(Base, IdMixin, TenantScoped, TimestampMixin):
    """Who owns a share of a truck or trailer, from when, under which agreement. owner_id NULL is the carrier
    itself. The open rows of a unit always add up to 100%; a transfer closes rows and opens new ones, with a
    reason, so the history stays. A unit without rows is the carrier's outright."""
    __tablename__ = "equipment_ownerships"
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    trailer_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    share_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    effective_from: Mapped[date] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date)
    agreement_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    reason: Mapped[str | None] = mapped_column(String(300))
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "vehicle_id"], ["vehicles.organization_id", "vehicles.id"],
                             name="fk_equipment_ownerships_vehicle", ondelete="CASCADE"),
        ForeignKeyConstraint(["organization_id", "trailer_id"], ["trailers.organization_id", "trailers.id"],
                             name="fk_equipment_ownerships_trailer", ondelete="CASCADE"),
        ForeignKeyConstraint(["organization_id", "owner_id"], ["owners.organization_id", "owners.id"],
                             name="fk_equipment_ownerships_owner"),
        ForeignKeyConstraint(["organization_id", "agreement_id"], ["owner_agreements.organization_id", "owner_agreements.id"],
                             name="fk_equipment_ownerships_agreement"),
        Index("ix_equipment_ownerships_org_vehicle", "organization_id", "vehicle_id"),
        Index("ix_equipment_ownerships_org_trailer", "organization_id", "trailer_id"),
        Index("ix_equipment_ownerships_org_owner", "organization_id", "owner_id"),
        CheckConstraint("(vehicle_id IS NULL) <> (trailer_id IS NULL)", name="one_unit"),
        CheckConstraint("share_pct > 0 AND share_pct <= 100", name="share_range"),
        CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="dates_valid"),
        CheckConstraint("owner_id IS NULL OR agreement_id IS NOT NULL", name="owner_needs_agreement"),
    )


def portal_preset(permissions: list[str] | Any) -> str | None:
    """The preset a set of permissions matches exactly, if any."""
    have = set(permissions or [])
    for key, (_, keys) in PORTAL_PRESETS.items():
        if have == set(keys):
            return key
    return None
