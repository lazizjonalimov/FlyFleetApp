import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, ValidationInfo, field_validator

from app.core.crud import ListParams
from app.core.money import Money as MoneyOut

EquipmentType = Literal["dry_van", "reefer", "flatbed", "step_deck", "box_truck", "tanker", "other"]
LoadStatus = Literal["draft", "planned", "assigned", "dispatched", "at_pickup", "in_transit", "at_delivery",
                     "delivered", "pod_review", "completed", "on_hold", "cancelled"]
BillingStatus = Literal["unbilled", "invoiced", "paid"]
ChargeType = Literal["detention", "layover", "lumper", "fuel_surcharge", "tarp", "extra_stop", "tonu", "driver_assist",
                     "other"]
ChargeStatus = Literal["pending", "approved", "rejected"]
StopType = Literal["pickup", "delivery", "fuel_scale"]
Handling = Literal["live", "drop", "hook"]
Percent = Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=2)]
Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
# Views the dispatch board and the load list offer as one-click filters.
LoadView = Literal["active", "unassigned", "pickups_today", "deliveries_today", "at_risk", "in_transit",
                   "missing_pod", "ready_to_invoice", "unassigned_soon", "deliveries", "late_or_at_risk"]
Action = Literal["mark_ready", "dispatch", "arrive", "depart", "approve_pod", "reject_pod", "hold", "release",
                 "cancel"]


# ---------------------------------------------------------------- stops, items, charges
class StopFields(BaseModel):
    name: str | None = Field(default=None, max_length=160)
    address: str | None = Field(default=None, max_length=300)
    city: str = Field(min_length=1, max_length=80)
    state: str | None = Field(default=None, max_length=40)
    postal_code: str | None = Field(default=None, max_length=20)
    contact_name: str | None = Field(default=None, max_length=120)
    contact_phone: str | None = Field(default=None, max_length=40)
    reference: str | None = Field(default=None, max_length=80)
    instructions: str | None = Field(default=None, max_length=1000)
    appt_start: AwareDatetime | None = None
    appt_end: AwareDatetime | None = None
    handling: Handling = "live"

    @field_validator("appt_end")
    @classmethod
    def _window(cls, end: datetime | None, info: ValidationInfo) -> datetime | None:
        start = info.data.get("appt_start")
        if end and start and end < start:
            raise ValueError("The appointment can't end before it starts")
        return end


class StopIn(StopFields):
    type: StopType


class StopPatch(BaseModel):
    """What can still change on a stop once the truck is rolling: the schedule and who to ask for."""
    version: int
    name: str | None = Field(default=None, max_length=160)
    contact_name: str | None = Field(default=None, max_length=120)
    contact_phone: str | None = Field(default=None, max_length=40)
    reference: str | None = Field(default=None, max_length=80)
    instructions: str | None = Field(default=None, max_length=1000)
    appt_start: AwareDatetime | None = None
    appt_end: AwareDatetime | None = None
    handling: Handling | None = None


class StopOut(StopIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    seq: int
    arrived_at: datetime | None
    departed_at: datetime | None
    dwell_minutes: int | None = Field(default=None, description="Time at the stop: until departure, or until now")


class StopsReplace(BaseModel):
    version: int
    stops: list[StopIn] = Field(max_length=20)


class ItemIn(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    quantity: int | None = Field(default=None, ge=0, le=1_000_000)
    unit: str | None = Field(default=None, max_length=30)
    weight_lbs: int | None = Field(default=None, ge=0, le=1_000_000)


class ItemPatch(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=200)
    quantity: int | None = Field(default=None, ge=0, le=1_000_000)
    unit: str | None = Field(default=None, max_length=30)
    weight_lbs: int | None = Field(default=None, ge=0, le=1_000_000)


class ItemOut(ItemIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class ChargeIn(BaseModel):
    type: ChargeType
    description: str | None = Field(default=None, max_length=200)
    quantity: Decimal = Field(default=Decimal("1"), gt=0, max_digits=10, decimal_places=2)
    rate: Decimal = Field(max_digits=12, decimal_places=2, description="Per unit. Negative for a deduction")
    billable: bool = Field(default=True, description="Bill it to the customer")
    driver_payable: bool = False
    status: ChargeStatus = Field(default="approved", description="A charge added after booking waits for approval")


class ChargePatch(BaseModel):
    type: ChargeType | None = None
    description: str | None = Field(default=None, max_length=200)
    quantity: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    rate: Decimal | None = Field(default=None, max_digits=12, decimal_places=2)
    billable: bool | None = None
    driver_payable: bool | None = None
    status: ChargeStatus | None = None


class ChargeOut(ChargeIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    managed: bool = Field(default=False, description="The fuel surcharge line FlyFleet keeps in step with the rate")
    quantity: MoneyOut  # always two decimal places, however it was sent
    rate: MoneyOut
    amount: MoneyOut


# ---------------------------------------------------------------- load
class LoadFields(BaseModel):
    terminal_id: uuid.UUID | None = None
    reference: str | None = Field(default=None, max_length=80)
    bol_number: str | None = Field(default=None, max_length=80)
    commodity: str | None = Field(default=None, max_length=200)
    equipment_type: EquipmentType = "dry_van"
    weight_lbs: int | None = Field(default=None, ge=0, le=1_000_000)
    miles: int | None = Field(default=None, ge=0, le=50_000)
    instructions: str | None = Field(default=None, max_length=4000)
    customer_rate: Money = Decimal("0")
    pickup_number: str | None = Field(default=None, max_length=80)
    delivery_number: str | None = Field(default=None, max_length=80)
    seal_number: str | None = Field(default=None, max_length=80)
    fuel_surcharge_pct: Percent = Field(default=Decimal("0"), description="Added to the line haul as a fuel line. "
                                        "The New load screen starts at 12; left out here, none")
    detention_free_hours: Annotated[Decimal, Field(ge=0, le=48, max_digits=4, decimal_places=2)] = Decimal("2")
    detention_rate: Annotated[Decimal, Field(ge=0, le=10000, max_digits=8, decimal_places=2)] = Decimal("75")
    reefer_set_point_f: Annotated[Decimal, Field(ge=-40, le=90, max_digits=5, decimal_places=1)] | None = None


class Recurrence(BaseModel):
    days: list[Annotated[int, Field(ge=0, le=6)]] = Field(min_length=1, max_length=7, description="0 is Monday")
    until: date | None = Field(default=None, description="Left out: no end")


class LoadCreate(LoadFields):
    customer_id: uuid.UUID
    # draft: saved to finish later, nothing is checked beyond the fields themselves.
    # planned: ready to be assigned, so it needs a complete route.
    status: Literal["draft", "planned"] = "planned"
    stops: list[StopIn] = Field(default_factory=list, max_length=20)
    items: list[ItemIn] = Field(default_factory=list, max_length=50)
    charges: list[ChargeIn] = Field(default_factory=list, max_length=30)
    recurrence: Recurrence | None = None


class LoadUpdate(BaseModel):
    version: int = Field(description="The version you last saw. A stale one is rejected with VERSION_CONFLICT")
    customer_id: uuid.UUID | None = None
    terminal_id: uuid.UUID | None = None
    reference: str | None = Field(default=None, max_length=80)
    bol_number: str | None = Field(default=None, max_length=80)
    commodity: str | None = Field(default=None, max_length=200)
    equipment_type: EquipmentType | None = None
    weight_lbs: int | None = Field(default=None, ge=0, le=1_000_000)
    miles: int | None = Field(default=None, ge=0, le=50_000)
    instructions: str | None = Field(default=None, max_length=4000)
    customer_rate: Money | None = None
    pickup_number: str | None = Field(default=None, max_length=80)
    delivery_number: str | None = Field(default=None, max_length=80)
    seal_number: str | None = Field(default=None, max_length=80)
    fuel_surcharge_pct: Percent | None = None
    detention_free_hours: Annotated[Decimal, Field(ge=0, le=48, max_digits=4, decimal_places=2)] | None = None
    detention_rate: Annotated[Decimal, Field(ge=0, le=10000, max_digits=8, decimal_places=2)] | None = None
    reefer_set_point_f: Annotated[Decimal, Field(ge=-40, le=90, max_digits=5, decimal_places=1)] | None = None
    checkcall_reminder_hours: Literal[2, 4, 6] | None = None
    recurrence: Recurrence | None = None


class TransitionIn(BaseModel):
    action: Action
    version: int
    reason: str | None = Field(default=None, max_length=500)
    stop_id: uuid.UUID | None = Field(default=None, description="For arrive/depart: the stop you mean")
    occurred_at: AwareDatetime | None = Field(default=None, description="When it happened, if recorded later")


class NoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class TrackingIn(BaseModel):
    kind: Literal["check_call", "exception"] = "check_call"
    occurred_at: AwareDatetime | None = None
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=40)
    note: str | None = Field(default=None, max_length=500)
    via: Literal["phone", "driver_app", "text", "eld", "email"] | None = None
    eta: AwareDatetime | None = None


# ---------------------------------------------------------------- responses
class Ref(BaseModel):
    id: uuid.UUID
    name: str


class LoadRef(BaseModel):
    id: uuid.UUID
    load_number: str
    status: str


class AssignmentBrief(BaseModel):
    id: uuid.UUID
    status: str
    driver: Ref
    vehicle: Ref
    trailer: Ref | None


class AssignmentOut(AssignmentBrief):
    assigned_at: datetime
    assigned_by_name: str | None
    released_at: datetime | None
    release_reason: str | None


class Risk(BaseModel):
    code: str
    message: str
    label: str = Field(default="", description="Short: Running late, No driver, POD missing")
    reason: str = Field(default="", description="In plain words: “ETA +1h 40m, traffic stopped on I-35 at Ardmore”")


class LoadPapers(BaseModel):
    """The three papers every load needs, and whether each is in: the rate confirmation, the bill of lading and the
    proof of delivery. A POD sent back for a new one doesn't count."""
    rate_confirmation: bool = False
    bol: bool = False
    pod: bool = False


class LoadListItem(BaseModel):
    id: uuid.UUID
    load_number: str
    status: LoadStatus
    billing_status: BillingStatus
    version: int
    customer: Ref
    terminal_id: uuid.UUID | None
    reference: str | None
    bol_number: str | None = None
    pickup_number: str | None = None
    delivery_number: str | None = None
    equipment_type: str
    origin_city: str | None
    origin_state: str | None
    destination_city: str | None
    destination_state: str | None
    pickup_at: datetime | None
    delivery_at: datetime | None
    delivered_at: datetime | None
    miles: int | None
    weight_lbs: int | None
    # Hidden (null) from roles that may not see rates.
    revenue: MoneyOut | None
    margin: MoneyOut | None = Field(default=None, description="Estimated, after driver pay, fuel and overhead. Finance only")
    margin_pct: int | None = None
    currency: str
    assignment: AssignmentBrief | None
    risks: list[Risk]
    papers: LoadPapers
    # At the last delivery, for a load on the road whose truck has reported in the last two hours.
    eta: datetime | None = None
    late_by_minutes: int = 0
    hold_reason: str | None = Field(default=None, description="Why an on-hold load is held, as whoever held it said")
    created_at: datetime
    updated_at: datetime


class NoteOut(BaseModel):
    id: uuid.UUID
    body: str
    author_name: str | None
    created_at: datetime


class StatusEventOut(BaseModel):
    id: uuid.UUID
    action: str
    from_status: str | None
    to_status: str
    actor_name: str | None
    note: str | None
    created_at: datetime
    source: Literal["web", "driver app", "system"] = Field(
        default="web", description="Where it was done: the console, the driver app, or FlyFleet itself")


class LoadPosition(BaseModel):
    """Where the load's truck last reported from, how fresh that is, and how far it has to go."""
    freshness: Literal["live", "delayed", "stale", "none"]
    recorded_at: datetime | None
    source: str | None
    accuracy_m: int | None
    speed_mph: float | None
    lat: float | None
    lon: float | None
    place: str | None
    # To the last delivery: the straight line from the last position, stretched to road miles.
    remaining_miles: int | None


class TrackingOut(BaseModel):
    id: uuid.UUID
    kind: str
    occurred_at: datetime
    city: str | None
    state: str | None
    note: str | None
    source: str
    actor_name: str | None
    via: str | None = None
    eta: datetime | None = None


class InvoiceRef(BaseModel):
    id: uuid.UUID
    invoice_number: str | None
    status: str


class Editable(BaseModel):
    """What the caller may change right now, given the load's state and their role."""
    details: bool
    customer: bool
    stops: bool
    schedule: bool
    rates: bool


class DetentionLine(BaseModel):
    stop: str
    dwell_minutes: int
    billable_minutes: int
    amount: MoneyOut
    explain: str


class MoneyBreakdown(BaseModel):
    """What the load earns and an estimate of what it costs. Only for roles that may see rates."""
    line_haul: MoneyOut
    fuel_pct: Decimal
    fuel: MoneyOut
    detention: MoneyOut
    detention_lines: list[DetentionLine]
    detention_free_hours: Decimal
    detention_rate: MoneyOut
    charges: MoneyOut
    pending_charges: int
    total: MoneyOut
    miles: int
    rate_per_mile: MoneyOut | None
    driver_pay: MoneyOut
    fuel_cost: MoneyOut
    overhead: MoneyOut
    margin: MoneyOut
    margin_pct: int | None
    warning: bool
    costs: dict[str, Decimal] = Field(description="The company's cost rates the estimate used")


class LoadChecklistItem(BaseModel):
    key: str
    label: str
    done: bool
    action: str
    detail: str


class TrackingLinkOut(BaseModel):
    enabled: bool
    url_path: str = Field(description="Path on this site: /track/{token}")
    show_eta: bool
    show_location: bool
    show_pod: bool
    show_driver: bool
    sent_at: datetime | None
    sent_to: str | None
    expires_at: datetime | None
    contact_email: str | None = Field(description="Who it would be sent to: the customer's contact")


class ActivityOut(BaseModel):
    id: uuid.UUID
    kind: str
    text: str
    tone: str
    actor_name: str | None
    at: datetime


class ReeferPoint(BaseModel):
    at: datetime
    temp_f: float


class ReeferOut(BaseModel):
    set_point_f: float | None
    low_f: float | None
    high_f: float | None
    current_f: float | None
    state: Literal["in_range", "drifting", "out_of_range", "no_data"]
    text: str
    readings: list[ReeferPoint]


class CheckCallState(BaseModel):
    reminder_hours: int | None
    last_at: datetime | None
    minutes_since: int | None
    overdue: bool
    text: str


class RecurrenceOut(BaseModel):
    days: list[int]
    until: date | None
    parent_id: uuid.UUID | None
    next_dates: list[date]


class LoadDetail(LoadListItem):
    bol_number: str | None
    commodity: str | None
    instructions: str | None
    customer_rate: MoneyOut | None
    charges_total: MoneyOut | None
    held_from_status: str | None
    invoice: InvoiceRef | None
    stops: list[StopOut]
    items: list[ItemOut]
    charges: list[ChargeOut]
    notes: list[NoteOut]
    events: list[StatusEventOut]
    tracking: list[TrackingOut]
    assignments: list[AssignmentOut]
    allowed_actions: list[str]
    editable: Editable
    position: LoadPosition | None = Field(default=None, description="The assigned truck's latest position, while "
                                                                    "it is the one hauling the load")
    pod_requested_at: list[datetime] = Field(default_factory=list,
                                             description="When the driver was asked for the proof of delivery")
    seal_number: str | None = None
    fuel_surcharge_pct: Decimal | None = Field(default=None, description="Finance only")
    detention_free_hours: Decimal | None = None
    detention_rate: MoneyOut | None = Field(default=None, description="Finance only")
    money: MoneyBreakdown | None = Field(default=None, description="Finance only")
    checklist: list[LoadChecklistItem] = Field(default_factory=list)
    ready_to_invoice: bool = False
    tracking_link: TrackingLinkOut | None = None
    check_calls: CheckCallState | None = None
    reefer: ReeferOut | None = None
    recurrence: RecurrenceOut | None = None
    activity: list[ActivityOut] = Field(default_factory=list)


class LoadListParams(ListParams):
    status: list[LoadStatus] | None = None
    customer_ids: list[uuid.UUID] | None = None
    driver_ids: list[uuid.UUID] | None = None
    equipment_types: list[EquipmentType] | None = None
    risks: list[Literal["at_risk", "unassigned", "missing_pod"]] | None = None
    billing_status: BillingStatus | None = None
    view: LoadView | None = None
    customer_id: uuid.UUID | None = None
    terminal_id: uuid.UUID | None = None
    driver_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    trailer_id: uuid.UUID | None = None
    equipment_type: EquipmentType | None = None
    # Calendar dates in the company's time zone, both inclusive.
    pickup_from: date | None = None
    pickup_to: date | None = None
    delivery_from: date | None = None
    delivery_to: date | None = None
    origin_state: str | None = Field(default=None, max_length=40)
    destination_state: str | None = Field(default=None, max_length=40)


class BoardSummary(BaseModel):
    """Counts behind the dispatch board's summary strip. Each matches the view of the same name."""
    active: int
    unassigned: int
    pickups_today: int
    deliveries_today: int
    at_risk: int
    in_transit: int
    missing_pod: int
    on_hold: int


class FacetValue(BaseModel):
    value: str
    label: str
    count: int


class LoadFacets(BaseModel):
    """How many loads each filter value would show, given the other filters."""
    status: list[FacetValue]
    customer: list[FacetValue]
    equipment: list[FacetValue]
    driver: list[FacetValue]
    risk: list[FacetValue]


class BoardMoveIn(BaseModel):
    version: int
    column: Literal["unassigned", "assigned", "in_transit", "delivered", "completed"]


class TrackingLinkIn(BaseModel):
    enabled: bool | None = None
    show_eta: bool | None = None
    show_location: bool | None = None
    show_pod: bool | None = None
    show_driver: bool | None = None


class TrackingSendIn(BaseModel):
    to: str | None = Field(default=None, max_length=254, description="Left out: the customer's contact")
    message: str = Field(min_length=1, max_length=2000)


class PublicStop(BaseModel):
    type: str
    city: str
    state: str | None
    appointment: datetime | None
    arrived_at: datetime | None
    departed_at: datetime | None


class PublicTracking(BaseModel):
    """What a customer sees on the tracking link: only what the carrier chose to show."""
    company: str
    load_number: str
    reference: str | None
    status: str
    status_label: str
    stops: list[PublicStop]
    eta: datetime | None = None
    position: dict | None = None
    driver_name: str | None = None
    driver_phone: str | None = None
    pod_available: bool = False
    updated_at: datetime
    timezone: str


class ReeferSample(BaseModel):
    trailer_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    recorded_at: AwareDatetime
    temp_f: float = Field(ge=-60, le=150)


class ReeferIn(BaseModel):
    samples: list[ReeferSample] = Field(min_length=1, max_length=1000)
