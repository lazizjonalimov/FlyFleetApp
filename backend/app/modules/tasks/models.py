import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Uuid, func, text
from sqlalchemy.dialects.postgresql import JSONB
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
    # Put aside until then: off the open list, back on it by itself when the time comes.
    snoozed_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Why the task exists, in a sentence, and what closes it by itself (if anything does).
    why: Mapped[str | None] = mapped_column(String(300))
    auto_close: Mapped[str | None] = mapped_column(String(200))
    # Completing a repeating task gives the next one.
    recurrence: Mapped[str] = mapped_column(String(8), default="none", server_default="none")
    # Another task that must be finished first.
    blocked_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    # A promise with a clock on it (a customer update, a pickup to cover): when, and what it is called.
    sla_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sla_label: Mapped[str | None] = mapped_column(String(60))
    escalated: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # The steps: [{"text": "...", "done": false}, ...]
    subtasks: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")

    __table_args__ = (
        CheckConstraint("priority IN ('high', 'medium', 'low')", name="priority_valid"),
        CheckConstraint("status IN ('open', 'done', 'cancelled')", name="status_valid"),
        CheckConstraint("source IN ('manual', 'incident', 'reminder', 'recurring')", name="source_valid"),
        CheckConstraint("recurrence IN ('none', 'daily', 'weekly', 'monthly')", name="recurrence_valid"),
        Index("ix_tasks_org_assignee", "organization_id", "assignee_user_id", "status", "due_at"),
        Index("uq_tasks_open_source", "organization_id", "source_key", unique=True,
              postgresql_where=text("status = 'open' AND source_key IS NOT NULL")),
    )


class TaskEvent(Base, IdMixin, TenantScoped):
    """One line of a task's story: a comment someone wrote, or something that happened to it (created, done,
    reopened, snoozed, given to someone, priority or due changed, blocked, escalated, a reminder sent)."""
    __tablename__ = "task_events"
    task_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("tasks.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(10))
    text: Mapped[str] = mapped_column(String(500))
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("kind IN ('comment', 'history')", name="kind_valid"),
        Index("ix_task_events_task", "organization_id", "task_id", "at"),
    )
