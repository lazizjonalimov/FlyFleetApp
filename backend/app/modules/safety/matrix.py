"""The compliance matrix: every active driver, truck and trailer with each item of their file, and the company's own
documents. Each cell says whether the item is good, about to run out, run out or missing, and whether a
replacement is waiting for a reviewer. The row's verdict comes from the same rules dispatch uses."""
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import scope as team_scope
from app.core.deps import Principal
from app.modules.dispatch.eligibility import qualifications_by_driver
from app.modules.documents.models import Document, DocumentLink
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.organizations.models import User
from app.modules.safety.rules import (
    ITEM_LABELS,
    ORGANIZATION_ITEMS,
    QUALIFICATION_LABELS,
    RENEWED_BY,
    WARN_DAYS,
    FileItem,
    driver_issues,
    latest,
    unit_issues,
)
from app.modules.safety.settings import checklist_of

Entity = Literal["driver", "vehicle", "trailer", "organization"]
CellState = Literal["valid", "expiring", "expired", "missing"]
# expired / missing: blocks dispatch. lapsed / incomplete: run out or missing, but the company lets it pass.
Verdict = Literal["expired", "missing", "lapsed", "incomplete", "expiring", "review", "qualified", "inactive"]
UNIT_ITEMS = ("registration", "insurance", "inspection")


class ComplianceColumn(BaseModel):
    key: str
    label: str


class ComplianceCell(BaseModel):
    item: str
    state: CellState
    expires_on: date | None = None
    days_left: int | None = None
    # A replacement is waiting for a reviewer; the item itself keeps its state until one approves it.
    in_review: bool = False
    review_document_id: uuid.UUID | None = None
    # Missing or run out, this item keeps the driver or unit off loads.
    blocks: bool = True


class FiledDocument(BaseModel):
    id: uuid.UUID
    filename: str
    created_at: datetime
    review_status: str
    reviewed_by_name: str | None = None
    reviewed_at: datetime | None = None


class ComplianceRow(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    cells: list[ComplianceCell]
    verdict: Verdict
    dispatchable: bool
    # Company documents: the one on file for the item.
    document: FiledDocument | None = None


class ComplianceMatrix(BaseModel):
    entity: Entity
    columns: list[ComplianceColumn]
    rows: list[ComplianceRow]


def cell(item: str, expires_on: date | None, today: date, *, held: bool | None = None, blocks: bool = True) -> ComplianceCell:
    """`held` is for items that need not carry a date: on file is enough."""
    if expires_on is None:
        return ComplianceCell(item=item, state="valid" if held else "missing", blocks=blocks)
    days = (expires_on - today).days
    state: CellState = "expired" if days < 0 else "expiring" if days <= WARN_DAYS else "valid"
    return ComplianceCell(item=item, state=state, expires_on=expires_on, days_left=days, blocks=blocks)


def _pending(db: Session, entity_type: str, ids: list[uuid.UUID]) -> dict[tuple[uuid.UUID, str], uuid.UUID]:
    """Replacements waiting for a reviewer, by record and item."""
    if not ids:
        return {}
    renews = RENEWED_BY[entity_type]
    out: dict[tuple[uuid.UUID, str], uuid.UUID] = {}
    for entity_id, doc_type, doc_id in db.execute(
            select(DocumentLink.entity_id, Document.type, Document.id)
            .join(Document, Document.id == DocumentLink.document_id)
            .where(DocumentLink.entity_type == entity_type, DocumentLink.entity_id.in_(ids),
                   Document.upload_status == "uploaded", Document.review_status == "pending",
                   Document.type.in_(list(renews)))
            .order_by(Document.created_at)):
        out.setdefault((entity_id, renews[doc_type]), doc_id)
    return out


def _verdict(issues, cells: list[ComplianceCell]) -> tuple[Verdict, bool]:
    blocking = [i for i in issues if i.severity == "blocking"]
    if blocking:
        return ("expired" if any(i.code.endswith("_EXPIRED") for i in blocking) else "missing"), False
    warnings = [i for i in issues if i.severity == "warning"]
    if any(i.code.endswith("_EXPIRED") for i in warnings):
        return "lapsed", True
    if any(i.code.endswith("_MISSING") for i in warnings):
        return "incomplete", True
    reviewing = {c.item for c in cells if c.in_review}
    # Running out soon, with no replacement sent: the driver or the office has to act. Sent: the reviewer has.
    expiring = {_item(i.code) for i in warnings} | {c.item for c in cells if c.state == "expiring"}
    if expiring - reviewing:
        return "expiring", True
    if reviewing:
        return "review", True
    return "qualified", True


def _item(code: str) -> str:
    """ "QUALIFICATION_DRUG_TEST_EXPIRING" -> "drug_test", "MEDICAL_EXPIRING" -> "medical"."""
    return code.rsplit("_", 1)[0].removeprefix("QUALIFICATION_").lower()


# Column headings are short: the matrix is narrow.
SHORT = {"clearinghouse": "Clearinghouse", "employment_application": "Application", "hazmat": "Hazmat"}


def driver_columns(checklist: list[FileItem]) -> list[ComplianceColumn]:
    return [ComplianceColumn(key="cdl", label="CDL"), ComplianceColumn(key="medical", label="Medical card"),
            *[ComplianceColumn(key=i.type, label=SHORT.get(i.type) or QUALIFICATION_LABELS.get(i.type, i.type))
              for i in checklist]]


def drivers(db: Session, p: Principal, *, q: str | None = None) -> ComplianceMatrix:
    today = p.today()
    checklist = checklist_of(db)
    stmt = select(Driver).where(Driver.status == "active")
    seen = team_scope.drivers(p.scope, Driver.id)
    if seen is not None:
        stmt = stmt.where(seen)
    if q:
        stmt = stmt.where((Driver.first_name + " " + Driver.last_name).ilike(f"%{q.strip()}%"))
    found = list(db.scalars(stmt.order_by(Driver.first_name, Driver.last_name, Driver.id).limit(500)))
    ids = [d.id for d in found]
    quals = qualifications_by_driver(db, ids)
    waiting = _pending(db, "driver", ids)
    rows = []
    for d in found:
        current = latest(quals.get(d.id, []))
        cells = [cell("cdl", d.cdl_expiry, today), cell("medical", d.medical_cert_expiry, today)]
        for item in checklist:
            record = current.get(item.type)
            cells.append(cell(item.type, record.expires_on if record else None, today, held=record is not None,
                              blocks=item.blocks))
        for c in cells:
            doc = waiting.get((d.id, c.item))
            c.in_review, c.review_document_id = doc is not None, doc
        verdict, dispatchable = _verdict(driver_issues(d, quals.get(d.id, []), today, checklist), cells)
        rows.append(ComplianceRow(id=d.id, name=f"{d.first_name} {d.last_name}", status=d.status, cells=cells,
                              verdict=verdict, dispatchable=dispatchable))
    return ComplianceMatrix(entity="driver", columns=driver_columns(checklist), rows=rows)


def units(db: Session, p: Principal, entity: Literal["vehicle", "trailer"], *, q: str | None = None) -> ComplianceMatrix:
    today = p.today()
    model = Vehicle if entity == "vehicle" else Trailer
    stmt = select(model).where(model.status != "retired")
    if entity == "vehicle":
        seen = team_scope.vehicles(p.scope, Vehicle.id)
        if seen is not None:
            stmt = stmt.where(seen)
    if q:
        stmt = stmt.where(model.unit_number.ilike(f"%{q.strip()}%"))
    found = list(db.scalars(stmt.order_by(model.unit_number, model.id).limit(500)))
    waiting = _pending(db, entity, [u.id for u in found])
    rows = []
    for u in found:
        cells = [cell(item, getattr(u, f"{item}_expiry"), today, blocks=False) for item in UNIT_ITEMS]
        for c in cells:
            doc = waiting.get((u.id, c.item))
            c.in_review, c.review_document_id = doc is not None, doc
        if u.status != "active":
            verdict, dispatchable = "inactive", False
        else:
            # A unit with nothing on file may still run; an expired item stops it.
            issues = unit_issues(u, today)
            for c in cells:
                c.blocks = c.state == "expired"
            verdict, dispatchable = _verdict(issues, cells)
            if verdict == "qualified" and any(c.state == "missing" for c in cells):
                verdict = "incomplete"
        rows.append(ComplianceRow(id=u.id, name=u.unit_number, status=u.status, cells=cells, verdict=verdict,
                              dispatchable=dispatchable))
    columns = [ComplianceColumn(key=item, label=ITEM_LABELS[item]) for item in UNIT_ITEMS]
    return ComplianceMatrix(entity=entity, columns=columns, rows=rows)


def company_files(db: Session) -> dict[str, Document]:
    """The document that stands for each item of the company's own file: the newest one not rejected."""
    out: dict[str, Document] = {}
    for doc in db.scalars(
            select(Document).join(DocumentLink, DocumentLink.document_id == Document.id)
            .where(DocumentLink.entity_type == "organization", Document.upload_status == "uploaded",
                   Document.review_status != "rejected", Document.type.in_(list(ORGANIZATION_ITEMS)))
            .order_by(Document.created_at.desc())):
        held = out.get(doc.type)
        # An approved document counts over a newer one still waiting for a reviewer.
        if held is None or (held.review_status == "pending" and doc.review_status != "pending"):
            out[doc.type] = doc
    return out


def organization(db: Session, p: Principal) -> ComplianceMatrix:
    today = p.today()
    files = company_files(db)
    people = {d.reviewed_by for d in files.values() if d.reviewed_by}
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_(people))).all()) if people else {}
    rows = []
    for item, label in ORGANIZATION_ITEMS.items():
        doc = files.get(item)
        approved = doc is not None and doc.review_status != "pending"
        c = cell(item, doc.expires_on if approved else None, today, held=approved, blocks=False)
        waiting = doc is not None and doc.review_status == "pending"
        c.in_review, c.review_document_id = waiting, doc.id if waiting else None
        verdict: Verdict = ("lapsed" if c.state == "expired" else "review" if waiting
                            else "incomplete" if c.state == "missing" else "expiring" if c.state == "expiring"
                            else "qualified")
        rows.append(ComplianceRow(
            id=uuid.uuid5(p.org_id, item), name=label, status="active", cells=[c], verdict=verdict, dispatchable=True,
            document=FiledDocument(id=doc.id, filename=doc.filename, created_at=doc.created_at,
                                   review_status=doc.review_status, reviewed_by_name=names.get(doc.reviewed_by),
                                   reviewed_at=doc.reviewed_at) if doc else None))
    return ComplianceMatrix(entity="organization", columns=[ComplianceColumn(key="expires", label="Expires")], rows=rows)


def build(db: Session, p: Principal, entity: Entity, q: str | None = None) -> ComplianceMatrix:
    if entity == "driver":
        return drivers(db, p, q=q)
    if entity == "organization":
        return organization(db, p)
    return units(db, p, entity, q=q)
