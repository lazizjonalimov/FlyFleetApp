"""The owner portal: what an equipment owner's sign-in may see, and nothing else.

Every read checks two things on the server: the caller is a portal user of this owner (or staff previewing it),
and the owner's portal permissions include what is asked for. Units count only while the owner holds them, so a
sold or transferred unit drops out the day ownership ends. Customer names and other loads' rates never appear.
"""
import uuid
from dataclasses import dataclass
from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import Principal, get_db, get_principal
from app.core.errors import Forbidden, NotFound
from app.core.money import money
from app.modules.organizations.models import Membership
from app.modules.owners import router as owners
from app.modules.owners import schemas as s
from app.modules.owners import service
from app.modules.owners.models import PORTAL_PERMISSIONS, Owner
from app.modules.people.models import Person

router = APIRouter(prefix="/portal/owner", tags=["owner portal"])


@dataclass
class PortalScope:
    principal: Principal
    owner: Owner
    permissions: set[str]
    preview: bool


def scope(owner_id: uuid.UUID | None = Query(None, description="Staff only: preview this owner's portal"),
          p: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> PortalScope:
    if p.role == "owner_portal":
        mine = db.scalar(select(Membership.owner_id).where(Membership.user_id == p.user_id,
                                                           Membership.organization_id == p.org_id))
        owner = db.get(Owner, mine) if mine else None
        if owner is None:
            raise Forbidden("This sign-in isn't linked to an owner")
        if not owner.portal_enabled:
            raise Forbidden("The owner portal is turned off for this owner. Contact the carrier.")
        return PortalScope(p, owner, set(owner.portal_permissions or []), preview=False)
    if owner_id and p.can("owners.manage"):
        owner = db.get(Owner, owner_id)
        if owner is None:
            raise NotFound("Owner not found")
        return PortalScope(p, owner, set(owner.portal_permissions or []), preview=True)
    raise Forbidden("The owner portal is for equipment owners")


def need(sc: PortalScope, *keys: str) -> None:
    if not any(k in sc.permissions for k in keys):
        raise Forbidden("Your portal access doesn't include this", details={"required": list(keys)})


class PortalHome(BaseModel):
    owner_id: uuid.UUID
    owner_name: str
    entity_type: str
    status: str
    read_only: bool
    company: str
    viewer_name: str
    preview: bool
    permissions: list[str]
    labels: dict[str, str]


@router.get("", response_model=PortalHome)
def home(sc: PortalScope = Depends(scope), db: Session = Depends(get_db)):
    person = db.get(Person, sc.owner.person_id) if sc.owner.person_id else None
    return PortalHome(owner_id=sc.owner.id, owner_name=service.name_of(sc.owner, person), entity_type=sc.owner.entity_type,
                      status=sc.owner.status, read_only=sc.owner.status == "ended", company=sc.principal.org_name,
                      viewer_name=sc.principal.full_name, preview=sc.preview,
                      permissions=[k for k in PORTAL_PERMISSIONS if k in sc.permissions], labels=PORTAL_PERMISSIONS)


@router.get("/equipment", response_model=list[s.UnitOut])
def equipment(sc: PortalScope = Depends(scope), db: Session = Depends(get_db)):
    need(sc, "equipment")
    units = service.units_out(db, sc.owner, service.open_rows(db, owner_ids=[sc.owner.id]))
    if "drivers" not in sc.permissions:
        units = [u.model_copy(update={"driver": None, "co_driver": None}) for u in units]
    return units


@router.get("/activity", response_model=s.OwnerActivity)
def activity(date_from: date | None = None, date_to: date | None = None, unit_id: uuid.UUID | None = None,
             sc: PortalScope = Depends(scope), db: Session = Depends(get_db)):
    need(sc, "loads", "completed", "statements", "performance")
    lo, hi = owners._range(sc.principal, date_from, date_to)
    out = owners.owner_activity(db, sc.principal, sc.owner, lo, hi, unit_id, hide_customers=True)
    rows = [r for r in out.load_rows if (r.status in ("assigned", "dispatched", "at_pickup", "in_transit", "at_delivery")
                                         and "loads" in sc.permissions)
            or (r.status in ("delivered", "pod_review", "completed") and "completed" in sc.permissions)]
    if "drivers" not in sc.permissions:
        rows = [r.model_copy(update={"driver_name": None}) for r in rows]
        out = out.model_copy(update={"by_unit": [u.model_copy(update={"driver_name": None}) for u in out.by_unit]})
    if "statements" not in sc.permissions:
        # Without financial statements, the owner sees the work but not the money.
        none = money(0)
        hidden = {k: none for k in ("revenue", "line_haul", "fuel_surcharge", "accessorials", "owner_gross",
                                    "carrier_share", "driver_pay")}
        rows = [r.model_copy(update=hidden) for r in rows]
        out = out.model_copy(update={
            "revenue": none, "carrier_share": none, "owner_gross": none, "rental_gross": none, "costs": {},
            "owner_costs": none, "net": none,
            "months": [m.model_copy(update={"revenue": none, "owner_gross": none, "net": none, "by_unit": {}})
                       for m in out.months],
            "by_unit": [u.model_copy(update={"revenue": none, "carrier_share": none, "owner_gross": none, "fuel": none,
                                             "driver_pay": none, "other_costs": none, "owner_costs": none,
                                             "owner_net": none}) for u in out.by_unit]})
    if "performance" not in sc.permissions:
        out = out.model_copy(update={"on_time": []})
    return out.model_copy(update={"load_rows": rows})


@router.get("/fuel", response_model=s.OwnerFuel)
def fuel(date_from: date | None = None, date_to: date | None = None, sc: PortalScope = Depends(scope),
         db: Session = Depends(get_db)):
    need(sc, "fuel", "expenses")
    lo, hi = owners._range(sc.principal, date_from, date_to)
    out = owners.owner_fuel(db, sc.principal, sc.owner, lo, hi)
    if "fuel" not in sc.permissions:
        out = out.model_copy(update={"fuel": [], "months": []})
    if "expenses" not in sc.permissions:
        out = out.model_copy(update={"other": [], "chargebacks": []})
    if "drivers" not in sc.permissions:
        out = out.model_copy(update={"fuel": [r.model_copy(update={"driver_name": None}) for r in out.fuel],
                                     "other": [r.model_copy(update={"driver_name": None}) for r in out.other]})
    return out


@router.get("/maintenance", response_model=s.OwnerMaintenance)
def maintenance(sc: PortalScope = Depends(scope), db: Session = Depends(get_db)):
    need(sc, "maintenance")
    return owners.owner_maintenance(db, sc.principal, sc.owner)


@router.get("/documents", response_model=list[s.OwnerDocument])
def documents(sc: PortalScope = Depends(scope), db: Session = Depends(get_db)):
    need(sc, "documents")
    return owners.owner_documents(db, sc.owner, portal_only=True)


@router.get("/live", response_model=list[s.LiveUnit])
def live(sc: PortalScope = Depends(scope), db: Session = Depends(get_db)):
    need(sc, "locations")
    return service.live_units(db, sc.owner, with_drivers="drivers" in sc.permissions)
