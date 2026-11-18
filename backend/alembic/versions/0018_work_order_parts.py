"""Work orders can wait for parts (with the date the parts are due), and remember who signed the unit back into
service after a repair that kept it off the road.

Revision ID: 0018
Revises: 0017
"""
import sqlalchemy as sa

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None

BEFORE = "('open', 'in_progress', 'completed', 'cancelled')"
AFTER = "('open', 'in_progress', 'waiting_parts', 'completed', 'cancelled')"


def upgrade() -> None:
    op.add_column("work_orders", sa.Column("parts_eta", sa.Date(), nullable=True))
    op.add_column("work_orders", sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("work_orders", sa.Column("returned_by", sa.Uuid(), nullable=True))
    op.drop_constraint(op.f("ck_work_orders_status_valid"), "work_orders", type_="check")
    op.create_check_constraint(op.f("ck_work_orders_status_valid"), "work_orders", f"status IN {AFTER}")


def downgrade() -> None:
    op.execute("UPDATE work_orders SET status = 'in_progress' WHERE status = 'waiting_parts'")
    op.drop_constraint(op.f("ck_work_orders_status_valid"), "work_orders", type_="check")
    op.create_check_constraint(op.f("ck_work_orders_status_valid"), "work_orders", f"status IN {BEFORE}")
    op.drop_column("work_orders", "returned_by")
    op.drop_column("work_orders", "returned_at")
    op.drop_column("work_orders", "parts_eta")
