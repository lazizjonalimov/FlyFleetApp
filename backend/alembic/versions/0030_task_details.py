"""Tasks in full: snoozing, steps, why a task exists and what closes it, repeating tasks, one task waiting on
another, a promise with a clock (SLA), escalation, and each task's story (comments and what happened to it).

Revision ID: 0030
Revises: 0029
"""
import os

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.core.rls import READ_WRITE, secure_tenant_table

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")


def upgrade() -> None:
    op.add_column("tasks", sa.Column("snoozed_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tasks", sa.Column("why", sa.String(300), nullable=True))
    op.add_column("tasks", sa.Column("auto_close", sa.String(200), nullable=True))
    op.add_column("tasks", sa.Column("recurrence", sa.String(8), server_default="none", nullable=False))
    op.add_column("tasks", sa.Column("blocked_by", sa.Uuid(), nullable=True))
    op.add_column("tasks", sa.Column("sla_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tasks", sa.Column("sla_label", sa.String(60), nullable=True))
    op.add_column("tasks", sa.Column("escalated", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("tasks", sa.Column("subtasks", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"),
                                     nullable=False))
    op.drop_constraint(op.f("ck_tasks_source_valid"), "tasks", type_="check")
    op.create_check_constraint(op.f("ck_tasks_source_valid"), "tasks",
                               "source IN ('manual', 'incident', 'reminder', 'recurring')")
    op.create_check_constraint(op.f("ck_tasks_recurrence_valid"), "tasks",
                               "recurrence IN ('none', 'daily', 'weekly', 'monthly')")
    op.create_table(
        "task_events",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("text", sa.String(500), nullable=False),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("kind IN ('comment', 'history')", name=op.f("ck_task_events_kind_valid")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"],
                                name=op.f("fk_task_events_organization_id"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], name=op.f("fk_task_events_task_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_task_events")),
    )
    op.create_index("ix_task_events_task", "task_events", ["organization_id", "task_id", "at"])
    for statement in secure_tenant_table("task_events", APP_ROLE, READ_WRITE):
        op.execute(statement)


def downgrade() -> None:
    op.drop_table("task_events")
    op.drop_constraint(op.f("ck_tasks_recurrence_valid"), "tasks", type_="check")
    op.drop_constraint(op.f("ck_tasks_source_valid"), "tasks", type_="check")
    op.create_check_constraint(op.f("ck_tasks_source_valid"), "tasks", "source IN ('manual', 'incident', 'reminder')")
    for column in ("subtasks", "escalated", "sla_label", "sla_at", "blocked_by", "recurrence", "auto_close", "why",
                   "snoozed_until"):
        op.drop_column("tasks", column)
