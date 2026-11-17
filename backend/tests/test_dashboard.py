"""The dashboard: what needs a person, one row per thing with its action, and the next few hours."""
from datetime import UTC, datetime, timedelta

from tests.conftest import act, deliver, new_load, seed, upload


def stops(pickup: datetime, delivery: datetime) -> list[dict]:
    return [{"type": "pickup", "name": "Shipper DC", "city": "Dallas", "state": "TX", "appt_start": pickup.isoformat()},
            {"type": "delivery", "name": "Receiver", "city": "Austin", "state": "TX", "appt_start": delivery.isoformat()}]


def test_needs_attention_lists_each_alert_with_its_action(org):
    s = seed(org)
    now = datetime.now(UTC)
    waiting = new_load(org, s["customer"]["id"], stops=stops(now + timedelta(hours=2), now + timedelta(hours=8)))
    hauled = deliver(org, new_load(org, s["customer"]["id"]), s)

    out = org.get("/dashboard/attention").json()
    assert out["view"] == "operations"
    rows = {r["kind"]: r for r in out["items"]}
    unassigned = rows["unassigned"]
    assert unassigned["tag"] == "Unassigned" and unassigned["ref"] == waiting["load_number"] and unassigned["ref_code"]
    assert unassigned["title"].startswith("Pickup ") and unassigned["title"].endswith(" with no driver")
    assert unassigned["detail"].startswith("Globex, Dallas · pickup ") and "(in 1h" in unassigned["detail"]
    assert (unassigned["action"], unassigned["action_label"], unassigned["load_id"]) == ("assign", "Assign", waiting["id"])
    pod = rows["pod_missing"]
    assert pod["ref"] == hauled["load_number"] and pod["title"] == "Delivered today, no POD"
    assert pod["detail"] == "Globex, Dallas · invoicing blocked until received"
    assert (pod["action"], pod["action_label"]) == ("request_pod", "Request POD")
    # The road first: an unassigned pickup comes before the missing paperwork.
    kinds = [r["kind"] for r in out["items"]]
    assert kinds.index("unassigned") < kinds.index("pod_missing") and out["total"] == len(out["items"])
    assert len(org.get("/dashboard/attention", params={"limit": 1}).json()["items"]) == 1

    # Asking the driver: they aren't on the driver app, so nothing reaches them, and the dashboard says it was asked.
    asked = org.post(f"/loads/{hauled['id']}/pod-request", expect=200).json()
    assert (asked["driver"], asked["sent"], asked["times"]) == ("Dana Driver", False, 1)
    again = org.post(f"/loads/{hauled['id']}/pod-request", expect=200).json()
    assert again["times"] == 2
    pod = next(r for r in org.get("/dashboard/attention").json()["items"] if r["kind"] == "pod_missing")
    assert pod["detail"].endswith(" · driver asked twice")
    alert = org.get(f"/incidents/{pod['incident_id']}").json()
    assert any(e["text"] == "Olive Owner asked Dana Driver for the POD · not sent: not on the driver app" for e in alert["events"])
    org.error("POST", f"/loads/{waiting['id']}/pod-request", 409, "WRONG_STATE")

    # Once the POD is in, it isn't asked for any more and the row goes.
    upload(org, "load", hauled["id"])
    assert "pod_missing" not in {r["kind"] for r in org.get("/dashboard/attention").json()["items"]}
    org.error("POST", f"/loads/{hauled['id']}/pod-request", 409, "WRONG_STATE")


def test_billing_sees_paperwork_and_money_instead(org):
    s = seed(org)
    hauled = deliver(org, new_load(org, s["customer"]["id"]), s)
    reviewed = deliver(org, new_load(org, s["customer"]["id"]), s)
    upload(org, "load", reviewed["id"])
    accounting = org.add_user("accountant")
    out = accounting.get("/dashboard/attention").json()
    assert out["view"] == "billing"
    rows = {(r["kind"], r["ref"]): r for r in out["items"]}
    review = rows[("pod_review", reviewed["load_number"])]
    assert (review["tag"], review["title"], review["action_label"]) == ("POD review", "POD uploaded, needs review", "Review")
    missing = rows[("pod_missing", hauled["load_number"])]
    assert missing["title"] == "Can’t invoice — no POD" and missing["detail"].startswith("Globex · delivered ")
    # Accounting reviews proof of delivery, so it can ask the driver for a missing one; a viewer can't.
    assert (missing["action"], missing["action_label"]) == ("request_pod", "Request")
    assert [r["kind"] for r in out["items"]][0] == "pod_review"
    assert accounting.post(f"/loads/{hauled['id']}/pod-request", expect=200).json()["times"] == 1
    org.add_user("viewer").error("POST", f"/loads/{hauled['id']}/pod-request", 403, "FORBIDDEN")
    summary = accounting.get("/dashboard/summary").json()
    assert summary["view"] == "billing" and summary["receivables"]["draft_amount"] == "0.00"
    assert summary["receivables"]["oldest_overdue_days"] is None


def test_the_next_four_hours(org):
    s = seed(org)
    now = datetime.now(UTC)
    soon = new_load(org, s["customer"]["id"], stops=stops(now - timedelta(hours=1), now + timedelta(hours=2)))
    load = act(org, org.post("/dispatch/assignments", {
        "load_id": soon["id"], "driver_id": s["driver"]["id"], "vehicle_id": s["truck"]["id"],
        "trailer_id": s["trailer"]["id"], "version": soon["version"]}, 201).json(), "dispatch")
    assert load["status"] == "dispatched"
    new_load(org, s["customer"]["id"], stops=stops(now + timedelta(hours=10), now + timedelta(hours=20)))
    outlook = org.get("/dashboard/summary").json()["outlook"]
    until = datetime.fromisoformat(outlook["until"])
    assert timedelta(hours=3) <= until - now <= timedelta(hours=4) and until.minute == 0
    assert outlook["deliveries"] == 1 and outlook["drivers_free"] == 1
    assert outlook["trucks_in_shop"] == 0 and outlook["trucks_out_of_service"] == 0
    # Late for its pickup, so the delivery isn't counted as on schedule.
    org.get("/dashboard/attention")
    outlook = org.get("/dashboard/summary").json()["outlook"]
    assert outlook["late"] == 1 and outlook["deliveries_on_time"] == 0
