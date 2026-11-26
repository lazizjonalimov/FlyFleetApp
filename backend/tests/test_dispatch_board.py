"""The dispatch board: assign and dispatch in one step with or without telling the driver, undo, moving a load to
another day, best-match assignment for several loads, and the drivers' seats."""
from tests.conftest import assign, new_load, qualify, stops


def seed2(org):
    """A customer, two qualified drivers each seated in a truck, and two dry-van trailers."""
    dates = {"insurance_expiry": "2035-01-01", "registration_expiry": "2035-01-01", "inspection_expiry": "2035-01-01"}
    out = {"customer": org.post("/customers", {"name": "Globex"}, 201).json(), "drivers": [], "trucks": [], "trailers": []}
    for i, name in enumerate(("Dana", "Eli")):
        d = org.post("/drivers", {"first_name": name, "last_name": "Driver", "cdl_number": f"D12345{i}", "cdl_state": "il",
                                  "cdl_expiry": "2035-01-01", "medical_cert_expiry": "2035-01-01"}, 201).json()
        out["drivers"].append(qualify(org, d["id"]))
        out["trucks"].append(org.post("/vehicles", {"unit_number": f"T-{name}", **dates}, 201).json())
        out["trailers"].append(org.post("/trailers", {"unit_number": f"TR-{name}", "type": "dry_van", **dates}, 201).json())
    return out


def body(load, s, i=0, **extra):
    return {"load_id": load["id"], "driver_id": s["drivers"][i]["id"], "vehicle_id": s["trucks"][i]["id"],
            "trailer_id": s["trailers"][i]["id"], "version": load["version"], **extra}


def thread(org, driver_id):
    conv = org.post("/conversations", {"kind": "driver", "driver_id": driver_id}).json()
    return org.get(f"/conversations/{conv['id']}").json()["messages"]


def test_assign_and_dispatch_in_one_step_with_a_note_then_undo(org):
    s = seed2(org)
    load = new_load(org, s["customer"]["id"])
    done = org.post("/dispatch/assignments", body(load, s, dispatch=True, message="Gate code 4411"), 201).json()
    assert done["status"] == "dispatched"
    said = [m.get("title") or m.get("body") for m in thread(org, s["drivers"][0]["id"])]
    assert any("dispatched" in (t or "") for t in said) and any("Note from Olive Owner" in (t or "") for t in said)
    back = org.post(f"/dispatch/assignments/{done['assignment']['id']}/undo", {"version": done["version"]}, 200).json()
    assert back["status"] == "planned" and back["assignment"] is None
    assert any("taken back" in (m.get("title") or "") for m in thread(org, s["drivers"][0]["id"]))
    actions = {e["action"] for e in org.items("/audit-logs", entity_id=load["id"])}
    assert {"dispatch.assigned", "load.dispatch", "dispatch.undone"} <= actions


def test_dispatch_without_telling_the_driver(org):
    s = seed2(org)
    load = new_load(org, s["customer"]["id"])
    done = org.post("/dispatch/assignments", body(load, s, dispatch=True, notify=False, message="ignored"), 201).json()
    assert done["status"] == "dispatched"
    assert not [m for m in thread(org, s["drivers"][0]["id"]) if (m.get("load") or {}).get("id") == load["id"]]


def test_moving_a_load_to_another_day_and_back(org):
    s = seed2(org)
    load = new_load(org, s["customer"]["id"])                                    # 10 to 12 March 2031
    moved = org.post("/dispatch/reschedule", {"load_id": load["id"], "version": load["version"], "days": 2}, 200).json()
    assert moved["pickup_at"].startswith("2031-03-12") and moved["stops"][1]["appt_start"].startswith("2031-03-14")
    back = org.post("/dispatch/reschedule", {"load_id": load["id"], "version": moved["version"], "days": -2}, 200).json()
    assert back["pickup_at"].startswith("2031-03-10")
    assert "load.rescheduled" in {e["action"] for e in org.items("/audit-logs", entity_id=load["id"])}
    # A driver already on it is checked for the new days: moving onto their other work is refused.
    first = org.post("/dispatch/assignments", body(new_load(org, s["customer"]["id"], stops=stops("2031-03-14T14:00:00Z", "2031-03-16T14:00:00Z")), s), 201).json()
    mine = org.post("/dispatch/assignments", body(back, s), 201).json()
    err = org.error("POST", "/dispatch/reschedule", 409, "ASSIGNMENT_CONFLICT", json={"load_id": load["id"], "version": mine["version"], "days": 4})
    assert err["message"].startswith("Not moved:") and first["load_number"] in err["message"]
    assert org.get(f"/loads/{load['id']}").json()["pickup_at"].startswith("2031-03-10")


def test_best_match_assigns_who_it_can_and_says_why_not(org):
    s = seed2(org)
    loads = [new_load(org, s["customer"]["id"]) for _ in range(3)]               # three loads at the same time
    out = org.post("/dispatch/best-match", {"load_ids": [x["id"] for x in loads]}, 200).json()
    assert len(out["assigned"]) == 2 and {a["driver"] for a in out["assigned"]} == {"Dana Driver", "Eli Driver"}
    assert len(out["failed"]) == 1 and out["failed"][0]["reason"]
    for a in out["assigned"]:
        org.post(f"/dispatch/assignments/{a['assignment_id']}/undo", {"version": a["version"]}, 200)
    assert sorted(x["status"] for x in org.items("/loads")) == ["planned", "planned", "planned"]


def test_a_clash_says_who_booked_the_driver_and_seats_list_trucks(org):
    s = seed2(org)
    first = new_load(org, s["customer"]["id"])
    org.post("/dispatch/assignments", body(first, s), 201)
    second = new_load(org, s["customer"]["id"])
    err = assign(org, second, {"driver": s["drivers"][0], "truck": s["trucks"][1], "trailer": s["trailers"][1]}, expect=409)["error"]
    assert err["details"]["assigned_by"] == "Olive Owner" and err["details"]["load_number"] == first["load_number"]
    assert err["details"]["driver"] == "Dana Driver" and err["details"]["assigned_at"]
    seats = {x["driver_id"]: x for x in org.get("/dispatch/seats").json()}
    assert seats == {} or all("truck" in v for v in seats.values())
