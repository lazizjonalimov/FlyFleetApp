"""Owners: who owns each truck and trailer, under which agreement, and who drives it.

Rules kept here (and, where the database can, in constraints):
- A person is stored once. An individual owner points at exactly one person; a business has contacts who are
  persons too. Linking an existing driver or employee never copies them.
- Category is derived, never typed: an owner is an owner-operator if they drive (primary or co-driver) a unit
  they own today.
- The open ownership rows of a unit add up to 100% at every moment. A unit without rows is the carrier's.
  Changing ownership closes rows and opens new ones, with a reason, so the history stays.
- Who drives a truck is a separate dated record (unit_assignments), set in Dispatch.
"""
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.crypto import lookup_hash
from app.core.deps import Principal
from app.core.errors import Conflict, Invalid, NotFound
from app.core.security import hash_password
from app.modules.dispatch.models import DispatchAssignment
from app.modules.documents.models import Document, DocumentLink
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.fleet.models import UnitAssignment
from app.modules.loads.models import Load, TrackingEvent
from app.modules.organizations.models import Membership, User
from app.modules.owners import schemas as s
from app.modules.owners.models import (
    PORTAL_PRESETS,
    EquipmentOwnership,
    Owner,
    OwnerAgreement,
    OwnerContact,
    portal_preset,
)
from app.modules.people import service as people
from app.modules.people.models import Person, PersonDistinction

HUNDRED = Decimal("100")
ACTIVE_LOAD = ("assigned", "dispatched", "at_pickup", "in_transit", "at_delivery")
DEFAULT_DRIVER_PAY = {"owner_operator_lease": "owner_drives", "equipment_lease": "carrier",
                      "fleet_lease": "carrier_for_owner", "rental": "carrier"}


# ------------------------------------------------------------------ reading
def get(db: Session, owner_id: uuid.UUID, *, lock: bool = False) -> Owner:
    stmt = select(Owner).where(Owner.id == owner_id)
    owner = db.scalar(stmt.with_for_update() if lock else stmt)
    if owner is None:
        raise NotFound("Owner not found")
    return owner


def name_of(owner: Owner, person: Person | None) -> str:
    if owner.entity_type == "business":
        return owner.legal_name or ""
    return people.full_name(person) if person else ""


def open_rows(db: Session, *, owner_ids=None, vehicle_id=None, trailer_id=None, on: date | None = None):
    """Ownership rows in force on a day (default: the open rows)."""
    stmt = select(EquipmentOwnership)
    if on is None:
        stmt = stmt.where(EquipmentOwnership.effective_to.is_(None))
    else:
        stmt = stmt.where(EquipmentOwnership.effective_from <= on,
                          or_(EquipmentOwnership.effective_to.is_(None), EquipmentOwnership.effective_to >= on))
    if owner_ids is not None:
        stmt = stmt.where(EquipmentOwnership.owner_id.in_(list(owner_ids)))
    if vehicle_id is not None:
        stmt = stmt.where(EquipmentOwnership.vehicle_id == vehicle_id)
    if trailer_id is not None:
        stmt = stmt.where(EquipmentOwnership.trailer_id == trailer_id)
    return list(db.scalars(stmt))


def open_seats(db: Session, vehicle_ids) -> dict[uuid.UUID, UnitAssignment]:
    ids = list(vehicle_ids)
    if not ids:
        return {}
    rows = db.scalars(select(UnitAssignment).where(UnitAssignment.vehicle_id.in_(ids),
                                                   UnitAssignment.effective_to.is_(None)))
    return {r.vehicle_id: r for r in rows}


def categories(db: Session, owners: list[Owner]) -> dict[uuid.UUID, str]:
    """owner_operator when the owner's person drives a unit they own today; non_operating otherwise."""
    result = {o.id: "non_operating" for o in owners}
    individuals = {o.id: o.person_id for o in owners if o.person_id}
    if not individuals:
        return result
    rows = open_rows(db, owner_ids=individuals.keys())
    seats = open_seats(db, {r.vehicle_id for r in rows if r.vehicle_id})
    driver_ids = {d for seat in seats.values() for d in (seat.driver_id, seat.co_driver_id) if d}
    person_of = dict(db.execute(select(Driver.id, Driver.person_id).where(Driver.id.in_(driver_ids))).all()) if driver_ids else {}
    for r in rows:
        seat = seats.get(r.vehicle_id) if r.vehicle_id else None
        if seat is None:
            continue
        drivers = {person_of.get(seat.driver_id), person_of.get(seat.co_driver_id)}
        if individuals.get(r.owner_id) in drivers:
            result[r.owner_id] = "owner_operator"
    return result


def _documents_of(db: Session, owner: Owner, unit_ids: list[uuid.UUID]) -> list[tuple[Document, str]]:
    """Documents about the owner or their units, with what each is attached to."""
    stmt = (select(Document, DocumentLink.entity_type).join(DocumentLink, DocumentLink.document_id == Document.id)
            .where(Document.upload_status == "uploaded",
                   or_((DocumentLink.entity_type == "owner") & (DocumentLink.entity_id == owner.id),
                       DocumentLink.entity_type.in_(("vehicle", "trailer")) & DocumentLink.entity_id.in_(unit_ids))))
    return list(db.execute(stmt).tuples())


def checklist(db: Session, owner: Owner, agreements: list[OwnerAgreement], unit_ids: list[uuid.UUID]) -> list[s.ChecklistItem]:
    """What must be on file before the owner's units are dispatched: lease, title, W-9, insurance, ACH."""
    docs = _documents_of(db, owner, unit_ids)
    have = {d.type for d, _ in docs if d.review_status != "rejected"}
    signed = any(a.signed_on or a.document_id for a in agreements)
    return [
        s.ChecklistItem(key="lease", label="Signed lease or rental agreement", done=signed or "lease" in have),
        s.ChecklistItem(key="title", label="Title or bill of sale", done="title" in have),
        s.ChecklistItem(key="w9", label="W-9", done="w9" in have),
        s.ChecklistItem(key="insurance", label="Physical damage and bobtail insurance", done="insurance" in have),
        s.ChecklistItem(key="ach", label="ACH authorization", done=owner.ach_authorized or "ach_authorization" in have
                        or owner.payment_method == "check"),
    ]


SHORT = {"lease": "signed lease", "title": "title or bill of sale", "w9": "W-9",
         "insurance": "physical damage and bobtail insurance", "ach": "ACH authorization"}


def blocked_units(db: Session, vehicle_ids=None, trailer_ids=None) -> dict[uuid.UUID, str]:
    """Units that can't be dispatched because of their owner: onboarding with the checklist incomplete,
    suspended, or ended. Used by dispatch eligibility."""
    stmt = (select(EquipmentOwnership.vehicle_id, EquipmentOwnership.trailer_id, Owner)
            .join(Owner, Owner.id == EquipmentOwnership.owner_id)
            .where(EquipmentOwnership.effective_to.is_(None), Owner.status != "active"))
    conds = []
    if vehicle_ids:
        conds.append(EquipmentOwnership.vehicle_id.in_(list(vehicle_ids)))
    if trailer_ids:
        conds.append(EquipmentOwnership.trailer_id.in_(list(trailer_ids)))
    if not conds:
        return {}
    out: dict[uuid.UUID, str] = {}
    for vehicle_id, trailer_id, owner in db.execute(stmt.where(or_(*conds))):
        unit = vehicle_id or trailer_id
        if owner.status == "onboarding":
            agreements = list(db.scalars(select(OwnerAgreement).where(OwnerAgreement.owner_id == owner.id)))
            items = checklist(db, owner, agreements, [unit])
            missing = [SHORT[i.key] for i in items if not i.done]
            if missing:
                listed = ", ".join(missing[:-1]) + (" and " if len(missing) > 1 else "") + missing[-1]
                out[unit] = f"The owner is still onboarding: {listed} needed before dispatch"
        elif owner.status == "suspended":
            out[unit] = "Owner is suspended"
        elif owner.status == "ended":
            out[unit] = "Owner's lease has ended"
    return out


def _driver_ref(d: Driver | None, owner_person: uuid.UUID | None = None) -> s.DriverRef | None:
    if d is None:
        return None
    employer = "self" if owner_person and d.person_id == owner_person else ("owner" if d.employer_owner_id else "carrier")
    return s.DriverRef(id=d.id, name=f"{d.first_name} {d.last_name}", employer=employer,
                       employer_owner_id=d.employer_owner_id, pay_by=d.pay_by, status=d.status)


def units_out(db: Session, owner: Owner, rows: list[EquipmentOwnership]) -> list[s.UnitOut]:
    vehicles = {v.id: v for v in db.scalars(select(Vehicle).where(Vehicle.id.in_([r.vehicle_id for r in rows if r.vehicle_id])))}
    trailers = {t.id: t for t in db.scalars(select(Trailer).where(Trailer.id.in_([r.trailer_id for r in rows if r.trailer_id])))}
    agreement_ids = [r.agreement_id for r in rows if r.agreement_id]
    agreements = {a.id: a for a in db.scalars(select(OwnerAgreement).where(OwnerAgreement.id.in_(agreement_ids)))}
    seats = open_seats(db, vehicles.keys())
    drivers = {d.id: d for d in db.scalars(select(Driver).where(Driver.id.in_(
        [x for seat in seats.values() for x in (seat.driver_id, seat.co_driver_id) if x])))}
    on_load = dict(db.execute(select(DispatchAssignment.vehicle_id, Load.load_number)
                              .join(Load, Load.id == DispatchAssignment.load_id)
                              .where(DispatchAssignment.status == "active", Load.status.in_(ACTIVE_LOAD),
                                     DispatchAssignment.vehicle_id.in_(list(vehicles)))).all()) if vehicles else {}
    blocked = blocked_units(db, vehicles.keys(), trailers.keys())
    out = []
    for r in rows:
        unit = vehicles.get(r.vehicle_id) if r.vehicle_id else trailers.get(r.trailer_id)
        if unit is None:
            continue
        agreement = agreements.get(r.agreement_id)
        seat = seats.get(unit.id) if r.vehicle_id else None
        primary = drivers.get(seat.driver_id) if seat else None
        co = drivers.get(seat.co_driver_id) if seat and seat.co_driver_id else None
        who = None
        if primary is not None:
            if owner.person_id and owner.person_id in (primary.person_id, co.person_id if co else None):
                who = "owner"
            elif primary.employer_owner_id == owner.id:
                who = "owner_hire"
            else:
                who = "carrier"
        reason = blocked.get(unit.id) if r.effective_to is None else None
        if r.effective_to is None and unit.status != "active":
            reason = reason or f"{'Truck' if r.vehicle_id else 'Trailer'} is {unit.status.replace('_', ' ')}"
        out.append(s.UnitOut(
            ownership_id=r.id, kind="truck" if r.vehicle_id else "trailer", unit_id=unit.id,
            unit_number=unit.unit_number, year=unit.year, make=unit.make, model=getattr(unit, "model", None),
            vin=unit.vin, plate=unit.plate, plate_state=unit.plate_state,
            trailer_type=getattr(unit, "type", None) if r.trailer_id else None, status=unit.status,
            registration_expiry=unit.registration_expiry, inspection_expiry=unit.inspection_expiry,
            odometer=getattr(unit, "odometer", None),
            share_pct=r.share_pct, effective_from=r.effective_from, effective_to=r.effective_to,
            agreement_id=r.agreement_id, agreement_kind=agreement.kind if agreement else None,
            driver=_driver_ref(primary, owner.person_id), co_driver=_driver_ref(co, owner.person_id),
            team_split=seat.team_split if seat and seat.co_driver_id else None, who_drives=who,
            on_load=on_load.get(unit.id) if r.vehicle_id else None, dispatchable=reason is None,
            blocked_reason=reason))
    out.sort(key=lambda u: (u.kind != "truck", u.unit_number))
    return out


def portal_users(db: Session, owner_id: uuid.UUID) -> list[s.PortalUserOut]:
    rows = db.execute(select(Membership, User).join(User, User.id == Membership.user_id)
                      .where(Membership.owner_id == owner_id, Membership.role == "owner_portal")
                      .order_by(User.full_name)).all()
    return [s.PortalUserOut(user_id=u.id, full_name=u.full_name, email=u.email, active=m.active,
                            signed_in=u.last_organization_id is not None, invited_at=m.created_at) for m, u in rows]


def rows_out(db: Session, owners: list[Owner]) -> list[s.OwnerRow]:
    if not owners:
        return []
    ids = [o.id for o in owners]
    persons = {x.id: x for x in db.scalars(select(Person).where(Person.id.in_([o.person_id for o in owners if o.person_id])))}
    cats = categories(db, owners)
    rows = open_rows(db, owner_ids=ids)
    trucks, trailers = defaultdict(set), defaultdict(set)
    for r in rows:
        (trucks if r.vehicle_id else trailers)[r.owner_id].add(r.vehicle_id or r.trailer_id)
    kinds = defaultdict(set)
    for owner_id, kind in db.execute(select(EquipmentOwnership.owner_id, OwnerAgreement.kind)
                                     .join(OwnerAgreement, OwnerAgreement.id == EquipmentOwnership.agreement_id)
                                     .where(EquipmentOwnership.owner_id.in_(ids), EquipmentOwnership.effective_to.is_(None))):
        kinds[owner_id].add(kind)
    all_trucks = {v for vs in trucks.values() for v in vs}
    active = defaultdict(int)
    if all_trucks:
        owner_of_truck = {r.vehicle_id: r.owner_id for r in rows if r.vehicle_id}
        for vehicle_id, n in db.execute(select(DispatchAssignment.vehicle_id, func.count())
                                        .join(Load, Load.id == DispatchAssignment.load_id)
                                        .where(DispatchAssignment.status == "active", Load.status.in_(ACTIVE_LOAD),
                                               DispatchAssignment.vehicle_id.in_(list(all_trucks)))
                                        .group_by(DispatchAssignment.vehicle_id)):
            active[owner_of_truck[vehicle_id]] += n
    contacts = {}
    for c, person in db.execute(select(OwnerContact, Person).join(Person, Person.id == OwnerContact.person_id)
                                .where(OwnerContact.owner_id.in_(ids)).order_by(OwnerContact.is_primary.desc())):
        contacts.setdefault(c.owner_id, (people.full_name(person), c.title))
    portal = dict(db.execute(select(Membership.owner_id, func.count()).where(
        Membership.owner_id.in_(ids), Membership.role == "owner_portal", Membership.active.is_(True))
        .group_by(Membership.owner_id)).all())
    staff = dict(db.execute(select(Person.id, Membership.role).join(
        Membership, (Membership.user_id == Person.user_id) & (Membership.organization_id == Person.organization_id))
        .where(Person.id.in_(list(persons)), Membership.role.not_in(("driver", "owner_portal")),
               Membership.active.is_(True))).all()) if persons else {}
    out = []
    for o in owners:
        person = persons.get(o.person_id) if o.person_id else None
        cname, ctitle = contacts.get(o.id, (None, None))
        out.append(s.OwnerRow(
            id=o.id, name=name_of(o, person), entity_type=o.entity_type, business_type=o.business_type,
            category=cats[o.id], dba=o.dba, contact_name=cname, contact_title=ctitle,
            phone=o.phone or (person.phone if person else None), email=o.email or (person.email if person else None),
            city=o.city or (person.city if person else None), state=o.state or (person.state if person else None),
            status=o.status, owner_since=o.owner_since, trucks=len(trucks[o.id]), trailers=len(trailers[o.id]),
            active_loads=active[o.id], agreement_kinds=sorted(kinds[o.id]), portal_enabled=o.portal_enabled,
            portal_users=portal.get(o.id, 0), employee_role=staff.get(o.person_id) if o.person_id else None,
            created_at=o.created_at))
    return out


def detail(db: Session, p: Principal, owner: Owner) -> s.OwnerDetail:
    row = rows_out(db, [owner])[0]
    person = db.get(Person, owner.person_id) if owner.person_id else None
    agreements = list(db.scalars(select(OwnerAgreement).where(OwnerAgreement.owner_id == owner.id)
                                 .order_by(OwnerAgreement.effective_from)))
    all_rows = list(db.scalars(select(EquipmentOwnership).where(EquipmentOwnership.owner_id == owner.id)
                               .order_by(EquipmentOwnership.effective_from)))
    current = [r for r in all_rows if r.effective_to is None]
    past = [r for r in all_rows if r.effective_to is not None]
    unit_count = defaultdict(int)
    for r in current:
        unit_count[r.agreement_id] += 1
    contacts = []
    users = portal_users(db, owner.id)
    by_email = {u.email: u for u in users}
    for c, cp in db.execute(select(OwnerContact, Person).join(Person, Person.id == OwnerContact.person_id)
                            .where(OwnerContact.owner_id == owner.id)
                            .order_by(OwnerContact.is_primary.desc(), Person.last_name)):
        u = by_email.get((cp.email or "").lower())
        contacts.append(s.ContactOut(id=c.id, person=_lite(cp), title=c.title, is_primary=c.is_primary, signs=c.signs,
                                     note=c.note, portal=("active" if u.signed_in else "invited") if u else None))
    unit_ids = [r.vehicle_id or r.trailer_id for r in current]
    docs = _documents_of(db, owner, unit_ids)
    return s.OwnerDetail(
        **row.model_dump(), person=_lite(person) if person else None, legal_name=owner.legal_name,
        ein_last4=owner.ein_last4, tax_id_last4=person.tax_id_last4 if person else None,
        street=owner.street or (person.street if person else None),
        postal_code=owner.postal_code or (person.postal_code if person else None), ended_on=owner.ended_on,
        end_reason=owner.end_reason, pay_frequency=owner.pay_frequency, pay_day=owner.pay_day,
        payment_method=owner.payment_method, bank_name=owner.bank_name, account_last4=owner.account_last4,
        has_routing=bool(owner.routing_number), ach_authorized=owner.ach_authorized,
        escrow_weekly=owner.escrow_weekly, escrow_target=owner.escrow_target, escrow_balance=escrow_balance(db, owner),
        portal_permissions=list(owner.portal_permissions or []), portal_preset=portal_preset(owner.portal_permissions),
        notes=owner.notes, contacts=contacts,
        agreements=[s.AgreementOut.model_validate(a).model_copy(update={"units": unit_count.get(a.id, 0)}) for a in agreements],
        units=units_out(db, owner, current), past_units=units_out(db, owner, past), portal_users_list=users,
        checklist=checklist(db, owner, agreements, unit_ids), documents=len({d.id for d, _ in docs}))


def escrow_balance(db: Session, owner: Owner) -> Decimal:
    """Opening balance plus deposits on approved owner settlements, less refunds."""
    try:
        from app.modules.settlements.owner_service import escrow_movements
    except ImportError:  # owner settlements not installed
        return owner.escrow_opening_balance
    return owner.escrow_opening_balance + escrow_movements(db, owner.id)


def _lite(person: Person) -> s.PersonLite:
    return s.PersonLite(id=person.id, first_name=person.first_name, last_name=person.last_name, email=person.email,
                        phone=person.phone, tax_id_last4=person.tax_id_last4, city=person.city, state=person.state,
                        user_id=person.user_id)


def summary(db: Session) -> s.OwnerSummary:
    owners = list(db.scalars(select(Owner)))
    cats = categories(db, owners)
    rows = open_rows(db)
    owned_t = {r.vehicle_id for r in rows if r.vehicle_id and r.owner_id}
    owned_r = {r.trailer_id for r in rows if r.trailer_id and r.owner_id}
    onboarding_ids = {o.id for o in owners if o.status == "onboarding"}
    fleet_t = db.scalar(select(func.count()).select_from(Vehicle).where(Vehicle.status != "retired")) or 0
    fleet_r = db.scalar(select(func.count()).select_from(Trailer).where(Trailer.status != "retired")) or 0
    by = lambda key: sum(1 for o in owners if key(o))  # noqa: E731
    tabs = {
        "all": len(owners),
        "owner_operators": sum(1 for o in owners if cats[o.id] == "owner_operator"),
        "non_operating": sum(1 for o in owners if cats[o.id] == "non_operating"),
        "individuals": by(lambda o: o.entity_type == "individual"),
        "businesses": by(lambda o: o.entity_type == "business"),
        "onboarding": by(lambda o: o.status == "onboarding"),
        "ended": by(lambda o: o.status == "ended"),
    }
    return s.OwnerSummary(
        total=len(owners), individuals=tabs["individuals"], businesses=tabs["businesses"],
        active=by(lambda o: o.status == "active"), onboarding=tabs["onboarding"],
        suspended=by(lambda o: o.status == "suspended"), ended=tabs["ended"],
        owner_operators=tabs["owner_operators"], non_operating=tabs["non_operating"],
        owned_trucks=len(owned_t), owned_trailers=len(owned_r),
        onboarding_trucks=len({r.vehicle_id for r in rows if r.vehicle_id and r.owner_id in onboarding_ids}),
        fleet_trucks=fleet_t, fleet_trailers=fleet_r, carrier_trucks=max(fleet_t - len(owned_t), 0),
        carrier_trailers=max(fleet_r - len(owned_r), 0), tabs=tabs)


def filter_ids(db: Session, tab: str | None) -> set[uuid.UUID] | None:
    """Owners in a tab that depends on derived values (category)."""
    if tab not in ("owner_operators", "non_operating"):
        return None
    owners = list(db.scalars(select(Owner)))
    cats = categories(db, owners)
    want = "owner_operator" if tab == "owner_operators" else "non_operating"
    return {o.id for o in owners if cats[o.id] == want}


# ------------------------------------------------------------------ writing
def _unit(db: Session, vehicle_id, trailer_id) -> Vehicle | Trailer:
    unit = db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id).with_for_update()) if vehicle_id else \
        db.scalar(select(Trailer).where(Trailer.id == trailer_id).with_for_update())
    if unit is None:
        raise Invalid("Truck not found" if vehicle_id else "Trailer not found",
                      field="vehicle_id" if vehicle_id else "trailer_id")
    return unit


def _sync_label(db: Session, unit: Vehicle | Trailer) -> None:
    """Keep the unit's coarse ownership label (owned / leased / owner-operator) in step with its rows."""
    rows = open_rows(db, vehicle_id=unit.id) if isinstance(unit, Vehicle) else open_rows(db, trailer_id=unit.id)
    kinds = set()
    for r in rows:
        if r.owner_id and r.agreement_id:
            kinds.add(db.get(OwnerAgreement, r.agreement_id).kind)
    unit.ownership = "owner_operator" if "owner_operator_lease" in kinds else ("leased" if kinds else "owned")


Share = tuple[uuid.UUID | None, Decimal, uuid.UUID | None]


def set_rows(db: Session, p: Principal, unit: Vehicle | Trailer, new_rows: list[Share], effective_from: date,
             reason: str) -> None:
    """Replace a unit's open ownership rows from a date. The new rows must add up to 100%."""
    total = sum((pct for _, pct, _ in new_rows), Decimal("0"))
    if total != HUNDRED:
        raise Invalid(f"Ownership of {unit.unit_number} must add up to 100% (it adds up to {total.normalize()}%)",
                      field="share_pct")
    owners_seen = [o for o, _, _ in new_rows]
    if len(owners_seen) != len(set(owners_seen)):
        raise Invalid("List each owner once", field="rows")
    is_truck = isinstance(unit, Vehicle)
    current = open_rows(db, vehicle_id=unit.id) if is_truck else open_rows(db, trailer_id=unit.id)
    for r in current:
        if r.effective_from > effective_from:
            raise Invalid(f"{unit.unit_number} changed hands on {r.effective_from:%b %-d, %Y}; pick a later date",
                          field="effective_from")
    for r in current:
        if r.effective_from == effective_from:
            db.delete(r)  # replaced the same day: no history to keep
        else:
            r.effective_to = effective_from - timedelta(days=1)
    db.flush()
    for owner_id, pct, agreement_id in new_rows:
        if owner_id is None and pct == HUNDRED:
            continue  # wholly the carrier's again: no rows needed
        if owner_id is not None:
            agreement = db.get(OwnerAgreement, agreement_id) if agreement_id else None
            if agreement is None or agreement.owner_id != owner_id:
                raise Invalid("Choose one of this owner's agreements", field="agreement_id")
        db.add(EquipmentOwnership(organization_id=p.org_id, vehicle_id=unit.id if is_truck else None,
                                  trailer_id=None if is_truck else unit.id, owner_id=owner_id, share_pct=pct,
                                  effective_from=effective_from, agreement_id=agreement_id if owner_id else None,
                                  reason=reason, created_by=p.user_id))
    db.flush()
    _sync_label(db, unit)


def give_share(db: Session, p: Principal, unit: Vehicle | Trailer, owner: Owner, pct: Decimal,
               agreement_id: uuid.UUID, effective_from: date, reason: str) -> None:
    """Give an owner a share of a unit, taken from the carrier's share. Shares other owners hold stay."""
    is_truck = isinstance(unit, Vehicle)
    current = open_rows(db, vehicle_id=unit.id) if is_truck else open_rows(db, trailer_id=unit.id)
    others = [(r.owner_id, r.share_pct, r.agreement_id) for r in current if r.owner_id not in (None, owner.id)]
    held = sum((x[1] for x in others), Decimal("0"))
    if held + pct > HUNDRED:
        names = ", ".join(name_of(o, db.get(Person, o.person_id) if o.person_id else None)
                          for o in db.scalars(select(Owner).where(Owner.id.in_([x[0] for x in others]))))
        raise Conflict(f"{unit.unit_number} is already {held.normalize()}% owned by {names}. Transfer the share "
                       "from them instead.", code="SHARE_TAKEN")
    rows = others + [(owner.id, pct, agreement_id)]
    if held + pct < HUNDRED:
        rows.append((None, HUNDRED - held - pct, None))
    set_rows(db, p, unit, rows, effective_from, reason)


def seat(db: Session, p: Principal, vehicle: Vehicle, body: s.SeatIn, today: date) -> UnitAssignment:
    """Who drives a truck from a date: a primary driver and, for a team, a co-driver."""
    start = body.effective_from or today
    ids = [body.driver_id] + ([body.co_driver_id] if body.co_driver_id else [])
    drivers = {d.id: d for d in db.scalars(select(Driver).where(Driver.id.in_(ids)).with_for_update())}
    for field_name, driver_id in (("driver_id", body.driver_id), ("co_driver_id", body.co_driver_id)):
        if driver_id and driver_id not in drivers:
            raise Invalid("Driver not found", field=field_name)
        if driver_id and drivers[driver_id].status != "active":
            raise Invalid(f"{drivers[driver_id].first_name} {drivers[driver_id].last_name} isn't active", field=field_name)
    if body.co_driver_id == body.driver_id:
        raise Invalid("Pick two different drivers for a team", field="co_driver_id")
    # A driver sits in one truck at a time: seating them here moves them from wherever they were.
    elsewhere = db.scalars(select(UnitAssignment).where(
        UnitAssignment.effective_to.is_(None), UnitAssignment.vehicle_id != vehicle.id,
        or_(UnitAssignment.driver_id.in_(ids), UnitAssignment.co_driver_id.in_(ids))).with_for_update())
    for other in elsewhere:
        if other.co_driver_id in ids and other.driver_id not in ids:
            other.effective_to = max(start - timedelta(days=1), other.effective_from)
            db.flush()
            db.add(UnitAssignment(organization_id=p.org_id, vehicle_id=other.vehicle_id, driver_id=other.driver_id,
                                  effective_from=start, reason=f"Co-driver moved to {vehicle.unit_number}",
                                  created_by=p.user_id))
        else:
            other.effective_to = max(start - timedelta(days=1), other.effective_from)
    current = db.scalar(select(UnitAssignment).where(UnitAssignment.vehicle_id == vehicle.id,
                                                     UnitAssignment.effective_to.is_(None)).with_for_update())
    if current is not None:
        if current.effective_from >= start:
            db.delete(current)
        else:
            current.effective_to = start - timedelta(days=1)
    db.flush()
    row = UnitAssignment(organization_id=p.org_id, vehicle_id=vehicle.id, driver_id=body.driver_id,
                         co_driver_id=body.co_driver_id, team_split=body.team_split if body.co_driver_id else "equal",
                         effective_from=start, reason=body.reason, created_by=p.user_id)
    db.add(row)
    db.flush()
    return row


def unseat(db: Session, vehicle: Vehicle, today: date) -> None:
    current = db.scalar(select(UnitAssignment).where(UnitAssignment.vehicle_id == vehicle.id,
                                                     UnitAssignment.effective_to.is_(None)).with_for_update())
    if current is not None:
        if current.effective_from >= today:
            db.delete(current)
        else:
            current.effective_to = today - timedelta(days=1)


def _agreement(db: Session, p: Principal, owner: Owner, body: s.AgreementIn, start: date) -> OwnerAgreement:
    data = body.model_dump()
    data["effective_from"] = data["effective_from"] or start
    if body.kind != "rental":
        data["per_mile"] = data["per_trailer_week"] = None
    if body.document_id and db.get(Document, body.document_id) is None:
        raise Invalid("Document not found", field="document_id")
    agreement = OwnerAgreement(organization_id=p.org_id, owner_id=owner.id, **data)
    db.add(agreement)
    db.flush()
    return agreement


def _person(db: Session, p: Principal, person_id: uuid.UUID | None, data: s.PersonIn | None, field: str) -> Person:
    if person_id:
        person = db.get(Person, person_id)
        if person is None:
            raise Invalid("Person not found", field=field)
        return person
    assert data is not None
    return people.create(db, p.org_id, data.model_dump())


def _units(db: Session, p: Principal, owner: Owner, units: list[s.UnitIn], reason: str) -> None:
    seen = set()
    for i, u in enumerate(units):
        unit = _unit(db, u.vehicle_id, u.trailer_id)
        if unit.id in seen:
            raise Invalid(f"{unit.unit_number} is listed twice", field=f"units.{i}")
        seen.add(unit.id)
        if u.agreement_id:
            agreement = db.get(OwnerAgreement, u.agreement_id)
            if agreement is None or agreement.owner_id != owner.id:
                raise Invalid("Choose one of this owner's agreements", field=f"units.{i}.agreement_id")
        else:
            agreement = _agreement(db, p, owner, u.agreement, u.effective_from)
        give_share(db, p, unit, owner, u.share_pct, agreement.id, u.effective_from, reason)
        if isinstance(unit, Vehicle) and u.who_drives:
            _who_drives(db, p, owner, unit, u, agreement, i)


def _who_drives(db: Session, p: Principal, owner: Owner, truck: Vehicle, u: s.UnitIn, agreement: OwnerAgreement, i: int) -> None:
    driver = None
    if u.who_drives == "owner":
        if owner.person_id is None:
            raise Invalid("A business can't drive; pick its driver instead", field=f"units.{i}.who_drives")
        driver = db.scalar(select(Driver).where(Driver.person_id == owner.person_id))
        if driver is None:
            return  # seated once the owner has a driver profile
    elif u.driver_id:
        driver = db.get(Driver, u.driver_id)
        if driver is None:
            raise Invalid("Driver not found", field=f"units.{i}.driver_id")
        if u.who_drives == "owner_hire":
            pay_by = agreement.driver_pay_by if agreement.driver_pay_by in ("owner", "carrier_for_owner") else "carrier_for_owner"
            driver.employer_owner_id, driver.pay_by = owner.id, pay_by
    if driver is not None:
        seat(db, p, truck, s.SeatIn(driver_id=driver.id, effective_from=u.effective_from,
                                    reason="Set when the owner was added"), u.effective_from)


def _contacts(db: Session, p: Principal, owner: Owner, contacts: list[s.ContactIn]) -> None:
    if sum(1 for c in contacts if c.is_primary) > 1:
        raise Invalid("Only one contact can be the primary", field="contacts")
    for c in list(db.scalars(select(OwnerContact).where(OwnerContact.owner_id == owner.id))):
        db.delete(c)
    db.flush()
    seen = set()
    for i, c in enumerate(contacts):
        person = _person(db, p, c.person_id, c.person, f"contacts.{i}")
        if person.id in seen:
            continue
        seen.add(person.id)
        if c.person_id and c.person:
            people.apply(person, c.person.model_dump(exclude_unset=True))
            people.sync_driver(db, person)
        db.add(OwnerContact(organization_id=p.org_id, owner_id=owner.id, person_id=person.id, title=c.title,
                            is_primary=c.is_primary or (i == 0 and not any(x.is_primary for x in contacts)),
                            signs=c.signs, note=c.note))
    db.flush()


def add_portal_user(db: Session, p: Principal, owner: Owner, body: s.PortalUserIn) -> s.PortalUserOut:
    existing = db.execute(text("SELECT id, full_name FROM auth_lookup_user(:e)"), {"e": body.email}).first()
    if existing:
        membership = db.scalar(select(Membership).where(Membership.user_id == existing.id,
                                                        Membership.organization_id == p.org_id))
        if membership is not None:
            if membership.role == "owner_portal" and membership.owner_id == owner.id:
                raise Conflict("This person already has portal access", code="DUPLICATE_REFERENCE",
                               field_errors={"email": "Already a portal user"})
            raise Conflict("This person already signs in to the company with another role. Portal access needs a "
                           "separate sign-in.", code="DUPLICATE_REFERENCE", field_errors={"email": "Already a member"})
        uid = existing.id
    else:
        if not body.password:
            raise Invalid("Set a temporary password for a new sign-in", field="password")
        uid = db.execute(text("SELECT auth_create_user(:e, :n, :h)"),
                         {"e": body.email, "n": body.full_name, "h": hash_password(body.password)}).scalar_one()
    db.add(Membership(organization_id=p.org_id, user_id=uid, role="owner_portal", owner_id=owner.id))
    db.flush()
    if body.person_id:
        person = db.get(Person, body.person_id)
        if person is not None and person.user_id is None:
            person.user_id = uid
    audit(db, p, "owner.portal_user_added", "owner", owner.id, {"email": body.email.lower(),
                                                                 "existing_account": existing is not None})
    out = next(u for u in portal_users(db, owner.id) if u.user_id == uid)
    return out.model_copy(update={"existing_account": existing is not None})


def remove_portal_user(db: Session, p: Principal, owner: Owner, user_id: uuid.UUID) -> None:
    membership = db.scalar(select(Membership).where(Membership.user_id == user_id, Membership.owner_id == owner.id,
                                                    Membership.role == "owner_portal"))
    if membership is None:
        raise NotFound("Portal user not found")
    db.execute(text("UPDATE persons SET user_id = NULL WHERE user_id = :u"), {"u": user_id})
    db.delete(membership)
    audit(db, p, "owner.portal_user_removed", "owner", owner.id, {"user_id": str(user_id)})


def _permissions(body) -> list[str] | None:
    if getattr(body, "portal_preset", None) or getattr(body, "preset", None):
        return list(PORTAL_PRESETS[getattr(body, "portal_preset", None) or body.preset][1])
    perms = getattr(body, "portal_permissions", None)
    if perms is None:
        perms = getattr(body, "permissions", None)
    return list(dict.fromkeys(perms)) if perms is not None else None


def _apply_fields(owner: Owner, body: s.OwnerFields) -> None:
    data = body.model_dump(exclude_unset=True, exclude={"portal_permissions", "portal_preset", "ein",
                                                        "routing_number", "account_number"})
    for key, value in data.items():
        if hasattr(owner, key) and key not in ("person", "contacts", "units", "status"):
            setattr(owner, key, value.strip() if isinstance(value, str) else value)
    fields = body.model_fields_set
    if "ein" in fields:
        clean = "".join(ch for ch in (body.ein or "") if ch.isdigit())
        if body.ein and len(clean) != 9:
            raise Invalid("An EIN is nine digits", field="ein")
        owner.ein, owner.ein_hash, owner.ein_last4 = clean or None, lookup_hash(clean) if clean else None, clean[-4:] or None
    if "routing_number" in fields:
        owner.routing_number = body.routing_number or None
    if "account_number" in fields:
        owner.account_number = body.account_number or None
        owner.account_last4 = body.account_number[-4:] if body.account_number else None
    perms = _permissions(body)
    if perms is not None:
        owner.portal_permissions = perms
    if owner.email:
        owner.email = owner.email.lower()


def create(db: Session, p: Principal, body: s.OwnerCreate) -> Owner:
    if body.entity_type == "individual":
        if body.person_id is None and body.person is None:
            raise Invalid("Enter the owner's name, or link a person already on file", field="person")
        person = _person(db, p, body.person_id, body.person, "person_id")
        if body.person_id and body.person_updates:
            people.apply(person, body.person_updates.model_dump(exclude_unset=True))
            people.sync_driver(db, person)
        if db.scalar(select(Owner.id).where(Owner.person_id == person.id)):
            raise Conflict(f"{people.full_name(person)} is already an owner", code="DUPLICATE_REFERENCE",
                           field_errors={"person_id": "Already an owner"})
        for nd in body.not_duplicates:
            if nd.person_id != person.id and db.get(Person, nd.person_id) is not None:
                db.add(PersonDistinction(organization_id=p.org_id, person_id=person.id, other_person_id=nd.person_id,
                                         reason=nd.reason.strip(), decided_by=p.user_id))
                audit(db, p, "person.not_duplicate", "person", person.id,
                      {"other_person_id": str(nd.person_id), "reason": nd.reason.strip()})
        owner = Owner(organization_id=p.org_id, entity_type="individual", person_id=person.id, status=body.status)
    else:
        if not (body.legal_name or "").strip():
            raise Invalid("Enter the legal business name", field="legal_name")
        if not body.contacts:
            raise Invalid("Add the contact person who acts for the business", field="contacts")
        owner = Owner(organization_id=p.org_id, entity_type="business", status=body.status)
        person = None
    _apply_fields(owner, body)
    if body.status == "ended":
        raise Invalid("A new owner can't start as ended", field="status")
    if person is not None:
        owner.email = owner.email or person.email
        owner.phone = owner.phone or person.phone
    if body.ein and owner.ein_hash and db.scalar(select(Owner.id).where(Owner.ein_hash == owner.ein_hash)):
        raise Conflict("An owner with this EIN is already on file", code="DUPLICATE_REFERENCE",
                       field_errors={"ein": "Already on file"})
    owner.owner_since = owner.owner_since or min((u.effective_from for u in body.units), default=None) or p.today()
    db.add(owner)
    db.flush()
    if body.contacts:
        _contacts(db, p, owner, body.contacts)
    _units(db, p, owner, body.units, "Added with the owner")
    for user in body.portal_users:
        add_portal_user(db, p, owner, user)
    audit(db, p, "owner.created", "owner", owner.id, _audit_view(body))
    return owner


def update(db: Session, p: Principal, owner: Owner, body: s.OwnerUpdate) -> None:
    before = {"status": owner.status}
    _apply_fields(owner, body)
    if body.person is not None and owner.person_id:
        person = db.get(Person, owner.person_id)
        people.apply(person, body.person.model_dump(exclude_unset=True))
        people.sync_driver(db, person)
    if body.status is not None and body.status != owner.status:
        if body.status == "ended":
            owner.ended_on = body.ended_on or p.today()
            owner.end_reason = body.end_reason
        elif owner.status == "ended":
            owner.ended_on, owner.end_reason = None, None
        owner.status = body.status
    if body.contacts is not None:
        if owner.entity_type == "business" and not body.contacts:
            raise Invalid("A business keeps at least one contact", field="contacts")
        _contacts(db, p, owner, body.contacts)
    if body.units is not None:
        _reconcile_units(db, p, owner, body.units, body.effective_on or p.today())
    db.flush()
    audit(db, p, "owner.updated", "owner", owner.id, {"before": before, "after": _audit_view(body)})


def _reconcile_units(db: Session, p: Principal, owner: Owner, units: list[s.UnitIn], on: date) -> None:
    """Make the owner's open rows match the list: new units get a share, changed ones a new row, and units
    left out are handed back to the carrier from the date (their history stays)."""
    current = {(r.vehicle_id or r.trailer_id): r for r in open_rows(db, owner_ids=[owner.id])}
    wanted = {}
    for u in units:
        wanted[u.vehicle_id or u.trailer_id] = u
    for unit_id, row in current.items():
        if unit_id not in wanted:
            unit = _unit(db, row.vehicle_id, row.trailer_id)
            rest = [(r.owner_id, r.share_pct, r.agreement_id) for r in
                    (open_rows(db, vehicle_id=unit.id) if row.vehicle_id else open_rows(db, trailer_id=unit.id))
                    if r.owner_id != owner.id]
            carrier = HUNDRED - sum((x[1] for x in rest if x[0] is not None), Decimal("0"))
            rest = [x for x in rest if x[0] is not None] + ([(None, carrier, None)] if carrier > 0 else [])
            set_rows(db, p, unit, rest, max(on, row.effective_from), "Removed from the owner")
    for i, (unit_id, u) in enumerate(wanted.items()):
        row = current.get(unit_id)
        unit = _unit(db, u.vehicle_id, u.trailer_id)
        if u.agreement_id:
            agreement = db.get(OwnerAgreement, u.agreement_id)
            if agreement is None or agreement.owner_id != owner.id:
                raise Invalid("Choose one of this owner's agreements", field=f"units.{i}.agreement_id")
        else:
            agreement = _agreement(db, p, owner, u.agreement, u.effective_from)
        if row is None:
            give_share(db, p, unit, owner, u.share_pct, agreement.id, u.effective_from, "Added to the owner")
        elif row.share_pct != u.share_pct or row.agreement_id != agreement.id:
            give_share(db, p, unit, owner, u.share_pct, agreement.id, max(on, row.effective_from), "Terms changed")
        if isinstance(unit, Vehicle) and u.who_drives:
            _who_drives(db, p, owner, unit, u, agreement, i)


def transfer(db: Session, p: Principal, body: s.TransferIn) -> Vehicle | Trailer:
    unit = _unit(db, body.vehicle_id, body.trailer_id)
    for i, row in enumerate(body.rows):
        if row.owner_id is not None:
            owner = db.get(Owner, row.owner_id)
            if owner is None:
                raise Invalid("Owner not found", field=f"rows.{i}.owner_id")
            if owner.status == "ended":
                raise Invalid(f"{name_of(owner, db.get(Person, owner.person_id) if owner.person_id else None)}'s "
                              "relationship has ended", field=f"rows.{i}.owner_id")
    set_rows(db, p, unit, [(r.owner_id, r.share_pct, r.agreement_id) for r in body.rows], body.effective_from,
             body.reason.strip())
    audit(db, p, "equipment.ownership_transferred", "vehicle" if body.vehicle_id else "trailer", unit.id,
          body.model_dump(mode="json"))
    return unit


def _audit_view(body) -> dict:
    """What was sent, with secrets left out."""
    return body.model_dump(mode="json", exclude_unset=True, exclude={
        "ein", "routing_number", "account_number", "person", "person_updates", "contacts", "portal_users"})


def reveal(db: Session, p: Principal, owner: Owner) -> s.OwnerSensitive:
    person = db.get(Person, owner.person_id) if owner.person_id else None
    audit(db, p, "owner.sensitive_viewed", "owner", owner.id)
    return s.OwnerSensitive(tax_id=person.tax_id if person else None, ein=owner.ein, routing_number=owner.routing_number,
                            account_number=owner.account_number, date_of_birth=person.date_of_birth if person else None)


def live_units(db: Session, owner: Owner, *, with_drivers: bool = True) -> list[s.LiveUnit]:
    """Each truck the owner holds today, the load it is on, and where it last reported from."""
    units = [u for u in units_out(db, owner, open_rows(db, owner_ids=[owner.id])) if u.kind == "truck"]
    out = []
    since = datetime.now().astimezone() - timedelta(days=30)
    for u in units:
        row = db.execute(select(Load, DispatchAssignment).join(DispatchAssignment, DispatchAssignment.load_id == Load.id)
                         .where(DispatchAssignment.vehicle_id == u.unit_id,
                                DispatchAssignment.status.in_(("active", "completed")))
                         .order_by(DispatchAssignment.created_at.desc()).limit(1)).first()
        load = row[0] if row else None
        event = db.scalar(select(TrackingEvent).where(TrackingEvent.load_id == load.id, TrackingEvent.occurred_at >= since)
                          .order_by(TrackingEvent.occurred_at.desc()).limit(1)) if load else None
        active = load is not None and load.status in ("assigned", "dispatched", "at_pickup", "in_transit", "at_delivery")
        lane = None
        if load is not None:
            ends = (", ".join(y for y in (load.origin_city, load.origin_state) if y),
                    ", ".join(y for y in (load.destination_city, load.destination_state) if y))
            lane = " → ".join(x for x in ends if x) or None
        out.append(s.LiveUnit(unit_id=u.unit_id, unit_number=u.unit_number, status=u.status,
                            load_number=load.load_number if active else None, lane=lane if active else None,
                            place=", ".join(x for x in (event.city, event.state) if x) if event else None,
                            seen_at=event.occurred_at if event else None,
                            driver_name=u.driver.name if (u.driver and with_drivers) else None))
    return out
