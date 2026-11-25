"""Your companies: open to every signed-in person, with the rules enforced by the API."""
import json
import re
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.core import fmcsa, mail
from tests.conftest import Api, login, new_load, seed


def mc() -> str:
    return str(uuid.uuid4().int)[:6]


def create(api: Api, name: str = "Second Carrier LLC", expect: int = 201, **extra):
    body = {"name": name, "mc_number": mc(), "home_state": "TX", "fleet_size": "6-20", "color": "#0E9F6E", **extra}
    return api.post("/me/companies", body, expect)


def actions(owner_sql, org_id: str) -> list[str]:
    with owner_sql.begin() as c:
        c.execute(text("SELECT set_config('app.org_id', :o, true)"), {"o": org_id})
        return [r.action for r in c.execute(text("SELECT action FROM audit_logs ORDER BY created_at"))]


@pytest.mark.parametrize("role", ["dispatcher", "accountant", "viewer"])
def test_every_role_sees_its_own_companies(org, role):
    member = org.add_user(role)
    mine = member.get("/me/companies").json()
    assert mine["limit"] == 10 and mine["used"] == 1 and mine["invitations"] == []
    company = mine["companies"][0]
    assert company["id"] == org.org_id and company["role"] == role and not company["is_main_admin"]
    assert company["people"] == 2 and company["drivers"] == 0 and company["last_opened_at"]


def test_adding_a_company_makes_you_its_main_admin(org, owner_sql):
    member = org.add_user("dispatcher")                     # any role can add a company of their own
    made = create(member, invite_emails=["teammate@example.com", member.email]).json()
    company = made["company"]
    assert company["role"] == "owner" and company["is_main_admin"] and company["sole_main_admin"]
    assert company["code"] == "SC" and company["color"] == "#0E9F6E" and company["home_state"] == "TX"
    assert made["invited"] == 1                              # not yourself
    assert member.get("/me/companies").json()["used"] == 2
    assert actions(owner_sql, company["id"])[:2] == ["organization.created", "invitation.created"]
    newest = max((json.loads(p.read_text()) for p in mail.outbox().glob("*.json")), key=lambda m: m["at"])
    assert newest["to"] == "teammate@example.com" and re.search(r"code [A-Z2-9]{8}", newest["body"])
    # it starts empty, and on its own
    there = member.switch(company["id"])
    assert there.items("/drivers") == [] and there.items("/customers") == []


def test_company_details_are_checked(org):
    for field, bad in [("name", "AB"), ("mc_number", "12"), ("home_state", "ZZ"), ("fleet_size", "100+"),
                       ("color", "#123456"), ("dot_number", "123456789")]:
        body = create(org, expect=422, **{field: bad}).json()["error"]
        assert field in body["field_errors"], (field, body)


def test_an_mc_number_belongs_to_one_company(org):
    taken = mc()
    create(org, "First With It", mc_number=f"MC-{taken}")
    body = create(org, "Second With It", expect=409, mc_number=taken).json()["error"]
    assert body["code"] == "MC_TAKEN" and "Ask its Main Admin to invite you" in body["message"]
    check = org.post("/me/companies/mc-check", {"mc_number": taken}, 200).json()
    assert check["status"] == "taken"
    # Organization settings can't take it either
    org.error("PATCH", "/organization", 409, "MC_TAKEN", json={"mc_number": f"MC {taken}"})


def test_fmcsa_decides_when_it_is_set_up(org, monkeypatch):
    assert org.post("/me/companies/mc-check", {"mc_number": mc()}, 200).json()["status"] == "unchecked"
    monkeypatch.setattr(fmcsa, "lookup", lambda number: fmcsa.Carrier("authorized", "REAL CARRIER LLC", "1234567", "TX"))
    check = org.post("/me/companies/mc-check", {"mc_number": mc()}, 200).json()
    assert check["message"] == "Verified with FMCSA · authorized for hire" and check["legal_name"] == "REAL CARRIER LLC"
    monkeypatch.setattr(fmcsa, "lookup", lambda number: fmcsa.Carrier("not_authorized"))
    assert "not authorized" in create(org, expect=422).json()["error"]["field_errors"]["mc_number"]


def test_ten_companies_at_most(org):
    for i in range(9):
        create(org, f"Carrier Number {i}")
    body = create(org, "One Too Many", expect=409).json()["error"]
    assert body["code"] == "COMPANY_LIMIT_REACHED" and body["details"] == {"limit": 10, "used": 10}


def test_joining_with_a_code(client, org, make_org, owner_sql):
    other = make_org("Other Outfit")
    link = org.post("/invitations", {"email": other.email, "full_name": "Ollie", "role": "dispatcher"}, 201).json()
    code = link["code"]
    assert re.fullmatch(r"[A-Z2-9]{8}", code)
    preview = other.get(f"/me/invitations/code/{code.lower()}").json()
    assert preview["invitation"]["company_name"] == "Acme Trucking" and preview["invitation"]["role_label"] == "Dispatcher"
    assert preview["invitation"]["invited_by_name"] == "Olive Owner" and preview["already_member"] is False
    joined = other.post("/me/invitations/join", {"code": code}, 200).json()
    assert joined["id"] == org.org_id and joined["role"] == "dispatcher"
    other.error("POST", "/me/invitations/join", 404, "INVITATION_CODE_INVALID", json={"code": code})   # used up
    other.error("GET", "/me/invitations/code/ABCDEFGH", 404, "INVITATION_CODE_INVALID")
    assert "invitation.accepted" in actions(owner_sql, org.org_id)

    # a code stops working after 7 days
    late = make_org("Late Joiner Co")
    code = org.post("/invitations", {"email": late.email, "full_name": "Lee", "role": "viewer"}, 201).json()["code"]
    with owner_sql.begin() as c:
        c.execute(text("SELECT set_config('app.org_id', :o, true)"), {"o": org.org_id})
        c.execute(text("UPDATE invitations SET expires_at = :t WHERE email = :e"),
                  {"t": datetime.now(UTC) - timedelta(minutes=1), "e": late.email})
    late.error("GET", f"/me/invitations/code/{code}", 404, "INVITATION_CODE_INVALID")


def test_invitations_to_your_email_wait_for_you(org, make_org, owner_sql):
    other = make_org("Elsewhere Freight")
    invite = org.post("/invitations", {"email": other.email, "full_name": "Ollie", "role": "accountant"}, 201).json()
    waiting = other.get("/me/companies").json()["invitations"]
    assert [w["company_name"] for w in waiting] == ["Acme Trucking"] and waiting[0]["role_label"] == "Accounting"
    other.post(f"/me/invitations/{invite['invitation']['id']}/decline", None, 204)
    assert other.get("/me/companies").json()["invitations"] == []
    assert "invitation.declined" in actions(owner_sql, org.org_id)

    again = org.post("/invitations", {"email": other.email, "full_name": "Ollie", "role": "accountant"}, 201).json()
    accepted = other.post(f"/me/invitations/{again['invitation']['id']}/accept", None, 200).json()
    assert accepted["role"] == "accountant"
    assert {c["name"] for c in other.get("/me/companies").json()["companies"]} == {"Acme Trucking", "Elsewhere Freight"}
    # someone else's invitation can't be accepted from your list
    third = make_org("Third Party")
    third.error("POST", f"/me/invitations/{again['invitation']['id']}/accept", 404, "NOT_FOUND")


def test_the_default_company_opens_first(client, org):
    second = create(org).json()["company"]
    mine = org.post(f"/me/companies/{second['id']}/default", None, 200).json()
    assert mine["default_company_id"] == second["id"]
    assert login(client, org.email).org_id == second["id"]


def test_archiving_is_blocked_while_work_is_open(org, owner_sql):
    create(org)
    s = seed(org)
    load = new_load(org, s["customer"]["id"])
    with owner_sql.begin() as c:
        c.execute(text("SELECT set_config('app.org_id', :o, true)"), {"o": org.org_id})
        c.execute(text("UPDATE loads SET status = 'in_transit' WHERE id = :l"), {"l": load["id"]})
    check = org.get(f"/me/companies/{org.org_id}/archive-check").json()
    assert [b["message"] for b in check["blockers"]] == ["1 load is in transit: deliver or move it first"]
    org.error("POST", f"/me/companies/{org.org_id}/archive", 409, "ARCHIVE_BLOCKED", json={"confirm_name": "Acme Trucking"})
    with owner_sql.begin() as c:
        c.execute(text("SELECT set_config('app.org_id', :o, true)"), {"o": org.org_id})
        c.execute(text("UPDATE loads SET status = 'delivered' WHERE id = :l"), {"l": load["id"]})
    org.error("POST", f"/me/companies/{org.org_id}/archive", 422, "VALIDATION_ERROR", json={"confirm_name": "Acme"})


def test_archiving_ends_access_for_everyone_but_main_admins(org, owner_sql):
    second = create(org).json()["company"]
    dispatcher = org.add_user("dispatcher")
    org.post(f"/me/companies/{org.org_id}/default", None, 200)
    mine = org.post(f"/me/companies/{org.org_id}/archive", {"confirm_name": "acme  trucking"}, 200).json()
    archived = next(c for c in mine["companies"] if c["id"] == org.org_id)
    assert archived["status"] == "archived" and archived["restorable_until"]
    assert mine["used"] == 2 and mine["default_company_id"] == second["id"]       # still counts; default moved
    dispatcher.error("GET", "/auth/me", 401, "UNAUTHENTICATED")
    assert "organization.archived" in actions(owner_sql, org.org_id)
    org.post(f"/me/companies/{org.org_id}/restore", None, 200)
    assert dispatcher.get("/me/companies").json()["companies"][0]["status"] == "active"


def test_leaving_a_company(org, make_org, owner_sql):
    org.error("POST", f"/me/companies/{org.org_id}/leave", 409, "SOLE_MAIN_ADMIN")
    other = make_org("Home Base Co")
    code = org.post("/invitations", {"email": other.email, "full_name": "Ollie", "role": "dispatcher"}, 201).json()["code"]
    other.post("/me/invitations/join", {"code": code}, 200)
    there = other.switch(org.org_id)
    there.put("/preferences/start_page", {"value": "loads"}, 204)
    mine = other.post(f"/me/companies/{org.org_id}/leave", None, 200).json()
    assert [c["name"] for c in mine["companies"]] == ["Home Base Co"]
    there.error("GET", "/auth/me", 401, "UNAUTHENTICATED")
    assert "member.left" in actions(owner_sql, org.org_id)
    with owner_sql.begin() as c:
        c.execute(text("SELECT set_config('app.org_id', :o, true)"), {"o": org.org_id})
        assert c.execute(text("SELECT count(*) FROM user_preferences WHERE key = 'start_page'")).scalar() == 0
    other.error("POST", f"/me/companies/{other.org_id}/leave", 409, "SOLE_MAIN_ADMIN")

    # A Main Admin can invite them back, and they rejoin with the new role.
    code = org.post("/invitations", {"email": other.email, "full_name": "Ollie", "role": "viewer"}, 201).json()["code"]
    assert other.post("/me/invitations/join", {"code": code}, 200).json()["role"] == "viewer"
