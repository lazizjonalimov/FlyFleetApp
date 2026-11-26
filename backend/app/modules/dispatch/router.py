import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import Principal, get_db, get_or_404, require
from app.core.errors import Conflict, NotFound
from app.core.idempotency import run_idempotent
from app.core.pagination import Page, envelope
from app.modules.dispatch import eligibility, service
from app.modules.dispatch.models import DispatchAssignment
from app.modules.loads import schemas as ls
from app.modules.loads import service as loads
from app.modules.loads.models import Load

router = APIRouter(prefix="/dispatch", tags=["dispatch"])


class AssignIn(BaseModel):
    load_id: uuid.UUID
    driver_id: uuid.UUID
    vehicle_id: uuid.UUID
    trailer_id: uuid.UUID | None = None
    version: int = Field(description="The load version you last saw")
    reason: str | None = Field(default=None, max_length=200)
    dispatch: bool = Field(default=False, description="Dispatch it to the driver in the same step")
    notify: bool = Field(default=True, description="Tell the driver in the app (and Telegram, where connected)")
    message: str | None = Field(default=None, max_length=1000, description="A note to the driver with it")


class UndoIn(BaseModel):
    version: int


class RescheduleIn(BaseModel):
    load_id: uuid.UUID
    version: int
    days: int = Field(ge=-60, le=60, description="Days to move every appointment by; negative is earlier")


class BestMatchIn(BaseModel):
    load_ids: list[uuid.UUID] = Field(min_length=1, max_length=50)


class Matched(BaseModel):
    load_id: uuid.UUID
    load_number: str
    driver: str
    assignment_id: uuid.UUID
    version: int


class Unmatched(BaseModel):
    load_id: uuid.UUID
    load_number: str
    reason: str


class BestMatchOut(BaseModel):
    assigned: list[Matched]
    failed: list[Unmatched]


class DriverSeat(BaseModel):
    driver_id: uuid.UUID
    truck: str | None
    vehicle_id: uuid.UUID | None
    trailer: str | None
    trailer_type: str | None
    place: str | None
    moving: bool | None
    position_minutes: int | None


class ReassignIn(BaseModel):
    """Only what is sent changes. Send `trailer_id: null` to drop the trailer."""
    driver_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    trailer_id: uuid.UUID | None = None
    version: int
    reason: str | None = Field(default=None, max_length=200)


class ReleaseIn(BaseModel):
    version: int
    reason: str | None = Field(default=None, max_length=200)


@router.get("/board", response_model=Page[ls.LoadListItem])
def board(params: Annotated[ls.LoadListParams, Query()], p: Principal = Depends(require("dispatch.read")),
          db: Session = Depends(get_db)):
    """The loads a dispatcher is working, filtered, sorted and paged in the database."""
    items, info = loads.list_loads(db, p, params, default_view=None if params.status else "active")
    return envelope(items, info)


@router.get("/summary", response_model=ls.BoardSummary)
def summary(terminal_id: uuid.UUID | None = None, p: Principal = Depends(require("dispatch.read")),
            db: Session = Depends(get_db)):
    return loads.board_summary(db, p, terminal_id)


@router.get("/eligible-resources", response_model=eligibility.EligibleResources)
def eligible_resources(load_id: uuid.UUID, q: str | None = Query(default=None, max_length=100),
                       terminal_id: uuid.UUID | None = None, p: Principal = Depends(require("dispatch.read")),
                       db: Session = Depends(get_db)):
    """Drivers, trucks and trailers for a load, each with the reasons it can or can't take it."""
    loads.visible(db, p, load_id)
    load = get_or_404(db, Load, load_id, "Load")
    return eligibility.evaluate(db, load, p.today(), datetime.now(UTC), q=q, terminal_id=terminal_id, scope=p.scope,
                               zone=p.timezone or "UTC")


@router.post("/assignments", response_model=ls.LoadDetail, status_code=201)
def assign(body: AssignIn, p: Principal = Depends(require("dispatch.assign")), db: Session = Depends(get_db),
           idempotency_key: Annotated[str | None, Header()] = None):
    """Assign a planned load. Eligibility is checked again here, inside the transaction that books it."""
    def work():
        load = loads.lock_load(db, body.load_id, p)
        loads.check_version(load, body.version)
        if load.status not in loads.TRANSITIONS["assign"]:
            raise loads.illegal(load, "assign")
        service.assign(db, p, load, body.driver_id, body.vehicle_id, body.trailer_id, reason=body.reason)
        db.flush()
        if body.dispatch and load.status == "assigned":
            loads.transition(db, p, load, "dispatch", notify=body.notify)
            db.flush()
        if body.message and body.message.strip() and body.notify:
            from app.modules.messaging import service as messaging
            messaging.tell_driver(db, p.org_id, body.driver_id, event="dispatch_note",
                                  title=f"Note from {p.full_name} about {load.load_number}", body=body.message.strip(),
                                  load_id=load.id)
        return 201, loads.load_detail(db, p, load.id)
    return run_idempotent(db, p, idempotency_key, "POST /dispatch/assignments", body.model_dump(mode="json"), work)


def _active(db: Session, p: Principal, assignment_id: uuid.UUID) -> tuple[DispatchAssignment, Load]:
    assignment = db.get(DispatchAssignment, assignment_id)
    if assignment is None:
        raise NotFound("Assignment not found")
    load = loads.lock_load(db, assignment.load_id, p)
    db.refresh(assignment)
    if assignment.status != "active":
        raise Conflict("This assignment has already been replaced or released. Refresh to see the current one.",
                       code="STATE_CONFLICT")
    return assignment, load


@router.patch("/assignments/{assignment_id}", response_model=ls.LoadDetail)
def reassign(assignment_id: uuid.UUID, body: ReassignIn, p: Principal = Depends(require("dispatch.assign")),
             db: Session = Depends(get_db)):
    """Swap the driver, truck or trailer. The old assignment is kept as history."""
    assignment, load = _active(db, p, assignment_id)
    loads.check_version(load, body.version)
    if load.status not in loads.REASSIGNABLE:
        raise loads.illegal(load, "reassign")
    sent = body.model_fields_set
    service.assign(
        db, p, load, body.driver_id or assignment.driver_id, body.vehicle_id or assignment.vehicle_id,
        body.trailer_id if "trailer_id" in sent else assignment.trailer_id, reason=body.reason)
    db.commit()
    return loads.load_detail(db, p, load.id)


@router.post("/assignments/{assignment_id}/release", response_model=ls.LoadDetail)
def release(assignment_id: uuid.UUID, body: ReleaseIn, p: Principal = Depends(require("dispatch.assign")),
            db: Session = Depends(get_db)):
    """Take the driver and equipment off a load that has not been dispatched. It goes back to planned."""
    _, load = _active(db, p, assignment_id)
    loads.check_version(load, body.version)
    service.unassign(db, p, load, reason=body.reason)
    db.commit()
    return loads.load_detail(db, p, load.id)


@router.get("/seats", response_model=list[DriverSeat])
def seats(p: Principal = Depends(require("dispatch.read")), db: Session = Depends(get_db)):
    """For each active driver on the board: the truck they're seated in, the trailer it last pulled, and where it
    last reported from (and whether it's moving)."""
    from sqlalchemy import select

    from app.core import scope as team_scope
    from app.modules.drivers.models import Driver
    ids = list(db.scalars(team_scope.where(select(Driver.id).where(Driver.status == "active"),
                                           team_scope.drivers(p.scope, Driver.id))))
    found = eligibility._seats(db, None, ids, datetime.now(UTC))
    return [DriverSeat(driver_id=d, truck=s.unit_number, vehicle_id=s.vehicle_id, trailer=s.trailer_unit,
                       trailer_type=s.trailer_type, place=s.place, moving=s.moving, position_minutes=s.position_minutes)
            for d, s in found.items()]


@router.post("/assignments/{assignment_id}/undo", response_model=ls.LoadDetail)
def undo(assignment_id: uuid.UUID, body: UndoIn, p: Principal = Depends(require("dispatch.assign")),
         db: Session = Depends(get_db)):
    """Take back an assignment made a moment ago: the load goes back to planned, dispatched or not, as long as the
    truck hasn't reached the pickup. A driver who was told is told it was taken back."""
    assignment, load = _active(db, p, assignment_id)
    loads.check_version(load, body.version)
    service.undo(db, p, load, assignment)
    db.commit()
    return loads.load_detail(db, p, load.id)


@router.post("/reschedule", response_model=ls.LoadDetail)
def reschedule(body: RescheduleIn, p: Principal = Depends(require("dispatch.assign")), db: Session = Depends(get_db)):
    """Move a load's appointments by whole days. A driver already on it is checked again for the new days."""
    loads.visible(db, p, body.load_id)
    load = loads.lock_load(db, body.load_id, p)
    loads.check_version(load, body.version)
    service.reschedule(db, p, load, body.days)
    db.commit()
    return loads.load_detail(db, p, load.id)


@router.post("/best-match", response_model=BestMatchOut)
def best_match(body: BestMatchIn, p: Principal = Depends(require("dispatch.assign")), db: Session = Depends(get_db)):
    """Give each load, in pickup order, the nearest eligible driver with their truck and a free trailer. Loads no
    one can take are reported, not assigned."""
    assigned, failed = service.best_match(db, p, body.load_ids)
    db.commit()
    return BestMatchOut(assigned=[Matched(**a) for a in assigned], failed=[Unmatched(**f) for f in failed])
