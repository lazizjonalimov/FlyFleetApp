import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.core.crud import ListParams
from app.modules.owners.models import PORTAL_PERMISSIONS, PORTAL_PRESETS

EntityType = Literal["individual", "business"]
BusinessType = Literal["llc", "corporation", "partnership", "sole_proprietor"]
OwnerStatus = Literal["onboarding", "active", "suspended", "ended"]
AgreementKind = Literal["owner_operator_lease", "equipment_lease", "fleet_lease", "rental"]
WhoDrives = Literal["owner", "carrier", "owner_hire"]
Pct = Field(None, ge=0, le=100)
MoneyIn = Field(Decimal("0"), ge=0, max_digits=12, decimal_places=2)
State = Field(None, min_length=2, max_length=2, pattern="^[A-Z]{2}$")


class PersonIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=40)
    tax_id: str | None = Field(None, max_length=20, description="SSN or EIN; stored encrypted")
    date_of_birth: date | None = None
    street: str | None = Field(None, max_length=200)
    city: str | None = Field(None, max_length=80)
    state: str | None = State
    postal_code: str | None = Field(None, max_length=10)


class AgreementIn(BaseModel):
    kind: AgreementKind
    reference: str | None = Field(None, max_length=60)
    signed_on: date | None = None
    effective_from: date | None = Field(None, description="Defaults to the unit's start date")
    effective_to: date | None = None
    owner_pct: Decimal | None = Pct
    fsc_pct: Decimal | None = Pct
    accessorials_to_owner: bool = False
    per_mile: Decimal | None = Field(None, ge=0, max_digits=8, decimal_places=4)
    per_trailer_week: Decimal | None = Field(None, ge=0, max_digits=10, decimal_places=2)
    fuel_paid_by: Literal["owner", "carrier"] = "owner"
    driver_pay_by: Literal["carrier", "owner", "carrier_for_owner", "owner_drives"] = "carrier"
    maintenance_paid_by: Literal["owner", "carrier"] = "owner"
    insurance_weekly: Decimal = MoneyIn
    occupational_weekly: Decimal = MoneyIn
    eld_weekly: Decimal = MoneyIn
    plates_weekly: Decimal = MoneyIn
    document_id: uuid.UUID | None = None
    notes: str | None = Field(None, max_length=2000)

    @model_validator(mode="after")
    def _terms(self):
        if self.kind == "rental":
            if self.per_mile is None and self.per_trailer_week is None:
                raise ValueError("A rental is paid by the mile, by the trailer week, or both")
        elif self.owner_pct is None:
            raise ValueError("Enter the owner's percentage of line haul")
        return self


class AgreementUpdate(BaseModel):
    reference: str | None = Field(None, max_length=60)
    signed_on: date | None = None
    effective_to: date | None = None
    owner_pct: Decimal | None = Pct
    fsc_pct: Decimal | None = Pct
    accessorials_to_owner: bool | None = None
    per_mile: Decimal | None = Field(None, ge=0, max_digits=8, decimal_places=4)
    per_trailer_week: Decimal | None = Field(None, ge=0, max_digits=10, decimal_places=2)
    fuel_paid_by: Literal["owner", "carrier"] | None = None
    driver_pay_by: Literal["carrier", "owner", "carrier_for_owner", "owner_drives"] | None = None
    maintenance_paid_by: Literal["owner", "carrier"] | None = None
    insurance_weekly: Decimal | None = Field(None, ge=0, max_digits=12, decimal_places=2)
    occupational_weekly: Decimal | None = Field(None, ge=0, max_digits=12, decimal_places=2)
    eld_weekly: Decimal | None = Field(None, ge=0, max_digits=12, decimal_places=2)
    plates_weekly: Decimal | None = Field(None, ge=0, max_digits=12, decimal_places=2)
    document_id: uuid.UUID | None = None
    notes: str | None = Field(None, max_length=2000)


class UnitIn(BaseModel):
    """One row of "Equipment and ownership": how much they own, since when, under which agreement, and who
    drives it."""
    vehicle_id: uuid.UUID | None = None
    trailer_id: uuid.UUID | None = None
    share_pct: Decimal = Field(Decimal("100"), gt=0, le=100)
    effective_from: date
    agreement: AgreementIn | None = None
    agreement_id: uuid.UUID | None = None
    who_drives: WhoDrives | None = Field(None, description="Trucks: the owner, a carrier driver, or the owner's hire")
    driver_id: uuid.UUID | None = Field(None, description="Seat the driver now (set in Dispatch otherwise)")

    @model_validator(mode="after")
    def _one_unit(self):
        if (self.vehicle_id is None) == (self.trailer_id is None):
            raise ValueError("Pick a truck or a trailer")
        if self.agreement is None and self.agreement_id is None:
            raise ValueError("Choose the agreement this unit runs under")
        return self


class ContactIn(BaseModel):
    person_id: uuid.UUID | None = None
    person: PersonIn | None = None
    title: str | None = Field(None, max_length=80)
    is_primary: bool = False
    signs: bool = False
    note: str | None = Field(None, max_length=200)

    @model_validator(mode="after")
    def _who(self):
        if (self.person_id is None) == (self.person is None):
            raise ValueError("Link an existing person or enter a new one")
        return self


class PortalUserIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=160)
    password: str | None = Field(None, min_length=10, max_length=200,
                                 description="Temporary password, needed only for a new sign-in")
    person_id: uuid.UUID | None = None


class NotDuplicate(BaseModel):
    person_id: uuid.UUID
    reason: str = Field(min_length=3, max_length=300)


class OwnerFields(BaseModel):
    legal_name: str | None = Field(None, max_length=200)
    business_type: BusinessType | None = None
    ein: str | None = Field(None, max_length=20)
    dba: str | None = Field(None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=40)
    street: str | None = Field(None, max_length=200)
    city: str | None = Field(None, max_length=80)
    state: str | None = State
    postal_code: str | None = Field(None, max_length=10)
    owner_since: date | None = None
    pay_frequency: Literal["weekly", "biweekly"] | None = None
    pay_day: Literal["monday", "tuesday", "wednesday", "thursday", "friday"] | None = None
    payment_method: Literal["ach", "check"] | None = None
    bank_name: str | None = Field(None, max_length=120)
    routing_number: str | None = Field(None, pattern=r"^\d{9}$")
    account_number: str | None = Field(None, pattern=r"^\d{4,17}$")
    ach_authorized: bool | None = None
    escrow_weekly: Decimal | None = Field(None, ge=0, max_digits=10, decimal_places=2)
    escrow_target: Decimal | None = Field(None, ge=0, max_digits=12, decimal_places=2)
    escrow_opening_balance: Decimal | None = Field(None, ge=0, max_digits=12, decimal_places=2)
    portal_enabled: bool | None = None
    portal_permissions: list[str] | None = None
    portal_preset: Literal["full", "monitor", "bookkeeper"] | None = None
    notes: str | None = Field(None, max_length=4000)

    @model_validator(mode="after")
    def _permissions(self):
        if self.portal_permissions is not None:
            unknown = set(self.portal_permissions) - set(PORTAL_PERMISSIONS)
            if unknown:
                raise ValueError(f"Unknown portal permission: {', '.join(sorted(unknown))}")
        return self


class OwnerCreate(OwnerFields):
    entity_type: EntityType
    person_id: uuid.UUID | None = Field(None, description="An individual who is already on file (linked, not copied)")
    person: PersonIn | None = None
    person_updates: PersonIn | None = Field(None, description="Changes to the linked person's details")
    status: OwnerStatus = "onboarding"
    contacts: list[ContactIn] = Field(default_factory=list, max_length=10)
    units: list[UnitIn] = Field(default_factory=list, max_length=200)
    portal_users: list[PortalUserIn] = Field(default_factory=list, max_length=10)
    not_duplicates: list[NotDuplicate] = Field(default_factory=list, max_length=10)


class OwnerUpdate(OwnerFields):
    status: OwnerStatus | None = None
    ended_on: date | None = None
    end_reason: str | None = Field(None, max_length=300)
    person: PersonIn | None = Field(None, description="An individual owner's own details")
    contacts: list[ContactIn] | None = Field(None, max_length=10, description="Replaces the contacts")
    units: list[UnitIn] | None = Field(None, max_length=200, description="Reconciles the units: removed ones end "
                                                                         "today and keep their history")
    effective_on: date | None = Field(None, description="When unit changes take effect (default today)")


class PortalPermissionsIn(BaseModel):
    permissions: list[str] | None = None
    preset: Literal["full", "monitor", "bookkeeper"] | None = None
    enabled: bool | None = None

    @model_validator(mode="after")
    def _one(self):
        if self.permissions is None and self.preset is None and self.enabled is None:
            raise ValueError("Send permissions, a preset or enabled")
        if self.permissions is not None and set(self.permissions) - set(PORTAL_PERMISSIONS):
            raise ValueError("Unknown portal permission")
        return self


class TransferRow(BaseModel):
    owner_id: uuid.UUID | None = Field(None, description="Empty for the carrier itself")
    share_pct: Decimal = Field(gt=0, le=100)
    agreement_id: uuid.UUID | None = None


class TransferIn(BaseModel):
    vehicle_id: uuid.UUID | None = None
    trailer_id: uuid.UUID | None = None
    effective_from: date
    reason: str = Field(min_length=3, max_length=300)
    rows: list[TransferRow] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def _one_unit(self):
        if (self.vehicle_id is None) == (self.trailer_id is None):
            raise ValueError("Pick a truck or a trailer")
        return self


class SeatIn(BaseModel):
    driver_id: uuid.UUID
    co_driver_id: uuid.UUID | None = None
    team_split: Literal["equal", "miles"] = "equal"
    effective_from: date | None = None
    reason: str | None = Field(None, max_length=300)


class OwnerListParams(ListParams):
    tab: Literal["all", "owner_operators", "non_operating", "individuals", "businesses", "onboarding", "ended"] | None = None
    status: OwnerStatus | None = None
    entity_type: EntityType | None = None
    agreement: AgreementKind | None = None
    portal: bool | None = None


# ------------------------------------------------------------------ out
class PersonLite(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    email: str | None
    phone: str | None
    tax_id_last4: str | None
    city: str | None = None
    state: str | None = None
    user_id: uuid.UUID | None = None


class AgreementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    owner_id: uuid.UUID
    kind: str
    reference: str | None
    signed_on: date | None
    effective_from: date
    effective_to: date | None
    owner_pct: Decimal | None
    fsc_pct: Decimal | None
    accessorials_to_owner: bool
    per_mile: Decimal | None
    per_trailer_week: Decimal | None
    fuel_paid_by: str
    driver_pay_by: str
    maintenance_paid_by: str
    insurance_weekly: Decimal
    occupational_weekly: Decimal
    eld_weekly: Decimal
    plates_weekly: Decimal
    document_id: uuid.UUID | None
    notes: str | None
    units: int = 0


class DriverRef(BaseModel):
    id: uuid.UUID
    name: str
    employer: Literal["carrier", "owner", "self"] = "carrier"
    employer_owner_id: uuid.UUID | None = None
    pay_by: str = "carrier"
    status: str | None = None


class UnitOut(BaseModel):
    ownership_id: uuid.UUID
    kind: Literal["truck", "trailer"]
    unit_id: uuid.UUID
    unit_number: str
    year: int | None
    make: str | None
    model: str | None
    vin: str | None
    plate: str | None
    plate_state: str | None
    trailer_type: str | None = None
    status: str
    registration_expiry: date | None = None
    inspection_expiry: date | None = None
    odometer: int | None = None
    share_pct: Decimal
    effective_from: date
    effective_to: date | None
    agreement_id: uuid.UUID | None
    agreement_kind: str | None
    driver: DriverRef | None = None
    co_driver: DriverRef | None = None
    team_split: str | None = None
    who_drives: WhoDrives | None = None
    on_load: str | None = Field(None, description="Load number the unit is on now")
    dispatchable: bool = True
    blocked_reason: str | None = None


class ContactOut(BaseModel):
    id: uuid.UUID
    person: PersonLite
    title: str | None
    is_primary: bool
    signs: bool
    note: str | None
    portal: Literal["active", "invited"] | None = None


class PortalUserOut(BaseModel):
    user_id: uuid.UUID
    full_name: str
    email: str
    active: bool
    signed_in: bool
    last_sign_in_at: datetime | None = None
    invited_at: datetime
    existing_account: bool = Field(False, description="They already had a FlyFleet sign-in and keep their password")


class ChecklistItem(BaseModel):
    key: str
    label: str
    done: bool
    detail: str | None = None


class OwnerRow(BaseModel):
    id: uuid.UUID
    name: str
    entity_type: str
    business_type: str | None
    category: Literal["owner_operator", "non_operating"]
    dba: str | None
    contact_name: str | None
    contact_title: str | None
    phone: str | None
    email: str | None
    city: str | None
    state: str | None
    status: str
    owner_since: date | None
    trucks: int
    trailers: int
    active_loads: int
    agreement_kinds: list[str]
    portal_enabled: bool
    portal_users: int
    employee_role: str | None = None
    created_at: datetime


class OwnerDetail(OwnerRow):
    person: PersonLite | None
    legal_name: str | None
    ein_last4: str | None
    tax_id_last4: str | None
    street: str | None
    postal_code: str | None
    ended_on: date | None
    end_reason: str | None
    pay_frequency: str
    pay_day: str
    payment_method: str
    bank_name: str | None
    account_last4: str | None
    has_routing: bool
    ach_authorized: bool
    escrow_weekly: Decimal
    escrow_target: Decimal
    escrow_balance: Decimal
    portal_permissions: list[str]
    portal_preset: str | None
    notes: str | None
    contacts: list[ContactOut]
    agreements: list[AgreementOut]
    units: list[UnitOut]
    past_units: list[UnitOut]
    portal_users_list: list[PortalUserOut]
    checklist: list[ChecklistItem]
    documents: int


class OwnerSensitive(BaseModel):
    tax_id: str | None
    ein: str | None
    routing_number: str | None
    account_number: str | None
    date_of_birth: str | None


class OwnerSummary(BaseModel):
    total: int
    individuals: int
    businesses: int
    active: int
    onboarding: int
    suspended: int
    ended: int
    owner_operators: int
    non_operating: int
    owned_trucks: int
    owned_trailers: int
    onboarding_trucks: int
    fleet_trucks: int
    fleet_trailers: int
    carrier_trucks: int
    carrier_trailers: int
    tabs: dict[str, int]


class OwnershipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    vehicle_id: uuid.UUID | None
    trailer_id: uuid.UUID | None
    owner_id: uuid.UUID | None
    owner_name: str | None = None
    share_pct: Decimal
    effective_from: date
    effective_to: date | None
    agreement_id: uuid.UUID | None
    agreement_kind: str | None = None
    reason: str | None
    created_at: datetime


class SeatOut(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    driver: DriverRef
    co_driver: DriverRef | None
    team_split: str
    effective_from: date
    effective_to: date | None
    reason: str | None
    created_at: datetime


PRESETS_OUT = {key: {"label": label, "permissions": keys} for key, (label, keys) in PORTAL_PRESETS.items()}


# ------------------------------------------------------------------ the owner record's tabs
from app.core.money import Money  # noqa: E402


class LoadSplitOut(BaseModel):
    load_id: uuid.UUID
    load_number: str
    status: str
    unit_id: uuid.UUID
    unit_number: str
    driver_name: str | None
    customer_name: str | None = Field(None, description="Left out in the owner portal")
    origin: str | None
    destination: str | None
    pickup_at: datetime | None
    delivered_at: datetime | None
    day: date
    miles: int
    revenue: Money
    line_haul: Money
    fuel_surcharge: Money
    accessorials: Money
    owner_gross: Money
    carrier_share: Money
    driver_pay: Money
    agreement_kind: str
    on_time: bool | None


class MonthOut(BaseModel):
    month: date
    revenue: Money
    owner_gross: Money
    net: Money
    by_unit: dict[str, Money]


class UnitFigures(BaseModel):
    unit_id: uuid.UUID
    unit_number: str
    kind: str
    miles: int
    loads: int
    driver_name: str | None
    revenue: Money
    carrier_share: Money
    owner_gross: Money
    fuel: Money
    driver_pay: Money
    other_costs: Money
    owner_costs: Money
    owner_net: Money


class WeekOnTime(BaseModel):
    week_start: date
    on_time: int
    late: int
    judged: int


class OwnerActivity(BaseModel):
    date_from: date
    date_to: date
    units: int
    trucks: int
    trucks_on_loads: int
    loads: int
    active_loads: int
    miles: int
    revenue: Money
    carrier_share: Money
    owner_gross: Money
    rental_gross: Money
    costs: dict[str, Money]
    owner_costs: Money
    net: Money
    load_rows: list[LoadSplitOut]
    months: list[MonthOut]
    by_unit: list[UnitFigures]
    on_time: list[WeekOnTime]


class ExpenseRow(BaseModel):
    id: uuid.UUID
    incurred_on: date
    category: str
    unit_number: str | None
    driver_name: str | None
    vendor: str | None
    jurisdiction: str | None
    gallons: Decimal | None
    amount: Money
    paid_with: str | None
    payer: Literal["owner", "carrier"]
    on_settlement: bool
    settlement_id: uuid.UUID | None = None


class Chargeback(BaseModel):
    label: str
    unit_number: str
    weekly: Money
    agreement_kind: str


class FuelMonth(BaseModel):
    month: date
    owner: Money
    carrier: Money


class OwnerFuel(BaseModel):
    date_from: date
    date_to: date
    fuel: list[ExpenseRow]
    other: list[ExpenseRow]
    chargebacks: list[Chargeback]
    months: list[FuelMonth]
    gallons: Decimal
    fuel_total: Money
    owner_paid: Money
    carrier_paid: Money


class WorkOrderRow(BaseModel):
    id: uuid.UUID
    number: str
    unit_number: str
    title: str
    status: str
    vendor: str | None
    opened_on: date
    completed_on: date | None
    total_cost: Money
    payer: Literal["owner", "carrier"]


class UpcomingItem(BaseModel):
    unit_number: str
    label: str
    due_on: date
    days: int


class OwnerMaintenance(BaseModel):
    work_orders: list[WorkOrderRow]
    upcoming: list[UpcomingItem]


class OwnerDocument(BaseModel):
    id: uuid.UUID
    type: str
    filename: str
    attached_to: str
    attached_kind: Literal["owner", "truck", "trailer"]
    uploaded_at: datetime
    expires_on: date | None
    review_status: str
    in_portal: bool


class LiveUnit(BaseModel):
    unit_id: uuid.UUID
    unit_number: str
    status: str
    load_number: str | None
    lane: str | None
    place: str | None
    seen_at: datetime | None
    driver_name: str | None
