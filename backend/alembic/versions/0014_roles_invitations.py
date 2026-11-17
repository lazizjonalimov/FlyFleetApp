"""Roles a company changes or makes for itself, one person's exceptions to their role, and invitations by link.

A membership's role is now a key: one of FlyFleet's roles, or one of the company's custom roles. An invitation link
is looked up before anyone is signed in, so that one lookup goes through a SECURITY DEFINER function that answers
only for the hash of the link's secret.

Revision ID: 0014
Revises: 0013
"""
import os

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.core.rls import NO_DELETE, READ_WRITE, secure_tenant_table

revision = '0014'
down_revision = '0013'
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")
ROLES_0005 = ("('owner','admin','dispatcher','safety_manager','fleet_manager','accountant','viewer','driver','customer',"
              "'owner_portal')")


def upgrade() -> None:
    op.create_table('invitations',
    sa.Column('email', sa.String(length=254), nullable=False),
    sa.Column('full_name', sa.String(length=120), nullable=False),
    sa.Column('role', sa.String(length=40), nullable=False),
    sa.Column('driver_id', sa.Uuid(), nullable=True),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('invited_by', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('accepted_user_id', sa.Uuid(), nullable=True),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_invitations_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_invitations')),
    sa.UniqueConstraint('token_hash', name='uq_invitations_token')
    )
    op.create_index('uq_invitations_open_email', 'invitations', ['organization_id', 'email'], unique=True, postgresql_where=sa.text('accepted_at IS NULL AND revoked_at IS NULL'))
    op.create_table('org_roles',
    sa.Column('key', sa.String(length=40), nullable=False),
    sa.Column('name', sa.String(length=60), nullable=False),
    sa.Column('description', sa.String(length=200), nullable=True),
    sa.Column('template', sa.String(length=30), nullable=True),
    sa.Column('custom', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('permissions', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_by', sa.Uuid(), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.CheckConstraint("key ~ '^[a-z][a-z0-9_]{1,39}$'", name=op.f('ck_org_roles_key_format')),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_org_roles_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_org_roles')),
    sa.UniqueConstraint('organization_id', 'key', name='uq_org_roles_key')
    )
    op.create_table('permission_overrides',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('permission', sa.String(length=60), nullable=False),
    sa.Column('effect', sa.String(length=5), nullable=False),
    sa.Column('note', sa.String(length=200), nullable=True),
    sa.Column('created_by', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.CheckConstraint("effect IN ('allow', 'deny')", name=op.f('ck_permission_overrides_effect_valid')),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_permission_overrides_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_permission_overrides')),
    sa.UniqueConstraint('organization_id', 'user_id', 'permission', name='uq_permission_overrides')
    )
    for table, privileges in (('org_roles', READ_WRITE), ('permission_overrides', READ_WRITE),
                              ('invitations', NO_DELETE)):
        for statement in secure_tenant_table(table, APP_ROLE, privileges):
            op.execute(statement)
    # Custom roles: a membership's role is any well-formed key; the API checks it is one of the company's.
    op.drop_constraint(op.f("ck_organization_memberships_role_valid"), "organization_memberships", type_="check")
    op.create_check_constraint(op.f("ck_organization_memberships_role_valid"), "organization_memberships",
                               "role ~ '^[a-z][a-z0-9_]{1,39}$'")
    # What the schema owner may read, for the lookup function below (it answers for one link's hash only).
    for table in ("invitations", "org_roles"):
        op.execute(f"CREATE POLICY definer_read ON {table} FOR SELECT TO CURRENT_USER USING (true)")
    op.execute(
        """
        CREATE FUNCTION auth_lookup_invitation(p_hash text)
        RETURNS TABLE (id uuid, organization_id uuid, organization_name text, email text, full_name text, role text,
                       custom_role_name text, driver_id uuid, invited_by_name text, expires_at timestamptz,
                       accepted_at timestamptz, revoked_at timestamptz)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT i.id, i.organization_id, o.name::text, i.email::text, i.full_name::text, i.role::text,
                  r.name::text, i.driver_id, u.full_name::text, i.expires_at, i.accepted_at, i.revoked_at
           FROM invitations i
           JOIN organizations o ON o.id = i.organization_id
           LEFT JOIN org_roles r ON r.organization_id = i.organization_id AND r.key = i.role
           LEFT JOIN users u ON u.id = i.invited_by
           WHERE i.token_hash = p_hash AND o.status = 'active' $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION auth_lookup_invitation(text) FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION auth_lookup_invitation(text) TO {APP_ROLE}")


def downgrade() -> None:
    op.execute("DROP FUNCTION auth_lookup_invitation(text)")
    for table in ("invitations", "org_roles"):
        op.execute(f"DROP POLICY IF EXISTS definer_read ON {table}")
    op.drop_constraint(op.f("ck_organization_memberships_role_valid"), "organization_memberships", type_="check")
    op.create_check_constraint(op.f("ck_organization_memberships_role_valid"), "organization_memberships",
                               f"role IN {ROLES_0005}")
    op.drop_table('permission_overrides')
    op.drop_table('org_roles')
    op.drop_index('uq_invitations_open_email', table_name='invitations', postgresql_where=sa.text('accepted_at IS NULL AND revoked_at IS NULL'))
    op.drop_table('invitations')
