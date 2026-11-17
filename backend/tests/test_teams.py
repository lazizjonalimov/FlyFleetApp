"""Dispatch teams: a team's dispatchers see the team's trucks and everything tied to them, and nothing else of the
fleet. The scope narrows what the role can already see, everywhere the API reads loads, trucks, drivers and alerts."""
import uuid
from datetime import UTC, datetime, timedelta

from tests.conftest import act, assign, new_load, seed, upload

PAPERS = {"insurance_expiry": "2035-01-01", "registration_expiry": "2035-01-01", "inspection_expiry": "2035-01-01"}


def second_rig(org) -> dict:
    driver = org.post("/drivers", {"first_name": "Ken", "last_name": "Ito", "cdl_expiry": "2035-01-01",
                                   "medical_cert_expiry": "2035-01-01"}, 201).json()
    truck = org.post("/vehicles", {"unit_number": f"T-{uuid.uuid4().hex[:5]}", **PAPERS}, 201).json()
    trailer = org.post("/trailers", {"unit_number": f"TR-{uuid.uuid4().hex[:5]}", "type": "dry_van", **PAPERS}, 201).json()
    org.put(f"/vehicles/{truck['id']}/seat", {"driver_id": driver["id"]}, 200)
    return {"driver": driver, "truck": truck, "trailer": trailer}


def team(org, name: str, users: list[str], trucks: list[str], **extra) -> dict:
    out = org.post("/dispatch-teams", {"name": name, "user_ids": users, "vehicle_ids": trucks, **extra}, 201).json()
    return next(t for t in out["teams"] if t["name"] == name)


def test_teams_hold_dispatchers_and_trucks_one_team_at_a_time(org):
    a, b = seed(org), second_rig(org)
    org.put(f"/vehicles/{a['truck']['id']}/seat", {"driver_id": a["driver"]["id"]}, 200)
    jordan, sofia = org.add_user("dispatcher"), org.add_user("dispatcher")
    north = team(org, "North", [jordan.user_id, sofia.user_id], [a["truck"]["id"]], lead_user_id=jordan.user_id)
    assert {d["id"]: d["lead"] for d in north["dispatchers"]} == {jordan.user_id: True, sofia.user_id: False}
    assert north["vehicles"][0]["driver_name"] == "Dana Driver"
    south = team(org, "South", [], [b["truck"]["id"]])
    # Sofia moves to South: a dispatcher is on one team at a time.
    out = org.put(f"/dispatch-teams/{south['id']}/members", {"user_ids": [sofia.user_id]}, 200).json()
    by = {t["name"]: t for t in out["teams"]}
    assert [d["id"] for d in by["North"]["dispatchers"]] == [jordan.user_id]
    assert [d["id"] for d in by["South"]["dispatchers"]] == [sofia.user_id]
    # The truck moves too, from one team to the other.
    out = org.put(f"/dispatch-teams/{south['id']}/vehicles",
                  {"vehicle_ids": [b["truck"]["id"], a["truck"]["id"]]}, 200).json()
    by = {t["name"]: t for t in out["teams"]}
    assert by["North"]["vehicles"] == [] and len(by["South"]["vehicles"]) == 2
    assert out["no_team"]["vehicles"] == 0 and out["total_vehicles"] == 2
    whats = [c["what"] for c in out["changes"]]
    assert any(w.startswith("moved ") and w.endswith("from North to South") for w in whats)
    assert "created North" in whats and any(w.startswith("moved Dispatcher from North to South") for w in whats)
    org.error("POST", "/dispatch-teams", 422, "VALIDATION_ERROR", json={"name": "north"})
    org.error("PUT", f"/dispatch-teams/{south['id']}/members", 422, "VALIDATION_ERROR",
              json={"user_ids": [org.add_user("safety_manager").user_id]})
    jordan.error("GET", "/dispatch-teams", 403, "FORBIDDEN")
    out = org.delete(f"/dispatch-teams/{south['id']}", expect=200).json()
    assert [t["name"] for t in out["teams"]] == ["North"] and out["no_team"]["vehicles"] == 2


def test_a_team_dispatcher_sees_only_the_team_trucks_and_what_is_tied_to_them(org):
    a, b = seed(org), second_rig(org)
    org.put(f"/vehicles/{a['truck']['id']}/seat", {"driver_id": a["driver"]["id"]}, 200)
    jordan = org.add_user("dispatcher")
    north = team(org, "North", [jordan.user_id], [a["truck"]["id"]])
    mine = assign(org, new_load(org, a["customer"]["id"]), a)
    theirs = assign(org, new_load(org, a["customer"]["id"]), b)
    waiting = new_load(org, a["customer"]["id"])

    me = jordan.get("/auth/me").json()["scope"]
    assert me == {"team_id": north["id"], "team_name": "North", "trucks": 1, "preview": False, "lead_name": "Dispatcher"}
    assert [x["id"] for x in jordan.items("/loads")] == [mine["id"]]
    jordan.error("GET", f"/loads/{theirs['id']}", 404, "NOT_FOUND")
    jordan.error("GET", f"/loads/{waiting['id']}", 404, "NOT_FOUND")  # not tagged for the team
    jordan.error("POST", f"/loads/{theirs['id']}/notes", 404, "NOT_FOUND", json={"body": "x"})
    # Paperwork filed with another team's load is hidden too; the team's own is there.
    bol_theirs = upload(org, "load", theirs["id"], "bol")
    bol_mine = upload(org, "load", mine["id"], "bol")
    seen = [d["id"] for d in jordan.items("/documents")]
    assert bol_mine["id"] in seen and bol_theirs["id"] not in seen
    jordan.error("GET", f"/documents/{bol_theirs['id']}", 404, "NOT_FOUND")
    assert [v["id"] for v in jordan.items("/vehicles")] == [a["truck"]["id"]]
    jordan.error("GET", f"/vehicles/{b['truck']['id']}", 404, "NOT_FOUND")
    assert [d["id"] for d in jordan.items("/drivers")] == [a["driver"]["id"]]
    jordan.error("GET", f"/drivers/{b['driver']['id']}", 404, "NOT_FOUND")
    assert {r["type"] for r in jordan.get("/search", params={"q": "Ito"}).json()} == set()
    assert [x["id"] for x in jordan.items("/dispatch/board")] == [mine["id"]]
    assert jordan.get("/drivers/summary").json() is not None

    # A load the team's dispatcher books is the team's; they can assign it only to the team's trucks.
    booked = new_load(jordan, a["customer"]["id"])
    assert booked["id"] in [x["id"] for x in jordan.items("/loads")]
    eligible = jordan.get("/dispatch/eligible-resources", params={"load_id": booked["id"]}).json()
    assert [v["id"] for v in eligible["vehicles"]] == [a["truck"]["id"]]
    jordan.error("POST", "/dispatch/assignments", 403, "FORBIDDEN", json={
        "load_id": booked["id"], "driver_id": b["driver"]["id"], "vehicle_id": b["truck"]["id"],
        "trailer_id": b["trailer"]["id"], "version": booked["version"]})

    # The shared queue: every unassigned load, still assignable only to the team's trucks.
    org.patch(f"/dispatch-teams/{north['id']}", {"unassigned_loads": "shared"}, 200)
    assert waiting["id"] in [x["id"] for x in jordan.items("/loads")]

    # Positions and alerts follow the truck.
    now = datetime.now(UTC)
    for truck in (a["truck"]["id"], b["truck"]["id"]):
        org.post("/positions", {"samples": [{"vehicle_id": truck, "recorded_at": (now - timedelta(minutes=1)).isoformat(),
                                             "lat": 31.1, "lon": -97.3, "speed_mph": 50}]}, 200)
    assert [v["vehicle_id"] for v in jordan.get("/fleet/live").json()["vehicles"]] == [a["truck"]["id"]]
    jordan.error("GET", f"/fleet/vehicles/{b['truck']['id']}/track", 404, "NOT_FOUND")
    act(org, theirs, "dispatch")
    assert all((x["vehicle"] or {}).get("id") != b["truck"]["id"] for x in jordan.items("/incidents"))


def test_who_is_on_no_team_and_a_preview_that_changes_nothing(org):
    a = seed(org)
    second_rig(org)
    chris = org.add_user("dispatcher")  # on no team
    north = team(org, "North", [], [a["truck"]["id"]])
    assert len(chris.items("/vehicles")) == 2 and chris.get("/auth/me").json()["scope"] is None
    org.put("/dispatch-teams-default", {"dispatchers_without_team": "none"}, 200)
    assert chris.items("/vehicles") == [] and chris.get("/auth/me").json()["scope"]["trucks"] == 0
    # The owner sees what North's dispatchers would, and can't change anything while previewing.
    preview = {"X-Preview-Team": north["id"]}
    assert [v["id"] for v in org.get("/vehicles", headers=preview).json()["items"]] == [a["truck"]["id"]]
    assert org.get("/auth/me", headers=preview).json()["scope"]["preview"] is True
    org.error("POST", "/customers", 403, "PREVIEW_READ_ONLY", json={"name": "x"}, headers=preview)
    chris.error("GET", "/vehicles", 403, "FORBIDDEN", headers=preview)
    assert len(org.items("/vehicles")) == 2  # outside the preview, the whole fleet
