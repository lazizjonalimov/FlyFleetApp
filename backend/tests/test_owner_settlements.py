"""Owner settlements: a section per unit, every dollar in one place, fixed once approved; the weekly run."""
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from tests.conftest import deliver, new_load, seed, stops
from tests.test_owners import LEASE, driver, truck

TODAY = datetime.now(UTC).date()
WEEK = {"period_start": str(TODAY - timedelta(days=6)), "period_end": str(TODAY)}


def delivered_on(api, s, rate="2500.00", fsc=None, miles=900):
    day = datetime.now(UTC) - timedelta(hours=30)
    load = new_load(api, s["customer"]["id"], customer_rate=rate, miles=miles,
                    stops=stops(day.isoformat(), (day + timedelta(hours=8)).isoformat()))
    if fsc:
        api.post(f"/loads/{load['id']}/charges", {"type": "fuel_surcharge", "rate": fsc}, 201)
    return deliver(api, api.get(f"/loads/{load['id']}").json(), s)


def test_an_owner_operators_week_splits_each_load_and_itemizes_every_deduction(org, sql):
    s = seed(org)
    owner = org.post("/owners", {"entity_type": "individual", "person_id": s["driver"]["person_id"], "status": "active",
                                 "units": [{"vehicle_id": s["truck"]["id"], "effective_from": str(TODAY - timedelta(days=30)),
                                            "agreement": LEASE, "who_drives": "owner"}]}, 201).json()
    load = delivered_on(org, s, fsc="300.00")
    org.post("/expenses", {"category": "fuel", "incurred_on": str(TODAY), "amount": "400.00", "gallons": "100",
                           "jurisdiction": "TX", "vehicle_id": s["truck"]["id"], "vendor": "Truck stop"}, 201)
    st = org.post("/owner-settlements", {"owner_id": owner["id"], **WEEK}, 201).json()
    [section] = st["sections"]
    kinds = {line["kind"]: line for line in section["lines"]}
    assert kinds["load_share"]["load_id"] == load["id"] and kinds["load_share"]["amount"] == "2100.00"
    assert kinds["load_share"]["load_revenue"] == "2800.00" and kinds["load_share"]["carrier_share"] == "700.00"
    assert kinds["fuel"]["amount"] == "-400.00"
    assert kinds["insurance"]["amount"] == "-70.00" and kinds["eld"]["amount"] == "-25.00"  # a full week of each
    assert (st["owner_gross"], st["fuel"], st["net"]) == ("2100.00", "400.00", "1605.00")
    # One statement per owner per week, and a draft is the only one open.
    org.error("POST", "/owner-settlements", 409, "DRAFT_EXISTS", json={"owner_id": owner["id"], **WEEK})
    approved = org.post(f"/owner-settlements/{st['id']}/approve", {"version": st["version"]}, 200).json()
    assert approved["status"] == "approved" and approved["number"].startswith("OS-")
    # Fixed by the database, whatever the application asks.
    with pytest.raises(DBAPIError), sql.begin() as c:
        c.execute(text("SELECT set_config('app.org_id', :o, true)"), {"o": org.org_id})
        c.execute(text("UPDATE owner_settlement_lines SET amount = 1 WHERE settlement_id = :s"), {"s": st["id"]})
    # The load isn't paid again on the next week's settlement.
    nxt = org.post("/owner-settlements", {"owner_id": owner["id"], "period_start": str(TODAY + timedelta(days=1)),
                                          "period_end": str(TODAY + timedelta(days=7))}, 201).json()
    assert not any(line["kind"] == "load_share" for sec in nxt["sections"] for line in sec["lines"])
    paid = org.post(f"/owner-settlements/{st['id']}/pay", {"version": approved["version"], "paid_on": str(TODAY),
                                                            "method": "ach"}, 200).json()
    assert paid["status"] == "paid"


def test_driver_pay_run_for_a_fleet_owner_is_itemized_and_the_driver_is_marked_as_the_owners(org):
    s = seed(org)
    business = org.post("/owners", {"entity_type": "business", "legal_name": "Fleetwise Leasing LLC", "status": "active",
                                    "contacts": [{"person": {"first_name": "Lee", "last_name": "Ng"}, "title": "Principal"}],
                                    "units": [{"vehicle_id": s["truck"]["id"], "effective_from": str(TODAY - timedelta(days=30)),
                                               "who_drives": "owner_hire", "driver_id": s["driver"]["id"],
                                               "agreement": {"kind": "fleet_lease", "owner_pct": "72", "fsc_pct": "100",
                                                             "driver_pay_by": "carrier_for_owner"}}]}, 201).json()
    org.patch(f"/drivers/{s['driver']['id']}", {"pay_type": "per_mile", "pay_rate": "0.60"}, 200)
    delivered_on(org, s, miles=1000)
    st = org.post("/owner-settlements", {"owner_id": business["id"], **WEEK}, 201).json()
    [run] = [line for sec in st["sections"] for line in sec["lines"] if line["kind"] == "driver_pay_run"]
    assert run["amount"] == "-600.00" and run["description"].startswith("Driver pay run · ")
    assert st["driver_pay_run"] == "600.00"
    # The driver still gets their own statement, marked as the owner's driver.
    org.post("/settlements", {"driver_id": s["driver"]["id"], **WEEK}, 201)
    [row] = org.items("/settlements")
    assert row["context"]["pay_kind"] == "owners_driver" and row["context"]["works_for"] == "Fleetwise Leasing LLC"


def test_the_weekly_run_drafts_every_statement_once_and_pays_owner_operators_only_as_owners(org):
    s = seed(org)
    other = driver(org, "Quinn", "Hale")
    org.post("/owners", {"entity_type": "individual", "person_id": s["driver"]["person_id"], "status": "active",
                         "units": [{"vehicle_id": s["truck"]["id"], "effective_from": str(TODAY - timedelta(days=30)),
                                    "agreement": LEASE, "who_drives": "owner"}]}, 201)
    second = truck(org, "T2")
    org.put(f"/vehicles/{second['id']}/seat", {"driver_id": other["id"]}, 200)
    result = org.post("/settlement-runs", WEEK, 201).json()
    assert (result["drivers_created"], result["owners_created"]) == (1, 1)
    assert {"name": "Dana Driver", "reason": "Paid on their owner settlement"} in result["skipped"]
    again = org.post("/settlement-runs", WEEK, 201).json()
    assert (again["drivers_created"], again["owners_created"]) == (0, 0)
    summary = org.get("/owner-settlements/summary", params=WEEK).json()
    assert summary["owner_settlements"] == 1 and summary["drivers"] == 1


def test_the_pay_file_lists_approved_statements_with_only_the_last_four_of_the_account(org):
    s = seed(org)
    owner = org.post("/owners", {"entity_type": "individual", "person_id": s["driver"]["person_id"], "status": "active",
                                 "account_number": "000123456789", "routing_number": "021000021",
                                 "units": [{"vehicle_id": s["truck"]["id"], "effective_from": str(TODAY - timedelta(days=30)),
                                            "agreement": LEASE, "who_drives": "owner"}]}, 201).json()
    delivered_on(org, s)
    st = org.post("/owner-settlements", {"owner_id": owner["id"], **WEEK}, 201).json()
    org.post(f"/owner-settlements/{st['id']}/approve", {"version": st["version"]}, 200)
    csv = org.get("/settlement-pay-file", params={"period_start": WEEK["period_start"]}).text
    assert "Owner settlement" in csv and "••6789" in csv and "000123456789" not in csv
