"""The shipment portal: a customer's sign-in sees its own shipments, papers and invoices, and nothing else."""
import uuid

from tests.conftest import act, assign, complete, login, new_load, seed, stops, upload


def portal(org, client, customer_id: str):
    email = f"kelly-{uuid.uuid4().hex[:6]}@customer.example"
    added = org.post(f"/customers/{customer_id}/portal-users",
                     {"email": email, "full_name": "Kelly Moss", "password": "a long temporary pass"}, 201).json()
    assert added["full_name"] == "Kelly Moss" and added["existing_account"] is False
    return login(client, email, password="a long temporary pass")


def test_a_customer_sees_its_own_shipments_papers_and_invoices_and_nothing_else(org, client):
    s = seed(org)
    rolling = assign(org, new_load(org, s["customer"]["id"], reference="PO 71904"), s)
    for action in ("dispatch", "arrive", "depart"):
        rolling = act(org, rolling, action)                                       # picked up, on the road
    done = complete(org, s, reference="PO 71822",                                 # delivered, POD approved
                    stops=stops("2031-05-10T14:00:00Z", "2031-05-12T14:00:00Z"))
    other = org.post("/customers", {"name": "Initech"}, 201).json()
    elsewhere = new_load(org, other["id"])
    invoice = org.post("/invoices", {"customer_id": s["customer"]["id"], "load_ids": [done["id"]]}, 201).json()
    org.post(f"/invoices/{invoice['id']}/issue", expect=200)

    kelly = portal(org, client, s["customer"]["id"])
    home = kelly.get("/portal/customer").json()
    assert (home["customer"], home["carrier"], home["user_name"], home["preview"]) == ("Globex", "Acme Trucking", "Kelly Moss", False)
    assert (home["active"], home["delivered"]) == (1, 1)

    active = kelly.get("/portal/customer/shipments").json()
    assert [(x["load_number"], x["reference"], x["state"]) for x in active] == [(rolling["load_number"], "PO 71904", "in_transit")]
    assert "revenue" not in active[0] and "assignment" not in active[0]                 # no rates, no driver
    found = kelly.get("/portal/customer/shipments", params={"view": "all", "q": "71822"}).json()
    assert [x["load_number"] for x in found] == [done["load_number"]] and found[0]["pod_available"] is True
    kelly.error("GET", f"/portal/customer/shipments/{elsewhere['id']}", 404, "NOT_FOUND")  # another customer's

    detail = kelly.get(f"/portal/customer/shipments/{rolling['id']}").json()
    assert [m["key"] for m in detail["milestones"] if m["done"]] == ["booked", "picked_up"]
    assert [m["key"] for m in detail["milestones"] if m["current"]] == ["in_transit"]
    assert [d["note"] for d in detail["documents"]] == ["Not in yet", "After delivery"]
    papers = kelly.get(f"/portal/customer/shipments/{done['id']}").json()["documents"]
    pod = next(d for d in papers if d["type"] == "pod")
    assert pod["available"] is True
    assert kelly.get(f"/portal/customer/documents/{pod['id']}/download").status_code == 200
    medical = upload(org, "driver", s["driver"]["id"], "medical")
    kelly.error("GET", f"/portal/customer/documents/{medical['id']}/download", 404, "NOT_FOUND")
    assert [d["load_number"] for d in kelly.get("/portal/customer/documents").json()] == [done["load_number"]]

    bills = kelly.get("/portal/customer/invoices").json()
    assert [(b["invoice_number"], b["status"], b["loads"]) for b in bills] == [("INV-1001", "open", [done["load_number"]])]

    # Writing to dispatch lands in the carrier's Messages; the carrier's reply reaches the portal.
    sent = kelly.post("/portal/customer/messages", {"body": "Any update on PO 71904?", "load_id": rolling["id"]}, 201).json()
    assert sent["mine"] is True and sent["load_number"] == rolling["load_number"]
    conv = next(c for c in org.get("/conversations").json()["items"] if c["customer_id"] == s["customer"]["id"])
    assert conv["channel"] == "portal" and conv["last"].startswith("Kelly:")
    reply = org.post(f"/conversations/{conv['id']}/messages", {"body": "Running an hour late, new ETA 16:40.",
                                                               "load_id": rolling["id"]}, 201).json()
    assert [d["channel"] for d in reply["deliveries"] if d["status"] == "sent"] == ["portal"]
    thread = kelly.get("/portal/customer/messages").json()
    assert [(m["mine"], m["author"]) for m in thread] == [(True, "Kelly Moss"), (False, "Acme Trucking")]
    update = kelly.get(f"/portal/customer/shipments/{rolling['id']}").json()["update"]
    assert update["body"] == "Running an hour late, new ETA 16:40."

    # The console stays closed to a portal sign-in; staff can look at the portal but not write as the customer.
    kelly.error("GET", "/loads", 403, "FORBIDDEN")
    kelly.error("GET", "/portal/owner", 403, "FORBIDDEN")
    preview = org.get("/portal/customer", params={"customer_id": s["customer"]["id"]}).json()
    assert preview["preview"] is True
    org.error("POST", "/portal/customer/messages", 403, "FORBIDDEN", params={"customer_id": s["customer"]["id"]},
              json={"body": "hi"})
    org.error("GET", "/portal/customer", 403, "FORBIDDEN")                         # staff must say which customer
    assert [u["full_name"] for u in org.get(f"/customers/{s['customer']['id']}/portal-users").json()] == ["Kelly Moss"]
