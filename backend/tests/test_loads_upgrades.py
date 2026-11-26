"""The Loads upgrades: stops with handling, money with fuel and detention, the checklist and invoice, the board's
rules, duplicate and undo, the public tracking link, check calls, reefer and repeats, and above all that rates,
charges and margin never reach a role without finance access."""
from datetime import UTC, datetime, timedelta

from tests.conftest import act, assign, complete, deliver, new_load, seed, stops, upload


def soon(hours: float) -> str:
    return (datetime.now(UTC) + timedelta(hours=hours)).isoformat()


def test_fuel_surcharge_is_a_line_that_follows_the_rate(org):
    s = seed(org)
    load = new_load(org, s["customer"]["id"], fuel_surcharge_pct="12")
    assert load["charges_total"] == "300.00" and load["revenue"] == "2800.00"
    fuel = [c for c in load["charges"] if c["managed"]]
    assert len(fuel) == 1 and fuel[0]["amount"] == "300.00"
    load = org.patch(f"/loads/{load['id']}", {"version": load["version"], "customer_rate": "3000.00"}, 200).json()
    assert load["charges_total"] == "360.00"
    load = org.patch(f"/loads/{load['id']}", {"version": load["version"], "fuel_surcharge_pct": "0"}, 200).json()
    assert load["charges_total"] == "0.00" and not [c for c in load["charges"] if c["managed"]]
    # The managed line can't be edited by hand.
    load = org.patch(f"/loads/{load['id']}", {"version": load["version"], "fuel_surcharge_pct": "10"}, 200).json()
    line = [c for c in load["charges"] if c["managed"]][0]
    org.error("PATCH", f"/loads/{load['id']}/charges/{line['id']}", 409, "STATE_CONFLICT", json={"rate": "1.00"})


def test_money_margin_and_pending_charges(org):
    s = seed(org)
    load = new_load(org, s["customer"]["id"], customer_rate="2000.00", miles=500, fuel_surcharge_pct="12")
    m = load["money"]
    assert m["total"] == "2240.00" and m["driver_pay"] == "310.00" and m["overhead"] == "825.00"
    assert m["fuel_cost"] == "288.24" and m["margin"] == "816.76" and m["margin_pct"] == 36 and not m["warning"]
    assert load["margin"] == "816.76"
    org.post(f"/loads/{load['id']}/charges", {"type": "lumper", "rate": "100.00", "status": "pending"}, 201)
    load = org.get(f"/loads/{load['id']}").json()
    assert load["money"]["pending_charges"] == 1 and load["money"]["total"] == "2340.00"
    load = org.post(f"/loads/{load['id']}/charges/review", {"verdict": "rejected"}, 200).json()
    assert load["money"]["pending_charges"] == 0 and load["money"]["total"] == "2240.00"
    assert load["charges_total"] == "240.00"
    assert any("rejected the lumper charge" in a["text"] for a in load["activity"])
    # The company's cost rates drive the estimate.
    org.put("/load-costs", {"driver_pay_per_mile": "1.00", "mpg": "6.8", "fuel_price": "3.92",
                            "overhead_per_mile": "1.65"}, 200)
    assert org.get(f"/loads/{load['id']}").json()["money"]["driver_pay"] == "500.00"


def test_rates_pay_and_margin_never_reach_a_role_without_finance(org, client):
    s = seed(org)
    load = new_load(org, s["customer"]["id"], fuel_surcharge_pct="12")
    org.post(f"/loads/{load['id']}/charges", {"type": "lumper", "rate": "100.00", "status": "pending"}, 201)
    dispatcher = org.add_user("dispatcher")
    seen = dispatcher.get(f"/loads/{load['id']}").json()
    for key in ("revenue", "customer_rate", "charges_total", "margin", "margin_pct", "money", "fuel_surcharge_pct",
                "detention_rate"):
        assert seen[key] is None, key
    assert seen["charges"] == [] and seen["checklist"] == []
    assert not any("charge" in a["text"] for a in seen["activity"])
    row = dispatcher.items("/loads")[0]
    assert row["revenue"] is None and row["margin"] is None
    csv = dispatcher.get("/loads/export.csv").text
    assert "Revenue" not in csv and "Margin" not in csv and "2800" not in csv
    assert "Revenue" in org.get("/loads/export.csv").text
    dispatcher.error("GET", "/load-costs", 403, "FORBIDDEN")
    dispatcher.error("GET", "/loads", 422, "VALIDATION_ERROR", params={"sort": "-margin"})
    dispatcher.error("PATCH", f"/loads/{load['id']}", 403, "FORBIDDEN",
                     json={"version": seen["version"], "fuel_surcharge_pct": "15"})
    dispatcher.error("POST", "/loads", 403, "FORBIDDEN",
                     json={"customer_id": s["customer"]["id"], "detention_rate": "100", "stops": stops()})


def test_list_search_filters_facets_and_risk_reasons(org):
    s = seed(org)
    other = org.post("/customers", {"name": "Initech"}, 201).json()
    a = new_load(org, s["customer"]["id"], pickup_number="PU-7781", equipment_type="reefer")
    b = new_load(org, other["id"], delivery_number="DL-55")
    assign(org, b, s)
    assert [x["id"] for x in org.items("/loads", q="pu-7781")] == [a["id"]]
    assert [x["id"] for x in org.items("/loads", q="dana driver")] == [b["id"]]
    assert {x["id"] for x in org.items("/loads", customer_ids=[s["customer"]["id"], other["id"]])} == {a["id"], b["id"]}
    assert [x["id"] for x in org.items("/loads", equipment_types=["reefer"])] == [a["id"]]
    assert [x["id"] for x in org.items("/loads", driver_ids=[s["driver"]["id"]])] == [b["id"]]
    f = org.get("/loads/facets", params={"customer_ids": [other["id"]]}).json()
    # A facet counts its own values as if it weren't chosen; the others narrow it.
    assert {v["label"]: v["count"] for v in f["customer"]} == {"Globex": 1, "Initech": 1}
    assert {v["value"]: v["count"] for v in f["status"]} == {"assigned": 1}
    late = new_load(org, s["customer"]["id"], stops=stops(soon(3), soon(20)))
    row = next(x for x in org.items("/loads", risks=["unassigned"]) if x["id"] == late["id"])
    risk = row["risks"][0]
    assert risk["label"] == "No driver" and risk["reason"].startswith("Pickup in 2h")
    assert risk["reason"].endswith("no driver assigned")


def test_paging_by_cursor_with_counts(org):
    s = seed(org)
    for _ in range(12):
        new_load(org, s["customer"]["id"])
    page = org.get("/loads", params={"limit": 10, "count": True}).json()
    assert len(page["items"]) == 10 and page["page"]["total_count"] == 12 and page["page"]["has_more"]
    rest = org.get("/loads", params={"limit": 10, "cursor": page["page"]["next_cursor"]}).json()
    assert len(rest["items"]) == 2


def test_board_moves_follow_the_rules(org):
    s = seed(org)
    load = new_load(org, s["customer"]["id"])
    url = f"/loads/{load['id']}/board-move"
    err = org.error("POST", url, 409, "BOARD_MOVE_REFUSED", json={"version": load["version"], "column": "assigned"})
    assert "needs a driver first" in err["message"] and err["details"]["needs_assign"] is True
    load = assign(org, load, s)
    load = org.post(url, {"version": load["version"], "column": "in_transit"}, 200).json()
    assert load["status"] == "dispatched"
    err = org.error("POST", url, 409, "BOARD_MOVE_REFUSED", json={"version": load["version"], "column": "assigned"})
    assert err["message"] == "A load can’t go back once it is moving."
    err = org.error("POST", url, 409, "BOARD_MOVE_REFUSED", json={"version": load["version"], "column": "completed"})
    assert "POD" in err["message"]
    err = org.error("POST", url, 409, "BOARD_MOVE_REFUSED", json={"version": load["version"], "column": "delivered"})
    assert "Record the arrival" in err["message"]


def test_duplicate_undo_cancel_and_activity(org):
    s = seed(org)
    load = new_load(org, s["customer"]["id"], reference="PO-9")
    copy = org.post(f"/loads/{load['id']}/duplicate", None, 201).json()
    assert copy["status"] == "draft" and copy["load_number"] != load["load_number"] and copy["assignment"] is None
    assert [x["city"] for x in copy["stops"]] == [x["city"] for x in load["stops"]]
    assert copy["stops"][0]["appt_start"] is None
    assert f"copied from {load['load_number']}" in copy["activity"][-1]["text"]
    load = assign(org, org.get(f"/loads/{load['id']}").json(), s)
    load = act(org, load, "cancel", reason="Customer called off")
    assert load["status"] == "cancelled"
    load = org.post(f"/loads/{load['id']}/undo-cancel", {"version": load["version"]}, 200).json()
    assert load["status"] == "assigned" and load["assignment"]["driver"]["name"] == "Dana Driver"
    texts = [a["text"] for a in load["activity"]]
    assert any("to cancelled" in t for t in texts) and any("from cancelled to assigned" in t for t in texts)


def test_stops_handling_fuel_stop_and_extra_miles(org):
    s = seed(org)
    load = new_load(org, s["customer"]["id"], miles=400)
    route = [{**x, "handling": "live"} for x in stops()]
    route.insert(1, {"type": "fuel_scale", "city": "Effingham", "state": "IL", "handling": "live"})
    route[-1]["handling"] = "drop"
    load = org.put(f"/loads/{load['id']}/stops", {"version": load["version"], "stops": route}, 200).json()
    assert [x["type"] for x in load["stops"]] == ["pickup", "fuel_scale", "delivery"]
    assert load["stops"][-1]["handling"] == "drop" and load["miles"] == 435
    bad = [route[1], route[0], route[2]]
    org.error("PUT", f"/loads/{load['id']}/stops", 422, "VALIDATION_ERROR", json={"version": load["version"],
                                                                                 "stops": bad})


def test_ready_to_invoice_checklist_and_create_invoice(org):
    s = seed(org)
    load = deliver(org, new_load(org, s["customer"]["id"]), s)
    items = {i["key"]: i for i in load["checklist"]}
    assert items["delivered"]["done"] and not items["pod"]["done"] and items["pod"]["action"] == "Request"
    assert not load["ready_to_invoice"]
    org.error("POST", f"/loads/{load['id']}/invoice", 409, "NOT_READY")
    for kind in ("rate_confirmation", "bol"):
        upload(org, "load", load["id"], kind)
    load = complete(org, s)
    for kind in ("rate_confirmation", "bol"):
        upload(org, "load", load["id"], kind)
    load = org.get(f"/loads/{load['id']}").json()
    assert load["ready_to_invoice"], [i for i in load["checklist"] if not i["done"]]
    made = org.post(f"/loads/{load['id']}/invoice", None, 201).json()
    load = org.get(f"/loads/{load['id']}").json()
    assert load["invoice"]["id"] == made["invoice_id"] and load["checklist"] == []


def test_public_tracking_link(org, client):
    s = seed(org)
    load = assign(org, new_load(org, s["customer"]["id"]), s)
    load = org.put(f"/loads/{load['id']}/tracking-link", {"show_driver": True}, 200).json()
    link = load["tracking_link"]
    assert link["enabled"] and link["url_path"].startswith("/track/")
    token = link["url_path"].split("/")[-1]
    page = client.get(f"/api/v1/public/tracking/{token}")
    assert page.status_code == 200, page.text
    body = page.json()
    assert body["load_number"] == load["load_number"] and body["driver_name"] == "Dana D."
    assert "customer_rate" not in body and "revenue" not in body
    org.post(f"/customers/{s['customer']['id']}/contacts", {"name": "Ops", "email": "ops@example.com"})
    load = org.post(f"/loads/{load['id']}/tracking-link/send", {"message": "Here is your load"}, 200).json()
    assert load["tracking_link"]["sent_to"] == "ops@example.com"
    org.put(f"/loads/{load['id']}/tracking-link", {"enabled": False}, 200)
    assert client.get(f"/api/v1/public/tracking/{token}").status_code == 404
    assert client.get("/api/v1/public/tracking/not-a-real-token").status_code == 404
    # On again, then delivered: it stops working seven days after delivery.
    org.put(f"/loads/{load['id']}/tracking-link", {"enabled": True}, 200)
    load = org.get(f"/loads/{load['id']}").json()
    for action in ("dispatch", "arrive", "depart", "arrive", "depart"):
        load = act(org, load, action)
    expires = datetime.fromisoformat(load["tracking_link"]["expires_at"])
    assert timedelta(days=6, hours=23) < expires - datetime.now(UTC) <= timedelta(days=7, minutes=1)
    assert client.get(f"/api/v1/public/tracking/{token}").json()["eta"] is None


def test_check_calls_reminder_and_overdue_job(org):
    import uuid

    from app.core.db import new_session
    from app.core.deps import Principal
    from app.modules.loads import workflow
    s = seed(org)
    load = act(org, assign(org, new_load(org, s["customer"]["id"]), s), "dispatch")
    load = org.patch(f"/loads/{load['id']}", {"version": load["version"], "checkcall_reminder_hours": 2}, 200).json()
    load = org.post(f"/loads/{load['id']}/tracking", {"city": "Joliet", "state": "IL", "via": "phone",
                                                      "eta": soon(5)}, 201).json()
    assert load["check_calls"]["reminder_hours"] == 2 and not load["check_calls"]["overdue"]
    assert load["tracking"][0]["via"] == "phone"
    assert any("check call at Joliet, IL by phone" in a["text"] for a in load["activity"])
    with new_session(org_id=uuid.UUID(org.org_id)) as db:
        p = Principal(user_id=uuid.UUID(int=0), org_id=uuid.UUID(org.org_id), role="owner", full_name="FlyFleet", email="")
        assert workflow.flag_quiet_loads(db, p, datetime.now(UTC) + timedelta(hours=3)) == 1
        assert workflow.flag_quiet_loads(db, p, datetime.now(UTC) + timedelta(hours=3)) == 0  # once
        db.commit()
    load = org.get(f"/loads/{load['id']}").json()
    assert any("No check call in" in a["text"] for a in load["activity"])


def test_reefer_readings_card_and_alert(org):
    import uuid

    from app.core.db import new_session
    from app.core.deps import Principal
    from app.modules.loads import workflow
    s = seed(org)
    load = new_load(org, s["customer"]["id"], equipment_type="reefer", reefer_set_point_f="34")
    load = act(org, assign(org, load, s), "dispatch")
    now = datetime.now(UTC)
    samples = [{"trailer_id": s["trailer"]["id"], "recorded_at": (now - timedelta(minutes=m)).isoformat(),
                "temp_f": t} for m, t in ((40, 34.2), (25, 37.1), (10, 37.5), (0, 37.9))]
    assert org.post("/reefer/readings", {"samples": samples}, 202).json() == {"accepted": 4}
    load = org.get(f"/loads/{load['id']}").json()
    reefer = load["reefer"]
    assert reefer["state"] == "out_of_range" and reefer["low_f"] == 32 and reefer["high_f"] == 36
    assert len(reefer["readings"]) == 4
    with new_session(org_id=uuid.UUID(org.org_id)) as db:
        p = Principal(user_id=uuid.UUID(int=0), org_id=uuid.UUID(org.org_id), role="owner", full_name="FlyFleet", email="")
        assert workflow.alert_reefers(db, p, now) == 1
        assert workflow.alert_reefers(db, p, now) == 0
        db.commit()


def test_repeat_makes_drafts_ahead_without_driver_or_rate(org):
    import uuid

    from app.core.db import new_session
    from app.core.deps import Principal
    from app.modules.loads import workflow
    s = seed(org)
    start = datetime.now(UTC).replace(hour=15, minute=0, second=0, microsecond=0) + timedelta(days=1)
    load = new_load(org, s["customer"]["id"], stops=stops(start.isoformat(), (start + timedelta(hours=8)).isoformat()),
                    recurrence={"days": [start.weekday()]})
    assert len(load["recurrence"]["next_dates"]) == 3
    with new_session(org_id=uuid.UUID(org.org_id)) as db:
        p = Principal(user_id=uuid.UUID(int=0), org_id=uuid.UUID(org.org_id), role="owner", full_name="FlyFleet", email="")
        made = workflow.make_repeats(db, p, datetime.now(UTC))
        assert made == 1  # a week after the first pickup; two weeks after is beyond the 14 days ahead
        assert workflow.make_repeats(db, p, datetime.now(UTC)) == 0
        db.commit()
    drafts = [x for x in org.items("/loads", status=["draft"])]
    assert len(drafts) == 1 and all(x["revenue"] == "0.00" and x["assignment"] is None for x in drafts)
