"""Loads upgrades: fuel and scale stops and how each stop is handled; extra charges that wait for approval; more
reference numbers; fuel surcharge and detention settings; repeating loads; a customer tracking link; check calls with
how they came in and the ETA given; a check-call reminder; the reefer set point and readings; an immutable activity
feed per load; and the company's cost rates for the margin estimate.

Revision ID: 0031
Revises: 0030
"""
import os

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.core.rls import APPEND_ONLY, READ_WRITE, secure_tenant_table

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")

TRACKING_FN = """
        CREATE FUNCTION public_tracking_link(p_token text)
        RETURNS TABLE (organization_id uuid, load_id uuid)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT t.organization_id, t.load_id FROM load_tracking_links t
           WHERE t.token = p_token AND t.enabled AND (t.expires_at IS NULL OR t.expires_at > now()) $$
        """


def upgrade() -> None:
    # stops
    op.add_column("load_stops", sa.Column("handling", sa.String(10), server_default="live", nullable=False))
    op.drop_constraint(op.f("ck_load_stops_type_valid"), "load_stops", type_="check")
    op.create_check_constraint(op.f("ck_load_stops_type_valid"), "load_stops",
                               "type IN ('pickup','delivery','fuel_scale')")
    op.create_check_constraint(op.f("ck_load_stops_handling_valid"), "load_stops", "handling IN ('live','drop','hook')")
    # charges
    op.add_column("load_charges", sa.Column("status", sa.String(10), server_default="approved", nullable=False))
    # FlyFleet's own line for the fuel surcharge, kept in step with the rate and the percent.
    op.add_column("load_charges", sa.Column("managed", sa.Boolean(), server_default="false", nullable=False))
    op.create_check_constraint(op.f("ck_load_charges_status_valid"), "load_charges",
                               "status IN ('pending','approved','rejected')")
    op.drop_constraint(op.f("ck_load_charges_type_valid"), "load_charges", type_="check")
    op.create_check_constraint(op.f("ck_load_charges_type_valid"), "load_charges",
                               "type IN ('detention', 'layover', 'lumper', 'fuel_surcharge', 'tarp', 'extra_stop', "
                               "'tonu', 'driver_assist', 'other')")
    # loads
    for _name, column in (
            ("pickup_number", sa.Column("pickup_number", sa.String(80))),
            ("delivery_number", sa.Column("delivery_number", sa.String(80))),
            ("seal_number", sa.Column("seal_number", sa.String(80))),
            ("fuel_surcharge_pct", sa.Column("fuel_surcharge_pct", sa.Numeric(5, 2), server_default="12", nullable=False)),
            ("detention_free_hours", sa.Column("detention_free_hours", sa.Numeric(4, 2), server_default="2", nullable=False)),
            ("detention_rate", sa.Column("detention_rate", sa.Numeric(8, 2), server_default="75", nullable=False)),
            ("recurrence_days", sa.Column("recurrence_days", postgresql.ARRAY(sa.SmallInteger()))),
            ("recurrence_until", sa.Column("recurrence_until", sa.Date())),
            ("recurrence_parent_id", sa.Column("recurrence_parent_id", sa.Uuid())),
            ("checkcall_reminder_hours", sa.Column("checkcall_reminder_hours", sa.SmallInteger())),
            ("reefer_set_point_f", sa.Column("reefer_set_point_f", sa.Numeric(5, 1)))):
        op.add_column("loads", column)
    # Loads booked before the fuel surcharge setting already carry their fuel in the rate or as a charge.
    op.execute("UPDATE loads SET fuel_surcharge_pct = 0")
    op.create_check_constraint(op.f("ck_loads_fuel_pct_range"), "loads", "fuel_surcharge_pct >= 0 AND fuel_surcharge_pct <= 100")
    op.create_check_constraint(op.f("ck_loads_detention_nonneg"), "loads", "detention_free_hours >= 0 AND detention_rate >= 0")
    op.create_check_constraint(op.f("ck_loads_reminder_valid"), "loads",
                               "checkcall_reminder_hours IS NULL OR checkcall_reminder_hours IN (2, 4, 6)")
    op.create_index("ix_loads_org_recurring", "loads", ["organization_id"],
                    postgresql_where=sa.text("recurrence_days IS NOT NULL"))
    op.create_index("ix_loads_org_parent", "loads", ["organization_id", "recurrence_parent_id"],
                    postgresql_where=sa.text("recurrence_parent_id IS NOT NULL"))
    # check calls
    op.add_column("tracking_events", sa.Column("via", sa.String(20)))
    op.add_column("tracking_events", sa.Column("eta", sa.DateTime(timezone=True)))
    # the company's cost rates
    for name, default in (("cost_driver_pay_per_mile", "0.62"), ("cost_mpg", "6.8"), ("cost_fuel_price", "3.92"),
                          ("cost_overhead_per_mile", "1.65")):
        op.add_column("organizations", sa.Column(name, sa.Numeric(8, 3), server_default=default, nullable=False))

    op.create_table(
        "load_tracking_links",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("load_id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("show_eta", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("show_location", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("show_pod", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("show_driver", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("sent_to", sa.String(254)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], name=op.f("fk_load_tracking_links_organization_id"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id", "load_id"], ["loads.organization_id", "loads.id"], name="fk_tracking_links_load", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_load_tracking_links")),
        sa.UniqueConstraint("token", name=op.f("uq_load_tracking_links_token")),
        sa.UniqueConstraint("organization_id", "load_id", name=op.f("uq_load_tracking_links_organization_id_load_id")),
    )
    for statement in secure_tenant_table("load_tracking_links", APP_ROLE, READ_WRITE):
        op.execute(statement)
    op.execute("CREATE POLICY definer_read ON load_tracking_links FOR SELECT TO CURRENT_USER USING (true)")
    op.execute(TRACKING_FN)

    op.create_table(
        "load_activity",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("load_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("text", sa.String(500), nullable=False),
        sa.Column("tone", sa.String(8), server_default="info", nullable=False),
        sa.Column("data", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("actor_user_id", sa.Uuid()),
        sa.Column("actor_name", sa.String(120)),
        sa.Column("at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], name=op.f("fk_load_activity_organization_id"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id", "load_id"], ["loads.organization_id", "loads.id"], name="fk_load_activity_load", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_load_activity")),
    )
    op.create_index("ix_load_activity_load", "load_activity", ["organization_id", "load_id", "at"])
    for statement in secure_tenant_table("load_activity", APP_ROLE, APPEND_ONLY):
        op.execute(statement)
    # the status history so far becomes the start of each load's activity
    op.execute("""
        INSERT INTO load_activity (organization_id, load_id, kind, text, tone, actor_user_id, actor_name, at)
        SELECT e.organization_id, e.load_id, 'status',
               CASE WHEN e.from_status IS NULL THEN 'created the load'
                    ELSE 'moved the load from ' || replace(e.from_status, '_', ' ') || ' to ' || replace(e.to_status, '_', ' ') END
               || COALESCE(' · ' || e.note, ''),
               'info', e.actor_user_id, u.full_name, e.created_at
        FROM load_status_events e LEFT JOIN users u ON u.id = e.actor_user_id
    """)

    op.create_table(
        "reefer_readings",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("load_id", sa.Uuid()),
        sa.Column("trailer_id", sa.Uuid()),
        sa.Column("vehicle_id", sa.Uuid()),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("temp_f", sa.Numeric(5, 1), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], name=op.f("fk_reefer_readings_organization_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reefer_readings")),
    )
    op.create_index("ix_reefer_readings_load", "reefer_readings", ["organization_id", "load_id", "recorded_at"])
    for statement in secure_tenant_table("reefer_readings", APP_ROLE, APPEND_ONLY):
        op.execute(statement)

    # search across the load's numbers, people and places
    op.create_index("ix_loads_org_number", "loads", ["organization_id", "load_number"])


def downgrade() -> None:
    op.drop_index("ix_loads_org_number", table_name="loads")
    op.drop_table("reefer_readings")
    op.drop_table("load_activity")
    op.execute("DROP FUNCTION IF EXISTS public_tracking_link(text)")
    op.drop_table("load_tracking_links")
    for name in ("cost_driver_pay_per_mile", "cost_mpg", "cost_fuel_price", "cost_overhead_per_mile"):
        op.drop_column("organizations", name)
    op.drop_column("tracking_events", "eta")
    op.drop_column("tracking_events", "via")
    op.drop_index("ix_loads_org_parent", table_name="loads")
    op.drop_index("ix_loads_org_recurring", table_name="loads")
    for name in ("ck_loads_reminder_valid", "ck_loads_detention_nonneg", "ck_loads_fuel_pct_range"):
        op.drop_constraint(op.f(name), "loads", type_="check")
    for name in ("reefer_set_point_f", "checkcall_reminder_hours", "recurrence_parent_id", "recurrence_until",
                 "recurrence_days", "detention_rate", "detention_free_hours", "fuel_surcharge_pct", "seal_number",
                 "delivery_number", "pickup_number"):
        op.drop_column("loads", name)
    op.drop_constraint(op.f("ck_load_charges_type_valid"), "load_charges", type_="check")
    op.create_check_constraint(op.f("ck_load_charges_type_valid"), "load_charges",
                               "type IN ('detention', 'layover', 'lumper', 'fuel_surcharge', 'tarp', 'extra_stop', 'tonu', 'other')")
    op.drop_constraint(op.f("ck_load_charges_status_valid"), "load_charges", type_="check")
    op.drop_column("load_charges", "status")
    op.drop_column("load_charges", "managed")
    op.drop_constraint(op.f("ck_load_stops_handling_valid"), "load_stops", type_="check")
    op.execute("DELETE FROM load_stops WHERE type = 'fuel_scale'")
    op.drop_constraint(op.f("ck_load_stops_type_valid"), "load_stops", type_="check")
    op.create_check_constraint(op.f("ck_load_stops_type_valid"), "load_stops", "type IN ('pickup','delivery')")
    op.drop_column("load_stops", "handling")
