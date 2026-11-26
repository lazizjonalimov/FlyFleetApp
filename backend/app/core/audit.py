import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.context import current_request_id
from app.core.deps import Principal
from app.modules.organizations.models import AuditLog


def audit(db: Session, p: Principal, action: str, entity_type: str, entity_id: uuid.UUID | None,
          data: dict[str, Any] | None = None) -> None:
    """Append an audit entry. The API's database role can insert and read these but never change them."""
    db.add(AuditLog(organization_id=p.org_id, actor_user_id=p.user_id, action=action, entity_type=entity_type,
                    entity_id=entity_id, data=data, request_id=current_request_id()))
    load_id = entity_id if entity_type == "load" else (data or {}).get("load_id") if entity_type in (
        "load_charge", "load_item") else None
    if load_id is not None:
        # The load's own activity feed says the same, in words.
        from app.modules.loads.activity import from_audit
        from_audit(db, p, action, uuid.UUID(str(load_id)), data)
