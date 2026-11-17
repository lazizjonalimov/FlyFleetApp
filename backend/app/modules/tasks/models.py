import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, Integer, String, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TenantScoped


class Task(Base, IdMixin, TenantScoped):
    """Something one person should do: given by a teammate, raised from a fleet alert (closing when the alert
    clears), or a reminder of paperwork coming due."""
    __tablename__ = "tasks"
    title: Mapped[str] = mapped_column(String(200))
    detail: Mapped[str | None] = mapped_column(String(300))
    assignee_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Due some time that day rather than at a time: shown as the day, and due until the day is over.
    all_day: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    priority: Mapped[str] = mapped_column(String(6), default="medium", server_default="medium")
    status: Mapped[str] = mapped_column(String(10), default="open", server_default="open")
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    done_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    outcome: Mapped[str | None] = mapped_column(String(200))
    entity_type: Mapped[str | None] = mapped_column(String(20))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    entity_label: Mapped[str | None] = mapped_column(String(60))
    # The verb the list offers: Assign, Notify, Open, Request.
    action: Mapped[str | None] = mapped_column(String(20))
    source: Mapped[str] = mapped_column(String(10), default="manual", server_default="manual")
    incident_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    # The same alert or reminder seen again finds its open task by this, so it is never given twice.
    source_key: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")

    __table_args__ = (
        CheckConstraint("priority IN ('high', 'medium', 'low')", name="priority_valid"),
        CheckConstraint("status IN ('open', 'done', 'cancelled')", name="status_valid"),
        CheckConstraint("source IN ('manual', 'incident', 'reminder')", name="source_valid"),
        Index("ix_tasks_org_assignee", "organization_id", "assignee_user_id", "status", "due_at"),
        Index("uq_tasks_open_source", "organization_id", "source_key", unique=True,
              postgresql_where=text("status = 'open' AND source_key IS NOT NULL")),
    )
