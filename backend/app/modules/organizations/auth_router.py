"""Sign-up, sign-in, the current session, switching company, and changing your password."""
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.config import get_settings
from app.core.db import new_session
from app.core.deps import Principal, get_db, get_principal
from app.core.errors import AppError, Conflict, Forbidden, Invalid, NotFound, Unauthorized
from app.core.permissions import ROLE_LABELS, Role
from app.core.ratelimit import FailureLimiter
from app.core.security import create_token, hash_password, verify_password
from app.modules.access import service as access
from app.modules.organizations import identity
from app.modules.organizations import schemas as s
from app.modules.organizations.models import Account, AuditLog, Membership, Organization, User, UserSession

router = APIRouter(prefix="/auth", tags=["auth"])

_limiter = FailureLimiter()


def make_slug(name: str) -> str:
    """URL name for a company. The random tail keeps it unique without revealing which names are taken."""
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:50] or "company"
    return f"{base}-{secrets.token_hex(3)}"


def add_organization(db: Session, taken: list[tuple[str, str]] | None = None, **fields) -> Organization:
    """Insert a company under a web address nobody else has.

    Whether an address is taken can't be looked up first: other companies' rows are invisible from here, by
    design. So the insert is attempted inside a savepoint and, on the rare clash, tried again with a new
    random tail. Many carriers share a name; none of them should ever be told theirs "already exists".
    """
    codes = {c for c, _ in (taken or [])}
    fields.setdefault("code", identity.default_code(fields["name"], codes))
    fields.setdefault("color", identity.default_color([k for _, k in (taken or [])]))
    for _ in range(8):
        org = Organization(slug=make_slug(fields["name"]), **fields)
        try:
            with db.begin_nested():
                db.add(org)
                db.flush()
            return org
        except IntegrityError as e:
            if getattr(getattr(e.orig, "diag", None), "constraint_name", None) != "uq_organizations_slug":
                raise
    raise AppError("Could not set up the company. Try again.", status=503, code="TRY_AGAIN")


def user_organizations(db: Session, user_id: uuid.UUID) -> list[s.OrgRef]:
    rows = db.execute(text("SELECT * FROM auth_user_organizations(:u)"), {"u": user_id})
    return [s.OrgRef(id=r.organization_id, name=r.name, slug=r.slug, role=r.role, status=r.status, code=r.code,
                     color=r.color, mc_number=r.mc_number) for r in rows]


def _remember(user_id: uuid.UUID, org_id: uuid.UUID, scope: str | None = None) -> None:
    """Record where the user last worked (a company, or all of them), so the next sign-in returns there."""
    db = new_session(org_id=org_id, user_id=user_id)
    try:
        db.execute(update(User).where(User.id == user_id).values(last_organization_id=org_id, last_scope=scope))
        db.commit()
    finally:
        db.close()


def _client(request: Request) -> tuple[str | None, str | None]:
    """The browser and address a sign-in came from, for telling your sessions apart. The web server passes on
    the browser's own User-Agent and address; they are shown to the person, never used to decide access."""
    agent = (request.headers.get("user-agent") or "")[:300] or None
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    ip = (forwarded or (request.client.host if request.client else ""))[:64] or None
    return agent, ip


def start_session(user_id: uuid.UUID, request: Request) -> uuid.UUID:
    """Record a new sign-in on a device; the token issued for it carries the returned id."""
    agent, ip = _client(request)
    db = new_session(user_id=user_id)
    try:
        session = UserSession(user_id=user_id, user_agent=agent, ip_address=ip)
        db.add(session)
        db.commit()
        return session.id
    finally:
        db.close()


@router.post("/signup", response_model=s.SessionOut, status_code=201)
def signup(body: s.SignupIn, request: Request):
    """Create an account (the owner's profile) with its first company."""
    settings = get_settings()
    if not settings.signup_enabled:
        raise Forbidden("Self-service sign-up is turned off")
    org_id, account_id = uuid.uuid4(), uuid.uuid4()
    db = new_session(org_id=org_id)  # the new company is the tenant context for its own creation
    try:
        if db.execute(text("SELECT 1 FROM auth_lookup_user(:e)"), {"e": body.email}).first():
            raise Conflict("An account with this email already exists", code="DUPLICATE_REFERENCE",
                           field_errors={"email": "An account with this email already exists"})
        user_id = db.execute(text("SELECT auth_create_user(:e, :n, :h)"),
                             {"e": body.email, "n": body.full_name, "h": hash_password(body.password)}).scalar_one()
        db.execute(text("SELECT set_config('app.user_id', :u, true)"), {"u": str(user_id)})
        db.add(Account(id=account_id, name=body.organization_name, owner_user_id=user_id,
                       max_companies=settings.max_companies_per_account))
        db.flush()
        created = add_organization(db, id=org_id, account_id=account_id, name=body.organization_name,
                                   dot_number=body.dot_number, mc_number=body.mc_number, timezone=body.timezone)
        slug = created.slug
        db.add(Membership(organization_id=org_id, user_id=user_id, role=Role.OWNER.value))
        db.add(AuditLog(organization_id=org_id, actor_user_id=user_id, action="organization.created",
                        entity_type="organization", entity_id=org_id, data={"name": body.organization_name}))
        db.execute(update(User).where(User.id == user_id).values(last_organization_id=org_id))
        db.commit()
    finally:
        db.close()
    org = s.OrgRef(id=org_id, name=body.organization_name, slug=slug, role=Role.OWNER.value, status="active",
                   code=created.code, color=created.color, mc_number=body.mc_number)
    return s.SessionOut(access_token=create_token(user_id, org_id, 0, start_session(user_id, request)),
                        organization=org, organizations=[org])


@router.post("/login", response_model=s.SessionOut)
def login(body: s.LoginIn, request: Request):
    key = f"login|{request.client.host if request.client else '?'}|{body.email.lower()}"
    _limiter.check(key)

    # No company is known yet, so identity lookups go through SECURITY DEFINER functions.
    db = new_session()
    try:
        row = db.execute(text("SELECT * FROM auth_lookup_user(:e)"), {"e": body.email}).first()
        ok = verify_password(body.password, row.password_hash if row else None)
        if not (ok and row and row.active):
            _limiter.fail(key)
            raise Unauthorized("Invalid email or password")
        orgs = user_organizations(db, row.id)
    finally:
        db.close()
    _limiter.reset(key)

    if not orgs:
        raise Unauthorized("This account no longer has access to any company")
    # One company: straight in. Several: the person picks, with the one they worked in last offered first.
    chosen = next((o for o in orgs if o.id == body.organization_id), None) if body.organization_id else None
    if body.organization_id and chosen is None:
        raise Unauthorized("You are not a member of that company")
    if chosen is None and len(orgs) == 1:
        chosen = orgs[0]
    if chosen is None:
        last = row.last_organization_id if any(o.id == row.last_organization_id for o in orgs) else None
        return s.SessionOut(requires_organization_selection=True, last_organization_id=last,
                            last_scope="all" if row.last_scope == "all" and last else "company",
                            organizations=sorted(orgs, key=lambda o: o.id != last))
    _remember(row.id, chosen.id)
    return s.SessionOut(access_token=create_token(row.id, chosen.id, row.token_version, start_session(row.id, request)),
                        organization=chosen,
                        organizations=orgs)


@router.post("/switch", response_model=s.SessionOut)
def switch_organization(body: s.SwitchIn, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Move this session to another company the user belongs to. Membership is re-verified here; the web
    app discards everything it cached for the previous company."""
    orgs = user_organizations(db, p.user_id)
    if body.scope == "all":
        if len([o for o in orgs if o.status == "active"]) < 2:
            raise Invalid("Working in all companies needs two or more you can open", field="scope")
        chosen = next((o for o in orgs if o.id == p.org_id), orgs[0])
    else:
        chosen = next((o for o in orgs if o.id == body.organization_id), None)
        if chosen is None:
            raise Forbidden("You are not a member of that company")
    version = db.get(User, p.user_id).token_version
    _remember(p.user_id, chosen.id, "all" if body.scope == "all" else None)
    return s.SessionOut(access_token=create_token(p.user_id, chosen.id, version, p.session_id), organization=chosen,
                        organizations=orgs, last_organization_id=chosen.id, last_scope=body.scope)


@router.get("/me", response_model=s.MeOut)
def me(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    account = db.get(Account, p.account_id)
    memberships = user_organizations(db, p.user_id)
    here = next(o for o in memberships if o.id == p.org_id)
    return s.MeOut(
        user=_me_user(db.get(User, p.user_id)),
        organization=s.MeOrganization(id=p.org_id, name=p.org_name, slug=p.org_slug, role=p.role,
                                      status=p.org_status, timezone=p.timezone, base_currency=p.currency,
                                      role_label=access.label_of(db, p.role), code=here.code, color=here.color,
                                      mc_number=here.mc_number),
        account=s.MeAccount(id=account.id, name=account.name, is_owner=p.is_account_owner,
                            max_companies=account.max_companies),
        memberships=memberships,
        all_companies=len([o for o in memberships if o.status == "active"]) >= 2,
        last_scope="all" if db.get(User, p.user_id).last_scope == "all" else "company",
        permissions=sorted(p.permissions),
        scope=s.MeScope(team_id=p.scope.team_id, team_name=p.scope.team_name, trucks=len(p.scope.vehicle_ids),
                        preview=p.preview, lead_name=p.scope.lead_name) if p.scope else None,
    )


def _me_user(user: User) -> s.MeUser:
    return s.MeUser(id=user.id, email=user.email, full_name=user.full_name, phone=user.phone, timezone=user.timezone)


@router.patch("/me", response_model=s.MeUser)
def update_me(body: s.ProfileIn, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Your own profile: the name teammates see, a mobile phone and your time zone. Open to everyone signed in,
    whatever their role. Your email is how you sign in and stays as it is."""
    user = db.get(User, p.user_id)
    sent = body.model_fields_set
    changes: dict[str, dict[str, str | None]] = {}
    if "full_name" in sent:
        name = " ".join((body.full_name or "").split())
        if not name:
            raise Invalid("Enter your name", field="full_name")
        if name != user.full_name:
            audit(db, p, "user.renamed", "user", p.user_id, {"from": user.full_name, "to": name})
            user.full_name = name
            db.commit()
    if "phone" in sent:
        phone = " ".join((body.phone or "").split()) or None
        if phone and not re.fullmatch(r"[0-9+()\-. ]{7,40}", phone):
            raise Invalid("Enter a phone number such as +1 312 555 0142", field="phone")
        if phone != user.phone:
            changes["phone"] = {"from": user.phone, "to": phone}
            user.phone = phone
    if "timezone" in sent:
        zone = body.timezone or None
        if zone != user.timezone:
            changes["timezone"] = {"from": user.timezone, "to": zone}
            user.timezone = zone
    if changes:
        audit(db, p, "user.profile_changed", "user", p.user_id, changes)
        db.commit()
    return _me_user(user)


# ---------------------------------------------------------------- your sessions (devices signed in)
def _sessions(db: Session, p: Principal) -> list[UserSession]:
    """Your sign-ins that can still be used: not signed out, and used within a token's lifetime."""
    since = datetime.now(UTC) - timedelta(minutes=get_settings().jwt_ttl_minutes)
    return list(db.scalars(select(UserSession).where(
        UserSession.user_id == p.user_id, UserSession.revoked_at.is_(None), UserSession.last_seen_at >= since)
        .order_by(UserSession.last_seen_at.desc())))


def _sign_out_others(db: Session, p: Principal) -> int:
    """Sign out every session of yours but this one."""
    query = update(UserSession).where(UserSession.user_id == p.user_id, UserSession.revoked_at.is_(None))
    if p.session_id is not None:
        query = query.where(UserSession.id != p.session_id)
    return db.execute(query.values(revoked_at=datetime.now(UTC))).rowcount


@router.get("/sessions", response_model=list[s.SessionInfo])
def list_sessions(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """The devices you are signed in on, this one first. Every signed-in person can see their own."""
    rows = _sessions(db, p)
    out = [s.SessionInfo(id=r.id, created_at=r.created_at, last_seen_at=r.last_seen_at, user_agent=r.user_agent,
                         ip_address=r.ip_address, current=r.id == p.session_id) for r in rows]
    return sorted(out, key=lambda r: not r.current)


@router.delete("/sessions/{session_id}", status_code=204)
def sign_out_session(session_id: uuid.UUID, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Sign out one of your other devices. This device signs out with Sign out instead."""
    if session_id == p.session_id:
        raise Invalid("This is the device you’re using. Use Sign out instead.", code="CURRENT_SESSION")
    session = db.get(UserSession, session_id)
    if session is None or session.user_id != p.user_id or session.revoked_at is not None:
        raise NotFound("Session not found")
    session.revoked_at = datetime.now(UTC)
    audit(db, p, "user.session_signed_out", "user", p.user_id, {"session_id": str(session_id)})
    db.commit()


@router.post("/sessions/sign-out-others", response_model=s.SessionOut)
def sign_out_other_sessions(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Sign out everywhere but here. Tokens issued before sessions were kept are ended too: every token is
    retired and this device continues on the fresh one returned."""
    user = db.get(User, p.user_id)
    ended = _sign_out_others(db, p)
    user.token_version += 1
    audit(db, p, "user.sessions_signed_out", "user", p.user_id, {"count": ended})
    db.commit()
    org = next((o for o in user_organizations(db, p.user_id) if o.id == p.org_id),
               s.OrgRef(id=p.org_id, name=p.org_name, slug=p.org_slug, role=p.role, status=p.org_status, code="", color=""))
    return s.SessionOut(access_token=create_token(p.user_id, p.org_id, user.token_version, p.session_id), organization=org)


@router.post("/logout", status_code=204)
def logout(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Sign this device out: its token stops working at once, not when it expires."""
    if p.session_id is not None:
        db.execute(update(UserSession).where(UserSession.id == p.session_id).values(revoked_at=datetime.now(UTC)))
        db.commit()


@router.post("/password", response_model=s.SessionOut)
def change_password(body: s.PasswordChangeIn, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Change your own password. Every token issued before the change stops working; a fresh one is returned."""
    key = f"password|{p.user_id}"
    _limiter.check(key)
    user = db.get(User, p.user_id)
    if not verify_password(body.current_password, user.password_hash):
        _limiter.fail(key)
        # 403 rather than 401: the session itself is still valid.
        raise Forbidden("That isn't your current password", code="WRONG_PASSWORD",
                        field_errors={"current_password": "That isn't your current password"})
    _limiter.reset(key)
    if body.new_password == body.current_password:
        raise Invalid("Choose a password different from the current one", field="new_password")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1
    _sign_out_others(db, p)
    audit(db, p, "user.password_changed", "user", p.user_id)
    db.commit()
    org = next((o for o in user_organizations(db, p.user_id) if o.id == p.org_id),
               s.OrgRef(id=p.org_id, name=p.org_name, slug=p.org_slug, role=p.role, status=p.org_status, code="", color=""))
    return s.SessionOut(access_token=create_token(p.user_id, p.org_id, user.token_version, p.session_id), organization=org)


# ---------------------------------------------------------------- joining by invitation
class InvitationPreview(BaseModel):
    organization_name: str
    email: str
    full_name: str
    role_label: str
    invited_by_name: str | None
    expires_at: datetime
    state: Literal["open", "expired", "used", "revoked"]
    existing_account: bool = Field(description="The email already has a FlyFleet sign-in: join with its password")


class AcceptInvitationIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    full_name: str | None = Field(default=None, max_length=120)
    password: str = Field(min_length=1, max_length=200)


def _invitation(db: Session, token: str):
    from app.modules.access.service import token_hash
    return db.execute(text("SELECT * FROM auth_lookup_invitation(:h)"), {"h": token_hash(token)}).first()


def _state(row) -> str:
    if row.revoked_at:
        return "revoked"
    if row.accepted_at:
        return "used"
    return "expired" if row.expires_at <= datetime.now(UTC) else "open"


@router.get("/invitations/{token}", response_model=InvitationPreview)
def preview_invitation(token: str):
    """What an invitation link is for, before signing up with it. Says nothing beyond what the link holds."""
    db = new_session()
    try:
        row = _invitation(db, token)
        existing = bool(row and db.execute(text("SELECT 1 FROM auth_lookup_user(:e)"), {"e": row.email}).first())
    finally:
        db.close()
    if row is None:
        raise NotFound("This invitation link isn't valid")
    try:
        role_label = ROLE_LABELS[Role(row.role)][0]
    except ValueError:
        role_label = row.custom_role_name or "Team member"
    return InvitationPreview(organization_name=row.organization_name, email=row.email, full_name=row.full_name,
                             role_label=role_label, invited_by_name=row.invited_by_name,
                             expires_at=row.expires_at, state=_state(row), existing_account=existing)


@router.post("/accept-invitation", response_model=s.SessionOut)
def accept_invitation(body: AcceptInvitationIn, request: Request):
    """Join the company the invitation is for: with a new sign-in, or with the one the email already has."""
    key = f"invite|{request.client.host if request.client else '?'}|{body.token[:12]}"
    _limiter.check(key)
    db = new_session()
    try:
        row = _invitation(db, body.token)
        if row is None:
            raise NotFound("This invitation link isn't valid")
        state = _state(row)
        if state != "open":
            raise Conflict({"used": "This invitation has already been used. Sign in instead.",
                            "revoked": "This invitation was withdrawn. Ask for a new one.",
                            "expired": "This invitation has expired. Ask for a new one."}[state], code="INVITATION_CLOSED")
        user = db.execute(text("SELECT * FROM auth_lookup_user(:e)"), {"e": row.email}).first()
        if user is not None:
            if not (user.active and verify_password(body.password, user.password_hash)):
                _limiter.fail(key)
                raise Unauthorized("That isn't the password of the FlyFleet sign-in for this email")
            user_id, version = user.id, user.token_version
        else:
            if len(body.password) < 10:
                raise Invalid("Use at least 10 characters", field="password")
            name = (body.full_name or row.full_name).strip() or row.full_name
            user_id = db.execute(text("SELECT auth_create_user(:e, :n, :h)"),
                                 {"e": row.email, "n": name, "h": hash_password(body.password)}).scalar_one()
            version = 0
        db.commit()
    finally:
        db.close()
    _limiter.reset(key)

    org_id = row.organization_id
    db = new_session(org_id=org_id, user_id=user_id)
    try:
        from app.modules.access.models import Invitation, OrgRole
        from app.modules.drivers.models import Driver
        try:
            Role(row.role)
        except ValueError:
            if not db.scalar(select(OrgRole.id).where(OrgRole.key == row.role)):
                raise Conflict("The role this invitation gives no longer exists. Ask for a new invitation.",
                               code="INVITATION_CLOSED") from None
        if not db.scalar(select(Membership.id).where(Membership.user_id == user_id)):
            db.add(Membership(organization_id=org_id, user_id=user_id, role=row.role))
        invitation = db.get(Invitation, row.id)
        invitation.accepted_at, invitation.accepted_user_id = datetime.now(UTC), user_id
        if row.driver_id:
            driver = db.get(Driver, row.driver_id)
            if driver is not None and driver.user_id is None:
                db.flush()
                driver.user_id = user_id
        db.add(AuditLog(organization_id=org_id, actor_user_id=user_id, action="invitation.accepted",
                        entity_type="invitation", entity_id=row.id, data={"email": row.email, "role": row.role}))
        db.execute(update(User).where(User.id == user_id).values(last_organization_id=org_id))
        db.commit()
        orgs = user_organizations(db, user_id)
    finally:
        db.close()
    chosen = next(o for o in orgs if o.id == org_id)
    return s.SessionOut(access_token=create_token(user_id, org_id, version, start_session(user_id, request)),
                        organization=chosen, organizations=orgs)
