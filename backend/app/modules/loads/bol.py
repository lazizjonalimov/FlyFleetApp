"""Bills of lading, as a PDF to print: one page per load, for the driver to carry and the shipper and receiver to
sign. Everything on it comes from the load as booked; what only the dock knows (seal numbers, signatures, the time
the truck was loaded) is left blank to fill in by hand."""
import uuid
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import pdf
from app.core import scope as team_scope
from app.core.deps import Principal
from app.core.errors import NotFound
from app.modules.customers.models import Customer
from app.modules.dispatch.models import DispatchAssignment
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Trailer, Vehicle
from app.modules.loads.models import Load, LoadItem, LoadStop
from app.modules.organizations.models import Organization

LEFT, RIGHT, MID = 48.0, 564.0, 312.0
EQUIPMENT = {"dry_van": "Dry van", "reefer": "Reefer", "flatbed": "Flatbed", "step_deck": "Step deck",
             "power_only": "Power only", "tanker": "Tanker", "other": "Other"}


def _wrap(text: str, width: float, size: float, bold: bool = False) -> list[str]:
    lines: list[str] = []
    for paragraph in text.splitlines() or [""]:
        line = ""
        for word in paragraph.split():
            trial = f"{line} {word}".strip()
            if pdf.text_width(trial, size, bold) <= width or not line:
                line = trial
            else:
                lines.append(line)
                line = word
        lines.append(line)
    return lines


def _place(stop: LoadStop) -> list[str]:
    city = ", ".join(x for x in (stop.city, " ".join(y for y in (stop.state, stop.postal_code) if y)) if x)
    return [x for x in (stop.name, stop.address, city) if x]


def _page(org: Organization, load: Load, customer: Customer | None, stops: list[LoadStop], items: list[LoadItem],
          hauling: tuple | None, zone: ZoneInfo) -> pdf.Page:
    page = pdf.Page()
    y = 744.0
    page.text(LEFT, y, "Straight bill of lading", 15, bold=True)
    page.text(RIGHT, y, "Not negotiable", 9, grey=True, right=True)
    y -= 22
    pickup = next((s for s in stops if s.type == "pickup"), None)
    delivery = next((s for s in reversed(stops) if s.type == "delivery"), None)
    when = (pickup.appt_start or pickup.appt_end) if pickup else load.pickup_at
    facts = (("BOL number", load.bol_number or load.load_number), ("Load", load.load_number),
             ("Date", f"{when.astimezone(zone):%b} {when.astimezone(zone).day}, {when.astimezone(zone).year}" if when else "—"),
             ("Reference / PO", load.reference or "—"))
    for i, (label, value) in enumerate(facts):
        page.text(LEFT + i * 129, y, label, 8, grey=True)
        page.text(LEFT + i * 129, y - 13, value, 10, bold=True)
    y -= 34
    page.rule(LEFT, y, RIGHT)
    y -= 18

    # Ship from and ship to, side by side.
    def block(x: float, top: float, title: str, stop: LoadStop | None) -> float:
        page.text(x, top, title, 8, bold=True, grey=True)
        row = top - 14
        lines = _place(stop) if stop else ["—"]
        if stop is not None:
            appt = stop.appt_start or stop.appt_end
            if appt:
                local = appt.astimezone(zone)
                lines.append(f"Appointment {local:%b} {local.day} · {local:%H:%M}")
            if stop.contact_name or stop.contact_phone:
                lines.append(" · ".join(x for x in (stop.contact_name, stop.contact_phone) if x))
            if stop.reference:
                lines.append(f"Ref {stop.reference}")
        for i, line in enumerate(lines):
            for part in _wrap(line, 240, 10, bold=i == 0):
                page.text(x, row, part, 10, bold=i == 0)
                row -= 13
        return row

    low = min(block(LEFT, y, "SHIP FROM", pickup), block(MID, y, "SHIP TO", delivery))
    y = low - 8
    between = [s for s in stops if s is not pickup and s is not delivery]
    if between:
        page.text(LEFT, y, "OTHER STOPS", 8, bold=True, grey=True)
        y -= 14
        for stop in between:
            page.text(LEFT, y, f"{stop.seq}. {stop.type.capitalize()} · {' · '.join(_place(stop))}"[:110], 9)
            y -= 12
        y -= 6
    page.rule(LEFT, y, RIGHT)
    y -= 18

    # Who pays, and who carries it.
    page.text(LEFT, y, "BILL FREIGHT CHARGES TO", 8, bold=True, grey=True)
    page.text(MID, y, "CARRIER", 8, bold=True, grey=True)
    row_l, row_r = y - 14, y - 14
    bill = [customer.name] if customer else ["—"]
    if customer is not None:
        bill += [x for x in (customer.billing_address, ", ".join(z for z in (
            customer.billing_city, " ".join(w for w in (customer.billing_state, customer.billing_postal_code) if w)) if z))
                 if x]
    for i, line in enumerate(bill):
        page.text(LEFT, row_l, line[:60], 10, bold=i == 0)
        row_l -= 13
    carrier = [org.legal_name or org.name, " · ".join(x for x in (f"MC {org.mc_number}" if org.mc_number else None,
                                                                    f"USDOT {org.dot_number}" if org.dot_number else None) if x)]
    driver, unit, trailer = hauling if hauling else (None, None, None)
    carrier += [f"Equipment {EQUIPMENT.get(load.equipment_type, load.equipment_type)}",
                f"Truck {unit or '________'} · Trailer {trailer or '________'}", f"Driver {driver or '________________'}"]
    for i, line in enumerate(x for x in carrier if x):
        page.text(MID, row_r, line[:60], 10, bold=i == 0)
        row_r -= 13
    y = min(row_l, row_r) - 6
    page.text(MID, y, "Seal number ____________________", 10)
    y -= 20
    page.rule(LEFT, y, RIGHT)
    y -= 16

    # What is on the truck.
    page.text(LEFT, y, "Handling units", 8, bold=True, grey=True)
    page.text(LEFT + 96, y, "Description of articles", 8, bold=True, grey=True)
    page.text(RIGHT - 60, y, "Weight (lbs)", 8, bold=True, grey=True, right=True)
    page.text(RIGHT, y, "HM", 8, bold=True, grey=True, right=True)
    y -= 6
    page.rule(LEFT, y, RIGHT)
    y -= 14
    lines = [(f"{i.quantity} {i.unit or ''}".strip() if i.quantity else "", i.description, i.weight_lbs) for i in items]
    if not lines:
        lines = [("", load.commodity or "Freight as described by the shipper", load.weight_lbs)]
    for units, description, weight in lines[:14]:
        page.text(LEFT, y, units[:18], 10)
        for j, part in enumerate(_wrap(description, 300, 10)[:2]):
            page.text(LEFT + 96, y - j * 12, part, 10)
        page.text(RIGHT - 60, y, f"{weight:,}" if weight else "", 10, right=True)
        y -= 12 * max(1, min(2, len(_wrap(description, 300, 10)))) + 6
    page.rule(LEFT, y + 4, RIGHT)
    total_units = sum(i.quantity or 0 for i in items)
    total_weight = sum(i.weight_lbs or 0 for i in items) or (load.weight_lbs or 0)
    y -= 10
    page.text(LEFT, y, f"{total_units:,} total" if total_units else "", 10, bold=True)
    page.text(RIGHT - 60, y, f"{total_weight:,}" if total_weight else "—", 10, bold=True, right=True)
    y -= 24

    notes = [x for x in (load.instructions, *(f"{s.type.capitalize()}: {s.instructions}" for s in stops if s.instructions)) if x]
    if notes:
        page.text(LEFT, y, "SPECIAL INSTRUCTIONS", 8, bold=True, grey=True)
        y -= 14
        for note in notes:
            for part in _wrap(note, RIGHT - LEFT, 9)[:4]:
                page.text(LEFT, y, part, 9)
                y -= 12
        y -= 8

    # Signatures, at the foot of the page.
    y = min(y, 190.0)
    page.rule(LEFT, y, RIGHT)
    y -= 16
    for x, title, lines in ((LEFT, "SHIPPER", ("Signature", "Date")),
                            (LEFT + 176, "CARRIER · DRIVER", ("Signature", "Pickup date and time")),
                            (LEFT + 352, "CONSIGNEE", ("Received in good order", "Date and time"))):
        page.text(x, y, title, 8, bold=True, grey=True)
        row = y - 34
        for line in lines:
            page.rule(x, row, x + 160)
            page.text(x, row - 11, line, 8, grey=True)
            row -= 36
    page.text(LEFT, 52, f"{org.name} · printed from FlyFleet · load {load.load_number}", 8, grey=True)
    return page


def bols_pdf(db: Session, p: Principal, load_ids: list[uuid.UUID]) -> tuple[bytes, list[Load]]:
    loads = list(db.scalars(team_scope.where(select(Load).where(Load.id.in_(load_ids)), team_scope.loads(p.scope))))
    if not loads:
        raise NotFound("Load not found")
    order = {load_id: i for i, load_id in enumerate(load_ids)}
    loads.sort(key=lambda load: order.get(load.id, 0))
    org = db.get(Organization, p.org_id)
    zone = ZoneInfo(p.timezone or "UTC")
    ids = [load.id for load in loads]
    customers = {c.id: c for c in db.scalars(select(Customer).where(Customer.id.in_({load.customer_id for load in loads})))}
    stops: dict[uuid.UUID, list[LoadStop]] = {}
    for stop in db.scalars(select(LoadStop).where(LoadStop.load_id.in_(ids)).order_by(LoadStop.seq)):
        stops.setdefault(stop.load_id, []).append(stop)
    items: dict[uuid.UUID, list[LoadItem]] = {}
    for item in db.scalars(select(LoadItem).where(LoadItem.load_id.in_(ids)).order_by(LoadItem.created_at)):
        items.setdefault(item.load_id, []).append(item)
    hauling = {}
    for load_id, first, last, unit, trailer in db.execute(
            select(DispatchAssignment.load_id, Driver.first_name, Driver.last_name, Vehicle.unit_number, Trailer.unit_number)
            .join(Driver, Driver.id == DispatchAssignment.driver_id)
            .join(Vehicle, Vehicle.id == DispatchAssignment.vehicle_id)
            .outerjoin(Trailer, Trailer.id == DispatchAssignment.trailer_id)
            .where(DispatchAssignment.load_id.in_(ids), DispatchAssignment.status.in_(("active", "completed")))).all():
        hauling[load_id] = (f"{first} {last}", unit, trailer)
    pages = [_page(org, load, customers.get(load.customer_id), stops.get(load.id, []), items.get(load.id, []),
                   hauling.get(load.id), zone) for load in loads]
    return pdf.render(pages), loads
