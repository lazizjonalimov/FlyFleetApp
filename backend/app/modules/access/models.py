import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, Integer, String, UniqueConstraint, Uuid, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TenantScoped


class OrgRole(Base, IdMixin, TenantScoped):
    """A company's own version of a role: a template role it has changed, or a custom role. Roles the company
    hasn't changed use the template as FlyFleet defines it."""
    __tablename__ = "org_roles"
    key: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(60))
    description: Mapped[str | None] = mapped_column(String(200))
    # The template the role started from (its own key for an edited template role).
    template: Mapped[str | None] = mapped_column(String(30))
    custom: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    permissions: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")

    __table_args__ = (
        UniqueConstraint("organization_id", "key", name="uq_org_roles_key"),
        CheckConstraint("key ~ '^[a-z][a-z0-9_]{1,39}$'", name="key_format"),
    )


class PermissionOverride(Base, IdMixin, TenantScoped):
    """One person's exception to their role: a permission allowed or denied. A denial always wins."""
    __tablename__ = "permission_overrides"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    permission: Mapped[str] = mapped_column(String(60))
    effect: Mapped[str] = mapped_column(String(5))
    note: Mapped[str | None] = mapped_column(String(200))
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("effect IN ('allow', 'deny')", name="effect_valid"),
        UniqueConstraint("organization_id", "user_id", "permission", name="uq_permission_overrides"),
    )


class Invitation(Base, IdMixin, TenantScoped):
    """An invitation to join the company with a role, by a link someone opens to set up their sign-in. Only a
    hash of the link's secret is kept."""
    __tablename__ = "invitations"
    email: Mapped[str] = mapped_column(String(254))
    full_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(40))
    # A driver profile to link the new sign-in to, when the invitation is to the driver app.
    driver_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    token_hash: Mapped[str] = mapped_column(String(64))
    invited_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The 8-character code someone can type under Add a company › Join; only its hash is kept.
    code_hash: Mapped[str | None] = mapped_column(String(64))
    declined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_invitations_token"),
        Index("uq_invitations_code", "code_hash", unique=True, postgresql_where=text("code_hash IS NOT NULL")),
        Index("uq_invitations_open_email", "organization_id", "email", unique=True,
              postgresql_where=text("accepted_at IS NULL AND revoked_at IS NULL")),
    )
