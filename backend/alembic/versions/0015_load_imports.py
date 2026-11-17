"""Loads can be imported from a spreadsheet, like drivers, trucks, trailers and mileage.

Revision ID: 0015
Revises: 0014
"""
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

BEFORE = "('drivers', 'trucks', 'trailers', 'mileage')"
AFTER = "('drivers', 'trucks', 'trailers', 'mileage', 'loads')"


def upgrade() -> None:
    op.drop_constraint(op.f("ck_imports_kind_valid"), "imports", type_="check")
    op.create_check_constraint(op.f("ck_imports_kind_valid"), "imports", f"kind IN {AFTER}")


def downgrade() -> None:
    op.execute("DELETE FROM imports WHERE kind = 'loads'")
    op.drop_constraint(op.f("ck_imports_kind_valid"), "imports", type_="check")
    op.create_check_constraint(op.f("ck_imports_kind_valid"), "imports", f"kind IN {BEFORE}")
