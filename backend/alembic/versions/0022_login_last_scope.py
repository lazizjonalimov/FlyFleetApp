"""Sign-in learns where the person last worked (a company, or all of them), so it can open there again.

Revision ID: 0022
Revises: 0021
"""
import os

from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")


def _define(with_scope: bool) -> None:
    op.execute("DROP FUNCTION IF EXISTS auth_lookup_user(text)")
    scope_col, scope_sel = (", last_scope text", ", u.last_scope::text") if with_scope else ("", "")
    op.execute(
        f"""
        CREATE FUNCTION auth_lookup_user(p_email text)
        RETURNS TABLE (id uuid, password_hash text, active boolean, full_name text, token_version integer,
                       last_organization_id uuid{scope_col})
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
        $$ SELECT u.id, u.password_hash::text, u.active, u.full_name::text, u.token_version,
                  u.last_organization_id{scope_sel}
           FROM users u WHERE u.email = lower(p_email) $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION auth_lookup_user(text) FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION auth_lookup_user(text) TO {APP_ROLE}")


def upgrade() -> None:
    _define(True)


def downgrade() -> None:
    _define(False)
