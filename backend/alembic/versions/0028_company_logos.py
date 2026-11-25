"""Company logos: a picture a company can show instead of its coloured initials. Each person's company lists
say when the logo last changed, so it can be shown (and re-fetched when it changes) wherever the company's mark is.

Revision ID: 0028
Revises: 0027
"""
import os

import sqlalchemy as sa

from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")
USR = "nullif(current_setting('app.user_id', true), '')::uuid"

ORGS_NEW = """
        CREATE FUNCTION auth_user_organizations(p_user_id uuid)
        RETURNS TABLE (organization_id uuid, name text, slug text, role text, status text, account_id uuid,
                       code text, color text, mc_number text, logo_updated_at timestamptz)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT o.id, o.name::text, o.slug::text, m.role::text, o.status::text, o.account_id,
                  o.code::text, o.color::text, o.mc_number::text, o.logo_updated_at
           FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
           WHERE m.user_id = p_user_id AND m.active AND (o.status = 'active' OR m.role = 'owner')
           ORDER BY (o.status = 'archived'), o.name $$
        """
COMP_NEW = f"""
        CREATE FUNCTION auth_user_companies(p_user_id uuid)
        RETURNS TABLE (organization_id uuid, name text, slug text, code text, color text, mc_number text,
                       dot_number text, home_state text, status text, archived_at timestamptz, role text,
                       role_name text, member_since timestamptz, last_opened_at timestamptz,
                       drivers bigint, trucks bigint, people bigint, main_admins bigint,
                       logo_updated_at timestamptz)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT o.id, o.name::text, o.slug::text, o.code::text, o.color::text, o.mc_number::text,
                  o.dot_number::text, o.state::text, o.status::text, o.archived_at, m.role::text,
                  (SELECT r.name::text FROM org_roles r WHERE r.organization_id = o.id AND r.key = m.role),
                  m.created_at, m.last_opened_at,
                  (SELECT count(*) FROM drivers d WHERE d.organization_id = o.id AND d.status = 'active'),
                  (SELECT count(*) FROM vehicles v WHERE v.organization_id = o.id
                     AND v.status NOT IN ('retired', 'transferred')),
                  (SELECT count(*) FROM organization_memberships x WHERE x.organization_id = o.id AND x.active),
                  (SELECT count(*) FROM organization_memberships x WHERE x.organization_id = o.id AND x.active
                     AND x.role = 'owner'),
                  o.logo_updated_at
           FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
           WHERE m.user_id = p_user_id AND p_user_id = {USR} AND m.active
             AND (o.status = 'active' OR m.role = 'owner')
           ORDER BY (o.status = 'archived'), o.name $$
        """
ORGS_OLD = """
        CREATE FUNCTION auth_user_organizations(p_user_id uuid)
        RETURNS TABLE (organization_id uuid, name text, slug text, role text, status text, account_id uuid,
                       code text, color text, mc_number text)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT o.id, o.name::text, o.slug::text, m.role::text, o.status::text, o.account_id,
                  o.code::text, o.color::text, o.mc_number::text
           FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
           WHERE m.user_id = p_user_id AND m.active AND (o.status = 'active' OR m.role = 'owner')
           ORDER BY (o.status = 'archived'), o.name $$
        """
COMP_OLD = f"""
        CREATE FUNCTION auth_user_companies(p_user_id uuid)
        RETURNS TABLE (organization_id uuid, name text, slug text, code text, color text, mc_number text,
                       dot_number text, home_state text, status text, archived_at timestamptz, role text,
                       role_name text, member_since timestamptz, last_opened_at timestamptz,
                       drivers bigint, trucks bigint, people bigint, main_admins bigint)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT o.id, o.name::text, o.slug::text, o.code::text, o.color::text, o.mc_number::text,
                  o.dot_number::text, o.state::text, o.status::text, o.archived_at, m.role::text,
                  (SELECT r.name::text FROM org_roles r WHERE r.organization_id = o.id AND r.key = m.role),
                  m.created_at, m.last_opened_at,
                  (SELECT count(*) FROM drivers d WHERE d.organization_id = o.id AND d.status = 'active'),
                  (SELECT count(*) FROM vehicles v WHERE v.organization_id = o.id
                     AND v.status NOT IN ('retired', 'transferred')),
                  (SELECT count(*) FROM organization_memberships x WHERE x.organization_id = o.id AND x.active),
                  (SELECT count(*) FROM organization_memberships x WHERE x.organization_id = o.id AND x.active
                     AND x.role = 'owner')
           FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
           WHERE m.user_id = p_user_id AND p_user_id = {USR} AND m.active
             AND (o.status = 'active' OR m.role = 'owner')
           ORDER BY (o.status = 'archived'), o.name $$
        """


def _functions(orgs: str, companies: str) -> None:
    op.execute("DROP FUNCTION IF EXISTS auth_user_organizations(uuid)")
    op.execute("DROP FUNCTION IF EXISTS auth_user_companies(uuid)")
    op.execute(orgs)
    op.execute(companies)
    for fn in ("auth_user_organizations(uuid)", "auth_user_companies(uuid)"):
        op.execute(f"REVOKE ALL ON FUNCTION {fn} FROM PUBLIC")
        op.execute(f"GRANT EXECUTE ON FUNCTION {fn} TO {APP_ROLE}")


def upgrade() -> None:
    op.add_column("organizations", sa.Column("logo_key", sa.String(120), nullable=True))
    op.add_column("organizations", sa.Column("logo_updated_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(f"GRANT UPDATE (logo_key, logo_updated_at) ON organizations TO {APP_ROLE}")
    _functions(ORGS_NEW, COMP_NEW)


def downgrade() -> None:
    _functions(ORGS_OLD, COMP_OLD)
    op.execute(f"REVOKE UPDATE (logo_key, logo_updated_at) ON organizations FROM {APP_ROLE}")
    op.drop_column("organizations", "logo_updated_at")
    op.drop_column("organizations", "logo_key")
