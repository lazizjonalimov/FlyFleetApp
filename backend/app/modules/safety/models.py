import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.core.db import Base, IdMixin, TenantScoped


class ComplianceSettings(Base, IdMixin, TenantScoped):
    """A company's qualification file and its reminder rules. One row per company, made with the standard
    settings the first time anyone needs them."""
    __tablename__ = "compliance_settings"
    # What every active driver's file must hold beyond the CDL and medical card: [{"type", "blocks"}]. An item that
    # blocks keeps a driver off loads while it is missing or expired.
    checklist: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Days before an expiry that a reminder goes out, largest first.
    lead_days: Mapped[list[int]] = mapped_column(JSONB, default=list, server_default="[]")
    # How a driver is reminded. Only the driver app reaches anyone today; the others need a messaging connection.
    channels: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    # Who gets a copy, as a task: "safety_manager", "fleet_manager".
    copy_to: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    # The company's local hour reminders go out at.
    run_hour: Mapped[int] = mapped_column(Integer, default=2, server_default="2")
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")

    __table_args__ = (
        UniqueConstraint("organization_id", name="uq_compliance_settings_org"),
        CheckConstraint("run_hour BETWEEN 0 AND 23", name="run_hour_valid"),
    )


class ComplianceReminder(Base, IdMixin, TenantScoped):
    """One reminder sent: for one item, one expiry date and one window. Sent once; the unique key makes sure."""
    __tablename__ = "compliance_reminders"
    entity_type: Mapped[str] = mapped_column(String(20))
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    entity_label: Mapped[str] = mapped_column(String(120))
    item: Mapped[str] = mapped_column(String(30))
    expires_on: Mapped[date] = mapped_column(Date)
    lead_days: Mapped[int] = mapped_column(Integer)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # What reached whom: [{"to": "driver" | role, "channel", "status", "reason"?}]
    deliveries: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    # True when the reminder reached nobody: no channel the driver is on, and nobody to copy.
    failed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    message_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)

    __table_args__ = (
        UniqueConstraint("organization_id", "entity_type", "entity_id", "item", "expires_on", "lead_days",
                         name="uq_compliance_reminders_window"),
        Index("ix_compliance_reminders_org_sent", "organization_id", "sent_at"),
        CheckConstraint("entity_type IN ('driver', 'vehicle', 'trailer', 'organization')", name="entity_valid"),
    )
