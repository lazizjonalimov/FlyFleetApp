"""US places by name and position: for saying where a truck is ("southbound near Temple, TX") and for putting a
stop's city on the map. Every US place of at least 10,000 people, from GeoNames (geonames.org, CC BY 4.0)."""
import json
import math
from functools import lru_cache
from pathlib import Path

from app.core.states import code_of

Place = tuple[str, str, float, float, int]  # name, state, latitude, longitude, population
COMPASS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")
BOUND = {"N": "Northbound", "S": "Southbound", "E": "Eastbound", "W": "Westbound", "NE": "Heading northeast",
         "SE": "Heading southeast", "SW": "Heading southwest", "NW": "Heading northwest"}


@lru_cache
def _places() -> list[Place]:
    rows = json.loads((Path(__file__).parent / "data" / "us_places.json").read_text())
    return [(r[0], r[1], float(r[2]), float(r[3]), int(r[4])) for r in rows]


SHORT = {"st": "saint", "ste": "sainte", "ft": "fort", "mt": "mount"}


def _key(name: str) -> str:
    """A place name as compared: lower case, with St., Ft. and Mt. spelled out as GeoNames spells them."""
    words = name.strip().lower().replace(".", " ").split()
    if words and words[0] in SHORT:
        words[0] = SHORT[words[0]]
    return " ".join(words)


@lru_cache
def _by_name() -> dict[tuple[str, str], tuple[float, float]]:
    out: dict[tuple[str, str], tuple[float, float]] = {}
    for name, state, lat, lon, _ in _places():  # largest first, so the bigger of two same-named places wins
        out.setdefault((_key(name), state), (lat, lon))
    return out


def km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(min(1.0, a)))


def bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def compass(degrees: float) -> str:
    return COMPASS[int(((degrees % 360) + 22.5) // 45) % 8]


def nearest(lat: float, lon: float, within_km: float = 80) -> tuple[str, str, float, float, float] | None:
    """The place to name a position by: the closest one, or a much bigger one barely farther away (Waco rather
    than a suburb of it). Its name, state, distance, and where it is."""
    near: list[tuple[float, Place]] = []
    for place in _places():
        _, _, la, lo, _ = place
        if abs(la - lat) > 1.0 or abs(lo - lon) > 1.4:
            continue
        d = km(lat, lon, la, lo)
        if d <= within_km:
            near.append((d, place))
    if not near:
        return None
    closest = min(d for d, _ in near)
    d, (name, state, la, lo, _) = max((x for x in near if x[0] <= closest * 1.6 + 3), key=lambda x: x[1][4])
    return name, state, d, la, lo


def locate(city: str | None, state: str | None) -> tuple[float, float] | None:
    """Where a city is, by its name and state; None when it isn't one of the places known."""
    code = code_of(state or "")
    if not city or not code:
        return None
    return _by_name().get((_key(city), code))


def describe(lat: float, lon: float, heading: float | None = None, moving: bool = False) -> str:
    """Where a truck is, in words: "Southbound near Temple, TX", or "12 mi NE of Temple, TX" farther out."""
    found = nearest(lat, lon)
    if found is None:
        return f"{lat:.3f}, {lon:.3f}"
    name, state, d, la, lo = found
    miles = d / 1.609
    if miles <= 8:
        where = f"near {name}, {state}"
    else:
        where = f"{miles:.0f} mi {compass(bearing(la, lo, lat, lon))} of {name}, {state}"
    if moving and heading is not None:
        return f"{BOUND[compass(heading)]} {where}"
    return where[0].upper() + where[1:]
