"""The dashboard's command center: each block is one source of its numbers, read by the dashboard and the reports
alike, and each role sees only what it may."""
import json
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from app.core import mail
from tests.conftest import deliver, new_load, seed


def at(hours: float) -> str:
    return (datetime.now(UTC) + timedelta(hours=hours)).isoformat()


def stops(pickup: float, delivery: float) -> list[dict]:
    return [{"type": "pickup", "name": "Shipper DC", "city": "Dallas", "state": "TX", "appt_start": at(pickup)},
            {"type": "delivery", "name": "Receiver", "city": "Austin", "state": "TX", "appt_start": at(delivery)}]


def test_day_and_operations_agree_with_the_lists_and_the_on_time_report(org):
    s = seed(org)
    done = deliver(org, new_load(org, s["customer"]["id"], stops=stops(-2, 0.5)), s)
    new_load(org, s["customer"]["id"], stops=stops(3, 30))  # no driver, picks up soon
    d = org.get("/dashboard/day").json()
    assert d["unassigned"] == 1 and d["delivered"]["done"] == 1 and d["delivered"]["of"] == 1
    assert d["on_time"]["text"] == "1 of 1 on time" and d["revenue"]["done"] == 2500.0
    assert 0 <= d["score"] <= 100 and "deliveries done" in d["summary"]
    unassigned = org.get("/loads", params={"view": "unassigned_soon", "count": "true", "limit": 1}).json()["page"]["total_count"]
    ops = org.get("/dashboard/operations").json()
    tiles = {t["key"]: t for t in ops["tiles"]}
    assert tiles["unassigned"]["count"] == unassigned == 1 and tiles["unassigned"]["params"] == {"view": "unassigned_soon"}
    report = org.get("/reports/on-time", params={"weeks": 5}).json()
    assert ops["on_time"]["pct"] == float(report["pct"]) and ops["on_time"]["target_pct"] == 95
    assert sum(map(sum, ops["heatmap"])) == 2 and len(ops["heatmap"]) == 7 and len(ops["heatmap"][0]) == 12
    assert any(a["load_number"] == done["load_number"] and "delivered" in a["text"] for a in ops["activity"])
    assert {x["facility"] for x in ops["dwell"]} >= {"Shipper DC, Dallas", "Receiver, Austin"}


def test_financial_revenue_matches_the_revenue_report_and_lanes_add_up(org):
    s = seed(org)
    deliver(org, new_load(org, s["customer"]["id"], stops=stops(-3, 2)), s)
    f = org.get("/dashboard/financial", params={"weeks": 4}).json()
    tiles = {t["key"]: t for t in f["tiles"]}
    month = org.get("/reports/revenue", params={"group_by": "month"}).json()
    assert Decimal(tiles["revenue_mtd"]["value"]) == Decimal(month["totals"]["revenue"]) == Decimal("2500.00")
    assert len(f["weeks"]) == 4 and Decimal(f["totals"]["revenue"]) == Decimal("2500.00")
    assert tiles["revenue_mtd"]["unit"] == "money" and len(tiles["revenue_mtd"]["series"]) == 7
    [lane] = f["lanes"]
    assert lane["key"] == "Dallas, TX → Austin, TX" and lane["loads"] == 1 and lane["customers"][0]["name"] == "Globex"
    assert Decimal(lane["revenue"]) == Decimal("2500.00") and sum(Decimal(w) for w in lane["weeks"]) == Decimal("2500.00")
    assert [b["key"] for b in f["aging"]] == ["current", "days_1_30", "days_31_60", "days_61_90", "days_over_90"]
    assert len(f["cash"]) == 4 and f["goal"]["so_far"] == "2500.00"
    assert org.get("/dashboard/financial", params={"weeks": 26}).json()["weeks"].__len__() == 26
    dispatcher = org.add_user("dispatcher")
    dispatcher.error("GET", "/dashboard/financial", 403, "FORBIDDEN")


def test_fleet_ranks_drivers_and_counts_truck_status(org):
    s = seed(org)
    deliver(org, new_load(org, s["customer"]["id"], stops=stops(-3, 2)), s)
    f = org.get("/dashboard/fleet").json()
    [driver] = f["drivers"]
    assert driver["name"] == "Dana Driver" and driver["loads"] == 1 and driver["miles"] == 920
    assert driver["on_time_pct"] == 100 and driver["score"] == 100 and len(driver["weeks"]) == 8
    assert driver["recent"][0]["lane"] == "Dallas, TX → Austin, TX"
    assert sum(x["count"] for x in f["status"]) == 1 and {x["key"] for x in f["status"]} == {"driving", "at_dock", "available", "in_shop"}
    assert [x["key"] for x in f["stats"]] == ["mpg", "idle", "safety", "maintenance"]
    assert f["stats"][0]["value"] is None and "gallons" in f["stats"][0]["sub"]  # no fuel bought yet
    assert len(f["safety"]) == 8 and f["pm_interval_mi"] == 25000


def test_calendar_comes_from_one_place_per_date_and_by_role(org):
    s = seed(org)
    load = new_load(org, s["customer"]["id"], stops=stops(30, 54))
    today = date.today()
    cal = org.get("/dashboard/calendar", params={"date_from": (today - timedelta(days=3)).isoformat(),
                                                 "date_to": (today + timedelta(days=10)).isoformat()}).json()
    mine = [e for e in cal["events"] if e["reference"] == load["load_number"]]
    assert [e["category"] for e in mine] == ["pickup", "delivery"]
    assert mine[0]["target"] == {"screen": "load", "id": load["id"], "kind": None} and not mine[0]["past"]
    assert set(cal["categories"]) == {"pickup", "delivery", "maintenance", "expiration", "billing"}
    accountant = org.add_user("accountant")
    seen = accountant.get("/dashboard/calendar", params={"date_from": today.isoformat(),
                                                         "date_to": (today + timedelta(days=5)).isoformat()}).json()
    assert "maintenance" not in seen["categories"] and "billing" in seen["categories"]
    org.error("GET", "/dashboard/calendar", 422, "VALIDATION_ERROR",
              params={"date_from": today.isoformat(), "date_to": (today + timedelta(days=200)).isoformat()})


def test_share_saves_the_schedule_and_sends_each_role_only_its_tabs(org):
    s = seed(org)
    deliver(org, new_load(org, s["customer"]["id"], stops=stops(-3, 2)), s)
    dispatcher = org.add_user("dispatcher")
    out = org.post("/dashboard/share", {"frequency": "daily", "send_at": "07:00", "recipients": "ops",
                                        "tabs": ["overview", "financial"], "now": True}, 200).json()
    assert out["saved"] and set(out["sent_to"]) == {"Olive Owner", "Dispatcher"}
    found = [json.loads(p.read_text()) for p in mail.outbox().glob("*.json")]
    theirs = max((m for m in found if m["to"] == dispatcher.email), key=lambda m: m["at"])
    mine = max((m for m in found if m["to"] == org.email), key=lambda m: m["at"])
    assert "Financial:" in mine["body"] and "Financial:" not in theirs["body"] and "Overview:" in theirs["body"]
    assert org.get("/preferences").json()["dashboard.share"]["recipients"] == "ops"
    dispatcher.error("POST", "/dashboard/share", 403, "FORBIDDEN",
                     json={"frequency": "daily", "send_at": "07:00", "recipients": "everyone", "tabs": ["overview"]})
