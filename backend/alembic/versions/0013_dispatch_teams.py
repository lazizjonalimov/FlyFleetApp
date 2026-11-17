"""Dispatch teams: groups of trucks with the dispatchers who work them. A team's dispatchers see only its trucks and
what is tied to them. Loads can be tagged for a team before they are on a truck, and the company chooses what a
dispatcher on no team sees.

Revision ID: 0013
Revises: 0012
"""
import os

import sqlalchemy as sa

from alembic import op
from app.core.rls import READ_WRITE, secure_tenant_table

revision = '0013'
down_revision = '0012'
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")


def upgrade() -> None:
    op.create_table('dispatch_teams',
    sa.Column('name', sa.String(length=60), nullable=False),
    sa.Column('color', sa.String(length=7), server_default='#1F4FE0', nullable=False),
    sa.Column('lead_user_id', sa.Uuid(), nullable=True),
    sa.Column('unassigned_loads', sa.String(length=10), server_default='tagged', nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.CheckConstraint("unassigned_loads IN ('tagged', 'shared')", name=op.f('ck_dispatch_teams_unassigned_valid')),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_dispatch_teams_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_dispatch_teams')),
    sa.UniqueConstraint('organization_id', 'id', name=op.f('uq_dispatch_teams_organization_id_id')),
    sa.UniqueConstraint('organization_id', 'name', name='uq_dispatch_teams_name')
    )
    op.create_table('dispatch_team_members',
    sa.Column('team_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('added_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['organization_id', 'team_id'], ['dispatch_teams.organization_id', 'dispatch_teams.id'], name='fk_dispatch_team_members_team', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_dispatch_team_members_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_dispatch_team_members')),
    sa.UniqueConstraint('organization_id', 'user_id', name='uq_dispatch_team_members_user')
    )
    op.create_table('dispatch_team_vehicles',
    sa.Column('team_id', sa.Uuid(), nullable=False),
    sa.Column('vehicle_id', sa.Uuid(), nullable=False),
    sa.Column('added_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['organization_id', 'team_id'], ['dispatch_teams.organization_id', 'dispatch_teams.id'], name='fk_dispatch_team_vehicles_team', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id', 'vehicle_id'], ['vehicles.organization_id', 'vehicles.id'], name='fk_dispatch_team_vehicles_vehicle', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_dispatch_team_vehicles_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_dispatch_team_vehicles')),
    sa.UniqueConstraint('organization_id', 'vehicle_id', name='uq_dispatch_team_vehicles_vehicle')
    )
    op.add_column('loads', sa.Column('dispatch_team_id', sa.Uuid(), nullable=True))
    op.add_column('organizations', sa.Column('dispatchers_without_team', sa.String(length=4), server_default='all', nullable=False))
    op.create_check_constraint('ck_organizations_dispatchers_without_team_valid', 'organizations',
                               "dispatchers_without_team IN ('all', 'none')")
    op.create_index('ix_loads_org_dispatch_team', 'loads', ['organization_id', 'dispatch_team_id'], unique=False,
                    postgresql_where=sa.text('dispatch_team_id IS NOT NULL'))
    for table in ('dispatch_teams', 'dispatch_team_members', 'dispatch_team_vehicles'):
        for statement in secure_tenant_table(table, APP_ROLE, READ_WRITE):
            op.execute(statement)


def downgrade() -> None:
    op.drop_index('ix_loads_org_dispatch_team', table_name='loads', postgresql_where=sa.text('dispatch_team_id IS NOT NULL'))
    op.drop_constraint('ck_organizations_dispatchers_without_team_valid', 'organizations', type_='check')
    op.drop_column('organizations', 'dispatchers_without_team')
    op.drop_column('loads', 'dispatch_team_id')
    op.drop_table('dispatch_team_vehicles')
    op.drop_table('dispatch_team_members')
    op.drop_table('dispatch_teams')
