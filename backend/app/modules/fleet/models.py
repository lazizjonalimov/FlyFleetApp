import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKeyConstraint, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.core.db import Base, IdMixin, TenantScoped, TimestampMixin

# How a team's pay splits between its two drivers.
TEAM_SPLITS = ("equal", "miles")


class UnitAssignment(Base, IdMixin, TenantScoped, TimestampMixin):
    """Who drives a truck: a primary driver and, for a team, a co-driver, from a date. Set in Dispatch, never on
    the owner: changing a driver never changes ownership, and the reverse. The open row (effective_to NULL) is
    the current seat assignment; ending it and opening another keeps the history."""
    __tablename__ = "unit_assignments"
    vehicle_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    driver_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    co_driver_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    team_split: Mapped[str] = mapped_column(String(10), default="equal", server_default="equal")
    effective_from: Mapped[date] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date)
    reason: Mapped[str | None] = mapped_column(String(300))
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "vehicle_id"], ["vehicles.organization_id", "vehicles.id"],
                             name="fk_unit_assignments_vehicle", ondelete="CASCADE"),
        ForeignKeyConstraint(["organization_id", "driver_id"], ["drivers.organization_id", "drivers.id"],
                             name="fk_unit_assignments_driver"),
        ForeignKeyConstraint(["organization_id", "co_driver_id"], ["drivers.organization_id", "drivers.id"],
                             name="fk_unit_assignments_co_driver"),
        Index("ix_unit_assignments_org_vehicle", "organization_id", "vehicle_id"),
        Index("ix_unit_assignments_org_driver", "organization_id", "driver_id"),
        # One open seat assignment per truck.
        Index("uq_unit_assignments_open", "organization_id", "vehicle_id", unique=True,
              postgresql_where=text("effective_to IS NULL")),
        CheckConstraint("co_driver_id IS NULL OR co_driver_id <> driver_id", name="two_drivers"),
        CheckConstraint("team_split IN " + str(TEAM_SPLITS), name="split_valid"),
        CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="dates_valid"),
    )
