"""Roadside inspections as FMCSA scores them: the BASIC and severity weight of common violations, the points an
out-of-service order adds, how much an inspection weighs by its age, and the national out-of-service rates a
carrier is compared with. Reference data, from the SMS methodology (Appendix A) and the SAFER company snapshot;
a code not listed here keeps the points its report or the reviewer gives it."""
from datetime import date

BASICS = {
    "vehicle_maintenance": "Vehicle Maintenance", "hos": "Hours-of-Service Compliance",
    "driver_fitness": "Driver Fitness", "unsafe_driving": "Unsafe Driving",
    "substances": "Controlled Substances/Alcohol", "hazmat": "Hazardous Materials Compliance",
}

# Code -> (description, BASIC, severity weight)
VIOLATIONS: dict[str, tuple[str, str, int]] = {
    "393.75(a)(3)": ("Tire flat or audible air leak", "vehicle_maintenance", 8),
    "393.47(e)": ("Clamp-type brake out of adjustment", "vehicle_maintenance", 4),
    "393.48(a)": ("Inoperative or defective brakes", "vehicle_maintenance", 4),
    "393.9(a)": ("Inoperable required lamp", "vehicle_maintenance", 6),
    "396.3(a)(1)": ("Inspection, repair and maintenance of parts and accessories", "vehicle_maintenance", 4),
    "391.41(a)": ("Medical card not in possession", "driver_fitness", 1),
    "392.16": ("Seat belt not used", "unsafe_driving", 7),
    "395.8(e)": ("False record of duty status", "hos", 7),
}

# An out-of-service order adds this to the violation's severity.
OUT_OF_SERVICE_POINTS = 2

# The national out-of-service rates (percent) on the SAFER company snapshot.
NATIONAL_OOS = {"vehicle": 22.26, "driver": 6.67}

# What each inspection level looks at: the vehicle, the driver, or both.
LEVELS = {1: "Full inspection", 2: "Walk-around", 3: "Driver only", 4: "Special study", 5: "Vehicle only",
          6: "Radioactive shipment"}
VEHICLE_LEVELS = (1, 2, 5, 6)
DRIVER_LEVELS = (1, 2, 3, 6)


def lookup(code: str | None) -> tuple[str, str, int] | None:
    """The reference entry for a code as written on a report: "393.75(a)(3)", "393.75 (a)(3)" or "393.75A3"."""
    if not code:
        return None
    key = code.replace(" ", "")
    if key in VIOLATIONS:
        return VIOLATIONS[key]
    plain = key.lower().replace("(", "").replace(")", "")
    for known, entry in VIOLATIONS.items():
        if known.lower().replace("(", "").replace(")", "") == plain:
            return entry
    return None


def points_of(code: str | None, out_of_service: bool, given: int | None = None) -> int | None:
    """A violation's severity points: the weight of its code, plus two when it put the unit or driver out of
    service. None when the code isn't known and no points were given."""
    if given is not None:
        return given
    entry = lookup(code)
    if entry is None:
        return None
    return entry[2] + (OUT_OF_SERVICE_POINTS if out_of_service else 0)


def time_weight(inspected_on: date, today: date) -> int:
    """How much an inspection counts in the SMS: three times in its first six months, twice to a year, once to
    two years, not at all after."""
    days = (today - inspected_on).days
    return 3 if days <= 182 else 2 if days <= 365 else 1 if days <= 730 else 0
