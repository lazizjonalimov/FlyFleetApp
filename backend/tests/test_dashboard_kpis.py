"""The dashboard's figures: each one is the count of the list it opens, with comparisons and seven points."""
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import text

from app.modules.reports.kpis import buckets
from tests.conftest import Api, new_load, seed, stops


def at(hours: float) -> str:
    return (datetime.now(UTC) + timedelta(hours=hours)).isoformat()


def list_count(api: Api, target: dict) -> int:
    return api.get(f"/{target['resource']}", params={**target["params"], "limit": 1, "count": "true"}).json()["page"]["total_count"]


def test_periods_are_days_weeks_and_calendar_months():
    wednesday = date(2026, 11, 25)
    assert buckets(wednesday, "today")[-1] == (wednesday, wednesday) and len(buckets(wednesday, "today")) == 7
    assert buckets(wednesday, "week")[-1] == (date(2026, 11, 23), date(2026, 11, 29))
    assert buckets(wednesday, "month")[0] == (date(2026, 5, 1), date(2026, 5, 31))
    assert buckets(wednesday, "month")[-1] == (date(2026, 11, 1), date(2026, 11, 30))


@pytest.mark.parametrize("period", ["today", "week", "month"])
def test_every_figure_is_the_count_of_the_list_it_opens(org, period):
    s = seed(org)
    new_load(org, s["customer"]["id"], stops=stops(at(1), at(3)))          # picks up within 24 h, no driver
    new_load(org, s["customer"]["id"], stops=stops(at(-30), at(-26)))      # already late
    out = org.get("/dashboard/kpis", params={"period": period}).json()
    assert out["period"] == period and len(out["kpis"]) == 6
    assert [k["key"] for k in out["kpis"]] == ["unassigned", "late_or_at_risk", "deliveries", "drivers_available",
                                               "trucks_unavailable", "overdue_invoices"]
    for kpi in out["kpis"]:
        assert kpi["value"] == list_count(org, kpi["target"]), kpi["key"]
        assert len(kpi["series"]) == 7 and kpi["series"][-1] == kpi["value"]
        assert kpi["definition"].startswith(kpi["label"].split(" · ")[0])
    unassigned = out["kpis"][0]
    if period == "today":
        assert unassigned["label"] == "Unassigned loads" and unassigned["value"] == 2
        assert out["kpis"][1]["value"] >= 1
    else:
        assert unassigned["label"] == f"Unassigned this {period}"
    drivers = out["kpis"][3]
    assert drivers["total"] == 1 and drivers["value"] == 1


def test_comparisons_say_what_they_compare_with(org, owner_sql):
    s = seed(org)
    new_load(org, s["customer"]["id"], stops=stops(at(1), at(3)))
    first = org.get("/dashboard/kpis").json()["kpis"][0]
    assert first["change"] == {"delta": None, "tone": "neutral", "text": "No figure for yesterday yet"}
    with owner_sql.begin() as c:       # yesterday, there were three
        c.execute(text("SELECT set_config('app.org_id', :o, true)"), {"o": org.org_id})
        c.execute(text("INSERT INTO dashboard_snapshots (organization_id, scope_key, kpi, day, value) "
                       "VALUES (:o, 'company', 'unassigned', :d, 3)"),
                  {"o": org.org_id, "d": (datetime.now(UTC) - timedelta(days=1)).date()})
    again = org.get("/dashboard/kpis").json()["kpis"][0]
    assert again["series"][-2] == 3 and again["change"]["delta"] == again["value"] - 3
    assert again["change"]["tone"] == "good" and again["change"]["text"].startswith("▼")
    week = org.get("/dashboard/kpis", params={"period": "week"}).json()
    assert week["since"] == "last week"


def test_billing_roles_get_the_billing_figures(org):
    accountant = org.add_user("accountant")
    keys = [k["key"] for k in accountant.get("/dashboard/kpis").json()["kpis"]]
    assert "unassigned" not in keys and keys[0] == "ready_to_invoice" and "overdue_invoices" in keys
    for kpi in accountant.get("/dashboard/kpis", params={"period": "month"}).json()["kpis"]:
        assert kpi["value"] == list_count(accountant, kpi["target"]), kpi["key"]


def test_todays_schedule_is_for_those_who_dispatch(org):
    s = seed(org)
    load = new_load(org, s["customer"]["id"], stops=stops(at(0.5), at(1)))
    schedule = org.get("/dashboard/schedule").json()
    mine = [x for x in schedule["stops"] if x["load_id"] == load["id"]]
    if mine:   # (unless the test runs within the hour before midnight)
        assert mine[0]["kind"] == "pickup" and mine[0]["state"] == "no_driver" and mine[0]["place"] == "Chicago, IL"
        assert schedule["no_driver"] >= 1 and schedule["to_go"] >= schedule["no_driver"]
    org.add_user("accountant").error("GET", "/dashboard/schedule", 403, "FORBIDDEN")


def test_all_companies_get_each_companys_figures(org):
    org.post("/me/companies", {"name": "Second Carrier LLC", "mc_number": "7" + str(datetime.now().microsecond).zfill(6)[:5],
                               "home_state": "TX", "fleet_size": "1-5", "color": "#0E9F6E"}, 201)
    every = org.get("/all/dashboard/kpis").json()
    assert sorted(c["organization"]["name"] for c in every["by_company"]) == ["Acme Trucking", "Second Carrier LLC"]
    assert all(len(c["data"]["kpis"]) == 6 for c in every["by_company"])
