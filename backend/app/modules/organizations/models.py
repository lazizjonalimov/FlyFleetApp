import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.core.crypto import EncryptedText
from app.core.db import Base, IdMixin, TenantScoped, TimestampMixin

MC_DIGITS = "nullif(regexp_replace(coalesce(mc_number, ''), '[^0-9]', '', 'g'), '')"

ROLES = ("('owner','admin','dispatcher','safety_manager','fleet_manager','accountant','viewer','driver','customer',"
         "'owner_portal')")


class User(Base, IdMixin, TimestampMixin):
    """A person's sign-in. Access to a company is granted only through a membership."""
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(254), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Embedded in access tokens; bumping it (e.g. on password change) invalidates every token already issued.
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # The company this person last worked in, so signing in returns them there.
    last_organization_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    # "all" when the person last worked in all their companies at once.
    last_scope: Mapped[str | None] = mapped_column(String(10))
    # Your own contact number and time zone, under Profile & preferences. Neither changes the company's.
    phone: Mapped[str | None] = mapped_column(String(40))
    timezone: Mapped[str | None] = mapped_column(String(64))
    # Security & privacy. The password's strength is rated when it is set, since the hash can't be rated later.
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_strength: Mapped[int | None] = mapped_column(Integer)
    # Two-step verification with an authenticator app: the shared key, encrypted at rest. `totp_pending` holds a
    # key being set up until a code from it is verified.
    totp_secret: Mapped[str | None] = mapped_column(EncryptedText())
    totp_pending: Mapped[str | None] = mapped_column(EncryptedText())
    totp_added_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    remember_device: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Privacy: support may view the account until this time; product usage counts shared or not.
    support_access_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    share_usage: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Profile photo: where the re-encoded square image is stored, and when it changed (for cache busting).
    photo_key: Mapped[str | None] = mapped_column(String(120))
    photo_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The company that opens first at sign-in, when the person has chosen one.
    default_organization_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    __table_args__ = (CheckConstraint("email = lower(email)", name="email_lowercase"),)


class UserSession(Base, IdMixin):
    """One sign-in on one device. Access tokens carry its id, so it can be listed and signed out on its own."""
    __tablename__ = "user_sessions"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    ip_address: Mapped[str | None] = mapped_column(String(64))


class BackupCode(Base, IdMixin):
    """One single-use backup code for two-step verification. Only its hash is kept; the code is shown once."""
    __tablename__ = "user_backup_codes"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PasswordReset(Base, IdMixin):
    """A one-time link to set a new password. Only the token's hash is kept; it works once, for 30 minutes."""
    __tablename__ = "password_resets"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SignInEvent(Base, IdMixin):
    """A sign-in, or an attempt at one, on a person's own account. Each person sees only their own."""
    __tablename__ = "sign_in_events"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # signed_in | new_device | failed_password | failed_second_step
    kind: Mapped[str] = mapped_column(String(24))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class Account(Base, IdMixin, TimestampMixin):
    """The owner's profile. It holds up to `max_companies` active companies (decision 0001)."""
    __tablename__ = "accounts"
    name: Mapped[str] = mapped_column(String(160))
    owner_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    max_companies: Mapped[int] = mapped_column(Integer, default=10, server_default="10")
    __table_args__ = (CheckConstraint("max_companies BETWEEN 1 AND 100", name="max_companies_range"),)


class Organization(Base, IdMixin, TimestampMixin):
    """A company: one legal entity with its own books. The unit of tenant isolation."""
    __tablename__ = "organizations"
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    legal_name: Mapped[str | None] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    # A short code and a colour, shown beside the company's numbers and on its mark where several companies mix.
    code: Mapped[str] = mapped_column(String(6))
    color: Mapped[str] = mapped_column(String(7), default="#1F4FE0", server_default="#1F4FE0")
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Trucks the company runs, as chosen when it was added: 1-5, 6-20, 21-50 or 51+.
    fleet_size: Mapped[str | None] = mapped_column(String(8))
    # An optional logo shown instead of the coloured initials: where it is stored, and when it changed.
    logo_key: Mapped[str | None] = mapped_column(String(120))
    logo_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dot_number: Mapped[str | None] = mapped_column(String(20))
    mc_number: Mapped[str | None] = mapped_column(String(20))
    # Printed on invoices.
    phone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(254))
    address: Mapped[str | None] = mapped_column(String(300))
    city: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(40))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    # IANA zone. "Today" for invoices, due dates and expiry checks is this company's local date.
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", server_default="UTC")
    base_currency: Mapped[str] = mapped_column(String(3), default="USD", server_default="USD")
    default_payment_terms_days: Mapped[int] = mapped_column(Integer, default=30, server_default="30")
    load_number_prefix: Mapped[str] = mapped_column(String(10), default="L", server_default="L")
    invoice_number_prefix: Mapped[str] = mapped_column(String(10), default="INV", server_default="INV")
    # Per-company counters, incremented under a row lock.
    load_seq: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    invoice_seq: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    settlement_seq: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    work_order_seq: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    incident_seq: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # What a dispatcher on no dispatch team sees: "all" the fleet, or "none" until they are put on a team.
    dispatchers_without_team: Mapped[str] = mapped_column(String(4), default="all", server_default="all")
    __table_args__ = (
        CheckConstraint("status IN ('active','archived')", name="status_valid"),
        CheckConstraint("base_currency ~ '^[A-Z]{3}$'", name="currency_code"),
        CheckConstraint("code ~ '^[A-Z0-9]{2,6}$'", name="code_valid"),
        CheckConstraint("color ~ '^#[0-9A-Fa-f]{6}$'", name="color_valid"),
        CheckConstraint("fleet_size IS NULL OR fleet_size IN ('1-5', '6-20', '21-50', '51+')", name="fleet_size_valid"),
        # One company per MC number across FlyFleet, compared by its digits ("MC-123456" is 123456).
        Index("uq_organizations_mc", text(f"({MC_DIGITS})"), unique=True, postgresql_where=text(f"{MC_DIGITS} IS NOT NULL")),
        Index("uq_organizations_account_code", "account_id", text("lower(code)"), unique=True),
    )


class Membership(Base, IdMixin, TenantScoped, TimestampMixin):
    __tablename__ = "organization_memberships"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(30))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Owner portal sign-ins: the owner whose equipment they may see. Nothing else in the company is theirs.
    owner_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    # Shipment portal sign-ins: the customer whose shipments, papers and invoices they may see.
    customer_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    # When the person last opened the company, for the Companies page.
    last_opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id"),
        UniqueConstraint("organization_id", "id"),
        ForeignKeyConstraint(["organization_id", "owner_id"], ["owners.organization_id", "owners.id"],
                             name="fk_memberships_owner", ondelete="CASCADE"),
        CheckConstraint(f"role IN {ROLES}", name="role_valid"),
        ForeignKeyConstraint(["organization_id", "customer_id"], ["customers.organization_id", "customers.id"],
                             name="fk_memberships_customer", ondelete="CASCADE"),
        CheckConstraint("(role = 'owner_portal') = (owner_id IS NOT NULL)", name="portal_needs_owner"),
        CheckConstraint("(role = 'customer') = (customer_id IS NOT NULL)", name="portal_needs_customer"),
    )


class Terminal(Base, IdMixin, TenantScoped, TimestampMixin):
    """A yard or office inside a company. A scope for filtering, not a tenant."""
    __tablename__ = "terminals"
    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str | None] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(String(300))
    city: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(40))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    phone: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active")
    __table_args__ = (
        UniqueConstraint("organization_id", "id"),
        UniqueConstraint("organization_id", "name"),
        CheckConstraint("status IN ('active','archived')", name="status_valid"),
    )


class UserPreference(Base, IdMixin, TenantScoped, TimestampMixin):
    """Per-user, per-company settings owned by the backend (table columns, selected terminal, ...)."""
    __tablename__ = "user_preferences"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    key: Mapped[str] = mapped_column(String(80))
    value: Mapped[Any] = mapped_column(JSONB)
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", "key"),
        ForeignKeyConstraint(["organization_id", "user_id"],
                             ["organization_memberships.organization_id", "organization_memberships.user_id"],
                             name="fk_user_preferences_member", ondelete="CASCADE"),
    )


class SavedView(Base, IdMixin, TenantScoped, TimestampMixin):
    """A named set of filters for a list. Personal by default; shared ones are visible to the whole company."""
    __tablename__ = "saved_views"
    owner_user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    resource: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(80))
    params: Mapped[dict[str, Any]] = mapped_column(JSONB)
    shared: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "owner_user_id"],
                             ["organization_memberships.organization_id", "organization_memberships.user_id"],
                             name="fk_saved_views_owner", ondelete="CASCADE"),
        Index("ix_saved_views_org_resource", "organization_id", "resource"),
    )


class AuditLog(Base, IdMixin, TenantScoped):
    """Append-only (UPDATE/DELETE are not granted to the app role)."""
    __tablename__ = "audit_logs"
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    action: Mapped[str] = mapped_column(String(60))
    entity_type: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    request_id: Mapped[str | None] = mapped_column(String(64))
    # The wall clock, not the transaction's start: entries written in one request keep their order.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.clock_timestamp())
    __table_args__ = (
        Index("ix_audit_logs_org_created", "organization_id", "created_at", "id"),
        Index("ix_audit_logs_org_entity", "organization_id", "entity_type", "entity_id"),
    )


class IdempotencyKey(Base, TenantScoped):
    __tablename__ = "idempotency_keys"
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    endpoint: Mapped[str] = mapped_column(String(200))
    request_hash: Mapped[str] = mapped_column(String(64))
    response_status: Mapped[int | None] = mapped_column(Integer)
    response_body: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # Indexed so a retention job can purge old keys cheaply.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
