"""Owners: people stored once, ownership shares that always add up, agreements, who drives, the owner portal."""
from datetime import UTC, datetime, timedelta

from tests.conftest import PASSWORD, deliver, login, new_load, seed, stops

TODAY = datetime.now(UTC).date()  # test companies run on UTC
DATES = {"insurance_expiry": "2035-01-01", "registration_expiry": "2035-01-01", "inspection_expiry": "2035-01-01"}
LEASE = {"kind": "owner_operator_lease", "owner_pct": "72", "fsc_pct": "100", "fuel_paid_by": "owner",
         "driver_pay_by": "owner_drives", "insurance_weekly": "70.00", "eld_weekly": "25.00"}


def truck(api, unit):
    return api.post("/vehicles", {"unit_number": unit, **DATES}, 201).json()


def trailer(api, unit):
    return api.post("/trailers", {"unit_number": unit, "type": "dry_van", **DATES}, 201).json()


def driver(api, first, last, **extra):
    return api.post("/drivers", {"first_name": first, "last_name": last, "cdl_expiry": "2035-01-01",
                                 "medical_cert_expiry": "2035-01-01", **extra}, 201).json()


def owner_operator(api, d, t, **extra):
    """The driver buys the truck: linked, not copied, and drives it on an owner-operator lease."""
    return api.post("/owners", {"entity_type": "individual", "person_id": d["person_id"], "status": "active",
                                "units": [{"vehicle_id": t["id"], "effective_from": str(TODAY), "agreement": LEASE,
                                           "who_drives": "owner"}], **extra}, 201).json()


def business(api, name="Ridgeway Hauling LLC", units=(), **extra):
    ein = f"{sum(map(ord, name)) * 7919 % 10**9:09d}"  # one EIN per business name
    return api.post("/owners", {"entity_type": "business", "legal_name": name, "business_type": "llc",
                                "ein": ein, "status": "active",
                                "contacts": [{"person": {"first_name": "Pat", "last_name": "Lowe",
                                                         "email": f"pat-{name[:4].lower()}@example.com"},
                                              "title": "Principal", "signs": True}],
                                "units": list(units), **extra}, 201).json()


def test_a_person_already_on_file_is_found_before_typing_them_in_again(org):
    d = driver(org, "Casey", "Lund", phone="(214) 555-0143", email="casey@example.com", cdl_number="L 1234 567")
    for params in ({"phone": "214.555.0143"}, {"email": "CASEY@example.com"}, {"cdl_number": "l1234567"}):
        found = org.get("/persons/matches", params=params).json()
        assert [m["person"]["id"] for m in found] == [d["person_id"]], params
        assert found[0]["person"]["roles"][0]["role"] == "driver"
    # Declared a different person: never offered again for that pair.
    other = driver(org, "Casey", "Lund-Ortiz")
    assert org.get("/persons/matches", params={"first_name": "Casey", "last_name": "Lund-Ortiz",
                                                 "exclude": d["person_id"]}).json()
    org.post(f"/persons/{d['person_id']}/distinctions", {"other_person_id": other["person_id"],
                                                         "reason": "Different date of birth"}, 204)
    assert org.get("/persons/matches", params={"first_name": "Casey", "last_name": "Lund-Ortiz",
                                                 "exclude": d["person_id"]}).json() == []
    actions = [e["action"] for e in org.items("/audit-logs")]
    assert "person.not_duplicate" in actions


def test_a_driver_who_buys_their_truck_becomes_an_owner_operator_without_a_second_record(org):
    d = driver(org, "Avery", "Novak", phone="312-555-0100")
    t = truck(org, "301")
    owner = owner_operator(org, d, t)
    assert owner["person"]["id"] == d["person_id"]
    assert owner["category"] == "owner_operator"
    [unit] = owner["units"]
    assert (unit["unit_number"], unit["share_pct"], unit["agreement_kind"]) == ("301", "100.00", "owner_operator_lease")
    assert unit["who_drives"] == "owner" and unit["driver"]["id"] == d["id"]
    # One person: the driver profile and the owner share the same record, and edits reach both.
    org.patch(f"/owners/{owner['id']}", {"person": {"first_name": "Avery", "last_name": "Novak-Reed"}}, 200)
    assert org.get(f"/drivers/{d['id']}").json()["full_name"] == "Avery Novak-Reed"
    assert org.get(f"/drivers/{d['id']}").json()["owner_id"] == owner["id"]
    assert org.get(f"/vehicles/{t['id']}").json()["ownership"] == "owner_operator"
    assert [o["name"] for o in org.get(f"/vehicles/{t['id']}").json()["owners"]] == ["Avery Novak-Reed"]
    # Linking the same person twice is refused.
    org.error("POST", "/owners", 409, "DUPLICATE_REFERENCE",
              json={"entity_type": "individual", "person_id": d["person_id"]})
    assert [x["id"] for x in org.items("/drivers", kind="owner_operators")] == [d["id"]]


def test_a_business_owner_with_its_own_driver_on_a_fleet_lease_is_non_operating(org):
    hired = driver(org, "Sam", "Bell")
    t, r = truck(org, "410"), trailer(org, "5410")
    owner = business(org, units=[
        {"vehicle_id": t["id"], "effective_from": str(TODAY), "who_drives": "owner_hire", "driver_id": hired["id"],
         "agreement": {"kind": "fleet_lease", "owner_pct": "72", "fsc_pct": "100", "driver_pay_by": "carrier_for_owner"}},
        {"trailer_id": r["id"], "effective_from": str(TODAY),
         "agreement": {"kind": "rental", "per_trailer_week": "425.00", "fuel_paid_by": "carrier"}}])
    assert owner["category"] == "non_operating" and owner["entity_type"] == "business"
    assert len(owner["ein_last4"]) == 4 and "ein" not in owner
    assert owner["contacts"][0]["title"] == "Principal" and owner["contacts"][0]["is_primary"]
    assert {u["unit_number"] for u in owner["units"]} == {"410", "5410"}
    d = org.get(f"/drivers/{hired['id']}").json()
    assert (d["employer_owner_id"], d["pay_by"]) == (owner["id"], "carrier_for_owner")
    assert [x["id"] for x in org.items("/drivers", kind="owners_drivers")] == [hired["id"]]
    summary = org.get("/owners/summary").json()
    assert (summary["businesses"], summary["owned_trucks"], summary["owned_trailers"]) == (1, 1, 1)
    assert [o["name"] for o in org.items("/owners", tab="non_operating")] == ["Ridgeway Hauling LLC"]
    assert org.items("/owners", tab="owner_operators") == []
    assert [o["name"] for o in org.items("/owners", q="pat lowe")] == ["Ridgeway Hauling LLC"]


def test_ownership_always_adds_up_to_100_percent_and_keeps_its_history(org):
    t = truck(org, "520")
    a = business(org, "First Equipment LLC", units=[
        {"vehicle_id": t["id"], "effective_from": str(TODAY - timedelta(days=30)), "share_pct": "60",
         "agreement": {"kind": "equipment_lease", "owner_pct": "30"}}])
    rows = org.get("/equipment/ownerships", params={"vehicle_id": t["id"]}).json()
    assert sorted(((r["owner_name"], r["share_pct"]) for r in rows), key=str) == [("First Equipment LLC", "60.00"),
                                                                                  (None, "40.00")]
    # 60% is taken: another owner can't be given 50%.
    org.error("POST", "/owners", 409, "SHARE_TAKEN", json={
        "entity_type": "business", "legal_name": "Second LLC", "contacts": [{"person": {"first_name": "Lee", "last_name": "Ng"}}],
        "units": [{"vehicle_id": t["id"], "effective_from": str(TODAY), "share_pct": "50",
                   "agreement": {"kind": "equipment_lease", "owner_pct": "30"}}]})
    b = business(org, "Second LLC")
    agreement_b = org.post(f"/owners/{b['id']}/agreements", {"kind": "equipment_lease", "owner_pct": "30"}, 201).json()
    agreement_a = a["agreements"][0]["id"]
    org.error("POST", "/equipment/ownership-transfers", 422, "VALIDATION_ERROR", json={
        "vehicle_id": t["id"], "effective_from": str(TODAY), "reason": "Partial sale",
        "rows": [{"owner_id": a["id"], "share_pct": "50", "agreement_id": agreement_a},
                 {"owner_id": b["id"], "share_pct": "40", "agreement_id": agreement_b["id"]}]})
    rows = org.post("/equipment/ownership-transfers", {
        "vehicle_id": t["id"], "effective_from": str(TODAY), "reason": "Partial sale",
        "rows": [{"owner_id": a["id"], "share_pct": "50", "agreement_id": agreement_a},
                 {"owner_id": b["id"], "share_pct": "50", "agreement_id": agreement_b["id"]}]}, 201).json()
    open_rows = [r for r in rows if r["effective_to"] is None]
    closed = [r for r in rows if r["effective_to"] is not None]
    assert sorted((r["owner_name"], r["share_pct"]) for r in open_rows) == [("First Equipment LLC", "50.00"), ("Second LLC", "50.00")]
    assert {r["effective_to"] for r in closed} == {str(TODAY - timedelta(days=1))}
    assert all(r["reason"] == "Partial sale" for r in open_rows)
    # Back to the carrier entirely: no rows needed, history stays.
    org.post("/equipment/ownership-transfers", {"vehicle_id": t["id"], "effective_from": str(TODAY + timedelta(days=5)),
                                                "reason": "Bought back", "rows": [{"share_pct": "100"}]}, 201)
    assert org.get(f"/vehicles/{t['id']}").json()["ownership"] == "owned"


def test_an_onboarding_owners_truck_cant_be_dispatched_until_the_checklist_is_green(org):
    s = seed(org)
    owner = org.post("/owners", {"entity_type": "individual", "person": {"first_name": "Morgan", "last_name": "Hale"},
                                 "units": [{"vehicle_id": s["truck"]["id"], "effective_from": str(TODAY),
                                            "agreement": LEASE}]}, 201).json()
    assert owner["status"] == "onboarding"
    assert {i["key"]: i["done"] for i in owner["checklist"]} == {"lease": False, "title": False, "w9": False,
                                                                 "insurance": False, "ach": False}
    assert not owner["units"][0]["dispatchable"]
    load = new_load(org, s["customer"]["id"])
    eligible = org.get("/dispatch/eligible-resources", params={"load_id": load["id"]}).json()
    unit = next(v for v in eligible["vehicles"] if v["id"] == s["truck"]["id"])
    assert not unit["eligible"] and unit["reasons"][0]["code"] == "OWNER_NOT_READY"
    body = org.error("POST", "/dispatch/assignments", 409, "ASSIGNMENT_CONFLICT", json={
        "load_id": load["id"], "driver_id": s["driver"]["id"], "vehicle_id": s["truck"]["id"],
        "trailer_id": s["trailer"]["id"], "version": load["version"]})
    assert "W-9" in body["message"] and "ACH authorization" in body["message"]
    org.patch(f"/owners/{owner['id']}", {"status": "active"}, 200)
    eligible = org.get("/dispatch/eligible-resources", params={"load_id": load["id"]}).json()
    assert next(v for v in eligible["vehicles"] if v["id"] == s["truck"]["id"])["eligible"]


def test_the_owner_portal_shows_only_what_its_permissions_allow_and_only_that_owners_units(org, client):
    d = driver(org, "Quinn", "Reyes")
    owner = owner_operator(org, d, truck(org, "640"))
    other = business(org, "Elsewhere LLC", units=[{"vehicle_id": truck(org, "641")["id"], "effective_from": str(TODAY),
                                                   "agreement": {"kind": "equipment_lease", "owner_pct": "30"}}])
    org.put(f"/owners/{owner['id']}/portal-permissions", {"enabled": True, "preset": "bookkeeper"}, 200)
    user = org.post(f"/owners/{owner['id']}/portal-users", {"email": "quinn.portal@example.com", "full_name": "Quinn Reyes",
                                                             "password": PASSWORD}, 201).json()
    assert user["signed_in"] is False
    portal = login(client, "quinn.portal@example.com", org.org_id)
    home = portal.get("/portal/owner").json()
    assert home["owner_name"] == "Quinn Reyes" and set(home["permissions"]) == {"statements", "fuel", "expenses",
                                                                                 "documents", "download"}
    portal.error("GET", "/portal/owner/equipment", 403, "FORBIDDEN")
    portal.get("/portal/owner/fuel")
    # Nothing else in the company is theirs.
    for url in ("/loads", "/drivers", "/owners", f"/owners/{other['id']}", "/vehicles"):
        portal.error("GET", url, 403, "FORBIDDEN")
    # Staff can't use the portal endpoints as themselves, only preview an owner explicitly.
    org.error("GET", "/portal/owner", 403, "FORBIDDEN")
    preview = org.get("/portal/owner", params={"owner_id": owner["id"]}).json()
    assert preview["preview"] is True
    # Monitor only: equipment yes, money no.
    org.put(f"/owners/{owner['id']}/portal-permissions", {"preset": "monitor"}, 200)
    units = portal.get("/portal/owner/equipment").json()
    assert [u["unit_number"] for u in units] == ["640"]
    assert units[0]["driver"] is None  # "View assigned drivers" is off in Monitor only
    activity = portal.get("/portal/owner/activity").json()
    assert activity["revenue"] == "0.00" and activity["costs"] == {}
    org.put(f"/owners/{owner['id']}/portal-permissions", {"enabled": False}, 200)
    portal.error("GET", "/portal/owner", 403, "FORBIDDEN")


def test_tax_ids_and_bank_details_are_shown_only_on_request_and_the_look_is_audited(org):
    owner = org.post("/owners", {"entity_type": "individual", "status": "active",
                                 "person": {"first_name": "Jordan", "last_name": "Avery", "tax_id": "123-45-6789"},
                                 "routing_number": "021000021", "account_number": "000123456789"}, 201).json()
    assert owner["tax_id_last4"] == "6789" and owner["account_last4"] == "6789" and owner["has_routing"]
    for leaked in ("123-45-6789", "123456789", "021000021", "000123456789"):
        assert leaked not in str(owner)
    dispatcher = org.add_user("dispatcher")
    dispatcher.error("POST", f"/owners/{owner['id']}/sensitive", 403, "FORBIDDEN")
    accountant = org.add_user("accountant")
    shown = accountant.post(f"/owners/{owner['id']}/sensitive", expect=200).json()
    assert (shown["tax_id"], shown["routing_number"], shown["account_number"]) == ("123456789", "021000021", "000123456789")
    assert "owner.sensitive_viewed" in [e["action"] for e in org.items("/audit-logs")]
    assert org.get("/persons/matches", params={"tax_id": "123 45 6789"}).json()[0]["person"]["last_name"] == "Avery"


def test_load_revenue_splits_by_the_agreement_and_costs_follow_who_pays(org):
    s = seed(org)
    owner = owner_operator(org, {"person_id": s["driver"]["person_id"], "id": s["driver"]["id"]}, s["truck"])
    day = datetime.now(UTC) - timedelta(hours=30)
    load = new_load(org, s["customer"]["id"], customer_rate="2500.00", miles=900,
                    stops=stops(day.isoformat(), (day + timedelta(hours=8)).isoformat()))
    org.post(f"/loads/{load['id']}/charges", {"type": "fuel_surcharge", "rate": "300.00"}, 201)
    org.post(f"/loads/{load['id']}/charges", {"type": "detention", "rate": "100.00"}, 201)
    deliver(org, org.get(f"/loads/{load['id']}").json(), s)
    org.post("/expenses", {"category": "fuel", "incurred_on": str(TODAY), "amount": "400.00", "gallons": "100",
                           "jurisdiction": "TX", "vehicle_id": s["truck"]["id"]}, 201)
    a = org.get(f"/owners/{owner['id']}/activity", params={"date_from": str(TODAY - timedelta(days=2)),
                                                            "date_to": str(TODAY)}).json()
    [row] = a["load_rows"]
    # 72% of the 2,500 line haul + 100% of the 300 fuel surcharge; detention stays with the carrier.
    assert (row["revenue"], row["owner_gross"], row["carrier_share"]) == ("2900.00", "2100.00", "800.00")
    assert a["costs"]["fuel"] == "400.00"  # the owner pays fuel under this lease
    # The truck became the owner's today: one day of the 70 and 25 weekly chargebacks.
    assert a["costs"]["insurance"] == "10.00" and a["costs"]["eld"] == "3.57"
    assert a["net"] == "1686.43"
    fuel = org.get(f"/owners/{owner['id']}/fuel").json()
    assert [(x["payer"], x["on_settlement"]) for x in fuel["fuel"]] == [("owner", True)]


def test_owners_stay_inside_their_company(org, make_org):
    owner = business(org)
    other = make_org("Other Carrier")
    other.error("GET", f"/owners/{owner['id']}", 404, "NOT_FOUND")
    assert other.items("/owners") == []
