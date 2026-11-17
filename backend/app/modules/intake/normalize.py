"""Turning what a document or a spreadsheet says into values FlyFleet stores: dates, money, whole numbers, state
codes and lists. Each function returns None when the text can't be read as that kind of value."""
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.core.states import code_of
from app.modules.intake import vin as vins

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
DATE_PATTERN = re.compile(
    r"\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|"
    r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4}|"
    r"\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{2,4}|"
    r"\d{1,2}[/-]\d{2,4})\b", re.I)
MONEY_PATTERN = re.compile(r"\$?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)")


def _year(y: int) -> int:
    if y < 100:
        return 2000 + y if y < 70 else 1900 + y
    return y


def to_date(text: str | None, *, day_first: bool = False) -> date | None:
    """US order (month first) unless told otherwise; two-digit years are 2000-2069 or 1970-1999; a bare
    month and year ('11/27', as on a registration card) is the last day of that month."""
    if text is None:
        return None
    if isinstance(text, (date, datetime)):
        return text.date() if isinstance(text, datetime) else text
    t = str(text).strip().lower().replace(",", " ")
    t = re.sub(r"\s+", " ", t)
    try:
        if m := re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})(?:[ t].*)?", t):
            return date(int(m[1]), int(m[2]), int(m[3]))
        if m := re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})", t):
            a, b, y = int(m[1]), int(m[2]), _year(int(m[3]))
            month, day = (b, a) if day_first or a > 12 else (a, b)
            return date(y, month, day)
        if m := re.fullmatch(r"([a-z]{3})[a-z]*\.? (\d{1,2}) (\d{2,4})", t):
            return date(_year(int(m[3])), MONTHS[m[1]], int(m[2]))
        if m := re.fullmatch(r"(\d{1,2}) ([a-z]{3})[a-z]*\.? (\d{2,4})", t):
            return date(_year(int(m[3])), MONTHS[m[2]], int(m[1]))
        if m := re.fullmatch(r"(\d{1,2})[/-](\d{2}|\d{4})", t):
            month, y = int(m[1]), _year(int(m[2]))
            if 1 <= month <= 12:
                nxt = date(y + (month == 12), month % 12 + 1, 1)
                return date.fromordinal(nxt.toordinal() - 1)
    except (KeyError, ValueError):
        return None
    return None


def date_format(samples: list[str]) -> tuple[str | None, bool]:
    """The date format a column is written in, and whether it uses two-digit years."""
    shown = [s.strip() for s in samples if s and s.strip()]
    if not shown:
        return None, False
    two_digit = any(re.fullmatch(r"\d{1,2}[/.-]\d{1,2}[/.-]\d{2}", s) for s in shown)
    if all(re.fullmatch(r"\d{4}-\d{1,2}-\d{1,2}.*", s) for s in shown):
        return "YYYY-MM-DD", False
    if all(re.fullmatch(r"\d{1,2}/\d{1,2}/\d{2,4}", s) for s in shown):
        return ("M/D/YY" if two_digit else "MM/DD/YYYY"), two_digit
    return None, two_digit


def to_money(text: str | None) -> Decimal | None:
    if text is None:
        return None
    t = str(text).replace("USD", "").strip()
    m = MONEY_PATTERN.search(t)
    if not m:
        return None
    try:
        return Decimal(m[1].replace(",", "")).quantize(Decimal("0.01"))
    except InvalidOperation:
        return None


def to_int(text: str | None) -> int | None:
    digits = re.sub(r"[^\d]", "", str(text or "").split(".")[0])
    return int(digits) if digits and len(digits) <= 9 else None


def to_list(text: str | None) -> str | None:
    """'N H', 'n,h' or 'N/H' -> 'N, H'; 'NONE' -> None."""
    t = str(text or "").strip().upper()
    if not t or t in ("NONE", "N/A", "NA", "-"):
        return None
    parts = [x for x in re.split(r"[\s,/;]+", t) if x]
    return ", ".join(parts) if parts else None


def normalize(kind: str, text: str | None):
    """A value of a field type from its text: None when it doesn't read as one."""
    if text is None or str(text).strip() == "":
        return None
    if kind == "date":
        d = to_date(text)
        return d.isoformat() if d else None
    if kind == "money":
        m = to_money(text)
        return str(m) if m is not None else None
    if kind == "int":
        n = to_int(text)
        return str(n) if n is not None else None
    if kind == "state":
        return code_of(text)
    if kind == "vin":
        v = vins.clean(text)
        return v if len(v) == 17 else None
    if kind == "list":
        return to_list(text)
    return re.sub(r"\s+", " ", str(text)).strip()[:200] or None


TRAILER_WORDS = (("reefer", "reefer"), ("refrigerat", "reefer"), ("flatbed", "flatbed"), ("flat bed", "flatbed"),
                 ("step deck", "step_deck"), ("stepdeck", "step_deck"), ("tanker", "tanker"), ("tank", "tanker"),
                 ("box", "box_truck"), ("dry van", "dry_van"), ("van", "dry_van"), ("dry", "dry_van"))


def equipment_type(text: str | None) -> str | None:
    t = str(text or "").lower()
    return next((v for word, v in TRAILER_WORDS if word in t), None)


# Registration cards abbreviate makes (NCIC make codes).
MAKE_CODES = {"FRHT": "Freightliner", "FRTL": "Freightliner", "KW": "Kenworth", "KENW": "Kenworth", "PTRB": "Peterbilt",
              "PETE": "Peterbilt", "VOLV": "Volvo", "MACK": "Mack", "INTL": "International", "NAVI": "International",
              "WSTR": "Western Star", "HINO": "Hino", "ISU": "Isuzu", "ISZU": "Isuzu", "FORD": "Ford",
              "CHEV": "Chevrolet", "GMC": "GMC", "UTIL": "Utility", "WABA": "Wabash", "WBSH": "Wabash",
              "GDAN": "Great Dane", "GRDA": "Great Dane", "HYUN": "Hyundai Translead", "STOU": "Stoughton",
              "FONT": "Fontaine", "VANG": "Vanguard", "MANA": "Manac"}


def make_name(text: str | None) -> str | None:
    t = re.sub(r"[^A-Za-z ]", "", str(text or "")).strip()
    if not t:
        return None
    return MAKE_CODES.get(t.upper(), t.title() if t.isupper() and len(t) > 3 else t)
