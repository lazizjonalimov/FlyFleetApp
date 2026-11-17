"""Bringing drivers, trucks or trailers in from a CSV or Excel file: the columns matched to fields, every row
checked (bad VINs, dates and states, duplicates in the file and in FlyFleet) before anything is saved, then the
rows that are ready created through the same rules as the forms."""
import csv
import io
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.deps import Principal
from app.core.errors import Conflict, Invalid
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.intake import vin as vins
from app.modules.intake.models import Import
from app.modules.intake.normalize import date_format, equipment_type, make_name, normalize

MAX_ROWS = 5000
MAX_COLUMNS = 60


@dataclass(frozen=True)
class Col:
    key: str
    label: str
    type: str = "text"
    synonyms: tuple[str, ...] = ()


_DATES = {"plate expires": ("plate exp", "plate expires", "registration exp", "registration expires", "reg exp",
                            "registration", "tag exp", "plate expiration")}
COMMON_UNIT = [
    Col("year", "Year", "int", ("year", "yr", "model year")),
    Col("make", "Make", "text", ("make", "manufacturer", "mfr")),
    Col("model", "Model", "text", ("model",)),
    Col("vin", "VIN", "vin", ("vin", "vin #", "vin number", "serial", "serial number")),
    Col("plate", "Plate", "text", ("plate", "plate #", "plate number", "license plate", "lic plate", "tag", "tag #")),
    Col("plate_state", "Plate state", "state", ("plate state", "state", "st", "reg state", "tag state")),
    Col("registration_expiry", "Plate expires", "date", _DATES["plate expires"]),
    Col("insurance_expiry", "Insurance expires", "date", ("insurance exp", "insurance", "ins exp", "insurance expires")),
    Col("inspection_expiry", "Annual inspection expires", "date", ("inspection", "annual inspection", "inspection exp",
                                                                    "dot inspection", "inspection expires")),
]
FIELDS: dict[str, list[Col]] = {
    "drivers": [
        Col("full_name", "Full name → first and last", "text", ("driver name", "name", "driver", "full name",
                                                                "employee name", "driver full name")),
        Col("first_name", "First name", "text", ("first name", "first", "given name", "fname")),
        Col("last_name", "Last name", "text", ("last name", "last", "surname", "lname", "family name")),
        Col("phone", "Mobile phone", "text", ("cell", "mobile", "phone", "cell phone", "mobile phone", "phone number")),
        Col("email", "Email", "text", ("email", "e mail", "email address")),
        Col("employee_number", "Employee ID", "text", ("employee id", "emp id", "employee #", "driver id", "emp #", "id")),
        Col("cdl_number", "CDL number", "text", ("cdl #", "cdl", "cdl number", "license #", "license number", "dl #",
                                                 "dl number", "cdl no")),
        Col("cdl_state", "CDL state", "state", ("st", "state", "cdl state", "license state", "dl state")),
        Col("cdl_class", "CDL class", "text", ("class", "cdl class")),
        Col("endorsements", "Endorsements", "list", ("end", "endorsements", "endorse", "endorsement")),
        Col("cdl_expiry", "CDL expiration", "date", ("cdl exp", "cdl expiration", "cdl expires", "license exp",
                                                     "dl exp", "license expiration")),
        Col("medical_cert_expiry", "Medical card expiration", "date", ("med card", "medical card", "medical exp",
                                                                        "med exp", "dot physical", "medical card exp",
                                                                        "medical")),
        Col("hire_date", "Hire date", "date", ("hire date", "hired", "start date", "date hired", "date of hire")),
        Col("pay_type", "Pay type", "text", ("pay type", "pay basis")),
        Col("pay_rate", "Pay rate", "money", ("pay rate", "rate", "cpm", "pay")),
    ],
    "trucks": [
        Col("unit_number", "Unit number", "text", ("unit", "unit #", "unit number", "truck", "truck #", "truck number",
                                                   "number", "unit no")),
        *COMMON_UNIT,
        Col("odometer", "Odometer", "int", ("odometer", "odometer miles", "mileage", "odo")),
        Col("telematics_device", "ELD", "text", ("eld", "eld id", "eld serial", "telematics", "samsara id", "motive id",
                                                 "gps id")),
        Col("engine", "Engine", "text", ("engine",)),
        Col("transmission", "Transmission", "text", ("transmission", "trans")),
        Col("gvwr", "GVWR", "int", ("gvwr", "gvw", "gross weight")),
    ],
    "trailers": [
        Col("unit_number", "Unit number", "text", ("unit", "unit #", "unit number", "trailer", "trailer #",
                                                   "trailer number", "number", "unit no")),
        Col("type", "Type", "text", ("type", "trailer type", "equipment", "equipment type")),
        Col("length_ft", "Length (ft)", "int", ("length", "length ft", "size", "length (ft)")),
        *COMMON_UNIT,
        Col("tracker", "Tracker", "text", ("tracker", "tracker id", "gps", "gps id")),
    ],
}
# The fields a file must cover to be worth importing, in the order the screen names them.
NEEDED = {"drivers": ("name", "phone", "cdl_number", "cdl_state", "cdl_class", "cdl_expiry"),
          "trucks": ("unit_number", "vin", "plate", "plate_state"),
          "trailers": ("unit_number", "type", "vin", "plate")}
NEEDED_LABEL = {"name": "name", "phone": "phone", "cdl_number": "CDL number", "cdl_state": "state",
                "cdl_class": "class", "cdl_expiry": "expiry", "unit_number": "unit number", "vin": "VIN",
                "plate": "plate", "plate_state": "plate state", "type": "type"}


def _key(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9#]+", " ", text.lower())).strip()


# ---------------------------------------------------------------- reading the file
def parse(filename: str, data: bytes) -> tuple[list[str], list[list[str]], str | None]:
    """Headers, rows (as text) and the sheet name. The first row with three or more filled cells is the header."""
    name = filename.lower()
    if name.endswith((".xlsx", ".xlsm")) or data[:4] == b"PK\x03\x04":
        import openpyxl
        try:
            book = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        except Exception as e:
            raise Invalid("This Excel file can't be opened. Save it again as .xlsx or CSV.", field="file") from e
        sheet = book.worksheets[0]

        def cell(v) -> str:
            if v is None:
                return ""
            if isinstance(v, datetime):
                return v.date().isoformat()
            if isinstance(v, date):
                return v.isoformat()
            if isinstance(v, float) and v.is_integer():
                return str(int(v))
            return str(v).strip()
        raw = [[cell(v) for v in row] for row in sheet.iter_rows(values_only=True)]
        sheet_name = sheet.title
    else:
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = data.decode("latin-1")
        if "\x00" in text:
            raise Invalid("This file isn't a CSV or Excel spreadsheet", field="file")
        try:
            dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
        except csv.Error:
            dialect = csv.excel
        raw = [[c.strip() for c in row] for row in csv.reader(io.StringIO(text), dialect)]
        sheet_name = None
    start = next((i for i, row in enumerate(raw) if sum(1 for c in row if c) >= 2), None)
    if start is None:
        raise Invalid("The file has no rows to import", field="file")
    headers = [h or f"Column {i + 1}" for i, h in enumerate(raw[start][:MAX_COLUMNS])]
    rows = [(r + [""] * len(headers))[:len(headers)] for r in raw[start + 1:] if any(c for c in r)]
    if len(rows) > MAX_ROWS:
        raise Invalid(f"A file can have up to {MAX_ROWS:,} rows. Split it and import each part.", field="file")
    if not rows:
        raise Invalid("The file has a header row but no rows under it", field="file")
    return headers, rows, sheet_name


def suggest(kind: str, headers: list[str]) -> dict[str, str]:
    """Header -> field key, by the names files usually use. Each field is matched once."""
    out: dict[str, str] = {}
    used: set[str] = set()
    cols = FIELDS[kind]
    for exact in (True, False):
        for h in headers:
            if h in out:
                continue
            k = _key(h)
            for c in cols:
                if c.key in used:
                    continue
                if any(k == _key(s) if exact else (len(s) > 3 and _key(s) in k) for s in c.synonyms):
                    out[h] = c.key
                    used.add(c.key)
                    break
    return out


# ---------------------------------------------------------------- the views the screens show
class ColumnOut(BaseModel):
    header: str
    example: str
    field: str | None
    status: str  # matched | format | warn | ignored
    note: str


class FieldOption(BaseModel):
    key: str
    label: str


class RowIssue(BaseModel):
    row: int
    title: str
    message: str
    tone: str  # warn: needs a decision | bad: fix in the file
    actions: list[str]
    decision: str | None


class ImportOut(BaseModel):
    id: str
    kind: str
    filename: str
    sheet: str | None
    status: str
    rows: int
    columns: list[ColumnOut]
    fields: list[FieldOption]
    matched: int
    covered: bool
    missing: list[str]
    ready: int
    look: int
    cant: int
    issues: list[RowIssue]
    result: dict | None


def _values(imp: Import, row: list[str]) -> dict[str, str]:
    out = {}
    for i, header in enumerate(imp.headers):
        key = imp.mapping.get(header)
        if key and i < len(row) and row[i].strip():
            out[key] = row[i].strip()
    if "full_name" in out and not (out.get("first_name") and out.get("last_name")):
        parts = out["full_name"].replace(",", " ").split()
        if "," in out["full_name"]:  # "Medina, Carlos"
            last, *first = out["full_name"].split(",")
            out.setdefault("first_name", " ".join(first).strip())
            out.setdefault("last_name", last.strip())
        elif len(parts) >= 2:
            out.setdefault("first_name", " ".join(parts[:-1]))
            out.setdefault("last_name", parts[-1])
    return out


def columns(imp: Import) -> list[ColumnOut]:
    cols = {c.key: c for c in FIELDS[imp.kind]}
    out = []
    for i, header in enumerate(imp.headers):
        samples = [r[i] for r in imp.rows[:50] if i < len(r) and r[i]]
        example = samples[0] if samples else ""
        key = imp.mapping.get(header)
        if not key:
            out.append(ColumnOut(header=header, example=example, field=None, status="ignored", note="Ignored"))
            continue
        col = cols[key]
        if col.type == "date":
            fmt, two = date_format(samples)
            bad = [s for s in samples if normalize("date", s) is None]
            if bad:
                out.append(ColumnOut(header=header, example=example, field=key, status="warn",
                                     note=f"{len(bad)} not a date"))
            elif two:
                years = sorted({normalize("date", s)[:4] for s in samples if normalize("date", s)})
                out.append(ColumnOut(header=header, example=example, field=key, status="warn",
                                     note=f"2-digit years → {years[-1] if years else '20xx'}"))
            else:
                out.append(ColumnOut(header=header, example=example, field=key, status="format", note=fmt or "Matched"))
        elif col.type == "state" and samples and any(normalize("state", s) is None for s in samples):
            out.append(ColumnOut(header=header, example=example, field=key, status="warn", note="Some aren't states"))
        else:
            out.append(ColumnOut(header=header, example=example, field=key, status="matched", note="Matched"))
    return out


def _existing(db: Session, kind: str):
    if kind == "drivers":
        drivers = list(db.scalars(select(Driver)))
        by_cdl = {re.sub(r"\s", "", d.cdl_number or "").upper(): d for d in drivers if d.cdl_number}
        by_email = {(d.email or "").lower(): d for d in drivers if d.email}
        return by_cdl, by_email
    model = Vehicle if kind == "trucks" else Trailer
    units = list(db.scalars(select(model)))
    return {u.unit_number.upper(): u for u in units}, {(u.vin or "").upper(): u for u in units if u.vin}


def check(db: Session, p: Principal, imp: Import) -> tuple[list[RowIssue], set[int], dict[int, object]]:
    """Every row's problems. Returns the issues, the rows that can't be imported, and existing records by row."""
    issues: list[RowIssue] = []
    blocked: set[int] = set()
    existing: dict[int, object] = {}
    cols = {c.key: c for c in FIELDS[imp.kind]}
    first_keys: dict[tuple[str, str], int] = {}
    a, b = _existing(db, imp.kind)
    this_year = p.today().year
    for index, row in enumerate(imp.rows):
        n = index + 2  # the header is row 1
        v = _values(imp, row)
        problems: list[str] = []
        title = v.get("unit_number") or " ".join(x for x in (v.get("first_name"), v.get("last_name")) if x) or f"Row {n}"
        for key, text in v.items():
            col = cols.get(key)
            if col and col.type in ("date", "state", "int", "money") and normalize(col.type, text) is None:
                what = {"date": "a date", "state": "a state"}.get(col.type, "a number")
                problems.append(f"{col.label} “{text}” isn't {what}")
        if imp.kind == "drivers":
            if not (v.get("first_name") and v.get("last_name")):
                problems.append("No first and last name")
            keys = [("cdl", re.sub(r"\s", "", v.get("cdl_number", "")).upper()), ("email", v.get("email", "").lower())]
        else:
            if not v.get("unit_number"):
                problems.append("No unit number")
            if v.get("vin"):
                d = vins.decode(v["vin"], this_year)
                if not d.valid:
                    raw = v["vin"].upper()
                    hint = "; an I may be a 1" if "I" in raw else "; an O may be a 0" if "O" in raw else ""
                    failed = "fails the check digit" if "check digit" in (d.problem or "") else "is not valid"
                    problems.append(f"VIN {failed}{hint}")
            keys = [("unit", v.get("unit_number", "").upper()), ("vin", vins.clean(v.get("vin")))]
        for kind_key, value in keys:
            if not value:
                continue
            if (kind_key, value) in first_keys:
                same = {"unit": "unit number", "email": "email"}.get(kind_key, kind_key.upper())
                problems.append(f"Same {same} as row {first_keys[(kind_key, value)]}")
            else:
                first_keys[(kind_key, value)] = n
        if problems:
            blocked.add(n)
            issues.append(RowIssue(row=n, title=title, message=problems[0], tone="bad", actions=[], decision=None))
            continue
        match = None
        if imp.kind == "drivers":
            cdl = re.sub(r"\s", "", v.get("cdl_number", "")).upper()
            match = (a.get(cdl) if cdl else None) or (b.get(v.get("email", "").lower()) if v.get("email") else None)
            what = "the same CDL number" if cdl and a.get(cdl) else "the same email"
        else:
            vin = vins.clean(v.get("vin"))
            match = (b.get(vin) if vin else None) or a.get(v.get("unit_number", "").upper())
            what = "the same VIN" if vin and b.get(vin) else "the same unit number"
        if match is not None:
            existing[n] = match
            issues.append(RowIssue(row=n, title=title, message=f"Already in FlyFleet with {what}", tone="warn",
                                   actions=["update", "skip"], decision=imp.decisions.get(str(n), "skip")))
    return issues, blocked, existing


def view(db: Session, p: Principal, imp: Import) -> ImportOut:
    cols = columns(imp)
    mapped = {c.field for c in cols if c.field}
    have = set(mapped) | ({"name"} if {"full_name"} <= mapped or {"first_name", "last_name"} <= mapped else set())
    missing = [NEEDED_LABEL[k] for k in NEEDED[imp.kind] if k not in have]
    issues, blocked, _ = check(db, p, imp) if imp.status == "mapping" else ([], set(), {})
    look = [i for i in issues if i.tone == "warn"]
    return ImportOut(
        id=str(imp.id), kind=imp.kind, filename=imp.filename, sheet=imp.sheet, status=imp.status, rows=len(imp.rows),
        columns=cols, fields=[FieldOption(key=c.key, label=c.label) for c in FIELDS[imp.kind]],
        matched=len([c for c in cols if c.field]), covered=not missing, missing=missing,
        ready=len(imp.rows) - len(blocked) - len(look), look=len(look), cant=len(blocked), issues=issues,
        result=imp.result)


def create(db: Session, p: Principal, kind: str, filename: str, data: bytes) -> Import:
    if kind not in FIELDS:
        raise Invalid("Choose drivers, trucks or trailers", field="kind")
    headers, rows, sheet = parse(filename, data)
    imp = Import(organization_id=p.org_id, kind=kind, filename=filename[:255], sheet=sheet, headers=headers,
                 rows=rows, mapping=suggest(kind, headers), created_by=p.user_id)
    db.add(imp)
    db.flush()
    audit(db, p, "import.started", "import", imp.id, {"kind": kind, "filename": filename, "rows": len(rows)})
    return imp


def set_mapping(imp: Import, mapping: dict[str, str | None], decisions: dict[str, str]) -> None:
    if imp.status != "mapping":
        raise Conflict("This import is finished", code="IMPORT_DONE")
    keys = {c.key for c in FIELDS[imp.kind]}
    clean: dict[str, str] = {}
    for header, key in mapping.items():
        if header not in imp.headers:
            raise Invalid(f"No column called {header}", field="mapping")
        if key:
            if key not in keys:
                raise Invalid(f"{key} isn't a field of {imp.kind}", field="mapping")
            if key in clean.values():
                raise Invalid(f"Two columns can't both fill {next(c.label for c in FIELDS[imp.kind] if c.key == key)}",
                              field="mapping")
            clean[header] = key
    imp.mapping = clean
    imp.decisions = {k: v for k, v in decisions.items() if v in ("update", "skip")}


# ---------------------------------------------------------------- saving
def _record(imp: Import, v: dict[str, str]) -> dict:
    cols = {c.key: c for c in FIELDS[imp.kind]}
    data = {}
    for key, text in v.items():
        col = cols.get(key)
        if col is None or key == "full_name":
            continue
        value = normalize(col.type, text)
        if value is None:
            continue
        if key == "make":
            value = make_name(value) or value
        if key == "type":
            known = equipment_type(value)
            if known is None:
                data["type_other"] = value[:40]  # kept as the company calls it
            value = known or "other"
        if key == "pay_type":
            low = value.lower()
            value = "percent" if "%" in low or "percent" in low else "flat" if "flat" in low or "load" in low else "per_mile"
        if key == "cdl_class":
            value = value.upper().replace("CLASS", "").strip()[:1] or None
        data[key] = value
    return data


def commit(db: Session, p: Principal, imp: Import, reminders: bool) -> dict:
    """Create the ready rows and update the ones chosen for it, through each record's own rules."""
    from app.modules.drivers.router import DriverCreate, DriverUpdate
    from app.modules.drivers.router import _before_save as driver_save
    from app.modules.equipment.router import (
        TrailerCreate,
        TrailerUpdate,
        VehicleCreate,
        VehicleUpdate,
        _trailer_save,
        _vehicle_save,
    )
    if imp.status != "mapping":
        raise Conflict("This import is finished", code="IMPORT_DONE")
    issues, blocked, existing = check(db, p, imp)
    model, create_schema, update_schema, before_save, entity = {
        "drivers": (Driver, DriverCreate, DriverUpdate, driver_save, "driver"),
        "trucks": (Vehicle, VehicleCreate, VehicleUpdate, _vehicle_save, "vehicle"),
        "trailers": (Trailer, TrailerCreate, TrailerUpdate, _trailer_save, "trailer"),
    }[imp.kind]
    created, updated, skipped, failed = 0, 0, 0, []
    due_soon = []
    for index, row in enumerate(imp.rows):
        n = index + 2
        if n in blocked:
            skipped += 1
            continue
        data = _record(imp, _values(imp, row))
        target = existing.get(n)
        try:
            if target is not None:
                if imp.decisions.get(str(n)) != "update":
                    skipped += 1
                    continue
                changes = update_schema(**data).model_dump(exclude_unset=True)
                before_save(db, p, changes, target)
                for k, value in changes.items():
                    setattr(target, k, value)
                db.flush()
                audit(db, p, f"{entity}.updated", entity, target.id, {"import_id": str(imp.id), "row": n})
                updated += 1
                unit = target
            else:
                body = create_schema(**data).model_dump()
                before_save(db, p, body, None)
                unit = model(organization_id=p.org_id, **body)
                db.add(unit)
                db.flush()
                audit(db, p, f"{entity}.created", entity, unit.id, {"import_id": str(imp.id), "row": n})
                created += 1
        except ValidationError as e:
            failed.append({"row": n, "message": "; ".join(err["msg"] for err in e.errors())[:200]})
            continue
        except (Invalid, Conflict) as e:
            failed.append({"row": n, "message": e.message})
            continue
        if reminders and imp.kind != "drivers":
            for label, when in (("registration", unit.registration_expiry), ("annual inspection", unit.inspection_expiry)):
                if when and when <= p.today() + timedelta(days=60):
                    due_soon.append({"unit": unit.unit_number, "what": label, "on": when.isoformat()})
    imp.status = "committed"
    imp.committed_at = datetime.now(UTC)
    imp.result = {"created": created, "updated": updated, "skipped": skipped, "failed": failed, "due_soon": due_soon}
    audit(db, p, "import.committed", "import", imp.id, {"kind": imp.kind, "created": created, "updated": updated,
                                                        "skipped": skipped, "failed": len(failed)})
    return imp.result


def counts(db: Session, kind: str) -> int:
    model = {"drivers": Driver, "trucks": Vehicle, "trailers": Trailer}[kind]
    return db.scalar(select(func.count()).select_from(model)) or 0
