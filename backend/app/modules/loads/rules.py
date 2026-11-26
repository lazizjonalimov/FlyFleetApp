"""The rules behind a load's money, its readiness to invoice and the board: pure functions, so the list, the detail
page, the invoice and the tests all work them out the same way."""
from dataclasses import dataclass, field
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
ZERO = Decimal("0")
EXTRA_STOP_MILES = 35
MARGIN_WARNING_PCT = 25
FUEL_CHOICES = (10, 12, 14, 15)


def cents(value: Decimal | float | int) -> Decimal:
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------- detention
def dwell_minutes(arrived_at: datetime | None, departed_at: datetime | None, now: datetime) -> int | None:
    """How long the truck was (or has been) at a stop; None before it gets there."""
    if arrived_at is None:
        return None
    end = departed_at or now
    return max(0, int((end - arrived_at).total_seconds() // 60))


@dataclass
class Detention:
    stop: str
    dwell_minutes: int
    billable_minutes: int
    amount: Decimal

    def explain(self, free_hours: Decimal, rate: Decimal) -> str:
        return (f"{self.stop} {_dur(self.dwell_minutes)} − {_num(free_hours)} h free = {_dur(self.billable_minutes)} "
                f"× ${_num(rate)}/h = ${self.amount:,.2f}")


def detention(stops: list[tuple[str, int | None]], free_hours: Decimal, rate: Decimal) -> list[Detention]:
    """For each stop with a dwell: max(0, dwell − free hours) / 60 × rate. Stops with nothing to bill are left out."""
    out = []
    for name, minutes in stops:
        if minutes is None:
            continue
        over = max(0, minutes - int(Decimal(free_hours) * 60))
        if over > 0:
            out.append(Detention(name, minutes, over, cents(Decimal(over) / 60 * Decimal(rate))))
    return out


# ---------------------------------------------------------------- money
@dataclass
class Costs:
    driver_pay_per_mile: Decimal = Decimal("0.62")
    mpg: Decimal = Decimal("6.8")
    fuel_price: Decimal = Decimal("3.92")
    overhead_per_mile: Decimal = Decimal("1.65")


@dataclass
class Charge:
    status: str  # pending, approved, rejected
    bill: bool
    amount: Decimal


@dataclass
class Money:
    line_haul: Decimal
    fuel_pct: Decimal
    fuel: Decimal
    detention: Decimal
    detention_parts: list[Detention]
    charges: Decimal
    pending: int
    total: Decimal
    miles: int
    driver_pay: Decimal
    fuel_cost: Decimal
    overhead: Decimal
    margin: Decimal
    margin_pct: int | None
    rate_per_mile: Decimal | None
    warning: bool = field(default=False)


def fuel_surcharge(line_haul: Decimal, pct: Decimal) -> Decimal:
    return cents(Decimal(line_haul) * Decimal(pct) / 100)


def money(line_haul: Decimal, fuel_pct: Decimal, miles: int | None, dwell: list[tuple[str, int | None]],
          free_hours: Decimal, rate: Decimal, charges: list[Charge], costs: Costs) -> Money:
    """Revenue: line haul, fuel surcharge, detention and the charges billed to the customer (rejected ones aside).
    Margin: revenue less driver pay, fuel and overhead for the miles."""
    fuel = fuel_surcharge(line_haul, fuel_pct)
    parts = detention(dwell, free_hours, rate)
    det = sum((p.amount for p in parts), ZERO)
    billed = sum((c.amount for c in charges if c.bill and c.status != "rejected"), ZERO)
    total = cents(Decimal(line_haul) + fuel + det + billed)
    mi = int(miles or 0)
    pay = cents(mi * costs.driver_pay_per_mile)
    fuel_cost = cents(Decimal(mi) / costs.mpg * costs.fuel_price) if costs.mpg else ZERO
    overhead = cents(mi * costs.overhead_per_mile)
    margin = total - pay - fuel_cost - overhead
    pct = int((margin / total * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)) if total else None
    return Money(line_haul=cents(line_haul), fuel_pct=Decimal(fuel_pct), fuel=fuel, detention=det, detention_parts=parts,
                 charges=billed, pending=sum(1 for c in charges if c.status == "pending"), total=total, miles=mi,
                 driver_pay=pay, fuel_cost=fuel_cost, overhead=overhead, margin=margin, margin_pct=pct,
                 rate_per_mile=cents(total / mi) if mi else None,
                 warning=pct is not None and pct < MARGIN_WARNING_PCT)


# ---------------------------------------------------------------- ready to invoice
DELIVERED = ("delivered", "pod_review", "completed")


@dataclass
class Item:
    key: str
    label: str
    done: bool
    action: str = ""
    detail: str = ""


def checklist(status: str, papers: dict[str, bool], pending_charges: int, terms_days: int | None,
              invoiced: bool) -> list[Item]:
    """What a load needs before it can be invoiced, each with the one thing to do about it while it's open."""
    delivered = status in DELIVERED
    return [
        Item("rate_confirmation", "Rate confirmation attached", papers.get("rate_confirmation", False), "Attach"),
        Item("bol", "Bill of lading uploaded", papers.get("bol", False), "Request" if delivered or status in
             ("at_pickup", "in_transit", "at_delivery") else "Upload"),
        Item("delivered", "Delivered", delivered),
        Item("pod", "Proof of delivery uploaded", papers.get("pod", False), "Request" if delivered else ""),
        Item("pod_reviewed", "Proof of delivery reviewed", status == "completed", "Approve" if status == "pod_review" else ""),
        Item("charges", "Extra charges approved", pending_charges == 0, "Approve all" if pending_charges else "",
             f"{pending_charges} waiting" if pending_charges else ""),
        Item("terms", "Billing terms on file", terms_days is not None, "Set terms" if terms_days is None else "",
             f"Net {terms_days}" if terms_days is not None else ""),
    ] if not invoiced else []


def ready(items: list[Item]) -> bool:
    return bool(items) and all(i.done for i in items)


# ---------------------------------------------------------------- the board
COLUMNS = ("unassigned", "assigned", "in_transit", "delivered", "completed")
COLUMN_LABEL = {"unassigned": "Unassigned", "assigned": "Assigned", "in_transit": "In transit",
                "delivered": "Delivered", "completed": "Completed"}


def column_of(status: str, has_driver: bool) -> str | None:
    if status in ("cancelled",):
        return None
    if status in ("draft", "planned") or (status == "on_hold" and not has_driver):
        return "unassigned"
    if status in ("assigned", "on_hold"):
        return "assigned"
    if status in ("dispatched", "at_pickup", "in_transit", "at_delivery"):
        return "in_transit"
    if status in ("delivered", "pod_review"):
        return "delivered"
    return "completed"


@dataclass
class Move:
    ok: bool
    reason: str = ""
    action: str | None = None  # the lifecycle action that makes the move, when there is one
    needs_assign: bool = False


def board_move(load_number: str, status: str, has_driver: bool, has_pod: bool, target: str) -> Move:
    """Whether a card can be dropped in a column, and what doing it means. Loads don't go back once they're moving,
    nothing past Unassigned has no driver, and nothing is completed without its proof of delivery. A move that needs
    something only a person can record (arriving, delivering) says so rather than inventing the time."""
    current = column_of(status, has_driver)
    if current is None:
        return Move(False, f"{load_number} is cancelled.")
    if target == current:
        return Move(True)
    order = COLUMNS.index
    if order(target) < order(current) and not (order(current) <= 1 and order(target) <= 1):
        return Move(False, "A load can’t go back once it is moving.")
    if order(target) >= 1 and not has_driver:
        return Move(False, f"{load_number} needs a driver first. Use Assign driver.", needs_assign=target == "assigned")
    if target == "completed" and not has_pod:
        return Move(False, f"The POD isn’t in yet for {load_number}.")
    if target == "unassigned":
        if status == "assigned":
            return Move(True, action="unassign")
        return Move(False, f"Release {load_number} from hold first.")
    if target == "in_transit":
        if status == "assigned":
            return Move(True, action="dispatch")
        return Move(False, f"Release {load_number} from hold first.")
    if target == "delivered":
        if status == "at_delivery":
            return Move(True, action="depart")
        return Move(False, f"Record the arrival at each stop for {load_number} first: open it and use Update status.")
    if target == "completed":
        if status == "pod_review":
            return Move(True, action="approve_pod")
        return Move(False, f"Review the POD for {load_number} first.")
    return Move(False, "That move isn’t possible.")


# ---------------------------------------------------------------- risk in words
def risk_reason(code: str, late_by_minutes: int = 0, cause: str | None = None,
                pickup_in_minutes: int | None = None) -> tuple[str, str]:
    """A risk's short label and the plain reason: "ETA +1h 40m, traffic stopped on I-35 at Ardmore"."""
    if code == "LATE_DELIVERY" or (code == "ETA" and late_by_minutes > 0):
        head = f"ETA +{_dur(late_by_minutes)}" if late_by_minutes > 0 else "Past the delivery appointment"
        return "Running late", f"{head}, {cause[0].lower() + cause[1:]}" if cause else head
    if code == "LATE_PICKUP":
        return "Late pickup", cause or "The pickup appointment has passed"
    if code == "UNASSIGNED_SOON":
        when = f"Pickup in {_dur(pickup_in_minutes)}" if pickup_in_minutes and pickup_in_minutes > 0 else "Pickup is soon"
        return "No driver", f"{when}, no driver assigned"
    if code == "MISSING_POD":
        return "POD missing", cause or "Delivered, waiting for the proof of delivery. Invoicing is blocked"
    if code == "PENDING_CHARGES":
        return "Charges waiting", cause or "Extra charges are waiting for approval. Invoicing is blocked"
    return "Needs attention", cause or code.replace("_", " ").capitalize()


def _dur(minutes: int | None) -> str:
    m = int(minutes or 0)
    if m < 60:
        return f"{m}m"
    return f"{m // 60}h {m % 60}m" if m % 60 else f"{m // 60}h"


def _num(value: Decimal) -> str:
    d = Decimal(value)
    return f"{d:.0f}" if d == d.to_integral() else f"{d.normalize()}"
