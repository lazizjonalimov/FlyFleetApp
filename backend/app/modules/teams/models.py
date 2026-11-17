import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Integer, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TenantScoped


class DispatchTeam(Base, IdMixin, TenantScoped):
    """A set of trucks a group of dispatchers works. Its dispatchers see those trucks and everything tied to them
    (their loads, drivers, positions and alerts), and nothing else of the fleet."""
    __tablename__ = "dispatch_teams"
    name: Mapped[str] = mapped_column(String(60))
    color: Mapped[str] = mapped_column(String(7), default="#1F4FE0", server_default="#1F4FE0")
    lead_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    # Loads not on a truck yet: only those tagged for the team, or the whole shared queue (assignable only to
    # the team's trucks).
    unassigned_loads: Mapped[str] = mapped_column(String(10), default="tagged", server_default="tagged")
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")

    __table_args__ = (
        CheckConstraint("unassigned_loads IN ('tagged', 'shared')", name="unassigned_valid"),
        UniqueConstraint("organization_id", "id"),
        UniqueConstraint("organization_id", "name", name="uq_dispatch_teams_name"),
    )


class DispatchTeamMember(Base, IdMixin, TenantScoped):
    """A dispatcher on a team. A dispatcher is on one team at a time."""
    __tablename__ = "dispatch_team_members"
    team_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "team_id"], ["dispatch_teams.organization_id", "dispatch_teams.id"],
                             name="fk_dispatch_team_members_team", ondelete="CASCADE"),
        UniqueConstraint("organization_id", "user_id", name="uq_dispatch_team_members_user"),
    )


class DispatchTeamVehicle(Base, IdMixin, TenantScoped):
    """A truck in a team. A truck is in one team at a time; loads, drivers and alerts follow the truck."""
    __tablename__ = "dispatch_team_vehicles"
    team_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "team_id"], ["dispatch_teams.organization_id", "dispatch_teams.id"],
                             name="fk_dispatch_team_vehicles_team", ondelete="CASCADE"),
        ForeignKeyConstraint(["organization_id", "vehicle_id"], ["vehicles.organization_id", "vehicles.id"],
                             name="fk_dispatch_team_vehicles_vehicle", ondelete="CASCADE"),
        UniqueConstraint("organization_id", "vehicle_id", name="uq_dispatch_team_vehicles_vehicle"),
    )
