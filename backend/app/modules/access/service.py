"""Roles, the exceptions people have to them, and what a person may do as a result.

FlyFleet defines template roles. A company can change a template role for itself (a dispatcher who may also
export reports, say), or make custom roles from one, and give one person an allowance or a denial on top of their
role. Denials always win. Full-access roles and the driver app and owner portal roles can't be changed, and only
full-access roles manage the team, so nobody can take that away from the company or hand it out by accident.
"""
import hashlib
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.deps import Principal
from app.core.errors import Conflict, Forbidden, Invalid, NotFound
from app.core.permissions import (
    APP_ROLES,
    GRANTABLE,
    LOCKED_ROLES,
    MATRIX,
    PERMISSION_GROUPS,
    ROLE_LABELS,
    ROLE_PERMISSIONS,
    Role,
)
from app.modules.access.models import Invitation, OrgRole, PermissionOverride
from app.modules.access.resolve import role_permissions  # noqa: F401  (re-exported)
from app.modules.drivers.models import Driver
from app.modules.organizations.models import AuditLog, Membership, User

LOCKED = {r.value for r in LOCKED_ROLES}
LABELS = {p: label for group in PERMISSION_GROUPS.values() for p, label in group.items()}
CELL = {perm: (row["label"], action) for _, rows in MATRIX for row in rows for action, perm in row["cells"].items()}


def describe(permission: str) -> str:
    """'Loads › Export'-style name of a permission, as the role editor shows it."""
    module, action = CELL.get(permission, (LABELS.get(permission, permission), ""))
    return f"{module} › {action}" if action else module


def _rows(db: Session) -> dict[str, OrgRole]:
    return {r.key: r for r in db.scalars(select(OrgRole))}


def roles(db: Session) -> list[dict[str, Any]]:
    """Every role a person in this company can have, in the order the editor lists them."""
    own = _rows(db)
    counts = dict(db.execute(select(Membership.role, func.count()).where(Membership.active.is_(True))
                             .group_by(Membership.role)).all())
    editors = dict(db.execute(select(User.id, User.full_name).where(
        User.id.in_({r.updated_by for r in own.values() if r.updated_by}))).all()) if own else {}
    out = []
    for role in Role:
        if role is Role.CUSTOMER:
            continue
        row = own.get(role.value) if role not in LOCKED_ROLES else None
        template = sorted(ROLE_PERMISSIONS[role])
        perms = sorted(row.permissions) if row else template
        out.append({"key": role.value, "label": row.name if row else ROLE_LABELS[role][0],
                     "description": (row.description if row and row.description else ROLE_LABELS[role][1]),
                     "locked": role in LOCKED_ROLES, "custom": False, "template": role.value,
                     "assignable": role.value not in (Role.OWNER_PORTAL.value,),
                     "permissions": perms, "changed": bool(row) and perms != template,
                     "members": counts.get(role.value, 0), "updated_at": row.updated_at if row else None,
                     "updated_by_name": editors.get(row.updated_by) if row else None,
                     "version": row.version if row else 0})
    for row in sorted((r for r in own.values() if r.custom), key=lambda r: r.name.lower()):
        out.append({"key": row.key, "label": row.name, "description": row.description or "Custom role",
                    "locked": False, "custom": True, "template": row.template, "assignable": True,
                    "permissions": sorted(row.permissions), "changed": False, "members": counts.get(row.key, 0),
                    "updated_at": row.updated_at, "updated_by_name": editors.get(row.updated_by),
                    "version": row.version})
    return out


def label_of(db: Session, role: str) -> str:
    try:
        return ROLE_LABELS[Role(role)][0]
    except ValueError:
        return db.scalar(select(OrgRole.name).where(OrgRole.key == role)) or role


def check_assignable(db: Session, p: Principal, role: str) -> None:
    """A role that can be given to someone on the team, by this person."""
    if role == Role.CUSTOMER.value:
        raise Forbidden("Customer access is granted through the customer portal, not the team screen")
    if role == Role.OWNER_PORTAL.value:
        raise Forbidden("Owner portal access is given from the owner's record")
    if role == Role.OWNER.value and p.role != Role.OWNER.value:
        raise Forbidden("Only an owner can grant the owner role")
    try:
        Role(role)
    except ValueError:
        if not db.scalar(select(OrgRole.id).where(OrgRole.key == role, OrgRole.custom.is_(True))):
            raise Invalid("Choose one of the company's roles", field="role") from None


def _clean(permissions: list[str]) -> list[str]:
    unknown = sorted(set(permissions) - GRANTABLE)
    if unknown:
        raise Invalid(f"{describe(unknown[0])} can't be given to this role", field="permissions",
                      details={"permissions": unknown})
    return sorted(set(permissions))


def _changes(before: set[str], after: set[str]) -> str:
    parts = [f"granted {describe(x)}" for x in sorted(after - before)] + \
            [f"revoked {describe(x)}" for x in sorted(before - after)]
    return ", ".join(parts[:4]) + (f" and {len(parts) - 4} more" if len(parts) > 4 else "")


def save_role(db: Session, p: Principal, key: str, *, permissions: list[str], name: str | None,
              description: str | None, version: int | None) -> OrgRole:
    """Change a template role for this company, or a custom role."""
    if key in LOCKED:
        raise Forbidden("This role can't be changed")
    try:
        template: Role | None = Role(key)
    except ValueError:
        template = None
    row = db.scalar(select(OrgRole).where(OrgRole.key == key).with_for_update())
    if row is None and template is None:
        raise NotFound("Role not found")
    current = row.version if row else 0
    if version is not None and version != current:
        raise Conflict("Someone else changed this role. Look at the latest and try again.", code="VERSION_CONFLICT",
                       details={"current_version": current})
    before = set(row.permissions) if row else set(ROLE_PERMISSIONS[template])
    clean = _clean(permissions)
    label = (name or "").strip() or (row.name if row else ROLE_LABELS[template][0])
    if row is None:
        row = OrgRole(organization_id=p.org_id, key=key, name=label, template=key, custom=False,
                      description=(description or "").strip() or ROLE_LABELS[template][1], permissions=clean,
                      created_by=p.user_id, updated_by=p.user_id)
        db.add(row)
    else:
        row.name, row.permissions, row.updated_by, row.updated_at = label, clean, p.user_id, func.now()
        if description is not None:
            row.description = description.strip() or None
        row.version += 1
    db.flush()
    what = _changes(before, set(clean))
    audit(db, p, "role.changed", "role", row.id, {"key": key, "text": f"{what or 'saved'} for {label}",
                                                  "granted": sorted(set(clean) - before),
                                                  "revoked": sorted(before - set(clean))})
    return row


def reset_role(db: Session, p: Principal, key: str) -> None:
    """A template role back to how FlyFleet defines it."""
    row = db.scalar(select(OrgRole).where(OrgRole.key == key, OrgRole.custom.is_(False)))
    if row is None:
        return
    name = row.name
    db.delete(row)
    audit(db, p, "role.reset", "role", None, {"key": key, "text": f"reset {name} to the FlyFleet template"})


def create_role(db: Session, p: Principal, *, name: str, description: str | None, from_key: str) -> OrgRole:
    """A custom role, starting from another role's permissions."""
    label = re.sub(r"\s+", " ", (name or "").strip())
    if not label:
        raise Invalid("Name the role", field="name")
    taken = {r["label"].lower() for r in roles(db)}
    if label.lower() in taken:
        raise Invalid("Another role has that name", field="name")
    source = next((r for r in roles(db) if r["key"] == from_key), None)
    if source is None or from_key in APP_ROLES:
        raise Invalid("Choose a role to start from", field="from_key")
    row = OrgRole(organization_id=p.org_id, key=f"custom_{secrets.token_hex(4)}", name=label[:60],
                  description=(description or "").strip()[:200] or None,
                  template=source["template"] or from_key, custom=True,
                  permissions=sorted(set(source["permissions"]) & GRANTABLE), created_by=p.user_id,
                  updated_by=p.user_id)
    db.add(row)
    db.flush()
    audit(db, p, "role.created", "role", row.id, {"key": row.key, "text": f"created {label} from {source['label']}"})
    return row


def delete_role(db: Session, p: Principal, key: str) -> None:
    row = db.scalar(select(OrgRole).where(OrgRole.key == key, OrgRole.custom.is_(True)))
    if row is None:
        raise NotFound("Role not found")
    held = db.scalar(select(func.count()).select_from(Membership).where(Membership.role == key)) or 0
    if held:
        raise Conflict(f"{held} {'person has' if held == 1 else 'people have'} this role. Give them another role first.",
                       code="ROLE_IN_USE")
    audit(db, p, "role.deleted", "role", None, {"key": key, "text": f"deleted {row.name}"})
    db.delete(row)


# ---------------------------------------------------------------- one person's exceptions
def overrides(db: Session) -> list[dict[str, Any]]:
    rows = db.execute(select(PermissionOverride, User.full_name).join(User, User.id == PermissionOverride.user_id)
                      .order_by(User.full_name, PermissionOverride.permission)).all()
    return [{"id": o.id, "user_id": o.user_id, "name": name, "permission": o.permission,
             "label": describe(o.permission), "effect": o.effect, "note": o.note, "created_at": o.created_at}
            for o, name in rows]


def add_override(db: Session, p: Principal, *, user_id: uuid.UUID, permission: str, effect: str,
                 note: str | None) -> PermissionOverride:
    member = db.execute(select(Membership.role, User.full_name).join(User, User.id == Membership.user_id)
                        .where(Membership.user_id == user_id, Membership.active.is_(True))).first()
    if member is None:
        raise Invalid("Choose someone on the team", field="user_id")
    if member.role in (Role.OWNER.value, Role.ADMIN.value) or member.role in APP_ROLES:
        raise Invalid(f"{member.full_name}'s role can't have exceptions", field="user_id")
    if permission not in GRANTABLE:
        raise Invalid(f"{describe(permission)} can't be given or taken away one person at a time", field="permission")
    row = db.scalar(select(PermissionOverride).where(PermissionOverride.user_id == user_id,
                                                     PermissionOverride.permission == permission))
    if row is None:
        row = PermissionOverride(organization_id=p.org_id, user_id=user_id, permission=permission, effect=effect,
                                 note=(note or "").strip()[:200] or None, created_by=p.user_id)
        db.add(row)
    else:
        row.effect, row.note, row.created_by = effect, (note or "").strip()[:200] or None, p.user_id
    db.flush()
    audit(db, p, "permission.override", "user", user_id,
          {"permission": permission, "effect": effect,
           "text": f"{'allowed' if effect == 'allow' else 'denied'} {describe(permission)} for {member.full_name}"})
    return row


def remove_override(db: Session, p: Principal, override_id: uuid.UUID) -> None:
    row = db.get(PermissionOverride, override_id)
    if row is None:
        raise NotFound("Exception not found")
    name = db.scalar(select(User.full_name).where(User.id == row.user_id))
    audit(db, p, "permission.override_removed", "user", row.user_id,
          {"permission": row.permission, "text": f"removed the {describe(row.permission)} exception for {name}"})
    db.delete(row)


def history(db: Session, limit: int = 8) -> list[dict[str, Any]]:
    rows = db.execute(select(AuditLog.actor_user_id, AuditLog.data, AuditLog.created_at)
                      .where(AuditLog.action.in_(("role.changed", "role.created", "role.deleted", "role.reset",
                                                  "permission.override", "permission.override_removed")))
                      .order_by(AuditLog.created_at.desc()).limit(limit)).all()
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_({r[0] for r in rows if r[0]}))).all()) \
        if rows else {}
    return [{"who": names.get(a) or "FlyFleet", "what": (d or {}).get("text", ""), "at": at} for a, d, at in rows]


# ---------------------------------------------------------------- invitations by link
INVITE_DAYS = 7


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def invite(db: Session, p: Principal, *, email: str, full_name: str, role: str,
           driver_id: uuid.UUID | None = None) -> tuple[Any, str]:
    """An invitation to join with a role, as a link to share. A new one for the same email replaces the old."""
    check_assignable(db, p, role)
    address = email.strip().lower()
    existing = db.execute(text("SELECT id FROM auth_lookup_user(:e)"), {"e": address}).first()
    if existing and db.scalar(select(Membership.id).where(Membership.user_id == existing.id)):
        raise Conflict("This person is already on the team", code="DUPLICATE_REFERENCE",
                       field_errors={"email": "This person is already on the team"})
    if driver_id is not None:
        driver = db.get(Driver, driver_id)
        if driver is None:
            raise Invalid("Driver not found", field="driver_id")
        if driver.user_id is not None:
            raise Conflict("This driver already has a sign-in", code="ALREADY_LINKED")
        if role != Role.DRIVER.value:
            raise Invalid("A driver is invited to the driver app", field="role")
    now = datetime.now(UTC)
    for old in db.scalars(select(Invitation).where(Invitation.email == address, Invitation.accepted_at.is_(None),
                                                   Invitation.revoked_at.is_(None))):
        old.revoked_at = now
    db.flush()
    token = secrets.token_urlsafe(32)
    row = Invitation(organization_id=p.org_id, email=address, full_name=full_name.strip()[:120], role=role,
                     driver_id=driver_id, token_hash=token_hash(token), invited_by=p.user_id,
                     expires_at=now + timedelta(days=INVITE_DAYS))
    db.add(row)
    db.flush()
    audit(db, p, "invitation.created", "invitation", row.id,
          {"email": address, "role": role, "text": f"invited {row.full_name} as {label_of(db, role)}"})
    return row, token


def renew(db: Session, p: Principal, invitation_id: uuid.UUID) -> tuple[Any, str]:
    row = db.get(Invitation, invitation_id)
    if row is None or row.revoked_at or row.accepted_at:
        raise NotFound("Invitation not found")
    token = secrets.token_urlsafe(32)
    row.token_hash, row.expires_at = token_hash(token), datetime.now(UTC) + timedelta(days=INVITE_DAYS)
    audit(db, p, "invitation.renewed", "invitation", row.id, {"email": row.email})
    return row, token


def revoke(db: Session, p: Principal, invitation_id: uuid.UUID) -> None:
    row = db.get(Invitation, invitation_id)
    if row is None or row.revoked_at or row.accepted_at:
        raise NotFound("Invitation not found")
    row.revoked_at = datetime.now(UTC)
    audit(db, p, "invitation.revoked", "invitation", row.id, {"email": row.email})


def invitations(db: Session) -> list[dict[str, Any]]:
    now = datetime.now(UTC)
    rows = list(db.scalars(select(Invitation).where(
        Invitation.revoked_at.is_(None),
        (Invitation.accepted_at.is_(None)) | (Invitation.accepted_at >= now - timedelta(days=14)))
        .order_by(Invitation.created_at.desc()).limit(200)))
    inviters = {r.invited_by for r in rows if r.invited_by}
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_(inviters))).all()) if inviters else {}
    out = []
    for r in rows:
        state = "accepted" if r.accepted_at else "expired" if r.expires_at <= now else "pending"
        out.append({"id": r.id, "email": r.email, "full_name": r.full_name, "role": r.role,
                    "role_label": label_of(db, r.role), "driver_id": r.driver_id, "state": state,
                    "invited_by_name": names.get(r.invited_by), "created_at": r.created_at,
                    "expires_at": r.expires_at, "accepted_at": r.accepted_at})
    return out
