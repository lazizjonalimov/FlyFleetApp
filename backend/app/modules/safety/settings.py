"""A company's qualification file and reminder rules, with the standard ones until the company changes them."""
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.modules.safety.models import ComplianceSettings
from app.modules.safety.rules import STANDARD_FILE, FileItem

LEAD_DAYS = [60, 30, 14, 7, 1]
CHANNELS = ["app"]
COPY_TO = ["safety_manager"]
RUN_HOUR = 2


def stored(db: Session) -> ComplianceSettings | None:
    return db.scalar(select(ComplianceSettings))


def settings_of(db: Session, org_id: uuid.UUID) -> ComplianceSettings:
    """The company's row, made with the standard settings the first time it is needed."""
    db.execute(insert(ComplianceSettings).values(
        id=uuid.uuid4(), organization_id=org_id, checklist=[i.model_dump() for i in STANDARD_FILE],
        lead_days=LEAD_DAYS, channels=CHANNELS, copy_to=COPY_TO, run_hour=RUN_HOUR,
    ).on_conflict_do_nothing(constraint="uq_compliance_settings_org"))
    return db.scalar(select(ComplianceSettings).where(ComplianceSettings.organization_id == org_id))


def checklist_of(db: Session) -> list[FileItem]:
    """What every active driver's file must hold, beyond the CDL and medical card."""
    row = stored(db)
    return [FileItem(**i) for i in row.checklist] if row is not None else list(STANDARD_FILE)
