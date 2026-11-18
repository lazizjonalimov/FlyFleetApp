"""The built-in reader: documents that are PDFs with their text in them (most registrations, rate confirmations
and fuel statements e-mailed as PDFs) are read straight from the text, with where each value sits on the page.
No image clean-up and no outside service. A scanned PDF has no text layer and goes to the photo reader."""
import io
import re
from dataclasses import dataclass, field

import pdfplumber

from app.core.states import code_of
from app.modules.intake import normalize as norm
from app.modules.intake import vin as vins
from app.modules.intake.fields import KINDS

MAX_PAGES = 6


@dataclass
class Word:
    text: str
    x0: float
    top: float
    x1: float
    bottom: float


@dataclass
class Line:
    page: int
    words: list[Word]
    width: float
    height: float

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)


@dataclass
class Read:
    """One value read from a document: what it is, how sure the reader is, and where it sits (fractions of the
    page: x0, y0, x1, y1)."""
    key: str
    value: str
    confidence: float
    page: int = 1
    box: list[float] = field(default_factory=list)
    source: str = ""


@dataclass
class Result:
    fields: list[Read]
    violations: list[dict]
    pages: int
    reader: str


def _lines(data: bytes) -> tuple[list[Line], int]:
    out: list[Line] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        count = len(pdf.pages)
        for number, page in enumerate(pdf.pages[:MAX_PAGES], 1):
            words = [Word(w["text"], w["x0"], w["top"], w["x1"], w["bottom"])
                     for w in page.extract_words(x_tolerance=2, y_tolerance=3, keep_blank_chars=False)]
            words.sort(key=lambda w: (round(w.top), w.x0))
            current: list[Word] = []
            for w in words:
                if current and abs(w.top - current[0].top) > 3:
                    out.append(Line(number, sorted(current, key=lambda x: x.x0), page.width, page.height))
                    current = []
                current.append(w)
            if current:
                out.append(Line(number, sorted(current, key=lambda x: x.x0), page.width, page.height))
    return out, count


def _box(line: Line, words: list[Word]) -> list[float]:
    if not words:
        return []
    return [round(min(w.x0 for w in words) / line.width, 4), round(min(w.top for w in words) / line.height, 4),
            round(max(w.x1 for w in words) / line.width, 4), round(max(w.bottom for w in words) / line.height, 4)]


def _after_label(line: Line, label: str, stops: frozenset[str] = frozenset()) -> tuple[list[Word], float] | None:
    """Words after a label on the same line, and the x where the label starts."""
    text = line.text.lower()
    m = re.search(r"(?<![a-z0-9])" + re.escape(label) + r"(?![a-z0-9])\s*[:#.]?", text)
    if not m:
        return None
    starts, pos = [], 0
    for w in line.words:
        starts.append(pos)
        pos += len(w.text) + 1
    first = max(i for i, at in enumerate(starts) if at <= m.start())
    last = max(i for i, at in enumerate(starts) if at <= max(m.end() - 1, m.start()))
    rest = line.words[last + 1:]
    if rest and rest[0].text.strip(":#.-") == "":
        rest = rest[1:]
    if rest and rest[0].x0 - line.words[last].x1 > 0.08 * line.width:
        rest = []  # the next words belong to another column
    # Stop at a wide gap or at the next field's label: form lines carry several fields.
    kept: list[Word] = []
    for w in rest:
        if kept and (w.x0 - kept[-1].x1 > 0.05 * line.width or w.text.lower().strip(":#.") in stops):
            break
        kept.append(w)
    return kept, line.words[first].x0


def _below(lines: list[Line], index: int, x: float) -> list[Word]:
    """The value under a label: words on the next line that start near the label's column."""
    line = lines[index]
    for nxt in lines[index + 1:index + 3]:
        if nxt.page != line.page:
            return []
        words = [w for w in nxt.words if x - 0.04 * nxt.width <= w.x0 <= x + 0.3 * nxt.width]
        kept: list[Word] = []
        for w in words:
            if kept and w.x0 - kept[-1].x1 > 0.08 * nxt.width:
                break
            kept.append(w)
        if kept:
            return kept
    return []


def _labelled(lines: list[Line], labels: tuple[str, ...], kind: str,
              stops: frozenset[str] = frozenset()) -> tuple[str, float, Line, list[Word]] | None:
    for label in labels:
        for i, line in enumerate(lines):
            found = _after_label(line, label, stops)
            if found is None:
                continue
            words, x = found
            candidates = [(words, 0.92, line)]
            if not words and kind in ("money", "price", "decimal", "int"):
                # Receipts and statements print amounts in a column at the right of the same line.
                right = [w for w in line.words if w.x0 > x and re.search(r"\d", w.text)]
                if right:
                    candidates.append(([right[-1]], 0.9, line))
            candidates.append((_below(lines, i, x), 0.86, None))
            for candidate, sure, where in candidates:
                if not candidate:
                    continue
                text = " ".join(w.text for w in candidate)
                value = norm.normalize(kind, text)
                if kind == "date" and value is None and (m := norm.DATE_PATTERN.search(text)):
                    value = norm.normalize("date", m[1])
                if kind in ("money", "int") and value is None and (m := norm.MONEY_PATTERN.search(text)):
                    value = norm.normalize(kind, m[1])
                if value:
                    ref = where or lines[min(i + 1, len(lines) - 1)]
                    return value, sure, ref, candidate
    return None


def _vin(lines: list[Line], this_year: int) -> Read | None:
    best: Read | None = None
    for line in lines:
        for w in line.words:
            token = vins.clean(w.text)
            if len(token) == 17 and vins.PATTERN.fullmatch(token):
                decoded = vins.decode(token, this_year)
                read = Read("vin", token, 0.98 if decoded.valid else 0.62, line.page, _box(line, [w]), "text")
                if best is None or read.confidence > best.confidence:
                    best = read
    return best


def _places(lines: list[Line], labels: tuple[str, ...]) -> tuple[Read, Read, Read | None] | None:
    """City and state (and a date) in the few lines under a pickup or delivery heading, in its column."""
    for label in labels:
        for i, line in enumerate(lines):
            found = _after_label(line, label)
            if found is None:
                continue
            x = found[1]
            column = []
            for nxt in lines[i:i + 7]:
                if nxt.page != line.page:
                    break
                words = [w for w in nxt.words if x - 0.04 * nxt.width <= w.x0 <= x + 0.38 * nxt.width]
                if words:
                    column.append((nxt, words))
            when = None
            for nxt, words in column:
                if dm := norm.DATE_PATTERN.search(" ".join(w.text for w in words)):
                    iso = norm.normalize("date", dm[1])
                    if iso:
                        when = Read("", iso, 0.8, nxt.page, _box(nxt, [w for w in words if w.text in dm[1]]), "text")
                        break
            for nxt, words in column:
                text = " ".join(w.text for w in words)
                m = re.search(r"([A-Za-z][A-Za-z .'-]{1,40}),\s*([A-Za-z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?", text)
                if m and code_of(m[2]):
                    city_words = [w for w in words if w.text.strip(",") in m[1].split()]
                    city = m[1].strip().title() if m[1].isupper() else m[1].strip()
                    state_words = [w for w in words if m[2] in w.text]
                    return (Read("", city, 0.84, nxt.page, _box(nxt, city_words), "text"),
                            Read("", code_of(m[2]) or "", 0.9, nxt.page, _box(nxt, state_words), "text"),
                            when)
    return None


def _receipt_head(lines: list[Line], found: dict[str, "Read"]) -> None:
    """A receipt opens with the station, then its address: the name, the city and state, and the date somewhere."""
    head = [ln for ln in lines if ln.page == 1][:8]
    if "vendor" not in found:
        name = next((ln for ln in head if re.search(r"[A-Za-z]{3}", ln.text)
                     and not re.search(r"receipt|thank|copy|customer", ln.text, re.I)), None)
        if name:
            text = name.text.strip()
            found["vendor"] = Read("vendor", (text.title() if text.isupper() else text)[:120], 0.7, name.page,
                                   _box(name, name.words), "text")
    if "state" not in found or "city" not in found:
        for ln in head:
            m = re.search(r"([A-Za-z][A-Za-z .'-]{1,40}),\s*([A-Za-z]{2})\b", ln.text)
            if m and code_of(m[2]):
                city = m[1].strip()
                found.setdefault("city", Read("city", city.title() if city.isupper() else city, 0.84, ln.page,
                                              _box(ln, [w for w in ln.words if w.text.strip(",") in m[1].split()]), "text"))
                found.setdefault("state", Read("state", code_of(m[2]) or "", 0.9, ln.page,
                                               _box(ln, [w for w in ln.words if m[2] in w.text]), "text"))
                break
    if "paid_with" not in found:
        for ln in lines:
            if m := re.search(r"\b(CASH|WEX|COMDATA|EFS|ATOB|FLEET ?ONE|TCH|T-CHEK|VISA|MASTERCARD|AMEX|DEBIT)\b",
                              ln.text, re.I):
                word = m[1].upper().replace(" ", "")
                how = "cash" if word == "CASH" else "company_card" if word in ("VISA", "MASTERCARD", "AMEX", "DEBIT") \
                    else "fuel_card"
                found["paid_with"] = Read("paid_with", how, 0.9, ln.page, _box(ln, [w for w in ln.words
                                                                                   if m[1].split()[0].lower() in w.text.lower()]),
                                          "text")
                break
    if "purchased_on" not in found:
        for ln in lines:
            if dm := norm.DATE_PATTERN.search(ln.text):
                iso = norm.normalize("date", dm[1])
                if iso:
                    found["purchased_on"] = Read("purchased_on", iso, 0.85, ln.page,
                                                 _box(ln, [w for w in ln.words if w.text in dm[1]]), "text")
                    break


def read(data: bytes, kind: str, this_year: int) -> Result | None:
    """The fields of a text PDF; None when the PDF has no text to read (a scan)."""
    try:
        lines, pages = _lines(data)
    except Exception:  # a damaged or encrypted PDF is left to the photo reader
        return None
    if sum(len(line.text) for line in lines) < 25:
        return None
    _, specs = KINDS[kind]
    found: dict[str, Read] = {}
    for spec in specs:
        if spec.type == "vin":
            continue
        if not spec.labels:
            continue
        stops = frozenset(label for other in specs if other is not spec for label in other.labels if " " not in label)
        hit = _labelled(lines, spec.labels, spec.type, stops)
        if hit:
            value, sure, line, words = hit
            if spec.key == "make":
                value = norm.make_name(value) or value
            if spec.key == "equipment_type":
                value = norm.equipment_type(value) or value
            found[spec.key] = Read(spec.key, value, sure, line.page, _box(line, words), "text")
    if any(s.type == "vin" for s in specs):
        v = _vin(lines, this_year)
        if v:
            v.key = next(s.key for s in specs if s.type == "vin")
            found[v.key] = v
    if kind == "rate_confirmation":
        for side, labels in (("pickup", ("shipper", "pickup", "pick up", "origin")),
                             ("delivery", ("consignee", "receiver", "delivery", "destination"))):
            place = _places(lines, labels)
            if place:
                city, state, when = place
                for key, got in ((f"{side}_city", city), (f"{side}_state", state), (f"{side}_date", when)):
                    if got:
                        found.setdefault(key, Read(key, got.value, got.confidence, got.page, got.box, "text"))
        if "customer_name" not in found:
            head = next((ln for ln in lines if ln.page == 1 and re.search(r"[A-Za-z]{3}", ln.text)
                         and not re.search(r"rate|confirmation|load|page", ln.text, re.I)), None)
            if head:
                found["customer_name"] = Read("customer_name", head.text.strip()[:120], 0.55, head.page,
                                              _box(head, head.words), "text")
    if kind == "fuel_receipt":
        _receipt_head(lines, found)
    violations: list[dict] = []
    if kind == "inspection_report":
        for line in lines:
            if m := re.search(r"\b(3[89]\d\.\d+[A-Za-z0-9()]*)\s+(.+)$", line.text):
                rest = m[2]
                # The report's columns after the code, when it has them: the unit (1 the truck, 2 the trailer) and
                # whether it was put out of service (Y/N).
                cols = re.match(r"(\d)\s+([YN])\s+(.+)$", rest)
                description = (cols[3] if cols else rest)[:200].strip()
                oos = (cols[2] == "Y") if cols else bool(re.search(r"\bOOS\b|out of service", line.text, re.I))
                violations.append({"code": m[1], "description": description, "out_of_service": oos,
                                   "unit": cols[1] if cols else "", "box": _box(line, line.words), "page": line.page})
        if violations and "out_of_service" not in found:
            oos = any(v["out_of_service"] for v in violations)
            found["out_of_service"] = Read("out_of_service", "Yes" if oos else "No", 0.8, 1, [], "text")
    return Result(fields=list(found.values()), violations=violations, pages=pages, reader="text")
