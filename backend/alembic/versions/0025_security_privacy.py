"""Security & privacy: password age and strength, two-step verification with an authenticator app and backup
codes, one-time password reset links, your own sign-in activity, and privacy choices.

Each new table belongs to a person, not a company: row-level security lets a person read and change only their
own rows. A reset link is opened before anyone is signed in, so it is looked up by its hash through a SECURITY
DEFINER function that returns only whose link it is and whether it can still be used.

Revision ID: 0025
Revises: 0024
"""
import os

import sqlalchemy as sa

from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")
USR = "nullif(current_setting('app.user_id', true), '')::uuid"
COLUMNS = ("password_changed_at", "password_strength", "totp_secret", "totp_pending", "totp_added_at",
           "remember_device", "support_access_until", "share_usage")


def _own(table: str, privileges: str, update: str | None = None) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY own_rows ON {table} USING (user_id = {USR}) WITH CHECK (user_id = {USR})")
    op.execute(f"GRANT {privileges} ON {table} TO {APP_ROLE}")
    if update:
        op.execute(f"GRANT UPDATE ({update}) ON {table} TO {APP_ROLE}")


def upgrade() -> None:
    op.add_column("users", sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("password_strength", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("totp_secret", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("totp_pending", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("totp_added_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("remember_device", sa.Boolean(), server_default="true", nullable=False))
    op.add_column("users", sa.Column("support_access_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("share_usage", sa.Boolean(), server_default="false", nullable=False))
    op.execute(f"GRANT UPDATE ({', '.join(COLUMNS)}) ON users TO {APP_ROLE}")

    def ids(table: str) -> list:
        return [
            sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f(f"fk_{table}_user_id"), ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{table}")),
        ]

    op.create_table(
        "user_backup_codes", *ids("user_backup_codes"),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(op.f("ix_user_backup_codes_user_id"), "user_backup_codes", ["user_id"])
    _own("user_backup_codes", "SELECT, INSERT, DELETE", "used_at")

    op.create_table(
        "password_resets", *ids("password_resets"),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("token_hash", name=op.f("uq_password_resets_token_hash")),
    )
    op.create_index(op.f("ix_password_resets_user_id"), "password_resets", ["user_id"])
    _own("password_resets", "SELECT, INSERT", "used_at")

    op.create_table(
        "sign_in_events", *ids("sign_in_events"),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(op.f("ix_sign_in_events_user_id"), "sign_in_events", ["user_id"])
    op.create_index(op.f("ix_sign_in_events_created_at"), "sign_in_events", ["created_at"])
    _own("sign_in_events", "SELECT, INSERT")

    # Opening a reset link: whose link it is and whether it can still be used, by the token's hash only. The
    # function runs as the schema owner, which row-level security also binds (FORCE), so it gets a read policy.
    op.execute("CREATE POLICY definer_read ON password_resets FOR SELECT TO CURRENT_USER USING (true)")
    op.execute(
        """
        CREATE FUNCTION auth_password_reset(p_token_hash text)
        RETURNS TABLE (reset_id uuid, user_id uuid, expires_at timestamptz, used_at timestamptz)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
          SELECT r.id, r.user_id, r.expires_at, r.used_at FROM password_resets r WHERE r.token_hash = p_token_hash $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION auth_password_reset(text) FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION auth_password_reset(text) TO {APP_ROLE}")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS auth_password_reset(text)")
    for table in ("sign_in_events", "password_resets", "user_backup_codes"):
        op.drop_table(table)
    op.execute(f"REVOKE UPDATE ({', '.join(COLUMNS)}) ON users FROM {APP_ROLE}")
    for column in reversed(COLUMNS):
        op.drop_column("users", column)
