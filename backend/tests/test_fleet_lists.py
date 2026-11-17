"""The trucks, trailers and drivers tables: their figures, the values their filters offer, search across names
held elsewhere, and the tabs that depend on loads, seats and papers."""
from datetime import UTC, datetime, timedelta

from tests.conftest import assign, new_load, seed
from tests.test_owners import DATES, LEASE, driver

TODAY = datetime.now(UTC).date()


def test_truck_figures_and_filters_come_from_the_companys_own_records(org):
    s = seed(org)
    second = org.post("/vehicles", {"unit_number": "T2", "make": "Volvo", "year": 2021, **DATES}, 201).json()
    org.post("/vehicles", {"unit_number": "T3", "make": "Volvo", "year": 2024, "status": "in_maintenance", **DATES}, 201)
    owner = org.post("/owners", {"entity_type": "individual", "person_id": s["driver"]["person_id"], "status": "active",
                                 "units": [{"vehicle_id": s["truck"]["id"], "effective_from": str(TODAY - timedelta(days=9)),
                                            "agreement": LEASE, "who_drives": "owner"}]}, 201).json()
    a, b = driver(org, "Ken", "Ito"), driver(org, "Katie", "Walsh")
    org.put(f"/vehicles/{second['id']}/seat", {"driver_id": a["id"], "co_driver_id": b["id"], "team_split": "miles"}, 200)
    assign(org, new_load(org, s["customer"]["id"]), s)

    summary = org.get("/vehicles/summary").json()
    assert (summary["total"], summary["on_loads"], summary["available"], summary["in_maintenance"]) == (3, 1, 1, 1)
    assert (summary["company"], summary["owner_units"], summary["owners"]) == (2, 1, 1)
    assert summary["teams"] == ["T2 Ken and Katie"]
    assert {m["value"]: m["count"] for m in summary["makes"]}["Volvo"] == 2
    assert [y["value"] for y in summary["years"]][:2] == ["2024", "2021"]
    assert summary["owner_list"] == [{"value": owner["id"], "label": "Dana Driver", "count": 1}]

    units = lambda **q: [u["unit_number"] for u in org.items("/vehicles", **q)]  # noqa: E731
    assert units(make="Volvo") == ["T2", "T3"] and units(year=2024) == ["T3"]
    assert units(kind="available") == ["T2"] and units(kind="team") == ["T2"] and units(kind="company") == ["T2", "T3"]
    # Search finds a truck by its driver's or its owner's name.
    assert units(q="katie") == ["T2"] and units(q="dana driver") == [s["truck"]["unit_number"]]
    # Sorting by owner puts the carrier's own trucks last.
    assert units(sort="owner")[0] == s["truck"]["unit_number"]
    [row] = [u for u in org.items("/vehicles") if u["unit_number"] == "T3"]
    assert row["next_service"] is None


def test_trailers_know_the_truck_pulling_them_and_what_is_due(org):
    s = seed(org)
    org.post("/trailers", {"unit_number": "R1", "type": "reefer", **{**DATES, "registration_expiry": str(TODAY + timedelta(days=20))}}, 201)
    assign(org, new_load(org, s["customer"]["id"]), s)
    [row] = [t for t in org.items("/trailers") if t["id"] == s["trailer"]["id"]]
    assert row["truck"]["name"] == s["truck"]["unit_number"]
    assert [t["unit_number"] for t in org.items("/trailers", q=s["truck"]["unit_number"])] == [s["trailer"]["unit_number"]]
    summary = org.get("/trailers/summary").json()
    assert (summary["loaded"], summary["empty"], summary["reefers"], summary["reefers_loaded"]) == (1, 1, 1, 0)
    assert summary["service_due"] == 1 and summary["service_due_detail"][0]["label"] == "registration"


def test_driver_tabs_follow_loads_seats_and_papers(org):
    s = seed(org)
    lapsed = driver(org, "Lou", "Lapsed", endorsements="H N")
    org.patch(f"/drivers/{lapsed['id']}", {"medical_cert_expiry": str(TODAY - timedelta(days=1))}, 200)
    free = driver(org, "Fay", "Free")
    org.put(f"/vehicles/{s['truck']['id']}/seat", {"driver_id": s["driver"]["id"]}, 200)
    assign(org, new_load(org, s["customer"]["id"]), s)

    names = lambda **q: [d["full_name"] for d in org.items("/drivers", **q)]  # noqa: E731
    assert names(kind="on_load") == ["Dana Driver"]
    assert names(kind="available") == [free["full_name"]]
    assert names(kind="not_dispatchable") == ["Lou Lapsed"] and names(qualification="blocked") == ["Lou Lapsed"]
    assert names(endorsement="h") == ["Lou Lapsed"] and names(endorsement="T") == []
    assert names(q=s["truck"]["unit_number"]) == ["Dana Driver"]
    summary = org.get("/drivers/summary").json()
    assert (summary["total"], summary["dispatchable"], summary["blocked"], summary["on_load"], summary["available"]) == (3, 2, 1, 1, 1)
    assert {e["value"] for e in summary["endorsements"]} == {"H", "N"}
