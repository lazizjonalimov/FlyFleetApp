"""Trucks: engine and transmission, shown with the specifications on the truck record.

Revision ID: 0007
Revises: 0006
"""
import sqlalchemy as sa

from alembic import op

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vehicles", sa.Column("engine", sa.String(80), nullable=True))
    op.add_column("vehicles", sa.Column("transmission", sa.String(80), nullable=True))


def downgrade() -> None:
    op.drop_column("vehicles", "transmission")
    op.drop_column("vehicles", "engine")
