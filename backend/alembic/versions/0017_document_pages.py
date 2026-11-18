"""Documents know how many pages they have, counted when the file arrives.

Revision ID: 0017
Revises: 0016
"""
import sqlalchemy as sa

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("pages", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "pages")
