"""Profile & preferences: your own phone and time zone, and the devices you are signed in on.

Each sign-in is a row in ``user_sessions``; the access token carries its id. A session that is signed out is
refused on the next request, which is how one device can be signed out without touching the others. A person
sees and changes only their own sessions.

Revision ID: 0024
Revises: 0023
"""
import os

import sqlalchemy as sa

from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")
USR = "nullif(current_setting('app.user_id', true), '')::uuid"


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(40), nullable=True))
    op.add_column("users", sa.Column("timezone", sa.String(64), nullable=True))
    op.execute(f"GRANT UPDATE (phone, timezone) ON users TO {APP_ROLE}")

    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_user_sessions_user_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_sessions")),
    )
    op.create_index(op.f("ix_user_sessions_user_id"), "user_sessions", ["user_id"])
    # Sessions belong to a person, not a company: each person reads and signs out only their own.
    op.execute("ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY own_sessions ON user_sessions USING (user_id = {USR}) WITH CHECK (user_id = {USR})")
    op.execute(f"GRANT SELECT, INSERT ON user_sessions TO {APP_ROLE}")
    op.execute(f"GRANT UPDATE (last_seen_at, revoked_at) ON user_sessions TO {APP_ROLE}")


def downgrade() -> None:
    op.drop_index(op.f("ix_user_sessions_user_id"), table_name="user_sessions")
    op.drop_table("user_sessions")
    op.execute(f"REVOKE UPDATE (phone, timezone) ON users FROM {APP_ROLE}")
    op.drop_column("users", "timezone")
    op.drop_column("users", "phone")
