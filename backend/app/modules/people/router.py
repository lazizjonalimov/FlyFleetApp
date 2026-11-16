"""Finding a person who is already on file before anyone types them in again."""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.deps import Principal, get_db, get_or_404, require
from app.core.errors import Invalid
from app.modules.people import service
from app.modules.people.models import Person, PersonDistinction

router = APIRouter(prefix="/persons", tags=["people"])
# Whoever adds people (drivers, owners, staff) may look for the person first.
FIND = require("drivers.manage", "owners.manage", "users.manage")


class PersonRole(BaseModel):
    role: str
    label: str
    id: str | None = None
    status: str | None = None
    of: str | None = None
    member_role: str | None = None


class PersonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    first_name: str
    last_name: str
    email: str | None
    phone: str | None
    city: str | None
    state: str | None
    tax_id_last4: str | None
    has_date_of_birth: bool = False
    roles: list[PersonRole] = []


class PersonMatch(BaseModel):
    person: PersonOut
    # Why this is probably the same person: tax_id, phone, email, cdl_number or name.
    reasons: list[str]


class MatchParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tax_id: str | None = Field(None, max_length=20)
    phone: str | None = Field(None, max_length=40)
    email: str | None = Field(None, max_length=254)
    cdl_number: str | None = Field(None, max_length=40)
    first_name: str | None = Field(None, max_length=80)
    last_name: str | None = Field(None, max_length=80)
    exclude: uuid.UUID | None = None


class DistinctionIn(BaseModel):
    other_person_id: uuid.UUID
    reason: str = Field(min_length=3, max_length=300)


def present(db: Session, people: list[Person]) -> list[PersonOut]:
    roles = service.roles_of(db, [x.id for x in people])
    return [PersonOut.model_validate(x).model_copy(update={
        "roles": [PersonRole(**r) for r in roles.get(x.id, [])], "has_date_of_birth": bool(x.date_of_birth)})
        for x in people]


@router.get("/matches", response_model=list[PersonMatch], summary="People who are probably the one being entered")
def matches(params: Annotated[MatchParams, Query()], p: Principal = Depends(FIND), db: Session = Depends(get_db)):
    found = service.find_matches(db, **params.model_dump())
    shown = present(db, [m.person for m in found])
    return [PersonMatch(person=person, reasons=m.reasons) for person, m in zip(shown, found, strict=True)]


@router.get("", response_model=list[PersonOut], summary="Find people by name, email or phone")
def search(q: str = Query(min_length=2, max_length=100), p: Principal = Depends(FIND), db: Session = Depends(get_db)):
    return present(db, service.search(db, q))


@router.get("/{person_id}", response_model=PersonOut)
def get_person(person_id: uuid.UUID, p: Principal = Depends(FIND), db: Session = Depends(get_db)):
    return present(db, [get_or_404(db, Person, person_id, "Person")])[0]


@router.post("/{person_id}/distinctions", status_code=204,
             summary="Record that a likely duplicate is a different person, with the reason")
def declare_different(person_id: uuid.UUID, body: DistinctionIn, p: Principal = Depends(FIND),
                      db: Session = Depends(get_db)):
    if body.other_person_id == person_id:
        raise Invalid("Choose a different person", field="other_person_id")
    get_or_404(db, Person, person_id, "Person")
    get_or_404(db, Person, body.other_person_id, "Person")
    db.add(PersonDistinction(organization_id=p.org_id, person_id=person_id, other_person_id=body.other_person_id,
                             reason=body.reason.strip(), decided_by=p.user_id))
    db.flush()
    audit(db, p, "person.not_duplicate", "person", person_id,
          {"other_person_id": str(body.other_person_id), "reason": body.reason.strip()})
    db.commit()
