"""Integrations: each outside service FlyFleet can work with, whether it is connected, and what came in.

Every provider sits behind an adapter. What is connected today: positions sent to the API (by a telematics
integration or the driver app), the driver app itself, and, when the operator turns it on, Claude for reading
documents and suggesting replies. Telegram, SMS, email, fuel cards and accounting have no connection yet, and the
page says so with what FlyFleet does instead.
"""
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import Principal, get_db, require
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Vehicle
from app.modules.messaging.models import Message
from app.modules.tracking.models import VehiclePosition

router = APIRouter(tags=["integrations"])


class IntegrationFact(BaseModel):
    label: str
    value: str


class Integration(BaseModel):
    key: str
    name: str
    category: str
    tag: str | None
    state: Literal["connected", "receiving", "enabled", "built_in", "off", "not_connected"]
    state_label: str
    facts: list[IntegrationFact]


class InboundEvent(BaseModel):
    event: str
    provider: str
    received_at: datetime
    key: str
    result: str


class IntegrationsOut(BaseModel):
    integrations: list[Integration]
    events: list[InboundEvent]


def _clock(p: Principal, at: datetime | None) -> str:
    from zoneinfo import ZoneInfo
    if at is None:
        return "Never"
    local = at.astimezone(ZoneInfo(p.timezone or "UTC"))
    return f"{local:%H:%M} today" if local.date() == p.today() else f"{local:%b} {local.day}, {local:%H:%M}"


@router.get("/integrations", response_model=IntegrationsOut)
def integrations(p: Principal = Depends(require("organization.manage")), db: Session = Depends(get_db)):
    now = datetime.now(UTC)
    day = now - timedelta(hours=24)
    settings = get_settings()
    trucks = db.scalar(select(func.count()).select_from(Vehicle).where(Vehicle.status != "retired")) or 0

    def feed(source: str) -> tuple[int, int, datetime | None]:
        row = db.execute(select(func.count(), func.count(func.distinct(VehiclePosition.vehicle_id)),
                                func.max(VehiclePosition.received_at))
                         .where(VehiclePosition.source == source, VehiclePosition.received_at >= day)).one()
        last = db.scalar(select(func.max(VehiclePosition.received_at)).where(VehiclePosition.source == source))
        return row[0], row[1], last
    tele_n, tele_v, tele_last = feed("telematics")
    app_n, app_v, app_last = feed("driver_app")
    drivers = db.scalar(select(func.count()).select_from(Driver).where(Driver.status == "active")) or 0
    on_app = db.scalar(select(func.count()).select_from(Driver).where(Driver.status == "active",
                                                                     Driver.user_id.is_not(None))) or 0
    delivered = db.scalar(select(func.count()).select_from(Message).where(Message.created_at >= day,
                                                                         Message.direction.in_(("out", "system")))) or 0
    reader, drafts = settings.document_reader == "anthropic", settings.assistant == "anthropic"
    cards = [
        Integration(key="telematics", name="Telematics", category="GPS and vehicle speed, sent to the positions API",
                    tag=None, state="receiving" if tele_n else "not_connected",
                    state_label="Receiving" if tele_n else "Not connected",
                    facts=[IntegrationFact(label="Sends to", value="/api/v1/positions"),
                           IntegrationFact(label="Trucks reporting · 24 h", value=f"{tele_v} of {trucks}"),
                           IntegrationFact(label="Positions · 24 h", value=f"{tele_n:,}"),
                           IntegrationFact(label="Last position", value=_clock(p, tele_last))]),
        Integration(key="driver_app", name="Driver app", category="Loads, messages, alerts and phone GPS",
                    tag=None, state="connected", state_label="Connected",
                    facts=[IntegrationFact(label="Drivers signed up", value=f"{on_app} of {drivers}"),
                           IntegrationFact(label="Phone positions · 24 h", value=f"{app_n:,} from {app_v} trucks"),
                           IntegrationFact(label="Messages and cards sent · 24 h", value=f"{delivered:,}")]),
        Integration(key="assistant", name="AI assistant", category="Reading documents and suggesting replies",
                    tag="Anthropic" if reader or drafts else None,
                    state="enabled" if reader or drafts else "off", state_label="Enabled" if reader or drafts else "Off",
                    facts=[IntegrationFact(label="Photo and scan reading", value="On" if reader else "Off · text PDFs only"),
                           IntegrationFact(label="Suggested replies", value="On" if drafts else "Off"),
                           IntegrationFact(label="Sends on its own", value="Never · a person checks everything")]),
        Integration(key="maps", name="Maps and places", category="Map, place names and ETAs", tag=None,
                    state="built_in", state_label="Built in",
                    facts=[IntegrationFact(label="Map data", value="US Census, Natural Earth, GeoNames"),
                           IntegrationFact(label="ETAs", value="Straight line × 1.2 at 55 mph"),
                           IntegrationFact(label="Live traffic", value="Not connected")]),
        Integration(key="telegram", name="Telegram", category="Driver alerts and messaging", tag=None,
                    state="not_connected", state_label="Not connected",
                    facts=[IntegrationFact(label="Drivers linked", value=f"0 of {drivers}"),
                           IntegrationFact(label="Today", value="Alerts and messages go to the driver app"),
                           IntegrationFact(label="Needs", value="A Telegram bot for the company")]),
        Integration(key="email", name="Email and SMS", category="Invoices, notices and customer messages", tag=None,
                    state="not_connected", state_label="Not connected",
                    facts=[IntegrationFact(label="Today", value="Invoices are downloaded and sent by hand"),
                           IntegrationFact(label="Customer messages", value="Kept, not sent"),
                           IntegrationFact(label="Needs", value="An email and SMS provider")]),
        Integration(key="fuel_cards", name="Fuel cards", category="Purchases for Fuel and IFTA", tag=None,
                    state="not_connected", state_label="Not connected",
                    facts=[IntegrationFact(label="Today", value="Receipts are scanned or typed in"),
                           IntegrationFact(label="Would bring in", value="Every purchase, by card and truck"),
                           IntegrationFact(label="Needs", value="WEX, Comdata, EFS or another provider")]),
        Integration(key="fmcsa", name="FMCSA", category="Roadside inspections and SMS scores", tag=None,
                    state="not_connected", state_label="Not connected",
                    facts=[IntegrationFact(label="Today", value="Inspections are scanned or typed in"),
                           IntegrationFact(label="Would bring in", value="Every inspection on your DOT number, monthly"),
                           IntegrationFact(label="Needs", value="Your DOT number and an FMCSA data feed")]),
        Integration(key="accounting", name="Accounting", category="Invoices and payments to the ledger", tag=None,
                    state="not_connected", state_label="Not connected",
                    facts=[IntegrationFact(label="Today", value="CSV export from Reports"),
                           IntegrationFact(label="Would sync", value="Invoices, payments, expenses"),
                           IntegrationFact(label="Needs", value="QuickBooks Online or Xero")]),
    ]
    # What came in: each batch of positions as it arrived, and messages from drivers.
    batches = db.execute(select(VehiclePosition.source, VehiclePosition.received_at, func.count(),
                                func.count(func.distinct(VehiclePosition.vehicle_id)), func.min(Vehicle.unit_number))
                         .join(Vehicle, Vehicle.id == VehiclePosition.vehicle_id)
                         .group_by(VehiclePosition.source, VehiclePosition.received_at)
                         .order_by(VehiclePosition.received_at.desc()).limit(20)).all()
    events = [InboundEvent(event=f"vehicle.location · {unit if trucks_n == 1 else f'{trucks_n} trucks'}",
                           provider="Driver app" if source == "driver_app" else "Telematics" if source == "telematics"
                           else "Entered by hand", received_at=at, key=f"{source}:{at:%H%M%S}",
                           result=f"Processed · {n} {'sample' if n == 1 else 'samples'}")
              for source, at, n, trucks_n, unit in batches]
    for msg, name in db.execute(select(Message, Driver.first_name).join(Driver, Driver.id == Message.author_driver_id)
                                .where(Message.direction == "in").order_by(Message.created_at.desc()).limit(10)).all():
        events.append(InboundEvent(event=f"message.inbound · {name}", provider="Driver app", received_at=msg.created_at,
                                   key=str(msg.id)[:8], result="Processed"))
    events.sort(key=lambda e: e.received_at, reverse=True)
    return IntegrationsOut(integrations=cards, events=events[:20])
