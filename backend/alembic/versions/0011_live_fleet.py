"""Live fleet: truck positions, geofences, fleet alert policies with their versions, and incidents with their
trail. Positions, incident events and policy versions are append-only.

Revision ID: 0011
Revises: 0010
"""
import os

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.core.rls import APPEND_ONLY, READ_WRITE, secure_tenant_table

revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")


def upgrade() -> None:
    op.create_table('alert_policies',
    sa.Column('kind', sa.String(length=12), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('enabled', sa.Boolean(), server_default='true', nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('settings', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('recipients', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('message', sa.Text(), nullable=True),
    sa.Column('applies_to', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('updated_by', sa.Uuid(), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.CheckConstraint("kind IN ('speeding', 'yard_speed', 'dwell', 'gps_stale')", name=op.f('ck_alert_policies_kind_valid')),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_alert_policies_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_alert_policies')),
    sa.UniqueConstraint('organization_id', 'id', name=op.f('uq_alert_policies_organization_id_id'))
    )
    op.create_table('geofences',
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('kind', sa.String(length=10), server_default='customer', nullable=False),
    sa.Column('lat', sa.Numeric(precision=9, scale=6), nullable=False),
    sa.Column('lon', sa.Numeric(precision=9, scale=6), nullable=False),
    sa.Column('radius_m', sa.Integer(), server_default='400', nullable=False),
    sa.Column('customer_id', sa.Uuid(), nullable=True),
    sa.Column('active', sa.Boolean(), server_default='true', nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.CheckConstraint("kind IN ('customer', 'yard', 'shop', 'other')", name=op.f('ck_geofences_kind_valid')),
    sa.CheckConstraint('radius_m BETWEEN 50 AND 20000', name=op.f('ck_geofences_radius_valid')),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_geofences_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_geofences')),
    sa.UniqueConstraint('organization_id', 'id', name=op.f('uq_geofences_organization_id_id'))
    )
    op.create_table('incidents',
    sa.Column('number', sa.String(length=20), nullable=False),
    sa.Column('kind', sa.String(length=15), nullable=False),
    sa.Column('severity', sa.String(length=6), server_default='medium', nullable=False),
    sa.Column('state', sa.String(length=12), server_default='open', nullable=False),
    sa.Column('episode_key', sa.String(length=120), nullable=False),
    sa.Column('title', sa.String(length=160), nullable=False),
    sa.Column('detail', sa.String(length=300), nullable=True),
    sa.Column('vehicle_id', sa.Uuid(), nullable=True),
    sa.Column('driver_id', sa.Uuid(), nullable=True),
    sa.Column('load_id', sa.Uuid(), nullable=True),
    sa.Column('policy_id', sa.Uuid(), nullable=True),
    sa.Column('policy_version', sa.Integer(), nullable=True),
    sa.Column('detected_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('cleared_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('peak', sa.Numeric(precision=8, scale=1), nullable=True),
    sa.Column('owner_user_id', sa.Uuid(), nullable=True),
    sa.Column('escalate_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('escalated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('acknowledged_by', sa.Uuid(), nullable=True),
    sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('resolved_by', sa.Uuid(), nullable=True),
    sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('resolution', sa.String(length=300), nullable=True),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.CheckConstraint("kind IN ('speeding', 'yard_speed', 'dwell', 'gps_stale', 'late', 'at_risk', 'unassigned', 'pod_missing', 'out_of_service', 'documents')", name=op.f('ck_incidents_kind_valid')),
    sa.CheckConstraint("severity IN ('high', 'medium', 'low')", name=op.f('ck_incidents_severity_valid')),
    sa.CheckConstraint("state IN ('watching', 'open', 'notified', 'acknowledged', 'resolved')", name=op.f('ck_incidents_state_valid')),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_incidents_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_incidents')),
    sa.UniqueConstraint('organization_id', 'id', name=op.f('uq_incidents_organization_id_id')),
    sa.UniqueConstraint('organization_id', 'number', name='uq_incidents_number')
    )
    op.create_index('ix_incidents_org_state', 'incidents', ['organization_id', 'state', 'detected_at'], unique=False)
    op.create_index('ix_incidents_org_vehicle', 'incidents', ['organization_id', 'vehicle_id'], unique=False)
    op.create_index('uq_incidents_open_episode', 'incidents', ['organization_id', 'episode_key'], unique=True, postgresql_where=sa.text("state <> 'resolved'"))
    op.create_table('alert_policy_versions',
    sa.Column('policy_id', sa.Uuid(), nullable=False),
    sa.Column('version', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('enabled', sa.Boolean(), nullable=False),
    sa.Column('settings', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('recipients', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('message', sa.Text(), nullable=True),
    sa.Column('applies_to', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('note', sa.String(length=300), nullable=True),
    sa.Column('saved_by', sa.Uuid(), nullable=True),
    sa.Column('saved_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['organization_id', 'policy_id'], ['alert_policies.organization_id', 'alert_policies.id'], name='fk_alert_policy_versions_policy', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_alert_policy_versions_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_alert_policy_versions')),
    sa.UniqueConstraint('organization_id', 'policy_id', 'version', name='uq_alert_policy_versions')
    )
    op.create_table('incident_events',
    sa.Column('incident_id', sa.Uuid(), nullable=False),
    sa.Column('kind', sa.String(length=15), nullable=False),
    sa.Column('at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('text', sa.String(length=300), nullable=False),
    sa.Column('tone', sa.String(length=6), server_default='info', nullable=False),
    sa.Column('actor_user_id', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['organization_id', 'incident_id'], ['incidents.organization_id', 'incidents.id'], name='fk_incident_events_incident', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_incident_events_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_incident_events'))
    )
    op.create_index('ix_incident_events_org_incident', 'incident_events', ['organization_id', 'incident_id', 'at'], unique=False)
    op.create_table('vehicle_positions',
    sa.Column('vehicle_id', sa.Uuid(), nullable=False),
    sa.Column('driver_id', sa.Uuid(), nullable=True),
    sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('received_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('lat', sa.Numeric(precision=9, scale=6), nullable=False),
    sa.Column('lon', sa.Numeric(precision=9, scale=6), nullable=False),
    sa.Column('speed_mph', sa.Numeric(precision=5, scale=1), nullable=True),
    sa.Column('heading', sa.SmallInteger(), nullable=True),
    sa.Column('accuracy_m', sa.Integer(), nullable=True),
    sa.Column('odometer_mi', sa.Integer(), nullable=True),
    sa.Column('source', sa.String(length=12), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.CheckConstraint("source IN ('telematics', 'driver_app', 'manual')", name=op.f('ck_vehicle_positions_source_valid')),
    sa.CheckConstraint('heading IS NULL OR heading BETWEEN 0 AND 359', name=op.f('ck_vehicle_positions_heading_valid')),
    sa.CheckConstraint('lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180', name=op.f('ck_vehicle_positions_lat_lon_valid')),
    sa.CheckConstraint('speed_mph IS NULL OR speed_mph >= 0', name=op.f('ck_vehicle_positions_speed_nonneg')),
    sa.ForeignKeyConstraint(['organization_id', 'vehicle_id'], ['vehicles.organization_id', 'vehicles.id'], name='fk_vehicle_positions_vehicle', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_vehicle_positions_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_vehicle_positions')),
    sa.UniqueConstraint('organization_id', 'vehicle_id', 'recorded_at', 'source', name='uq_vehicle_positions_sample')
    )
    op.create_index('ix_vehicle_positions_org_vehicle_time', 'vehicle_positions', ['organization_id', 'vehicle_id', 'recorded_at'], unique=False)
    op.add_column('organizations', sa.Column('incident_seq', sa.Integer(), server_default='0', nullable=False))
    for table, privileges in (('alert_policies', READ_WRITE), ('alert_policy_versions', APPEND_ONLY),
                              ('geofences', READ_WRITE), ('incidents', READ_WRITE), ('incident_events', APPEND_ONLY),
                              ('vehicle_positions', APPEND_ONLY)):
        for statement in secure_tenant_table(table, APP_ROLE, privileges):
            op.execute(statement)


def downgrade() -> None:
    op.drop_column('organizations', 'incident_seq')
    op.drop_index('ix_vehicle_positions_org_vehicle_time', table_name='vehicle_positions')
    op.drop_table('vehicle_positions')
    op.drop_index('ix_incident_events_org_incident', table_name='incident_events')
    op.drop_table('incident_events')
    op.drop_table('alert_policy_versions')
    op.drop_index('uq_incidents_open_episode', table_name='incidents', postgresql_where=sa.text("state <> 'resolved'"))
    op.drop_index('ix_incidents_org_vehicle', table_name='incidents')
    op.drop_index('ix_incidents_org_state', table_name='incidents')
    op.drop_table('incidents')
    op.drop_table('geofences')
    op.drop_table('alert_policies')
