"""Roadside inspections as FMCSA records them: a level, the truck and its trailer on one report, where it came
from, and what is left to do (review, certify the repairs of an out-of-service order, a DataQs challenge);
violations with their regulation code, the unit or driver they were against, and their severity points.

Revision ID: 0019
Revises: 0018
"""
import os

import sqlalchemy as sa

from alembic import op

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")
# What is done about an inspection afterwards may change; what it found may not (the table stays append-only).
FOLLOW_UP = "status, certified_at, certified_by, dataqs_reference, dataqs_filed_at, updated_at"

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name, column in (("level", sa.Integer()), ("source", sa.String(15)), ("status", sa.String(20)),
                         ("repairs_due_on", sa.Date()), ("certified_at", sa.DateTime(timezone=True)),
                         ("certified_by", sa.Uuid()), ("dataqs_reference", sa.String(40)),
                         ("dataqs_filed_at", sa.DateTime(timezone=True))):
        default = {"source": "entered", "status": "reviewed"}.get(name)
        op.add_column("inspections", sa.Column(name, column, nullable=default is None,
                                               server_default=default))
    op.drop_constraint(op.f("ck_inspections_one_unit"), "inspections", type_="check")
    op.create_check_constraint(op.f("ck_inspections_some_unit"), "inspections",
                               "vehicle_id IS NOT NULL OR trailer_id IS NOT NULL")
    op.create_check_constraint(op.f("ck_inspections_level_valid"), "inspections", "level IS NULL OR level BETWEEN 1 AND 6")
    op.create_check_constraint(op.f("ck_inspections_status_valid"), "inspections",
                               "status IN ('needs_review', 'reviewed', 'repairs_certified', 'dataqs_filed')")
    op.create_check_constraint(op.f("ck_inspections_source_valid"), "inspections",
                               "source IN ('entered', 'scan', 'driver_app', 'fmcsa')")
    op.add_column("inspection_defects", sa.Column("code", sa.String(30), nullable=True))
    op.add_column("inspection_defects", sa.Column("against", sa.String(10), nullable=True))
    op.add_column("inspection_defects", sa.Column("points", sa.Integer(), nullable=True))
    op.create_check_constraint(op.f("ck_inspection_defects_against_valid"), "inspection_defects",
                               "against IS NULL OR against IN ('vehicle', 'trailer', 'driver')")
    op.create_check_constraint(op.f("ck_inspection_defects_points_valid"), "inspection_defects",
                               "points IS NULL OR points BETWEEN 0 AND 12")
    op.execute(f"GRANT UPDATE ({FOLLOW_UP}) ON inspections TO {APP_ROLE}")


def downgrade() -> None:
    op.execute(f"REVOKE UPDATE ({FOLLOW_UP}) ON inspections FROM {APP_ROLE}")
    op.drop_constraint(op.f("ck_inspection_defects_points_valid"), "inspection_defects", type_="check")
    op.drop_constraint(op.f("ck_inspection_defects_against_valid"), "inspection_defects", type_="check")
    for name in ("points", "against", "code"):
        op.drop_column("inspection_defects", name)
    for name in ("source_valid", "status_valid", "level_valid", "some_unit"):
        op.drop_constraint(op.f(f"ck_inspections_{name}"), "inspections", type_="check")
    # A report with both units keeps the truck: the old rule allowed one.
    op.execute("UPDATE inspections SET trailer_id = NULL WHERE vehicle_id IS NOT NULL AND trailer_id IS NOT NULL")
    op.create_check_constraint(op.f("ck_inspections_one_unit"), "inspections",
                               "(vehicle_id IS NULL) <> (trailer_id IS NULL)")
    for name in ("dataqs_filed_at", "dataqs_reference", "certified_by", "certified_at", "repairs_due_on", "status",
                 "source", "level"):
        op.drop_column("inspections", name)
