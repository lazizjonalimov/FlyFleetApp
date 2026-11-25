"""Roles and permissions: the company's roles with what each may do, custom roles, and one person's exceptions."""
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.deps import Principal, get_db, get_principal, require
from app.core.permissions import ACTIONS, GRANTABLE, MATRIX, PERMISSION_GROUPS
from app.modules.access import service

router = APIRouter(tags=["team"])
MANAGE = require("users.manage")


class PermissionOut(BaseModel):
    key: str
    label: str


class PermissionGroupOut(BaseModel):
    name: str
    permissions: list[PermissionOut]


class RoleOut(BaseModel):
    key: str
    label: str
    description: str
    locked: bool = Field(description="FlyFleet's own: full access, the driver app or the owner portal")
    custom: bool
    template: str | None
    assignable: bool
    permissions: list[str]
    changed: bool = Field(description="A template role this company has changed")
    members: int
    updated_at: datetime | None
    updated_by_name: str | None
    version: int


class MatrixModule(BaseModel):
    key: str
    label: str
    sensitive: bool
    locked: bool
    note: str | None
    cells: dict[str, str | None] = Field(description="For each action, the permission it is, or null for none")


class MatrixGroup(BaseModel):
    name: str
    modules: list[MatrixModule]


class Matrix(BaseModel):
    actions: list[str]
    groups: list[MatrixGroup]


class OverrideOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    permission: str
    label: str
    effect: Literal["allow", "deny"]
    note: str | None
    created_at: datetime


class AccessChange(BaseModel):
    who: str
    what: str
    at: datetime


class RoleMatrixOut(BaseModel):
    roles: list[RoleOut]
    matrix: Matrix
    groups: list[PermissionGroupOut]
    grantable: list[str]
    overrides: list[OverrideOut]
    history: list[AccessChange]


class RoleSave(BaseModel):
    permissions: list[str] = Field(max_length=200)
    name: str | None = Field(default=None, max_length=60)
    description: str | None = Field(default=None, max_length=200)
    version: int | None = None


class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=200)
    from_key: str = Field(max_length=40, description="The role whose permissions it starts with")


class OverrideIn(BaseModel):
    user_id: uuid.UUID
    permission: str = Field(max_length=60)
    effect: Literal["allow", "deny"]
    note: str | None = Field(default=None, max_length=200)


def _matrix(db: Session, p: Principal) -> RoleMatrixOut:
    groups = [MatrixGroup(name=name, modules=[MatrixModule(
        key=row["key"], label=row["label"], sensitive=row.get("sensitive", False), locked=row.get("locked", False),
        note=row.get("note"), cells={a: row["cells"].get(a) for a in ACTIONS}) for row in rows]) for name, rows in MATRIX]
    managing = p.can("users.manage")
    return RoleMatrixOut(
        roles=service.roles(db), matrix=Matrix(actions=list(ACTIONS), groups=groups),
        groups=[PermissionGroupOut(name=name, permissions=[PermissionOut(key=k, label=v) for k, v in perms.items()])
                for name, perms in PERMISSION_GROUPS.items()],
        grantable=sorted(GRANTABLE), overrides=service.overrides(db) if managing else [],
        history=service.history(db) if managing else [])


@router.get("/roles", response_model=RoleMatrixOut)
def role_matrix(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """The company's roles and what each may do, laid out by module and action. Those who manage the team also
    get the exceptions people have and the latest changes."""
    return _matrix(db, p)


@router.put("/roles/{key}", response_model=RoleMatrixOut)
def save_role(key: str, body: RoleSave, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    """Change what a role may do. Takes effect on the next request of everyone who has it."""
    service.save_role(db, p, key, permissions=body.permissions, name=body.name, description=body.description,
                      version=body.version)
    db.commit()
    return _matrix(db, p)


@router.post("/roles", response_model=RoleMatrixOut, status_code=201)
def create_role(body: RoleCreate, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    service.create_role(db, p, name=body.name, description=body.description, from_key=body.from_key)
    db.commit()
    return _matrix(db, p)


@router.post("/roles/{key}/reset", response_model=RoleMatrixOut)
def reset_role(key: str, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    """A template role back to FlyFleet's definition."""
    service.reset_role(db, p, key)
    db.commit()
    return _matrix(db, p)


@router.delete("/roles/{key}", response_model=RoleMatrixOut)
def delete_role(key: str, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    """A custom role nobody has."""
    service.delete_role(db, p, key)
    db.commit()
    return _matrix(db, p)


@router.post("/permission-overrides", response_model=RoleMatrixOut, status_code=201)
def add_override(body: OverrideIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    """Allow or deny one permission for one person, whatever their role says. A denial wins."""
    service.add_override(db, p, user_id=body.user_id, permission=body.permission, effect=body.effect, note=body.note)
    db.commit()
    return _matrix(db, p)


@router.delete("/permission-overrides/{override_id}", response_model=RoleMatrixOut)
def remove_override(override_id: uuid.UUID, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    service.remove_override(db, p, override_id)
    db.commit()
    return _matrix(db, p)


# ---------------------------------------------------------------- invitations
class InvitationOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    role_label: str
    driver_id: uuid.UUID | None
    state: Literal["pending", "expired", "accepted", "declined"]
    invited_by_name: str | None
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None


class InvitationIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=2, max_length=40)
    driver_id: uuid.UUID | None = Field(default=None, description="Invite this driver to the driver app")


class InvitationLink(BaseModel):
    invitation: InvitationOut
    path: str = Field(description="The link to share, on the web app's own address. It is shown only once.")
    code: str | None = Field(default=None, description="An 8-character code for someone who already has a FlyFleet "
                             "sign-in to type under Add a company › Join. Shown only once; expires with the link.")


def _one(db: Session, invitation_id: uuid.UUID) -> dict:
    return next(i for i in service.invitations(db) if i["id"] == invitation_id)


@router.get("/invitations", response_model=list[InvitationOut])
def list_invitations(p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    """Invitations waiting to be used, expired ones, and those used in the last two weeks."""
    return service.invitations(db)


@router.post("/invitations", response_model=InvitationLink, status_code=201)
def create_invitation(body: InvitationIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    """An invitation to join with a role. FlyFleet doesn't send email yet: share the link the answer gives."""
    row, token = service.invite(db, p, email=body.email, full_name=body.full_name, role=body.role,
                                driver_id=body.driver_id)
    code = service.issue_code(row)
    db.commit()
    return {"invitation": _one(db, row.id), "path": f"/invite/{token}", "code": code}


@router.post("/invitations/{invitation_id}/renew", response_model=InvitationLink)
def renew_invitation(invitation_id: uuid.UUID, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    """A fresh link, valid for another week. The old link stops working."""
    row, token = service.renew(db, p, invitation_id)
    code = service.issue_code(row)
    db.commit()
    return {"invitation": _one(db, row.id), "path": f"/invite/{token}", "code": code}


@router.delete("/invitations/{invitation_id}", status_code=204)
def revoke_invitation(invitation_id: uuid.UUID, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    service.revoke(db, p, invitation_id)
    db.commit()


# ---------------------------------------------------------------- access review
class ReviewRow(BaseModel):
    user_id: uuid.UUID
    name: str
    email: str
    role: str
    role_label: str
    active: bool
    permissions: int
    sensitive: list[str] = Field(description="Sensitive access they hold: rates, driver IDs, owner tax and bank")
    exceptions: list[str]
    team: str | None


SENSITIVE = ("loads.rates.read", "drivers.sensitive.read", "owners.sensitive.read", "users.manage", "audit.read")


@router.get("/access-review", response_model=list[ReviewRow],
            responses={200: {"content": {"text/csv": {}}}})
def access_review(format: Literal["json", "csv"] = "json", p: Principal = Depends(MANAGE),
                  db: Session = Depends(get_db)):
    """Who can do what: each person's role, their exceptions and the sensitive access they end up with."""
    import csv
    import io

    from fastapi import Response
    from sqlalchemy import select

    from app.core.audit import audit
    from app.modules.access.resolve import resolve
    from app.modules.organizations.models import Membership, User
    from app.modules.teams.models import DispatchTeam, DispatchTeamMember
    teams = dict(db.execute(select(DispatchTeamMember.user_id, DispatchTeam.name)
                            .join(DispatchTeam, DispatchTeam.id == DispatchTeamMember.team_id)).all())
    exceptions: dict[uuid.UUID, list[str]] = {}
    for o in service.overrides(db):
        exceptions.setdefault(o["user_id"], []).append(f"{'Allow' if o['effect'] == 'allow' else 'Deny'} {o['label']}")
    rows = []
    for m, u in db.execute(select(Membership, User).join(User, User.id == Membership.user_id)
                           .order_by(Membership.active.desc(), User.full_name)).all():
        granted = resolve(db, u.id, m.role)
        rows.append(ReviewRow(user_id=u.id, name=u.full_name, email=u.email, role=m.role,
                              role_label=service.label_of(db, m.role), active=m.active, permissions=len(granted),
                              sensitive=[service.describe(x) for x in SENSITIVE if x in granted],
                              exceptions=exceptions.get(u.id, []), team=teams.get(u.id)))
    if format == "json":
        return rows
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Name", "Email", "Role", "Active", "Permissions", "Sensitive access", "Exceptions", "Dispatch team"])
    for r in rows:
        w.writerow([r.name, r.email, r.role_label, "yes" if r.active else "no", r.permissions, "; ".join(r.sensitive),
                    "; ".join(r.exceptions), r.team or ""])
    audit(db, p, "access.reviewed", "organization", p.org_id, {"rows": len(rows)})
    db.commit()
    return Response(content="﻿" + out.getvalue(), media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="access-review-{p.today()}.csv"', "Cache-Control": "private, no-store"})


# ---------------------------------------------------------------- asking for access
class AccessRequestIn(BaseModel):
    permission: str = Field(max_length=60)
    context: str | None = Field(default=None, max_length=120, description="Where it was asked from, e.g. a load")


class AccessRequestOut(BaseModel):
    asked: list[str] = Field(description="Who was asked just now")
    already: bool = Field(description="True when everyone had already been asked and hasn't answered")
    admins: list[str]


@router.post("/access-requests", response_model=AccessRequestOut, status_code=201,
             summary="Ask the people who manage the team for a permission the role doesn't give")
def request_access(body: AccessRequestIn, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    out = service.request_access(db, p, body.permission, body.context)
    db.commit()
    return AccessRequestOut(**out)
