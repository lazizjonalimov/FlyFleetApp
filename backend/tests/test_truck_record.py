"""The truck record: a week of money on one unit whoever owns it, and who has driven it."""
from datetime import UTC, datetime, timedelta

from tests.conftest import seed
from tests.test_owner_settlements import delivered_on
from tests.test_owners import LEASE, driver

TODAY = datetime.now(UTC).date()
WEEK = {"date_from": str(TODAY - timedelta(days=6)), "date_to": str(TODAY)}


def test_a_company_truck_keeps_all_its_revenue_and_shows_the_drivers_pay(org):
    s = seed(org)
    org.patch(f"/drivers/{s['driver']['id']}", {"pay_type": "per_mile", "pay_rate": "0.50"}, 200)
    delivered_on(org, s, rate="2000.00", miles=800)
    week = org.get(f"/vehicles/{s['truck']['id']}/money", params=WEEK).json()
    assert (week["loads"], week["miles"], week["revenue"], week["carrier_share"]) == (1, 800, "2000.00", "2000.00")
    assert week["owner_gross"] is None and week["owners"] == [] and week["driver_pay"] == "400.00"
    assert week["driver_pay_by"] == "carrier"


def test_an_owner_operators_truck_splits_the_week_and_marks_the_owner_as_its_driver(org):
    s = seed(org)
    org.post("/owners", {"entity_type": "individual", "person_id": s["driver"]["person_id"], "status": "active",
                         "units": [{"vehicle_id": s["truck"]["id"], "effective_from": str(TODAY - timedelta(days=30)),
                                    "agreement": LEASE, "who_drives": "owner"}]}, 201)
    delivered_on(org, s, rate="2500.00", fsc="300.00")
    week = org.get(f"/vehicles/{s['truck']['id']}/money", params=WEEK).json()
    assert (week["revenue"], week["owner_gross"], week["carrier_share"]) == ("2800.00", "2100.00", "700.00")
    assert week["owners"] == ["Dana Driver"] and week["driver_pay_by"] == "owner_drives"
    assert week["owner_costs"] == "95.00" and week["net"] == "2005.00"  # a week of insurance and ELD
    [seat] = org.get(f"/vehicles/{s['truck']['id']}/seats").json()
    assert seat["driver"]["employer"] == "self"
    # A company driver seated later is the carrier's, and the owner's seat stays in the history.
    other = driver(org, "Sam", "Whit")
    org.put(f"/vehicles/{s['truck']['id']}/seat", {"driver_id": other["id"], "effective_from": str(TODAY + timedelta(days=1))}, 200)
    now, before = org.get(f"/vehicles/{s['truck']['id']}/seats").json()
    assert now["driver"]["name"] == "Sam Whit" and now["driver"]["employer"] == "carrier" and now["effective_to"] is None
    assert before["driver"]["employer"] == "self" and before["effective_to"] == str(TODAY)


def test_money_on_a_unit_needs_the_rates_permission_and_a_sane_period(org):
    s = seed(org)
    org.error("GET", f"/vehicles/{s['truck']['id']}/money", 422, "VALIDATION_ERROR",
              params={"date_from": WEEK["date_to"], "date_to": WEEK["date_from"]})
    week = org.get(f"/trailers/{s['trailer']['id']}/money", params=WEEK).json()
    assert week["revenue"] == "0.00" and week["driver_pay"] is not None
    # Without rates there is no money on a unit; rates without statements show the money but not driver pay.
    org.add_user("safety_manager").error("GET", f"/vehicles/{s['truck']['id']}/money", 403, "FORBIDDEN", params=WEEK)
    dispatcher = org.add_user("dispatcher")
    dispatcher.error("GET", f"/vehicles/{s['truck']['id']}/money", 403, "FORBIDDEN", params=WEEK)
    org.post("/permission-overrides", {"user_id": dispatcher.user_id, "permission": "loads.rates.read", "effect": "allow"}, 201)
    assert dispatcher.get(f"/vehicles/{s['truck']['id']}/money", params=WEEK).json()["driver_pay"] is None
