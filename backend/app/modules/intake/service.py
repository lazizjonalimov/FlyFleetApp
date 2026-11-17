"""Reading an uploaded document into the fields of a record, checking what was read against the company's own
records, and keeping what was read next to what was saved."""
import re
import time
import uuid
from datetime import UTC, datetime

from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.deps import Principal
from app.core.errors import Conflict, Invalid, NotFound
from app.core.storage import get_storage
from app.modules.customers.models import Customer
from app.modules.documents.models import Document, DocumentLink
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.intake import pdf_reader, vision
from app.modules.intake import vin as vins
from app.modules.intake.fields import KINDS
from app.modules.intake.models import DocumentRead
from app.modules.intake.normalize import normalize
from app.modules.loads.models import Load
from app.modules.people import service as people

SURE = 0.8


class FieldOut(BaseModel):
    key: str
    label: str
    type: str
    value: str | None
    confidence: float | None
    page: int | None
    box: list[float]
    # read: read with confidence | check: read but worth a look | missing: not found on the document
    state: str
    note: str | None = None


class CheckOut(BaseModel):
    tone: str  # ok | info | warn | bad
    title: str
    detail: str
    field: str | None = None
    record_type: str | None = None
    record_id: uuid.UUID | None = None


class ReadOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    filename: str
    content_type: str
    kind: str
    kind_label: str
    status: str
    reader: str
    pages: int
    duration_ms: int
    error: str | None
    fields: list[FieldOut]
    violations: list[dict]
    checks: list[CheckOut]
    # Values worked out rather than read: the next free unit number, a VIN's year and make.
    suggestions: dict[str, str]
    applied_entity_type: str | None
    applied_entity_id: uuid.UUID | None
    corrections: dict | None
    created_at: datetime


def _document(db: Session, document_id: uuid.UUID) -> Document:
    doc = db.get(Document, document_id)
    if doc is None or doc.upload_status != "uploaded":
        raise NotFound("Document not found")
    return doc


def read_document(db: Session, p: Principal, doc: Document, kind: str) -> DocumentRead:
    if kind not in KINDS:
        raise Invalid("Choose what kind of document this is", field="kind")
    data = get_storage().get(doc.storage_key)
    started = time.monotonic()
    result, status, error, reader = None, "done", None, "none"
    if doc.content_type == "application/pdf":
        result = pdf_reader.read(data, kind, p.today().year)
        reader = "text" if result else reader
    if result is None:
        if vision.enabled():
            try:
                result = vision.read(data, doc.content_type, kind)
                reader = "vision"
            except vision.ReaderError as e:
                status, error = "failed", str(e)
        else:
            status = "needs_reader"
            error = ("Photos and scanned PDFs need the photo reader, which isn't turned on for this workspace. "
                     "Type the details in, or upload a PDF with its text in it.")
    row = DocumentRead(
        organization_id=p.org_id, document_id=doc.id, kind=kind, status=status, reader=reader,
        pages=result.pages if result else 1, duration_ms=int((time.monotonic() - started) * 1000),
        fields=[{"key": f.key, "value": f.value, "confidence": f.confidence, "page": f.page, "box": f.box}
                for f in (result.fields if result else [])],
        violations=result.violations if result else [], error=error, created_by=p.user_id)
    db.add(row)
    db.flush()
    audit(db, p, "document.read", "document", doc.id, {"kind": kind, "status": status, "reader": reader,
                                                        "fields": len(row.fields)})
    return row


def _value(r: DocumentRead, key: str) -> str | None:
    return next((f["value"] for f in r.fields if f["key"] == key and f.get("value")), None)


def next_unit_number(db: Session, model) -> str | None:
    """The next free number in the company's own numbering: after the highest number with the most common prefix."""
    numbers = list(db.scalars(select(model.unit_number)))
    parsed = [m for n in numbers if (m := re.fullmatch(r"(.*?)(\d+)", n or ""))]
    if not parsed:
        return None
    prefixes: dict[str, list[re.Match]] = {}
    for m in parsed:
        prefixes.setdefault(m[1], []).append(m)
    prefix, group = max(prefixes.items(), key=lambda kv: len(kv[1]))
    top = max(group, key=lambda m: int(m[2]))
    taken = set(numbers)
    n = int(top[2]) + 1
    while f"{prefix}{str(n).zfill(len(top[2]))}" in taken:
        n += 1
    return f"{prefix}{str(n).zfill(len(top[2]))}"


def checks(db: Session, p: Principal, r: DocumentRead) -> tuple[list[CheckOut], dict[str, str], dict[str, str]]:
    """What the read values say against the company's records, values worked out from them, and notes per field."""
    out: list[CheckOut] = []
    suggest: dict[str, str] = {}
    notes: dict[str, str] = {}
    org = p.org_name or "this company"
    if r.kind == "registration":
        vin = _value(r, "vin")
        unit = next_unit_number(db, Vehicle)
        if unit:
            suggest["unit_number"] = unit
        if vin:
            d = vins.decode(vin, p.today().year)
            if d.year:
                suggest["year"] = str(d.year)
            if d.make:
                suggest["make"] = d.make
            if d.valid:
                what = " ".join(x for x in (str(d.year or ""), d.make or "") if x)
                out.append(CheckOut(tone="ok", title="VIN decoded", field="vin",
                                    detail=f"{what}, matching what's printed on the card." if what else
                                    "The check digit is right."))
                notes["vin"] = "Valid"
                if d.year and _value(r, "year") == str(d.year):
                    notes["year"] = "Matches VIN"
                if d.make and (_value(r, "make") or "").lower() == d.make.lower():
                    notes["make"] = "Matches VIN"
            else:
                out.append(CheckOut(tone="bad", title="Check the VIN", detail=d.problem or "", field="vin"))
            for model, kind in ((Vehicle, "vehicle"), (Trailer, "trailer")):
                existing = db.scalar(select(model).where(func.upper(model.vin) == d.vin))
                if existing:
                    noun = "Truck" if kind == "vehicle" else "Trailer"
                    out.append(CheckOut(tone="bad", title="Already in FlyFleet",
                                        detail=f"{noun} {existing.unit_number} has this VIN.",
                                        field="vin", record_type=kind, record_id=existing.id))
    elif r.kind == "cdl":
        number, first, last = _value(r, "cdl_number"), _value(r, "first_name"), _value(r, "last_name")
        matches = people.find_matches(db, cdl_number=number, first_name=first, last_name=last)
        by_cdl = [m for m in matches if "cdl_number" in m.reasons]
        if by_cdl:
            person = by_cdl[0].person
            driver = db.scalar(select(Driver).where(Driver.person_id == person.id))
            out.append(CheckOut(tone="bad", title="Already a driver",
                                detail=f"{people.full_name(person)} has this CDL number at {org}.",
                                field="cdl_number", record_type="driver" if driver else "person",
                                record_id=driver.id if driver else person.id))
        elif number:
            out.append(CheckOut(tone="ok", title="No duplicate", detail=f"No driver at {org} has this CDL number."))
        others = [m for m in matches if "cdl_number" not in m.reasons]
        if others and not by_cdl:
            person = others[0].person
            out.append(CheckOut(tone="info", title=f"{people.full_name(person)} is already on file",
                                detail="If it's the same person, the driver is linked to that record, not typed in again.",
                                record_type="person", record_id=person.id))
    elif r.kind == "rate_confirmation":
        name, reference = _value(r, "customer_name"), _value(r, "reference")
        if name:
            customer = db.scalar(select(Customer).where(or_(func.lower(Customer.name) == name.lower(),
                                                            func.lower(Customer.legal_name) == name.lower())))
            if customer:
                out.append(CheckOut(tone="ok", title="Customer matched", detail=f"Billed to {customer.name}.",
                                    field="customer_name", record_type="customer", record_id=customer.id))
            else:
                out.append(CheckOut(tone="info", title="New customer", field="customer_name",
                                    detail=f"No customer named {name} yet. Pick one, or add them."))
        if reference:
            load = db.scalar(select(Load).where(Load.reference == reference))
            if load:
                out.append(CheckOut(tone="warn", title="This reference is already on a load",
                                    detail=f"{load.load_number} has reference {reference}.", field="reference",
                                    record_type="load", record_id=load.id))
        out.append(CheckOut(tone="info", title="Saved as a draft",
                            detail="The load is a draft until you mark it ready for dispatch."))
    elif r.kind == "pod":
        reference = _value(r, "reference")
        load = None
        if reference:
            load = db.scalar(select(Load).where(or_(Load.load_number == reference, Load.reference == reference,
                                                     Load.bol_number == reference)))
        if load:
            out.append(CheckOut(tone="ok", title="Load matched", detail=f"{load.load_number} · {load.status.replace('_', ' ')}.",
                                field="reference", record_type="load", record_id=load.id))
        else:
            out.append(CheckOut(tone="warn", title="No load matched",
                                detail="Pick the load this proof of delivery belongs to.", field="reference"))
    elif r.kind == "inspection_report":
        plate, vin = _value(r, "truck_plate"), _value(r, "truck_vin")
        truck = None
        if vin:
            truck = db.scalar(select(Vehicle).where(func.upper(Vehicle.vin) == vins.clean(vin)))
        if truck is None and plate:
            truck = db.scalar(select(Vehicle).where(func.replace(func.upper(Vehicle.plate), " ", "") ==
                                                    re.sub(r"\s", "", plate.upper())))
        if truck:
            out.append(CheckOut(tone="ok", title="Truck matched", detail=f"Truck {truck.unit_number}.",
                                record_type="vehicle", record_id=truck.id))
        name = _value(r, "driver_name")
        if name and " " in name:
            first, last = name.split(" ", 1)
            driver = db.scalar(select(Driver).where(func.lower(Driver.first_name) == first.lower(),
                                                     func.lower(Driver.last_name) == last.lower()))
            if driver:
                out.append(CheckOut(tone="ok", title="Driver matched", detail=f"{driver.first_name} {driver.last_name}.",
                                    record_type="driver", record_id=driver.id))
        if any(v.get("out_of_service") for v in r.violations):
            out.append(CheckOut(tone="bad", title="Out-of-service order",
                                detail="The unit or driver can't be dispatched until the violation is fixed and signed off."))
    elif r.kind == "fuel_receipt":
        unit = _value(r, "unit_number")
        truck = db.scalar(select(Vehicle).where(Vehicle.unit_number == unit)) if unit else None
        if truck:
            out.append(CheckOut(tone="ok", title="Truck matched", detail=f"Truck {truck.unit_number}.",
                                record_type="vehicle", record_id=truck.id))
    return out, suggest, notes


def present(db: Session, p: Principal, r: DocumentRead) -> ReadOut:
    doc = db.get(Document, r.document_id)
    label, specs = KINDS[r.kind]
    found = {f["key"]: f for f in r.fields}
    found_checks, suggest, notes = checks(db, p, r)
    problems = {c.field for c in found_checks if c.field and c.tone in ("bad", "warn")}
    fields = []
    for spec in specs:
        f = found.get(spec.key)
        value = normalize(spec.type, f["value"]) if f else None
        if f and value is None:
            value = f["value"]  # shown as read, for a person to fix
        confidence = f.get("confidence") if f else None
        state = "missing" if not f else ("check" if (confidence or 0) < SURE or spec.key in problems else "read")
        fields.append(FieldOut(key=spec.key, label=spec.label, type=spec.type, value=value, confidence=confidence,
                               page=f.get("page") if f else None, box=f.get("box") or [] if f else [], state=state,
                               note=notes.get(spec.key)))
    return ReadOut(id=r.id, document_id=r.document_id, filename=doc.filename if doc else "",
                   content_type=doc.content_type if doc else "",
                   kind=r.kind, kind_label=label, status=r.status, reader=r.reader, pages=r.pages,
                   duration_ms=r.duration_ms, error=r.error, fields=fields, violations=r.violations,
                   checks=found_checks, suggestions=suggest, applied_entity_type=r.applied_entity_type,
                   applied_entity_id=r.applied_entity_id, corrections=r.corrections, created_at=r.created_at)


ENTITY_MODELS = {"driver": Driver, "vehicle": Vehicle, "trailer": Trailer, "load": Load}


def apply(db: Session, p: Principal, r: DocumentRead, entity_type: str, entity_id: uuid.UUID,
          saved: dict[str, str | None]) -> DocumentRead:
    """A record was saved from this read: keep what a person changed, and file the document with the record."""
    if r.applied_entity_id:
        raise Conflict("A record has already been saved from this document", code="ALREADY_APPLIED")
    model = ENTITY_MODELS.get(entity_type)
    if model is None or db.get(model, entity_id) is None:
        raise Invalid("Record not found", field="entity_id")
    specs = {s.key: s for s in KINDS[r.kind][1]}
    corrections = {}
    for key, value in saved.items():
        spec = specs.get(key)
        if spec is None:
            continue
        read_raw = _value(r, key)
        read_value = normalize(spec.type, read_raw) if read_raw else None
        kept = normalize(spec.type, value) if value else None
        if (read_value or read_raw) != kept and not (read_raw is None and kept is None):
            corrections[key] = {"read": read_raw, "saved": value}
    r.applied_entity_type, r.applied_entity_id = entity_type, entity_id
    r.corrections, r.applied_by, r.applied_at = corrections, p.user_id, datetime.now(UTC)
    linked = db.scalar(select(DocumentLink.id).where(DocumentLink.document_id == r.document_id,
                                                     DocumentLink.entity_type == entity_type,
                                                     DocumentLink.entity_id == entity_id))
    if not linked:
        db.add(DocumentLink(organization_id=p.org_id, document_id=r.document_id, entity_type=entity_type,
                            entity_id=entity_id))
    audit(db, p, "document.read_applied", entity_type, entity_id,
          {"document_id": str(r.document_id), "kind": r.kind, "corrected": sorted(corrections)})
    return r
