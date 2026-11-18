"""Adding records from documents and spreadsheets: read an uploaded document, check what was read, keep what a
person corrected; and import drivers, trucks or trailers from a CSV or Excel file."""
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import Principal, get_db, get_or_404, require
from app.core.errors import AppError, Conflict, Forbidden
from app.modules.documents.router import _get as visible_document
from app.modules.intake import imports, service, vision
from app.modules.intake.models import DocumentRead as ReadRow
from app.modules.intake.models import Import

router = APIRouter(tags=["intake"])

ReadKind = Literal["cdl", "registration", "rate_confirmation", "pod", "inspection_report", "fuel_receipt"]
ImportKind = Literal["drivers", "trucks", "trailers", "mileage", "loads"]
# What the record made from each kind of document needs.
NEEDS = {"cdl": ("drivers.manage",), "registration": ("equipment.manage",), "rate_confirmation": ("loads.create",),
         "pod": ("loads.update",), "inspection_report": ("safety.manage", "maintenance.manage"),
         "fuel_receipt": ("expenses.manage",)}
IMPORT_NEEDS = {"drivers": ("drivers.manage",), "trucks": ("equipment.manage",), "trailers": ("equipment.manage",),
                "mileage": ("expenses.manage",), "loads": ("loads.create",)}


class ReadIn(BaseModel):
    document_id: uuid.UUID
    kind: ReadKind


class ApplyIn(BaseModel):
    entity_type: Literal["driver", "vehicle", "trailer", "load", "inspection", "expense"]
    entity_id: uuid.UUID
    # The values saved on the record, by field key: compared with what was read to keep the corrections.
    saved: dict[str, str | None] = Field(default_factory=dict)


class ReaderOut(BaseModel):
    text_pdfs: bool = True
    photos: bool


class MappingIn(BaseModel):
    mapping: dict[str, str | None]
    decisions: dict[str, Literal["update", "skip", "odometer", "miles"]] = Field(default_factory=dict)


class CommitIn(BaseModel):
    reminders: bool = True
    # Mileage: imported miles wait for someone to release them before the return can be approved.
    hold: bool = True


def _can(p: Principal, permissions: tuple[str, ...]) -> None:
    if not any(p.can(x) for x in permissions):
        raise Forbidden("Your role does not allow adding these records", details={"required": list(permissions)})


@router.get("/intake/reader", response_model=ReaderOut, summary="What can be read: text PDFs always, photos when turned on")
def reader(p: Principal = Depends(require("documents.upload"))):
    return ReaderOut(photos=vision.enabled())


@router.post("/intake/reads", response_model=service.ReadOut, status_code=201,
             summary="Read an uploaded document into the fields of a record, and check them")
def read(body: ReadIn, p: Principal = Depends(require("documents.upload")), db: Session = Depends(get_db)):
    _can(p, NEEDS[body.kind])
    doc = visible_document(db, p, body.document_id)
    row = service.read_document(db, p, doc, body.kind)
    db.commit()
    return service.present(db, p, row)


@router.get("/intake/reads/{read_id}", response_model=service.ReadOut, summary="A document read, checked again")
def get_read(read_id: uuid.UUID, p: Principal = Depends(require("documents.upload")), db: Session = Depends(get_db)):
    row = get_or_404(db, ReadRow, read_id, "Read")
    _can(p, NEEDS[row.kind])
    visible_document(db, p, row.document_id)
    return service.present(db, p, row)


@router.post("/intake/reads/{read_id}/apply", response_model=service.ReadOut,
             summary="A record was saved from this document: keep the corrections and file the document with it")
def apply(read_id: uuid.UUID, body: ApplyIn, p: Principal = Depends(require("documents.upload")),
          db: Session = Depends(get_db)):
    row = get_or_404(db, ReadRow, read_id, "Read")
    _can(p, NEEDS[row.kind])
    service.apply(db, p, row, body.entity_type, body.entity_id, body.saved)
    db.commit()
    return service.present(db, p, row)


REVIEWERS = ("safety.manage", "loads.close", "documents.upload")


class ReadAgainIn(BaseModel):
    kind: ReadKind


class FieldDecisionIn(BaseModel):
    decision: Literal["confirmed", "corrected", "unreadable"]
    value: str | None = Field(default=None, max_length=200)
    reason: str | None = Field(default=None, max_length=300)


def _latest(db: Session, document_id: uuid.UUID) -> ReadRow | None:
    return db.scalar(select(ReadRow).where(ReadRow.document_id == document_id)
                     .order_by(ReadRow.created_at.desc()).limit(1))


@router.get("/intake/documents/{document_id}/read", response_model=service.ReadOut | None,
            summary="The latest reading of a document, with its checks, for the review screen")
def document_read(document_id: uuid.UUID, p: Principal = Depends(require(*REVIEWERS)), db: Session = Depends(get_db)):
    visible_document(db, p, document_id)
    row = _latest(db, document_id)
    return service.present(db, p, row) if row is not None else None


@router.post("/intake/documents/{document_id}/read", response_model=service.ReadOut, status_code=201,
             summary="Read a document again, as the kind of document the reviewer says it is")
def read_again(document_id: uuid.UUID, body: ReadAgainIn, p: Principal = Depends(require(*REVIEWERS)),
               db: Session = Depends(get_db)):
    doc = visible_document(db, p, document_id)
    row = service.read_document(db, p, doc, body.kind)
    db.commit()
    return service.present(db, p, row)


@router.put("/intake/reads/{read_id}/fields/{key}", response_model=service.ReadOut,
            summary="A reviewer's decision on one field: confirmed as read, corrected with a reason, or unreadable")
def decide_field(read_id: uuid.UUID, key: str, body: FieldDecisionIn,
                 p: Principal = Depends(require("safety.manage", "loads.close")), db: Session = Depends(get_db)):
    row = get_or_404(db, ReadRow, read_id, "Read")
    visible_document(db, p, row.document_id)
    if row.applied_entity_id is not None:
        raise Conflict("A record was already saved from this reading", code="ALREADY_APPLIED")
    service.decide(db, p, row, key, body.decision, body.value, body.reason)
    db.commit()
    return service.present(db, p, row)


@router.post("/imports", response_model=imports.ImportOut, status_code=201,
             summary="Start an import from a CSV or Excel file: columns are matched to fields")
def start_import(kind: ImportKind = Form(...), file: UploadFile = File(...),
                 p: Principal = Depends(require("documents.upload")), db: Session = Depends(get_db)):
    _can(p, IMPORT_NEEDS[kind])
    data = file.file.read(get_settings().max_upload_bytes + 1)
    if len(data) > get_settings().max_upload_bytes:
        raise AppError("Files can be up to 15 MB", status=413, code="PAYLOAD_TOO_LARGE")
    imp = imports.create(db, p, kind, file.filename or "import.csv", data)
    db.commit()
    return imports.view(db, p, imp)


@router.get("/imports/template", responses={200: {"content": {"text/csv": {}, "application/octet-stream": {}}}},
            summary="A blank file with the columns an import reads, as CSV or Excel")
def template(kind: ImportKind, format: Literal["csv", "xlsx"] = "csv", p: Principal = Depends(require("documents.upload"))):
    _can(p, IMPORT_NEEDS[kind])
    headers = [c.label for c in imports.FIELDS[kind] if c.key != "full_name"]
    if format == "csv":
        return Response(content=("\ufeff" + ",".join(headers) + "\r\n").encode(), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="flyfleet-{kind}.csv"'})
    import io

    import openpyxl
    book = openpyxl.Workbook()
    book.active.title = kind.capitalize()
    book.active.append(headers)
    out = io.BytesIO()
    book.save(out)
    return Response(content=out.getvalue(),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="flyfleet-{kind}.xlsx"'})


@router.get("/imports/{import_id}", response_model=imports.ImportOut, summary="An import: columns, rows to look at")
def get_import(import_id: uuid.UUID, p: Principal = Depends(require("documents.upload")), db: Session = Depends(get_db)):
    imp = get_or_404(db, Import, import_id, "Import")
    _can(p, IMPORT_NEEDS[imp.kind])
    return imports.view(db, p, imp)


@router.put("/imports/{import_id}", response_model=imports.ImportOut,
            summary="Match columns to fields, and choose what to do with rows already in FlyFleet")
def map_import(import_id: uuid.UUID, body: MappingIn, p: Principal = Depends(require("documents.upload")),
               db: Session = Depends(get_db)):
    imp = get_or_404(db, Import, import_id, "Import")
    _can(p, IMPORT_NEEDS[imp.kind])
    imports.set_mapping(imp, body.mapping, body.decisions)
    db.commit()
    return imports.view(db, p, imp)


@router.post("/imports/{import_id}/commit", response_model=imports.ImportOut,
             summary="Save the rows that are ready; rows with problems are left out")
def commit_import(import_id: uuid.UUID, body: CommitIn, p: Principal = Depends(require("documents.upload")),
                  db: Session = Depends(get_db)):
    imp = get_or_404(db, Import, import_id, "Import")
    _can(p, IMPORT_NEEDS[imp.kind])
    imports.commit(db, p, imp, body.reminders, body.hold)
    db.commit()
    return imports.view(db, p, imp)
