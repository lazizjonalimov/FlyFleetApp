"""People: one record per human being in a company, and finding the same person before typing them in twice."""
import re
import uuid
from dataclasses import dataclass, field

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.crypto import lookup_hash
from app.core.errors import Invalid
from app.modules.drivers.models import Driver
from app.modules.people.models import Person, PersonDistinction

# Fields a person carries; a driver profile keeps a copy of the first four, kept in step from here.
PERSON_FIELDS = ("first_name", "last_name", "email", "phone", "street", "city", "state", "postal_code", "notes")


def phone_digits(phone: str | None) -> str | None:
    """The last ten digits, so "(214) 555-0166" and "214.555.0166" are the same number."""
    digits = re.sub(r"\D", "", phone or "")
    return digits[-10:] or None


def set_tax_id(person: Person, tax_id: str | None) -> None:
    clean = re.sub(r"[^0-9A-Za-z]", "", tax_id or "")
    if tax_id is not None and clean and not (len(clean) == 9 and clean.isdigit()):
        raise Invalid("A tax ID is nine digits (SSN or EIN)", field="tax_id")
    person.tax_id = clean or None
    person.tax_id_hash = lookup_hash(clean) if clean else None
    person.tax_id_last4 = clean[-4:] if clean else None


def create(db: Session, org_id: uuid.UUID, data: dict) -> Person:
    """A new person from first/last name and optional contact, address, tax ID and birth date."""
    first, last = (data.get("first_name") or "").strip(), (data.get("last_name") or "").strip()
    if not first:
        raise Invalid("Enter a first name", field="first_name")
    if not last:
        raise Invalid("Enter a last name", field="last_name")
    person = Person(organization_id=org_id, first_name=first, last_name=last)
    apply(person, data)
    db.add(person)
    db.flush()
    return person


def apply(person: Person, data: dict) -> None:
    """Copy the given fields onto a person (only those present in `data`)."""
    for key in PERSON_FIELDS:
        if key in data:
            value = data[key]
            setattr(person, key, value.strip() if isinstance(value, str) else value)
    if "phone" in data:
        person.phone_digits = phone_digits(person.phone)
    if "email" in data and person.email:
        person.email = person.email.strip().lower() or None
    if "tax_id" in data:
        set_tax_id(person, data["tax_id"])
    if "date_of_birth" in data:
        dob = data["date_of_birth"]
        person.date_of_birth = dob.isoformat() if hasattr(dob, "isoformat") else (dob or None)


def sync_driver(db: Session, person: Person) -> None:
    """A driver profile shows its person's name, phone and email: keep the copy in step."""
    driver = db.scalar(select(Driver).where(Driver.person_id == person.id))
    if driver is not None:
        driver.first_name, driver.last_name = person.first_name, person.last_name
        driver.phone, driver.email = person.phone, person.email


def full_name(person: Person) -> str:
    return f"{person.first_name} {person.last_name}".strip()


@dataclass
class Match:
    person: Person
    reasons: list[str] = field(default_factory=list)


def find_matches(db: Session, *, tax_id: str | None = None, phone: str | None = None, email: str | None = None,
                 cdl_number: str | None = None, first_name: str | None = None, last_name: str | None = None,
                 exclude: uuid.UUID | None = None, limit: int = 8) -> list[Match]:
    """People already on file who are probably the one being entered: the same tax ID, phone, email or CDL
    number, or failing those the same name. Pairs someone has declared different people are left out."""
    found: dict[uuid.UUID, Match] = {}

    def add(rows, reason: str) -> None:
        for person in rows:
            if exclude and person.id == exclude:
                continue
            found.setdefault(person.id, Match(person)).reasons.append(reason)

    clean_tax = re.sub(r"[^0-9A-Za-z]", "", tax_id or "")
    if clean_tax:
        add(db.scalars(select(Person).where(Person.tax_id_hash == lookup_hash(clean_tax))), "tax_id")
    digits = phone_digits(phone)
    if digits and len(digits) >= 7:
        add(db.scalars(select(Person).where(Person.phone_digits == digits)), "phone")
    if email and email.strip():
        add(db.scalars(select(Person).where(func.lower(Person.email) == email.strip().lower())), "email")
    if cdl_number and cdl_number.strip():
        wanted = re.sub(r"\s", "", cdl_number).upper()
        # Licence numbers are encrypted, so compare decrypted values among the company's drivers.
        for driver in db.scalars(select(Driver).where(Driver.cdl_number.is_not(None))):
            if re.sub(r"\s", "", driver.cdl_number or "").upper() == wanted:
                add([db.get(Person, driver.person_id)], "cdl_number")
    if not found and first_name and last_name and first_name.strip() and last_name.strip():
        add(db.scalars(select(Person).where(func.lower(Person.first_name) == first_name.strip().lower(),
                                            func.lower(Person.last_name) == last_name.strip().lower())), "name")
    if exclude and found:
        declared = set(db.scalars(select(PersonDistinction.other_person_id)
                                  .where(PersonDistinction.person_id == exclude)))
        declared |= set(db.scalars(select(PersonDistinction.person_id)
                                   .where(PersonDistinction.other_person_id == exclude)))
        found = {k: v for k, v in found.items() if k not in declared}
    ranked = sorted(found.values(), key=lambda m: (-len(m.reasons), m.person.last_name, m.person.first_name))
    return ranked[:limit]


def roles_of(db: Session, person_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[dict]]:
    """What each person already is here: driver, owner, owner's contact, staff member."""
    from app.modules.organizations.models import Membership
    from app.modules.owners.models import Owner, OwnerContact

    roles: dict[uuid.UUID, list[dict]] = {pid: [] for pid in person_ids}
    if not person_ids:
        return roles
    for d in db.scalars(select(Driver).where(Driver.person_id.in_(person_ids))):
        roles[d.person_id].append({"role": "driver", "id": str(d.id), "label": "Driver", "status": d.status})
    for o in db.scalars(select(Owner).where(Owner.person_id.in_(person_ids))):
        roles[o.person_id].append({"role": "owner", "id": str(o.id), "label": "Owner", "status": o.status})
    rows = db.execute(select(OwnerContact.person_id, Owner.id, Owner.legal_name, OwnerContact.title)
                      .join(Owner, Owner.id == OwnerContact.owner_id).where(OwnerContact.person_id.in_(person_ids)))
    for pid, owner_id, legal_name, title in rows:
        roles[pid].append({"role": "owner_contact", "id": str(owner_id), "label": title or "Contact",
                           "of": legal_name})
    staff = db.execute(select(Person.id, Membership.role).join(
        Membership, (Membership.user_id == Person.user_id) & (Membership.organization_id == Person.organization_id))
        .where(Person.id.in_(person_ids), Membership.active.is_(True)))
    for pid, role in staff:
        if role not in ("driver", "owner_portal"):
            roles[pid].append({"role": "employee", "label": "Employee", "member_role": role})
        elif role == "owner_portal":
            roles[pid].append({"role": "portal_user", "label": "Portal user"})
    return roles


def search(db: Session, q: str, limit: int = 10) -> list[Person]:
    pattern = "%" + q.strip().replace("%", "\\%").replace("_", "\\_") + "%"
    return list(db.scalars(select(Person).where(or_(
        (Person.first_name + " " + Person.last_name).ilike(pattern), Person.email.ilike(pattern),
        Person.phone.ilike(pattern))).order_by(Person.last_name, Person.first_name).limit(limit)))
