import uuid

from sqlalchemy import CheckConstraint, ForeignKeyConstraint, Index, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.core.crypto import EncryptedText
from app.core.db import Base, IdMixin, TenantScoped, TimestampMixin


class Person(Base, IdMixin, TenantScoped, TimestampMixin):
    """A human being, stored once per company. Driving, owning equipment, working here and signing in to the
    owner portal are roles hung off this one record (drivers.person_id, owners.person_id, owner_contacts,
    persons.user_id), so an owner-operator is never two people and nobody is typed in twice.

    Before a person is created the API looks for one that is already here by tax ID, phone, email and CDL
    number (GET /persons/matches); a match is linked, or explicitly declared a different person."""
    __tablename__ = "persons"
    first_name: Mapped[str] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str | None] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(40))
    # The last ten digits of the phone number, for finding the same person however the number was typed.
    phone_digits: Mapped[str | None] = mapped_column(String(15))
    # SSN or individual EIN, encrypted. The keyed hash finds duplicates; the last four are safe to show.
    tax_id: Mapped[str | None] = mapped_column("tax_id_encrypted", EncryptedText())
    tax_id_hash: Mapped[str | None] = mapped_column(String(64))
    tax_id_last4: Mapped[str | None] = mapped_column(String(4))
    # ISO date, encrypted: a birth date identifies a person.
    date_of_birth: Mapped[str | None] = mapped_column("date_of_birth_encrypted", EncryptedText())
    street: Mapped[str | None] = mapped_column(String(200))
    city: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(2))
    postal_code: Mapped[str | None] = mapped_column(String(10))
    # A staff member's sign-in in this company: "Alex dispatches here and owns a truck".
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    notes: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (
        UniqueConstraint("organization_id", "id"),
        ForeignKeyConstraint(["organization_id", "user_id"],
                             ["organization_memberships.organization_id", "organization_memberships.user_id"],
                             name="fk_persons_membership"),
        Index("uq_persons_user", "organization_id", "user_id", unique=True, postgresql_where=text("user_id IS NOT NULL")),
        Index("ix_persons_org_name", "organization_id", "last_name", "first_name", "id"),
        Index("ix_persons_org_tax", "organization_id", "tax_id_hash"),
        Index("ix_persons_org_phone", "organization_id", "phone_digits"),
        Index("ix_persons_org_email", "organization_id", text("lower(email)")),
        CheckConstraint("tax_id_last4 IS NULL OR length(tax_id_last4) = 4", name="last4_len"),
    )


class PersonDistinction(Base, IdMixin, TenantScoped, TimestampMixin):
    """Someone looked at a likely duplicate and said these are two different people, with the reason. Kept so
    the same pair isn't offered again, and audited."""
    __tablename__ = "person_distinctions"
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    other_person_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    reason: Mapped[str] = mapped_column(String(300))
    decided_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "person_id"], ["persons.organization_id", "persons.id"],
                             name="fk_person_distinctions_person", ondelete="CASCADE"),
        ForeignKeyConstraint(["organization_id", "other_person_id"], ["persons.organization_id", "persons.id"],
                             name="fk_person_distinctions_other", ondelete="CASCADE"),
        UniqueConstraint("organization_id", "person_id", "other_person_id"),
        CheckConstraint("person_id <> other_person_id", name="two_people"),
    )
