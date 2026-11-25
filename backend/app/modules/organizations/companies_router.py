"""Your companies: the ones your profile can open (up to ten, active and archived together), adding one, joining
one with an invitation, your default company, and archiving, restoring or leaving one.

Personal: every signed-in person can use these for their own memberships, whatever their role in the company
they are working in. What a person may do to a company is decided by their role in *that* company (archive and
restore need its Main Admin). Every change is recorded in the affected company's audit log.
"""
import dataclasses
import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.orm import Session

from app.core import fmcsa, mail
from app.core.config import get_settings
from app.core.db import new_session
from app.core.deps import Principal, get_db, get_principal
from app.core.errors import Conflict, Forbidden, Invalid, NotFound
from app.core.permissions import Role
from app.core.ratelimit import FailureLimiter
from app.modules.access import service as access
from app.modules.access.models import Invitation
from app.modules.loads.models import Load
from app.modules.organizations import identity
from app.modules.organizations import schemas as s
from app.modules.organizations.auth_router import add_organization
from app.modules.organizations.models import (
    Account,
    AuditLog,
    Membership,
    Organization,
    SavedView,
    User,
    UserPreference,
)
from app.modules.settlements.models import DriverSettlement
from app.modules.settlements.owner_models import OwnerSettlement

router = APIRouter(prefix="/me", tags=["companies"])
_limiter = FailureLimiter()

LIMIT = 10
RESTORE_DAYS = 90
SWATCHES = identity.PALETTE[:8]
FLEET_SIZES = ("1-5", "6-20", "21-50", "51+")
US_STATES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
    "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR",
    "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "PR"}
ON_THE_ROAD = ("dispatched", "at_pickup", "in_transit", "at_delivery")


# ---------------------------------------------------------------- what the switcher and the page show
class MyCompany(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    code: str
    color: str
    mc_number: str | None
    dot_number: str | None
    home_state: str | None
    status: Literal["active", "archived"]
    archived_at: datetime | None
    restorable_until: datetime | None = Field(description="Archived companies can be restored until then")
    role: str
    role_label: str
    is_main_admin: bool
    sole_main_admin: bool = Field(description="The only Main Admin: can't leave without handing ownership on")
    member_since: datetime
    last_opened_at: datetime | None
    drivers: int
    trucks: int
    people: int
    is_default: bool


class MyInvitation(BaseModel):
    id: uuid.UUID
    company_name: str
    company_code: str
    company_color: str
    mc_number: str | None
    drivers: int
    trucks: int
    role_label: str
    invited_by_name: str | None
    expires_at: datetime


class MyCompaniesOut(BaseModel):
    limit: int
    used: int = Field(description="Active and archived companies together; both count toward the limit")
    default_company_id: uuid.UUID | None
    companies: list[MyCompany]
    invitations: list[MyInvitation]


def _label(role: str, name: str | None) -> str:
    return name or s.role_label_of(role)


def _rows(db: Session, user_id: uuid.UUID):
    return db.execute(text("SELECT * FROM auth_user_companies(:u)"), {"u": user_id}).all()


def _companies(db: Session, user_id: uuid.UUID) -> list[MyCompany]:
    default = db.scalar(select(User.default_organization_id).where(User.id == user_id))
    out = []
    for r in _rows(db, user_id):
        main = r.role == Role.OWNER.value
        out.append(MyCompany(
            id=r.organization_id, name=r.name, slug=r.slug, code=r.code, color=r.color, mc_number=r.mc_number,
            dot_number=r.dot_number, home_state=r.home_state, status=r.status, archived_at=r.archived_at,
            restorable_until=r.archived_at + timedelta(days=RESTORE_DAYS) if r.archived_at else None,
            role=r.role, role_label=_label(r.role, r.role_name), is_main_admin=main,
            sole_main_admin=main and r.main_admins <= 1, member_since=r.member_since, last_opened_at=r.last_opened_at,
            drivers=r.drivers, trucks=r.trucks, people=r.people, is_default=r.organization_id == default))
    return out


def _invitation_out(r) -> MyInvitation:
    return MyInvitation(id=r.invitation_id, company_name=r.org_name, company_code=r.org_code,
                        company_color=r.org_color, mc_number=r.org_mc, drivers=r.drivers, trucks=r.trucks,
                        role_label=_label(r.role, r.role_name), invited_by_name=r.invited_by_name,
                        expires_at=r.expires_at)


def _invitations(db: Session, user_id: uuid.UUID) -> list:
    return db.execute(text("SELECT * FROM auth_invitations_for_user(:u)"), {"u": user_id}).all()


def _overview(db: Session, p: Principal) -> MyCompaniesOut:
    companies = _companies(db, p.user_id)
    return MyCompaniesOut(limit=LIMIT, used=len(companies),
                          default_company_id=next((c.id for c in companies if c.is_default), None),
                          companies=companies, invitations=[_invitation_out(r) for r in _invitations(db, p.user_id)])


@router.get("/companies", response_model=MyCompaniesOut)
def my_companies(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """The companies you can open, with your role, size and when you last opened each, and invitations waiting
    for you. Open to every signed-in person."""
    return _overview(db, p)


def _check_room(db: Session, user_id: uuid.UUID) -> None:
    used = len(_rows(db, user_id))
    if used >= LIMIT:
        raise Conflict(f"You can open up to {LIMIT} companies, active and archived together. Leave one, or ask a "
                       "Main Admin to remove you from one, to make room.",
                       code="COMPANY_LIMIT_REACHED", details={"limit": LIMIT, "used": used})


def _mine(db: Session, user_id: uuid.UUID, company_id: uuid.UUID) -> MyCompany:
    company = next((c for c in _companies(db, user_id) if c.id == company_id), None)
    if company is None:
        raise NotFound("Company not found")
    return company


def _log(org_id: uuid.UUID, user_id: uuid.UUID, action: str, data: dict | None = None) -> None:
    """Record a change in the affected company's own audit log."""
    db = new_session(org_id=org_id, user_id=user_id)
    try:
        db.add(AuditLog(organization_id=org_id, actor_user_id=user_id, action=action, entity_type="organization",
                        entity_id=org_id, data=data))
        db.commit()
    finally:
        db.close()


def _fall_back_default(db: Session, user_id: uuid.UUID, leaving: uuid.UUID) -> None:
    """When the default company is archived or left, the next active company becomes the default."""
    user = db.get(User, user_id)
    if user.default_organization_id == leaving:
        other = next((c.id for c in _companies(db, user_id) if c.status == "active" and c.id != leaving), None)
        user.default_organization_id = other


# ---------------------------------------------------------------- adding a company
class McCheckIn(BaseModel):
    mc_number: str = Field(max_length=20)


class McCheckOut(BaseModel):
    mc_number: str
    status: Literal["authorized", "not_authorized", "not_found", "unchecked", "unavailable", "taken", "invalid"]
    message: str
    legal_name: str | None = None
    dot_number: str | None = None
    home_state: str | None = None


def _mc_check(db: Session, raw: str) -> McCheckOut:
    number = fmcsa.digits(raw)
    if not 5 <= len(number) <= 7:
        return McCheckOut(mc_number=number, status="invalid", message="An MC number is 5 to 7 digits")
    if db.scalar(text("SELECT auth_mc_taken(:m)"), {"m": number}):
        return McCheckOut(mc_number=number, status="taken",
                          message="This MC number is already on FlyFleet. Ask its Main Admin to invite you.")
    carrier = fmcsa.lookup(number)
    messages = {
        "authorized": "Verified with FMCSA · authorized for hire",
        "not_authorized": "FMCSA lists this MC as not authorized to operate",
        "not_found": "FMCSA has no carrier with this MC number",
        "unchecked": "Not checked with FMCSA: the lookup isn’t set up on this FlyFleet installation",
        "unavailable": "FMCSA didn’t answer. Try again in a moment.",
    }
    return McCheckOut(mc_number=number, status=carrier.status, message=messages[carrier.status],
                      legal_name=carrier.legal_name, dot_number=carrier.dot_number, home_state=carrier.state)


@router.post("/companies/mc-check", response_model=McCheckOut)
def check_mc(body: McCheckIn, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Whether an MC number can be used for a new company: its format, that no company on FlyFleet has it, and
    what FMCSA says about it."""
    return _mc_check(db, body.mc_number)


class CompanyIn(BaseModel):
    name: str = Field(min_length=3, max_length=160, description="The legal company name")
    mc_number: str = Field(max_length=20)
    dot_number: str | None = Field(default=None, max_length=12)
    home_state: str = Field(min_length=2, max_length=2)
    fleet_size: Literal["1-5", "6-20", "21-50", "51+"]
    color: str
    invite_emails: list[EmailStr] = Field(default=[], max_length=20)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 3:
            raise ValueError("Enter the company’s legal name")
        return value

    @field_validator("home_state")
    @classmethod
    def _state(cls, value: str) -> str:
        if value.upper() not in US_STATES:
            raise ValueError("Choose a US state")
        return value.upper()

    @field_validator("color")
    @classmethod
    def _color(cls, value: str) -> str:
        if value.upper() not in {c.upper() for c in SWATCHES}:
            raise ValueError("Choose one of the company colours")
        return value.upper()

    @field_validator("dot_number")
    @classmethod
    def _dot(cls, value: str | None) -> str | None:
        value = re.sub(r"[^0-9]", "", value or "")
        if value and not 1 <= len(value) <= 8:
            raise ValueError("A USDOT number is up to 8 digits")
        return value or None


class CreatedOut(BaseModel):
    company: MyCompany
    invited: int


@router.post("/companies", response_model=CreatedOut, status_code=201)
def create_company(body: CompanyIn, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Add a company. You become its Main Admin; it starts empty, and nothing from your other companies is in it."""
    _check_room(db, p.user_id)
    check = _mc_check(db, body.mc_number)
    if check.status == "taken":
        raise Conflict(check.message, code="MC_TAKEN", field_errors={"mc_number": check.message})
    if check.status in ("invalid", "not_authorized", "not_found"):
        raise Invalid(check.message, field="mc_number")

    # The new company sits under your own account; the first company you add yourself makes one.
    account_id = db.scalar(select(Account.id).where(Account.owner_user_id == p.user_id).order_by(Account.created_at))
    current = db.get(Organization, p.org_id)
    new_id = uuid.uuid4()
    dst = new_session(org_id=new_id, user_id=p.user_id)
    try:
        if account_id is None:
            account = Account(name=body.name, owner_user_id=p.user_id)
            dst.add(account)
            dst.flush()
            account_id = account.id
        org = add_organization(
            dst, taken=[(c.code, c.color) for c in _companies(db, p.user_id)], id=new_id, account_id=account_id,
            name=body.name, legal_name=body.name, mc_number=f"MC-{check.mc_number}", dot_number=body.dot_number,
            state=body.home_state, fleet_size=body.fleet_size, color=body.color,
            timezone=current.timezone if current else "UTC",
            base_currency=current.base_currency if current else "USD")
        dst.add(Membership(organization_id=new_id, user_id=p.user_id, role=Role.OWNER.value,
                           last_opened_at=datetime.now(UTC)))
        dst.flush()
        dst.add(AuditLog(organization_id=new_id, actor_user_id=p.user_id, action="organization.created",
                         entity_type="organization", entity_id=new_id,
                         data={"name": body.name, "mc_number": org.mc_number, "fmcsa": check.status}))
        here = dataclasses.replace(p, org_id=new_id, role=Role.OWNER.value, granted=None, scope=None)
        sent = []
        for email in dict.fromkeys(e.lower() for e in body.invite_emails):
            if email == p.email.lower():
                continue
            row, token = access.invite(dst, here, email=email, full_name=email.split("@")[0], role=Role.VIEWER.value)
            sent.append((email, token, access.issue_code(row)))
        dst.commit()
    finally:
        dst.close()
    base = get_settings().public_url.rstrip("/")
    for email, token, code in sent:
        mail.send(email, f"{p.full_name} invited you to {body.name} on FlyFleet",
                  f"{p.full_name} invited you to join {body.name} on FlyFleet.\n\nOpen {base}/invite/{token}\n"
                  f"or, if you already use FlyFleet, choose Add a company › Join and enter the code {code}.\n\n"
                  "The invitation expires in 7 days.")
    return CreatedOut(company=_mine(db, p.user_id, new_id), invited=len(sent))


# ---------------------------------------------------------------- invitations
class InvitationPreviewOut(BaseModel):
    invitation: MyInvitation
    already_member: bool


def _by_code(db: Session, p: Principal, code: str):
    key = f"invite-code|{p.user_id}"
    _limiter.check(key)
    normalized = access.normalize_code(code)
    row = None
    if len(normalized) == 8:
        row = db.execute(text("SELECT * FROM auth_invitation_by_code(:h)"),
                         {"h": access.token_hash(normalized)}).first()
    if row is None:
        _limiter.fail(key)
        raise NotFound("No open invitation has this code. Check it, or ask for a new one: codes expire after 7 days.",
                       code="INVITATION_CODE_INVALID")
    _limiter.reset(key)
    return row


@router.get("/invitations/code/{code}", response_model=InvitationPreviewOut)
def preview_code(code: str, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Which company, role and inviter an invitation code is for, before joining."""
    row = _by_code(db, p, code)
    return InvitationPreviewOut(invitation=_invitation_out(row),
                                already_member=any(c.id == row.organization_id for c in _companies(db, p.user_id)))


def _join(db: Session, p: Principal, row) -> MyCompany:
    if any(c.id == row.organization_id for c in _companies(db, p.user_id)):
        raise Conflict("You’re already in this company", code="ALREADY_MEMBER")
    _check_room(db, p.user_id)
    dst = new_session(org_id=row.organization_id, user_id=p.user_id)
    try:
        invitation = dst.get(Invitation, row.invitation_id)
        if invitation is None or invitation.accepted_at or invitation.revoked_at or invitation.declined_at \
                or invitation.expires_at <= datetime.now(UTC):
            raise Conflict("This invitation can no longer be used. Ask for a new one.", code="INVITATION_CLOSED")
        membership = dst.scalar(select(Membership).where(Membership.user_id == p.user_id))
        if membership is None:
            dst.add(Membership(organization_id=row.organization_id, user_id=p.user_id, role=invitation.role,
                               last_opened_at=datetime.now(UTC)))
        else:
            membership.active, membership.role, membership.last_opened_at = True, invitation.role, datetime.now(UTC)
        invitation.accepted_at, invitation.accepted_user_id = datetime.now(UTC), p.user_id
        dst.add(AuditLog(organization_id=row.organization_id, actor_user_id=p.user_id, action="invitation.accepted",
                         entity_type="invitation", entity_id=invitation.id,
                         data={"email": invitation.email, "role": invitation.role,
                               "text": f"joined as {_label(row.role, row.role_name)}"}))
        dst.commit()
    finally:
        dst.close()
    return _mine(db, p.user_id, row.organization_id)


class InvitationCodeIn(BaseModel):
    code: str = Field(min_length=8, max_length=20)


@router.post("/invitations/join", response_model=MyCompany)
def join_with_code(body: InvitationCodeIn, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Join a company with the 8-character code from an invitation. You get the role it was sent with."""
    return _join(db, p, _by_code(db, p, body.code))


def _for_me(db: Session, p: Principal, invitation_id: uuid.UUID):
    row = next((r for r in _invitations(db, p.user_id) if r.invitation_id == invitation_id), None)
    if row is None:
        raise NotFound("Invitation not found")
    return row


@router.post("/invitations/{invitation_id}/accept", response_model=MyCompany)
def accept_invitation(invitation_id: uuid.UUID, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Accept an invitation sent to your email: the company is added with the role it names."""
    return _join(db, p, _for_me(db, p, invitation_id))


@router.post("/invitations/{invitation_id}/decline", status_code=204)
def decline_invitation(invitation_id: uuid.UUID, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    row = _for_me(db, p, invitation_id)
    dst = new_session(org_id=row.organization_id, user_id=p.user_id)
    try:
        dst.execute(update(Invitation).where(Invitation.id == invitation_id).values(declined_at=datetime.now(UTC)))
        dst.add(AuditLog(organization_id=row.organization_id, actor_user_id=p.user_id, action="invitation.declined",
                         entity_type="invitation", entity_id=invitation_id, data={"email": row.email}))
        dst.commit()
    finally:
        dst.close()


# ---------------------------------------------------------------- default, archive, restore, leave
@router.post("/companies/{company_id}/default", response_model=MyCompaniesOut)
def make_default(company_id: uuid.UUID, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """The company that opens first when you sign in."""
    company = _mine(db, p.user_id, company_id)
    if company.status != "active":
        raise Conflict("An archived company can’t be your default", code="COMPANY_ARCHIVED")
    db.execute(update(User).where(User.id == p.user_id).values(default_organization_id=company_id))
    db.commit()
    _log(company_id, p.user_id, "user.default_company_set")
    return _overview(db, p)


class Blocker(BaseModel):
    kind: Literal["loads_on_the_road", "open_statements", "last_company"]
    count: int
    message: str


class ArchiveCheckOut(BaseModel):
    blockers: list[Blocker]


def _blockers(db: Session, p: Principal, company: MyCompany) -> list[Blocker]:
    out = []
    if not any(c.status == "active" and c.id != company.id for c in _companies(db, p.user_id)):
        out.append(Blocker(kind="last_company", count=1,
                           message="It’s your only active company: add or join another first"))
    there = new_session(org_id=company.id, user_id=p.user_id)
    try:
        loads = there.scalar(select(func.count()).select_from(Load).where(Load.status.in_(ON_THE_ROAD))) or 0
        statements = (there.scalar(select(func.count()).select_from(DriverSettlement)
                                   .where(DriverSettlement.status.in_(("draft", "approved")))) or 0) + \
                     (there.scalar(select(func.count()).select_from(OwnerSettlement)
                                   .where(OwnerSettlement.status.in_(("draft", "approved")))) or 0)
    finally:
        there.close()
    if loads:
        out.append(Blocker(kind="loads_on_the_road", count=loads,
                           message=f"{loads} {'load is' if loads == 1 else 'loads are'} in transit: deliver or move "
                                   f"{'it' if loads == 1 else 'them'} first"))
    if statements:
        out.append(Blocker(kind="open_statements", count=statements,
                           message=f"{statements} settlement {'statement is' if statements == 1 else 'statements are'} "
                                   "still open: pay or void them first"))
    return out


def _main_admin(db: Session, p: Principal, company_id: uuid.UUID) -> MyCompany:
    company = _mine(db, p.user_id, company_id)
    if not company.is_main_admin:
        raise Forbidden("Only a Main Admin of this company can archive or restore it", code="FORBIDDEN")
    return company


@router.get("/companies/{company_id}/archive-check", response_model=ArchiveCheckOut)
def archive_check(company_id: uuid.UUID, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """What stops this company being archived now, if anything."""
    return ArchiveCheckOut(blockers=_blockers(db, p, _main_admin(db, p, company_id)))


class ArchiveIn(BaseModel):
    confirm_name: str = Field(max_length=160, description="The company's name, typed to confirm")


@router.post("/companies/{company_id}/archive", response_model=MyCompaniesOut)
def archive(company_id: uuid.UUID, body: ArchiveIn, p: Principal = Depends(get_principal),
            db: Session = Depends(get_db)):
    """Make a company read-only. Nothing is deleted; its people can no longer open it; its Main Admins can
    restore it. It still counts toward your ten."""
    company = _main_admin(db, p, company_id)
    if company.status == "archived":
        raise Conflict("This company is already archived", code="COMPANY_ARCHIVED")
    if " ".join(body.confirm_name.split()).lower() != company.name.lower():
        raise Invalid("Type the company’s name exactly to confirm", field="confirm_name")
    blockers = _blockers(db, p, company)
    if blockers:
        raise Conflict(blockers[0].message, code="ARCHIVE_BLOCKED",
                       details={"blockers": [b.model_dump() for b in blockers]})
    there = new_session(org_id=company_id, user_id=p.user_id)
    try:
        there.execute(update(Organization).where(Organization.id == company_id)
                      .values(status="archived", archived_at=datetime.now(UTC)))
        there.add(AuditLog(organization_id=company_id, actor_user_id=p.user_id, action="organization.archived",
                           entity_type="organization", entity_id=company_id, data={"name": company.name}))
        there.commit()
    finally:
        there.close()
    if p.org_id != company_id:
        _log(p.org_id, p.user_id, "organization.archived", {"name": company.name, "company_id": str(company_id)})
    _fall_back_default(db, p.user_id, company_id)
    db.commit()
    return _overview(db, p)


@router.post("/companies/{company_id}/restore", response_model=MyCompaniesOut)
def restore(company_id: uuid.UUID, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    company = _main_admin(db, p, company_id)
    if company.status != "archived":
        raise Conflict("This company isn’t archived", code="COMPANY_ACTIVE")
    there = new_session(org_id=company_id, user_id=p.user_id)
    try:
        there.execute(update(Organization).where(Organization.id == company_id).values(status="active", archived_at=None))
        there.add(AuditLog(organization_id=company_id, actor_user_id=p.user_id, action="organization.restored",
                           entity_type="organization", entity_id=company_id, data={"name": company.name}))
        there.commit()
    finally:
        there.close()
    return _overview(db, p)


@router.post("/companies/{company_id}/leave", response_model=MyCompaniesOut)
def leave(company_id: uuid.UUID, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Stop being a member. Your saved views and notification settings there are removed; what you did there
    stays in its records and audit log."""
    company = _mine(db, p.user_id, company_id)
    if company.sole_main_admin:
        raise Conflict("You’re its only Main Admin. Make someone else Main Admin first, or archive the company.",
                       code="SOLE_MAIN_ADMIN")
    if not any(c.id != company_id for c in _companies(db, p.user_id)):
        raise Conflict("It’s your only company. Add or join another first.", code="LAST_COMPANY")
    there = new_session(org_id=company_id, user_id=p.user_id)
    try:
        there.execute(delete(UserPreference).where(UserPreference.user_id == p.user_id))
        there.execute(delete(SavedView).where(SavedView.owner_user_id == p.user_id, SavedView.shared.is_(False)))
        there.execute(update(Membership).where(Membership.user_id == p.user_id).values(active=False))
        there.add(AuditLog(organization_id=company_id, actor_user_id=p.user_id, action="member.left",
                           entity_type="user", entity_id=p.user_id, data={"role": company.role}))
        there.commit()
    finally:
        there.close()
    _fall_back_default(db, p.user_id, company_id)
    db.commit()
    return _overview(db, p)

