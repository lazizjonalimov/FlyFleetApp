import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TenantScoped

POSITION_SOURCES = ("telematics", "driver_app", "manual")
POLICY_KINDS = ("speeding", "yard_speed", "dwell", "gps_stale")
INCIDENT_KINDS = ("speeding", "yard_speed", "dwell", "gps_stale", "late", "at_risk", "unassigned", "pod_missing",
                  "out_of_service", "documents")
INCIDENT_STATES = ("watching", "open", "notified", "acknowledged", "resolved")


class VehiclePosition(Base, IdMixin, TenantScoped):
    """Where a truck was at a moment, as its telematics or the driver's phone reported it. Append-only; the same
    sample sent twice is kept once."""
    __tablename__ = "vehicle_positions"
    vehicle_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    driver_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    lat: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    lon: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    speed_mph: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    heading: Mapped[int | None] = mapped_column(SmallInteger)
    accuracy_m: Mapped[int | None] = mapped_column(Integer)
    odometer_mi: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(12))

    __table_args__ = (
        CheckConstraint("source IN " + str(POSITION_SOURCES), name="source_valid"),
        CheckConstraint("lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180", name="lat_lon_valid"),
        CheckConstraint("heading IS NULL OR heading BETWEEN 0 AND 359", name="heading_valid"),
        CheckConstraint("speed_mph IS NULL OR speed_mph >= 0", name="speed_nonneg"),
        ForeignKeyConstraint(["organization_id", "vehicle_id"], ["vehicles.organization_id", "vehicles.id"],
                             name="fk_vehicle_positions_vehicle", ondelete="CASCADE"),
        UniqueConstraint("organization_id", "vehicle_id", "recorded_at", "source", name="uq_vehicle_positions_sample"),
        Index("ix_vehicle_positions_org_vehicle_time", "organization_id", "vehicle_id", "recorded_at"),
    )


class Geofence(Base, IdMixin, TenantScoped):
    """A circle around a place that matters: a customer's dock, the company's yard, a shop."""
    __tablename__ = "geofences"
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(10), default="customer", server_default="customer")
    lat: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    lon: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    radius_m: Mapped[int] = mapped_column(Integer, default=400, server_default="400")
    customer_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("kind IN ('customer', 'yard', 'shop', 'other')", name="kind_valid"),
        CheckConstraint("radius_m BETWEEN 50 AND 20000", name="radius_valid"),
        UniqueConstraint("organization_id", "id"),
    )


class AlertPolicy(Base, IdMixin, TenantScoped):
    """A rule that turns raw positions or records into incidents people act on, and who is told. Every save is a
    new version; an incident keeps the version that raised it."""
    __tablename__ = "alert_policies"
    kind: Mapped[str] = mapped_column(String(12))
    name: Mapped[str] = mapped_column(String(80))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    recipients: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    message: Mapped[str | None] = mapped_column(Text)
    applies_to: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("kind IN " + str(POLICY_KINDS), name="kind_valid"),
        UniqueConstraint("organization_id", "id"),
    )


class AlertPolicyVersion(Base, IdMixin, TenantScoped):
    """A saved version of a policy, kept as it was."""
    __tablename__ = "alert_policy_versions"
    policy_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    version: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(80))
    enabled: Mapped[bool] = mapped_column(Boolean)
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB)
    recipients: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    message: Mapped[str | None] = mapped_column(Text)
    applies_to: Mapped[dict[str, Any]] = mapped_column(JSONB)
    note: Mapped[str | None] = mapped_column(String(300))
    saved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "policy_id"], ["alert_policies.organization_id", "alert_policies.id"],
                             name="fk_alert_policy_versions_policy", ondelete="CASCADE"),
        UniqueConstraint("organization_id", "policy_id", "version", name="uq_alert_policy_versions"),
    )


class Incident(Base, IdMixin, TenantScoped):
    """One episode that needs someone: a truck speeding for minutes on end, a load that will miss its appointment.
    One incident per episode however many samples or checks see it, with an owner, a state and a trail."""
    __tablename__ = "incidents"
    number: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(15))
    severity: Mapped[str] = mapped_column(String(6), default="medium", server_default="medium")
    state: Mapped[str] = mapped_column(String(12), default="open", server_default="open")
    # The same episode seen again finds this incident by its key, so it is never raised twice while unresolved.
    episode_key: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(160))
    detail: Mapped[str | None] = mapped_column(String(300))
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    driver_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    load_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    policy_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    policy_version: Mapped[int | None] = mapped_column(Integer)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # When the condition stopped (the truck slowed down, the load was delivered); the incident may stay open.
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    peak: Mapped[Decimal | None] = mapped_column(Numeric(8, 1))
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    escalate_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution: Mapped[str | None] = mapped_column(String(300))
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")

    __table_args__ = (
        CheckConstraint("kind IN " + str(INCIDENT_KINDS), name="kind_valid"),
        CheckConstraint("state IN " + str(INCIDENT_STATES), name="state_valid"),
        CheckConstraint("severity IN ('high', 'medium', 'low')", name="severity_valid"),
        UniqueConstraint("organization_id", "id"),
        UniqueConstraint("organization_id", "number", name="uq_incidents_number"),
        Index("uq_incidents_open_episode", "organization_id", "episode_key", unique=True,
              postgresql_where=text("state <> 'resolved'")),
        Index("ix_incidents_org_state", "organization_id", "state", "detected_at"),
        Index("ix_incidents_org_vehicle", "organization_id", "vehicle_id"),
    )


class IncidentEvent(Base, IdMixin, TenantScoped):
    """What happened to an incident, in order: detected, who was told and how, acknowledged, escalated,
    resolved, notes."""
    __tablename__ = "incident_events"
    incident_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    kind: Mapped[str] = mapped_column(String(15))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    text: Mapped[str] = mapped_column(String(300))
    tone: Mapped[str] = mapped_column(String(6), default="info", server_default="info")
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "incident_id"], ["incidents.organization_id", "incidents.id"],
                             name="fk_incident_events_incident", ondelete="CASCADE"),
        Index("ix_incident_events_org_incident", "organization_id", "incident_id", "at"),
    )
