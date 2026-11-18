"""The documents inbox and the review screen: states, filters, the reading with a reviewer's decisions, and approving
and attaching, which for a proof of delivery moves its load on."""
from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from tests.conftest import deliver, new_load, seed, upload
from tests.pdfmake import text_pdf


def day(offset: int) -> str:
    return str((datetime.now(UTC) + timedelta(days=offset)).date())


def registration() -> bytes:
    return text_pdf([[(40, 740, "VEHICLE REGISTRATION"), (40, 700, "Plate: S9K 4416"), (300, 700, "State: TEXAS"),
                      (450, 700, "Expires: 11/30/27"), (40, 610, "Year 2012"), (160, 610, "Make FRHT")]])


def as_owner(owner_sql, org, statement: str, **params) -> None:
    with owner_sql.begin() as c:
        c.execute(text("SELECT set_config('app.org_id', :o, true)"), {"o": org.org_id})
        c.execute(text(statement), params)


def test_the_inbox_sorts_documents_by_where_they_are(org, owner_sql):
    s = seed(org)
    reg = upload(org, "vehicle", s["truck"]["id"], "registration", content=registration(), filename="reg.pdf")
    assert (reg["pages"], reg["read_status"], reg["state"]) == (1, "done", "needs_review")
    assert reg["read_confidence"] is not None
    bol = upload(org, "load", new_load(org, s["customer"]["id"])["id"], "bol", filename="bol.pdf")
    assert bol["state"] == "filed" and bol["read_status"] is None

    card = upload(org, "driver", s["driver"]["id"], "medical", filename="card.pdf")
    assert (card["read_status"], card["state"]) == (None, "needs_review")   # not a kind FlyFleet reads

    ids = lambda **q: [d["id"] for d in org.items("/documents", **q)]  # noqa: E731
    assert set(ids(state="needs_review")) == {reg["id"], card["id"]}
    assert ids(state="failed") == [] and ids(state="processing") == []
    # Search finds a document by the truck, load or person it is filed with, or who uploaded it.
    assert ids(q=s["truck"]["unit_number"]) == [reg["id"]]
    assert set(ids(q="olive")) == {reg["id"], bol["id"], card["id"]}
    assert ids(q="dana driver") == [card["id"]]
    assert set(ids(source="web")) == {reg["id"], bol["id"], card["id"]} and ids(source="driver_app") == []
    me = org.get("/auth/me").json()["user"]["id"]
    assert set(ids(uploaded_by=me)) == {reg["id"], bol["id"], card["id"]}

    # A reading that failed puts the document on the failed tab.
    as_owner(owner_sql, org, "UPDATE document_reads SET status = 'failed' WHERE document_id = :d", d=reg["id"])
    assert ids(state="failed") == [reg["id"]] and ids(state="needs_review") == [card["id"]]
    # A file still arriving is processing, for a day.
    intent = org.post("/documents/upload-intents", {"filename": "late.pdf", "content_type": "application/pdf",
                                                    "size_bytes": 10, "type": "insurance", "entity_type": "vehicle",
                                                    "entity_id": s["truck"]["id"]}, 201).json()
    assert ids(state="processing") == [intent["document"]["id"]]


def test_the_reviewer_settles_each_field_then_approves_and_attaches(org, owner_sql):
    s = seed(org)
    org.patch(f"/vehicles/{s['truck']['id']}", {"registration_expiry": day(10)}, 200)
    safety = org.add_user("safety_manager")
    reg = upload(org, "vehicle", s["truck"]["id"], "registration", content=registration(), filename="reg.pdf")
    read = safety.get(f"/intake/documents/{reg['id']}/read").json()
    fields = {f["key"]: f for f in read["fields"]}
    assert fields["plate"]["value"] == "S9K 4416" and fields["registration_expiry"]["value"] == "2027-11-30"

    # The plate was read wrong: changing it needs a reason, and what was read is kept beside it.
    safety.error("PUT", f"/intake/reads/{read['id']}/fields/plate", 422, "VALIDATION_ERROR",
                 json={"decision": "corrected", "value": "S9K 4418"})
    fixed = safety.put(f"/intake/reads/{read['id']}/fields/plate",
                       {"decision": "corrected", "value": "S9K 4418", "reason": "Glare on the last digit"}, 200).json()
    plate = {f["key"]: f for f in fixed["fields"]}["plate"]
    assert (plate["state"], plate["value"], plate["read_value"], plate["reason"]) == \
        ("corrected", "S9K 4418", "S9K 4416", "Glare on the last digit")

    # A field read with little confidence must be settled before approving.
    # (Lowered in the stored reading itself, which keeps the values as the paper writes them: "11/30/27".)
    as_owner(owner_sql, org, "UPDATE document_reads SET fields = (SELECT jsonb_agg(CASE WHEN f->>'key' = 'make' "
             "THEN jsonb_set(f, '{confidence}', '0.62') ELSE f END) FROM jsonb_array_elements(fields) f) WHERE id = :r",
             r=read["id"])
    body = safety.error("POST", f"/documents/{reg['id']}/review", 409, "FIELDS_UNCHECKED", json={"decision": "approved"})
    assert body["details"]["fields"] == ["make"]
    safety.put(f"/intake/reads/{read['id']}/fields/make", {"decision": "unreadable"}, 200)

    # Approved, the expiry on the paper becomes the document's and renews the truck's registration.
    approved = safety.post(f"/documents/{reg['id']}/review", {"decision": "approved"}, 200).json()
    assert approved["state"] == "approved" and approved["expires_on"] == "2027-11-30"
    assert org.get(f"/vehicles/{s['truck']['id']}").json()["registration_expiry"] == "2027-11-30"


def test_a_proof_of_delivery_approved_in_review_completes_its_load(org):
    s = seed(org)
    load = deliver(org, new_load(org, s["customer"]["id"]), s)
    pod = upload(org, "load", load["id"], "pod", filename="pod.pdf")
    assert org.get(f"/loads/{load['id']}").json()["status"] == "pod_review"
    org.add_user("viewer").error("POST", f"/documents/{pod['id']}/review", 403, "FORBIDDEN", json={"decision": "approved"})
    org.error("POST", f"/documents/{pod['id']}/review", 422, "VALIDATION_ERROR", json={"decision": "rejected"})
    sent_back = org.post(f"/documents/{pod['id']}/review", {"decision": "rejected", "note": "Unsigned"}, 200).json()
    assert sent_back["review_status"] == "rejected" and org.get(f"/loads/{load['id']}").json()["status"] == "delivered"

    again = upload(org, "load", load["id"], "pod", filename="pod-signed.pdf")
    approved = org.post(f"/documents/{again['id']}/review", {"decision": "approved"}, 200).json()
    assert approved["review_status"] == "approved"
    assert org.get(f"/loads/{load['id']}").json()["status"] == "completed"
    org.error("POST", f"/documents/{again['id']}/review", 409, "ALREADY_REVIEWED", json={"decision": "rejected", "note": "x"})
