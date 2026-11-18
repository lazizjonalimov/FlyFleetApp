"""Compliance: the matrix, the qualification file, approvals that renew a record, reminders, the export."""
import csv
import io
from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from tests.conftest import FILE, assign, new_load, qualify, seed, upload


def day(offset: int) -> str:
    return str((datetime.now(UTC) + timedelta(days=offset)).date())


def matrix(api, entity: str = "driver") -> dict:
    return api.get("/safety/matrix", params={"entity": entity}).json()


def row(m: dict, name: str) -> dict:
    return next(r for r in m["rows"] if r["name"] == name)


def cells(r: dict) -> dict:
    return {c["item"]: c for c in r["cells"]}


def test_the_matrix_shows_each_item_and_what_it_means_for_dispatch(org):
    s = seed(org)
    leah = org.post("/drivers", {"first_name": "Leah", "last_name": "Morgan", "cdl_expiry": day(400),
                                 "medical_cert_expiry": day(400)}, 201).json()
    for kind, expires in FILE.items():
        if kind != "road_test":
            org.post(f"/drivers/{leah['id']}/qualifications", {"type": kind, "expires_on": expires}, 201)
    marcus = qualify(org, org.post("/drivers", {"first_name": "Marcus", "last_name": "Bell", "cdl_expiry": day(900),
                                                "medical_cert_expiry": day(6)}, 201).json()["id"])
    # Last year's MVR review ran out; this year's renews it, so only the new one counts.
    org.post(f"/drivers/{marcus['id']}/qualifications", {"type": "mvr", "expires_on": day(-30)}, 201)
    org.post("/drivers", {"first_name": "Ida", "last_name": "Idle", "status": "inactive"}, 201)

    m = matrix(org)
    assert [c["key"] for c in m["columns"]] == ["cdl", "medical", "mvr", "clearinghouse", "road_test", "drug_test"]
    assert [c["label"] for c in m["columns"]][2:] == ["MVR review", "Clearinghouse", "Road test", "Drug test"]
    assert [r["name"] for r in m["rows"]] == ["Dana Driver", "Leah Morgan", "Marcus Bell"]   # active drivers only
    dana = row(m, "Dana Driver")
    assert dana["verdict"] == "qualified" and dana["dispatchable"] is True
    assert cells(dana)["road_test"] == {**cells(dana)["road_test"], "state": "valid", "expires_on": None}
    assert cells(dana)["mvr"]["state"] == "valid" and cells(dana)["mvr"]["expires_on"] == "2035-01-01"
    leah_row = row(m, "Leah Morgan")
    assert cells(leah_row)["road_test"]["state"] == "missing" and leah_row["verdict"] == "missing"
    assert leah_row["dispatchable"] is False
    marcus_row = row(m, "Marcus Bell")
    assert cells(marcus_row)["medical"]["state"] == "expiring" and cells(marcus_row)["medical"]["days_left"] == 6
    assert cells(marcus_row)["mvr"]["state"] == "valid" and marcus_row["verdict"] == "expiring"

    # The assignment panel agrees with the matrix.
    load = new_load(org, s["customer"]["id"])
    found = {c["id"]: c for c in org.get("/dispatch/eligible-resources", params={"load_id": load["id"]}).json()["drivers"]}
    assert not found[leah["id"]]["eligible"]
    assert [r["message"] for r in found[leah["id"]]["reasons"]] == ["No road test on file"]
    assert found[marcus["id"]]["eligible"]

    summary = org.get("/safety/summary").json()
    assert summary["missing_items"][0] == "road test" and summary["drivers_blocked"] == 1
    assert (summary["drivers_active"], summary["drivers_qualified"]) == (3, 1)
    assert summary["expiring_drivers"] == 1 and summary["tabs"]["driver"] == 3

    trucks = matrix(org, "vehicle")
    assert [c["key"] for c in trucks["columns"]] == ["registration", "insurance", "inspection"]
    assert row(trucks, s["truck"]["unit_number"])["verdict"] == "qualified"


def test_a_company_decides_which_items_keep_a_driver_off_loads(org):
    s = seed(org)
    rules = org.get("/safety/reminders").json()
    assert [i["type"] for i in rules["checklist"]] == ["mvr", "clearinghouse", "road_test", "drug_test"]
    assert all(i["blocks"] for i in rules["checklist"])
    new = org.post("/drivers", {"first_name": "Nell", "last_name": "New", "cdl_expiry": day(400),
                                "medical_cert_expiry": day(400)}, 201).json()
    for kind in ("mvr", "clearinghouse", "drug_test"):
        org.post(f"/drivers/{new['id']}/qualifications", {"type": kind, "expires_on": FILE[kind]}, 201)
    assert org.get(f"/drivers/{new['id']}").json()["compliance"]["status"] == "expired"

    checklist = [{"type": i["type"], "blocks": i["type"] != "road_test"} for i in rules["checklist"]]
    body = {k: rules[k] for k in ("enabled", "lead_days", "channels", "copy_to", "run_hour", "version")}
    saved = org.put("/safety/reminders", {**body, "checklist": checklist}, 200).json()
    assert saved["version"] == rules["version"] + 1
    # Missing, the road test now warns instead of blocking.
    driver = org.get(f"/drivers/{new['id']}").json()
    assert driver["compliance"]["status"] == "expiring"
    assert driver["compliance"]["issues"] == [{"code": "QUALIFICATION_ROAD_TEST_MISSING", "message": "No road test on file",
                                               "severity": "warning", "expires_on": None}]
    assert row(matrix(org), "Nell New")["verdict"] == "incomplete"
    assert assign(org, new_load(org, s["customer"]["id"]), {**s, "driver": new})["status"] == "assigned"
    assert [d["full_name"] for d in org.items("/drivers", qualification="expiring")] == ["Nell New"]

    # A stale version is refused, and only safety managers change the rules.
    assert org.error("PUT", "/safety/reminders", 409, "VERSION_CONFLICT", json={**body, "checklist": checklist})
    org.add_user("dispatcher").error("PUT", "/safety/reminders", 403, "FORBIDDEN",
                                     json={**body, "version": saved["version"], "checklist": checklist})
    assert org.error("PUT", "/safety/reminders", 422, "VALIDATION_ERROR",
                     json={**body, "version": saved["version"], "checklist": checklist * 2})
    entry = org.items("/audit-logs", action="compliance.rules_updated")[0]
    assert entry["data"]["checklist"]["to"][2] == {"type": "road_test", "blocks": False}


def test_an_approved_replacement_renews_the_record(org):
    s = seed(org)
    safety = org.add_user("safety_manager")
    driver_id = s["driver"]["id"]
    org.patch(f"/drivers/{driver_id}", {"medical_cert_expiry": day(5)}, 200)
    doc = upload(org, "driver", driver_id, "medical", filename="medical-card.pdf", expires_on=day(700))
    assert doc["review_status"] == "pending"

    medical = cells(row(matrix(org), "Dana Driver"))["medical"]
    assert medical["state"] == "expiring" and medical["in_review"] is True and medical["review_document_id"] == doc["id"]
    assert row(matrix(org), "Dana Driver")["verdict"] == "review"
    queue = org.items("/documents", review_status="pending", group="compliance")
    assert [d["id"] for d in queue] == [doc["id"]]

    safety.post(f"/documents/{doc['id']}/review", {"decision": "approved"}, 200)
    assert org.get(f"/drivers/{driver_id}").json()["medical_cert_expiry"] == day(700)
    medical = cells(row(matrix(org), "Dana Driver"))["medical"]
    assert medical["state"] == "valid" and medical["in_review"] is False
    assert org.items("/audit-logs", action="document.approved")[0]["data"]["renewed"][0].startswith("Medical card on file to")

    # A clearinghouse query arrives as a document and becomes the file's record once approved.
    [old] = [q for q in org.get(f"/drivers/{driver_id}/qualifications").json() if q["type"] == "clearinghouse"]
    org.delete(f"/drivers/{driver_id}/qualifications/{old['id']}", expect=204)
    assert row(matrix(org), "Dana Driver")["verdict"] == "missing"
    query = upload(org, "driver", driver_id, "clearinghouse", filename="query.pdf", expires_on=day(380))
    clearinghouse = cells(row(matrix(org), "Dana Driver"))["clearinghouse"]
    assert clearinghouse["state"] == "missing" and clearinghouse["in_review"] is True
    assert row(matrix(org), "Dana Driver")["verdict"] == "missing"     # in review is not on file yet
    safety.post(f"/documents/{query['id']}/review", {"decision": "approved"}, 200)
    held = [q for q in org.get(f"/drivers/{driver_id}/qualifications").json() if q["type"] == "clearinghouse"]
    assert [q["expires_on"] for q in held] == [day(380)] and held[0]["reference"] == "query.pdf"
    assert row(matrix(org), "Dana Driver")["verdict"] == "qualified"
    # A document running shorter than what is on file renews nothing.
    again = upload(org, "driver", driver_id, "clearinghouse", filename="older.pdf", expires_on=day(100))
    safety.post(f"/documents/{again['id']}/review", {"decision": "approved"}, 200)
    assert len([q for q in org.get(f"/drivers/{driver_id}/qualifications").json() if q["type"] == "clearinghouse"]) == 1


def test_company_documents_are_filed_with_the_company(org, make_org):
    other = make_org("Elsewhere")
    org.error("POST", "/documents/upload-intents", 422, "VALIDATION_ERROR", json={
        "filename": "coi.pdf", "content_type": "application/pdf", "size_bytes": 10, "type": "insurance",
        "entity_type": "organization", "entity_id": other.org_id})
    m = matrix(org, "organization")
    assert [r["name"] for r in m["rows"]] == ["Operating authority", "Liability insurance", "UCR registration", "IFTA license"]
    assert {r["verdict"] for r in m["rows"]} == {"incomplete"} and all(r["document"] is None for r in m["rows"])
    coi = upload(org, "organization", org.org_id, "insurance", filename="coi-2027.pdf", expires_on=day(20))
    insurance = row(matrix(org, "organization"), "Liability insurance")
    assert insurance["verdict"] == "review" and insurance["document"]["filename"] == "coi-2027.pdf"
    org.post(f"/documents/{coi['id']}/review", {"decision": "approved"}, 200)
    insurance = row(matrix(org, "organization"), "Liability insurance")
    assert insurance["verdict"] == "expiring" and insurance["cells"][0]["expires_on"] == day(20)
    assert insurance["document"]["reviewed_by_name"] == "Olive Owner"
    assert "liability insurance" not in org.get("/safety/summary").json()["missing_items"]


def a_night_passes(owner_sql, org) -> None:
    """As if the last run were two days ago, so the next read catches up on a scheduled run."""
    with owner_sql.begin() as c:
        c.execute(text("SELECT set_config('app.org_id', :o, true)"), {"o": org.org_id})
        assert c.execute(text("UPDATE compliance_settings SET last_run_at = now() - interval '2 days'")).rowcount == 1


def test_reminders_go_once_per_window_to_the_driver_with_a_copy_for_safety(org, owner_sql):
    s = seed(org)
    safety = org.add_user("safety_manager")
    driver_id = s["driver"]["id"]
    org.patch(f"/drivers/{driver_id}", {"medical_cert_expiry": day(6)}, 200)
    org.patch(f"/vehicles/{s['truck']['id']}", {"registration_expiry": day(45)}, 200)

    rules = org.get("/safety/reminders").json()          # the first read catches up on the missed run
    assert rules["enabled"] is True and rules["lead_days"] == [60, 30, 14, 7, 1] and rules["copy_to"] == ["safety_manager"]
    assert rules["sent_week"] == 2 and rules["failed_week"] == 0 and rules["last_run_at"] is not None
    assert rules["next_run_at"] > rules["last_run_at"]
    assert {c["key"]: c["connected"] for c in rules["channel_options"]} == {
        "app": True, "telegram": False, "sms": False, "email": False}
    sent = org.get("/safety/reminders/sent").json()
    assert {(x["item"], x["lead_days"]) for x in sent} == {("medical", 7), ("registration", 60)}

    # The driver's thread has the reminder; they aren't on the app, so it says what didn't reach them.
    thread = org.post("/conversations", {"kind": "driver", "driver_id": driver_id}).json()
    [card] = [x for x in thread["messages"] if x["event"] == "compliance.reminder"]
    assert card["title"] == "Medical card expires in 6 days"
    assert card["deliveries"] == [{**card["deliveries"][0], "channel": "app", "status": "not_sent"}]
    # The safety manager has a task for each item, which follows it.
    tasks = {t["title"]: t for t in safety.items("/tasks", tab="open")}
    assert set(tasks) == {"Medical card expires in 6 days · Dana Driver",
                          f"Registration expires in 45 days · Truck {s['truck']['unit_number']}"}
    assert tasks["Medical card expires in 6 days · Dana Driver"]["source"] == "reminder"

    # Read again: nothing is sent twice.
    org.get("/safety/summary")
    assert len(org.get("/safety/reminders/sent").json()) == 2

    # The next night the card is a day out: a new window, a new reminder, the same task.
    org.patch(f"/drivers/{driver_id}", {"medical_cert_expiry": day(1)}, 200)
    a_night_passes(owner_sql, org)
    org.get("/safety/reminders")
    assert [(x["item"], x["lead_days"]) for x in org.get("/safety/reminders/sent").json()][0] == ("medical", 1)
    titles = [t["title"] for t in safety.items("/tasks", tab="open")]
    assert "Medical card expires tomorrow · Dana Driver" in titles and len(titles) == 2

    # Renewed: its task closes on the next run.
    org.patch(f"/drivers/{driver_id}", {"medical_cert_expiry": day(700)}, 200)
    a_night_passes(owner_sql, org)
    org.get("/safety/reminders")
    done = [t for t in safety.items("/tasks", tab="done") if t["title"].startswith("Medical card")]
    assert done and done[0]["outcome"] == "Renewed"

    # Turned off, nothing more goes out.
    rules = org.get("/safety/reminders").json()
    body = {k: rules[k] for k in ("lead_days", "channels", "copy_to", "run_hour", "checklist", "version")}
    off = org.put("/safety/reminders", {**body, "enabled": False}, 200).json()
    assert off["enabled"] is False and off["next_run_at"] is None


def test_the_matrix_exports_as_a_spreadsheet(org):
    s = seed(org)
    org.patch(f"/drivers/{s['driver']['id']}", {"medical_cert_expiry": day(-3)}, 200)
    r = org.get("/safety/matrix.csv", params={"entity": "driver"})
    assert r.headers["content-type"].startswith("text/csv")
    assert r.headers["content-disposition"].startswith('attachment; filename="compliance-drivers-')
    rows = list(csv.reader(io.StringIO(r.text)))
    assert rows[0][:5] == ["Driver", "CDL", "CDL state", "Medical card", "Medical card state"]
    assert rows[0][-2:] == ["Dispatchable", "Status"]
    assert rows[1][0] == "Dana Driver" and rows[1][4] == "Expired" and rows[1][-2:] == ["No", "Expired"]
    assert rows[1][rows[0].index("Road test")] == "On file"
    assert org.items("/audit-logs", action="compliance.exported")[0]["data"] == {"entity": "driver", "rows": 1}
    company = list(csv.reader(io.StringIO(org.get("/safety/matrix.csv", params={"entity": "organization"}).text)))
    assert company[0] == ["Document", "File", "Expires", "State", "Review", "Status"] and len(company) == 5
    org.add_user("accountant").error("GET", "/safety/matrix.csv", 403, "FORBIDDEN")


def test_the_driver_profile_reads_the_file_item_by_item(org):
    s = seed(org)
    driver_id = s["driver"]["id"]
    org.patch(f"/drivers/{driver_id}", {"medical_cert_expiry": day(6), "cdl_class": "A", "endorsements": "T"}, 200)
    org.get("/safety/reminders")                                   # the reminders catch up
    f = org.get(f"/drivers/{driver_id}/file").json()
    assert [r["label"] for r in f["rows"]] == ["CDL — Class A", "Medical certificate", "MVR — annual review",
                                               "Drug & alcohol clearinghouse query", "Road test certificate",
                                               "Pre-employment drug test"]
    cdl, medical = f["rows"][0], f["rows"][1]
    assert cdl["sub"] == "Illinois · endorsements: T" and cdl["source"] == "Entered on the driver record"
    assert medical["state"] == "expiring" and medical["days_left"] == 6 and medical["short"] == "Medical card"
    assert medical["sub"].startswith("Reminder ") and medical["sub"].endswith("didn’t reach the driver")
    assert f["rows"][4]["source"].startswith("Entered by hand · on file since") and f["dispatchable"] is True

    # An approved scan stands behind the date it brought.
    doc = upload(org, "driver", driver_id, "medical", filename="card.pdf", expires_on=day(700))
    assert org.get(f"/drivers/{driver_id}/file").json()["rows"][1]["in_review"] is True
    org.post(f"/documents/{doc['id']}/review", {"decision": "approved"}, 200)
    medical = org.get(f"/drivers/{driver_id}/file").json()["rows"][1]
    assert medical["state"] == "valid" and medical["document_id"] == doc["id"]
    assert medical["source"] == "Upload · reviewed by Olive Owner"

    # Asking the driver for a document: they aren't on the app, so it waits in their conversation.
    asked = org.post(f"/drivers/{driver_id}/document-requests", {"item": "road_test"}, 200).json()
    assert asked["sent"] is False and asked["reached"] == []
    thread = org.get(f"/conversations/{asked['conversation_id']}").json()
    assert [m["title"] for m in thread["messages"] if m["event"] == "compliance.request"] == ["Please send your road test certificate"]
    org.error("POST", f"/drivers/{driver_id}/document-requests", 422, "VALIDATION_ERROR", json={"item": "pizza"})

    # Revealing sensitive details is logged; a dispatcher may not.
    shown = org.post(f"/drivers/{driver_id}/reveal", expect=200).json()
    assert shown["cdl_number"] == "D1234567"
    assert org.items("/audit-logs", action="driver.sensitive_revealed")[0]["entity_id"] == driver_id
    org.add_user("dispatcher").error("POST", f"/drivers/{driver_id}/reveal", 403, "FORBIDDEN")


def test_the_driver_overview_counts_the_last_30_days(org):
    from tests.conftest import deliver
    s = seed(org)
    load = deliver(org, new_load(org, s["customer"]["id"], stops=[
        {"type": "pickup", "city": "Chicago", "state": "IL", "appt_start": (datetime.now(UTC) - timedelta(days=2)).isoformat()},
        {"type": "delivery", "city": "Dallas", "state": "TX", "appt_start": (datetime.now(UTC) + timedelta(days=1)).isoformat()}]), s)
    assert load["status"] == "delivered"
    o = org.get(f"/drivers/{s['driver']['id']}/overview").json()
    assert (o["loads"], o["miles"], o["speeding"], o["on_time_pct"]) == (1, 920, 0, 100)
    assert o["position"] is None
