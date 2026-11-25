"""Security & privacy: open to every role, with the rules enforced by the API."""
import json
import re
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.core import mail, totp
from tests.conftest import PASSWORD, Api, login

STRONG = "Fresh-Password-2031"


def code_for(api: Api) -> str:
    """Set up the authenticator for this person and return its secret, as their phone would hold it."""
    setup = api.post("/auth/security/authenticator", None, 200).json()
    assert setup["qr_svg"].startswith("<svg") and setup["otpauth_uri"].startswith("otpauth://totp/")
    return setup["setup_key"].replace(" ", "")


def turn_on(api: Api) -> tuple[str, list[str]]:
    secret = code_for(api)
    done = api.post("/auth/security/authenticator/verify", {"code": totp.now_code(secret)}, 200).json()
    assert done["state"]["two_factor"]["enabled"] is True
    return secret, done["backup_codes"]


def audit_actions(api: Api) -> list[str]:
    return [entry["action"] for entry in api.items("/audit-logs", limit=100)]


@pytest.mark.parametrize("role", ["dispatcher", "accountant", "viewer"])
def test_every_role_opens_its_own_security_page(org, role):
    member = org.add_user(role)
    state = member.get("/auth/security").json()
    assert state["email"] == member.email and state["two_factor"]["required"] is False
    assert state["active_sessions"] == 1 and state["two_factor"]["remember_days"] == 30
    assert member.get("/auth/security/activity").json()[0]["kind"] == "signed_in"


def test_password_change_needs_the_current_password_and_meets_the_rules(org):
    org.error("POST", "/auth/password", 403, "WRONG_PASSWORD", json={"current_password": "nope", "new_password": STRONG})
    for weak, problem in [("Short-1", "12 characters"), ("alllowercase-2031", "upper and lower"),
                          ("No-Numbers-Here", "number")]:
        body = org.error("POST", "/auth/password", 422, "VALIDATION_ERROR",
                         json={"current_password": PASSWORD, "new_password": weak})
        assert problem in body["field_errors"]["new_password"]
    org.post("/auth/password", {"current_password": PASSWORD, "new_password": STRONG}, 200)
    state = Api(org.c, login(org.c, org.email, password=STRONG).token, org.org_id).get("/auth/security").json()
    assert state["password"]["strength"] == "Strong" and state["password"]["changed_at"]


def test_two_step_verification_at_sign_in(client, org):
    member = org.add_user("dispatcher")
    secret, codes = turn_on(member)
    assert len(codes) == 10 and member.get("/auth/security").json()["two_factor"]["backup_codes_unused"] == 10

    body = {"email": member.email, "password": PASSWORD}
    first = client.post("/api/v1/auth/login", json=body).json()
    assert first["requires_second_step"] is True and first["access_token"] is None
    r = client.post("/api/v1/auth/login", json={**body, "code": "000000"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "SECOND_STEP_INVALID"
    ok = client.post("/api/v1/auth/login", json={**body, "code": totp.now_code(secret), "remember": True}).json()
    assert ok["access_token"] and ok["trusted_device"]
    # a remembered device isn't asked again
    again = client.post("/api/v1/auth/login", json=body, headers={"X-Trusted-Device": ok["trusted_device"]}).json()
    assert again["access_token"]
    # a backup code works once
    assert client.post("/api/v1/auth/login", json={**body, "code": codes[0]}).json()["access_token"]
    assert client.post("/api/v1/auth/login", json={**body, "code": codes[0]}).status_code == 401
    kinds = [e["kind"] for e in member.get("/auth/security/activity").json()]
    assert "failed_second_step" in kinds and "signed_in" in kinds


def test_main_admin_must_keep_two_step_verification(org):
    state = org.get("/auth/security").json()
    assert state["two_factor"]["required"] is True and state["two_factor"]["remember_days"] == 7
    turn_on(org)
    org.error("DELETE", "/auth/security/authenticator", 409, "TWO_FACTOR_REQUIRED")
    assert org.get("/auth/security").json()["two_factor"]["enabled"] is True


def test_others_can_turn_it_off_and_methods_are_audited(org):
    member = org.add_user("dispatcher")
    turn_on(member)
    off = member.delete("/auth/security/authenticator", 200).json()
    assert off["two_factor"]["enabled"] is False and off["two_factor"]["backup_codes_total"] == 0
    actions = audit_actions(org)
    assert "user.two_factor_method_added" in actions and "user.two_factor_method_removed" in actions


def test_backup_codes_are_shown_once_and_regenerating_ends_the_old_set(client, org, sql):
    member = org.add_user("viewer")
    _, old = turn_on(member)
    new = member.post("/auth/security/backup-codes", None, 200).json()["codes"]
    assert set(new).isdisjoint(old) and len(new) == 10
    body = {"email": member.email, "password": PASSWORD}
    assert client.post("/api/v1/auth/login", json={**body, "code": old[1]}).status_code == 401
    assert client.post("/api/v1/auth/login", json={**body, "code": new[1]}).json()["access_token"]
    with sql.connect() as c:   # only hashes are stored
        c.execute(text("SELECT set_config('app.user_id', :u, false)"), {"u": member.get("/auth/me").json()["user"]["id"]})
        stored = c.execute(text("SELECT code_hash FROM user_backup_codes")).scalars().all()
    assert len(stored) == 10 and not set(stored) & set(new)
    assert "user.backup_codes_regenerated" in audit_actions(org)


def _last_link(email: str) -> str:
    """The reset link in the newest email to this person, read from the outbox the mail adapter writes."""
    messages = [json.loads(path.read_text()) for path in mail.outbox().glob("*.json")]
    newest = max((m for m in messages if m["to"] == email and "/reset/" in m["body"]), key=lambda m: m["at"])
    return re.search(r"/reset/(\S+)", newest["body"]).group(1)


def test_a_reset_link_works_once_for_thirty_minutes(client, org, owner_sql):
    member = org.add_user("accountant")
    sent = member.post("/auth/password-reset", None, 200).json()
    assert sent == {"email": member.email, "expires_minutes": 30}
    token = _last_link(member.email)
    assert client.get(f"/api/v1/auth/password-reset/{token}").json() == {"state": "open"}
    weak = client.post("/api/v1/auth/password-reset/confirm", json={"token": token, "new_password": "weak"})
    assert weak.status_code == 422
    assert client.post("/api/v1/auth/password-reset/confirm", json={"token": token, "new_password": STRONG}).status_code == 204
    member.error("GET", "/auth/me", 401, "UNAUTHENTICATED")       # every session signed out
    assert login(client, member.email, password=STRONG).token
    replay = client.post("/api/v1/auth/password-reset/confirm", json={"token": token, "new_password": "Another-Pass-2032"})
    assert replay.status_code == 409 and replay.json()["error"]["code"] == "RESET_LINK_CLOSED"

    # an old link has expired
    fresh = login(client, member.email, password=STRONG)
    fresh.post("/auth/password-reset", None, 200)
    token = _last_link(member.email)
    with owner_sql.begin() as c:   # the table is the person's own even to its owner, so act as them
        c.execute(text("SELECT set_config('app.user_id', :u, true)"), {"u": fresh.get("/auth/me").json()["user"]["id"]})
        c.execute(text("UPDATE password_resets SET expires_at = :t WHERE used_at IS NULL"),
                  {"t": datetime.now(UTC) - timedelta(minutes=1)})
    assert client.get(f"/api/v1/auth/password-reset/{token}").json() == {"state": "expired"}
    assert "user.password_reset_requested" in audit_actions(org)


def test_sign_in_activity_is_only_your_own(client, org):
    member = org.add_user("dispatcher")
    client.post("/api/v1/auth/login", json={"email": member.email, "password": "wrong-password-x"})
    mine = member.get("/auth/security/activity").json()
    assert mine[0]["kind"] == "failed_password"
    assert all(e["kind"] != "failed_password" for e in org.get("/auth/security/activity").json())


def test_privacy_choices_and_data_export(org):
    member = org.add_user("viewer")
    state = member.patch("/auth/security", {"support_access": True, "share_usage": True}, 200).json()
    assert state["privacy"]["share_usage"] is True and state["privacy"]["support_access_until"]
    assert member.patch("/auth/security", {"support_access": False}, 200).json()["privacy"]["support_access_until"] is None
    assert member.post("/auth/security/data-export", None, 200).json() == {"email": member.email}
    export = member.get("/auth/security/data-export")
    assert export.headers["content-disposition"].startswith("attachment") and export.json()["profile"]["email"] == member.email
    actions = audit_actions(org)
    assert {"user.support_access_granted", "user.support_access_ended", "user.data_export_requested"} <= set(actions)
