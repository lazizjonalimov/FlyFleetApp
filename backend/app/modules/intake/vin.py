"""Vehicle identification numbers: checked and decoded without calling anyone.

A VIN is 17 characters with no I, O or Q. The ninth is a check digit worked out from the other sixteen, so a
misread character is caught. The tenth gives the model year (a 30-year cycle), and the first three (the world
manufacturer identifier) name the maker. The table below covers the truck and trailer makers common in North
American fleets; a VIN from any other maker is still checked, just not named.
"""
import re
from dataclasses import dataclass

_VALUES = {**{str(d): d for d in range(10)},
           **dict(zip("ABCDEFGH", range(1, 9), strict=True)), **dict(zip("JKLMN", range(1, 6), strict=True)),
           "P": 7, "R": 9, **dict(zip("STUVWXYZ", range(2, 10), strict=True))}
_WEIGHTS = (8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2)
_YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789"  # 1980..2009, then again from 2010
PATTERN = re.compile(r"\b[A-HJ-NPR-Z0-9]{17}\b")

MAKERS = {
    "1FU": "Freightliner", "1FV": "Freightliner", "3AK": "Freightliner", "3AL": "Freightliner", "4UZ": "Freightliner",
    "5KJ": "Western Star", "5KK": "Western Star", "2WK": "Western Star", "2WL": "Western Star",
    "1XK": "Kenworth", "2XK": "Kenworth", "1NK": "Kenworth", "2NK": "Kenworth", "3BK": "Kenworth",
    "1XP": "Peterbilt", "2XP": "Peterbilt", "1NP": "Peterbilt", "2NP": "Peterbilt", "3BP": "Peterbilt",
    "4V4": "Volvo", "4V5": "Volvo", "4VG": "Volvo", "4VH": "Volvo",
    "1M1": "Mack", "1M2": "Mack",
    "1HS": "International", "1HT": "International", "2HS": "International", "3HS": "International", "3HT": "International",
    "5PV": "Hino", "JHB": "Hino", "JAL": "Isuzu", "5VC": "Autocar",
    "1UY": "Utility", "1JJ": "Wabash", "1GR": "Great Dane", "3H3": "Hyundai Translead", "1DW": "Stoughton",
    "5V8": "Vanguard", "13N": "Fontaine", "2M5": "Manac",
}


@dataclass
class Vin:
    vin: str
    valid: bool
    problem: str | None
    year: int | None
    make: str | None


def clean(text: str | None) -> str:
    return re.sub(r"[\s-]", "", text or "").upper()


def check_digit(vin: str) -> str:
    total = sum(_VALUES[c] * w for c, w in zip(vin, _WEIGHTS, strict=True))
    return "X" if total % 11 == 10 else str(total % 11)


def model_year(code: str, latest: int) -> int | None:
    """The newest year the code can stand for that isn't after `latest` (next year's models sell this year)."""
    if code not in _YEAR_CODES:
        return None
    first = 1980 + _YEAR_CODES.index(code)
    candidates = [first + 30 * k for k in range(4) if first + 30 * k <= latest]
    return candidates[-1] if candidates else None


def decode(text: str | None, this_year: int) -> Vin:
    vin = clean(text)
    if len(vin) != 17:
        return Vin(vin, False, "A VIN has 17 characters", None, None)
    if re.search(r"[IOQ]", vin):
        return Vin(vin, False, "A VIN never has I, O or Q; check for a 1 or a 0", None, None)
    if not re.fullmatch(r"[A-Z0-9]{17}", vin):
        return Vin(vin, False, "A VIN has only letters and digits", None, None)
    year = model_year(vin[9], this_year + 1)
    make = MAKERS.get(vin[:3])
    if check_digit(vin) != vin[8]:
        return Vin(vin, False, "The check digit doesn't match: one character is probably misread", year, make)
    return Vin(vin, True, None, year, make)
