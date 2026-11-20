"""Moving a truck or trailer to another company of the account: a preview, then a confirm that does exactly that."""
import uuid
from datetime import UTC, datetime, timedelta

from tests.conftest import assign, new_load, seed, upload
from tests.test_companies import add_company
from tests.test_owners import LEASE

TODAY = datetime.now(UTC).date()
VIN = "1FUJGLDR12LM12345"


def two(org):
    other = add_company(org, "Bravo Logistics").json()
    return other, org.switch(other["id"])


def move(org, kind, unit, destination, **extra):
    return {"destination_organization_id": destination, "effective_on": str(TODAY), **extra}


def test_preview_names_what_a_move_changes_then_confirm_does_it(org):
    other, bravo = two(org)
    s = seed(org)
    truck = s["truck"]
    org.patch(f"/vehicles/{truck['id']}", {"vin": VIN}, 200)
    org.put(f"/vehicles/{truck['id']}/seat", {"driver_id": s["driver"]["id"]}, 200)
    dispatcher = org.add_user("dispatcher")
    org.post("/dispatch-teams", {"name": "North", "user_ids": [dispatcher.user_id], "vehicle_ids": [truck["id"]]}, 201)
    org.post("/owners", {"entity_type": "individual", "person_id": s["driver"]["person_id"], "status": "active",
                         "units": [{"vehicle_id": truck["id"], "effective_from": str(TODAY - timedelta(days=30)),
                                    "agreement": LEASE, "who_drives": "owner"}]}, 201)
    upload(org, "vehicle", truck["id"], "registration")
    bravo_team = bravo.post("/dispatch-teams", {"name": "Bravo North", "user_ids": [], "vehicle_ids": []}, 201).json()
    bravo_team_id = next(t["id"] for t in bravo_team["teams"])

    preview = org.post(f"/vehicles/{truck['id']}/transfer-preview", move(org, "vehicle", truck, other["id"]), 200).json()
    assert preview["can_confirm"] and preview["blockers"] == []
    assert preview["team"]["name"] == "North"
    # The dispatcher has no access to Bravo, so the truck leaves their list for good.
    assert [(d["name"], d["has_access_in_destination"]) for d in preview["team"]["dispatchers"]] == [("Dispatcher", False)]
    assert preview["driver_assignment"]["driver"] == "Dana Driver"
    assert preview["ownership"] and preview["ownership"][0]["share_pct"] == "100.00"
    assert [d["type"] for d in preview["documents"]] == ["registration"]
    assert [t["name"] for t in preview["destination_teams"]] == ["Bravo North"]
    # Previewing changes nothing.
    assert org.get(f"/vehicles/{truck['id']}").json()["status"] == "active"

    done = org.post(f"/vehicles/{truck['id']}/transfer",
                    move(org, "vehicle", truck, other["id"], destination_team_id=bravo_team_id), 201).json()
    assert done["documents_copied"] == 1

    # Where it left: transferred, read-only, history kept; the team and seat no longer hold it.
    left = org.get(f"/vehicles/{truck['id']}").json()
    assert left["status"] == "transferred"
    org.error("PATCH", f"/vehicles/{truck['id']}", 409, "UNIT_TRANSFERRED", json={"notes": "x"})
    assert org.get(f"/vehicles/{truck['id']}/seats").json()[0]["effective_to"] == str(TODAY)
    # Where it arrived: a new record with the same VIN and the current documents, in the chosen team.
    arrived = bravo.get(f"/vehicles/{done['destination_unit_id']}").json()
    assert arrived["vin"] == VIN and arrived["status"] == "active" and arrived["unit_number"] == truck["unit_number"]
    docs = bravo.items("/documents", entity_type="vehicle", entity_id=done["destination_unit_id"])
    assert [d["type"] for d in docs] == ["registration"]
    teams = bravo.get("/dispatch-teams").json()["teams"]
    assert [v["id"] for v in next(t for t in teams if t["id"] == bravo_team_id)["vehicles"]] == [done["destination_unit_id"]]
    # Both companies' audit logs record it.
    assert any(e["action"] == "vehicle.transferred_out" for e in org.items("/audit-logs"))
    assert any(e["action"] == "vehicle.transferred_in" for e in bravo.items("/audit-logs"))
    # Moving it again from the old company is refused: it is no longer theirs.
    org.error("POST", f"/vehicles/{truck['id']}/transfer", 409, "UNIT_TRANSFERRED",
              json=move(org, "vehicle", truck, other["id"]))


def test_a_truck_on_a_load_does_not_move(org):
    other, _ = two(org)
    s = seed(org)
    load = new_load(org, s["customer"]["id"])
    assign(org, load, s)
    body = move(org, "vehicle", s["truck"], other["id"])
    preview = org.post(f"/vehicles/{s['truck']['id']}/transfer-preview", body, 200).json()
    assert not preview["can_confirm"] and [b["code"] for b in preview["blockers"]] == ["ACTIVE_LOAD"]
    assert load["load_number"] in preview["blockers"][0]["message"]
    org.error("POST", f"/vehicles/{s['truck']['id']}/transfer", 409, "TRANSFER_BLOCKED", json=body)
    assert org.get(f"/vehicles/{s['truck']['id']}").json()["status"] == "active"


def test_a_vin_is_active_in_one_company_and_a_number_cannot_clash(org):
    other, bravo = two(org)
    mine = org.post("/vehicles", {"unit_number": "T-1", "vin": VIN}, 201).json()
    bravo.post("/vehicles", {"unit_number": "T-1"}, 201)
    clash = org.post(f"/vehicles/{mine['id']}/transfer-preview", move(org, "vehicle", mine, other["id"]), 200).json()
    assert [b["code"] for b in clash["blockers"]] == ["UNIT_NUMBER_TAKEN"]
    # With another number it is fine, and then the VIN is active in Bravo only.
    renumbered = move(org, "vehicle", mine, other["id"], unit_number="T-9")
    org.post(f"/vehicles/{mine['id']}/transfer", renumbered, 201)
    again = org.post("/vehicles", {"unit_number": "T-2", "vin": VIN.lower()}, 201).json()
    held = org.post(f"/vehicles/{again['id']}/transfer-preview", move(org, "vehicle", again, other["id"], unit_number="T-3"),
                    200).json()
    assert "VIN_ACTIVE_ELSEWHERE" in [b["code"] for b in held["blockers"]]


def test_only_the_account_owner_or_a_main_admin_in_both_companies_may_move_a_unit(org):
    other, bravo = two(org)
    s = seed(org)
    body = move(org, "vehicle", s["truck"], other["id"])
    # A fleet manager can manage equipment, but moving a unit between companies takes a Main Admin.
    fleet = org.add_user("fleet_manager")
    bravo.post("/members", {"email": fleet.email, "full_name": "Fleet", "role": "fleet_manager"}, 201)
    fleet.error("POST", f"/vehicles/{s['truck']['id']}/transfer-preview", 403, "TRANSFER_NOT_ALLOWED", json=body)
    # A Main Admin here with no seat in the other company can't see it at all; with only a lesser seat there, no.
    admin = org.add_user("owner")
    admin.error("POST", f"/vehicles/{s['truck']['id']}/transfer-preview", 404, "NOT_FOUND", json=body)
    bravo.post("/members", {"email": admin.email, "full_name": "Admin", "role": "dispatcher"}, 201)
    admin.error("POST", f"/vehicles/{s['truck']['id']}/transfer-preview", 403, "TRANSFER_NOT_ALLOWED", json=body)
    bravo.patch(f"/members/{admin.user_id}", {"role": "owner"}, 200)
    admin.post(f"/vehicles/{s['truck']['id']}/transfer-preview", body, 200)
    stranger = uuid.uuid4()
    org.error("POST", f"/vehicles/{s['truck']['id']}/transfer-preview", 404, "NOT_FOUND",
              json=move(org, "vehicle", s["truck"], str(stranger)))


def test_a_trailer_moves_the_same_way(org):
    other, bravo = two(org)
    s = seed(org)
    trailer = s["trailer"]
    done = org.post(f"/trailers/{trailer['id']}/transfer", move(org, "trailer", trailer, other["id"]), 201).json()
    assert org.get(f"/trailers/{trailer['id']}").json()["status"] == "transferred"
    assert bravo.get(f"/trailers/{done['destination_unit_id']}").json()["status"] == "active"
    org.error("POST", f"/trailers/{trailer['id']}/transfer", 409, "UNIT_TRANSFERRED",
              json=move(org, "trailer", trailer, other["id"]))


def test_a_truck_in_an_open_settlement_does_not_move_until_it_is_settled(org):
    from tests.test_settlements import delivered, draft, terms
    other, _ = two(org)
    s = seed(org)
    terms(org, s)
    delivered(org, s)
    st = draft(org, s)
    body = move(org, "vehicle", s["truck"], other["id"])
    preview = org.post(f"/vehicles/{s['truck']['id']}/transfer-preview", body, 200).json()
    assert [b["code"] for b in preview["blockers"]] == ["OPEN_SETTLEMENT"]
    assert "Delete it first" in preview["blockers"][0]["message"]
    org.delete(f"/settlements/{st['id']}", 204)
    assert org.post(f"/vehicles/{s['truck']['id']}/transfer-preview", body, 200).json()["can_confirm"]
