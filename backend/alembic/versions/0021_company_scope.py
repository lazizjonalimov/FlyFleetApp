"""Working in one company or in all of an account's at once: each company gets a short code and a colour (shown
beside its numbers and on its mark), a person's last choice of scope is remembered, the companies a person can open
carry that code and colour, and reads may span several companies while a write still lands in exactly one.

Revision ID: 0021
Revises: 0020
"""
import os
import re

import sqlalchemy as sa

from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")
ORG = "nullif(current_setting('app.org_id', true), '')::uuid"
USR = "nullif(current_setting('app.user_id', true), '')::uuid"
# The companies a request may read across: set only for a combined (All companies) read.
ORG_IDS = "app_org_ids()"
PALETTE = ["#1F4FE0", "#0E9F6E", "#D97706", "#7C3AED", "#DB2777", "#0891B2", "#DC2626", "#4D7C0F", "#334155"]


def _code(name: str) -> str:
    words = [w for w in re.split(r"[^A-Za-z0-9]+", name) if w]
    if not words:
        return "CO"
    initials = "".join(w[0] for w in words if w.lower() not in {"the", "of", "and", "inc", "llc", "co"})[:4]
    return (initials if len(initials) >= 2 else (words[0][:3])).upper()


def upgrade() -> None:
    op.add_column("organizations", sa.Column("code", sa.String(6), nullable=True))
    op.add_column("organizations", sa.Column("color", sa.String(7), nullable=True))
    bind = op.get_bind()
    # Row-level security is forced on companies, even for the role running migrations, which could not see a
    # single one to give it a code. Lifted for this backfill and put back right after.
    op.execute("ALTER TABLE organizations NO FORCE ROW LEVEL SECURITY")
    rows = bind.execute(sa.text("SELECT id, account_id, name FROM organizations ORDER BY created_at, id")).all()
    taken: dict[object, set[str]] = {}
    used: dict[object, int] = {}
    for org_id, account_id, name in rows:
        seen = taken.setdefault(account_id, set())
        base, code, n = _code(name), _code(name), 1
        while code in seen:
            n += 1
            code = f"{base[: 6 - len(str(n))]}{n}"
        seen.add(code)
        i = used[account_id] = used.get(account_id, -1) + 1
        bind.execute(sa.text("UPDATE organizations SET code = :c, color = :k WHERE id = :i"),
                     {"c": code, "k": PALETTE[i % len(PALETTE)], "i": org_id})
    op.execute("ALTER TABLE organizations FORCE ROW LEVEL SECURITY")
    op.alter_column("organizations", "code", nullable=False)
    op.alter_column("organizations", "color", nullable=False, server_default=PALETTE[0])
    op.create_check_constraint("ck_organizations_code_valid", "organizations", "code ~ '^[A-Z0-9]{2,6}$'")
    op.create_check_constraint("ck_organizations_color_valid", "organizations", "color ~ '^#[0-9A-Fa-f]{6}$'")
    op.create_index("uq_organizations_account_code", "organizations", ["account_id", sa.text("lower(code)")],
                    unique=True)

    # Where a person last worked: a company (users.last_organization_id) or all of them ("all").
    op.add_column("users", sa.Column("last_scope", sa.String(10), nullable=True))
    op.create_check_constraint("ck_users_last_scope_valid", "users", "last_scope IS NULL OR last_scope = 'all'")
    op.execute(f"GRANT UPDATE (last_scope) ON users TO {APP_ROLE}")
    op.execute(f"GRANT UPDATE (code, color) ON organizations TO {APP_ROLE}")

    # The companies a person can open, with how each is drawn.
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

    op.execute("DROP FUNCTION IF EXISTS auth_account_companies(uuid)")
    op.execute(
        f"""
        CREATE FUNCTION auth_account_companies(p_account_id uuid)
        RETURNS TABLE (id uuid, name text, slug text, status text, dot_number text, mc_number text,
                       created_at timestamptz, code text, color text)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT o.id, o.name::text, o.slug::text, o.status::text, o.dot_number::text, o.mc_number::text,
                  o.created_at, o.code::text, o.color::text
           FROM organizations o JOIN accounts a ON a.id = o.account_id
           WHERE a.id = p_account_id AND a.owner_user_id = {USR}
           ORDER BY (o.status = 'archived'), o.created_at $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION auth_account_companies(uuid) FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION auth_account_companies(uuid) TO {APP_ROLE}")

    # Reads may span the companies named in app.org_ids; a write still has to match the one app.org_id.
    op.execute(
        """
        CREATE FUNCTION app_org_ids() RETURNS uuid[] LANGUAGE sql STABLE AS
        $$ SELECT coalesce(string_to_array(nullif(current_setting('app.org_ids', true), ''), ',')::uuid[],
                           ARRAY[]::uuid[]) $$
        """
    )
    op.execute(f"GRANT EXECUTE ON FUNCTION app_org_ids() TO {APP_ROLE}")
    tables = [r[0] for r in bind.execute(sa.text(
        "SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_isolation' "
        "AND tablename <> 'organizations'"))]
    for table in tables:
        op.execute(f"ALTER POLICY tenant_isolation ON {table} USING (organization_id = {ORG} "
                   f"OR organization_id = ANY({ORG_IDS})) WITH CHECK (organization_id = {ORG})")


def downgrade() -> None:
    bind = op.get_bind()
    tables = [r[0] for r in bind.execute(sa.text(
        "SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_isolation' "
        "AND tablename <> 'organizations'"))]
    for table in tables:
        op.execute(f"ALTER POLICY tenant_isolation ON {table} USING (organization_id = {ORG}) "
                   f"WITH CHECK (organization_id = {ORG})")
    op.execute("DROP FUNCTION IF EXISTS app_org_ids()")
    op.execute("DROP FUNCTION IF EXISTS auth_account_companies(uuid)")
    op.execute(
        f"""
        CREATE FUNCTION auth_account_companies(p_account_id uuid)
        RETURNS TABLE (id uuid, name text, slug text, status text, dot_number text, mc_number text,
                       created_at timestamptz)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT o.id, o.name::text, o.slug::text, o.status::text, o.dot_number::text, o.mc_number::text,
                  o.created_at
           FROM organizations o JOIN accounts a ON a.id = o.account_id
           WHERE a.id = p_account_id AND a.owner_user_id = {USR}
           ORDER BY (o.status = 'archived'), o.created_at $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION auth_account_companies(uuid) FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION auth_account_companies(uuid) TO {APP_ROLE}")
    op.execute("DROP FUNCTION IF EXISTS auth_user_organizations(uuid)")
    op.execute(
        """
        CREATE FUNCTION auth_user_organizations(p_user_id uuid)
        RETURNS TABLE (organization_id uuid, name text, slug text, role text, status text, account_id uuid)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT o.id, o.name::text, o.slug::text, m.role::text, o.status::text, o.account_id
           FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
           WHERE m.user_id = p_user_id AND m.active
           ORDER BY (o.status = 'archived'), o.name $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION auth_user_organizations(uuid) FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION auth_user_organizations(uuid) TO {APP_ROLE}")
    op.execute(f"REVOKE UPDATE (last_scope) ON users FROM {APP_ROLE}")
    op.execute(f"REVOKE UPDATE (code, color) ON organizations FROM {APP_ROLE}")
    op.drop_constraint("ck_users_last_scope_valid", "users", type_="check")
    op.drop_column("users", "last_scope")
    op.drop_index("uq_organizations_account_code", table_name="organizations")
    op.drop_constraint("ck_organizations_color_valid", "organizations", type_="check")
    op.drop_constraint("ck_organizations_code_valid", "organizations", type_="check")
    op.drop_column("organizations", "color")
    op.drop_column("organizations", "code")
