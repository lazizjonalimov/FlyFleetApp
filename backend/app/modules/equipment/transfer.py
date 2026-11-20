"""Moving a truck or trailer to another company of the same account: preview, then confirm.

Started by the account owner, or by someone who is Main Admin in both companies. Refused while the unit is on a
load or in an open settlement. The preview names everything the move changes; confirming then does it, and the
confirm checks the same things again, so a preview never goes stale into a bad move.

* The company it leaves keeps the unit as "transferred": read-only, with all its history.
* The company it joins gets a new record: same VIN, specs and current documents.
* Both companies' audit logs record it. Nothing financial moves.
* A VIN is active in only one company of an account at a time.
"""
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.context import current_request_id
from app.core.db import new_session
from app.core.deps import Principal, get_db, require
from app.core.errors import Conflict, Forbidden, Invalid, NotFound
from app.core.permissions import Role
from app.core.storage import get_storage, make_key
from app.modules.dispatch.eligibility import current_loads
from app.modules.dispatch.models import DispatchAssignment
from app.modules.documents.models import Document, DocumentLink
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, UnitTransfer, Vehicle
from app.modules.fleet.models import UnitAssignment
from app.modules.maintenance import service as maintenance
from app.modules.maintenance.models import WorkOrder
from app.modules.organizations.models import AuditLog, Organization, User
from app.modules.owners.models import EquipmentOwnership, Owner, OwnerAgreement
from app.modules.owners.service import name_of
from app.modules.people.models import Person
from app.modules.settlements.models import DriverSettlement, SettlementLine
from app.modules.settlements.owner_models import OwnerSettlement, OwnerSettlementLine
from app.modules.teams.models import DispatchTeam, DispatchTeamMember, DispatchTeamVehicle

router = APIRouter(tags=["equipment"])
Kind = Literal["vehicle", "trailer"]
MODELS = {"vehicle": Vehicle, "trailer": Trailer}
LABEL = {"vehicle": "Truck", "trailer": "Trailer"}
_SKIP = {"id", "organization_id", "created_at", "updated_at"}


# ---------------------------------------------------------------- schemas
class UnitMoveIn(BaseModel):
    destination_organization_id: uuid.UUID
    effective_on: date = Field(description="The day the unit stops being this company's and starts in the other")
    unit_number: str | None = Field(default=None, min_length=1, max_length=40,
                                    description="Its number in the destination; defaults to the same one")
    destination_team_id: uuid.UUID | None = Field(default=None, description="A dispatch team of the destination, or none")


class TransferBlocker(BaseModel):
    code: Literal["ACTIVE_LOAD", "OPEN_SETTLEMENT", "VIN_ACTIVE_ELSEWHERE", "UNIT_NUMBER_TAKEN"]
    message: str


class TransferDispatcher(BaseModel):
    user_id: uuid.UUID
    name: str
    has_access_in_destination: bool = Field(description="False when they have no access to the destination, so the "
                                                        "truck leaves their list and they can't follow it there")


class TransferTeam(BaseModel):
    id: uuid.UUID
    name: str
    dispatchers: list[TransferDispatcher]


class TransferSeat(BaseModel):
    driver: str
    co_driver: str | None = None


class TransferOwnership(BaseModel):
    owner: str
    share_pct: str
    agreement: str | None = None


class TransferWorkOrder(BaseModel):
    id: uuid.UUID
    number: str
    title: str
    status: str


class TransferDocument(BaseModel):
    id: uuid.UUID
    type: str
    filename: str
    expires_on: date | None = None


class TransferCompany(BaseModel):
    id: uuid.UUID
    name: str
    code: str


class TransferChoice(BaseModel):
    team_id: uuid.UUID
    name: str


class TransferPreview(BaseModel):
    kind: Kind
    unit_id: uuid.UUID
    unit_number: str
    vin: str | None
    source: TransferCompany
    destination: TransferCompany
    effective_on: date
    can_confirm: bool
    blockers: list[TransferBlocker]
    team: TransferTeam | None = Field(description="The dispatch team the truck leaves, with its dispatchers")
    driver_assignment: TransferSeat | None = Field(description="Ends: the seat the unit's driver holds")
    ownership: list[TransferOwnership] = Field(description="Ends: whoever owns a share of it, under which agreement")
    open_work_orders: list[TransferWorkOrder] = Field(description="Stay with the company it leaves")
    documents: list[TransferDocument] = Field(description="Current documents, copied to the new record")
    destination_teams: list[TransferChoice] = Field(description="Teams of the destination it can be placed in")
    destination_unit_number: str


class TransferResult(BaseModel):
    kind: Kind
    source_unit_id: uuid.UUID
    destination_organization_id: uuid.UUID
    destination_unit_id: uuid.UUID
    destination_unit_number: str
    documents_copied: int


# ---------------------------------------------------------------- who may
def _destination(db: Session, p: Principal, destination_id: uuid.UUID):
    """The destination company, if it is in the account, active, and this person may move units into it."""
    rows = db.execute(text("SELECT organization_id, name, code, role, status, account_id "
                           "FROM auth_user_organizations(:u)"), {"u": p.user_id}).all()
    dest = next((r for r in rows if r.organization_id == destination_id and r.account_id == p.account_id), None)
    if dest is None or dest.organization_id == p.org_id:
        raise NotFound("That company isn't one of your account's other companies")
    if dest.status != "active":
        raise Conflict("That company is archived. Restore it before moving a unit there.", code="ORGANIZATION_ARCHIVED")
    if not (p.is_account_owner or (p.role == Role.OWNER.value and dest.role == Role.OWNER.value)):
        raise Forbidden("Moving a unit between companies takes the account owner, or a Main Admin in both companies",
                        code="TRANSFER_NOT_ALLOWED")
    return dest, rows


def _unit(db: Session, kind: Kind, unit_id: uuid.UUID):
    unit = db.get(MODELS[kind], unit_id)
    if unit is None:
        raise NotFound(f"{LABEL[kind]} not found")
    if unit.status == "transferred":
        raise Conflict(f"{LABEL[kind]} {unit.unit_number} has already moved to another company.",
                       code="UNIT_TRANSFERRED")
    return unit


# ---------------------------------------------------------------- what the move would do
def _settlement_blockers(db: Session, kind: Kind, unit) -> list[TransferBlocker]:
    out: list[TransferBlocker] = []
    unit_col = DispatchAssignment.vehicle_id if kind == "vehicle" else DispatchAssignment.trailer_id
    driver_rows = db.execute(
        select(DriverSettlement.number, DriverSettlement.status, DriverSettlement.period_start,
               DriverSettlement.period_end, Driver.first_name, Driver.last_name)
        .join(SettlementLine, SettlementLine.settlement_id == DriverSettlement.id)
        .join(DispatchAssignment, DispatchAssignment.load_id == SettlementLine.load_id)
        .join(Driver, Driver.id == DriverSettlement.driver_id)
        .where(unit_col == unit.id, DriverSettlement.status.in_(("draft", "approved"))).distinct()
    ).all()
    for number, status, start, end, first, last in driver_rows:
        what = f"statement {number}" if number else "a draft statement"
        out.append(TransferBlocker(code="OPEN_SETTLEMENT", message=(
            f"{LABEL[kind]} {unit.unit_number} is on {what} for {first} {last} ({start} to {end}, {status}). "
            f"{'Delete it' if status == 'draft' else 'Pay or void it'} first.")))
    owner_col = OwnerSettlementLine.vehicle_id if kind == "vehicle" else OwnerSettlementLine.trailer_id
    owner_rows = db.execute(
        select(OwnerSettlement.number, OwnerSettlement.status, OwnerSettlement.period_start, OwnerSettlement.period_end)
        .join(OwnerSettlementLine, OwnerSettlementLine.settlement_id == OwnerSettlement.id)
        .where(owner_col == unit.id, OwnerSettlement.status.in_(("draft", "approved"))).distinct()
    ).all()
    for number, status, start, end in owner_rows:
        what = f"owner statement {number}" if number else "a draft owner statement"
        out.append(TransferBlocker(code="OPEN_SETTLEMENT", message=(
            f"{LABEL[kind]} {unit.unit_number} is on {what} ({start} to {end}, {status}). "
            f"{'Delete it' if status == 'draft' else 'Pay or void it'} first.")))
    return out


def _preview(db: Session, p: Principal, kind: Kind, unit, body: UnitMoveIn, dest, memberships) -> TransferPreview:
    blockers: list[TransferBlocker] = []
    busy = current_loads(db, kind, [unit.id]).get(unit.id)
    if busy:
        blockers.append(TransferBlocker(code="ACTIVE_LOAD", message=(
            f"{LABEL[kind]} {unit.unit_number} is on load {busy.load_number}. Finish or reassign that load first.")))
    blockers.extend(_settlement_blockers(db, kind, unit))

    number = body.unit_number or unit.unit_number
    elsewhere: list = []
    taken = False
    destination_teams: list[TransferChoice] = []
    dst = new_session(org_id=dest.organization_id, user_id=p.user_id)
    try:
        taken = dst.scalar(select(MODELS[kind].id).where(MODELS[kind].unit_number == number)) is not None
        destination_teams = [TransferChoice(team_id=t.id, name=t.name)
                             for t in dst.scalars(select(DispatchTeam).order_by(DispatchTeam.name))]
        if unit.vin:
            elsewhere = [r for r in dst.execute(text("SELECT * FROM auth_account_active_vin(:a, :v)"),
                                                    {"a": p.account_id, "v": unit.vin})
                         if not (r.organization_id == p.org_id and r.unit_id == unit.id)]
    finally:
        dst.close()
    for r in elsewhere:
        blockers.append(TransferBlocker(code="VIN_ACTIVE_ELSEWHERE", message=(
            f"VIN {unit.vin} is already active in {r.organization_name} as {r.unit_number}. "
            "A VIN is active in only one company of an account at a time.")))
    if taken:
        blockers.append(TransferBlocker(code="UNIT_NUMBER_TAKEN", message=(
            f"{dest.name} already has a {LABEL[kind].lower()} numbered {number}. Choose another number for it there.")))

    team = None
    seat = None
    if kind == "vehicle":
        link = db.scalar(select(DispatchTeamVehicle).where(DispatchTeamVehicle.vehicle_id == unit.id))
        if link is not None:
            t = db.get(DispatchTeam, link.team_id)
            members = db.execute(select(DispatchTeamMember.user_id, User.full_name)
                                 .join(User, User.id == DispatchTeamMember.user_id)
                                 .where(DispatchTeamMember.team_id == t.id).order_by(User.full_name)).all()
            team = TransferTeam(id=t.id, name=t.name, dispatchers=[
                TransferDispatcher(user_id=uid, name=name, has_access_in_destination=_has_access(db, uid, dest.organization_id))
                for uid, name in members])
        open_seat = db.scalar(select(UnitAssignment).where(UnitAssignment.vehicle_id == unit.id,
                                                           UnitAssignment.effective_to.is_(None)))
        if open_seat is not None:
            names = {d.id: f"{d.first_name} {d.last_name}" for d in db.scalars(
                select(Driver).where(Driver.id.in_([i for i in (open_seat.driver_id, open_seat.co_driver_id) if i])))}
            seat = TransferSeat(driver=names.get(open_seat.driver_id, ""),
                                co_driver=names.get(open_seat.co_driver_id) if open_seat.co_driver_id else None)

    unit_col = EquipmentOwnership.vehicle_id if kind == "vehicle" else EquipmentOwnership.trailer_id
    shares = db.scalars(select(EquipmentOwnership).where(unit_col == unit.id, EquipmentOwnership.effective_to.is_(None),
                                                         EquipmentOwnership.owner_id.is_not(None))).all()
    ownership = []
    for share in shares:
        owner = db.get(Owner, share.owner_id)
        person = db.get(Person, owner.person_id) if owner.person_id else None
        agreement = db.get(OwnerAgreement, share.agreement_id) if share.agreement_id else None
        ownership.append(TransferOwnership(owner=name_of(owner, person), share_pct=str(share.share_pct),
                                           agreement=(agreement.reference or agreement.kind) if agreement else None))

    wo_col = WorkOrder.vehicle_id if kind == "vehicle" else WorkOrder.trailer_id
    orders = [TransferWorkOrder(id=w.id, number=w.number, title=w.title, status=w.status)
              for w in db.scalars(select(WorkOrder).where(wo_col == unit.id, WorkOrder.status.in_(maintenance.OPEN))
                                  .order_by(WorkOrder.number))]
    docs = [TransferDocument(id=d.id, type=d.type, filename=d.filename, expires_on=d.expires_on)
            for d in _current_documents(db, kind, unit.id, body.effective_on)]
    source = db.get(Organization, p.org_id)
    return TransferPreview(
        kind=kind, unit_id=unit.id, unit_number=unit.unit_number, vin=unit.vin,
        source=TransferCompany(id=p.org_id, name=source.name, code=source.code),
        destination=TransferCompany(id=dest.organization_id, name=dest.name, code=dest.code),
        effective_on=body.effective_on, can_confirm=not blockers, blockers=blockers, team=team, driver_assignment=seat,
        ownership=ownership, open_work_orders=orders, documents=docs, destination_teams=destination_teams,
        destination_unit_number=number)


def _has_access(db: Session, user_id: uuid.UUID, org_id: uuid.UUID) -> bool:
    rows = db.execute(text("SELECT organization_id FROM auth_user_organizations(:u)"), {"u": user_id}).all()
    return any(r.organization_id == org_id for r in rows)


def _current_documents(db: Session, kind: Kind, unit_id: uuid.UUID, on: date) -> list[Document]:
    """What is on file for the unit and still good on the day of the move."""
    return list(db.scalars(
        select(Document).join(DocumentLink, DocumentLink.document_id == Document.id)
        .where(DocumentLink.entity_type == kind, DocumentLink.entity_id == unit_id, Document.upload_status == "uploaded",
               Document.review_status != "rejected")
        .where((Document.expires_on.is_(None)) | (Document.expires_on >= on)).order_by(Document.created_at)))


# ---------------------------------------------------------------- the two steps
def _do_preview(kind: Kind, unit_id: uuid.UUID, body: UnitMoveIn, p: Principal, db: Session) -> TransferPreview:
    dest, memberships = _destination(db, p, body.destination_organization_id)
    unit = _unit(db, kind, unit_id)
    return _preview(db, p, kind, unit, body, dest, memberships)


def _do_confirm(kind: Kind, unit_id: uuid.UUID, body: UnitMoveIn, p: Principal, db: Session) -> TransferResult:
    dest, memberships = _destination(db, p, body.destination_organization_id)
    unit = _unit(db, kind, unit_id)
    preview = _preview(db, p, kind, unit, body, dest, memberships)
    if not preview.can_confirm:
        raise Conflict("This unit can't move yet: " + " ".join(b.message for b in preview.blockers),
                       code="TRANSFER_BLOCKED", details={"blockers": [b.model_dump() for b in preview.blockers]})
    if body.destination_team_id and kind != "vehicle":
        raise Invalid("Trailers don't belong to a dispatch team", field="destination_team_id")

    number = preview.destination_unit_number
    docs = _current_documents(db, kind, unit.id, body.effective_on)
    storage = get_storage()
    new_id = uuid.uuid4()
    copied = 0
    dst = new_session(org_id=dest.organization_id, user_id=p.user_id)
    try:
        if body.destination_team_id and dst.get(DispatchTeam, body.destination_team_id) is None:
            raise Invalid("Dispatch team not found in the destination company", field="destination_team_id")
        data = {a.key: getattr(unit, a.key) for a in sa_inspect(type(unit)).mapper.column_attrs if a.key not in _SKIP}
        # Terminals belong to the company they were made in; owners' agreements ended, so the new record is owned outright.
        data.update(unit_number=number, status="active", terminal_id=None, ownership="owned")
        dst.add(type(unit)(id=new_id, organization_id=dest.organization_id, **data))
        dst.flush()
        if body.destination_team_id:
            dst.add(DispatchTeamVehicle(organization_id=dest.organization_id, team_id=body.destination_team_id,
                                        vehicle_id=new_id))
        for doc in docs:
            fresh = uuid.uuid4()
            clone = {a.key: getattr(doc, a.key) for a in sa_inspect(Document).mapper.column_attrs if a.key not in _SKIP}
            key = make_key(dest.organization_id, fresh)
            if storage.exists(doc.storage_key):
                storage.put(key, storage.get(doc.storage_key))
            clone.update(storage_key=key, in_portal=False, uploaded_by=p.user_id, reviewed_by=None)
            dst.add(Document(id=fresh, organization_id=dest.organization_id, **clone))
            dst.flush()
            dst.add(DocumentLink(organization_id=dest.organization_id, document_id=fresh, entity_type=kind, entity_id=new_id))
            copied += 1
        source_org = db.execute(text("SELECT name FROM auth_user_organizations(:u) WHERE organization_id = :o"),
                                {"u": p.user_id, "o": p.org_id}).scalar() or ""
        dst.add(UnitTransfer(organization_id=dest.organization_id, direction="in", kind=kind, unit_id=new_id,
                             unit_number=number, vin=unit.vin, other_organization_id=p.org_id,
                             other_organization_name=source_org, other_unit_id=unit.id, effective_on=body.effective_on,
                             performed_by=p.user_id, details={"documents_copied": copied,
                                                              "team_id": str(body.destination_team_id) if body.destination_team_id
                                                              else None}))
        dst.add(AuditLog(organization_id=dest.organization_id, actor_user_id=p.user_id, action=f"{kind}.transferred_in",
                         entity_type=kind, entity_id=new_id, request_id=current_request_id(),
                         data={"from_company": source_org, "from_unit": unit.unit_number, "vin": unit.vin,
                               "effective_on": str(body.effective_on), "documents_copied": copied}))

        # The company it leaves: the unit stays, read-only, and what hung on it ends.
        end = body.effective_on
        if kind == "vehicle":
            seat = db.scalar(select(UnitAssignment).where(UnitAssignment.vehicle_id == unit.id,
                                                          UnitAssignment.effective_to.is_(None)))
            if seat is not None:
                seat.effective_to = max(end, seat.effective_from)
                seat.reason = "Truck moved to another company"
            link = db.scalar(select(DispatchTeamVehicle).where(DispatchTeamVehicle.vehicle_id == unit.id))
            if link is not None:
                db.delete(link)
        unit_col = EquipmentOwnership.vehicle_id if kind == "vehicle" else EquipmentOwnership.trailer_id
        for share in db.scalars(select(EquipmentOwnership).where(unit_col == unit.id, EquipmentOwnership.effective_to.is_(None))):
            share.effective_to = max(end, share.effective_from)
            share.reason = "Unit moved to another company"
        unit.status = "transferred"
        db.add(UnitTransfer(organization_id=p.org_id, direction="out", kind=kind, unit_id=unit.id,
                            unit_number=unit.unit_number, vin=unit.vin, other_organization_id=dest.organization_id,
                            other_organization_name=dest.name, other_unit_id=new_id, effective_on=body.effective_on,
                            performed_by=p.user_id, details={"documents_copied": copied}))
        audit(db, p, f"{kind}.transferred_out", kind, unit.id,
              {"to_company": dest.name, "to_unit": number, "vin": unit.vin, "effective_on": str(body.effective_on),
               "documents_copied": copied})
        db.flush()
        dst.commit()
        db.commit()
    except Exception:
        dst.rollback()
        raise
    finally:
        dst.close()
    return TransferResult(kind=kind, source_unit_id=unit.id, destination_organization_id=dest.organization_id,
                          destination_unit_id=new_id, destination_unit_number=number, documents_copied=copied)


# ---------------------------------------------------------------- routes
@router.post("/vehicles/{unit_id}/transfer-preview", response_model=TransferPreview, summary="Preview moving a truck")
def preview_truck(unit_id: uuid.UUID, body: UnitMoveIn, p: Principal = Depends(require("equipment.manage")),
                  db: Session = Depends(get_db)):
    """What moving the truck to another company of the account would change, and what stands in the way."""
    return _do_preview("vehicle", unit_id, body, p, db)


@router.post("/vehicles/{unit_id}/transfer", response_model=TransferResult, status_code=201,
             summary="Move a truck to another company")
def move_truck(unit_id: uuid.UUID, body: UnitMoveIn, p: Principal = Depends(require("equipment.manage")),
               db: Session = Depends(get_db)):
    return _do_confirm("vehicle", unit_id, body, p, db)


@router.post("/trailers/{unit_id}/transfer-preview", response_model=TransferPreview, summary="Preview moving a trailer")
def preview_trailer(unit_id: uuid.UUID, body: UnitMoveIn, p: Principal = Depends(require("equipment.manage")),
                    db: Session = Depends(get_db)):
    return _do_preview("trailer", unit_id, body, p, db)


@router.post("/trailers/{unit_id}/transfer", response_model=TransferResult, status_code=201,
             summary="Move a trailer to another company")
def move_trailer(unit_id: uuid.UUID, body: UnitMoveIn, p: Principal = Depends(require("equipment.manage")),
                 db: Session = Depends(get_db)):
    return _do_confirm("trailer", unit_id, body, p, db)
