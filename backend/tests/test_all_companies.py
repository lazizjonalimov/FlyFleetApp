"""Working in all companies at once: reads merge only the companies a person can open, writes name one."""
from tests.conftest import new_load, seed
from tests.test_companies import add_company


def two_companies(org):
    first = seed(org)
    new_load(org, first["customer"]["id"])
    created = add_company(org, "Bravo Logistics").json()
    second = org.switch(created["id"])
    other = seed(second)
    new_load(second, other["customer"]["id"])
    new_load(second, other["customer"]["id"])
    return second, created


def test_company_header_selects_the_company_and_non_members_get_404(org, make_org):
    second, created = two_companies(org)
    assert len(org.items("/loads", )) == 1
    in_second = org.get("/loads", headers={"X-Company": created["id"]}).json()["items"]
    assert len(in_second) == 2
    by_slug = org.get("/loads", headers={"X-Company": created["slug"]}).json()["items"]
    assert len(by_slug) == 2
    stranger = make_org("Elsewhere")
    org.get("/loads", expect=404, headers={"X-Company": stranger.get("/auth/me").json()["organization"]["slug"]})


def test_all_companies_lists_every_company_with_its_mark(org):
    _, created = two_companies(org)
    page = org.get("/all/loads").json()
    assert len(page["items"]) == 3
    assert {i["organization"]["name"] for i in page["items"]} == {"Acme Trucking", "Bravo Logistics"}
    assert all({"id", "code", "name", "color"} <= set(i["organization"]) for i in page["items"])
    only = org.get("/all/loads", params={"organization_id": created["id"]}).json()["items"]
    assert len(only) == 2
    counted = org.get("/all/loads", params={"count": "true"}).json()
    assert counted["page"]["total_count"] == 3
    assert sorted(b["count"] for b in counted["by_company"]) == [1, 2]


def test_all_companies_pages_through_the_merged_list(org):
    two_companies(org)
    first = org.get("/all/loads", params={"limit": 2}).json()
    assert len(first["items"]) == 2 and first["page"]["has_more"]
    rest = org.get("/all/loads", params={"limit": 2, "cursor": first["page"]["next_cursor"]}).json()
    assert len(rest["items"]) == 1 and not rest["page"]["has_more"]


def test_a_create_in_all_names_its_company(org):
    second, created = two_companies(org)
    s = seed(org)  # a second customer record in the first company
    org.error("POST", "/all/customers", 422, "COMPANY_REQUIRED", json={"name": "No Company Ltd"})
    made = org.post("/all/customers", {"name": "Chosen Ltd", "organization_id": created["id"]}, 201).json()
    second.get(f"/customers/{made['id']}", expect=200)
    org.get(f"/customers/{made['id']}", expect=404)
    assert s["customer"]["id"] != made["id"]


def test_a_load_cannot_use_another_companys_driver(org):
    second, _ = two_companies(org)
    foreign = seed(second)
    load = new_load(org, seed(org)["customer"]["id"])
    r = org.post("/dispatch/assignments", {"load_id": load["id"], "driver_id": foreign["driver"]["id"],
                                           "vehicle_id": foreign["truck"]["id"], "version": load["version"]})
    assert r.status_code in (404, 422), r.text


def test_each_companys_role_applies_in_all(org):
    second, created = two_companies(org)
    # A dispatcher in the first company only: the second company is not theirs to open.
    dispatcher = org.add_user("dispatcher")
    listing = dispatcher.get("/all/loads").json()
    assert {i["organization"]["name"] for i in listing["items"]} <= {"Acme Trucking"}
    assert dispatcher.get("/auth/me").json()["all_companies"] is False


def test_per_company_areas_are_not_combined(org):
    two_companies(org)
    org.get("/all/audit-logs", expect=404)
    org.get("/all/roles", expect=404)


def test_switch_remembers_all(org):
    two_companies(org)
    org.post("/auth/switch", {"scope": "all"}, 200)
    me = org.get("/auth/me").json()
    assert me["all_companies"] is True and me["last_scope"] == "all"
    org.post("/auth/switch", {"organization_id": org.org_id}, 200)
    assert org.get("/auth/me").json()["last_scope"] == "company"


def test_code_and_colour_are_set_per_company_and_unique(org):
    second, created = two_companies(org)
    org.patch("/organization", {"code": "ACM", "color": "#0E9F6E"}, 200)
    me = org.get("/auth/me").json()["organization"]
    assert me["code"] == "ACM" and me["color"] == "#0E9F6E"
    second.error("PATCH", "/organization", 409, "CODE_TAKEN", json={"code": "acm"})
