"""Security & privacy: your password, two-step verification, backup codes, password reset links, your own
sign-in activity, and privacy choices. Personal: every signed-in person can use these, whatever their role."""
import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from app.core import mail, passwords, totp
from app.core.audit import audit
from app.core.config import get_settings
from app.core.db import new_session
from app.core.deps import Principal, get_db, get_principal
from app.core.errors import Conflict, Invalid, NotFound
from app.core.ratelimit import FailureLimiter
from app.core.security import hash_password, verify_password
from app.modules.access import service as access
from app.modules.organizations import security
from app.modules.organizations.auth_router import _sessions, user_organizations
from app.modules.organizations.models import AuditLog, BackupCode, PasswordReset, SignInEvent, User, UserPreference, UserSession

router = APIRouter(prefix="/auth", tags=["security"])
_limiter = FailureLimiter()

RESET_MINUTES = 30


# ---------------------------------------------------------------- the page's state
class PasswordState(BaseModel):
    changed_at: datetime | None = Field(description="When it was last set; empty when set before this was kept")
    since: datetime = Field(description="When it was set or, failing that, when the sign-in was made")
    strength: Literal["Weak", "Fair", "Good", "Strong"] | None


class TwoFactorState(BaseModel):
    enabled: bool
    required: bool = Field(description="The person's role requires it: it can't be turned off")
    authenticator_added_at: datetime | None
    setup_pending: bool
    remember_device: bool
    remember_days: int
    backup_codes_unused: int
    backup_codes_total: int


class PrivacyState(BaseModel):
    support_access_until: datetime | None
    share_usage: bool


class SecurityOut(BaseModel):
    email: str
    password: PasswordState
    two_factor: TwoFactorState
    active_sessions: int
    privacy: PrivacyState


def _required(db: Session, p: Principal) -> bool:
    return security.required([o.role for o in user_organizations(db, p.user_id)], access.label_of(db, p.role))


def _state(db: Session, p: Principal) -> SecurityOut:
    user = db.get(User, p.user_id)
    required = _required(db, p)
    unused, total = security.backup_counts(db, p.user_id)
    support = user.support_access_until if user.support_access_until and user.support_access_until > datetime.now(UTC) else None
    return SecurityOut(
        email=user.email,
        password=PasswordState(changed_at=user.password_changed_at, since=user.password_changed_at or user.created_at,
                               strength=passwords.LABELS[user.password_strength] if user.password_strength is not None else None),
        two_factor=TwoFactorState(
            enabled=bool(user.totp_secret), required=required, authenticator_added_at=user.totp_added_at,
            setup_pending=bool(user.totp_pending), remember_device=user.remember_device,
            remember_days=security.REMEMBER_DAYS_REQUIRED if required else security.REMEMBER_DAYS,
            backup_codes_unused=unused, backup_codes_total=total),
        active_sessions=len(_sessions(db, p)),
        privacy=PrivacyState(support_access_until=support, share_usage=user.share_usage),
    )


@router.get("/security", response_model=SecurityOut)
def get_security(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Your security checkup: password, two-step verification, sessions and privacy choices."""
    return _state(db, p)


class SecurityIn(BaseModel):
    remember_device: bool | None = None
    share_usage: bool | None = None
    support_access: bool | None = Field(default=None, description="Let FlyFleet Support view the account for 24 hours")


@router.patch("/security", response_model=SecurityOut)
def update_security(body: SecurityIn, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    user = db.get(User, p.user_id)
    if body.remember_device is not None and body.remember_device != user.remember_device:
        user.remember_device = body.remember_device
        audit(db, p, "user.remember_device_changed", "user", p.user_id, {"on": body.remember_device})
    if body.share_usage is not None and body.share_usage != user.share_usage:
        user.share_usage = body.share_usage
        audit(db, p, "user.usage_sharing_changed", "user", p.user_id, {"on": body.share_usage})
    if body.support_access is not None:
        until = datetime.now(UTC) + timedelta(hours=24) if body.support_access else None
        user.support_access_until = until
        audit(db, p, "user.support_access_granted" if until else "user.support_access_ended", "user", p.user_id,
              {"until": until.isoformat() if until else None})
    db.commit()
    return _state(db, p)


# ---------------------------------------------------------------- two-step verification
class AuthenticatorSetupOut(BaseModel):
    setup_key: str = Field(description="The key in groups of four, for typing into the app by hand")
    otpauth_uri: str
    qr_svg: str = Field(description="The QR code the app scans, as an SVG document")


@router.post("/security/authenticator", response_model=AuthenticatorSetupOut)
def start_authenticator(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Start setting up (or replacing) an authenticator app. Nothing changes until a code from it is verified."""
    user = db.get(User, p.user_id)
    secret = totp.new_secret()
    user.totp_pending = secret
    db.commit()
    uri = totp.uri(secret, user.email)
    return AuthenticatorSetupOut(setup_key=totp.grouped(secret), otpauth_uri=uri, qr_svg=totp.qr_svg(uri))


class CodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class VerifiedOut(BaseModel):
    state: SecurityOut
    backup_codes: list[str] = Field(default=[], description="Shown once, when two-step verification is first turned on")


@router.post("/security/authenticator/verify", response_model=VerifiedOut)
def verify_authenticator(body: CodeIn, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Check a code from the app being set up, and make it the authenticator for this sign-in."""
    key = f"totp|{p.user_id}"
    _limiter.check(key)
    user = db.get(User, p.user_id)
    if not user.totp_pending:
        raise Conflict("Start setting up the authenticator app first", code="NO_SETUP")
    if not totp.verify(user.totp_pending, body.code):
        _limiter.fail(key)
        raise Invalid("That code isn’t right. Enter the newest 6-digit code from the app.", field="code")
    _limiter.reset(key)
    first = not user.totp_secret
    user.totp_secret, user.totp_pending, user.totp_added_at = user.totp_pending, None, datetime.now(UTC)
    codes = security.new_backup_codes(db, p.user_id) if first else []
    audit(db, p, "user.two_factor_method_added", "user", p.user_id, {"method": "authenticator", "replaced": not first})
    db.commit()
    return VerifiedOut(state=_state(db, p), backup_codes=codes)


@router.delete("/security/authenticator/setup", status_code=204)
def cancel_authenticator(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    db.get(User, p.user_id).totp_pending = None
    db.commit()


@router.delete("/security/authenticator", response_model=SecurityOut)
def remove_authenticator(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Turn two-step verification off: the authenticator and the backup codes are removed. Refused for a role
    that requires it."""
    if _required(db, p):
        raise Conflict("Your role requires two-step verification, so it can’t be turned off.",
                       code="TWO_FACTOR_REQUIRED")
    user = db.get(User, p.user_id)
    if not user.totp_secret:
        raise NotFound("Two-step verification is already off")
    user.totp_secret, user.totp_pending, user.totp_added_at = None, None, None
    db.query(BackupCode).filter(BackupCode.user_id == p.user_id).delete()
    audit(db, p, "user.two_factor_method_removed", "user", p.user_id, {"method": "authenticator"})
    db.commit()
    return _state(db, p)


class BackupCodesOut(BaseModel):
    codes: list[str] = Field(description="Shown this once. Only their hashes are kept.")
    state: SecurityOut


@router.post("/security/backup-codes", response_model=BackupCodesOut)
def regenerate_backup_codes(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """A new set of backup codes. The old set stops working at once."""
    if not db.get(User, p.user_id).totp_secret:
        raise Conflict("Turn on two-step verification first", code="TWO_FACTOR_OFF")
    codes = security.new_backup_codes(db, p.user_id)
    audit(db, p, "user.backup_codes_regenerated", "user", p.user_id)
    db.commit()
    return BackupCodesOut(codes=codes, state=_state(db, p))


# ---------------------------------------------------------------- password reset by email
def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class ResetSentOut(BaseModel):
    email: str
    expires_minutes: int


@router.post("/password-reset", response_model=ResetSentOut)
def request_password_reset(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Email yourself a one-time link to set a new password. It works once, for 30 minutes."""
    key = f"reset|{p.user_id}"
    _limiter.check(key)
    _limiter.fail(key)   # counts every request, so links can't be sent in a flood
    token = secrets.token_urlsafe(32)
    db.add(PasswordReset(user_id=p.user_id, token_hash=_token_hash(token),
                         expires_at=datetime.now(UTC) + timedelta(minutes=RESET_MINUTES)))
    audit(db, p, "user.password_reset_requested", "user", p.user_id)
    db.commit()
    link = f"{get_settings().public_url.rstrip('/')}/reset/{token}"
    mail.send(p.email, "Reset your FlyFleet password",
              f"Hi {p.full_name},\n\nOpen this link to set a new FlyFleet password:\n{link}\n\n"
              f"It works once and expires in {RESET_MINUTES} minutes. If you didn't ask for it, ignore this email.")
    return ResetSentOut(email=p.email, expires_minutes=RESET_MINUTES)


def _reset(db: Session, token: str):
    row = db.execute(text("SELECT * FROM auth_password_reset(:h)"), {"h": _token_hash(token)}).first()
    if row is None:
        return None, "invalid"
    if row.used_at is not None:
        return row, "used"
    if row.expires_at <= datetime.now(UTC):
        return row, "expired"
    return row, "open"


class ResetStateOut(BaseModel):
    state: Literal["open", "used", "expired", "invalid"]


@router.get("/password-reset/{token}", response_model=ResetStateOut)
def password_reset_state(token: str):
    """Whether a reset link can still be used. Opened before anyone is signed in."""
    db = new_session()
    try:
        return ResetStateOut(state=_reset(db, token)[1])
    finally:
        db.close()


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(max_length=200)


@router.post("/password-reset/confirm", status_code=204)
def confirm_password_reset(body: ResetIn, request: Request):
    """Set a new password from a reset link. The link is used up, and every session is signed out."""
    key = f"reset-confirm|{request.client.host if request.client else '?'}"
    _limiter.check(key)
    db = new_session()
    try:
        row, state = _reset(db, body.token)
    finally:
        db.close()
    if state != "open":
        _limiter.fail(key)
        raise Conflict({"used": "This link has already been used. Ask for a new one.",
                        "expired": "This link has expired. Ask for a new one.",
                        "invalid": "This link isn’t valid. Ask for a new one."}[state], code="RESET_LINK_CLOSED")
    db = new_session(user_id=row.user_id)
    try:
        user = db.get(User, row.user_id)
        problems = passwords.problems(body.new_password)
        if verify_password(body.new_password, user.password_hash):
            problems.append("Choose a password different from the current one")
        if problems:
            raise Invalid(problems[0], field="new_password", details={"problems": problems})
        now = datetime.now(UTC)
        # used once: marked before anything else, so the same link can't be replayed
        used = db.execute(update(PasswordReset).where(PasswordReset.id == row.reset_id, PasswordReset.used_at.is_(None))
                          .values(used_at=now)).rowcount
        if not used:
            raise Conflict("This link has already been used. Ask for a new one.", code="RESET_LINK_CLOSED")
        user.password_hash = hash_password(body.new_password)
        user.password_changed_at, user.password_strength = now, passwords.strength(body.new_password)
        user.token_version += 1
        db.execute(update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
                   .values(revoked_at=now))
        org = user.last_organization_id
        db.commit()
    finally:
        db.close()
    if org is not None:
        db = new_session(org_id=org, user_id=row.user_id)
        try:
            db.add(AuditLog(organization_id=org, actor_user_id=row.user_id, action="user.password_reset",
                            entity_type="user", entity_id=row.user_id))
            db.commit()
        finally:
            db.close()
    _limiter.reset(key)


# ---------------------------------------------------------------- your own sign-in activity
class SignInOut(BaseModel):
    id: str
    kind: Literal["signed_in", "new_device", "failed_password", "failed_second_step"]
    user_agent: str | None
    ip_address: str | None
    at: datetime


@router.get("/security/activity", response_model=list[SignInOut])
def sign_in_activity(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Your most recent sign-ins and attempts. Only ever your own."""
    rows = db.scalars(select(SignInEvent).where(SignInEvent.user_id == p.user_id)
                      .order_by(SignInEvent.created_at.desc()).limit(20))
    return [SignInOut(id=str(r.id), kind=r.kind, user_agent=r.user_agent, ip_address=r.ip_address, at=r.created_at)
            for r in rows]


# ---------------------------------------------------------------- your data
class ExportOut(BaseModel):
    email: str


@router.post("/security/data-export", response_model=ExportOut)
def request_data_export(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Email yourself a link to download what FlyFleet holds about you."""
    audit(db, p, "user.data_export_requested", "user", p.user_id)
    db.commit()
    link = f"{get_settings().public_url.rstrip('/')}/api/v1/auth/security/data-export"
    mail.send(p.email, "Your FlyFleet data export",
              f"Hi {p.full_name},\n\nYour data export is ready. Sign in to FlyFleet, then open:\n{link}\n")
    return ExportOut(email=p.email)


@router.get("/security/data-export")
def download_data_export(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """What FlyFleet holds about you, as JSON: your profile, companies, preferences, sessions and sign-ins."""
    user = db.get(User, p.user_id)
    data = {
        "exported_at": datetime.now(UTC).isoformat(),
        "profile": {"email": user.email, "full_name": user.full_name, "phone": user.phone, "timezone": user.timezone,
                    "created_at": user.created_at.isoformat()},
        "companies": [{"name": o.name, "role": o.role, "status": o.status} for o in user_organizations(db, p.user_id)],
        "preferences_here": {r.key: r.value for r in
                             db.scalars(select(UserPreference).where(UserPreference.user_id == p.user_id))},
        "security": {"two_step_verification": bool(user.totp_secret), "password_changed_at":
                     user.password_changed_at.isoformat() if user.password_changed_at else None,
                     "share_usage": user.share_usage},
        "sessions": [{"started": r.created_at.isoformat(), "last_seen": r.last_seen_at.isoformat(), "device": r.user_agent,
                      "address": r.ip_address, "signed_out": r.revoked_at.isoformat() if r.revoked_at else None}
                     for r in db.scalars(select(UserSession).where(UserSession.user_id == p.user_id))],
        "sign_ins": [{"kind": r.kind, "at": r.created_at.isoformat(), "device": r.user_agent, "address": r.ip_address}
                     for r in db.scalars(select(SignInEvent).where(SignInEvent.user_id == p.user_id))],
    }
    return Response(json.dumps(data, indent=2), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="flyfleet-my-data.json"'})
