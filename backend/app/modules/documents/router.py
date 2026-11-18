"""Documents: metadata in PostgreSQL, bytes in object storage, access decided here on every request.

Uploading follows the contract the blueprint asks for, so moving to S3 presigned URLs later changes only the
address the browser sends the file to:

    1. POST /documents/upload-intents    the API checks the request and says where to send the file
    2. PUT  <upload.url>                 the file itself
    3. POST /documents/{id}/complete     the API verifies what arrived and makes the document usable
"""
import hashlib
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.orm import Session

from app.core import scope as team_scope
from app.core.audit import audit
from app.core.config import get_settings
from app.core.crud import ListParams, like
from app.core.deps import Principal, get_db, require
from app.core.errors import AppError, Conflict, Forbidden, Invalid, NotFound
from app.core.pagination import Page, envelope, paginate, parse_sort
from app.core.storage import get_storage, make_key
from app.modules.customers.models import Customer
from app.modules.dispatch.models import DispatchAssignment
from app.modules.documents.models import Document, DocumentLink
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.expenses.models import Expense
from app.modules.finance.models import Invoice
from app.modules.loads import service as loads
from app.modules.loads.models import Load
from app.modules.maintenance.models import Inspection, WorkOrder
from app.modules.organizations.models import Membership, Organization, User
from app.modules.owners.models import Owner
from app.modules.safety.renewals import renew
from app.modules.safety.rules import WARN_DAYS

router = APIRouter(prefix="/documents", tags=["documents"])

DocumentType = Literal["bol", "pod", "rate_confirmation", "receipt", "license", "medical", "insurance",
                       "registration", "inspection", "maintenance", "invoice", "lease", "w9", "title", "cab_card",
                       "ach_authorization", "mvr", "clearinghouse", "road_test", "drug_test", "authority", "ucr",
                       "ifta_license", "other"]
EntityType = Literal["load", "driver", "vehicle", "trailer", "customer", "invoice", "work_order", "expense", "owner",
                     "inspection", "organization"]

# What a document can be attached to: the record, the permission needed to see that record, its display name.
ENTITIES = {
    "load": (Load, "loads.read", lambda x: x.load_number),
    "driver": (Driver, "drivers.read", lambda x: f"{x.first_name} {x.last_name}"),
    "vehicle": (Vehicle, "equipment.read", lambda x: f"Truck {x.unit_number}"),
    "trailer": (Trailer, "equipment.read", lambda x: f"Trailer {x.unit_number}"),
    "customer": (Customer, "customers.read", lambda x: x.name),
    "invoice": (Invoice, "invoices.read", lambda x: x.invoice_number or "Draft invoice"),
    "work_order": (WorkOrder, "maintenance.read", lambda x: f"Work order {x.number}"),
    "expense": (Expense, "expenses.read", lambda x: f"{x.category.capitalize()} expense, {x.incurred_on.isoformat()}"),
    "owner": (Owner, "owners.read", lambda x: x.legal_name or x.dba or "Owner"),
    "inspection": (Inspection, "maintenance.read",
                   lambda x: f"Inspection {x.report_number}" if x.report_number else f"Inspection, {x.inspected_on.isoformat()}"),
    "organization": (Organization, "safety.read", lambda x: x.legal_name or x.name),
}
# Scans of personal identity documents and test results: only roles that may see the numbers on them may see them.
SENSITIVE = ("license", "medical", "mvr", "clearinghouse", "drug_test")
# Carry an owner's tax ID or bank account: only roles that may see those may see the scans.
OWNER_SENSITIVE = ("w9", "ach_authorization")
# Reviewed by safety before they count. Proof of delivery is reviewed through the load instead.
COMPLIANCE = ("license", "medical", "insurance", "registration", "inspection", "mvr", "clearinghouse", "road_test",
              "drug_test", "authority", "ucr", "ifta_license")
# What a driver may add to a load they are hauling.
DRIVER_TYPES = ("pod", "bol", "receipt")

SIGNATURES = {
    "application/pdf": (b"%PDF-",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}


# Where a document is in the inbox. processing: the file is still arriving. failed: it couldn't be read, or the
# malware scan blocked it. filed: kept, nothing to decide.
DocState = Literal["needs_review", "processing", "failed", "approved", "rejected", "filed"]
# Each kind of document that can be read, by the document type it is filed as.
READ_KIND = {"license": "cdl", "registration": "registration", "rate_confirmation": "rate_confirmation", "pod": "pod",
             "inspection": "inspection_report", "receipt": "fuel_receipt"}


# ---------------------------------------------------------------- schemas
class UploadIntentIn(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(max_length=100)
    size_bytes: int = Field(gt=0)
    type: DocumentType
    # The record the document belongs to. Left out when the record is made from the document (a CDL photo that
    # becomes a driver): the document is filed with the record once it is saved.
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None
    expires_on: date | None = None


class LinkIn(BaseModel):
    entity_type: EntityType
    entity_id: uuid.UUID


class LinkOut(LinkIn):
    id: uuid.UUID
    label: str | None


class DocumentOut(BaseModel):
    id: uuid.UUID
    type: str
    filename: str
    content_type: str
    size_bytes: int
    upload_status: str
    scan_status: str
    review_status: str
    review_note: str | None
    reviewed_by_name: str | None
    reviewed_at: datetime | None
    expires_on: date | None
    in_portal: bool = False
    uploaded_by_name: str | None
    created_at: datetime
    links: list[LinkOut]
    source: Literal["driver app", "web", "system"] = Field(
        default="web", description="Where it came in: a driver's phone, the console, or FlyFleet itself")
    read_confidence: int | None = Field(default=None, description="When it was read automatically: how sure the "
                                                                  "reading was, 0-100, across the fields it found")
    pages: int | None = None
    read_status: Literal["done", "needs_reader", "failed"] | None = Field(
        default=None, description="The latest automatic reading: read, waiting for the photo reader, or unreadable")
    state: DocState = "filed"


class UploadTarget(BaseModel):
    method: Literal["PUT"] = "PUT"
    url: str = Field(description="Where to send the file. Relative URLs are relative to the API base path")
    headers: dict[str, str]


class UploadIntentOut(BaseModel):
    document: DocumentOut
    upload: UploadTarget


class DocumentPatch(BaseModel):
    filename: str | None = Field(default=None, min_length=1, max_length=255)
    expires_on: date | None = None
    in_portal: bool | None = Field(default=None, description="Whether an owner's portal users can open it")


class ReviewIn(BaseModel):
    decision: Literal["approved", "rejected"]
    note: str | None = Field(default=None, max_length=500)


class DocumentListParams(ListParams):
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None
    type: DocumentType | None = None
    review_status: Literal["not_required", "pending", "approved", "rejected"] | None = None
    expiring: bool | None = Field(default=None, description="Only documents already expired or expiring soon")
    group: Literal["compliance"] | None = Field(
        default=None, description="compliance: licences, medical cards, test results, insurance, registrations and "
                                  "the company's authority, which safety reviews before they count")
    state: Literal["needs_review", "processing", "failed", "approved", "rejected"] | None = None
    uploaded_by: uuid.UUID | None = None
    source: Literal["driver_app", "web", "system"] | None = None


# ---------------------------------------------------------------- access
def _see_sensitive(p: Principal) -> bool:
    return p.can("drivers.sensitive.read")


def _my_driver_id(db: Session, p: Principal) -> uuid.UUID | None:
    return db.scalar(select(Driver.id).where(Driver.user_id == p.user_id))


def _check_entity(db: Session, p: Principal, entity_type: str, entity_id: uuid.UUID, doc_type: str) -> None:
    """The caller must be allowed to see the record a document is being attached to."""
    model, permission, _ = ENTITIES[entity_type]
    if p.role == "driver":
        mine = entity_type == "load" and doc_type in DRIVER_TYPES and db.scalar(
            select(DispatchAssignment.id).where(DispatchAssignment.load_id == entity_id,
                                                DispatchAssignment.driver_id == _my_driver_id(db, p),
                                                DispatchAssignment.status.in_(("active", "completed"))))
        if not mine:
            raise Forbidden("Drivers can add a POD, BOL or receipt to a load they are hauling")
    elif not p.can(permission):
        raise Forbidden("Your role does not allow access to that record")
    if entity_type == "organization" and entity_id != p.org_id:
        raise Invalid("Company documents are filed with your own company", field="entity_id")
    if db.get(model, entity_id) is None:
        raise Invalid(f"{entity_type.capitalize()} not found", field="entity_id")
    if doc_type in SENSITIVE and not _see_sensitive(p):
        raise Forbidden("Your role does not allow handling licence or medical documents")
    if doc_type in OWNER_SENSITIVE and not p.can("owners.sensitive.read"):
        raise Forbidden("Your role does not allow handling tax or bank documents")


def _outside_team(p: Principal):
    """Documents filed with a load, driver or truck the caller's dispatch team doesn't cover; None for everyone
    who sees the whole fleet."""
    if p.scope is None:
        return None
    from app.modules.drivers.models import Driver as D
    from app.modules.equipment.models import Vehicle as V
    from app.modules.loads.models import Load as L
    elsewhere = or_(
        and_(DocumentLink.entity_type == "load", DocumentLink.entity_id.notin_(select(L.id).where(team_scope.loads(p.scope)))),
        and_(DocumentLink.entity_type == "driver",
             DocumentLink.entity_id.notin_(select(D.id).where(team_scope.drivers(p.scope, D.id)))),
        and_(DocumentLink.entity_type == "vehicle",
             DocumentLink.entity_id.notin_(select(V.id).where(team_scope.vehicles(p.scope, V.id)))))
    return exists(select(DocumentLink.id).where(DocumentLink.document_id == Document.id, elsewhere))


def _get(db: Session, p: Principal, document_id: uuid.UUID, *, uploaded: bool = True) -> Document:
    doc = db.get(Document, document_id)
    if doc is None or (uploaded and doc.upload_status != "uploaded"):
        raise NotFound("Document not found")
    outside = _outside_team(p)
    if outside is not None and db.scalar(select(Document.id).where(Document.id == document_id, outside)):
        raise NotFound("Document not found")
    if (doc.type in SENSITIVE and not _see_sensitive(p)) or (doc.type in OWNER_SENSITIVE and not p.can("owners.sensitive.read")):
        raise NotFound("Document not found")  # hidden rather than refused: its existence is not disclosed
    return doc


def _present(db: Session, docs: list[Document]) -> list[DocumentOut]:
    ids = [d.id for d in docs]
    links = list(db.scalars(select(DocumentLink).where(DocumentLink.document_id.in_(ids)))) if ids else []
    labels: dict[tuple[str, uuid.UUID], str] = {}
    for entity_type, (model, _, name) in ENTITIES.items():
        wanted = {link.entity_id for link in links if link.entity_type == entity_type}
        if wanted:
            for row in db.scalars(select(model).where(model.id.in_(wanted))):
                labels[(entity_type, row.id)] = name(row)
    people = {u for d in docs for u in (d.uploaded_by, d.reviewed_by) if u}
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_(people))).all()) if people else {}
    by_doc: dict[uuid.UUID, list[LinkOut]] = {}
    for link in links:
        by_doc.setdefault(link.document_id, []).append(LinkOut(
            id=link.id, entity_type=link.entity_type, entity_id=link.entity_id,
            label=labels.get((link.entity_type, link.entity_id))))
    # Who uploaded from the driver app: the uploader's sign-in is a driver's.
    uploaders = {d.uploaded_by for d in docs if d.uploaded_by}
    drivers = set(db.scalars(select(Membership.user_id).where(Membership.role == "driver",
                                                              Membership.user_id.in_(uploaders)))) if uploaders else set()
    confidence: dict[uuid.UUID, int] = {}
    read_status: dict[uuid.UUID, str] = {}
    read_pages: dict[uuid.UUID, int] = {}
    if ids:
        from app.modules.intake.models import DocumentRead
        for read in db.scalars(select(DocumentRead).where(DocumentRead.document_id.in_(ids))
                               .order_by(DocumentRead.created_at)):
            read_status[read.document_id] = read.status  # the latest wins
            read_pages[read.document_id] = read.pages
            sure = [float(f["confidence"]) for f in read.fields or [] if isinstance(f.get("confidence"), int | float)]
            if read.status == "done" and sure:
                confidence[read.document_id] = round(100 * sum(sure) / len(sure))
    return [DocumentOut(
        id=d.id, type=d.type, filename=d.filename, content_type=d.content_type, size_bytes=d.size_bytes,
        upload_status=d.upload_status, scan_status=d.scan_status, review_status=d.review_status,
        review_note=d.review_note, reviewed_by_name=names.get(d.reviewed_by), reviewed_at=d.reviewed_at,
        expires_on=d.expires_on, in_portal=d.in_portal, uploaded_by_name=names.get(d.uploaded_by), created_at=d.created_at,
        links=by_doc.get(d.id, []),
        source="system" if d.uploaded_by is None else "driver app" if d.uploaded_by in drivers else "web",
        read_confidence=confidence.get(d.id), pages=d.pages or read_pages.get(d.id), read_status=read_status.get(d.id),
        state=_state_of(d, read_status.get(d.id))) for d in docs]


def _state_of(d: Document, read: str | None) -> str:
    if d.upload_status != "uploaded":
        return "processing"
    if d.scan_status == "failed" or (read == "failed" and d.review_status == "pending"):
        return "failed"
    return {"pending": "needs_review", "approved": "approved", "rejected": "rejected"}.get(d.review_status, "filed")


def _count_pages(data: bytes, content_type: str) -> int | None:
    """A PDF's pages; a photo is one page."""
    if content_type != "application/pdf":
        return 1
    try:
        import pypdfium2
        return len(pypdfium2.PdfDocument(data))
    except Exception:  # an unreadable PDF has no page count; that never stops an upload
        return None


# ---------------------------------------------------------------- upload
@router.post("/upload-intents", response_model=UploadIntentOut, status_code=201)
def create_upload_intent(body: UploadIntentIn, p: Principal = Depends(require("documents.upload", "driver.self")),
                         db: Session = Depends(get_db)):
    """Step 1: ask to upload. Nothing is stored yet; the reply says where to send the file."""
    limit = get_settings().max_upload_bytes
    if body.content_type not in SIGNATURES:
        raise Invalid("Upload a PDF, JPEG, PNG or WebP file", field="content_type")
    if body.size_bytes > limit:
        raise Invalid(f"Files can be up to {limit // (1024 * 1024)} MB", field="size_bytes")
    if (body.entity_type is None) != (body.entity_id is None):
        raise Invalid("Give both the record type and the record, or neither", field="entity_id")
    if body.entity_type is not None:
        _check_entity(db, p, body.entity_type, body.entity_id, body.type)
    elif p.role == "driver" or (body.type in SENSITIVE and not _see_sensitive(p)):
        raise Forbidden("Your role does not allow uploading this document on its own")

    doc = Document(
        id=uuid.uuid4(), organization_id=p.org_id, type=body.type, filename=body.filename.strip(),
        content_type=body.content_type, size_bytes=body.size_bytes, expires_on=body.expires_on,
        uploaded_by=p.user_id,
        # A receipt put straight onto a purchase waits for someone to check it against the purchase.
        review_status="pending" if body.type == "pod" or body.type in COMPLIANCE
        or (body.type == "receipt" and body.entity_type == "expense") else "not_required")
    doc.storage_key = make_key(p.org_id, doc.id)
    db.add(doc)
    db.flush()
    if body.entity_type is not None:
        db.add(DocumentLink(organization_id=p.org_id, document_id=doc.id, entity_type=body.entity_type,
                            entity_id=body.entity_id))
    db.commit()
    return UploadIntentOut(document=_present(db, [doc])[0],
                           upload=UploadTarget(url=f"/documents/{doc.id}/content",
                                               headers={"Content-Type": doc.content_type}))


def _pending_upload(db: Session, p: Principal, document_id: uuid.UUID) -> Document:
    doc = db.get(Document, document_id)
    if doc is None or doc.uploaded_by != p.user_id:
        raise NotFound("Upload not found")
    if doc.upload_status != "pending":
        raise Conflict("This upload has already been completed")
    return doc


async def _raw_body(request: Request) -> bytes:
    # Taken as it comes, whatever Content-Type says: the bytes are judged by what they are, not by a header.
    # The outermost middleware has already capped how much can be sent.
    return await request.body()


@router.put("/{document_id}/content", status_code=204, openapi_extra={"requestBody": {"required": True, "content": {
    "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}}}})
def upload_content(document_id: uuid.UUID, content: bytes = Depends(_raw_body),
                   p: Principal = Depends(require("documents.upload", "driver.self")),
                   db: Session = Depends(get_db)):
    """Step 2: the file. Stands in for the presigned storage URL used in production."""
    doc = _pending_upload(db, p, document_id)
    if len(content) > get_settings().max_upload_bytes or len(content) != doc.size_bytes:
        raise AppError("The file is not the size that was announced", status=413, code="PAYLOAD_TOO_LARGE")
    get_storage().put(doc.storage_key, content)


@router.post("/{document_id}/complete", response_model=DocumentOut)
def complete_upload(document_id: uuid.UUID, p: Principal = Depends(require("documents.upload", "driver.self")),
                    db: Session = Depends(get_db)):
    """Step 3: confirm. The API checks what actually arrived before the document can be used."""
    doc = _pending_upload(db, p, document_id)
    storage = get_storage()
    if not storage.exists(doc.storage_key):
        raise Conflict("The file has not been uploaded yet", code="UPLOAD_INCOMPLETE")
    data = storage.get(doc.storage_key)
    ok = len(data) == doc.size_bytes and data.startswith(SIGNATURES[doc.content_type])
    if ok and doc.content_type == "image/webp":
        ok = data[8:12] == b"WEBP"
    if not ok:
        # What arrived is not what was announced: discard it rather than keep a mislabelled file.
        storage.delete(doc.storage_key)
        db.delete(doc)
        db.commit()
        raise Invalid("The file's contents don't match its type. Upload a PDF, JPEG, PNG or WebP file.",
                      field="file")
    doc.checksum = hashlib.sha256(data).hexdigest()
    doc.upload_status = "uploaded"
    doc.pages = _count_pages(data, doc.content_type)
    links = list(db.scalars(select(DocumentLink).where(DocumentLink.document_id == doc.id)))
    audit(db, p, "document.uploaded", "document", doc.id,
          {"type": doc.type, "filename": doc.filename,
           "attached_to": [{"type": x.entity_type, "id": str(x.entity_id)} for x in links]})
    if doc.type == "pod":
        db.flush()
        for link in links:
            if link.entity_type == "load":
                loads.on_pod_uploaded(db, p, link.entity_id)
    # Read what can be read now, so the reviewer starts from the values on the paper. A reading that fails never
    # stops the upload; the reviewer reads the document by eye instead.
    if doc.type in READ_KIND and p.role != "driver":
        from app.modules.intake import service as intake
        try:
            with db.begin_nested():
                intake.read_document(db, p, doc, READ_KIND[doc.type])
        except Exception:  # noqa: BLE001
            pass
    db.commit()
    return _present(db, [doc])[0]


# ---------------------------------------------------------------- read
@router.get("", response_model=Page[DocumentOut])
def list_documents(params: Annotated[DocumentListParams, Query()],
                   p: Principal = Depends(require("documents.read")), db: Session = Depends(get_db)):
    # Files still arriving show only on the processing tab, and only for a day: after that the upload was abandoned.
    arriving = (Document.upload_status == "pending") & (Document.created_at >= datetime.now(UTC) - timedelta(days=1))
    stmt = select(Document).where(arriving if params.state == "processing" else Document.upload_status == "uploaded")
    outside = _outside_team(p)
    if outside is not None:
        stmt = stmt.where(~outside)
    if not _see_sensitive(p):
        stmt = stmt.where(Document.type.notin_(SENSITIVE))
    if not p.can("owners.sensitive.read"):
        stmt = stmt.where(Document.type.notin_(OWNER_SENSITIVE))
    if params.entity_type or params.entity_id:
        link = select(DocumentLink.id).where(DocumentLink.document_id == Document.id)
        if params.entity_type:
            link = link.where(DocumentLink.entity_type == params.entity_type)
        if params.entity_id:
            link = link.where(DocumentLink.entity_id == params.entity_id)
        stmt = stmt.where(exists(link))
    if params.type:
        stmt = stmt.where(Document.type == params.type)
    if params.review_status:
        stmt = stmt.where(Document.review_status == params.review_status)
    if params.group == "compliance":
        stmt = stmt.where(Document.type.in_(COMPLIANCE))
    if params.state:
        stmt = _in_state(stmt, params.state, p)
    if params.uploaded_by:
        stmt = stmt.where(Document.uploaded_by == params.uploaded_by)
    if params.source:
        app_users = select(Membership.user_id).where(Membership.role == "driver")
        stmt = stmt.where(Document.uploaded_by.is_(None) if params.source == "system" else
                          Document.uploaded_by.in_(app_users) if params.source == "driver_app" else
                          Document.uploaded_by.is_not(None) & Document.uploaded_by.notin_(app_users))
    if params.expiring:
        stmt = stmt.where(Document.expires_on <= p.today() + timedelta(days=WARN_DAYS))
    if params.q:
        stmt = stmt.where(_matching(params.q.strip()))
    rows, info = paginate(db, stmt, parse_sort(params.sort, {"created_at": Document.created_at}, "-created_at"),
                          Document.id, cursor=params.cursor, limit=params.limit, count=params.count)
    return envelope(_present(db, rows), info)


def _latest_read():
    from app.modules.intake.models import DocumentRead
    return (select(DocumentRead.status).where(DocumentRead.document_id == Document.id)
            .order_by(DocumentRead.created_at.desc()).limit(1).scalar_subquery())


def _in_state(stmt, state: str, p: Principal):
    if state == "processing":
        return stmt
    # No reading at all is not a failed one: compare with a value, never with NULL.
    read = func.coalesce(_latest_read(), "")
    failed = (Document.scan_status == "failed") | ((Document.review_status == "pending") & (read == "failed"))
    if state == "failed":
        return stmt.where(failed)
    if state == "needs_review":
        return stmt.where(Document.review_status == "pending", ~failed)
    return stmt.where(Document.review_status == state)


def _matching(q: str):
    """A file name, the load or record it is filed with, or who uploaded it."""
    from app.modules.drivers.models import Driver as D
    from app.modules.loads.models import Load as L
    pattern = like(q)
    found = {
        "load": select(L.id).where(or_(L.load_number.ilike(pattern), L.reference.ilike(pattern))),
        "driver": select(D.id).where((D.first_name + " " + D.last_name).ilike(pattern)),
        "vehicle": select(Vehicle.id).where(Vehicle.unit_number.ilike(pattern)),
        "trailer": select(Trailer.id).where(Trailer.unit_number.ilike(pattern)),
        "customer": select(Customer.id).where(Customer.name.ilike(pattern)),
    }
    linked = or_(*[and_(DocumentLink.entity_type == kind, DocumentLink.entity_id.in_(ids)) for kind, ids in found.items()])
    return or_(Document.filename.ilike(pattern),
               exists(select(DocumentLink.id).where(DocumentLink.document_id == Document.id, linked)),
               Document.uploaded_by.in_(select(User.id).where(User.full_name.ilike(pattern))))


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: uuid.UUID, p: Principal = Depends(require("documents.read")),
                 db: Session = Depends(get_db)):
    return _present(db, [_get(db, p, document_id)])[0]


@router.get("/{document_id}/download")
def download(document_id: uuid.UUID, disposition: Literal["attachment", "inline"] = "attachment",
             p: Principal = Depends(require("documents.read")), db: Session = Depends(get_db)):
    """The file itself. Access is checked on every download; there are no shareable links."""
    doc = _get(db, p, document_id)
    try:
        data = get_storage().get(doc.storage_key)
    except FileNotFoundError as e:
        raise NotFound("The file is missing from storage") from e
    audit(db, p, "document.downloaded", "document", doc.id)
    db.commit()
    return Response(content=data, media_type=doc.content_type, headers={
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(doc.filename)}",
        "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox"})


@router.get("/{document_id}/pages/{page}", responses={200: {"content": {"image/png": {}}}},
            summary="One page of a PDF as an image, for viewing it next to what was read from it")
def page_image(document_id: uuid.UUID, page: int, p: Principal = Depends(require("documents.read")),
               db: Session = Depends(get_db)):
    import io

    import pypdfium2
    doc = _get(db, p, document_id)
    if doc.content_type != "application/pdf":
        raise Invalid("Only a PDF has pages to show", field="page")
    try:
        pdf = pypdfium2.PdfDocument(get_storage().get(doc.storage_key))
    except FileNotFoundError as e:
        raise NotFound("The file is missing from storage") from e
    except pypdfium2.PdfiumError as e:
        raise Invalid("This PDF can't be shown", field="page") from e
    if not 1 <= page <= len(pdf):
        raise NotFound("No such page")
    image = pdf[page - 1].render(scale=1.6).to_pil()
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=True)
    return Response(content=out.getvalue(), media_type="image/png",
                    headers={"Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff"})


# ---------------------------------------------------------------- change
@router.patch("/{document_id}", response_model=DocumentOut)
def update_document(document_id: uuid.UUID, body: DocumentPatch, p: Principal = Depends(require("documents.upload")),
                    db: Session = Depends(get_db)):
    doc = _get(db, p, document_id)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("filename", "") is None:
        raise Invalid("This field can't be empty", field="filename")
    for k, v in changes.items():
        setattr(doc, k, v)
    audit(db, p, "document.updated", "document", doc.id, body.model_dump(mode="json", exclude_unset=True))
    db.commit()
    return _present(db, [doc])[0]


@router.post("/{document_id}/links", response_model=DocumentOut, status_code=201)
def add_link(document_id: uuid.UUID, body: LinkIn, p: Principal = Depends(require("documents.upload")),
             db: Session = Depends(get_db)):
    """Attach the same document to another record, instead of uploading it twice."""
    doc = _get(db, p, document_id)
    _check_entity(db, p, body.entity_type, body.entity_id, doc.type)
    already = db.scalar(select(DocumentLink.id).where(
        DocumentLink.document_id == doc.id, DocumentLink.entity_type == body.entity_type,
        DocumentLink.entity_id == body.entity_id))
    if not already:
        db.add(DocumentLink(organization_id=p.org_id, document_id=doc.id, **body.model_dump()))
        audit(db, p, "document.linked", "document", doc.id, body.model_dump(mode="json"))
        if doc.type == "pod" and body.entity_type == "load" and doc.review_status == "pending":
            db.flush()
            loads.on_pod_uploaded(db, p, body.entity_id)
        db.commit()
    return _present(db, [doc])[0]


def _guard_proof(db: Session, doc: Document, links: list[DocumentLink]) -> None:
    """The proof behind a finished load stays put."""
    if doc.type != "pod" or doc.review_status != "approved":
        return
    load_ids = [x.entity_id for x in links if x.entity_type == "load"]
    if load_ids and db.scalar(select(Load.id).where(Load.id.in_(load_ids), Load.status == "completed")):
        raise Conflict("This is the approved proof of delivery for a completed load and can't be removed")


@router.delete("/{document_id}/links/{link_id}", status_code=204)
def remove_link(document_id: uuid.UUID, link_id: uuid.UUID, p: Principal = Depends(require("documents.delete")),
                db: Session = Depends(get_db)):
    doc = _get(db, p, document_id)
    links = list(db.scalars(select(DocumentLink).where(DocumentLink.document_id == doc.id)))
    link = next((x for x in links if x.id == link_id), None)
    if link is None:
        raise NotFound("Link not found")
    if len(links) == 1:
        raise Conflict("A document must stay attached to something. Delete the document instead.")
    _guard_proof(db, doc, [link])
    db.delete(link)
    audit(db, p, "document.unlinked", "document", doc.id,
          {"entity_type": link.entity_type, "entity_id": str(link.entity_id)})
    db.commit()


# What a read value means for the document itself: the date it runs to.
EXPIRY_FIELDS = ("cdl_expiry", "registration_expiry")


def _unchecked(db: Session, doc: Document) -> list[str]:
    """Fields of the latest reading that were read with too little confidence and nobody has decided on yet."""
    from app.modules.intake import service as intake
    from app.modules.intake.models import DocumentRead
    read = db.scalar(select(DocumentRead).where(DocumentRead.document_id == doc.id)
                     .order_by(DocumentRead.created_at.desc()).limit(1))
    if read is None or read.status != "done":
        return []
    decided = read.corrections or {}
    return [f["key"] for f in read.fields
            if (f.get("confidence") or 0) < intake.SURE and f.get("value") and f["key"] not in decided]


def _read_expiry(db: Session, doc: Document) -> date | None:
    """The expiry date on the paper, as read or as the reviewer settled it."""
    from app.modules.intake.models import DocumentRead
    read = db.scalar(select(DocumentRead).where(DocumentRead.document_id == doc.id, DocumentRead.status == "done")
                     .order_by(DocumentRead.created_at.desc()).limit(1))
    if read is None:
        return None
    from app.modules.intake.normalize import normalize
    for key in EXPIRY_FIELDS:
        decided = (read.corrections or {}).get(key)
        if decided and decided.get("decision") == "unreadable":
            return None
        raw = decided.get("saved") if decided else next((f["value"] for f in read.fields if f["key"] == key), None)
        value = normalize("date", str(raw)) if raw else None  # the paper's "11/30/27" as 2027-11-30
        if value:
            try:
                return date.fromisoformat(value)
            except ValueError:
                return None
    return None


@router.post("/{document_id}/review", response_model=DocumentOut)
def review(document_id: uuid.UUID, body: ReviewIn, p: Principal = Depends(require("safety.manage", "loads.close")),
           db: Session = Depends(get_db)):
    """Approve and attach, or send back. A proof of delivery moves its load on: approved, the load is completed;
    sent back, it waits for a new one. A compliance document approved renews the record it is filed with."""
    doc = _get(db, p, document_id)
    if doc.review_status == "not_required":
        raise Conflict("This kind of document doesn't need a review")
    if doc.type == "pod" and doc.review_status != "pending":
        raise Conflict("This proof of delivery has already been reviewed; its load has moved on", code="ALREADY_REVIEWED")
    note = (body.note or "").strip() or None
    if body.decision == "rejected" and not note:
        raise Invalid("Say what is wrong so it can be fixed", field="note")
    if body.decision == "approved":
        unchecked = _unchecked(db, doc)
        if unchecked:
            raise Conflict("Confirm, correct or mark unreadable the fields marked Check first", code="FIELDS_UNCHECKED",
                           details={"fields": unchecked})
    if doc.type == "pod":
        if not p.can("loads.close"):
            raise Forbidden("Your role does not allow closing loads", details={"required": ["loads.close"]})
        load_ids = list(db.scalars(select(DocumentLink.entity_id).where(DocumentLink.document_id == doc.id,
                                                                        DocumentLink.entity_type == "load")))
        moved = False
        for load_id in load_ids:
            load = loads.lock_load(db, load_id, p)
            if load.status == "pod_review":
                loads.transition(db, p, load, "approve_pod" if body.decision == "approved" else "reject_pod",
                                 reason=note)
                moved = True
        if not moved:  # not waiting on a load: the document is decided on its own
            doc.review_status, doc.review_note = body.decision, note if body.decision == "rejected" else None
            doc.reviewed_by, doc.reviewed_at = p.user_id, datetime.now(UTC)
            audit(db, p, f"document.{body.decision}", "document", doc.id, {"note": note} if note else None)
        db.commit()
        return _present(db, [doc])[0]
    if not p.can("safety.manage"):
        raise Forbidden("Your role does not allow reviewing compliance documents", details={"required": ["safety.manage"]})
    if body.decision == "approved" and doc.expires_on is None:
        doc.expires_on = _read_expiry(db, doc)
    doc.review_status, doc.review_note = body.decision, note
    doc.reviewed_by, doc.reviewed_at = p.user_id, datetime.now(UTC)
    # An approved renewal is what makes the record compliant again: its date goes onto the driver or unit.
    renewed = renew(db, p, doc) if body.decision == "approved" else []
    audit(db, p, f"document.{body.decision}", "document", doc.id,
          {k: v for k, v in (("note", note), ("renewed", renewed)) if v} or None)
    db.commit()
    return _present(db, [doc])[0]


@router.delete("/{document_id}", status_code=204)
def delete_document(document_id: uuid.UUID, p: Principal = Depends(require("documents.delete")),
                    db: Session = Depends(get_db)):
    doc = _get(db, p, document_id)
    _guard_proof(db, doc, list(db.scalars(select(DocumentLink).where(DocumentLink.document_id == doc.id))))
    key = doc.storage_key
    db.delete(doc)
    audit(db, p, "document.deleted", "document", document_id, {"type": doc.type, "filename": doc.filename})
    db.commit()
    get_storage().delete(key)  # after the commit: a failed transaction must not lose the file
