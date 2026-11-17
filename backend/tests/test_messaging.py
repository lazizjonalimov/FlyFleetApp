"""Messages: a driver's one conversation, what reached them by which channel, the driver app's side, FlyFleet's own
cards for dispatches and alerts, team conversations, and suggested replies that are never sent on their own."""
from datetime import UTC, datetime, timedelta

from tests.conftest import act, assign, new_load, seed


def at(minutes_ago: float) -> str:
    return (datetime.now(UTC) - timedelta(minutes=minutes_ago)).isoformat()


def speeding(truck: str, speeds: list[float], start: float) -> list[dict]:
    return [{"vehicle_id": truck, "recorded_at": at(start - i * 0.5), "lat": 31.0982 - i * 0.004, "lon": -97.3428,
             "speed_mph": v, "heading": 182, "accuracy_m": 5} for i, v in enumerate(speeds)]


def test_a_driver_on_the_app_gets_messages_and_the_office_sees_what_reached_them(org):
    s = seed(org, with_login=True)
    driver, app = s["driver"], s["driver_api"]
    conv = org.post("/conversations", {"kind": "driver", "driver_id": driver["id"]}, 201).json()
    assert org.post("/conversations", {"kind": "driver", "driver_id": driver["id"]}, 200).json()["id"] == conv["id"]
    assert {c["key"]: c["connected"] for c in conv["channels"]} == {"app": True, "telegram": False, "sms": False}
    assert conv["quick_replies"] == ["Call me when stopped", "Send a BOL photo", "Running late?"]
    sent = org.post(f"/conversations/{conv['id']}/messages", {"body": "Call me when stopped"}, 201).json()
    assert sent["direction"] == "out" and [(d["channel"], d["status"]) for d in sent["deliveries"]] == [("app", "sent")]
    # Asking for a channel that isn't connected sends nothing by it.
    org.error("POST", f"/conversations/{conv['id']}/messages", 409, "NO_CHANNEL",
              json={"body": "Hi", "channels": ["telegram"]})

    inbox = app.get("/driver/messages").json()["messages"]
    assert [(m["body"], m["author_name"], m["mine"]) for m in inbox] == [("Call me when stopped", "Dispatch", False)]
    thread = org.get(f"/conversations/{conv['id']}").json()
    assert thread["messages"][-1]["deliveries"][0]["status"] == "delivered"
    assert app.post("/driver/messages/read", expect=200).json()["read"] == 1
    assert org.get(f"/conversations/{conv['id']}").json()["messages"][-1]["deliveries"][0]["status"] == "read"

    reply = app.post("/driver/messages", {"body": "Stopped at the fuel island"}, 201).json()
    assert reply["mine"] and reply["status"] == "delivered"
    [item] = org.get("/conversations").json()["items"]
    assert item["last"] == "Stopped at the fuel island" and item["unread"] == 1 and item["channel"] == "app"
    assert org.get("/conversations/unread").json() == {"unread": 1}
    assert org.get("/conversations", params={"tab": "unread"}).json()["counts"]["unread"] == 1
    org.post(f"/conversations/{conv['id']}/read", expect=204)
    assert org.get("/conversations/unread").json() == {"unread": 0}
    assert app.get("/driver/messages").json()["messages"][-1]["status"] == "read"  # the office has seen it
    assert [x["name"] for x in org.get("/conversations", params={"q": "fuel island"}).json()["items"]] == ["Dana Driver"]
    assert org.get("/conversations", params={"q": "nothing like this"}).json()["items"] == []


def test_nothing_is_sent_where_no_channel_reaches_them(org):
    s = seed(org)
    conv = org.post("/conversations", {"kind": "driver", "driver_id": s["driver"]["id"]}, 201).json()
    assert [c["state"] for c in conv["channels"]] == ["not_invited", "not_connected", "not_connected"]
    org.error("POST", f"/conversations/{conv['id']}/messages", 409, "NO_CHANNEL", json={"body": "Hello"})
    channels = org.get(f"/drivers/{s['driver']['id']}/channels").json()
    assert channels["conversation_id"] == conv["id"] and channels["channels"][0]["detail"] == "Not signed up to the driver app yet"
    customer = org.post("/conversations", {"kind": "customer", "customer_id": s["customer"]["id"]}, 201).json()
    assert customer["name"] == "Globex" and [c["key"] for c in customer["channels"]] == ["email"]
    org.error("POST", f"/conversations/{customer['id']}/messages", 409, "NO_CHANNEL", json={"body": "ETA?"})
    # Conversations with nothing in them don't fill the list.
    assert org.get("/conversations").json()["items"] == []


def test_a_dispatched_load_and_an_alert_show_in_the_drivers_conversation(org):
    s = seed(org, with_login=True)
    app, truck = s["driver_api"], s["truck"]["id"]
    now = datetime.now(UTC)
    load = new_load(org, s["customer"]["id"], stops=[
        {"type": "pickup", "name": "Shipper DC", "city": "Dallas", "state": "TX", "appt_start": (now + timedelta(hours=2)).isoformat()},
        {"type": "delivery", "name": "Receiver", "city": "Austin", "state": "TX", "appt_start": (now + timedelta(hours=8)).isoformat()}])
    load = act(org, assign(org, load, s), "dispatch")
    [card] = app.get("/driver/messages").json()["messages"]
    assert card["kind"] == "system" and card["title"] == f"Load {load['load_number']} dispatched to Dana"
    assert card["body"].startswith("Dallas → Austin · pickup ") and "delivery appointment" in card["body"]

    # 76 mph for three minutes: the alert goes to the driver's app, with the policy's words.
    org.post("/positions", {"samples": speeding(truck, [74, 75, 76, 76, 75, 74, 75], 3.0)}, 200)
    [inc] = org.items("/incidents", group="speeding")
    trail = [e["text"] for e in org.get(f"/incidents/{inc['id']}").json()["events"]]
    assert "Driver alerted · Dana Driver · driver app" in trail
    assert "Telegram to the driver not sent · not connected yet" in trail
    alert = app.get("/driver/messages").json()["messages"][-1]
    assert alert["event"] == "alert" and "Your truck has been above 70 mph for 3 minutes" in alert["body"]
    conv = org.get("/conversations").json()["items"][0]
    thread = org.get(f"/conversations/{conv['id']}").json()
    card = thread["messages"][-1]
    assert card["title"] == "Speeding alert sent to driver"
    assert card["body"] == "Above 73 mph for 3 min · near Temple, TX · policy Highway sustained speeding v1"
    assert {d["channel"]: d["status"] for d in card["deliveries"]} == {"telegram": "not_sent", "app": "delivered"}
    assert thread["load"]["load_number"] == load["load_number"] and thread["load"]["lane"] == "Dallas, TX → Austin, TX"
    assert thread["incident"]["number"] == inc["number"] and thread["incident"]["driver_replied_at"] is None

    # The driver's reply goes on the alert's trail. It doesn't acknowledge it: the office still does that.
    app.post("/driver/messages", {"body": "Copy, slowing down", "load_id": load["id"]}, 201)
    detail = org.get(f"/incidents/{inc['id']}").json()
    assert detail["events"][-1]["text"] == "Dana Driver replied in the app · “Copy, slowing down”"
    assert detail["state"] == "notified"
    assert org.get(f"/conversations/{conv['id']}").json()["incident"]["driver_replied_at"]
    other = seed(org)  # someone else's load is not the driver's to mention
    other_load = new_load(org, other["customer"]["id"])
    app.error("POST", "/driver/messages", 403, "FORBIDDEN", json={"body": "x", "load_id": other_load["id"]})


def test_team_conversations_are_for_their_members(org):
    dispatcher = org.add_user("dispatcher")
    safety = org.add_user("safety_manager")
    team = org.post("/conversations", {"kind": "team", "title": "Night desk", "members": [dispatcher.user_id]}, 201).json()
    assert [c["key"] for c in team["channels"]] == ["in_app"] and len(team["members"]) == 2
    org.post(f"/conversations/{team['id']}/messages", {"body": "I'll take the reefers tonight"}, 201)
    [item] = dispatcher.get("/conversations").json()["items"]
    assert item["name"] == "Night desk" and item["unread"] == 1 and item["last"] == "Olive: I'll take the reefers tonight"
    assert org.get("/conversations").json()["items"][0]["last"] == "You: I'll take the reefers tonight"
    safety.error("GET", f"/conversations/{team['id']}", 404, "NOT_FOUND")
    assert safety.get("/conversations").json()["items"] == []
    org.error("POST", "/conversations", 422, "VALIDATION_ERROR", json={"kind": "team", "title": "Solo", "members": []})
    quiet = org.add_user("accountant")
    org.post("/permission-overrides", {"user_id": quiet.user_id, "permission": "messages.read", "effect": "deny"}, 201)
    quiet.error("GET", "/conversations", 403, "FORBIDDEN")
    viewer = org.add_user("viewer")
    viewer.get("/conversations")
    viewer.error("POST", "/conversations", 403, "FORBIDDEN", json={"kind": "team", "title": "x", "members": []})


def test_suggested_replies_are_only_ever_suggestions(org, monkeypatch):
    s = seed(org, with_login=True)
    conv = org.post("/conversations", {"kind": "driver", "driver_id": s["driver"]["id"]}, 201).json()
    assert conv["assistant"] is False and conv["draft"] is None
    s["driver_api"].post("/driver/messages", {"body": "Running about 30 min late, traffic"}, 201)
    thread = org.get(f"/conversations/{conv['id']}").json()
    assert thread["draft"]["state"] == "none"
    org.error("POST", f"/conversations/{conv['id']}/draft", 409, "ASSISTANT_OFF", json={})

    from app.modules.messaging import assistant
    seen = {}

    def fake(*, writer, recipient, sources, previous=None, client=None):
        seen.update(writer=writer, recipient=recipient, previous=previous)
        return ("Thanks — take your time." if previous else "Thanks Dana, I'll let the receiver know."), sources[-1:]
    monkeypatch.setattr(assistant, "enabled", lambda: True)
    monkeypatch.setattr(assistant, "draft", fake)
    draft = org.post(f"/conversations/{conv['id']}/draft", {}, 200).json()
    assert draft["text"] == "Thanks Dana, I'll let the receiver know." and draft["sources"][0].startswith("message at ")
    assert seen["recipient"].startswith("Dana Driver")
    assert org.get(f"/conversations/{conv['id']}").json()["draft"]["state"] == "ready"
    shorter = org.post(f"/conversations/{conv['id']}/draft", {"shorter": True}, 200).json()
    assert shorter["text"] == "Thanks — take your time." and seen["previous"] == draft["text"]
    # Nothing was sent: the driver's inbox has only their own message.
    assert [m["mine"] for m in s["driver_api"].get("/driver/messages").json()["messages"]] == [True]
    org.delete(f"/conversations/{conv['id']}/draft", expect=204)
    assert org.get(f"/conversations/{conv['id']}").json()["draft"]["state"] == "dismissed"
