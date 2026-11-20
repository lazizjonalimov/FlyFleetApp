import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.db import new_session
from app.core.errors import Conflict, Forbidden, NotFound, Unauthorized
from app.core.permissions import has_permission, permissions_for
from app.core.scope import Scope, load_scope
from app.core.security import decode_token
from app.modules.access.resolve import resolve, role_permissions
from app.modules.organizations.models import Account, Membership, Organization, User

bearer = HTTPBearer(auto_error=False)

# What may still be done in an archived (read-only) company: leave it, or manage the session.
ARCHIVED_WRITE_ALLOWLIST = ("/api/v1/auth/", "/api/v1/account/")


@dataclass(frozen=True)
class Principal:
    """Who is calling, in which company, with which role. Resolved from the database on every request."""
    user_id: uuid.UUID
    org_id: uuid.UUID
    role: str
    full_name: str
    email: str
    timezone: str = "UTC"
    currency: str = "USD"
    org_name: str = ""
    org_slug: str = ""
    org_status: str = "active"
    account_id: uuid.UUID | None = None
    is_account_owner: bool = False
    # The part of the fleet a dispatch team's dispatcher sees; None for the whole fleet.
    scope: Scope | None = None
    # An administrator seeing the console as a dispatch team's dispatcher would. Nothing can be changed.
    preview: bool = False
    # What this person may do in this company: their role as the company has it, with their own exceptions.
    # None falls back to the role's template (for principals made outside a request).
    granted: frozenset[str] | None = None

    def today(self) -> date:
        """The current date where this company operates (not the server's date)."""
        return datetime.now(ZoneInfo(self.timezone)).date()

    def can(self, permission: str) -> bool:
        return permission in self.granted if self.granted is not None else has_permission(self.role, permission)

    @property
    def permissions(self) -> set[str]:
        return set(self.granted) if self.granted is not None else permissions_for(self.role)


def _company_of(user_id: uuid.UUID, home: uuid.UUID, wanted: str) -> uuid.UUID:
    """The company named by slug or id, if the person can open it. Anything else is not found, so a company
    that exists but isn't theirs can't be told apart from one that doesn't."""
    db = new_session(org_id=home, user_id=user_id)
    try:
        rows = db.execute(text("SELECT organization_id, slug FROM auth_user_organizations(:u)"), {"u": user_id}).all()
    finally:
        db.close()
    for r in rows:
        if str(r.organization_id) == wanted or r.slug == wanted:
            return r.organization_id
    raise NotFound("Company not found")


def get_principal(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> Principal:
    if creds is None:
        raise Unauthorized("Sign in to continue")
    try:
        claims = decode_token(creds.credentials)
        user_id, org_id, version = uuid.UUID(claims["sub"]), uuid.UUID(claims["org"]), int(claims["ver"])
    except (jwt.PyJWTError, ValueError, KeyError, TypeError) as e:
        raise Unauthorized("Your session has expired. Sign in again.") from e

    # The company comes from the URL the web server was asked for (X-Company: a slug or id), not from the
    # token: the token only says who the person is and where they last were. "all" is the combined view, whose
    # requests are fanned out per company by the /all router, so here it falls back to the token's company.
    wanted = (request.headers.get("x-company") or "").strip()
    if wanted and wanted.lower() != "all" and wanted != str(org_id):
        org_id = _company_of(user_id, org_id, wanted)

    # Checked against the database on every request, so a role change, removal from the company or a
    # password change takes effect immediately rather than when the token expires.
    db = new_session(org_id=org_id, user_id=user_id)
    try:
        row = db.execute(
            select(Membership.role, User.full_name, User.email, User.token_version, Organization.timezone,
                   Organization.base_currency, Organization.name, Organization.slug, Organization.status,
                   Organization.account_id, Account.owner_user_id, Organization.dispatchers_without_team)
            .join(User, User.id == Membership.user_id)
            .join(Organization, Organization.id == Membership.organization_id)
            .join(Account, Account.id == Organization.account_id)
            .where(Membership.user_id == user_id, Membership.organization_id == org_id,
                   Membership.active.is_(True), User.active.is_(True))
        ).first()
        role, scope, preview, granted = (row.role, None, False, None) if row else (None, None, False, None)
        if row is not None and row.token_version == version:
            granted = resolve(db, user_id, row.role)
            preview_team = request.headers.get("x-preview-team")
            if preview_team:
                # Someone who manages the team sees what a team's dispatcher would, without acting as them.
                if "users.manage" not in granted:
                    raise Forbidden("Only someone who manages the team can preview a dispatch team")
                if request.method not in ("GET", "HEAD"):
                    raise Forbidden("Nothing can be changed in a preview. Exit the preview to make changes.",
                                    code="PREVIEW_READ_ONLY")
                try:
                    team_id = uuid.UUID(preview_team)
                except ValueError as e:
                    raise NotFound("Dispatch team not found") from e
                role, scope, preview = "dispatcher", load_scope(db, team_id=team_id), True
                granted = frozenset(role_permissions(db, "dispatcher"))
            elif "dispatch.assign" in granted and "users.manage" not in granted:
                # Whoever dispatches (a dispatcher, or a custom role that assigns loads) works their team's trucks.
                scope = load_scope(db, user_id=user_id, without_team=row.dispatchers_without_team)
    finally:
        db.close()
    if row is None:
        raise Unauthorized("Your access to this company has ended. Sign in again.")
    if row.token_version != version:
        raise Unauthorized("Your session has expired. Sign in again.")

    if (row.status != "active" and request.method not in ("GET", "HEAD")
            and not request.url.path.startswith(ARCHIVED_WRITE_ALLOWLIST)):
        raise Conflict("This company is archived and can only be viewed. Restore it to make changes.",
                       code="ORGANIZATION_ARCHIVED")

    request.state.principal = (user_id, org_id)
    return Principal(
        user_id=user_id, org_id=org_id, role=role, full_name=row.full_name, email=row.email,
        timezone=row.timezone, currency=row.base_currency, org_name=row.name, org_slug=row.slug,
        org_status=row.status, account_id=row.account_id, is_account_owner=row.owner_user_id == user_id,
        scope=scope, preview=preview, granted=granted)


def get_db(p: Principal = Depends(get_principal)) -> Iterator[Session]:
    """One transaction per request, scoped to the caller's company by row-level security.

    Routers commit explicitly; anything uncommitted is rolled back.
    """
    db = new_session(org_id=p.org_id, user_id=p.user_id)
    try:
        yield db
    finally:
        db.rollback()
        db.close()


def require(*permissions: str) -> Callable[[Principal], Principal]:
    """Dependency: the caller must hold at least one of `permissions`."""
    def dep(p: Principal = Depends(get_principal)) -> Principal:
        if not any(p.can(perm) for perm in permissions):
            raise Forbidden("Your role does not allow this", details={"required": list(permissions)})
        return p
    return dep


def require_account_owner(p: Principal = Depends(get_principal)) -> Principal:
    if not p.is_account_owner:
        raise Forbidden("Only the account owner can manage companies")
    return p


def get_or_404(db: Session, model, id_: uuid.UUID, what: str):
    obj = db.get(model, id_)
    if obj is None:  # row-level security makes another company's row indistinguishable from a missing one
        raise NotFound(f"{what} not found")
    return obj
