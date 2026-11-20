"""Company administration: settings, team, roles, terminals, preferences, saved views, audit log."""
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy import func, or_, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.crud import like, resource_router
from app.core.deps import Principal, get_db, get_principal, require
from app.core.errors import Conflict, Forbidden, Invalid, NotFound
from app.core.pagination import Page, envelope, paginate, parse_sort
from app.core.permissions import Role
from app.core.security import hash_password
from app.modules.access import service as access
from app.modules.organizations import schemas as s
from app.modules.organizations.models import (
    AuditLog,
    Membership,
    Organization,
    SavedView,
    Terminal,
    User,
    UserPreference,
)

router = APIRouter()

# ---------------------------------------------------------------- company settings
settings_router = APIRouter(tags=["organization"])


@settings_router.get("/organization", response_model=s.OrganizationOut)
def get_organization(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    return db.get(Organization, p.org_id)


@settings_router.patch("/organization", response_model=s.OrganizationOut)
def update_organization(body: s.OrganizationPatch, p: Principal = Depends(require("organization.manage")),
                        db: Session = Depends(get_db)):
    org = db.get(Organization, p.org_id)
    changes = body.model_dump(exclude_unset=True)
    for required in ("name", "timezone", "default_payment_terms_days", "load_number_prefix", "invoice_number_prefix"):
        if required in changes and changes[required] is None:
            raise Invalid("This field can't be empty", field=required)
    if changes.get("code") is None:
        changes.pop("code", None)
    if changes.get("color") is None:
        changes.pop("color", None)
    if "code" in changes:
        changes["code"] = changes["code"].upper()
        rows = db.execute(text("SELECT code FROM auth_account_companies(:a)"), {"a": p.account_id}).all()
        # Only the account owner can list the account's companies; the unique index decides for everyone else.
        if any(r.code.lower() == changes["code"].lower() and r.code != org.code for r in rows):
            raise Conflict("Another company in your account already uses this code", code="CODE_TAKEN",
                           field_errors={"code": "Already used by another company in your account"})
    for k, v in changes.items():
        setattr(org, k, v)
    try:
        db.flush()
    except IntegrityError as e:
        db.rollback()
        if "uq_organizations_account_code" in str(e.orig):
            raise Conflict("Another company in your account already uses this code", code="CODE_TAKEN",
                           field_errors={"code": "Already used by another company in your account"}) from e
        raise
    audit(db, p, "organization.updated", "organization", org.id, body.model_dump(mode="json", exclude_unset=True))
    db.commit()
    return org


# ---------------------------------------------------------------- team
team_router = APIRouter(tags=["team"])


def _member_out(m: Membership, u: User) -> s.MemberOut:
    return s.MemberOut(user_id=u.id, email=u.email, full_name=u.full_name, role=m.role, active=m.active)




@team_router.get("/members", response_model=list[s.MemberOut])
def list_members(p: Principal = Depends(require("users.manage")), db: Session = Depends(get_db)):
    rows = db.execute(select(Membership, User).join(User, User.id == Membership.user_id)
                      .where(Membership.organization_id == p.org_id).order_by(User.full_name)).all()
    return [_member_out(m, u) for m, u in rows]


@team_router.post("/members", response_model=s.MemberOut, status_code=201)
def add_member(body: s.MemberCreate, p: Principal = Depends(require("users.manage")), db: Session = Depends(get_db)):
    access.check_assignable(db, p, body.role)
    existing = db.execute(text("SELECT id, full_name FROM auth_lookup_user(:e)"), {"e": body.email}).first()
    if existing:
        # A person with a FlyFleet sign-in already. They keep their own password; only access is added.
        if db.scalar(select(Membership.id).where(Membership.user_id == existing.id,
                                                 Membership.organization_id == p.org_id)):
            raise Conflict("This person is already on the team", code="DUPLICATE_REFERENCE",
                           field_errors={"email": "This person is already on the team"})
        uid, name = existing.id, existing.full_name
    else:
        if not body.password:
            raise Invalid("Set a temporary password for a new sign-in", field="password")
        uid = db.execute(text("SELECT auth_create_user(:e, :n, :h)"),
                         {"e": body.email, "n": body.full_name, "h": hash_password(body.password)}).scalar_one()
        name = body.full_name
    m = Membership(organization_id=p.org_id, user_id=uid, role=body.role)
    db.add(m)
    audit(db, p, "member.added", "user", uid, {"role": body.role, "email": body.email.lower(),
                                                "existing_account": existing is not None})
    db.commit()
    return s.MemberOut(user_id=uid, email=body.email.lower(), full_name=name, role=m.role, active=True)


@team_router.patch("/members/{user_id}", response_model=s.MemberOut)
def update_member(user_id: uuid.UUID, body: s.MemberPatch, p: Principal = Depends(require("users.manage")),
                  db: Session = Depends(get_db)):
    m = db.scalar(select(Membership).where(Membership.user_id == user_id, Membership.organization_id == p.org_id)
                  .with_for_update())
    if m is None:
        raise NotFound("Team member not found")
    u = db.get(User, user_id)
    is_owner_row = m.role == Role.OWNER.value
    if body.role:
        access.check_assignable(db, p, body.role)
    if is_owner_row and p.role != Role.OWNER.value and (body.role or body.active is False):
        raise Forbidden("Only an owner can change or deactivate an owner")
    demoting = (body.role is not None and body.role != Role.OWNER.value) or body.active is False
    if is_owner_row and m.active and demoting:
        owners = db.scalar(select(func.count()).select_from(Membership).where(
            Membership.organization_id == p.org_id, Membership.role == Role.OWNER.value, Membership.active.is_(True)))
        if owners <= 1:
            raise Conflict("A company must keep at least one active owner", code="LAST_OWNER")
    changes = {}
    if body.role and body.role != m.role:
        changes["role"] = [access.label_of(db, m.role), access.label_of(db, body.role)]
        m.role = body.role
    if body.active is not None and body.active != m.active:
        changes["access"] = ["active" if m.active else "removed", "active" if body.active else "removed"]
        m.active = body.active
    audit(db, p, "member.updated", "user", user_id, {"changes": changes})
    db.commit()
    return _member_out(m, u)


# ---------------------------------------------------------------- terminals
terminals_router = resource_router(
    prefix="/terminals", tag="terminals", entity="terminal", label="terminal", model=Terminal,
    create_schema=s.TerminalCreate, update_schema=s.TerminalUpdate, read_schema=s.TerminalRead,
    read_perm="dashboard.read", write_perm="organization.manage", list_params=s.TerminalListParams,
    search=("name", "code", "city"), sort={"name": Terminal.name, "created_at": Terminal.created_at},
    default_sort="name", archivable=True)


# ---------------------------------------------------------------- preferences and saved views
prefs_router = APIRouter(tags=["preferences"])


@prefs_router.get("/preferences", response_model=dict[str, Any])
def get_preferences(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """The caller's own settings in this company (table columns, chosen terminal and so on)."""
    rows = db.execute(select(UserPreference.key, UserPreference.value).where(UserPreference.user_id == p.user_id))
    return dict(rows.all())


@prefs_router.put("/preferences/{key}", status_code=204)
def set_preference(key: Annotated[str, Path(max_length=80, pattern=r"^[a-z0-9_.:-]+$")],
                   body: s.PreferenceIn, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    stmt = insert(UserPreference).values(organization_id=p.org_id, user_id=p.user_id, key=key, value=body.value)
    db.execute(stmt.on_conflict_do_update(index_elements=["organization_id", "user_id", "key"],
                                          set_={"value": stmt.excluded.value, "updated_at": func.now()}))
    db.commit()


@prefs_router.get("/saved-views", response_model=list[s.SavedViewOut])
def list_saved_views(resource: str = Query(max_length=40), p: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    """The caller's own views plus the ones shared with the whole company."""
    return list(db.scalars(select(SavedView).where(
        SavedView.resource == resource, or_(SavedView.owner_user_id == p.user_id, SavedView.shared.is_(True)))
        .order_by(SavedView.shared.desc(), SavedView.name)))


@prefs_router.post("/saved-views", response_model=s.SavedViewOut, status_code=201)
def create_saved_view(body: s.SavedViewCreate, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if body.shared and not p.can("organization.manage"):
        raise Forbidden("Only an administrator can share a view with the whole company")
    view = SavedView(organization_id=p.org_id, owner_user_id=p.user_id, **body.model_dump())
    db.add(view)
    db.commit()
    return view


@prefs_router.delete("/saved-views/{view_id}", status_code=204)
def delete_saved_view(view_id: uuid.UUID, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    view = db.get(SavedView, view_id)
    if view is None:
        raise NotFound("Saved view not found")
    if view.owner_user_id != p.user_id and not (view.shared and p.can("organization.manage")):
        raise Forbidden("You can only remove your own views")
    db.delete(view)
    db.commit()


# ---------------------------------------------------------------- audit log
audit_router = APIRouter(tags=["audit"])


# The audit log's tabs, by what an action is about.
AUDIT_GROUPS: dict[str, tuple[str, ...]] = {
    "security": ("user.", "member.", "invitation.", "organization.", "access.", "audit.", "owner.sensitive_viewed",
                 "report.exported", "incidents.exported", "ifta.return_exported", "document.downloaded"),
    "permissions": ("role.", "permission.", "dispatch_team.", "member.updated", "member.added", "invitation.accepted"),
    "operations": ("load.", "dispatch.", "incident.", "geofence.", "positions.", "message.", "task.", "vehicle.",
                   "inspection.", "work_order.", "import.", "equipment."),
    "finance": ("invoice.", "payment.", "settlement.", "owner_settlement.", "expense.", "ifta.", "ifta_return."),
    "support": ("support.",),
}


def _entity_labels(db: Session, entries: list[AuditLog]) -> dict[tuple[str, uuid.UUID], str]:
    """Names people know records by, for a page of audit entries, one query per kind of record."""
    from app.modules.access.models import OrgRole
    from app.modules.customers.models import Customer
    from app.modules.documents.models import Document
    from app.modules.drivers.models import Driver
    from app.modules.equipment.models import Trailer, Vehicle
    from app.modules.finance.models import Invoice
    from app.modules.loads.models import Load
    from app.modules.tasks.models import Task
    from app.modules.teams.models import DispatchTeam
    from app.modules.tracking.models import Incident
    kinds = {
        "load": (Load, lambda r: r.load_number), "invoice": (Invoice, lambda r: r.invoice_number or "Draft invoice"),
        "driver": (Driver, lambda r: f"{r.first_name} {r.last_name}"), "vehicle": (Vehicle, lambda r: r.unit_number),
        "trailer": (Trailer, lambda r: r.unit_number), "customer": (Customer, lambda r: r.name),
        "document": (Document, lambda r: r.filename), "user": (User, lambda r: r.full_name),
        "incident": (Incident, lambda r: r.number), "task": (Task, lambda r: r.title),
        "dispatch_team": (DispatchTeam, lambda r: r.name), "role": (OrgRole, lambda r: r.name),
    }
    out: dict[tuple[str, uuid.UUID], str] = {}
    for kind, (model, name) in kinds.items():
        ids = {e.entity_id for e in entries if e.entity_type == kind and e.entity_id}
        if ids:
            for row in db.scalars(select(model).where(model.id.in_(ids))):
                out[(kind, row.id)] = name(row)
    return out


@audit_router.get("/audit-logs", response_model=Page[s.AuditOut], responses={200: {"content": {"text/csv": {}}}})
def audit_logs(params: Annotated[s.AuditListParams, Query()], p: Principal = Depends(require("audit.read")),
               db: Session = Depends(get_db)):
    """What happened, by whom, to which record. Only ever added to."""
    stmt = select(AuditLog, User.full_name, Membership.role).outerjoin(User, User.id == AuditLog.actor_user_id) \
        .outerjoin(Membership, Membership.user_id == AuditLog.actor_user_id)
    if params.group != "all":
        stmt = stmt.where(or_(*[AuditLog.action.like(prefix.replace("_", "\\_") + ("%" if prefix.endswith(".") else ""))
                                for prefix in AUDIT_GROUPS[params.group]]))
    if params.actor_user_id:
        stmt = stmt.where(AuditLog.actor_user_id == params.actor_user_id)
    if params.action:
        stmt = stmt.where(AuditLog.action == params.action)
    if params.entity_type:
        stmt = stmt.where(AuditLog.entity_type == params.entity_type)
    if params.entity_id:
        stmt = stmt.where(AuditLog.entity_id == params.entity_id)
    if params.since:
        stmt = stmt.where(AuditLog.created_at >= params.since)
    if params.until:
        stmt = stmt.where(AuditLog.created_at < params.until)
    if params.q:
        stmt = stmt.where(or_(AuditLog.action.ilike(like(params.q)), AuditLog.request_id == params.q,
                              User.full_name.ilike(like(params.q))))
    sort = parse_sort(params.sort, {"created_at": AuditLog.created_at}, "-created_at")
    if params.format == "csv":
        rows = db.execute(stmt.order_by(AuditLog.created_at.desc(), AuditLog.id).limit(10_000)).all()
    else:
        rows, info = paginate(db, stmt, sort, AuditLog.id, cursor=params.cursor, limit=params.limit, count=params.count)
    labels = _entity_labels(db, [entry for entry, _, _ in rows])
    items = []
    for entry, name, role in rows:
        source = "FlyFleet" if entry.actor_user_id is None else "Driver app" if role == "driver" else "Web"
        items.append(s.AuditOut.model_validate(entry).model_copy(update={
            "actor_name": name, "actor_role": access.label_of(db, role) if role else None,
            "entity_label": labels.get((entry.entity_type, entry.entity_id)), "source": source}))
    if params.format == "csv":
        import csv
        import io

        from fastapi import Response
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["Time", "Actor", "Role", "Action", "Entity", "Record", "Source", "Request ID"])
        for e in items:
            w.writerow([e.created_at.isoformat(), e.actor_name or "FlyFleet", e.actor_role or "", e.action,
                        e.entity_type, e.entity_label or (str(e.entity_id) if e.entity_id else ""), e.source,
                        e.request_id or ""])
        audit(db, p, "audit.exported", "organization", p.org_id, {"group": params.group, "rows": len(items)})
        db.commit()
        return Response(content="\ufeff" + out.getvalue(), media_type="text/csv", headers={
            "Content-Disposition": f'attachment; filename="audit-log-{p.today()}.csv"', "Cache-Control": "private, no-store"})
    return envelope(items, info)


for sub in (settings_router, team_router, terminals_router, prefs_router, audit_router):
    router.include_router(sub)
