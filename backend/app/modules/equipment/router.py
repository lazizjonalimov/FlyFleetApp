import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core import scope as team_scope
from app.core.crud import ListParams, ensure_exists, resource_router
from app.core.deps import Principal
from app.core.errors import Conflict, Invalid
from app.modules.dispatch.eligibility import OtherLoad, current_loads
from app.modules.dispatch.models import DispatchAssignment
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.fleet.models import UnitAssignment
from app.modules.loads.models import Load, TrackingEvent
from app.modules.loads.schemas import EquipmentType
from app.modules.maintenance import service as maintenance
from app.modules.maintenance.models import WorkOrder
from app.modules.organizations.models import Terminal
from app.modules.owners.models import EquipmentOwnership, Owner, OwnerAgreement
from app.modules.owners.service import blocked_units
from app.modules.people.models import Person
from app.modules.safety.rules import Compliance, summarize, unit_issues

UnitStatus = Literal["active", "in_maintenance", "out_of_service", "retired", "transferred"]
LIVE = ("assigned", "dispatched", "at_pickup", "in_transit", "at_delivery")
Ownership = Literal["owned", "leased", "owner_operator"]
State = Field(default=None, min_length=2, max_length=2, pattern=r"^[A-Za-z]{2}$")
Year = Field(default=None, ge=1950, le=2100)


# ---------------------------------------------------------------- schemas
class UnitBase(BaseModel):
    unit_number: str = Field(min_length=1, max_length=40)
    vin: str | None = Field(default=None, max_length=25)
    plate: str | None = Field(default=None, max_length=20)
    plate_state: str | None = State
    make: str | None = Field(default=None, max_length=60)
    year: int | None = Year
    ownership: Ownership = "owned"
    terminal_id: uuid.UUID | None = None
    insurance_expiry: date | None = None
    registration_expiry: date | None = None
    inspection_expiry: date | None = None
    status: UnitStatus = "active"
    notes: str | None = Field(default=None, max_length=4000)


class UnitPatch(BaseModel):
    unit_number: str | None = Field(default=None, min_length=1, max_length=40)
    vin: str | None = Field(default=None, max_length=25)
    plate: str | None = Field(default=None, max_length=20)
    plate_state: str | None = State
    make: str | None = Field(default=None, max_length=60)
    year: int | None = Year
    ownership: Ownership | None = None
    terminal_id: uuid.UUID | None = None
    insurance_expiry: date | None = None
    registration_expiry: date | None = None
    inspection_expiry: date | None = None
    status: UnitStatus | None = None
    notes: str | None = Field(default=None, max_length=4000)


class UnitOwner(BaseModel):
    owner_id: uuid.UUID
    name: str
    share_pct: Decimal
    agreement_kind: str | None
    since: date


class UnitDriver(BaseModel):
    id: uuid.UUID
    name: str


class UnitPlace(BaseModel):
    place: str | None
    seen_at: datetime | None


class NextService(BaseModel):
    id: uuid.UUID
    number: str
    title: str
    status: str
    scheduled_for: date | None
    odometer: int | None


class UnitExtras(BaseModel):
    id: uuid.UUID
    compliance: Compliance
    # "Assigned" and "available" are never stored: a unit is assigned while this is set.
    current_load: OtherLoad | None
    # Outside owners holding a share today; empty when the carrier owns it outright.
    owners: list[UnitOwner] = []
    # Who drives it (trucks): set in Dispatch, separately from ownership.
    driver: UnitDriver | None = None
    co_driver: UnitDriver | None = None
    team_split: str | None = None
    # Where it last reported from, and when.
    location: UnitPlace | None = None
    blocked_reason: str | None = None
    # The next open work order: planned service, or the one it is in the shop for.
    next_service: NextService | None = None
    # Trailers: the truck pulling it on its current load.
    truck: UnitDriver | None = None
    created_at: datetime


class VehicleCreate(UnitBase):
    model: str | None = Field(default=None, max_length=60)
    body: str | None = Field(default=None, max_length=40)
    gvwr: int | None = Field(default=None, gt=0, le=200_000)
    registered_owner: str | None = Field(default=None, max_length=200)
    telematics_device: str | None = Field(default=None, max_length=80)
    engine: str | None = Field(default=None, max_length=80)
    transmission: str | None = Field(default=None, max_length=80)
    fuel_capacity_gal: int | None = Field(default=None, gt=0, le=1000)
    odometer: int | None = Field(default=None, ge=0, le=5_000_000)


class VehicleUpdate(UnitPatch):
    model: str | None = Field(default=None, max_length=60)
    body: str | None = Field(default=None, max_length=40)
    gvwr: int | None = Field(default=None, gt=0, le=200_000)
    registered_owner: str | None = Field(default=None, max_length=200)
    telematics_device: str | None = Field(default=None, max_length=80)
    engine: str | None = Field(default=None, max_length=80)
    transmission: str | None = Field(default=None, max_length=80)
    fuel_capacity_gal: int | None = Field(default=None, gt=0, le=1000)
    odometer: int | None = Field(default=None, ge=0, le=5_000_000)


class VehicleRead(VehicleCreate, UnitExtras):
    pass


class TrailerCreate(UnitBase):
    type: EquipmentType = "dry_van"
    type_other: str | None = Field(default=None, max_length=40)
    model: str | None = Field(default=None, max_length=60)
    tracker: str | None = Field(default=None, max_length=80)
    length_ft: int | None = Field(default=None, ge=1, le=100)


class TrailerUpdate(UnitPatch):
    type: EquipmentType | None = None
    type_other: str | None = Field(default=None, max_length=40)
    model: str | None = Field(default=None, max_length=60)
    tracker: str | None = Field(default=None, max_length=80)
    length_ft: int | None = Field(default=None, ge=1, le=100)


class TrailerRead(TrailerCreate, UnitExtras):
    pass


class UnitListParams(ListParams):
    status: UnitStatus | None = None
    ownership: Ownership | None = None
    terminal_id: uuid.UUID | None = None
    owner_id: uuid.UUID | None = None
    make: str | None = Field(default=None, max_length=60)
    year: int | None = Field(default=None, ge=1950, le=2100)


class VehicleListParams(UnitListParams):
    kind: Literal["on_loads", "available", "owner", "team", "company", "shop"] | None = None


class TrailerListParams(UnitListParams):
    type: EquipmentType | None = None
    kind: Literal["loaded", "yard", "reefer", "owner", "no_tracker", "shop"] | None = None


# ---------------------------------------------------------------- behaviour
def _presenter(kind: Literal["vehicle", "trailer"], schema, create_schema):
    fields = list(create_schema.model_fields)

    def present(db: Session, units: list, p: Principal) -> list:
        ids = [u.id for u in units]
        on_load = current_loads(db, kind, ids)
        today = p.today()
        col = EquipmentOwnership.vehicle_id if kind == "vehicle" else EquipmentOwnership.trailer_id
        owners: dict[uuid.UUID, list[UnitOwner]] = {}
        if ids and p.can("owners.read"):
            rows = db.execute(select(EquipmentOwnership, Owner, OwnerAgreement.kind)
                              .join(Owner, Owner.id == EquipmentOwnership.owner_id)
                              .outerjoin(OwnerAgreement, OwnerAgreement.id == EquipmentOwnership.agreement_id)
                              .where(col.in_(ids), EquipmentOwnership.effective_to.is_(None))).all()
            persons = {x.id: x for x in db.scalars(select(Person).where(Person.id.in_(
                [o.person_id for _, o, _ in rows if o.person_id])))}
            for r, o, agreement_kind in rows:
                person = persons.get(o.person_id)
                name = o.legal_name or (f"{person.first_name} {person.last_name}" if person else "Owner")
                owners.setdefault(getattr(r, col.key), []).append(UnitOwner(
                    owner_id=o.id, name=name, share_pct=r.share_pct, agreement_kind=agreement_kind, since=r.effective_from))
        seats = {}
        if kind == "vehicle" and ids:
            rows = list(db.scalars(select(UnitAssignment).where(UnitAssignment.vehicle_id.in_(ids),
                                                                UnitAssignment.effective_to.is_(None))))
            names = {d.id: f"{d.first_name} {d.last_name}" for d in db.scalars(select(Driver).where(Driver.id.in_(
                [x for r in rows for x in (r.driver_id, r.co_driver_id) if x])))}
            seats = {r.vehicle_id: r for r in rows}
        places = last_places(db, kind, ids)
        blocked = blocked_units(db, ids if kind == "vehicle" else None, ids if kind == "trailer" else None) if ids else {}
        services = next_services(db, kind, ids)
        pulling = trucks_pulling(db, ids) if kind == "trailer" else {}
        out = []
        for u in units:
            seat = seats.get(u.id)
            out.append(schema(
                **{f: getattr(u, f) for f in fields}, id=u.id, created_at=u.created_at,
                compliance=summarize(unit_issues(u, today)), current_load=on_load.get(u.id),
                owners=owners.get(u.id, []),
                driver=UnitDriver(id=seat.driver_id, name=names.get(seat.driver_id, "")) if seat else None,
                co_driver=UnitDriver(id=seat.co_driver_id, name=names.get(seat.co_driver_id, ""))
                if seat and seat.co_driver_id else None,
                team_split=seat.team_split if seat and seat.co_driver_id else None,
                location=places.get(u.id), blocked_reason=blocked.get(u.id), next_service=services.get(u.id),
                truck=pulling.get(u.id)))
        return out
    return present


def next_services(db: Session, kind: Literal["vehicle", "trailer"], ids: list[uuid.UUID]) -> dict[uuid.UUID, NextService]:
    """Each unit's next open work order: the one under way first, then the soonest planned."""
    if not ids:
        return {}
    col = WorkOrder.vehicle_id if kind == "vehicle" else WorkOrder.trailer_id
    rows = db.scalars(select(WorkOrder).where(col.in_(ids), WorkOrder.status.in_(maintenance.OPEN))
                      .order_by(col, (WorkOrder.status == "in_progress").desc(), WorkOrder.scheduled_for.asc().nulls_last(),
                                WorkOrder.created_at))
    out: dict[uuid.UUID, NextService] = {}
    for wo in rows:
        out.setdefault(getattr(wo, col.key), NextService(id=wo.id, number=wo.number, title=wo.title, status=wo.status,
                                                         scheduled_for=wo.scheduled_for, odometer=wo.odometer))
    return out


def trucks_pulling(db: Session, trailer_ids: list[uuid.UUID]) -> dict[uuid.UUID, UnitDriver]:
    """The truck hauling each trailer on its current load."""
    if not trailer_ids:
        return {}
    rows = db.execute(select(DispatchAssignment.trailer_id, Vehicle.id, Vehicle.unit_number)
                      .join(Vehicle, Vehicle.id == DispatchAssignment.vehicle_id)
                      .join(Load, Load.id == DispatchAssignment.load_id)
                      .where(DispatchAssignment.trailer_id.in_(trailer_ids), DispatchAssignment.status == "active",
                             Load.status.in_(LIVE)))
    return {trailer_id: UnitDriver(id=vid, name=number) for trailer_id, vid, number in rows}


def _search_also(kind: Literal["vehicle", "trailer"]):
    """Search also finds a unit by its owner's name, and a truck by who drives it or a trailer by its truck."""
    model = Vehicle if kind == "vehicle" else Trailer
    own = EquipmentOwnership.vehicle_id if kind == "vehicle" else EquipmentOwnership.trailer_id

    def conditions(pattern: str) -> list:
        owners = (select(own).join(Owner, Owner.id == EquipmentOwnership.owner_id)
                  .outerjoin(Person, Person.id == Owner.person_id)
                  .where(EquipmentOwnership.effective_to.is_(None), own.is_not(None),
                         or_(Owner.legal_name.ilike(pattern), Owner.dba.ilike(pattern),
                             (Person.first_name + " " + Person.last_name).ilike(pattern))))
        out = [model.id.in_(owners)]
        if kind == "vehicle":
            name = Driver.first_name + " " + Driver.last_name
            out.append(Vehicle.id.in_(select(UnitAssignment.vehicle_id).join(
                Driver, or_(Driver.id == UnitAssignment.driver_id, Driver.id == UnitAssignment.co_driver_id))
                .where(UnitAssignment.effective_to.is_(None), name.ilike(pattern))))
        else:
            out.append(Trailer.id.in_(select(DispatchAssignment.trailer_id)
                                      .join(Vehicle, Vehicle.id == DispatchAssignment.vehicle_id)
                                      .join(Load, Load.id == DispatchAssignment.load_id)
                                      .where(DispatchAssignment.status == "active", Load.status.in_(LIVE),
                                             Vehicle.unit_number.ilike(pattern))))
        return out
    return conditions


def _owner_name(kind: Literal["vehicle", "trailer"]):
    """Sorts units by their owner's name, the carrier's own last."""
    model = Vehicle if kind == "vehicle" else Trailer
    own = EquipmentOwnership.vehicle_id if kind == "vehicle" else EquipmentOwnership.trailer_id
    name = (select(func.min(func.coalesce(Owner.legal_name, Person.last_name + " " + Person.first_name)))
            .select_from(EquipmentOwnership).join(Owner, Owner.id == EquipmentOwnership.owner_id)
            .outerjoin(Person, Person.id == Owner.person_id)
            .where(own == model.id, EquipmentOwnership.effective_to.is_(None)).correlate(model).scalar_subquery())
    return func.coalesce(name, "~")


def last_places(db: Session, kind: Literal["vehicle", "trailer"], ids: list[uuid.UUID]) -> dict[uuid.UUID, UnitPlace]:
    """Where each unit last reported from: the newest check-in on the load it is on, or last hauled."""
    if not ids:
        return {}
    col = DispatchAssignment.vehicle_id if kind == "vehicle" else DispatchAssignment.trailer_id
    latest = (select(col.label("unit_id"), TrackingEvent.city, TrackingEvent.state, TrackingEvent.occurred_at)
              .join(TrackingEvent, TrackingEvent.load_id == DispatchAssignment.load_id)
              .where(col.in_(ids), DispatchAssignment.status.in_(("active", "completed")))
              .distinct(col).order_by(col, TrackingEvent.occurred_at.desc()))
    return {r.unit_id: UnitPlace(place=", ".join(x for x in (r.city, r.state) if x) or None, seen_at=r.occurred_at)
            for r in db.execute(latest)}


def _unit_filter(kind: Literal["vehicle", "trailer"]):
    model = Vehicle if kind == "vehicle" else Trailer
    col = EquipmentOwnership.vehicle_id if kind == "vehicle" else EquipmentOwnership.trailer_id
    busy_col = DispatchAssignment.vehicle_id if kind == "vehicle" else DispatchAssignment.trailer_id
    busy = (select(busy_col).join(Load, Load.id == DispatchAssignment.load_id)
            .where(DispatchAssignment.status == "active", Load.status.in_(LIVE), busy_col.is_not(None)))
    owned = select(col).where(EquipmentOwnership.effective_to.is_(None), EquipmentOwnership.owner_id.is_not(None),
                              col.is_not(None))

    def apply(db: Session, stmt, params):
        if params.owner_id:
            stmt = stmt.where(model.id.in_(select(col).where(EquipmentOwnership.effective_to.is_(None),
                                                             EquipmentOwnership.owner_id == params.owner_id)))
        k = params.kind
        if k in ("on_loads", "loaded"):
            stmt = stmt.where(model.id.in_(busy))
        elif k in ("yard", "available"):
            stmt = stmt.where(model.id.not_in(busy), model.status == "active")
        elif k == "owner":
            stmt = stmt.where(model.id.in_(owned))
        elif k == "company":
            stmt = stmt.where(model.id.not_in(owned))
        elif k == "team":
            stmt = stmt.where(model.id.in_(select(UnitAssignment.vehicle_id).where(
                UnitAssignment.effective_to.is_(None), UnitAssignment.co_driver_id.is_not(None))))
        elif k == "shop":
            stmt = stmt.where(model.status.in_(("in_maintenance", "out_of_service")))
        elif k == "reefer":
            stmt = stmt.where(Trailer.type == "reefer")
        elif k == "no_tracker":
            stmt = stmt.where(or_(Trailer.tracker.is_(None), Trailer.tracker == ""))
        return stmt
    return apply


def _guards(kind: Literal["vehicle", "trailer"], what: str):
    def before_save(db: Session, p: Principal, data: dict, unit) -> None:
        if unit is not None and unit.status == "transferred":
            raise Conflict(f"{what} {unit.unit_number} moved to another company and is kept here to read only.",
                           code="UNIT_TRANSFERRED")
        if data.get("status") == "transferred":
            raise Invalid("A unit becomes transferred only by moving it to another company", field="status")
        for required in ("unit_number", "ownership", "status", "type"):
            if required in data and data[required] is None:
                raise Invalid("This field can't be empty", field=required)
        if data.get("plate_state"):
            data["plate_state"] = data["plate_state"].upper()
        ensure_exists(db, Terminal, data.get("terminal_id"), "terminal_id", "Terminal")
        if unit is not None and data.get("status") == "retired" and unit.status != "retired":
            before_delete(db, p, unit)
        if unit is not None and data.get("status") == "active" and unit.status in maintenance.OFF_ROAD:
            # Back on the road only when the work orders and defects that took it off are dealt with.
            maintenance.return_blockers(db, kind, unit.id)
            maintenance.signed_off(db, p, kind, unit.id)

    def before_delete(db: Session, p: Principal, unit) -> None:
        if unit.status == "transferred":
            raise Conflict(f"{what} {unit.unit_number} moved to another company and is kept here to read only.",
                           code="UNIT_TRANSFERRED")
        busy = current_loads(db, kind, [unit.id]).get(unit.id)
        if busy:
            raise Conflict(f"{what} {unit.unit_number} is on load {busy.load_number}. Reassign that load first.",
                           details={"load_id": str(busy.id), "load_number": busy.load_number})
    return before_save, before_delete


_vehicle_save, _vehicle_delete = _guards("vehicle", "Truck")
_trailer_save, _trailer_delete = _guards("trailer", "Trailer")

router = APIRouter()
router.include_router(resource_router(
    prefix="/vehicles", tag="equipment", entity="vehicle", label="truck", model=Vehicle,
    create_schema=VehicleCreate, update_schema=VehicleUpdate, read_schema=VehicleRead,
    read_perm="equipment.read", write_perm="equipment.manage", list_params=VehicleListParams,
    search=("unit_number", "vin", "plate", "make", "model", "telematics_device", "engine"),
    search_also=_search_also("vehicle"),
    sort={"unit_number": Vehicle.unit_number, "created_at": Vehicle.created_at,
          "make": func.coalesce(Vehicle.make, ""), "year": func.coalesce(Vehicle.year, 0),
          "odometer": func.coalesce(Vehicle.odometer, 0), "owner": _owner_name("vehicle")}, default_sort="unit_number",
    present=_presenter("vehicle", VehicleRead, VehicleCreate), before_save=_vehicle_save,
    before_delete=_vehicle_delete, list_filter=_unit_filter("vehicle"),
    scope=lambda p: team_scope.vehicles(p.scope, Vehicle.id)))
router.include_router(resource_router(
    prefix="/trailers", tag="equipment", entity="trailer", label="trailer", model=Trailer,
    create_schema=TrailerCreate, update_schema=TrailerUpdate, read_schema=TrailerRead,
    read_perm="equipment.read", write_perm="equipment.manage", list_params=TrailerListParams,
    search=("unit_number", "vin", "plate", "make", "model", "tracker"),
    search_also=_search_also("trailer"),
    sort={"unit_number": Trailer.unit_number, "created_at": Trailer.created_at,
          "type": Trailer.type, "make": func.coalesce(Trailer.make, ""), "year": func.coalesce(Trailer.year, 0),
          "owner": _owner_name("trailer")},
    default_sort="unit_number",
    present=_presenter("trailer", TrailerRead, TrailerCreate), before_save=_trailer_save,
    before_delete=_trailer_delete, list_filter=_unit_filter("trailer")))
