"""The compliance file: the clearinghouse query joins the driver qualification items, documents can be filed with
the company itself (authority, insurance, UCR, IFTA) and carry the new compliance types, and each company has its
qualification file and reminder rules, with a log of every reminder sent.

Revision ID: 0016
Revises: 0015
"""
import os

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.core.rls import NO_DELETE, READ_WRITE, secure_tenant_table

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")

QUALIFICATIONS_BEFORE = ("('mvr', 'drug_test', 'road_test', 'employment_application', 'annual_review', 'hazmat', "
                         "'twic', 'training', 'other')")
QUALIFICATIONS_AFTER = ("('mvr', 'clearinghouse', 'drug_test', 'road_test', 'employment_application', 'annual_review', "
                        "'hazmat', 'twic', 'training', 'other')")
TYPES_BEFORE = ("('bol', 'pod', 'rate_confirmation', 'receipt', 'license', 'medical', 'insurance', 'registration', "
                "'inspection', 'maintenance', 'invoice', 'lease', 'w9', 'title', 'cab_card', 'ach_authorization', 'other')")
TYPES_AFTER = ("('bol', 'pod', 'rate_confirmation', 'receipt', 'license', 'medical', 'insurance', 'registration', "
               "'inspection', 'maintenance', 'invoice', 'lease', 'w9', 'title', 'cab_card', 'ach_authorization', "
               "'mvr', 'clearinghouse', 'road_test', 'drug_test', 'authority', 'ucr', 'ifta_license', 'other')")
ENTITIES_BEFORE = ("('load', 'driver', 'vehicle', 'trailer', 'customer', 'work_order', 'invoice', 'expense', 'owner', "
                   "'inspection')")
ENTITIES_AFTER = ("('load', 'driver', 'vehicle', 'trailer', 'customer', 'work_order', 'invoice', 'expense', 'owner', "
                  "'inspection', 'organization')")


def _check(table: str, name: str, condition: str) -> None:
    op.drop_constraint(op.f(f"ck_{table}_{name}"), table, type_="check")
    op.create_check_constraint(op.f(f"ck_{table}_{name}"), table, condition)


def upgrade() -> None:
    _check("driver_qualifications", "type_valid", f"type IN {QUALIFICATIONS_AFTER}")
    _check("documents", "type_valid", f"type IN {TYPES_AFTER}")
    _check("document_links", "entity_valid", f"entity_type IN {ENTITIES_AFTER}")
    op.create_table(
        "compliance_settings",
        sa.Column("checklist", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("reminders_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("lead_days", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("channels", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("copy_to", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("run_hour", sa.Integer(), server_default="2", nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("run_hour BETWEEN 0 AND 23", name=op.f("ck_compliance_settings_run_hour_valid")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"],
                                name=op.f("fk_compliance_settings_organization_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_compliance_settings")),
        sa.UniqueConstraint("organization_id", name="uq_compliance_settings_org"),
    )
    op.create_table(
        "compliance_reminders",
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("entity_label", sa.String(length=120), nullable=False),
        sa.Column("item", sa.String(length=30), nullable=False),
        sa.Column("expires_on", sa.Date(), nullable=False),
        sa.Column("lead_days", sa.Integer(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deliveries", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("failed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("message_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("entity_type IN ('driver', 'vehicle', 'trailer', 'organization')",
                           name=op.f("ck_compliance_reminders_entity_valid")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"],
                                name=op.f("fk_compliance_reminders_organization_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_compliance_reminders")),
        sa.UniqueConstraint("organization_id", "entity_type", "entity_id", "item", "expires_on", "lead_days",
                            name="uq_compliance_reminders_window"),
    )
    op.create_index("ix_compliance_reminders_org_sent", "compliance_reminders", ["organization_id", "sent_at"])
    for table, privileges in (("compliance_settings", READ_WRITE), ("compliance_reminders", NO_DELETE)):
        for statement in secure_tenant_table(table, APP_ROLE, privileges):
            op.execute(statement)
    # The scheduled reminder run needs the companies to visit before it is inside any one of them: their ids and
    # time zones only, through a function, as the sign-in lookups are.
    op.execute(
        """
        CREATE FUNCTION jobs_active_organizations()
        RETURNS TABLE (id uuid, timezone text)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT o.id, o.timezone::text FROM organizations o WHERE o.status = 'active' $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION jobs_active_organizations() FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION jobs_active_organizations() TO {APP_ROLE}")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS jobs_active_organizations()")
    op.drop_index("ix_compliance_reminders_org_sent", table_name="compliance_reminders")
    op.drop_table("compliance_reminders")
    op.drop_table("compliance_settings")
    op.execute("DELETE FROM document_links WHERE entity_type = 'organization'")
    op.execute("UPDATE documents SET type = 'other' WHERE type IN ('mvr', 'clearinghouse', 'road_test', 'drug_test', "
               "'authority', 'ucr', 'ifta_license')")
    op.execute("UPDATE driver_qualifications SET type = 'other' WHERE type = 'clearinghouse'")
    _check("document_links", "entity_valid", f"entity_type IN {ENTITIES_BEFORE}")
    _check("documents", "type_valid", f"type IN {TYPES_BEFORE}")
    _check("driver_qualifications", "type_valid", f"type IN {QUALIFICATIONS_BEFORE}")
