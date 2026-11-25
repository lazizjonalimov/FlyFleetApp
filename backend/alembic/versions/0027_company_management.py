"""Company management for a profile: up to ten companies (active and archived together), a default company,
when each was last opened, invitation codes, declined invitations, and an MC number used by one company only.

A person's company list spans tenants, so it is read through SECURITY DEFINER functions that answer only for
the person asking (``app.user_id``). Archived companies are open to their Main Admins only: everyone else's
access ends when a company is archived.

Revision ID: 0027
Revises: 0026
"""
import os

import sqlalchemy as sa

from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")
USR = "nullif(current_setting('app.user_id', true), '')::uuid"
MC = "nullif(regexp_replace(coalesce(mc_number, ''), '[^0-9]', '', 'g'), '')"


def upgrade() -> None:
    op.add_column("users", sa.Column("default_organization_id", sa.Uuid(), nullable=True))
    op.execute(f"GRANT UPDATE (default_organization_id) ON users TO {APP_ROLE}")
    op.add_column("organization_memberships", sa.Column("last_opened_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("organizations", sa.Column("fleet_size", sa.String(8), nullable=True))
    op.create_check_constraint(op.f("ck_organizations_fleet_size_valid"), "organizations",
                               "fleet_size IS NULL OR fleet_size IN ('1-5', '6-20', '21-50', '51+')")
    op.add_column("invitations", sa.Column("code_hash", sa.String(64), nullable=True))
    op.add_column("invitations", sa.Column("declined_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("uq_invitations_code", "invitations", ["code_hash"], unique=True,
                    postgresql_where=sa.text("code_hash IS NOT NULL"))

    # One company per MC number across FlyFleet, compared by its digits ("MC-123456" is 123456).
    dupes = op.get_bind().execute(sa.text(
        f"SELECT {MC} AS mc, count(*) FROM organizations WHERE {MC} IS NOT NULL GROUP BY 1 HAVING count(*) > 1")).all()
    if dupes:
        raise RuntimeError("These MC numbers are used by more than one company; fix them before upgrading: "
                           + ", ".join(row.mc for row in dupes))
    op.execute(f"CREATE UNIQUE INDEX uq_organizations_mc ON organizations (({MC})) WHERE {MC} IS NOT NULL")

    # The functions below count a company's drivers and trucks for its members; they run as the schema owner,
    # which row-level security also binds (FORCE), so the owner gets a read policy as on the identity tables.
    for table in ("drivers", "vehicles"):
        op.execute(f"CREATE POLICY definer_read ON {table} FOR SELECT TO CURRENT_USER USING (true)")

    # Archived companies: open to their Main Admins only.
    op.execute("DROP FUNCTION IF EXISTS auth_user_organizations(uuid)")
    op.execute(
        """
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
    )

    # Your companies with what the switcher and the Companies page show about each. Answers only for yourself.
    op.execute(
        f"""
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
    )

    # Whether an MC number is already used by a company on FlyFleet. Says nothing else about it.
    op.execute(
        f"""
        CREATE FUNCTION auth_mc_taken(p_mc text)
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT EXISTS (SELECT 1 FROM organizations WHERE {MC} = nullif(regexp_replace(p_mc, '[^0-9]', '', 'g'), '')) $$
        """
    )

    # Open invitations: by the hash of a code someone typed, or the ones sent to your own email after your
    # sign-in existed (so nobody can claim invitations by signing up with someone else's address).
    columns = """i.id, i.organization_id, i.email::text, i.role::text,
                  (SELECT r.name::text FROM org_roles r WHERE r.organization_id = i.organization_id AND r.key = i.role),
                  (SELECT u.full_name::text FROM users u WHERE u.id = i.invited_by),
                  i.created_at, i.expires_at, o.name::text, o.code::text, o.color::text, o.mc_number::text,
                  o.slug::text,
                  (SELECT count(*) FROM drivers d WHERE d.organization_id = o.id AND d.status = 'active'),
                  (SELECT count(*) FROM vehicles v WHERE v.organization_id = o.id
                     AND v.status NOT IN ('retired', 'transferred'))"""
    returns = """invitation_id uuid, organization_id uuid, email text, role text, role_name text,
                       invited_by_name text, created_at timestamptz, expires_at timestamptz, org_name text,
                       org_code text, org_color text, org_mc text, org_slug text, drivers bigint, trucks bigint"""
    is_open = ("i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.declined_at IS NULL AND i.expires_at > now() "
               "AND i.driver_id IS NULL AND o.status = 'active'")
    op.execute(
        f"""
        CREATE FUNCTION auth_invitation_by_code(p_code_hash text)
        RETURNS TABLE ({returns}) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT {columns} FROM invitations i JOIN organizations o ON o.id = i.organization_id
           WHERE i.code_hash = p_code_hash AND {is_open} $$
        """
    )
    op.execute(
        f"""
        CREATE FUNCTION auth_invitations_for_user(p_user_id uuid)
        RETURNS TABLE ({returns}) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT {columns} FROM invitations i JOIN organizations o ON o.id = i.organization_id
           JOIN users me ON me.id = p_user_id
           WHERE p_user_id = {USR} AND i.email = me.email AND i.created_at > me.created_at AND {is_open}
             AND NOT EXISTS (SELECT 1 FROM organization_memberships m
                             WHERE m.organization_id = i.organization_id AND m.user_id = p_user_id AND m.active)
           ORDER BY i.created_at DESC $$
        """
    )
    for fn in ("auth_user_organizations(uuid)", "auth_user_companies(uuid)", "auth_mc_taken(text)",
               "auth_invitation_by_code(text)", "auth_invitations_for_user(uuid)"):
        op.execute(f"REVOKE ALL ON FUNCTION {fn} FROM PUBLIC")
        op.execute(f"GRANT EXECUTE ON FUNCTION {fn} TO {APP_ROLE}")


def downgrade() -> None:
    for fn in ("auth_invitations_for_user(uuid)", "auth_invitation_by_code(text)", "auth_mc_taken(text)",
               "auth_user_companies(uuid)"):
        op.execute(f"DROP FUNCTION IF EXISTS {fn}")
    for table in ("drivers", "vehicles"):
        op.execute(f"DROP POLICY IF EXISTS definer_read ON {table}")
    op.execute("DROP FUNCTION IF EXISTS auth_user_organizations(uuid)")
    op.execute(
        """
        CREATE FUNCTION auth_user_organizations(p_user_id uuid)
        RETURNS TABLE (organization_id uuid, name text, slug text, role text, status text, account_id uuid,
                       code text, color text, mc_number text)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT o.id, o.name::text, o.slug::text, m.role::text, o.status::text, o.account_id,
                  o.code::text, o.color::text, o.mc_number::text
           FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
           WHERE m.user_id = p_user_id AND m.active
           ORDER BY (o.status = 'archived'), o.name $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION auth_user_organizations(uuid) FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION auth_user_organizations(uuid) TO {APP_ROLE}")
    op.execute("DROP INDEX IF EXISTS uq_organizations_mc")
    op.drop_index("uq_invitations_code", table_name="invitations")
    op.drop_column("invitations", "declined_at")
    op.drop_column("invitations", "code_hash")
    op.drop_constraint(op.f("ck_organizations_fleet_size_valid"), "organizations", type_="check")
    op.drop_column("organizations", "fleet_size")
    op.drop_column("organization_memberships", "last_opened_at")
    op.execute(f"REVOKE UPDATE (default_organization_id) ON users FROM {APP_ROLE}")
    op.drop_column("users", "default_organization_id")
