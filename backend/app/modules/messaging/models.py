import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, String, Text, UniqueConstraint, Uuid, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TenantScoped

CONVERSATION_KINDS = ("driver", "customer", "team")
# How a message reaches people. Only the app inbox (drivers) and in-app (staff) work today; the others need a
# messaging connection and are recorded as not sent.
CHANNELS = ("app", "telegram", "sms", "email", "in_app")


class Conversation(Base, IdMixin, TenantScoped):
    """One thread: with a driver (one per driver), with a customer's contact, or a team channel for staff."""
    __tablename__ = "conversations"
    kind: Mapped[str] = mapped_column(String(10))
    driver_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    title: Mapped[str | None] = mapped_column(String(120))
    # Team channels: who is in it. Driver and customer threads are open to staff who can message.
    members: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The reply the assistant suggested for the latest message, kept so it isn't written twice. Never sent on its own.
    draft: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    __table_args__ = (
        CheckConstraint("kind IN " + str(CONVERSATION_KINDS), name="kind_valid"),
        CheckConstraint("(kind = 'driver') = (driver_id IS NOT NULL)", name="driver_thread"),
        CheckConstraint("(kind = 'customer') = (customer_id IS NOT NULL)", name="customer_thread"),
        ForeignKeyConstraint(["organization_id", "driver_id"], ["drivers.organization_id", "drivers.id"],
                             name="fk_conversations_driver", ondelete="CASCADE"),
        ForeignKeyConstraint(["organization_id", "customer_id"], ["customers.organization_id", "customers.id"],
                             name="fk_conversations_customer", ondelete="CASCADE"),
        UniqueConstraint("organization_id", "id"),
        Index("uq_conversations_driver", "organization_id", "driver_id", unique=True,
              postgresql_where=text("kind = 'driver'")),
        Index("ix_conversations_org_last", "organization_id", "last_message_at"),
    )


class ConversationRead(Base, IdMixin, TenantScoped):
    """How far a staff member has read a thread."""
    __tablename__ = "conversation_reads"
    conversation_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    last_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "conversation_id"], ["conversations.organization_id", "conversations.id"],
                             name="fk_conversation_reads_conversation", ondelete="CASCADE"),
        UniqueConstraint("organization_id", "conversation_id", "user_id", name="uq_conversation_reads"),
    )


class Message(Base, IdMixin, TenantScoped):
    """A message in a thread, kept in FlyFleet whatever channel carried it, with each channel's delivery state.
    System cards (a load dispatched, an alert sent) sit in the thread like messages."""
    __tablename__ = "messages"
    conversation_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    kind: Mapped[str] = mapped_column(String(10), default="text", server_default="text")
    # What a system card is about: load_dispatched, alert, …
    event: Mapped[str | None] = mapped_column(String(20))
    # out: staff to a driver or customer · in: from them · internal: between staff · system: FlyFleet
    direction: Mapped[str] = mapped_column(String(8))
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    author_driver_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    author_name: Mapped[str | None] = mapped_column(String(120))
    title: Mapped[str | None] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    load_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    incident_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    document_ids: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    deliveries: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    via: Mapped[str | None] = mapped_column(String(10))
    # Anything else a card needs, such as the words the driver sees for an alert.
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.clock_timestamp())

    __table_args__ = (
        CheckConstraint("kind IN ('text', 'system')", name="kind_valid"),
        CheckConstraint("direction IN ('out', 'in', 'internal', 'system')", name="direction_valid"),
        ForeignKeyConstraint(["organization_id", "conversation_id"], ["conversations.organization_id", "conversations.id"],
                             name="fk_messages_conversation", ondelete="CASCADE"),
        Index("ix_messages_org_conversation", "organization_id", "conversation_id", "created_at"),
    )
