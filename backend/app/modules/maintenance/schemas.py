import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.crud import ListParams
from app.core.money import Money

UnitType = Literal["vehicle", "trailer"]
Priority = Literal["low", "normal", "high", "urgent"]
WorkOrderStatus = Literal["open", "in_progress", "waiting_parts", "completed", "cancelled"]
LineKind = Literal["labor", "part", "other"]
InspectionKind = Literal["pre_trip", "post_trip", "annual", "roadside", "other"]
InspectionResult = Literal["pass", "defects", "out_of_service"]
Severity = Literal["minor", "major", "out_of_service"]


class OneUnit(BaseModel):
    """A truck or a trailer: exactly one of the two (checked by the service, which names the field)."""
    vehicle_id: uuid.UUID | None = None
    trailer_id: uuid.UUID | None = None


class UnitRef(BaseModel):
    type: UnitType
    id: uuid.UUID
    name: str
    status: str


class Ref(BaseModel):
    id: uuid.UUID
    name: str


# ---------------------------------------------------------------- work orders
class CostLineIn(BaseModel):
    kind: LineKind = "part"
    description: str = Field(min_length=1, max_length=200)
    quantity: Decimal = Field(default=Decimal("1"), gt=0, max_digits=10, decimal_places=2)
    unit_cost: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class CostLinePatch(BaseModel):
    kind: LineKind | None = None
    description: str | None = Field(default=None, min_length=1, max_length=200)
    quantity: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    unit_cost: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)


class CostLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    kind: str
    description: str
    quantity: Money  # two decimal places, written the same way as money
    unit_cost: Money
    amount: Money


class WorkOrderCreate(OneUnit):
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    priority: Priority = "normal"
    vendor: str | None = Field(default=None, max_length=160)
    odometer: int | None = Field(default=None, ge=0, le=5_000_000)
    scheduled_for: date | None = None
    out_of_service: bool = Field(default=False, description="Keep the unit off the road until it is returned to service")
    lines: list[CostLineIn] = Field(default_factory=list, max_length=100)


class WorkOrderUpdate(BaseModel):
    version: int
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    priority: Priority | None = None
    vendor: str | None = Field(default=None, max_length=160)
    odometer: int | None = Field(default=None, ge=0, le=5_000_000)
    scheduled_for: date | None = None
    out_of_service: bool | None = None


class WorkOrderTransition(BaseModel):
    action: Literal["start", "wait_parts", "resume", "complete", "cancel"]
    version: int
    notes: str | None = Field(default=None, max_length=4000, description="What was done, or why it was cancelled")
    parts_eta: date | None = Field(default=None, description="Waiting for parts: when they are due in")


class WorkOrderListItem(BaseModel):
    id: uuid.UUID
    number: str
    status: WorkOrderStatus
    priority: Priority
    title: str
    unit: UnitRef
    vendor: str | None
    scheduled_for: date | None
    # The odometer it is due at (planned) or was done at (completed), when known.
    odometer: int | None = None
    out_of_service: bool
    total_cost: Money
    currency: str
    created_at: datetime
    completed_at: datetime | None
    version: int
    started_at: datetime | None = None
    parts_eta: date | None = None
    # Who opened it ("Reported by"), and who signed the unit back into service after it.
    reported_by_name: str | None = None
    returned_at: datetime | None = None
    returned_by_name: str | None = None


class DefectSource(BaseModel):
    inspection_id: uuid.UUID
    inspection_kind: str
    inspected_on: date
    item: str
    severity: str


class WorkOrderDetail(WorkOrderListItem):
    description: str | None
    odometer: int | None
    started_at: datetime | None
    resolution: str | None
    created_by_name: str | None
    completed_by_name: str | None
    lines: list[CostLineOut]
    defects: list[DefectSource]
    allowed_actions: list[str]
    editable: bool


class WorkOrderListParams(ListParams):
    status: WorkOrderStatus | None = None
    open: bool | None = Field(default=None, description="Only work orders not yet completed or cancelled")
    overdue: bool | None = Field(default=None, description="Open work orders scheduled for a day that has passed")
    priority: Priority | None = None
    unit_type: UnitType | None = None
    vehicle_id: uuid.UUID | None = None
    trailer_id: uuid.UUID | None = None


# ---------------------------------------------------------------- inspections
class DefectIn(BaseModel):
    item: str = Field(min_length=1, max_length=120)
    severity: Severity = "minor"
    description: str | None = Field(default=None, max_length=500)
    # Roadside violations: the regulation, what it was against, and its points when the report gives them.
    code: str | None = Field(default=None, max_length=30)
    against: Literal["vehicle", "trailer", "driver"] | None = None
    points: int | None = Field(default=None, ge=0, le=12)


class InspectionCreate(OneUnit):
    driver_id: uuid.UUID | None = None
    kind: InspectionKind
    level: int | None = Field(default=None, ge=1, le=6, description="Roadside: the inspection level, I to VI")
    source: Literal["entered", "scan", "driver_app"] = "entered"
    inspected_on: date
    result: InspectionResult
    odometer: int | None = Field(default=None, ge=0, le=5_000_000)
    location: str | None = Field(default=None, max_length=160)
    inspector: str | None = Field(default=None, max_length=160)
    report_number: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=4000)
    defects: list[DefectIn] = Field(default_factory=list, max_length=50)


class WorkOrderRef(BaseModel):
    id: uuid.UUID
    number: str
    status: str


class DefectOut(BaseModel):
    id: uuid.UUID
    item: str
    severity: str
    description: str | None
    work_order: WorkOrderRef | None
    code: str | None
    against: str | None
    points: int | None
    basic: str | None


class InspectionOut(BaseModel):
    id: uuid.UUID
    unit: UnitRef
    # Every unit on the report: the truck and its trailer for a roadside inspection.
    units: list[UnitRef]
    driver: Ref | None
    level: int | None
    level_label: str | None
    source: str
    status: str
    # Severity points of its violations, and as they count today (times 3, 2 or 1 by the inspection's age).
    points: int
    weighted_points: int
    repairs_due_on: date | None
    certified_at: datetime | None
    certified_by_name: str | None
    dataqs_reference: str | None
    dataqs_filed_at: datetime | None
    allowed_actions: list[str]
    kind: InspectionKind
    inspected_on: date
    result: InspectionResult
    odometer: int | None
    location: str | None
    inspector: str | None
    report_number: str | None
    notes: str | None
    created_by_name: str | None
    created_at: datetime
    defects: list[DefectOut]


class InspectionListParams(ListParams):
    kind: InspectionKind | None = None
    result: InspectionResult | None = None
    status: Literal["needs_review", "reviewed", "repairs_certified", "dataqs_filed"] | None = None
    level: int | None = Field(default=None, ge=1, le=6)
    violations: bool | None = Field(default=None, description="Only inspections that found something")
    unit_type: UnitType | None = None
    vehicle_id: uuid.UUID | None = None
    trailer_id: uuid.UUID | None = None


class ReturnToServiceIn(BaseModel):
    unit_type: UnitType
    unit_id: uuid.UUID
    notes: str | None = Field(default=None, max_length=1000)


class OffRoad(BaseModel):
    unit: str
    since: datetime | None


class MaintenanceSummary(BaseModel):
    open_work_orders: int
    urgent_open: int
    high_open: int = Field(description="Open work orders marked high or urgent")
    overdue: int
    units_out_of_service: int
    # The unit off the road longest, and since when (from the work order that took it off).
    longest_off_road: OffRoad | None
    # Days off the road per repair that kept a unit off it, returned in the last 30 days and the 30 before.
    downtime_days: float | None
    downtime_days_before: float | None
    currency: str
    spend_this_month: Money
    completed_this_month: int


class InspectionAction(BaseModel):
    """review: a person has checked what was recorded. certify: the out-of-service repairs are certified on the
    report. dataqs: a challenge was filed with FMCSA's DataQs, under its request number."""
    action: Literal["review", "certify", "dataqs"]
    reference: str | None = Field(default=None, max_length=40)
    note: str | None = Field(default=None, max_length=500)


class Attention(BaseModel):
    id: uuid.UUID
    report_number: str | None
    out_of_service: list[str]
    violations: int
    points: int
    driver: str | None
    source: str
    repairs_due_on: date | None


class InspectionSummary(BaseModel):
    """Roadside inspections over the 24 months FMCSA counts."""
    roadside: int
    clean: int
    with_violations: int
    vehicle_inspections: int
    vehicle_out_of_service: int
    driver_inspections: int
    driver_out_of_service: int
    national_vehicle_rate: float
    national_driver_rate: float
    needs_review: int
    needs_review_from_app: int
    attention: Attention | None
