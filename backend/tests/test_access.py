"""Roles and permissions: a company changes a template role or makes its own, gives one person an exception (a
denial always wins), and invites people by a link. Full-access roles and team management can't be handed out."""
import uuid

from tests.conftest import PASSWORD, login, new_load, seed


def test_the_grid_covers_every_permission_once_and_roles_list_with_their_members(org):
    out = org.get("/roles").json()
    assert out["matrix"]["actions"] == ["View", "Create", "Edit", "Assign", "Approve", "Delete", "Export"]
    cells = [p for g in out["matrix"]["groups"] for m in g["modules"] for p in m["cells"].values() if p]
    assert len(cells) == len(set(cells)) and "users.manage" in cells and "users.manage" not in out["grantable"]
    roles = {r["key"]: r for r in out["roles"]}
    assert roles["owner"]["locked"] and roles["owner"]["members"] == 1 and not roles["dispatcher"]["locked"]
    assert roles["dispatcher"]["changed"] is False and roles["dispatcher"]["version"] == 0
    org.add_user("viewer").get("/roles", expect=200)  # anyone may read what roles do


def test_a_changed_template_role_takes_effect_on_the_next_request(org):
    s = seed(org)
    dispatcher = org.add_user("dispatcher")
    new_load(dispatcher, s["customer"]["id"])  # a dispatcher books loads, as the template has it
    role = next(r for r in org.get("/roles").json()["roles"] if r["key"] == "dispatcher")
    new = sorted((set(role["permissions"]) - {"loads.create"}) | {"reports.export"})
    out = org.put("/roles/dispatcher", {"permissions": new, "version": 0}, 200).json()
    saved = next(r for r in out["roles"] if r["key"] == "dispatcher")
    assert saved["changed"] and saved["version"] == 1 and saved["updated_by_name"] == "Olive Owner"
    assert out["history"][0]["what"].startswith("granted Reports › Export, revoked Loads › Create")
    me = dispatcher.get("/auth/me").json()
    assert "reports.export" in me["permissions"] and "loads.create" not in me["permissions"]
    dispatcher.error("POST", "/loads", 403, "FORBIDDEN", json={"customer_id": s["customer"]["id"]})
    org.error("PUT", "/roles/dispatcher", 409, "VERSION_CONFLICT", json={"permissions": new, "version": 0})
    org.error("PUT", "/roles/dispatcher", 422, "VALIDATION_ERROR", json={"permissions": [*new, "users.manage"], "version": 1})
    org.error("PUT", "/roles/owner", 403, "FORBIDDEN", json={"permissions": []})
    dispatcher.error("PUT", "/roles/dispatcher", 403, "FORBIDDEN", json={"permissions": new})
    reset = org.post("/roles/dispatcher/reset", expect=200).json()
    assert next(r for r in reset["roles"] if r["key"] == "dispatcher")["permissions"] == role["permissions"]
    assert "loads.create" in dispatcher.get("/auth/me").json()["permissions"]


def test_custom_roles_and_exceptions_where_a_denial_wins(org):
    s = seed(org)
    out = org.post("/roles", {"name": "Night dispatcher", "from_key": "dispatcher",
                              "description": "Covers the desk after hours"}, 201).json()
    night = next(r for r in out["roles"] if r["label"] == "Night dispatcher")
    assert night["custom"] and night["key"].startswith("custom_") and "dispatch.assign" in night["permissions"]
    org.error("POST", "/roles", 422, "VALIDATION_ERROR", json={"name": "night dispatcher", "from_key": "dispatcher"})
    email = f"night-{uuid.uuid4().hex[:6]}@example.com"
    member = org.post("/members", {"email": email, "full_name": "Nadia Night", "password": PASSWORD,
                                   "role": night["key"]}, 201).json()
    nadia = login(org.c, email, org.org_id)
    assert nadia.get("/auth/me").json()["organization"]["role"] == night["key"]
    nadia.items("/loads")
    # A custom role that dispatches can be put on a dispatch team.
    org.post("/dispatch-teams", {"name": "Nights", "user_ids": [member["user_id"]], "vehicle_ids": [s["truck"]["id"]]}, 201)
    assert nadia.get("/auth/me").json()["scope"]["team_name"] == "Nights"
    org.error("DELETE", f"/roles/{night['key']}", 409, "ROLE_IN_USE")

    # Exceptions: an allowance adds, a denial takes away, and a denial wins over the role.
    viewer = org.add_user("viewer")
    load = new_load(org, s["customer"]["id"])
    viewer.error("POST", f"/loads/{load['id']}/notes", 403, "FORBIDDEN", json={"body": "x"})
    out = org.post("/permission-overrides", {"user_id": viewer.user_id, "permission": "loads.update", "effect": "allow",
                                             "note": "Covers notes on weekends"}, 201).json()
    viewer.post(f"/loads/{load['id']}/notes", {"body": "Weekend check"}, 201)
    deny = org.post("/permission-overrides", {"user_id": member["user_id"], "permission": "loads.read",
                                              "effect": "deny"}, 201).json()
    nadia.error("GET", "/loads", 403, "FORBIDDEN")
    labels = {(o["name"], o["label"], o["effect"]) for o in deny["overrides"]}
    assert ("Nadia Night", "Loads › View", "deny") in labels and ("Viewer", "Loads › Edit", "allow") in labels
    org.error("POST", "/permission-overrides", 422, "VALIDATION_ERROR",
              json={"user_id": member["user_id"], "permission": "users.manage", "effect": "allow"})
    me = org.get("/auth/me").json()["user"]["id"]
    org.error("POST", "/permission-overrides", 422, "VALIDATION_ERROR",
              json={"user_id": me, "permission": "loads.read", "effect": "deny"})
    gone = next(o for o in deny["overrides"] if o["name"] == "Nadia Night")
    org.delete(f"/permission-overrides/{gone['id']}", expect=200)
    nadia.items("/loads")
    review = {r["name"]: r for r in org.get("/access-review").json()}
    assert review["Viewer"]["exceptions"] == ["Allow Loads › Edit"] and review["Nadia Night"]["team"] == "Nights"
    assert "Load rates & revenue › View" in review["Olive Owner"]["sensitive"]
    assert org.get("/access-review", params={"format": "csv"}).text.startswith("﻿Name,Email,Role")


def test_an_invitation_link_joins_the_company_once(org, client):
    s = seed(org)
    created = org.post("/invitations", {"email": "Rosa@Example.com", "full_name": "Rosa Diaz", "role": "dispatcher"},
                       201).json()
    token = created["path"].removeprefix("/invite/")
    assert created["invitation"]["state"] == "pending" and created["invitation"]["email"] == "rosa@example.com"
    preview = client.get(f"/api/v1/auth/invitations/{token}").json()
    assert preview["organization_name"] == "Acme Trucking" and preview["role_label"] == "Dispatcher"
    assert preview["state"] == "open" and preview["existing_account"] is False
    assert client.get("/api/v1/auth/invitations/not-a-real-token-at-all").status_code == 404
    short = client.post("/api/v1/auth/accept-invitation", json={"token": token, "password": "short"})
    assert short.status_code == 422
    joined = client.post("/api/v1/auth/accept-invitation", json={"token": token, "password": PASSWORD})
    assert joined.status_code == 200 and joined.json()["organization"]["role"] == "dispatcher"
    again = client.post("/api/v1/auth/accept-invitation", json={"token": token, "password": PASSWORD})
    assert again.status_code == 409 and again.json()["error"]["code"] == "INVITATION_CLOSED"
    rosa = login(client, "rosa@example.com", org.org_id)
    assert rosa.get("/auth/me").json()["organization"]["role"] == "dispatcher"
    assert [i["state"] for i in org.get("/invitations").json()] == ["accepted"]

    # A driver invited to the driver app: the sign-in is linked to their profile.
    link = org.post("/invitations", {"email": "dana.app@example.com", "full_name": "Dana Driver", "role": "driver",
                                     "driver_id": s["driver"]["id"]}, 201).json()["path"].removeprefix("/invite/")
    assert client.post("/api/v1/auth/accept-invitation", json={"token": link, "password": PASSWORD}).status_code == 200
    assert org.get(f"/drivers/{s['driver']['id']}").json()["user_id"]

    # Withdrawn, and an existing sign-in that must use its own password.
    gone = org.post("/invitations", {"email": "late@example.com", "full_name": "Late", "role": "viewer"}, 201).json()
    org.delete(f"/invitations/{gone['invitation']['id']}", expect=204)
    closed = client.post("/api/v1/auth/accept-invitation",
                         json={"token": gone["path"].removeprefix("/invite/"), "password": PASSWORD})
    assert closed.status_code == 409
    # Someone who already has a FlyFleet sign-in joins with its password, and keeps their other company.
    bea_email = f"bea-{uuid.uuid4().hex[:6]}@example.com"
    client.post("/api/v1/auth/signup", json={"organization_name": "Beta Haul", "full_name": "Bea Bell",
                                             "email": bea_email, "password": PASSWORD})
    invite = org.post("/invitations", {"email": bea_email, "full_name": "Bea Bell", "role": "viewer"}, 201).json()
    assert invite["invitation"]["role_label"] == "Read-only manager"
    bea_token = invite["path"].removeprefix("/invite/")
    assert client.get(f"/api/v1/auth/invitations/{bea_token}").json()["existing_account"] is True
    wrong = client.post("/api/v1/auth/accept-invitation", json={"token": bea_token, "password": "not-her-password"})
    assert wrong.status_code == 401
    bea = client.post("/api/v1/auth/accept-invitation", json={"token": bea_token, "password": PASSWORD}).json()
    assert {o["name"] for o in bea["organizations"]} == {"Acme Trucking", "Beta Haul"}
    org.error("POST", "/invitations", 409, "DUPLICATE_REFERENCE",
              json={"email": "rosa@example.com", "full_name": "Rosa", "role": "viewer"})
    org.add_user("dispatcher").error("POST", "/invitations", 403, "FORBIDDEN",
                                     json={"email": "x@example.com", "full_name": "X", "role": "viewer"})


def test_the_audit_log_by_kind_with_names_and_an_export(org):
    s = seed(org)
    load = new_load(org, s["customer"]["id"])
    org.put("/roles/dispatcher", {"permissions": ["dashboard.read", "loads.read"], "version": 0}, 200)
    ops = org.items("/audit-logs", group="operations")
    created = next(e for e in ops if e["action"] == "load.created")
    assert created["entity_label"] == load["load_number"] and created["actor_role"] == "Owner"
    assert created["source"] == "Web"
    perms = org.items("/audit-logs", group="permissions")
    assert [e["action"] for e in perms] == ["role.changed"]
    assert all(e["action"].startswith(("invoice.", "payment.", "settlement.", "expense.", "ifta"))
               for e in org.items("/audit-logs", group="finance"))
    assert org.items("/audit-logs", group="support") == []
    csv = org.get("/audit-logs", params={"format": "csv"}).text
    assert csv.startswith("﻿Time,Actor,Role,Action") and load["load_number"] in csv
    assert org.items("/audit-logs", group="security")[0]["action"] == "audit.exported"
    org.add_user("dispatcher").error("GET", "/audit-logs", 403, "FORBIDDEN")
