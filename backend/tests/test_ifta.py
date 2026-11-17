"""Fuel tax (IFTA): rates per quarter, miles by truck and state, purchases with their checks, and the quarterly
return worked out live, then reviewed, approved (fixed), filed and paid."""
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from app.modules.ifta.service import bounds, previous, quarter_of
from tests.conftest import assign, new_load, seed
from tests.test_owners import DATES

TODAY = datetime.now(UTC).date()
LAST = previous(quarter_of(TODAY))  # a quarter that is over, so its return can move on
DAY = bounds(LAST)[0] + timedelta(days=10)


def fuel(api, s, gallons: str, amount: str, state: str, on=DAY, **extra):
    return api.post("/expenses", {"category": "fuel", "incurred_on": str(on), "amount": amount, "gallons": gallons,
                                  "jurisdiction": state, "vehicle_id": s["truck"]["id"], "vendor": "Truck stop",
                                  **extra}, 201).json()


def test_rates_are_kept_per_quarter_and_compared_with_the_last(org):
    org.put(f"/ifta/rates/{previous(LAST)}", {"rates": [{"jurisdiction": "TX", "rate": "0.2000"}]}, 200)
    rows = org.put(f"/ifta/rates/{LAST}", {"rates": [{"jurisdiction": "Texas", "rate": "0.2100"},
                                                      {"jurisdiction": "OK", "rate": "0.1900"}]}, 200).json()
    tx = next(r for r in rows if r["jurisdiction"] == "TX")
    assert (tx["rate"], tx["change"], tx["name"]) == ("0.2100", "0.0100", "Texas")
    matrix = b"Jurisdiction,Rate,Surcharge\nKY,0.2460,0.1050\n"
    imported = org.post("/ifta/rates/import", files={"file": ("matrix.csv", matrix)}, data={"quarter": LAST},
                        expect=200).json()
    assert next(r for r in imported if r["jurisdiction"] == "KY")["surcharge"] == "0.1050"
    org.error("PUT", f"/ifta/rates/{LAST}", 422, "VALIDATION_ERROR", json={"rates": [{"jurisdiction": "XT", "rate": "0.2"}]})


def test_a_manual_trip_must_agree_with_its_odometer(org):
    s = seed(org)
    trip = {"vehicle_id": s["truck"]["id"], "trip_date": str(DAY), "miles": [{"jurisdiction": "TX", "miles": "120"},
                                                                            {"jurisdiction": "OK", "miles": "80"}]}
    org.error("POST", "/ifta/trips", 422, "VALIDATION_ERROR", json={**trip, "odometer_start": 1000, "odometer_end": 1150})
    made = org.post("/ifta/trips", {**trip, "odometer_start": 1000, "odometer_end": 1200}, 201).json()
    assert made["source"] == "manual" and made["miles"] == {"TX": "120.0", "OK": "80.0"}
    org.error("POST", "/ifta/trips", 422, "VALIDATION_ERROR", json={**trip, "trip_date": str(TODAY + timedelta(days=2))})


def test_the_return_is_worked_out_reviewed_approved_filed_and_paid(org):
    s = seed(org)
    org.patch("/organization", {"state": "TX"}, 200)
    org.post("/ifta/trips", {"vehicle_id": s["truck"]["id"], "trip_date": str(DAY),
                             "miles": [{"jurisdiction": "TX", "miles": "1200"}, {"jurisdiction": "OK", "miles": "800"}]}, 201)
    fuel(org, s, "300", "1140.00", "TX")
    fuel(org, s, "33.333", "126.67", "OK", on=DAY + timedelta(days=1))
    r = org.get(f"/ifta/returns/{LAST}").json()
    assert r["estimate"] and r["status"] == "collecting" and r["mpg"] == "6.00"
    lines = {x["jurisdiction"]: x for x in r["lines"]}
    # 2,000 mi / 333.333 gal = 6.0 MPG: Texas 200 taxable gallons, 300 paid (a 100 gallon credit); Oklahoma 133 taxable.
    assert (lines["TX"]["taxable_gallons"], lines["TX"]["tax_paid_gallons"], lines["TX"]["net_gallons"]) == ("200", "300", "-100")
    assert lines["OK"]["net_gallons"] == "100" and r["missing_rates"] == ["TX", "OK"]
    org.put(f"/ifta/rates/{LAST}", {"rates": [{"jurisdiction": "TX", "rate": "0.2000"}, {"jurisdiction": "OK", "rate": "0.1900"}]}, 200)
    r = org.get(f"/ifta/returns/{LAST}").json()
    assert {x["jurisdiction"]: x["tax"] for x in r["lines"]} == {"TX": "-20.00", "OK": "19.00"} and r["net_tax"] == "-1.00"
    assert r["allowed_actions"] == ["review"]
    r = org.post(f"/ifta/returns/{LAST}/actions", {"action": "review", "version": r["version"]}, 200).json()
    r = org.post(f"/ifta/returns/{LAST}/actions", {"action": "approve", "version": r["version"]}, 200).json()
    assert r["status"] == "approved" and not r["estimate"] and r["approved_by_name"]
    # Approved: its lines and rates are fixed.
    org.error("PUT", f"/ifta/rates/{LAST}", 409, "RETURN_LOCKED", json={"rates": [{"jurisdiction": "TX", "rate": "0.3"}]})
    org.error("POST", "/ifta/trips", 409, "RETURN_LOCKED", json={"vehicle_id": s["truck"]["id"], "trip_date": str(DAY),
                                                                "miles": [{"jurisdiction": "TX", "miles": "5"}]})
    r = org.post(f"/ifta/returns/{LAST}/actions", {"action": "file", "version": r["version"], "reference": "TX-IFTA-1"}, 200).json()
    r = org.post(f"/ifta/returns/{LAST}/actions", {"action": "pay", "version": r["version"]}, 200).json()
    assert r["status"] == "paid" and r["filed_reference"] == "TX-IFTA-1"
    assert org.get("/ifta/returns").json()[0]["status"] == "paid"
    csv = org.get(f"/ifta/returns/{LAST}/export").text
    assert "Truck,Date,State,Miles" in csv and ",TX,1200.0,manual" in csv


def test_held_miles_and_missing_rates_stop_approval(org):
    s = seed(org)
    org.patch("/organization", {"state": "TX"}, 200)
    csv = (f"Truck,Date,State,Miles,Odometer start,Odometer end\n"
           f"{s['truck']['unit_number']},{DAY:%m/%d/%Y},TX,240,1000,1226\n"
           f"{s['truck']['unit_number']},{DAY:%m/%d/%Y},XT,90,,\n"
           f"{s['truck']['unit_number']},{DAY:%m/%d/%Y},OK,100,,\n").encode()
    imp = org.post("/imports", files={"file": ("miles.csv", csv)}, data={"kind": "mileage"}, expect=201).json()
    assert imp["covered"] and (imp["ready"], imp["look"], imp["cant"]) == (1, 1, 1)
    issues = {i["row"]: i for i in imp["issues"]}
    assert issues[2]["message"] == "Miles (240) don't match the odometer (226)" and issues[2]["actions"] == ["odometer", "miles"]
    assert issues[3]["message"] == "“XT” isn't a US state or Canadian province"
    org.put(f"/imports/{imp['id']}", {"mapping": {c["header"]: c["field"] for c in imp["columns"]},
                                      "decisions": {"2": "odometer"}}, 200)
    done = org.post(f"/imports/{imp['id']}/commit", {"hold": True}, 200).json()
    assert done["result"]["created"] == 2
    miles = org.get("/ifta/mileage", params={"quarter": LAST}).json()
    [row] = miles["rows"]
    assert row["miles"] == {"TX": "226.0", "OK": "100.0"} and row["held"] == 2 and row["sources"] == ["import"]
    assert [g["kind"] for g in miles["gaps"]] == ["held", "held"]
    r = org.post(f"/ifta/returns/{LAST}/actions", {"action": "review", "version": 0}, 200).json()
    org.error("POST", f"/ifta/returns/{LAST}/actions", 409, "HELD_MILES", json={"action": "approve", "version": r["version"]})
    for gap in miles["gaps"]:
        org.post(f"/ifta/trips/{gap['trip_id']}/release", expect=200)
    org.error("POST", f"/ifta/returns/{LAST}/actions", 409, "MISSING_RATES", json={"action": "approve", "version": r["version"]})


def test_purchases_are_checked_against_loads_and_the_tank(org):
    s = seed(org)
    org.patch(f"/vehicles/{s['truck']['id']}", {"fuel_capacity_gal": 200}, 200)
    big = fuel(org, s, "250", "950.00", "TX", on=TODAY)
    load = new_load(org, s["customer"]["id"], stops=[
        {"type": "pickup", "city": "Dallas", "state": "TX", "appt_start": (datetime.now(UTC) - timedelta(days=1)).isoformat()},
        {"type": "delivery", "city": "Tulsa", "state": "OK", "appt_start": (datetime.now(UTC) + timedelta(days=1)).isoformat()}])
    assign(org, load, s)
    ok = fuel(org, s, "100", "380.00", "TX", on=TODAY)
    found = org.get("/ifta/purchases").json()
    checks = {x["id"]: x for x in found["items"]}
    assert checks[big["id"]]["check"] == "Over tank capacity" and checks[big["id"]]["tone"] == "bad"
    assert checks[ok["id"]]["check"] == f"Matched · {load['load_number']}"
    assert found["flagged"] == 1 and len(org.get("/ifta/purchases", params={"show": "flagged"}).json()["items"]) == 1
    overview = org.get("/ifta/overview").json()
    assert overview["purchases"] == 2 and Decimal(overview["gallons"]) == Decimal("350")
    report = org.get("/ifta/report").json()
    assert len(report["weeks"]) == 8 and Decimal(report["weeks"][-1]["amount"]) == Decimal("1330.00")
    assert DATES
