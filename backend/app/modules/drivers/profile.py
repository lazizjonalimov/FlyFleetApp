"""What a driver's profile shows beyond the record: the qualification file item by item (where each date came from,
the reminders sent, what can be done about it), the last 30 days, where the truck was last seen; asking the
driver for a document; and revealing their sensitive details, which is logged."""
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import places
from app.core import scope as team_scope
from app.core.audit import audit
from app.core.deps import Principal, get_db, require
from app.core.errors import Invalid, NotFound
from app.core.states import ALL
from app.modules.dispatch.eligibility import qualifications_by_driver
from app.modules.dispatch.models import DispatchAssignment
from app.modules.documents.models import Document, DocumentLink
from app.modules.drivers.models import Driver
from app.modules.fleet.models import UnitAssignment
from app.modules.loads.models import Load, LoadStop
from app.modules.organizations.models import Membership, User
from app.modules.people.models import Person
from app.modules.safety.matrix import CellState, cell
from app.modules.safety.models import ComplianceReminder
from app.modules.safety.rules import QUALIFICATION_LABELS, RENEWED_BY, driver_issues, latest, lower
from app.modules.safety.settings import checklist_of

router = APIRouter(prefix="/drivers", tags=["drivers"])

# How the file names each item in full, and in short where space is tight.
FULL = {"cdl": "CDL", "medical": "Medical certificate", "mvr": "MVR — annual review",
        "clearinghouse": "Drug & alcohol clearinghouse query", "road_test": "Road test certificate",
        "drug_test": "Pre-employment drug test"}
SHORT = {"cdl": "CDL", "medical": "Medical card", "mvr": "MVR review", "clearinghouse": "Clearinghouse",
         "road_test": "Road test", "drug_test": "Drug test"}
DOC_FOR = {item: doc for doc, item in RENEWED_BY["driver"].items()}
SOURCE = {"driver app": "Driver app scan", "web": "Upload", "system": "Added by FlyFleet"}
CHANNELS = {"app": "the app", "telegram": "Telegram", "sms": "SMS", "email": "email", "task": "task"}
LIVE = ("assigned", "dispatched", "at_pickup", "in_transit", "at_delivery", "on_hold")


class Reminder(BaseModel):
    sent_at: datetime
    reached: list[str]
    failed: bool


class FileRow(BaseModel):
    item: str
    label: str
    short: str
    sub: str
    state: CellState
    expires_on: date | None
    days_left: int | None
    in_review: bool
    review_document_id: uuid.UUID | None
    # The approved document behind the date, to open.
    document_id: uuid.UUID | None
    source: str
    # Missing or run out, it keeps the driver off loads.
    blocks: bool
    # The qualification record, for items kept as records (not the CDL or medical card on the driver).
    record_id: uuid.UUID | None
    reminders: list[Reminder]


class DriverFile(BaseModel):
    rows: list[FileRow]
    dispatchable: bool


class Position(BaseModel):
    place: str
    recorded_at: datetime
    source: str
    unit_number: str


class DriverOverview(BaseModel):
    loads: int
    on_time_pct: int | None
    miles: int
    speeding: int
    position: Position | None


class DocumentRequestIn(BaseModel):
    item: str


class DocumentRequestOut(BaseModel):
    item: str
    sent: bool
    reached: list[str]
    conversation_id: uuid.UUID


class Revealed(BaseModel):
    cdl_number: str | None
    date_of_birth: date | None
    pay_type: str | None
    pay_rate: Decimal | None


def _driver(db: Session, p: Principal, driver_id: uuid.UUID) -> Driver:
    stmt = select(Driver).where(Driver.id == driver_id)
    seen = team_scope.drivers(p.scope, Driver.id)
    driver = db.scalar(stmt.where(seen) if seen is not None else stmt)
    if driver is None:
        raise NotFound("Driver not found")
    return driver


def _when(d: datetime, zone: str) -> str:
    from zoneinfo import ZoneInfo
    local = d.astimezone(ZoneInfo(zone))
    return f"{local:%b} {local.day}"


def _sent(reminders: list[ComplianceReminder], zone: str) -> str:
    """ "Reminders sent Nov 6 and Nov 12 via Telegram", or what didn't reach them."""
    if not reminders:
        return ""
    days = [_when(r.sent_at, zone) for r in reminders]
    reached = sorted({CHANNELS.get(d["channel"], d["channel"]) for r in reminders for d in r.deliveries
                      if d.get("to") == "driver" and d.get("status") != "not_sent"})
    said = days[0] if len(days) == 1 else f"{', '.join(days[:-1])} and {days[-1]}"
    word = "Reminder" if len(days) == 1 else "Reminders"
    if reached:
        return f"{word} sent {said} via {' and '.join(reached)}"
    return f"{word} {said} didn’t reach the driver"


@router.get("/{driver_id}/file", response_model=DriverFile)
def driver_file(driver_id: uuid.UUID, p: Principal = Depends(require("drivers.read")), db: Session = Depends(get_db)):
    """The qualification file, item by item, as the rules see it."""
    d = _driver(db, p, driver_id)
    today = p.today()
    checklist = checklist_of(db)
    quals = qualifications_by_driver(db, [d.id]).get(d.id, [])
    current = latest(quals)
    docs = list(db.execute(
        select(Document).join(DocumentLink, DocumentLink.document_id == Document.id)
        .where(DocumentLink.entity_type == "driver", DocumentLink.entity_id == d.id, Document.upload_status == "uploaded",
               Document.type.in_(list(RENEWED_BY["driver"])))
        .order_by(Document.created_at.desc())).scalars())
    reviewers = {x.reviewed_by for x in docs if x.reviewed_by}
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_(reviewers))).all()) if reviewers else {}
    from app.modules.intake.models import DocumentRead
    confidence: dict[uuid.UUID, int] = {}
    if docs:
        for read in db.scalars(select(DocumentRead).where(DocumentRead.document_id.in_([x.id for x in docs]),
                                                          DocumentRead.status == "done")):
            sure = [float(f["confidence"]) for f in read.fields or [] if isinstance(f.get("confidence"), int | float)]
            if sure:
                confidence[read.document_id] = round(100 * sum(sure) / len(sure))
    uploaders = {x.uploaded_by for x in docs if x.uploaded_by}
    from_app = set(db.scalars(select(Membership.user_id).where(Membership.role == "driver",
                                                               Membership.user_id.in_(uploaders)))) if uploaders else set()
    sent = list(db.scalars(select(ComplianceReminder).where(ComplianceReminder.entity_type == "driver",
                                                            ComplianceReminder.entity_id == d.id)
                           .order_by(ComplianceReminder.sent_at)))
    blocks_of = {i.type: i.blocks for i in checklist}

    def row(item: str, expires: date | None, held: bool, *, sub: str = "", record=None, blocks: bool = True) -> FileRow:
        c = cell(item, expires, today, held=held, blocks=blocks)
        kind = DOC_FOR.get(item)
        pending = next((x for x in docs if x.type == kind and x.review_status == "pending"), None) if kind else None
        approved = next((x for x in docs if x.type == kind and x.review_status == "approved"
                         and (expires is None or x.expires_on is None or x.expires_on == expires)), None) if kind else None
        if approved is not None:
            source = " · ".join(filter(None, [
                SOURCE["driver app" if approved.uploaded_by in from_app else "web" if approved.uploaded_by else "system"],
                f"OCR {confidence[approved.id]}%" if approved.id in confidence else "",
                f"reviewed by {names[approved.reviewed_by]}" if approved.reviewed_by in names else "reviewed"]))
        elif not held:
            source = "—"
        elif record is None:
            source = "Entered on the driver record"
        else:
            since = record.issued_on or record.created_at.date()
            source = f"Entered by hand · on file since {since:%b} {since.day}, {since.year}"
        reminders = [r for r in sent if r.item == item and r.expires_on == expires] if expires else []
        return FileRow(
            item=item, label=FULL.get(item) or QUALIFICATION_LABELS.get(item, item), short=SHORT.get(item) or
            QUALIFICATION_LABELS.get(item, item), sub=sub or _sent(reminders, p.timezone), state=c.state,
            expires_on=expires, days_left=c.days_left, in_review=pending is not None,
            review_document_id=pending.id if pending else None, document_id=approved.id if approved else None,
            source=source, blocks=blocks, record_id=record.id if record is not None else None,
            reminders=[Reminder(sent_at=r.sent_at, failed=r.failed,
                                reached=[d["channel"] for d in r.deliveries if d.get("status") != "not_sent"])
                       for r in reminders])

    endorsements = ", ".join(x.strip() for x in (d.endorsements or "").split(",") if x.strip()) or "none"
    state = ALL.get((d.cdl_state or "").upper(), d.cdl_state or "") if d.cdl_state else ""
    rows = [row("cdl", d.cdl_expiry, d.cdl_expiry is not None,
                sub=" · ".join(filter(None, [state, f"endorsements: {endorsements}"]))),
            row("medical", d.medical_cert_expiry, d.medical_cert_expiry is not None)]
    rows[0].label = f"CDL — Class {d.cdl_class}" if d.cdl_class else "CDL"
    for item in checklist:
        record = current.get(item.type)
        rows.append(row(item.type, record.expires_on if record else None, record is not None, record=record,
                        blocks=item.blocks))
    for kind, record in current.items():
        if kind not in blocks_of:
            rows.append(row(kind, record.expires_on, True, record=record, blocks=record.required,
                            sub=" · ".join(filter(None, ["Required" if record.required else "", record.reference]))))
    blocking = any(i.severity == "blocking" for i in driver_issues(d, quals, today, checklist))
    return DriverFile(rows=rows, dispatchable=not blocking and d.status == "active")


@router.get("/{driver_id}/overview", response_model=DriverOverview)
def driver_overview(driver_id: uuid.UUID, p: Principal = Depends(require("drivers.read")),
                    db: Session = Depends(get_db)):
    """The last 30 days, and where the driver's truck was last seen."""
    from app.modules.tracking import incidents
    from app.modules.tracking.models import Incident
    d = _driver(db, p, driver_id)
    now = datetime.now(UTC)
    since = now - timedelta(days=30)
    last = (select(LoadStop.load_id, LoadStop.arrived_at, func.coalesce(LoadStop.appt_end, LoadStop.appt_start).label("due"))
            .distinct(LoadStop.load_id).order_by(LoadStop.load_id, LoadStop.seq.desc()).subquery())
    row = db.execute(
        select(func.count(), func.coalesce(func.sum(Load.miles), 0),
               func.count().filter(last.c.due.is_not(None), last.c.arrived_at.is_not(None)),
               func.count().filter(last.c.arrived_at <= last.c.due))
        .select_from(Load)
        .join(DispatchAssignment, (DispatchAssignment.load_id == Load.id)
              & DispatchAssignment.status.in_(("active", "completed")))
        .outerjoin(last, last.c.load_id == Load.id)
        .where(DispatchAssignment.driver_id == d.id, Load.status.in_(("delivered", "completed", "invoiced", "paid")),
               Load.delivered_at >= since)).one()
    speeding = db.scalar(select(func.count()).select_from(Incident).where(
        Incident.driver_id == d.id, Incident.kind.in_(("speeding", "yard_speed")), Incident.detected_at >= since)) or 0
    # The truck the driver is on: the one hauling their current load, or the one they are seated in.
    truck = db.scalar(select(DispatchAssignment.vehicle_id).join(Load, Load.id == DispatchAssignment.load_id)
                      .where(DispatchAssignment.driver_id == d.id, DispatchAssignment.status == "active",
                             Load.status.in_(LIVE)).limit(1)) \
        or db.scalar(select(UnitAssignment.vehicle_id).where(UnitAssignment.effective_to.is_(None),
                                                             (UnitAssignment.driver_id == d.id)
                                                             | (UnitAssignment.co_driver_id == d.id)).limit(1))
    position = None
    if truck is not None:
        from app.modules.equipment.models import Vehicle as V
        pos = incidents.latest_positions(db, [truck]).get(truck)
        if pos is not None:
            position = Position(place=places.describe(float(pos.lat), float(pos.lon), pos.heading, True),
                                recorded_at=pos.recorded_at, source=pos.source,
                                unit_number=db.scalar(select(V.unit_number).where(V.id == truck)) or "")
    count, miles, judged, on_time = row
    return DriverOverview(loads=count, miles=int(miles), on_time_pct=round(100 * on_time / judged) if judged else None,
                          speeding=speeding, position=position)


@router.post("/{driver_id}/document-requests", response_model=DocumentRequestOut)
def request_document(driver_id: uuid.UUID, body: DocumentRequestIn,
                     p: Principal = Depends(require("safety.manage", "drivers.manage")), db: Session = Depends(get_db)):
    """Ask the driver for a document of their file. Sent in their conversation, and by the app when they are on it."""
    from app.modules.messaging.service import driver_conversation, reached, tell_driver
    d = _driver(db, p, driver_id)
    label = FULL.get(body.item) or QUALIFICATION_LABELS.get(body.item)
    if label is None:
        raise Invalid("That isn't an item of the qualification file", field="item")
    msg = tell_driver(db, p.org_id, d.id, event="compliance.request", title=f"Please send your {lower(label)}",
                      body=f"Please send a photo of your {lower(label)} in the app. The safety team reviews it "
                           f"before it counts.")
    audit(db, p, "driver.document_requested", "driver", d.id, {"item": body.item, "reached": reached(msg)})
    db.commit()
    return DocumentRequestOut(item=body.item, sent=bool(reached(msg)), reached=reached(msg),
                              conversation_id=driver_conversation(db, p.org_id, d.id).id)


@router.post("/{driver_id}/reveal", response_model=Revealed)
def reveal(driver_id: uuid.UUID, p: Principal = Depends(require("drivers.sensitive.read")),
           db: Session = Depends(get_db)):
    """The driver's full licence number, date of birth and pay. Every reveal is in the audit log."""
    d = _driver(db, p, driver_id)
    person = db.get(Person, d.person_id)
    audit(db, p, "driver.sensitive_revealed", "driver", d.id, {"fields": ["cdl_number", "date_of_birth", "pay"]})
    db.commit()
    return Revealed(cdl_number=d.cdl_number,
                    date_of_birth=date.fromisoformat(person.date_of_birth) if person and person.date_of_birth else None,
                    pay_type=d.pay_type, pay_rate=d.pay_rate)

