"""Fuel tax (IFTA): rates per quarter, miles by truck and jurisdiction, and the quarterly return. Imports also take
mileage files.

Revision ID: 0010
Revises: 0009
"""
import os

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.core.rls import READ_WRITE, secure_tenant_table

revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")


def _tenant(name: str) -> list:
    return [sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
            sa.Column('organization_id', sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f(f'fk_{name}_organization_id'),
                                    ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id', name=op.f(f'pk_{name}'))]


def upgrade() -> None:
    op.create_table(
        'ifta_rates',
        sa.Column('quarter', sa.String(6), nullable=False),
        sa.Column('jurisdiction', sa.String(2), nullable=False),
        sa.Column('fuel_type', sa.String(10), server_default='diesel', nullable=False),
        sa.Column('rate', sa.Numeric(8, 4), nullable=False),
        sa.Column('surcharge', sa.Numeric(8, 4), server_default='0', nullable=False),
        sa.Column('source', sa.String(10), server_default='manual', nullable=False),
        sa.Column('updated_by', sa.Uuid(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        *_tenant('ifta_rates'),
        sa.UniqueConstraint('organization_id', 'quarter', 'jurisdiction', 'fuel_type', name='uq_ifta_rates_quarter'),
        sa.CheckConstraint('rate >= 0 AND surcharge >= 0', name=op.f('ck_ifta_rates_rate_nonneg')),
        sa.CheckConstraint("quarter ~ '^[0-9]{4}Q[1-4]$'", name=op.f('ck_ifta_rates_quarter_valid')),
    )
    op.create_table(
        'ifta_trips',
        sa.Column('vehicle_id', sa.Uuid(), nullable=False),
        sa.Column('trip_date', sa.Date(), nullable=False),
        sa.Column('load_id', sa.Uuid(), nullable=True),
        sa.Column('source', sa.String(10), nullable=False),
        sa.Column('odometer_start', sa.Integer(), nullable=True),
        sa.Column('odometer_end', sa.Integer(), nullable=True),
        sa.Column('held', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('note', sa.String(300), nullable=True),
        sa.Column('import_id', sa.Uuid(), nullable=True),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        *_tenant('ifta_trips'),
        sa.CheckConstraint("source IN ('gps', 'import', 'manual')", name=op.f('ck_ifta_trips_source_valid')),
        sa.CheckConstraint('odometer_end IS NULL OR odometer_start IS NULL OR odometer_end >= odometer_start',
                           name=op.f('ck_ifta_trips_odometer_order')),
        sa.ForeignKeyConstraint(['organization_id', 'vehicle_id'], ['vehicles.organization_id', 'vehicles.id'],
                                name='fk_ifta_trips_vehicle', ondelete='CASCADE'),
        sa.UniqueConstraint('organization_id', 'id', name=op.f('uq_ifta_trips_organization_id_id')),
    )
    op.create_index('ix_ifta_trips_org_date', 'ifta_trips', ['organization_id', 'trip_date'])
    op.create_table(
        'ifta_trip_miles',
        sa.Column('trip_id', sa.Uuid(), nullable=False),
        sa.Column('jurisdiction', sa.String(2), nullable=False),
        sa.Column('miles', sa.Numeric(10, 1), nullable=False),
        *_tenant('ifta_trip_miles'),
        sa.CheckConstraint('miles >= 0', name=op.f('ck_ifta_trip_miles_miles_nonneg')),
        sa.ForeignKeyConstraint(['organization_id', 'trip_id'], ['ifta_trips.organization_id', 'ifta_trips.id'],
                                name='fk_ifta_trip_miles_trip', ondelete='CASCADE'),
    )
    op.create_index('ix_ifta_trip_miles_org_trip', 'ifta_trip_miles', ['organization_id', 'trip_id'])
    op.create_table(
        'ifta_returns',
        sa.Column('quarter', sa.String(6), nullable=False),
        sa.Column('status', sa.String(12), server_default='collecting', nullable=False),
        sa.Column('base_jurisdiction', sa.String(2), nullable=True),
        sa.Column('lines', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('total_miles', sa.Numeric(12, 1), nullable=True),
        sa.Column('total_gallons', sa.Numeric(12, 3), nullable=True),
        sa.Column('net_tax', sa.Numeric(12, 2), nullable=True),
        sa.Column('reviewed_by', sa.Uuid(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('approved_by', sa.Uuid(), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('filed_on', sa.Date(), nullable=True),
        sa.Column('filed_reference', sa.String(80), nullable=True),
        sa.Column('paid_on', sa.Date(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        *_tenant('ifta_returns'),
        sa.UniqueConstraint('organization_id', 'quarter', name='uq_ifta_returns_quarter'),
        sa.CheckConstraint("status IN ('collecting', 'in_review', 'approved', 'filed', 'paid')",
                           name=op.f('ck_ifta_returns_status_valid')),
    )
    for table in ('ifta_rates', 'ifta_trips', 'ifta_trip_miles', 'ifta_returns'):
        for statement in secure_tenant_table(table, APP_ROLE, READ_WRITE):
            op.execute(statement)
    op.drop_constraint(op.f('ck_imports_kind_valid'), 'imports', type_='check')
    op.create_check_constraint(op.f('ck_imports_kind_valid'), 'imports', "kind IN ('drivers', 'trucks', 'trailers', 'mileage')")


def downgrade() -> None:
    op.drop_constraint(op.f('ck_imports_kind_valid'), 'imports', type_='check')
    op.create_check_constraint(op.f('ck_imports_kind_valid'), 'imports', "kind IN ('drivers', 'trucks', 'trailers')")
    op.drop_table('ifta_returns')
    op.drop_index('ix_ifta_trip_miles_org_trip', table_name='ifta_trip_miles')
    op.drop_table('ifta_trip_miles')
    op.drop_index('ix_ifta_trips_org_date', table_name='ifta_trips')
    op.drop_table('ifta_trips')
    op.drop_table('ifta_rates')
