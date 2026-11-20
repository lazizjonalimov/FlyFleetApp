"""Moving a truck or trailer to another company of the same account: the unit stays in the old company as
"transferred" (read-only, with all its history), a record of each move is kept on both sides, and a VIN can be
looked up across the account's companies so it is active in only one at a time.

Revision ID: 0023
Revises: 0022
"""
import os

import sqlalchemy as sa

from alembic import op
from app.core.rls import READ_WRITE, secure_tenant_table

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")
USR = "nullif(current_setting('app.user_id', true), '')::uuid"
OLD = "status IN ('active', 'in_maintenance', 'out_of_service', 'retired')"
NEW = "status IN ('active', 'in_maintenance', 'out_of_service', 'retired', 'transferred')"


def upgrade() -> None:
    for table in ("vehicles", "trailers"):
        op.drop_constraint(op.f(f"ck_{table}_status_valid"), table, type_="check")
        op.create_check_constraint(op.f(f"ck_{table}_status_valid"), table, NEW)

    op.create_table(
        "unit_transfers",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("direction", sa.String(3), nullable=False),
        sa.Column("kind", sa.String(7), nullable=False),
        sa.Column("unit_id", sa.Uuid(), nullable=False),
        sa.Column("unit_number", sa.String(40), nullable=False),
        sa.Column("vin", sa.String(25), nullable=True),
        sa.Column("other_organization_id", sa.Uuid(), nullable=False),
        sa.Column("other_organization_name", sa.String(160), nullable=False),
        sa.Column("other_unit_id", sa.Uuid(), nullable=False),
        sa.Column("effective_on", sa.Date(), nullable=False),
        sa.Column("performed_by", sa.Uuid(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("direction IN ('out', 'in')", name=op.f("ck_unit_transfers_direction_valid")),
        sa.CheckConstraint("kind IN ('vehicle', 'trailer')", name=op.f("ck_unit_transfers_kind_valid")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], name=op.f("fk_unit_transfers_organization_id"),
                                ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_unit_transfers")),
    )
    op.create_index("ix_unit_transfers_org_unit", "unit_transfers", ["organization_id", "unit_id"])
    for statement in secure_tenant_table("unit_transfers", APP_ROLE, READ_WRITE):
        op.execute(statement)

    # Which company of an account has this VIN active, whoever asks may only look through an account they work in.
    op.execute(
        f"""
        CREATE FUNCTION auth_account_active_vin(p_account_id uuid, p_vin text)
        RETURNS TABLE (organization_id uuid, organization_name text, kind text, unit_id uuid, unit_number text)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT o.id, o.name::text, 'vehicle'::text, v.id, v.unit_number::text
             FROM vehicles v JOIN organizations o ON o.id = v.organization_id
            WHERE o.account_id = p_account_id AND upper(v.vin) = upper(p_vin) AND v.status <> 'transferred'
              AND v.status <> 'retired'
              AND EXISTS (SELECT 1 FROM organization_memberships m WHERE m.user_id = {USR} AND m.active
                          AND m.organization_id = o.id)
           UNION ALL
           SELECT o.id, o.name::text, 'trailer'::text, t.id, t.unit_number::text
             FROM trailers t JOIN organizations o ON o.id = t.organization_id
            WHERE o.account_id = p_account_id AND upper(t.vin) = upper(p_vin) AND t.status <> 'transferred'
              AND t.status <> 'retired'
              AND EXISTS (SELECT 1 FROM organization_memberships m WHERE m.user_id = {USR} AND m.active
                          AND m.organization_id = o.id) $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION auth_account_active_vin(uuid, text) FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION auth_account_active_vin(uuid, text) TO {APP_ROLE}")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS auth_account_active_vin(uuid, text)")
    op.drop_table("unit_transfers")
    op.execute("UPDATE vehicles SET status = 'retired' WHERE status = 'transferred'")
    op.execute("UPDATE trailers SET status = 'retired' WHERE status = 'transferred'")
    for table in ("vehicles", "trailers"):
        op.drop_constraint(op.f(f"ck_{table}_status_valid"), table, type_="check")
        op.create_check_constraint(op.f(f"ck_{table}_status_valid"), table, OLD)
