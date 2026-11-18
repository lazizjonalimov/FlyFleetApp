"""Compliance rules: what is expired, what is about to expire, and what that means for dispatch.

This is the only place that decides it. The driver and equipment lists, the assignment panel, the expirations
queue and the dashboard all ask here, so they can never disagree.
"""
from datetime import date, timedelta
from typing import Literal

from pydantic import BaseModel

# How far ahead an upcoming expiry starts to be flagged.
WARN_DAYS = 30

Severity = Literal["blocking", "warning", "info"]

QUALIFICATION_LABELS = {
    "mvr": "MVR review", "clearinghouse": "Clearinghouse query", "drug_test": "Drug test", "road_test": "Road test",
    "employment_application": "Employment application", "annual_review": "Annual review",
    "hazmat": "Hazmat endorsement", "twic": "TWIC card", "training": "Training", "other": "Qualification",
}
# The items of a carrier's own file: authority, insurance and registrations filed with the company.
ORGANIZATION_ITEMS = {"authority": "Operating authority", "insurance": "Liability insurance",
                      "ucr": "UCR registration", "ifta_license": "IFTA license"}
ITEM_LABELS = {
    "cdl": "CDL", "medical": "Medical card", "insurance": "Insurance", "registration": "Registration",
    "inspection": "Annual inspection", **QUALIFICATION_LABELS,
}
# The document that renews an item, by the record it is filed with. A reviewer approving one updates the record.
RENEWED_BY = {
    "driver": {"license": "cdl", "medical": "medical", "mvr": "mvr", "clearinghouse": "clearinghouse",
               "road_test": "road_test", "drug_test": "drug_test"},
    "vehicle": {"insurance": "insurance", "registration": "registration", "inspection": "inspection"},
    "trailer": {"insurance": "insurance", "registration": "registration", "inspection": "inspection"},
    "organization": {t: t for t in ORGANIZATION_ITEMS},
}


class FileItem(BaseModel):
    """One line of a company's driver qualification file."""
    type: str
    # Missing or expired, it keeps the driver off loads.
    blocks: bool = True


# The federal qualification file (49 CFR 391.51 and 382.701): the annual MVR review, the annual clearinghouse
# query, the road test certificate and the pre-employment drug test, on top of the CDL and medical card.
STANDARD_FILE = [FileItem(type="mvr"), FileItem(type="clearinghouse"), FileItem(type="road_test"),
                 FileItem(type="drug_test")]


class Issue(BaseModel):
    """blocking: must not be dispatched. warning: allowed, needs attention soon. info: nothing on file."""
    code: str
    message: str
    severity: Severity
    expires_on: date | None = None


class Compliance(BaseModel):
    status: Literal["ok", "expiring", "expired", "incomplete"]
    issues: list[Issue]


def fmt(d: date) -> str:
    return f"{d.strftime('%b')} {d.day}, {d.year}"


def dated(label: str, code: str, expires_on: date | None, today: date, *, blocks: bool = True,
          flag_missing: bool = True) -> Issue | None:
    """Judge one dated item. An item is good through its expiry date and expired the day after."""
    if expires_on is None:
        return Issue(code=f"{code}_MISSING", message=f"No {label} date on file", severity="info") \
            if flag_missing else None
    if expires_on < today:
        return Issue(code=f"{code}_EXPIRED", message=f"{label} expired on {fmt(expires_on)}",
                     severity="blocking" if blocks else "warning", expires_on=expires_on)
    if expires_on <= today + timedelta(days=WARN_DAYS):
        return Issue(code=f"{code}_EXPIRING", message=f"{label} expires on {fmt(expires_on)}",
                     severity="warning", expires_on=expires_on)
    return None


def latest(qualifications) -> dict[str, object]:
    """The record that counts for each kind of item: the one that runs longest (no expiry runs forever). A renewal
    supersedes the record it renews."""
    out: dict[str, object] = {}
    for q in qualifications:
        held = out.get(q.type)
        if held is None or (held.expires_on is not None and (q.expires_on is None or q.expires_on > held.expires_on)):
            out[q.type] = q
    return out


def lower(label: str) -> str:
    """ "Road test" -> "road test", while "MVR review" and "CDL" keep their capitals."""
    return label[0].lower() + label[1:] if len(label) > 1 and label[1].islower() else label


def missing(label: str, code: str, blocks: bool) -> Issue:
    return Issue(code=f"{code}_MISSING", message=f"No {lower(label)} on file",
                 severity="blocking" if blocks else "warning")


def driver_issues(driver, qualifications, today: date, checklist: list[FileItem] | None = None) -> list[Issue]:
    """A driver needs a CDL and a medical card on file and in date, and every item of the company's file."""
    found = [
        dated("CDL", "CDL", driver.cdl_expiry, today, flag_missing=False) if driver.cdl_expiry
        else missing("CDL", "CDL", True),
        dated("Medical card", "MEDICAL", driver.medical_cert_expiry, today, flag_missing=False)
        if driver.medical_cert_expiry else missing("Medical card", "MEDICAL", True),
    ]
    current = latest(qualifications)
    required = {item.type: item for item in checklist or []}
    for item in required.values():
        if item.type not in current:
            found.append(missing(QUALIFICATION_LABELS.get(item.type, "Qualification"),
                                 f"QUALIFICATION_{item.type.upper()}", item.blocks))
    for q in current.values():
        label = QUALIFICATION_LABELS.get(q.type, "Qualification")
        # Items of the company's file block as the file says; any other item only when marked as required.
        blocks = required[q.type].blocks if q.type in required else q.required
        found.append(dated(label, f"QUALIFICATION_{q.type.upper()}", q.expires_on, today, blocks=blocks,
                           flag_missing=False))
    return [i for i in found if i]


def unit_issues(unit, today: date) -> list[Issue]:
    """A truck or a trailer."""
    found = [
        dated("Insurance", "INSURANCE", unit.insurance_expiry, today),
        dated("Registration", "REGISTRATION", unit.registration_expiry, today),
        dated("Annual inspection", "INSPECTION", unit.inspection_expiry, today),
    ]
    return [i for i in found if i]


def summarize(issues: list[Issue]) -> Compliance:
    severities = {i.severity for i in issues}
    status = ("expired" if "blocking" in severities else "expiring" if "warning" in severities
              else "incomplete" if "info" in severities else "ok")
    order = {"blocking": 0, "warning": 1, "info": 2}
    return Compliance(status=status, issues=sorted(issues, key=lambda i: (order[i.severity], i.expires_on or date.max)))
