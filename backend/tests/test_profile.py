"""Profile & preferences and your sessions: personal, so open to every signed-in role."""
import pytest

from tests.conftest import Api, login


@pytest.mark.parametrize("role", ["dispatcher", "accountant", "viewer", "safety_manager"])
def test_any_role_edits_its_own_profile_and_preferences(org, role):
    member = org.add_user(role)
    me = member.patch("/auth/me", {"phone": " +1 312 555 0142 ", "timezone": "America/Chicago"}, 200).json()
    assert me["phone"] == "+1 312 555 0142" and me["timezone"] == "America/Chicago"
    assert member.get("/auth/me").json()["user"]["timezone"] == "America/Chicago"
    # only the fields sent change; an empty value clears
    me = member.patch("/auth/me", {"timezone": ""}, 200).json()
    assert me["timezone"] is None and me["phone"] == "+1 312 555 0142"
    # personal preferences (start page, notification channels) are theirs to keep
    member.put("/preferences/notifications.channels", {"value": {"loads_late": ["in_app", "email"]}}, 204)
    member.put("/preferences/start_page", {"value": "loads"}, 204)
    assert member.get("/preferences").json()["start_page"] == "loads"
    assert member.get("/auth/sessions").json()[0]["current"] is True


def test_profile_validation(org):
    org.error("PATCH", "/auth/me", 422, "VALIDATION_ERROR", json={"phone": "call me"})
    org.error("PATCH", "/auth/me", 422, "VALIDATION_ERROR", json={"timezone": "Mars/Olympus"})


def test_each_sign_in_is_a_session_that_can_be_signed_out_on_its_own(client, org):
    laptop = org
    phone = login(client, org.email)
    tablet = login(client, org.email)
    sessions = laptop.get("/auth/sessions").json()
    assert len(sessions) == 3 and sessions[0]["current"] and not any(s["current"] for s in sessions[1:])

    # one other device is signed out; the others carry on
    phone_id = next(s["id"] for s in phone.get("/auth/sessions").json() if s["current"])
    laptop.delete(f"/auth/sessions/{phone_id}", 204)
    assert phone.error("GET", "/auth/me", 401, "UNAUTHENTICATED")
    tablet.get("/auth/me")
    assert len(laptop.get("/auth/sessions").json()) == 2

    # this device signs out with Sign out, not from the list; nobody else's sessions can be touched
    mine = next(s["id"] for s in laptop.get("/auth/sessions").json() if s["current"])
    laptop.error("DELETE", f"/auth/sessions/{mine}", 422, "CURRENT_SESSION")
    other = org.add_user("viewer")
    other.error("DELETE", f"/auth/sessions/{mine}", 404, "NOT_FOUND")


def test_signing_out_of_all_other_sessions_keeps_this_one(client, org):
    phone = login(client, org.email)
    session = org.post("/auth/sessions/sign-out-others", None, 200).json()
    phone.error("GET", "/auth/me", 401, "UNAUTHENTICATED")
    org.error("GET", "/auth/me", 401, "UNAUTHENTICATED")          # the old token is retired too
    here = Api(client, session["access_token"], org.org_id, org.email)
    assert [s["current"] for s in here.get("/auth/sessions").json()] == [True]


def test_sign_out_ends_the_token_at_once(client, org):
    device = login(client, org.email)
    device.post("/auth/logout", None, 204)
    device.error("GET", "/auth/me", 401, "UNAUTHENTICATED")
    org.get("/auth/me")
