"""Dashboard snapshots: the value of each dashboard figure that is a state (drivers available, trucks down,
overdue invoices…) as it stood each day, so a card can compare with yesterday, last week or last month and draw
its last seven points. Figures that count events (deliveries, loads late) are worked out from the records
instead. One row per company, scope (the whole company, or a dispatch team), figure and day.

Revision ID: 0029
Revises: 0028
"""
import os

import sqlalchemy as sa

from alembic import op
from app.core.rls import READ_WRITE, secure_tenant_table

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")


def upgrade() -> None:
    op.create_table(
        "dashboard_snapshots",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("scope_key", sa.String(80), nullable=False),
        sa.Column("kpi", sa.String(40), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"],
                                name=op.f("fk_dashboard_snapshots_organization_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dashboard_snapshots")),
        sa.UniqueConstraint("organization_id", "scope_key", "kpi", "day",
                            name=op.f("uq_dashboard_snapshots_organization_id_scope_key_kpi_day")),
    )
    for statement in secure_tenant_table("dashboard_snapshots", APP_ROLE, READ_WRITE):
        op.execute(statement)


def downgrade() -> None:
    op.drop_table("dashboard_snapshots")
