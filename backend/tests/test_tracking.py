"""Live fleet and fleet alerts: positions in, one incident per episode, who was told, and the people who act on
them. Speed rules read positions; the other alerts are kept in step with the records."""
from datetime import UTC, datetime, timedelta

from tests.conftest import act, assign, new_load, seed

TEMPLE = (31.0982, -97.3428)  # Temple, TX
WACO = (31.5493, -97.1467)


def at(minutes_ago: float) -> str:
    return (datetime.now(UTC) - timedelta(minutes=minutes_ago)).isoformat()


def samples(truck: str, speeds: list[float], start_minutes_ago: float, step: float = 0.5, where=TEMPLE) -> list[dict]:
    return [{"vehicle_id": truck, "recorded_at": at(start_minutes_ago - i * step), "lat": where[0] - i * 0.004,
             "lon": where[1], "speed_mph": v, "heading": 182, "accuracy_m": 5} for i, v in enumerate(speeds)]


def stops(pickup: datetime, delivery: datetime) -> list[dict]:
    return [{"type": "pickup", "name": "Shipper DC", "city": "Dallas", "state": "TX", "appt_start": pickup.isoformat()},
            {"type": "delivery", "name": "Receiver", "city": "Austin", "state": "TX", "appt_start": delivery.isoformat()}]


def test_positions_show_on_the_live_fleet_with_where_and_how_fresh(org):
    s = seed(org)
    truck = s["truck"]["id"]
    body = {"source": "telematics", "samples": samples(truck, [61, 62], 1.0)}
    assert org.post("/positions", body, 200).json() == {"received": 2, "kept": 2, "duplicates": 0, "incidents": 0}
    assert org.post("/positions", body, 200).json()["duplicates"] == 2  # the same samples sent again are kept once
    live = org.get("/fleet/live").json()
    [row] = [v for v in live["vehicles"] if v["vehicle_id"] == truck]
    assert row["freshness"] == "live" and row["moving"] and row["position"]["speed_mph"] == 62
    assert row["place"].startswith("Southbound") and "Temple, TX" in row["place"]
    assert live["counts"]["moving"] == 1 and live["reporting"] == 1 and live["sources"] == ["telematics"]
    track = org.get(f"/fleet/vehicles/{truck}/track").json()
    assert len(track["points"]) == 2 and track["incident"] is None
    org.error("POST", "/positions", 422, "VALIDATION_ERROR",
              json={"samples": [{**body["samples"][0], "recorded_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat()}]})


def test_sustained_speeding_is_one_incident_per_episode_with_a_trail(org):
    s = seed(org)
    truck = s["truck"]["id"]
    # 74-76 mph for 3 minutes against the standard rule: 70 mph + 3 tolerance, for at least 2 minutes.
    out = org.post("/positions", {"samples": samples(truck, [74, 75, 76, 76, 75, 74, 75], 3.0)}, 200).json()
    assert out["incidents"] == 1
    [inc] = org.items("/incidents", group="speeding")
    assert inc["number"].startswith("SPD-") and inc["title"] == "Above 73 mph for 3 min" and inc["severity"] == "high"
    assert inc["state"] == "notified" and inc["detail"].startswith("Peak 76 mph · ")
    detail = org.get(f"/incidents/{inc['id']}").json()
    assert [e["text"].split(" · ")[0] for e in detail["events"]] == [
        "Detected — above 73 mph for 3 min", "Dispatch notified", "Push to the dispatcher on duty not sent"]
    assert detail["pending"]["text"] == "Escalates to safety manager if not acknowledged"
    assert detail["policy"]["name"] == "Highway sustained speeding" and detail["policy"]["version"] == 1
    # More speeding inside the cooldown is the same episode, however many samples see it.
    org.post("/positions", {"samples": samples(truck, [78, 79], 0.5)}, 200)
    [again] = org.items("/incidents", group="speeding")
    assert again["id"] == inc["id"] and org.get(f"/incidents/{inc['id']}").json()["peak"] == 79
    live = org.get("/fleet/live").json()
    row = next(v for v in live["vehicles"] if v["vehicle_id"] == truck)
    assert row["incident"]["number"] == inc["number"] and row["line"].endswith("· speeding")
    assert live["counts"]["alerts"] == 1

    acked = org.post(f"/incidents/{inc['id']}/actions", {"action": "acknowledge", "version": detail["version"]}, 200).json()
    assert acked["state"] == "acknowledged" and acked["pending"] is None and acked["acknowledged_by_name"]
    org.error("POST", f"/incidents/{inc['id']}/actions", 409, "VERSION_CONFLICT",
              json={"action": "note", "note": "Calling him", "version": detail["version"]})
    done = org.post(f"/incidents/{inc['id']}/actions", {"action": "resolve", "note": "Driver called, slowed down"}, 200).json()
    assert done["state"] == "resolved" and done["events"][-1]["text"] == "Resolved — Driver called, slowed down"
    # Still speeding inside the cooldown of the episode just resolved: the same episode, no new incident.
    assert org.post("/positions", {"samples": samples(truck, [77, 77, 77], 0.4, step=0.2)}, 200).json()["incidents"] == 0
    assert org.items("/incidents", group="resolved")[0]["id"] == inc["id"]
    assert not org.items("/incidents", group="speeding")


def test_a_policy_saves_as_versions_and_previews_on_real_positions(org):
    s = seed(org)
    truck = s["truck"]["id"]
    policies = org.get("/alert-policies").json()
    assert [p["name"] for p in policies["policies"]] == ["Highway sustained speeding", "Yard speed over 10 mph",
                                                          "Dwell at a stop over 2 h", "GPS stale over 15 min"]
    assert {c["key"]: c["connected"] for c in policies["channels"]}["telegram"] is False
    speed = next(p for p in policies["policies"] if p["kind"] == "speeding")
    org.post("/positions", {"samples": samples(truck, [66, 67, 68, 67, 66], 2.5)}, 200)
    preview = org.post(f"/alert-policies/{speed['id']}/preview", {"settings": {**speed["settings"], "threshold_mph": 62,
                                                                               "tolerance_mph": 2}}, 200).json()
    assert preview["incidents"] == 1 and preview["above"] == 5 and preview["trace"]["unit_number"] == s["truck"]["unit_number"]
    body = {**{k: speed[k] for k in ("kind", "name", "enabled", "settings", "recipients", "message", "applies_to")},
            "settings": {**speed["settings"], "threshold_mph": 65}, "version": speed["version"], "note": "Lower for winter"}
    saved = org.put(f"/alert-policies/{speed['id']}", body, 200).json()
    assert saved["version"] == 2 and saved["settings"]["threshold_mph"] == 65
    org.error("PUT", f"/alert-policies/{speed['id']}", 409, "VERSION_CONFLICT", json=body)
    versions = org.get(f"/alert-policies/{speed['id']}/versions").json()
    assert [(v["version"], v["note"]) for v in versions] == [(2, "Lower for winter"), (1, "Standard rule")]
    org.error("PUT", f"/alert-policies/{speed['id']}", 422, "VALIDATION_ERROR",
              json={**body, "version": 2, "settings": {**body["settings"], "threshold_mph": 300}})


def test_record_alerts_follow_the_loads_and_clear_on_their_own(org):
    s = seed(org)
    now = datetime.now(UTC)
    soon = new_load(org, s["customer"]["id"], stops=stops(now + timedelta(hours=3), now + timedelta(hours=9)))
    [waiting] = [x for x in org.items("/incidents") if x["kind"] == "unassigned"]
    assert waiting["title"].startswith("Pickup in 2h") and waiting["title"].endswith("with no driver")
    assert waiting["severity"] == "high" and waiting["load"]["load_number"] == soon["load_number"]
    load = assign(org, soon, s)
    assert not [x for x in org.items("/incidents") if x["kind"] == "unassigned"]
    cleared = next(x for x in org.items("/incidents", group="resolved") if x["kind"] == "unassigned")
    detail = org.get(f"/incidents/{cleared['id']}").json()
    assert detail["resolution"] == "a driver was assigned" and detail["events"][-1]["text"] == "Cleared — a driver was assigned"
    # On the road with positions that then stop: GPS stale, then back.
    load = act(org, load, "dispatch")
    truck = s["truck"]["id"]
    org.post("/positions", {"samples": samples(truck, [55], 20.0, where=WACO)}, 200)
    stale = next(x for x in org.items("/incidents") if x["kind"] == "gps_stale")
    assert stale["title"] == "No position for 20 min" and stale["load"]["load_number"] == soon["load_number"]
    assert org.get("/incidents/counts").json()["equipment"] == 1
    org.post("/positions", {"samples": samples(truck, [55], 0.0, where=WACO)}, 200)
    assert not [x for x in org.items("/incidents") if x["kind"] == "gps_stale"]
    # Arrived at the pickup 40 minutes ago: watched, not yet an alert.
    load = act(org, load, "arrive", occurred_at=at(40))
    watching = next(x for x in org.items("/incidents") if x["kind"] == "dwell")
    assert watching["state"] == "watching" and watching["title"] == "At pickup for 40 min"
    # Detected when the condition began: on arrival, not when FlyFleet first looked.
    assert abs(datetime.fromisoformat(watching["detected_at"]) - (datetime.now(UTC) - timedelta(minutes=40))) < timedelta(minutes=1)
    assert watching["detail"] == "Shipper DC · detention starts at 2 h"
    csv = org.get("/incidents", params={"format": "csv"}).text
    assert csv.startswith("﻿Number,Type,Incident") and "At pickup for 40 min" in csv


def test_who_sees_and_who_acts(org):
    s = seed(org, with_login=True)
    truck = s["truck"]["id"]
    accountant = org.add_user("accountant")
    accountant.error("GET", "/fleet/live", 403, "FORBIDDEN")
    accountant.error("GET", "/incidents", 403, "FORBIDDEN")
    dispatcher = org.add_user("dispatcher")
    dispatcher.get("/fleet/live")
    dispatcher.error("POST", "/positions", 403, "FORBIDDEN", json={"samples": samples(truck, [50], 0)})
    dispatcher.error("PUT", f"/alert-policies/{org.get('/alert-policies').json()['policies'][0]['id']}", 403, "FORBIDDEN",
                     json={"kind": "dwell", "name": "x", "settings": {"hours": 1}, "recipients": [
                         {"who": "dispatcher_on_duty", "channels": ["in_app"]}]})
    # The driver's phone reports for the truck they are seated in.
    org.put(f"/vehicles/{truck}/seat", {"driver_id": s["driver"]["id"]}, 200)
    out = s["driver_api"].post("/driver/positions", {"samples": [
        {"recorded_at": at(0.2), "lat": WACO[0], "lon": WACO[1], "speed_mph": 0, "accuracy_m": 12}]}, expect=200).json()
    assert out["kept"] == 1
    row = next(v for v in dispatcher.get("/fleet/live").json()["vehicles"] if v["vehicle_id"] == truck)
    assert row["position"]["source"] == "driver_app" and row["line"] == "Parked · Near Waco, TX"
    # Inside a geofence, the truck is where the company says it is.
    dispatcher.error("POST", "/geofences", 403, "FORBIDDEN", json={"name": "Yard", "lat": WACO[0], "lon": WACO[1]})
    org.post("/geofences", {"name": "Waco yard", "kind": "yard", "lat": WACO[0], "lon": WACO[1], "radius_m": 300}, 201)
    row = next(v for v in dispatcher.get("/fleet/live").json()["vehicles"] if v["vehicle_id"] == truck)
    assert row["place"] == "At Waco yard" and row["line"] == "Parked · at Waco yard"
