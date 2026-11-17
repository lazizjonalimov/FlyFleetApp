import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, literal, or_, select
from sqlalchemy.orm import Session

from app.core import scope as team_scope
from app.core.crud import ListParams, child_router, ensure_exists, resource_router
from app.core.crypto import mask
from app.core.deps import Principal
from app.core.errors import Conflict, Invalid
from app.modules.dispatch.eligibility import OtherLoad, current_loads, qualifications_by_driver
from app.modules.drivers.models import Driver, DriverQualification
from app.modules.equipment.models import Vehicle
from app.modules.fleet.models import UnitAssignment
from app.modules.organizations.models import Membership, Terminal
from app.modules.owners.models import EquipmentOwnership, Owner
from app.modules.people import service as people
from app.modules.people.models import Person
from app.modules.safety.rules import WARN_DAYS, Compliance, driver_issues, summarize

DriverType = Literal["company", "owner_operator", "contractor"]
DriverStatus = Literal["active", "inactive", "terminated"]
PayType = Literal["per_mile", "percent", "flat"]
PayBy = Literal["carrier", "owner", "carrier_for_owner"]
DriverKind = Literal["company", "owners_drivers", "owner_operators", "team", "available", "on_load", "not_dispatchable"]
QualificationType = Literal["mvr", "drug_test", "road_test", "employment_application", "annual_review", "hazmat",
                            "twic", "training", "other"]


# ---------------------------------------------------------------- schemas
class DriverCreate(BaseModel):
    person_id: uuid.UUID | None = Field(default=None, description="A person already on file: linked, not copied")
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    employee_number: str | None = Field(default=None, max_length=30)
    driver_type: DriverType = "company"
    hire_date: date | None = None
    terminal_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = Field(default=None, description="The team member (role: driver) this driver is")
    cdl_number: str | None = Field(default=None, max_length=40)
    cdl_state: str | None = Field(default=None, min_length=2, max_length=2, pattern=r"^[A-Za-z]{2}$")
    cdl_class: Literal["A", "B", "C"] | None = None
    cdl_expiry: date | None = None
    endorsements: str | None = Field(default=None, max_length=20, pattern=r"^[A-Za-z ,]*$")
    restrictions: str | None = Field(default=None, max_length=40)
    date_of_birth: date | None = Field(default=None, description="Kept on the person, encrypted")
    medical_cert_expiry: date | None = None
    employer_owner_id: uuid.UUID | None = Field(default=None, description="An owner who hired this driver")
    pay_by: PayBy = "carrier"
    pay_type: PayType = "per_mile"
    pay_rate: Decimal = Field(default=Decimal("0"), ge=0, max_digits=10, decimal_places=4)
    status: DriverStatus = "active"
    notes: str | None = Field(default=None, max_length=4000)


class DriverUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=80)
    last_name: str | None = Field(default=None, min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    employee_number: str | None = Field(default=None, max_length=30)
    driver_type: DriverType | None = None
    hire_date: date | None = None
    terminal_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    cdl_number: str | None = Field(default=None, max_length=40)
    cdl_state: str | None = Field(default=None, min_length=2, max_length=2, pattern=r"^[A-Za-z]{2}$")
    cdl_class: Literal["A", "B", "C"] | None = None
    cdl_expiry: date | None = None
    endorsements: str | None = Field(default=None, max_length=20, pattern=r"^[A-Za-z ,]*$")
    restrictions: str | None = Field(default=None, max_length=40)
    date_of_birth: date | None = None
    medical_cert_expiry: date | None = None
    employer_owner_id: uuid.UUID | None = None
    pay_by: PayBy | None = None
    pay_type: PayType | None = None
    pay_rate: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=4)
    status: DriverStatus | None = None
    notes: str | None = Field(default=None, max_length=4000)


class SeatRef(BaseModel):
    vehicle_id: uuid.UUID
    unit_number: str
    seat: Literal["primary", "co_driver"]
    partner_id: uuid.UUID | None = None
    partner_name: str | None = None
    team_split: str | None = None
    # Who owns the truck today, when it isn't the carrier.
    owner_id: uuid.UUID | None = None
    owner_name: str | None = None


class DriverRead(BaseModel):
    id: uuid.UUID
    person_id: uuid.UUID
    first_name: str
    last_name: str
    full_name: str
    phone: str | None
    email: str | None
    employee_number: str | None
    driver_type: str
    hire_date: date | None
    terminal_id: uuid.UUID | None
    user_id: uuid.UUID | None
    # Always safe to show: the last four characters. The full number is sent only to roles allowed to see it.
    cdl_number_masked: str | None
    cdl_number: str | None
    cdl_state: str | None
    cdl_class: str | None
    cdl_expiry: date | None
    endorsements: str | None
    restrictions: str | None
    # A birth date identifies a person: only whether one is on file, unless the role may see it.
    has_date_of_birth: bool = False
    date_of_birth: date | None = None
    medical_cert_expiry: date | None
    employer_owner_id: uuid.UUID | None
    employer_owner_name: str | None = None
    pay_by: str
    # The owner record of this person, when the driver also owns equipment.
    owner_id: uuid.UUID | None = None
    unit: SeatRef | None = None
    # Null for roles that may not see pay settings.
    pay_type: str | None
    pay_rate: Decimal | None
    status: str
    notes: str | None
    compliance: Compliance
    current_load: OtherLoad | None
    created_at: datetime


class DriverListParams(ListParams):
    kind: DriverKind | None = None
    employer_owner_id: uuid.UUID | None = None
    status: DriverStatus | None = None
    driver_type: DriverType | None = None
    terminal_id: uuid.UUID | None = None
    endorsement: str | None = Field(default=None, min_length=1, max_length=2, pattern=r"^[A-Za-z]{1,2}$")
    qualification: Literal["ok", "expiring", "blocked"] | None = None
    app: bool | None = Field(default=None, description="Has signed in to the driver app")


class QualificationCreate(BaseModel):
    type: QualificationType
    issued_on: date | None = None
    expires_on: date | None = None
    required: bool = Field(default=False, description="When set, an expired item blocks dispatch")
    reference: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=500)


class QualificationUpdate(BaseModel):
    type: QualificationType | None = None
    issued_on: date | None = None
    expires_on: date | None = None
    required: bool | None = None
    reference: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=500)


class QualificationRead(QualificationCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    driver_id: uuid.UUID


# ---------------------------------------------------------------- behaviour
def seats_of(db: Session, ids: list[uuid.UUID]) -> dict[uuid.UUID, SeatRef]:
    """The truck each driver is seated in today, and their team partner."""
    if not ids:
        return {}
    rows = db.execute(select(UnitAssignment, Vehicle.unit_number).join(Vehicle, Vehicle.id == UnitAssignment.vehicle_id)
                      .where(UnitAssignment.effective_to.is_(None),
                             or_(UnitAssignment.driver_id.in_(ids), UnitAssignment.co_driver_id.in_(ids)))).all()
    partners = {x for seat, _ in rows for x in (seat.driver_id, seat.co_driver_id) if x}
    names = {d.id: f"{d.first_name} {d.last_name}" for d in db.scalars(select(Driver).where(Driver.id.in_(partners)))}
    owners: dict[uuid.UUID, tuple[uuid.UUID, str]] = {}
    vehicles = [seat.vehicle_id for seat, _ in rows]
    if vehicles:
        for vehicle_id, owner_id, legal, first, last in db.execute(
                select(EquipmentOwnership.vehicle_id, Owner.id, Owner.legal_name, Person.first_name, Person.last_name)
                .join(Owner, Owner.id == EquipmentOwnership.owner_id).outerjoin(Person, Person.id == Owner.person_id)
                .where(EquipmentOwnership.vehicle_id.in_(vehicles), EquipmentOwnership.effective_to.is_(None))
                .order_by(EquipmentOwnership.share_pct.desc())):
            owners.setdefault(vehicle_id, (owner_id, legal or f"{first or ''} {last or ''}".strip()))
    out = {}
    for seat, unit_number in rows:
        owner_id, owner_name = owners.get(seat.vehicle_id, (None, None))
        for me, other, role in ((seat.driver_id, seat.co_driver_id, "primary"), (seat.co_driver_id, seat.driver_id, "co_driver")):
            if me in ids:
                out[me] = SeatRef(vehicle_id=seat.vehicle_id, unit_number=unit_number, seat=role, partner_id=other,
                                  partner_name=names.get(other) if other else None,
                                  team_split=seat.team_split if seat.co_driver_id else None,
                                  owner_id=owner_id, owner_name=owner_name)
    return out


LIVE = ("assigned", "dispatched", "at_pickup", "in_transit", "at_delivery")


def _busy_drivers():
    from app.modules.dispatch.models import DispatchAssignment
    from app.modules.loads.models import Load
    on = (select(DispatchAssignment.driver_id).join(Load, Load.id == DispatchAssignment.load_id)
          .where(DispatchAssignment.status == "active", Load.status.in_(LIVE)))
    co = (select(DispatchAssignment.co_driver_id).join(Load, Load.id == DispatchAssignment.load_id)
          .where(DispatchAssignment.status == "active", Load.status.in_(LIVE), DispatchAssignment.co_driver_id.is_not(None)))
    return Driver.id.in_(on) | Driver.id.in_(co)


def _blocked(today: date):
    """Papers that stop a driver from being dispatched: a lapsed CDL or medical card, or a required item."""
    return or_(Driver.cdl_expiry < today, Driver.medical_cert_expiry < today,
               Driver.id.in_(select(DriverQualification.driver_id).where(DriverQualification.required.is_(True),
                                                                         DriverQualification.expires_on < today)))


def _expiring(today: date):
    soon = today + timedelta(days=WARN_DAYS)
    return or_(Driver.cdl_expiry.between(today, soon), Driver.medical_cert_expiry.between(today, soon),
               Driver.id.in_(select(DriverQualification.driver_id).where(DriverQualification.expires_on.between(today, soon))))


def _search_also(pattern: str) -> list:
    """Search also finds a driver by the truck they are seated in."""
    return [Driver.id.in_(select(UnitAssignment.driver_id).join(Vehicle, Vehicle.id == UnitAssignment.vehicle_id)
                          .where(UnitAssignment.effective_to.is_(None), Vehicle.unit_number.ilike(pattern))),
            Driver.id.in_(select(UnitAssignment.co_driver_id).join(Vehicle, Vehicle.id == UnitAssignment.vehicle_id)
                          .where(UnitAssignment.effective_to.is_(None), Vehicle.unit_number.ilike(pattern)))]


def present(db: Session, drivers: list[Driver], p: Principal) -> list[DriverRead]:
    """Shape drivers for the caller: mask what their role may not see, attach compliance and current work."""
    sensitive = p.can("drivers.sensitive.read")
    ids = [d.id for d in drivers]
    quals = qualifications_by_driver(db, ids)
    on_load = current_loads(db, "driver", ids)
    today = p.today()
    seats = seats_of(db, ids)
    persons = {x.id: x for x in db.scalars(select(Person).where(Person.id.in_([d.person_id for d in drivers])))}
    owned = dict(db.execute(select(Owner.person_id, Owner.id).where(Owner.person_id.in_(list(persons)))).all()) if persons else {}
    employers = {d.employer_owner_id for d in drivers if d.employer_owner_id}
    employer_names = {}
    if employers:
        for o in db.scalars(select(Owner).where(Owner.id.in_(employers))):
            person = db.get(Person, o.person_id) if o.person_id else None
            employer_names[o.id] = o.legal_name or (f"{person.first_name} {person.last_name}" if person else "Owner")
    return [DriverRead(
        id=d.id, person_id=d.person_id, first_name=d.first_name, last_name=d.last_name, full_name=f"{d.first_name} {d.last_name}",
        phone=d.phone, email=d.email, employee_number=d.employee_number, driver_type=d.driver_type,
        hire_date=d.hire_date, terminal_id=d.terminal_id, user_id=d.user_id,
        cdl_number_masked=mask(d.cdl_number), cdl_number=d.cdl_number if sensitive else None,
        cdl_state=d.cdl_state, cdl_class=d.cdl_class, cdl_expiry=d.cdl_expiry,
        endorsements=d.endorsements, restrictions=d.restrictions,
        has_date_of_birth=bool(persons.get(d.person_id) and persons[d.person_id].date_of_birth),
        date_of_birth=date.fromisoformat(persons[d.person_id].date_of_birth)
        if sensitive and persons.get(d.person_id) and persons[d.person_id].date_of_birth else None,
        employer_owner_id=d.employer_owner_id, employer_owner_name=employer_names.get(d.employer_owner_id),
        pay_by=d.pay_by, owner_id=owned.get(d.person_id), unit=seats.get(d.id),
        medical_cert_expiry=d.medical_cert_expiry, pay_type=d.pay_type if sensitive else None,
        pay_rate=d.pay_rate if sensitive else None, status=d.status, notes=d.notes,
        compliance=summarize(driver_issues(d, quals.get(d.id, []), today)), current_load=on_load.get(d.id),
        created_at=d.created_at) for d in drivers]


def _before_save(db: Session, p: Principal, data: dict, driver: Driver | None) -> None:
    for required in ("first_name", "last_name", "driver_type", "pay_type", "pay_rate", "status"):
        if required in data and data[required] is None:
            raise Invalid("This field can't be empty", field=required)
    if data.get("cdl_state"):
        data["cdl_state"] = data["cdl_state"].upper()
    if data.get("endorsements"):
        data["endorsements"] = ", ".join(x for x in data["endorsements"].upper().replace(",", " ").split() if x)
    ensure_exists(db, Terminal, data.get("terminal_id"), "terminal_id", "Terminal")
    ensure_exists(db, Owner, data.get("employer_owner_id"), "employer_owner_id", "Owner")
    pay_by = data.get("pay_by", driver.pay_by if driver else "carrier")
    employer = data.get("employer_owner_id", driver.employer_owner_id if driver else None)
    if pay_by != "carrier" and employer is None:
        raise Invalid("Choose the owner who hired this driver", field="employer_owner_id")
    _person_for(db, p, data, driver)
    if data.get("user_id"):
        member = db.scalar(select(Membership).where(Membership.user_id == data["user_id"]))
        if member is None:
            raise Invalid("That person is not on this company's team", field="user_id")
        if member.role != "driver":
            raise Invalid("Only a team member with the driver role can be linked to a driver", field="user_id")
        taken = db.scalar(select(Driver.id).where(Driver.user_id == data["user_id"]))
        if taken and (driver is None or taken != driver.id):
            raise Invalid("That sign-in is already linked to another driver", field="user_id")
    if driver is not None and data.get("status") in ("inactive", "terminated") and driver.status == "active":
        busy = current_loads(db, "driver", [driver.id]).get(driver.id)
        if busy:
            raise Conflict(f"{driver.first_name} {driver.last_name} is on load {busy.load_number}. Reassign that "
                           "load first.", details={"load_id": str(busy.id), "load_number": busy.load_number})


def _person_for(db: Session, p: Principal, data: dict, driver: Driver | None) -> None:
    """A driver profile belongs to a person: link one already on file, or create them; and keep the person's
    name, phone, email and birth date in step with what is entered here."""
    dob = data.pop("date_of_birth", None) if "date_of_birth" in data else ...
    person_id = data.pop("person_id", None)
    if driver is None:
        if person_id:
            person = db.get(Person, person_id)
            if person is None:
                raise Invalid("Person not found", field="person_id")
            if db.scalar(select(Driver.id).where(Driver.person_id == person.id)):
                raise Conflict(f"{person.first_name} {person.last_name} already has a driver profile",
                               code="DUPLICATE_REFERENCE", field_errors={"person_id": "Already a driver"})
            people.apply(person, {k: data[k] for k in ("first_name", "last_name", "phone", "email") if data.get(k)})
        else:
            person = people.create(db, p.org_id, {k: data.get(k) for k in ("first_name", "last_name", "phone", "email")})
        data["person_id"] = person.id
        data["first_name"], data["last_name"] = person.first_name, person.last_name
        data["phone"], data["email"] = person.phone, person.email
    else:
        person = db.get(Person, driver.person_id)
        changes = {k: data[k] for k in ("first_name", "last_name", "phone", "email") if k in data}
        if changes:
            people.apply(person, changes)
    if dob is not ...:
        people.apply(person, {"date_of_birth": dob})


def _list_filter(db: Session, stmt, params: DriverListParams, p: Principal):
    today = p.today()
    if params.endorsement:
        stmt = stmt.where(func.concat(" ", func.replace(func.coalesce(Driver.endorsements, ""), ",", " "), " ")
                          .ilike(f"% {params.endorsement.upper()} %"))
    if params.qualification == "blocked":
        stmt = stmt.where(_blocked(today))
    elif params.qualification == "expiring":
        stmt = stmt.where(~_blocked(today), _expiring(today))
    elif params.qualification == "ok":
        stmt = stmt.where(~_blocked(today), ~_expiring(today))
    if params.app is not None:
        stmt = stmt.where(Driver.user_id.is_not(None) if params.app else Driver.user_id.is_(None))
    if params.kind == "available":
        stmt = stmt.where(Driver.status == "active", ~_busy_drivers(), ~_blocked(today))
    elif params.kind == "on_load":
        stmt = stmt.where(_busy_drivers())
    elif params.kind == "not_dispatchable":
        stmt = stmt.where(Driver.status == "active", _blocked(today))
    if params.employer_owner_id:
        stmt = stmt.where(Driver.employer_owner_id == params.employer_owner_id)
    if params.kind == "company":
        stmt = stmt.where(Driver.employer_owner_id.is_(None), Driver.person_id.not_in(
            select(Owner.person_id).where(Owner.person_id.is_not(None))))
    elif params.kind == "owners_drivers":
        stmt = stmt.where(Driver.employer_owner_id.is_not(None))
    elif params.kind == "owner_operators":
        stmt = stmt.where(Driver.person_id.in_(select(Owner.person_id).where(Owner.person_id.is_not(None))))
    elif params.kind == "team":
        stmt = stmt.where(or_(
            Driver.id.in_(select(UnitAssignment.driver_id).where(UnitAssignment.effective_to.is_(None),
                                                                  UnitAssignment.co_driver_id.is_not(None))),
            Driver.id.in_(select(UnitAssignment.co_driver_id).where(UnitAssignment.effective_to.is_(None)))))
    return stmt


def _before_delete(db: Session, p: Principal, driver: Driver) -> None:
    busy = current_loads(db, "driver", [driver.id]).get(driver.id)
    if busy:
        raise Conflict(f"This driver is on load {busy.load_number}", details={"load_id": str(busy.id)})


def _check_dates(db: Session, p: Principal, data: dict, q: DriverQualification | None) -> None:
    issued = data.get("issued_on", q.issued_on if q is not None else None)
    expires = data.get("expires_on", q.expires_on if q is not None else None)
    if issued and expires and expires < issued:
        raise Invalid("The expiry date can't be before the issue date", field="expires_on")
    for required in ("type", "required"):
        if required in data and data[required] is None:
            raise Invalid("This field can't be empty", field=required)


router = APIRouter()
router.include_router(resource_router(
    prefix="/drivers", tag="drivers", entity="driver", label="driver", model=Driver,
    create_schema=DriverCreate, update_schema=DriverUpdate, read_schema=DriverRead,
    read_perm="drivers.read", write_perm="drivers.manage", list_params=DriverListParams,
    search=("first_name", "last_name", "employee_number", "phone", "email"), search_also=_search_also,
    sort={"name": Driver.last_name, "created_at": Driver.created_at,
          "hire_date": func.coalesce(Driver.hire_date, literal(date(9999, 1, 1))),
          "cdl_expiry": func.coalesce(Driver.cdl_expiry, literal(date(9999, 1, 1))),
          "medical_cert_expiry": func.coalesce(Driver.medical_cert_expiry, literal(date(9999, 1, 1))),
          "employee_number": func.coalesce(Driver.employee_number, ""), "status": Driver.status,
          # Blocked first, then expiring soon, then in order: the soonest expiry decides.
          "qualification": func.least(func.coalesce(Driver.cdl_expiry, literal(date(9999, 1, 1))),
                                      func.coalesce(Driver.medical_cert_expiry, literal(date(9999, 1, 1))))},
    default_sort="name", present=present, audit_redact=("cdl_number", "pay_rate", "date_of_birth"),
    before_save=_before_save, before_delete=_before_delete, list_filter=_list_filter,
    scope=lambda p: team_scope.drivers(p.scope, Driver.id)))
router.include_router(child_router(
    prefix="/drivers/{parent_id}/qualifications", tag="drivers", entity="driver_qualification",
    label="qualification", model=DriverQualification, parent_model=Driver, parent_fk="driver_id",
    parent_label="Driver", create_schema=QualificationCreate, update_schema=QualificationUpdate,
    read_schema=QualificationRead, read_perm="drivers.read", write_perm="drivers.manage",
    order_by=DriverQualification.type, before_save=_check_dates,
    parent_scope=lambda p: team_scope.drivers(p.scope, Driver.id)))
