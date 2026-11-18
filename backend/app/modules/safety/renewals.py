"""What an approved document renews. A reminder never marks anything compliant; a reviewer approving the
replacement does, and the record it is filed with takes the new date."""
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.deps import Principal
from app.modules.documents.models import Document, DocumentLink
from app.modules.drivers.models import Driver, DriverQualification
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.safety.rules import ITEM_LABELS, RENEWED_BY, fmt

# Items that are on file once, with no expiry: a road test certificate, a pre-employment drug test.
ONCE = ("road_test", "drug_test")


def _later(current: date | None, new: date | None) -> bool:
    return new is not None and (current is None or new > current)


def renew(db: Session, p: Principal, doc: Document) -> list[str]:
    """Put an approved document's date on the records it is filed with. Returns what changed, as sentences."""
    done: list[str] = []
    for link in db.scalars(select(DocumentLink).where(DocumentLink.document_id == doc.id)):
        item = RENEWED_BY.get(link.entity_type, {}).get(doc.type)
        if item is None or link.entity_type == "organization":
            continue  # a company document is its own record
        label = ITEM_LABELS.get(item, item)
        until = f" to {fmt(doc.expires_on)}" if doc.expires_on else ""
        if link.entity_type == "driver":
            driver = db.get(Driver, link.entity_id)
            if driver is None:
                continue
            if item in ("cdl", "medical"):
                field = "cdl_expiry" if item == "cdl" else "medical_cert_expiry"
                if _later(getattr(driver, field), doc.expires_on):
                    setattr(driver, field, doc.expires_on)
                    done.append(f"{label} on file{until}")
                    audit(db, p, "driver.renewed", "driver", driver.id, {"item": item, "expires_on": str(doc.expires_on),
                                                                       "document_id": str(doc.id)})
                continue
            if doc.expires_on is None and item not in ONCE:
                continue  # an MVR review or clearinghouse query without the date it runs to renews nothing
            held = db.scalar(select(DriverQualification).where(
                DriverQualification.driver_id == driver.id, DriverQualification.type == item,
                DriverQualification.expires_on.is_(None) if doc.expires_on is None
                else DriverQualification.expires_on >= doc.expires_on))
            if held is not None:
                continue
            db.add(DriverQualification(organization_id=p.org_id, driver_id=driver.id, type=item,
                                       expires_on=doc.expires_on, reference=doc.filename[:80],
                                       notes="From an approved document"))
            done.append(f"{label} on file{until}")
            audit(db, p, "driver.renewed", "driver", driver.id, {"item": item, "expires_on": str(doc.expires_on),
                                                               "document_id": str(doc.id)})
        else:
            unit = db.get(Vehicle if link.entity_type == "vehicle" else Trailer, link.entity_id)
            field = f"{item}_expiry"
            if unit is not None and _later(getattr(unit, field), doc.expires_on):
                setattr(unit, field, doc.expires_on)
                done.append(f"{label} on file{until}")
                audit(db, p, f"{link.entity_type}.renewed", link.entity_type, unit.id,
                      {"item": item, "expires_on": str(doc.expires_on), "document_id": str(doc.id)})
    return done
