"""The rules behind a load's money, its readiness to invoice and the board."""
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from app.modules.loads import rules
from app.modules.loads.rules import Charge, Costs

NOW = datetime(2026, 11, 26, 12, tzinfo=UTC)


def test_dwell_and_detention():
    assert rules.dwell_minutes(None, None, NOW) is None
    assert rules.dwell_minutes(NOW - timedelta(hours=3), None, NOW) == 180          # still there
    assert rules.dwell_minutes(NOW - timedelta(hours=3), NOW - timedelta(hours=1), NOW) == 120
    parts = rules.detention([("Pickup", 187), ("Delivery", 90), ("Fuel stop", None)], Decimal("2"), Decimal("75"))
    assert [(p.stop, p.billable_minutes, p.amount) for p in parts] == [("Pickup", 67, Decimal("83.75"))]
    assert parts[0].explain(Decimal("2"), Decimal("75")) == "Pickup 3h 7m − 2 h free = 1h 7m × $75/h = $83.75"
    assert rules.detention([("Pickup", 120)], Decimal("2"), Decimal("75")) == []      # exactly the free time


def test_money_and_margin():
    m = rules.money(Decimal("2000"), Decimal("12"), 500, [("Pickup", 180)], Decimal("2"), Decimal("75"),
                    [Charge("approved", True, Decimal("100")), Charge("pending", True, Decimal("50")),
                     Charge("rejected", True, Decimal("999")), Charge("approved", False, Decimal("40"))], Costs())
    assert m.fuel == Decimal("240.00") and m.detention == Decimal("75.00")
    assert m.charges == Decimal("150") and m.pending == 1
    assert m.total == Decimal("2465.00")
    assert m.driver_pay == Decimal("310.00") and m.fuel_cost == Decimal("288.24") and m.overhead == Decimal("825.00")
    assert m.margin == Decimal("1041.76") and m.margin_pct == 42 and not m.warning
    assert m.rate_per_mile == Decimal("4.93")
    thin = rules.money(Decimal("1000"), Decimal("0"), 500, [], Decimal("2"), Decimal("75"), [], Costs())
    assert thin.margin_pct is not None and thin.margin_pct < 25 and thin.warning
    assert rules.money(Decimal("0"), Decimal("12"), None, [], Decimal("2"), Decimal("75"), [], Costs()).rate_per_mile is None


def test_ready_to_invoice_checklist():
    papers = {"rate_confirmation": True, "bol": True, "pod": True}
    items = rules.checklist("completed", papers, 0, 30, invoiced=False)
    assert [i.label for i in items] == ["Rate confirmation attached", "Bill of lading uploaded", "Delivered",
                                        "Proof of delivery uploaded", "Proof of delivery reviewed",
                                        "Extra charges approved", "Billing terms on file"]
    assert rules.ready(items)
    waiting = rules.checklist("pod_review", {**papers, "bol": False}, 2, None, invoiced=False)
    open_ = {i.key: (i.action, i.detail) for i in waiting if not i.done}
    assert open_ == {"bol": ("Request", ""), "pod_reviewed": ("Approve", ""), "charges": ("Approve all", "2 waiting"),
                     "terms": ("Set terms", "")}
    assert not rules.ready(waiting)
    assert rules.checklist("completed", papers, 0, 30, invoiced=True) == []


def test_board_moves():
    move = rules.board_move
    assert not move("L-1", "in_transit", True, False, "assigned").ok                 # can't go back once moving
    assert move("L-1", "in_transit", True, False, "assigned").reason == "A load can’t go back once it is moving."
    nodrv = move("L-1", "planned", False, False, "assigned")
    assert not nodrv.ok and nodrv.needs_assign and nodrv.reason == "L-1 needs a driver first. Use Assign driver."
    assert move("L-1", "delivered", True, False, "completed").reason == "The POD isn’t in yet for L-1."
    assert move("L-1", "assigned", True, False, "in_transit").action == "dispatch"
    assert move("L-1", "assigned", True, False, "unassigned").action == "unassign"
    assert move("L-1", "at_delivery", True, False, "delivered").action == "depart"
    assert not move("L-1", "dispatched", True, False, "delivered").ok
    assert move("L-1", "pod_review", True, True, "completed").action == "approve_pod"
    assert not move("L-1", "cancelled", False, False, "assigned").ok


def test_risk_reasons():
    assert rules.risk_reason("LATE_DELIVERY", 100, "Traffic stopped on I-35 at Ardmore") == \
        ("Running late", "ETA +1h 40m, traffic stopped on I-35 at Ardmore")
    assert rules.risk_reason("UNASSIGNED_SOON", pickup_in_minutes=150) == ("No driver", "Pickup in 2h 30m, no driver assigned")
    assert rules.risk_reason("MISSING_POD")[0] == "POD missing"
