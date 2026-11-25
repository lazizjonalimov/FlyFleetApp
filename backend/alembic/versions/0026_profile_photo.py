"""Profile photos: where each person's photo is stored, and when it last changed.

Revision ID: 0026
Revises: 0025
"""
import os

import sqlalchemy as sa

from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")


def upgrade() -> None:
    op.add_column("users", sa.Column("photo_key", sa.String(120), nullable=True))
    op.add_column("users", sa.Column("photo_updated_at", sa.DateTime(timezone=True), nullable=True))
    # A person changes only their own photo: the users table's own-row policy already limits UPDATE to yourself.
    op.execute(f"GRANT UPDATE (photo_key, photo_updated_at) ON users TO {APP_ROLE}")


def downgrade() -> None:
    op.execute(f"REVOKE UPDATE (photo_key, photo_updated_at) ON users FROM {APP_ROLE}")
    op.drop_column("users", "photo_updated_at")
    op.drop_column("users", "photo_key")
