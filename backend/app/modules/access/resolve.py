"""What a person may do: their role's permissions in their company, with their own exceptions. Used on every
request, so it imports nothing that depends on the request itself."""
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import APP_ROLES, LOCKED_ROLES, ROLE_PERMISSIONS, Role
from app.modules.access.models import OrgRole, PermissionOverride


def role_permissions(db: Session, role: str) -> set[str]:
    """What a role may do in this company: its own version when it has one, else FlyFleet's template."""
    try:
        template = Role(role)
    except ValueError:
        template = None
    if template is not None and template in LOCKED_ROLES:
        return set(ROLE_PERMISSIONS[template])
    own = db.scalar(select(OrgRole.permissions).where(OrgRole.key == role))
    if own is not None:
        return set(own)
    return set(ROLE_PERMISSIONS.get(template, set())) if template else set()


def resolve(db: Session, user_id: uuid.UUID, role: str) -> frozenset[str]:
    """A person's permissions: their role's, plus what they are allowed, minus what they are denied."""
    base = role_permissions(db, role)
    if role in (Role.OWNER.value, Role.ADMIN.value) or role in APP_ROLES:
        return frozenset(base)
    rows = db.execute(select(PermissionOverride.permission, PermissionOverride.effect)
                      .where(PermissionOverride.user_id == user_id)).all()
    allow = {perm for perm, effect in rows if effect == "allow"}
    deny = {perm for perm, effect in rows if effect == "deny"}
    return frozenset((base | allow) - deny)




def roles_with(db: Session, permission: str) -> set[str]:
    """The role keys in this company whose role grants `permission`, before anyone's own exceptions."""
    keys = {r.value for r in Role if r is not Role.CUSTOMER}
    keys |= set(db.scalars(select(OrgRole.key)))
    return {k for k in keys if permission in role_permissions(db, k)}


def dispatcher_roles(db: Session) -> set[str]:
    """Roles that dispatch: they assign loads, and don't run the company."""
    return roles_with(db, "dispatch.assign") - roles_with(db, "users.manage")
