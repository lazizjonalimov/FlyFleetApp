import uuid
from datetime import datetime
from typing import Annotated, Any, Literal
from zoneinfo import available_timezones

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.core.crud import ListParams


def _valid_timezone(value: str) -> str:
    if value not in available_timezones():
        raise ValueError("Unknown time zone. Use an IANA name such as America/Chicago")
    return value


TimeZone = Annotated[str, Field(max_length=64), AfterValidator(_valid_timezone)]
Password = Annotated[str, Field(min_length=10, max_length=200)]
Short = Annotated[str | None, Field(max_length=40)]


# ---------------------------------------------------------------- sign-in and session
class SignupIn(BaseModel):
    organization_name: str = Field(min_length=2, max_length=160)
    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: Password
    dot_number: str | None = Field(default=None, max_length=20)
    mc_number: str | None = Field(default=None, max_length=20)
    timezone: TimeZone = Field(default="UTC", description="IANA time zone the company operates in")


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)
    organization_id: uuid.UUID | None = None
    # The second step, when two-step verification is on: a code from the authenticator app or a backup code.
    code: str | None = Field(default=None, max_length=20)
    remember: bool = Field(default=False, description="Remember this device, so it isn't asked for a while")


class SwitchIn(BaseModel):
    organization_id: uuid.UUID | None = Field(default=None, description="The company to remember as the last one worked in")
    scope: Literal["company", "all"] = Field(default="company", description="`all` remembers working in all companies")


class PasswordChangeIn(BaseModel):
    current_password: str = Field(max_length=200)
    # The rules (length, case, a number, not the current one) are checked by the endpoint, with messages to act on.
    new_password: str = Field(max_length=200)


def role_label_of(role: str | None) -> str:
    """A built-in role's name as people read it; a company's own role by its key until the company is open."""
    from app.core.permissions import ROLE_LABELS, Role
    try:
        return ROLE_LABELS[Role(role)][0]
    except (ValueError, KeyError):
        return (role or "").replace("_", " ").capitalize()


class OrgRef(BaseModel):
    """A company the user can work in."""
    id: uuid.UUID
    name: str
    slug: str
    role: str
    role_label: str
    status: str
    code: str = Field(description="The company's short code, shown beside its numbers where companies mix")
    color: str = Field(description="The colour of the company's mark")
    mc_number: str | None = None
    logo_url: str | None = Field(default=None, description="The company's logo, shown instead of its coloured initials")

    @model_validator(mode="before")
    @classmethod
    def _label(cls, data):
        if isinstance(data, dict) and not data.get("role_label"):
            data = {**data, "role_label": role_label_of(data.get("role"))}
        return data


class SessionOut(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    organization: OrgRef | None = None
    # Set instead of a token when the user belongs to several companies and has not chosen one.
    requires_organization_selection: bool = False
    organizations: list[OrgRef] = []
    last_organization_id: uuid.UUID | None = Field(default=None, description="The company worked in last, offered first")
    last_scope: Literal["company", "all"] = "company"
    # Set instead of a token when the password was right and the second step is needed.
    requires_second_step: bool = False
    # Proof that this browser passed the second step; the web app keeps it in an httpOnly cookie.
    trusted_device: str | None = None


class MeUser(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    phone: str | None = None
    timezone: str | None = Field(default=None, description="Your own time zone; empty means the company's")
    photo_url: str | None = Field(default=None, description="Your profile photo, when you have one")


class ProfileIn(BaseModel):
    """Your own profile. Only the fields sent change; an empty phone or time zone clears it."""
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    timezone: TimeZone | Literal[""] | None = None


class SessionInfo(BaseModel):
    """One device you are signed in on."""
    id: uuid.UUID
    created_at: datetime
    last_seen_at: datetime
    user_agent: str | None
    ip_address: str | None
    current: bool = Field(description="The session this request was made from")


class MeOrganization(OrgRef):
    timezone: str
    base_currency: str
    role_label: str = Field(description="The role's name as the company sees it, a custom role's included")


class MeAccount(BaseModel):
    id: uuid.UUID
    name: str
    is_owner: bool
    max_companies: int


class MeScope(BaseModel):
    """The part of the fleet this person sees, when it isn't all of it."""
    team_id: uuid.UUID | None = Field(description="None for a dispatcher on no team who sees no trucks")
    team_name: str | None
    trucks: int
    preview: bool = Field(description="An administrator previewing what the team's dispatchers see")
    lead_name: str | None = None


class MeOut(BaseModel):
    user: MeUser
    organization: MeOrganization
    account: MeAccount
    memberships: list[OrgRef]
    all_companies: bool = Field(default=False, description="Whether the person may work in all companies at once: "
                                                          "two or more they can open")
    last_scope: Literal["company", "all"] = "company"
    permissions: list[str]
    scope: MeScope | None = None


# ---------------------------------------------------------------- companies under one account
CopyPart = Literal["team", "terminals", "customers", "drivers", "vehicles", "trailers"]


class CompanyOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    status: str
    dot_number: str | None
    mc_number: str | None
    created_at: datetime
    code: str
    color: str


class CompaniesOut(BaseModel):
    account_id: uuid.UUID
    account_name: str
    max_companies: int
    active_count: int
    companies: list[CompanyOut]


class CompanyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    legal_name: str | None = Field(default=None, max_length=200)
    dot_number: str | None = Field(default=None, max_length=20)
    mc_number: str | None = Field(default=None, max_length=20)
    timezone: TimeZone | None = Field(default=None, description="Defaults to the current company's time zone")
    copy_from: uuid.UUID | None = Field(default=None, description="Another company in this account to copy from")
    include: list[CopyPart] = Field(default_factory=list, description="What to copy from it")


class CompanyCreated(CompanyOut):
    copied: dict[str, int] = {}


# ---------------------------------------------------------------- company settings
class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    legal_name: str | None
    slug: str
    code: str
    color: str
    status: str
    dot_number: str | None
    mc_number: str | None
    phone: str | None
    email: str | None
    address: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    timezone: str
    base_currency: str
    default_payment_terms_days: int
    load_number_prefix: str
    invoice_number_prefix: str


class OrganizationPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    legal_name: str | None = Field(default=None, max_length=200)
    dot_number: str | None = Field(default=None, max_length=20)
    mc_number: str | None = Field(default=None, max_length=20)
    code: str | None = Field(default=None, min_length=2, max_length=6, pattern=r"^[A-Za-z0-9]+$",
                             description="Short code shown beside the company's numbers; unique in the account")
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$", description="Colour of the company's mark")
    phone: Short = None
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=80)
    state: Short = None
    postal_code: str | None = Field(default=None, max_length=20)
    timezone: TimeZone | None = None
    default_payment_terms_days: int | None = Field(default=None, ge=0, le=365)
    load_number_prefix: str | None = Field(default=None, min_length=1, max_length=10, pattern=r"^[A-Za-z0-9]+$")
    invoice_number_prefix: str | None = Field(default=None, min_length=1, max_length=10, pattern=r"^[A-Za-z0-9]+$")


# ---------------------------------------------------------------- team
RoleKey = Annotated[str, Field(min_length=2, max_length=40, pattern=r"^[a-z][a-z0-9_]{1,39}$",
                               description="A role key: one of FlyFleet's roles, or one of the company's custom roles")]


class MemberCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=120)
    # Needed for a new sign-in. Ignored when the person already has one: they keep their own password.
    password: Password | None = None
    role: RoleKey


class MemberPatch(BaseModel):
    role: RoleKey | None = None
    active: bool | None = None


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    full_name: str
    role: str
    active: bool


# ---------------------------------------------------------------- terminals
class TerminalBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=80)
    state: Short = None
    postal_code: str | None = Field(default=None, max_length=20)
    phone: Short = None


class TerminalCreate(TerminalBase):
    pass


class TerminalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    code: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=80)
    state: Short = None
    postal_code: str | None = Field(default=None, max_length=20)
    phone: Short = None


class TerminalRead(TerminalBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    status: str
    created_at: datetime


class TerminalListParams(ListParams):
    status: Literal["active", "archived"] | None = None


# ---------------------------------------------------------------- preferences, saved views, audit
class PreferenceIn(BaseModel):
    value: Any


class SavedViewCreate(BaseModel):
    resource: str = Field(min_length=1, max_length=40, pattern=r"^[a-z_]+$")
    name: str = Field(min_length=1, max_length=80)
    params: dict[str, Any]
    shared: bool = False


class SavedViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    resource: str
    name: str
    params: dict[str, Any]
    shared: bool
    owner_user_id: uuid.UUID
    created_at: datetime


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    actor_user_id: uuid.UUID | None
    actor_name: str | None = None
    actor_role: str | None = Field(default=None, description="The actor's role in the company, by name")
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    entity_label: str | None = Field(default=None, description="The record as people know it: a load number, a name")
    source: str = Field(default="Web", description="Web, Driver app or FlyFleet")
    data: dict | None
    request_id: str | None
    created_at: datetime


class AuditListParams(ListParams):
    group: Literal["all", "security", "permissions", "operations", "finance", "support"] = "all"
    format: Literal["json", "csv"] = "json"
    actor_user_id: uuid.UUID | None = None
    action: str | None = Field(default=None, max_length=60)
    entity_type: str | None = Field(default=None, max_length=60)
    entity_id: uuid.UUID | None = None
    since: datetime | None = None
    until: datetime | None = None
