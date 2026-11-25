"""Two-step verification, trusted devices, backup codes and sign-in activity: the parts sign-in and the Security &
privacy page share."""
import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Request
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import new_session
from app.modules.organizations.models import BackupCode, SignInEvent, User

# Roles that must use two-step verification, by key and by the name a company gives them. Checked by the API:
# someone holding one of them in any company they can open can't turn it off.
REQUIRED_ROLE_KEYS = frozenset({"owner", "operations_manager", "platform_operator"})
REQUIRED_ROLE_LABELS = frozenset({"Main Admin", "Operations Manager", "Platform Operator"})

# How long a device is remembered after its second step: 30 days, 7 for someone whose role requires the step.
REMEMBER_DAYS, REMEMBER_DAYS_REQUIRED = 30, 7
# Without "remember", the second step still counts for a few minutes, long enough to choose a company.
SHORT_TRUST_MINUTES = 10
BACKUP_CODES = 10


def required(role_keys: list[str], current_label: str | None = None) -> bool:
    """Whether someone with these roles (one per company) must use two-step verification."""
    return any(key in REQUIRED_ROLE_KEYS for key in role_keys) or (current_label in REQUIRED_ROLE_LABELS)


def client(request: Request) -> tuple[str | None, str | None]:
    """The browser and address a request came from, as the web server passes them on. Shown to the person only."""
    agent = (request.headers.get("user-agent") or "")[:300] or None
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    ip = (forwarded or (request.client.host if request.client else ""))[:64] or None
    return agent, ip


# ---------------------------------------------------------------- trusted devices
def trust_token(user_id: uuid.UUID, version: int, *, days: int | None = None) -> str:
    """Proof that this browser passed the second step: for `days` when it is remembered, else a few minutes.
    Bound to the token version, so changing the password or turning the step off forgets every device."""
    s = get_settings()
    now = datetime.now(UTC)
    life = timedelta(days=days) if days else timedelta(minutes=SHORT_TRUST_MINUTES)
    claims = {"sub": str(user_id), "typ": "trust", "ver": version, "iss": s.jwt_issuer, "iat": now, "exp": now + life}
    return jwt.encode(claims, s.jwt_secret, algorithm="HS256")


def trusted(token: str | None, user_id: uuid.UUID, version: int) -> bool:
    if not token:
        return False
    s = get_settings()
    try:
        claims = jwt.decode(token, s.jwt_secret, algorithms=["HS256"], issuer=s.jwt_issuer,
                            options={"require": ["exp", "sub", "typ", "ver"]})
    except jwt.PyJWTError:
        return False
    return claims["typ"] == "trust" and claims["sub"] == str(user_id) and claims["ver"] == version


# ---------------------------------------------------------------- backup codes
def _hash(code: str) -> str:
    return hashlib.sha256("".join(ch for ch in code.lower() if ch.isalnum()).encode()).hexdigest()


def new_backup_codes(db: Session, user_id: uuid.UUID) -> list[str]:
    """A fresh set of codes, shown once. The old set stops working; only hashes are stored."""
    db.query(BackupCode).filter(BackupCode.user_id == user_id).delete()
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
    codes = ["-".join("".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(2)) for _ in range(BACKUP_CODES)]
    db.add_all(BackupCode(user_id=user_id, code_hash=_hash(code)) for code in codes)
    return codes


def use_backup_code(db: Session, user_id: uuid.UUID, code: str) -> bool:
    row = db.scalar(select(BackupCode).where(BackupCode.user_id == user_id, BackupCode.code_hash == _hash(code),
                                             BackupCode.used_at.is_(None)))
    if row is None:
        return False
    row.used_at = datetime.now(UTC)
    return True


def backup_counts(db: Session, user_id: uuid.UUID) -> tuple[int, int]:
    rows = db.execute(select(BackupCode.used_at).where(BackupCode.user_id == user_id)).all()
    return sum(1 for r in rows if r.used_at is None), len(rows)


# ---------------------------------------------------------------- sign-in activity
def record(user_id: uuid.UUID, kind: str, request: Request) -> None:
    """Note a sign-in or a failed attempt on the person's own activity. A first success from a browser it hasn't
    seen before is noted as a new device."""
    agent, ip = client(request)
    db = new_session(user_id=user_id)
    try:
        if kind == "signed_in" and agent:
            seen = db.scalar(select(exists().where(SignInEvent.user_id == user_id, SignInEvent.user_agent == agent,
                                                   SignInEvent.kind.in_(("signed_in", "new_device")))))
            any_before = db.scalar(select(exists().where(SignInEvent.user_id == user_id,
                                                         SignInEvent.kind.in_(("signed_in", "new_device")))))
            if any_before and not seen:
                kind = "new_device"
        db.add(SignInEvent(user_id=user_id, kind=kind, user_agent=agent, ip_address=ip))
        db.commit()
    finally:
        db.close()


def second_step_ok(user_id: uuid.UUID, code: str) -> bool:
    """A code from the authenticator app, or an unused backup code (which is then used up)."""
    from app.core import totp
    db = new_session(user_id=user_id)
    try:
        user = db.get(User, user_id)
        if user.totp_secret and totp.verify(user.totp_secret, code):
            return True
        if use_backup_code(db, user_id, code):
            db.commit()
            return True
        return False
    finally:
        db.close()
