"""The expirations queue: every dated compliance item across drivers and equipment, in one sorted list."""
import csv
import io
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import Date, String, Uuid, and_, case, cast, exists, false, func, literal, null, or_, select, true, union_all
from sqlalchemy.orm import Session

from app.core import scope as team_scope
from app.core.audit import audit
from app.core.crud import ListParams, like
from app.core.deps import Principal, get_db, require
from app.core.errors import Conflict, Invalid
from app.core.pagination import Page, envelope, paginate, parse_sort
from app.modules.documents.models import Document, DocumentLink
from app.modules.drivers.models import Driver, DriverQualification
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.safety import matrix, reminders
from app.modules.safety.matrix import company_files
from app.modules.safety.models import ComplianceReminder
from app.modules.safety.rules import (
    ITEM_LABELS,
    ORGANIZATION_ITEMS,
    QUALIFICATION_LABELS,
    STANDARD_FILE,
    WARN_DAYS,
    FileItem,
    lower,
)
from app.modules.safety.settings import checklist_of, settings_of

router = APIRouter(prefix="/safety", tags=["safety"])

# "equipment" means trucks and trailers together.
EntityType = Literal["driver", "vehicle", "trailer", "equipment"]
State = Literal["expired", "expiring", "missing"]
FAR = date(9999, 1, 1)
DOCUMENT_LABELS = {"license": "Licence document", "medical": "Medical document", "insurance": "Insurance document",
                   "registration": "Registration document", "inspection": "Inspection document"}


class Expiration(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    entity_label: str
    terminal_id: uuid.UUID | None
    item: str
    item_label: str
    expires_on: date | None
    state: State
    days_left: int | None = Field(description="Negative once expired. Null when nothing is on file")
    # True when this item stops the driver or unit from being dispatched once it expires.
    blocks_dispatch: bool


class ExpirationParams(ListParams):
    state: State | None = Field(default=None, description="Default: expired and expiring")
    within_days: int = Field(default=WARN_DAYS, ge=1, le=365)
    entity_type: EntityType | None = None
    terminal_id: uuid.UUID | None = None


class SafetySummary(BaseModel):
    expired: int
    expiring: int
    missing: int
    drivers_blocked: int
    units_blocked: int


def _row_id(entity_id, item: str):
    # One stable id per (record, item) pair, so the list can be paged.
    return cast(func.md5(func.concat(cast(entity_id, String), literal(":" + item))), Uuid)


def items(checklist: list[FileItem] | None = None):
    """One row per dated item, and one per item of the company's file a driver doesn't hold. Records no longer in
    service are left out, and so is a qualification record a later one renews."""
    def part(entity_type: str, entity_id, label, terminal_id, item, expires_on, blocks, row_id, source):
        item_column = literal(item) if isinstance(item, str) else item
        return select(
            row_id.label("id"), literal(entity_type).label("entity_type"), entity_id.label("entity_id"),
            label.label("entity_label"), terminal_id.label("terminal_id"), item_column.label("item"),
            expires_on.label("expires_on"), blocks.label("blocks_dispatch")).select_from(source)

    checklist = checklist if checklist is not None else list(STANDARD_FILE)
    driver_name = func.concat(Driver.first_name, literal(" "), Driver.last_name)
    in_service = Driver.status == "active"
    # The record that counts for each driver and kind: the one that runs longest.
    current = (select(DriverQualification.id)
               .distinct(DriverQualification.driver_id, DriverQualification.type)
               .order_by(DriverQualification.driver_id, DriverQualification.type,
                         DriverQualification.expires_on.desc().nulls_first()))
    blocking = [i.type for i in checklist if i.blocks]
    passing = [i.type for i in checklist if not i.blocks]
    blocks = case((DriverQualification.type.in_(blocking), true()), (DriverQualification.type.in_(passing), false()),
                  else_=DriverQualification.required) if checklist else DriverQualification.required
    null_date = cast(null(), Date)
    parts = [
        part("driver", Driver.id, driver_name, Driver.terminal_id, "cdl", Driver.cdl_expiry, literal(True),
             _row_id(Driver.id, "cdl"), Driver).where(in_service),
        part("driver", Driver.id, driver_name, Driver.terminal_id, "medical", Driver.medical_cert_expiry,
             literal(True), _row_id(Driver.id, "medical"), Driver).where(in_service),
        part("driver", Driver.id, driver_name, Driver.terminal_id, DriverQualification.type,
             DriverQualification.expires_on, blocks, DriverQualification.id,
             DriverQualification.__table__.join(Driver, Driver.id == DriverQualification.driver_id))
        .where(in_service, DriverQualification.id.in_(current), DriverQualification.expires_on.is_not(None)),
    ]
    for item in checklist:
        held = select(DriverQualification.id).where(DriverQualification.driver_id == Driver.id,
                                                    DriverQualification.type == item.type)
        parts.append(part("driver", Driver.id, driver_name, Driver.terminal_id, item.type, null_date,
                          literal(item.blocks), _row_id(Driver.id, item.type), Driver)
                     .where(in_service, ~exists(held)))
    for entity_type, model, word in (("vehicle", Vehicle, "Truck "), ("trailer", Trailer, "Trailer ")):
        name = func.concat(literal(word), model.unit_number)
        for item, column in (("insurance", model.insurance_expiry), ("registration", model.registration_expiry),
                             ("inspection", model.inspection_expiry)):
            parts.append(part(entity_type, model.id, name, model.terminal_id, item, column, literal(True),
                              _row_id(model.id, item), model).where(model.status != "retired"))
    return union_all(*parts).subquery("items")


def scoped(t, scope):
    """The items a dispatch team's dispatcher sees: its drivers' and trucks', and every trailer's."""
    drivers, trucks = team_scope.drivers(scope, t.c.entity_id), team_scope.vehicles(scope, t.c.entity_id)
    if drivers is None:
        return None
    return or_(t.c.entity_type == "trailer", and_(t.c.entity_type == "driver", drivers),
               and_(t.c.entity_type == "vehicle", trucks))


def _state(expires_on: date | None, today: date) -> tuple[State, int | None]:
    if expires_on is None:
        return "missing", None
    days = (expires_on - today).days
    return ("expired" if days < 0 else "expiring"), days


@router.get("/expirations", response_model=Page[Expiration])
def expirations(params: Annotated[ExpirationParams, Query()], p: Principal = Depends(require("safety.read")),
                db: Session = Depends(get_db)):
    """What has expired, what is about to, and what has no date on file."""
    today = p.today()
    horizon = today + timedelta(days=params.within_days)
    t = items(checklist_of(db))
    stmt = team_scope.where(select(t), scoped(t, p.scope))
    if params.state == "expired":
        stmt = stmt.where(t.c.expires_on < today)
    elif params.state == "expiring":
        stmt = stmt.where(t.c.expires_on >= today, t.c.expires_on <= horizon)
    elif params.state == "missing":
        stmt = stmt.where(t.c.expires_on.is_(None))
    else:
        stmt = stmt.where(t.c.expires_on <= horizon)
    if params.entity_type == "equipment":
        stmt = stmt.where(t.c.entity_type != "driver")
    elif params.entity_type:
        stmt = stmt.where(t.c.entity_type == params.entity_type)
    if params.terminal_id:
        stmt = stmt.where(t.c.terminal_id == params.terminal_id)
    if params.q:
        stmt = stmt.where(t.c.entity_label.ilike(like(params.q.strip())))
    sortable = {"expires_on": func.coalesce(t.c.expires_on, literal(FAR)), "entity": t.c.entity_label}
    rows, info = paginate(db, stmt, parse_sort(params.sort, sortable, "expires_on"), t.c.id, cursor=params.cursor,
                          limit=params.limit, count=params.count)
    names = [c.key for c in t.c]
    out = []
    for values in rows:
        row = dict(zip(names, values, strict=True))
        state, days = _state(row["expires_on"], today)
        out.append(Expiration(**row, item_label=ITEM_LABELS.get(row["item"], row["item"]), state=state,
                              days_left=days))
    return envelope(out, info)


def summary_counts(db: Session, today: date, scope=None) -> SafetySummary:
    t = items(checklist_of(db))
    horizon = today + timedelta(days=WARN_DAYS)
    expired = t.c.expires_on < today
    # A driver is kept off loads by a blocking item run out or missing; a unit only by one run out.
    driver_blocked = t.c.blocks_dispatch & (expired | t.c.expires_on.is_(None))
    row = db.execute(select(
        func.count().filter(expired),
        func.count().filter(t.c.expires_on >= today, t.c.expires_on <= horizon),
        func.count().filter(t.c.expires_on.is_(None)),
        func.count(func.distinct(t.c.entity_id)).filter(driver_blocked, t.c.entity_type == "driver"),
        func.count(func.distinct(t.c.entity_id)).filter(expired & t.c.blocks_dispatch, t.c.entity_type != "driver"),
    ).select_from(t).where(scoped(t, scope) if scope is not None else t.c.entity_id.is_not(None))).one()
    company = _company(db, today)
    return SafetySummary(expired=row[0] + len(company["expired"]), expiring=row[1] + len(company["expiring"]),
                         missing=row[2] + len(company["missing"]), drivers_blocked=row[3], units_blocked=row[4])


def _company(db: Session, today: date) -> dict[str, list[str]]:
    """The company's own file, item by item: what has run out, runs out soon, or isn't on file."""
    files = company_files(db)
    out: dict[str, list[str]] = {"expired": [], "expiring": [], "missing": []}
    for item, label in ORGANIZATION_ITEMS.items():
        doc = files.get(item)
        if doc is None or doc.review_status == "pending":
            out["missing"].append(label)
        elif doc.expires_on and doc.expires_on < today:
            out["expired"].append(label)
        elif doc.expires_on and doc.expires_on <= today + timedelta(days=WARN_DAYS):
            out["expiring"].append(label)
    return out


class SafetyOverview(SafetySummary):
    """The summary with what the compliance page names: the first thing run out, who is running out, what is
    missing, how many drivers are fully qualified, and how many records each tab holds."""
    expired_first: str | None
    expiring_drivers: int
    expiring_trucks: int
    expiring_trailers: int
    expiring_company: int
    missing_items: list[str]
    drivers_active: int
    drivers_qualified: int
    tabs: dict[str, int] = Field(description="Records on each tab: driver, vehicle, trailer, organization")


@router.get("/summary", response_model=SafetyOverview)
def summary(p: Principal = Depends(require("safety.read")), db: Session = Depends(get_db)):
    reminders.catch_up(db, p)
    db.commit()
    today = p.today()
    base = summary_counts(db, today, p.scope)
    t = items(checklist_of(db))
    seen = scoped(t, p.scope) if p.scope is not None else t.c.entity_id.is_not(None)
    company = _company(db, today)
    first = db.execute(select(t.c.entity_label, t.c.item).where(seen, t.c.expires_on < today)
                       .order_by(t.c.expires_on, t.c.entity_label).limit(1)).first()
    expired_first = (f"{first.entity_label} · {lower(ITEM_LABELS.get(first.item, first.item))}" if first
                     else f"Company · {lower(company['expired'][0])}" if company["expired"] else None)
    soon = and_(t.c.expires_on >= today, t.c.expires_on <= today + timedelta(days=WARN_DAYS))
    by_type = dict(db.execute(select(t.c.entity_type, func.count(func.distinct(t.c.entity_id)))
                              .where(seen, soon).group_by(t.c.entity_type)).all())
    gaps = db.execute(select(t.c.item, func.count()).where(seen, t.c.expires_on.is_(None))
                      .group_by(t.c.item).order_by(func.count().desc(), t.c.item)).all()
    drivers = matrix.drivers(db, p)
    trucks = select(func.count()).select_from(Vehicle).where(Vehicle.status != "retired")
    in_team = team_scope.vehicles(p.scope, Vehicle.id)
    if in_team is not None:
        trucks = trucks.where(in_team)
    return SafetyOverview(
        **base.model_dump(), expired_first=expired_first, expiring_drivers=by_type.get("driver", 0),
        expiring_trucks=by_type.get("vehicle", 0), expiring_trailers=by_type.get("trailer", 0),
        expiring_company=len(company["expiring"]),
        missing_items=[lower(ITEM_LABELS.get(item, item)) for item, _ in gaps] + [lower(x) for x in company["missing"]],
        drivers_active=len(drivers.rows), drivers_qualified=sum(r.verdict == "qualified" for r in drivers.rows),
        tabs={"driver": len(drivers.rows), "vehicle": db.scalar(trucks) or 0,
              "trailer": db.scalar(select(func.count()).select_from(Trailer).where(Trailer.status != "retired")) or 0,
              "organization": len(ORGANIZATION_ITEMS)})


@router.get("/matrix", response_model=matrix.ComplianceMatrix)
def compliance_matrix(entity: matrix.Entity = "driver", q: str | None = Query(default=None, max_length=80),
                      p: Principal = Depends(require("safety.read")), db: Session = Depends(get_db)):
    """Each driver, truck or trailer with every item of their file, or the company's own documents."""
    return matrix.build(db, p, entity, q)


EXPORT_NAMES = {"driver": "drivers", "vehicle": "trucks", "trailer": "trailers", "organization": "company"}
STATE_WORDS = {"valid": "Valid", "expiring": "Expiring", "expired": "Expired", "missing": "Missing"}
VERDICT_WORDS = {"expired": "Expired", "missing": "Missing", "lapsed": "Expired (allowed)",
                 "incomplete": "Incomplete", "expiring": "Expiring", "review": "In review", "qualified": "Qualified",
                 "inactive": "Not in service"}


@router.get("/matrix.csv")
def export_matrix(entity: matrix.Entity = "driver", p: Principal = Depends(require("safety.read")),
                  db: Session = Depends(get_db)):
    """The matrix as a spreadsheet: one row per record, the date and state of each item."""
    m = matrix.build(db, p, entity)
    out = io.StringIO()
    w = csv.writer(out)
    first = {"driver": "Driver", "vehicle": "Truck", "trailer": "Trailer", "organization": "Document"}[entity]
    if entity == "organization":
        w.writerow([first, "File", "Expires", "State", "Review", "Status"])
        for r in m.rows:
            c = r.cells[0]
            w.writerow([r.name, r.document.filename if r.document else "", c.expires_on or "", STATE_WORDS[c.state],
                        "In review" if c.in_review else (r.document.review_status.replace("_", " ") if r.document else ""),
                        VERDICT_WORDS[r.verdict]])
    else:
        w.writerow([first, *[x for col in m.columns for x in (col.label, f"{col.label} state")], "Dispatchable", "Status"])
        for r in m.rows:
            values = []
            for c in r.cells:
                values += [c.expires_on or ("On file" if c.state == "valid" else ""),
                           "In review" if c.in_review else STATE_WORDS[c.state]]
            w.writerow([r.name, *values, "Yes" if r.dispatchable else "No", VERDICT_WORDS[r.verdict]])
    audit(db, p, "compliance.exported", "organization", p.org_id, {"entity": entity, "rows": len(m.rows)})
    db.commit()
    name = f"compliance-{EXPORT_NAMES[entity]}-{p.today()}.csv"
    return Response(content=out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


class ExpiringDocument(BaseModel):
    id: uuid.UUID
    type: str
    label: str
    filename: str
    expires_on: date
    state: State
    days_left: int
    entity_type: str
    entity_id: uuid.UUID


@router.get("/expiring-documents", response_model=list[ExpiringDocument])
def expiring_documents(within_days: int = Query(default=WARN_DAYS, ge=1, le=365),
                       p: Principal = Depends(require("safety.read")), db: Session = Depends(get_db)):
    """Uploaded documents that carry their own expiry date (an insurance certificate, a permit)."""
    today = p.today()
    stmt = (select(Document, DocumentLink.entity_type, DocumentLink.entity_id)
            .join(DocumentLink, DocumentLink.document_id == Document.id)
            .where(Document.upload_status == "uploaded", Document.expires_on <= today + timedelta(days=within_days))
            .order_by(Document.expires_on, Document.id).limit(200))
    if not p.can("drivers.sensitive.read"):
        stmt = stmt.where(Document.type.notin_(("license", "medical")))
    out = []
    for doc, entity_type, entity_id in db.execute(stmt):
        state, days = _state(doc.expires_on, today)
        out.append(ExpiringDocument(
            id=doc.id, type=doc.type, label=DOCUMENT_LABELS.get(doc.type, "Document"), filename=doc.filename,
            expires_on=doc.expires_on, state=state, days_left=days, entity_type=entity_type, entity_id=entity_id))
    return out


# ---------------------------------------------------------------- reminder rules and the qualification file
FileType = Literal["mvr", "clearinghouse", "drug_test", "road_test", "employment_application", "annual_review",
                   "hazmat", "twic", "training"]


class ReminderOption(BaseModel):
    key: str
    label: str
    # Channels: whether it reaches anyone today. The others need a messaging connection in Integrations.
    connected: bool = True


class FileItemIn(BaseModel):
    type: FileType
    blocks: bool = True


class ReminderRulesIn(BaseModel):
    enabled: bool
    lead_days: list[int] = Field(min_length=1, max_length=8, description="Days before an expiry, 1 to 365")
    channels: list[Literal["app", "telegram", "sms", "email"]] = Field(min_length=1)
    copy_to: list[Literal["safety_manager", "fleet_manager"]] = Field(max_length=2)
    run_hour: int = Field(ge=0, le=23)
    checklist: list[FileItemIn] = Field(max_length=9)
    version: int


class ReminderRules(BaseModel):
    enabled: bool
    lead_days: list[int]
    channels: list[str]
    copy_to: list[str]
    run_hour: int
    checklist: list[FileItem]
    version: int
    next_run_at: datetime | None
    last_run_at: datetime | None
    sent_week: int
    failed_week: int
    channel_options: list[ReminderOption]
    copy_options: list[ReminderOption]
    item_options: list[ReminderOption]


class ReminderSent(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    entity_label: str
    item: str
    item_label: str
    expires_on: date
    lead_days: int
    sent_at: datetime
    failed: bool
    deliveries: list[dict]


def _rules(db: Session, p: Principal) -> ReminderRules:
    row = settings_of(db, p.org_id)
    now = datetime.now(UTC)
    sent, failed = reminders.week_counts(db, p, now)
    return ReminderRules(
        enabled=row.reminders_enabled, lead_days=sorted(row.lead_days, reverse=True), channels=row.channels,
        copy_to=row.copy_to, run_hour=row.run_hour, checklist=[FileItem(**i) for i in row.checklist],
        version=row.version, next_run_at=reminders.next_run(row, p, now) if row.reminders_enabled else None,
        last_run_at=row.last_run_at, sent_week=sent, failed_week=failed,
        channel_options=[ReminderOption(key=k, label=v, connected=k in reminders.CONNECTED)
                         for k, v in reminders.CHANNELS.items()],
        copy_options=[ReminderOption(key=k, label=v) for k, v in reminders.COPY_TO.items()],
        item_options=[ReminderOption(key=k, label=QUALIFICATION_LABELS[k]) for k in FileType.__args__])


@router.get("/reminders", response_model=ReminderRules)
def reminder_rules(p: Principal = Depends(require("safety.read")), db: Session = Depends(get_db)):
    """The company's reminder rules and qualification file, when reminders next go out and how many went this week."""
    reminders.catch_up(db, p)
    out = _rules(db, p)
    db.commit()
    return out


@router.put("/reminders", response_model=ReminderRules)
def save_reminder_rules(body: ReminderRulesIn, p: Principal = Depends(require("safety.manage")),
                        db: Session = Depends(get_db)):
    """Change the rules. The qualification file decides at once who can be dispatched."""
    row = settings_of(db, p.org_id)
    if body.version != row.version:
        raise Conflict("Someone else changed these rules. Reload to see their version.", code="VERSION_CONFLICT")
    if any(d < 1 or d > 365 for d in body.lead_days):
        raise Invalid("Lead times run from 1 to 365 days", field="lead_days")
    types = [i.type for i in body.checklist]
    if len(set(types)) != len(types):
        raise Invalid("Each item can be in the file once", field="checklist")
    before = {"enabled": row.reminders_enabled, "lead_days": row.lead_days, "channels": row.channels,
              "copy_to": row.copy_to, "run_hour": row.run_hour, "checklist": row.checklist}
    row.reminders_enabled = body.enabled
    row.lead_days = sorted(set(body.lead_days), reverse=True)
    row.channels = list(dict.fromkeys(body.channels))
    row.copy_to = list(dict.fromkeys(body.copy_to))
    row.run_hour = body.run_hour
    row.checklist = [i.model_dump() for i in body.checklist]
    row.updated_by = p.user_id
    row.version += 1
    after = {"enabled": row.reminders_enabled, "lead_days": row.lead_days, "channels": row.channels,
             "copy_to": row.copy_to, "run_hour": row.run_hour, "checklist": row.checklist}
    audit(db, p, "compliance.rules_updated", "organization", p.org_id,
          {k: {"from": before[k], "to": after[k]} for k in after if before[k] != after[k]})
    db.commit()
    return _rules(db, p)


@router.get("/reminders/sent", response_model=list[ReminderSent])
def reminders_sent(limit: int = Query(default=20, ge=1, le=100), p: Principal = Depends(require("safety.read")),
                   db: Session = Depends(get_db)):
    """The latest reminders, newest first."""
    rows = db.scalars(select(ComplianceReminder).order_by(ComplianceReminder.sent_at.desc(), ComplianceReminder.id)
                      .limit(limit))
    return [ReminderSent(id=r.id, entity_type=r.entity_type, entity_id=r.entity_id, entity_label=r.entity_label,
                         item=r.item, item_label=ORGANIZATION_ITEMS.get(r.item) if r.entity_type == "organization"
                         else ITEM_LABELS.get(r.item, r.item), expires_on=r.expires_on, lead_days=r.lead_days,
                         sent_at=r.sent_at, failed=r.failed, deliveries=r.deliveries) for r in rows]
