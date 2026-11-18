"""The safety queue, the dashboard, global search and reports."""
import csv
import io
from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from tests.conftest import complete, deliver, new_load, qualify, seed, stops, upload


def day(offset: int) -> str:
    return str((datetime.now(UTC) + timedelta(days=offset)).date())


def iso(days: float = 0, hours: float = 0) -> str:
    return (datetime.now(UTC) + timedelta(days=days, hours=hours)).isoformat()


def test_the_expirations_queue_lists_every_dated_item_in_order(org):
    yard = org.post("/terminals", {"name": "North yard"}, 201).json()
    driver = qualify(org, org.post("/drivers", {"first_name": "Ed", "last_name": "Expired", "cdl_expiry": day(-10),
                                                "medical_cert_expiry": day(5), "terminal_id": yard["id"]}, 201).json()["id"])
    org.post(f"/drivers/{driver['id']}/qualifications", {"type": "hazmat", "expires_on": day(20), "required": True}, 201)
    org.post(f"/drivers/{driver['id']}/qualifications", {"type": "training"}, 201)          # undated: not in the queue
    org.post("/drivers", {"first_name": "Gone", "last_name": "Away", "status": "terminated", "cdl_expiry": day(-99)}, 201)
    truck = org.post("/vehicles", {"unit_number": "101", "insurance_expiry": day(-2), "registration_expiry": day(300),
                                   "inspection_expiry": day(45)}, 201).json()
    org.post("/trailers", {"unit_number": "5301", "insurance_expiry": day(300), "registration_expiry": day(300),
                           "inspection_expiry": day(300), "status": "retired"}, 201)

    queue = org.items("/safety/expirations")
    assert [(x["entity_label"], x["item"], x["state"]) for x in queue] == [
        ("Ed Expired", "cdl", "expired"), ("Truck 101", "insurance", "expired"),
        ("Ed Expired", "medical", "expiring"), ("Ed Expired", "hazmat", "expiring")]
    assert queue[0]["days_left"] == -10 and queue[0]["item_label"] == "CDL" and queue[0]["blocks_dispatch"] is True
    assert queue[3]["item_label"] == "Hazmat endorsement" and queue[0]["entity_id"] == driver["id"]

    assert [x["item"] for x in org.items("/safety/expirations", state="expired")] == ["cdl", "insurance"]
    assert [x["item"] for x in org.items("/safety/expirations", state="expiring", within_days=10)] == ["medical"]
    assert [x["item"] for x in org.items("/safety/expirations", within_days=60)][-1] == "inspection"
    assert {x["entity_type"] for x in org.items("/safety/expirations", entity_type="vehicle")} == {"vehicle"}
    assert [x["entity_label"] for x in org.items("/safety/expirations", entity_type="equipment")] == ["Truck 101"]
    assert {x["entity_label"] for x in org.items("/safety/expirations", terminal_id=yard["id"])} == {"Ed Expired"}
    assert [x["entity_label"] for x in org.items("/safety/expirations", q="truck")] == ["Truck 101"]
    assert org.items("/safety/expirations", state="missing") == []
    assert [x["item"] for x in org.items("/safety/expirations", sort="-expires_on")] == ["hazmat", "medical", "insurance", "cdl"]

    first = org.get("/safety/expirations", params={"limit": 3, "count": "true"}).json()
    rest = org.items("/safety/expirations", limit=3, cursor=first["page"]["next_cursor"])
    assert first["page"]["total_count"] == 4 and len(first["items"]) == 3 and [x["item"] for x in rest] == ["hazmat"]

    summary = org.get("/safety/summary").json()
    # The company's own file (authority, insurance, UCR, IFTA) counts as missing until its documents are filed.
    assert {k: summary[k] for k in ("expired", "expiring", "missing", "drivers_blocked", "units_blocked")} == {
        "expired": 2, "expiring": 2, "missing": 4, "drivers_blocked": 1, "units_blocked": 1}
    assert summary["expired_first"] == "Ed Expired · CDL" and summary["expiring_drivers"] == 1
    assert summary["missing_items"] == ["operating authority", "liability insurance", "UCR registration", "IFTA license"]
    assert (summary["drivers_active"], summary["drivers_qualified"]) == (1, 0)
    assert summary["tabs"] == {"driver": 1, "vehicle": 1, "trailer": 0, "organization": 4}
    org.patch(f"/vehicles/{truck['id']}", {"insurance_expiry": day(365)}, 200)
    assert org.get("/safety/summary").json()["units_blocked"] == 0
    org.add_user("accountant").error("GET", "/safety/expirations", 403, "FORBIDDEN")


def test_missing_dates_are_listed_separately(org):
    org.post("/drivers", {"first_name": "No", "last_name": "Dates"}, 201)
    org.post("/vehicles", {"unit_number": "202"}, 201)
    assert org.items("/safety/expirations") == []
    missing = org.items("/safety/expirations", state="missing")
    # The driver's file as the company has it: the CDL, the medical card and the four standard items.
    assert {(x["entity_label"], x["item"]) for x in missing} == {
        ("No Dates", "cdl"), ("No Dates", "medical"), ("No Dates", "mvr"), ("No Dates", "clearinghouse"),
        ("No Dates", "road_test"), ("No Dates", "drug_test"), ("Truck 202", "insurance"),
        ("Truck 202", "registration"), ("Truck 202", "inspection")}
    assert all(x["days_left"] is None and x["expires_on"] is None for x in missing)
    assert {x["item"]: x["blocks_dispatch"] for x in missing if x["entity_label"] == "No Dates"}["road_test"] is True
    summary = org.get("/safety/summary").json()
    assert summary["missing"] == 9 + 4 and summary["drivers_blocked"] == 1
    assert summary["missing_items"][:2] == ["CDL", "clearinghouse query"]


def test_documents_with_their_own_expiry_show_up(org):
    s = seed(org)
    upload(org, "vehicle", s["truck"]["id"], "insurance", filename="policy.pdf", expires_on=day(12))
    upload(org, "driver", s["driver"]["id"], "medical", filename="card.pdf", expires_on=day(-3))
    upload(org, "trailer", s["trailer"]["id"], "registration", filename="reg.pdf", expires_on=day(200))
    found = org.get("/safety/expiring-documents").json()
    assert [(d["filename"], d["state"], d["entity_type"]) for d in found] == [
        ("card.pdf", "expired", "driver"), ("policy.pdf", "expiring", "vehicle")]
    fleet = org.add_user("fleet_manager")           # may not see medical documents
    assert [d["filename"] for d in fleet.get("/safety/expiring-documents").json()] == ["policy.pdf"]


def test_the_dashboard_shows_each_role_its_own_blocks(org):
    s = seed(org)
    done = complete(org, s, stops=stops(iso(days=-3), iso(days=-2)))
    new_load(org, s["customer"]["id"], stops=stops(iso(hours=-4), iso(days=1)))                 # late, unassigned
    invoice = org.post("/invoices", {"customer_id": s["customer"]["id"], "load_ids": [done["id"]]}, 201).json()
    org.post(f"/invoices/{invoice['id']}/issue", expect=200)

    full = org.get("/dashboard/summary").json()
    assert full["loads"]["unassigned"] == 1 and full["loads"]["at_risk"] == 1
    assert full["fleet"] == {"drivers_active": 1, "drivers_on_load": 0, "trucks_active": 1, "trucks_on_load": 0,
                             "trucks_unavailable": 0, "trailers_active": 1}
    assert full["receivables"]["open_balance"] == "2500.00" and full["receivables"]["open_invoices"] == 1
    assert full["revenue"]["this_month"] in ("2500.00", "0.00") and full["revenue"]["currency"] == "USD"
    assert full["safety"]["expired"] == 0 and full["timezone"] == "UTC"

    safety = org.add_user("safety_manager").get("/dashboard/summary").json()
    assert safety["receivables"] is None and safety["revenue"] is None and safety["safety"] is not None
    accountant = org.add_user("accountant").get("/dashboard/summary").json()
    assert accountant["receivables"] is not None and accountant["safety"] is None and accountant["loads"] is not None
    org.add_user("driver").error("GET", "/dashboard/summary", 403, "FORBIDDEN")


def test_exceptions_point_at_the_work_that_needs_doing(org):
    s = seed(org)
    assert org.get("/dashboard/exceptions").json() == []                    # nothing wrong, nothing shown

    new_load(org, s["customer"]["id"], stops=stops(iso(hours=-4), iso(days=1)))
    delivered = deliver(org, new_load(org, s["customer"]["id"], stops=stops(iso(days=3), iso(days=4))), s)
    org.post("/drivers", {"first_name": "Ed", "last_name": "Expired", "cdl_expiry": day(-10),
                          "medical_cert_expiry": day(300)}, 201)
    found = {e["code"]: e for e in org.get("/dashboard/exceptions").json()}
    assert set(found) == {"LOADS_AT_RISK", "LOADS_UNASSIGNED", "MISSING_POD", "DRIVERS_BLOCKED"}
    assert found["LOADS_AT_RISK"]["resource"] == "loads" and found["LOADS_AT_RISK"]["params"] == {"view": "at_risk"}
    assert found["DRIVERS_BLOCKED"]["count"] == 1 and found["MISSING_POD"]["count"] == 1
    severities = [e["severity"] for e in org.get("/dashboard/exceptions").json()]
    assert severities == sorted(severities, key=["high", "medium", "low"].index)             # most urgent first
    # The list behind an exception really contains what was counted.
    assert len(org.items("/loads", **found["LOADS_AT_RISK"]["params"])) == found["LOADS_AT_RISK"]["count"]

    upload(org, "load", delivered["id"])
    codes = {e["code"] for e in org.get("/dashboard/exceptions").json()}
    assert "POD_REVIEW" in codes and "MISSING_POD" not in codes
    # Each role sees only what it can act on or see.
    assert {e["code"] for e in org.add_user("safety_manager").get("/dashboard/exceptions").json()} >= {"DRIVERS_BLOCKED"}
    assert "DRIVERS_BLOCKED" not in {e["code"] for e in org.add_user("accountant").get("/dashboard/exceptions").json()}


def test_search_finds_records_of_every_kind_the_role_may_see(org):
    s = seed(org)
    load = new_load(org, s["customer"]["id"], reference="PO-GLOBEX-77")
    org.post("/vehicles", {"unit_number": "GLOBEX-TRUCK"}, 201)
    found = org.get("/search", params={"q": "globex"}).json()
    assert {(x["type"], x["title"]) for x in found} == {("load", load["load_number"]), ("customer", "Globex"),
                                                        ("vehicle", "Truck GLOBEX-TRUCK")}
    assert [x["title"] for x in org.get("/search", params={"q": "dana dri"}).json()] == ["Dana Driver"]
    assert org.get("/search", params={"q": load["load_number"]}).json()[0]["subtitle"] == "Chicago to Dallas"
    assert org.get("/search", params={"q": "100%"}).json() == []
    org.error("GET", "/search", 422, "VALIDATION_ERROR", params={"q": "x"})
    # A fleet manager can't see customers, so search doesn't show them.
    limited = org.add_user("fleet_manager").get("/search", params={"q": "globex"}).json()
    assert {x["type"] for x in limited} == {"load", "vehicle"}
    assert org.add_user("driver").get("/search", params={"q": "globex"}).json() == []


def test_revenue_and_performance_reports(org):
    s = seed(org)
    other = org.post("/customers", {"name": "Initech"}, 201).json()
    complete(org, s, customer_rate="3000.00", miles=1000, stops=stops(iso(days=5), iso(days=6)))
    complete(org, s, customer_rate="1000.00", miles=250, stops=stops(iso(days=7), iso(days=8)),
             charges=[{"type": "detention", "rate": "100.00"}])
    load = new_load(org, other["id"], customer_rate="500.00", miles=100, stops=stops(iso(days=9), iso(days=10)))
    deliver(org, load, s)
    new_load(org, other["id"], customer_rate="9999.00")                         # not delivered: not revenue yet

    report = org.get("/reports/revenue").json()
    assert report["name"] == "revenue-by-customer" and report["date_to"] == day(0) and report["currency"] == "USD"
    assert [(r["label"], r["loads"], r["miles"], r["revenue"], r["revenue_per_mile"]) for r in report["rows"]] == [
        ("Globex", 2, 1250, "4100.00", "3.28"), ("Initech", 1, 100, "500.00", "5.00")]
    assert report["totals"] == {"label": "Total", "loads": 3, "miles": 1350, "revenue": "4600.00", "revenue_per_mile": "3.41"}
    assert [c["key"] for c in report["columns"]] == ["label", "loads", "miles", "revenue", "revenue_per_mile"]
    by_month = org.get("/reports/revenue", params={"group_by": "month"}).json()
    assert [r["label"] for r in by_month["rows"]] == [datetime.now(UTC).strftime("%Y-%m")]
    assert org.get("/reports/revenue", params={"group_by": "terminal"}).json()["rows"][0]["label"] == "No terminal"
    assert org.get("/reports/revenue", params={"date_from": day(-60), "date_to": day(-30)}).json()["rows"] == []
    org.error("GET", "/reports/revenue", 422, "VALIDATION_ERROR", params={"date_from": day(0), "date_to": day(-5)})
    org.error("GET", "/reports/revenue", 422, "VALIDATION_ERROR", params={"date_from": day(-800), "date_to": day(0)})

    drivers = org.get("/reports/drivers").json()
    assert [(r["label"], r["loads"], r["miles"], r["on_time"], r["revenue"]) for r in drivers["rows"]] == [
        ("Dana Driver", 3, 1350, 100, "4600.00")]
    trucks = org.get("/reports/trucks").json()
    assert trucks["rows"][0]["label"] == s["truck"]["unit_number"] and trucks["rows"][0]["loads"] == 3
    # Roles without rates get the operational columns only.
    safety = org.add_user("safety_manager")
    assert "revenue" not in safety.get("/reports/drivers").json()["rows"][0]
    safety.error("GET", "/reports/revenue", 403, "FORBIDDEN")
    safety.error("GET", "/reports/ar-aging", 403, "FORBIDDEN")


def test_a_late_delivery_counts_against_on_time(org):
    s = seed(org)
    load = new_load(org, s["customer"]["id"], stops=stops(iso(days=-3), iso(days=-2)))     # was due two days ago
    deliver(org, load, s)                                                                   # arrives now
    assert org.get("/reports/drivers").json()["rows"][0]["on_time"] == 0


def test_csv_export_needs_permission_is_audited_and_is_safe_to_open(org):
    s = seed(org)
    org.patch(f"/customers/{s['customer']['id']}", {"name": "=HYPERLINK(\"http://evil.example\")"}, 200)
    complete(org, s, stops=stops(iso(days=5), iso(days=6)))

    r = org.get("/reports/revenue", params={"format": "csv"})
    assert r.headers["content-type"].startswith("text/csv") and "attachment" in r.headers["content-disposition"]
    assert f"flyfleet-revenue-by-customer-{day(0)[:8]}" in r.headers["content-disposition"]
    rows = list(csv.reader(io.StringIO(r.text.lstrip("﻿"))))
    assert rows[0] == ["Customer", "Loads", "Miles", "Revenue", "Revenue per mile"]
    assert rows[1][0].startswith("'=HYPERLINK") and rows[1][3] == "2500.00"       # a formula is defused, numbers are not
    assert rows[-1][0] == "Total"
    assert org.items("/audit-logs", action="report.exported")[0]["data"]["report"] == "revenue-by-customer"

    dispatcher = org.add_user("dispatcher")                 # may read reports, may not take the data away
    assert dispatcher.get("/reports/drivers").json()["rows"]
    dispatcher.error("GET", "/reports/drivers", 403, "FORBIDDEN", params={"format": "csv"})
    org.add_user("driver").error("GET", "/reports/drivers", 403, "FORBIDDEN")


def test_on_time_delivery_by_week_by_customer_and_the_weakest_lane(org):
    s = seed(org)
    initech = org.post("/customers", {"name": "Initech"}, 201).json()
    for appointment in (iso(days=5), iso(days=6), iso(days=-2)):          # two on time, one two days late
        deliver(org, new_load(org, s["customer"]["id"], stops=stops(iso(days=-3), appointment)), s)
    for appointment in (iso(days=-1), iso(days=-2)):                       # both late
        deliver(org, new_load(org, initech["id"], stops=stops(iso(days=-3), appointment)), s)
    new_load(org, initech["id"], stops=stops(iso(days=-3), iso(days=-2)))   # never delivered: not judged

    report = org.get("/reports/on-time").json()
    assert (report["weeks"], report["target_pct"], report["date_to"]) == (8, 95, day(0))
    assert (report["deliveries"], report["on_time"], report["late"], report["pct"]) == (5, 2, 3, "40.0")
    # Late by the appointment less the 15 minutes' grace: two days, one day and two days.
    assert abs(report["avg_late_minutes"] - (2865 + 1425 + 2865) / 3) <= 2
    assert abs(report["median_late_minutes"] - 2865) <= 2
    assert len(report["by_week"]) == 8 and report["by_week"][-1]["deliveries"] == 5
    assert all(w["deliveries"] == 0 and w["pct"] is None for w in report["by_week"][:-1])
    assert (report["previous_pct"], report["previous_deliveries"]) == (None, 0)
    worst, best = report["by_customer"]
    assert (worst["name"], worst["on_time"], worst["pct"]) == ("Initech", 0, "0.0")       # worst first
    assert (best["name"], best["deliveries"], best["on_time"], best["late"], best["pct"]) == ("Globex", 3, 2, 1, "66.7")
    lane = report["weakest_lane"]
    assert (lane["origin"], lane["destination"], lane["deliveries"], lane["pct"]) == ("Chicago, IL", "Dallas, TX", 5, "40.0")

    one = org.get("/reports/on-time", params={"customer_id": initech["id"], "weeks": 4}).json()
    assert len(one["by_week"]) == 4 and one["pct"] == "0.0" and [c["name"] for c in one["by_customer"]] == ["Initech"]
    assert one["weakest_lane"] is None                  # two deliveries are too few to call a lane weak

    rows = list(csv.reader(io.StringIO(org.get("/reports/on-time", params={"format": "csv"}).text.lstrip("﻿"))))
    assert rows[0] == ["Customer", "Deliveries", "On time", "Late", "On-time %", "Average lateness (min)"]
    assert rows[1][0] == "Initech" and rows[-1][0] == "Total"


def test_the_rest_of_the_catalog(org, owner_sql):
    s = seed(org)
    window = {"date_from": day(-10), "date_to": day(10)}
    planned = new_load(org, s["customer"]["id"], stops=stops(iso(days=1), iso(days=2)))
    waiting = deliver(org, new_load(org, s["customer"]["id"], customer_rate="900.00", stops=stops(iso(days=-2), iso(days=-1))), s)
    reviewing = deliver(org, new_load(org, s["customer"]["id"], customer_rate="700.00", stops=stops(iso(days=-2), iso(days=-1))), s)
    upload(org, "load", reviewing["id"])

    statuses = org.get("/reports/loads-by-status", params=window).json()
    assert [(r["label"], r["loads"]) for r in statuses["rows"]] == [("Planned", 1), ("Delivered", 1), ("POD in review", 1)]
    assert statuses["totals"]["loads"] == 3 and statuses["totals"]["revenue"] == "4100.00"
    assert planned["status"] == "planned"

    pods = org.get("/reports/awaiting-pod").json()
    assert [(r["label"], r["pod"], r["waiting"], r["revenue"]) for r in pods["rows"]] == [
        (waiting["load_number"], "Not received", 0, "900.00"), (reviewing["load_number"], "In review", 0, "700.00")]
    assert pods["rows"][0]["driver"] == "Dana Driver" and pods["columns"][3]["kind"] == "date"

    # A day on the road, inside the period: arrived at the pickup two days ago, delivered yesterday.
    with owner_sql.begin() as c:
        c.execute(text("SELECT set_config('app.org_id', :o, true)"), {"o": org.org_id})
        c.execute(text("UPDATE load_stops SET arrived_at = now() - interval '2 days' WHERE load_id = :l AND seq = "
                       "(SELECT min(seq) FROM load_stops WHERE load_id = :l)"), {"l": waiting["id"]})
        c.execute(text("UPDATE loads SET delivered_at = now() - interval '1 day' WHERE id = :l"), {"l": waiting["id"]})
    used = org.get("/reports/utilization", params={"date_from": day(-10), "date_to": day(0)}).json()
    truck = next(r for r in used["rows"] if r["label"] == s["truck"]["unit_number"])
    assert truck["days"] == "1.0" and 8 <= float(truck["utilization"]) <= 10 and truck["loads"] == 2

    soon = org.post("/drivers", {"first_name": "Ana", "last_name": "Ruiz", "cdl_expiry": day(10), "medical_cert_expiry": day(400)}, 201).json()
    qualify(org, soon["id"])
    org.post("/vehicles", {"unit_number": "T-OLD", "registration_expiry": day(-3), "insurance_expiry": day(400), "inspection_expiry": day(400)}, 201)
    expiring = org.get("/reports/expiring").json()
    assert [(r["label"], r["kind"], r["item"], r["left"], r["state"]) for r in expiring["rows"]] == [
        ("Truck T-OLD", "Truck", "Registration", -3, "Expired"), ("Ana Ruiz", "Driver", "CDL", 10, "Expiring")]

    for category, amount in (("fuel", "300.00"), ("tolls", "20.00")):
        body = {"category": category, "incurred_on": day(0), "amount": amount}
        if category == "fuel":
            body |= {"gallons": "80", "jurisdiction": "TX", "vehicle_id": s["truck"]["id"]}
        org.post("/expenses", body, 201)
    spent = org.get("/reports/expenses").json()
    assert [(r["label"], r["count"], r["amount"], r["share"]) for r in spent["rows"]] == [
        ("Fuel", 1, "300.00", "93.8"), ("Tolls", 1, "20.00", "6.3")]
    assert spent["totals"]["amount"] == "320.00"

    org.patch(f"/drivers/{s['driver']['id']}", {"pay_type": "per_mile", "pay_rate": "0.50"}, 200)
    org.post("/settlements", {"driver_id": s["driver"]["id"], "period_start": day(-6), "period_end": day(0)}, 201)
    pay = org.get("/reports/driver-statements").json()
    assert [(r["label"], r["statements"]) for r in pay["rows"]] == [("Dana Driver", 1)]
    assert pay["rows"][0]["net"] == pay["totals"]["net"] and pay["rows"][0]["paid"] == "0.00"

    safety = org.add_user("safety_manager")
    assert safety.get("/reports/expiring").json()["rows"]
    safety.error("GET", "/reports/expenses", 403, "FORBIDDEN")
    safety.error("GET", "/reports/driver-statements", 403, "FORBIDDEN")
    assert "revenue" not in safety.get("/reports/awaiting-pod").json()["rows"][0]
