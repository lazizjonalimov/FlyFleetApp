"""Ask FlyFleet: answers only from what the asker's role can see, cited, and never sends anything itself."""
import json
from types import SimpleNamespace

from tests.conftest import act, assign, new_load, seed, stops


def iso(hours: float) -> str:
    from datetime import UTC, datetime, timedelta
    return (datetime.now(UTC) + timedelta(hours=hours)).isoformat()


class FakeClaude:
    """Stands in for the Anthropic client: remembers what it was sent and answers citing the first load it was given,
    its driver and a key it was never given, with a draft to that load's customer."""
    seen: dict = {}

    def __init__(self, **_):
        self.messages = self

    def create(self, **request):
        FakeClaude.seen = request
        schema = request["output_config"]["format"]["schema"]["properties"]
        keys = schema["points"]["items"]["properties"]["refs"]["items"]["enum"]
        load = next(k for k in keys if k.startswith("L-"))
        driver = next(k for k in keys if k.startswith("D"))
        body = {"intro": "One thing first.", "points": [{"text": f"{load} will be late.", "refs": [load, driver, "XX-9"]}],
                "draft_to": load if load in schema["draft_to"]["enum"] else "", "draft_body": "Hi — running about an hour late."}
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=json.dumps(body))])


def test_ask_flyfleet_answers_from_what_the_role_can_see(org, monkeypatch):
    s = seed(org)
    load = new_load(org, s["customer"]["id"], stops=stops(iso(-6), iso(-1)))          # its delivery was due an hour ago
    load = assign(org, load, s)
    for action in ("dispatch", "arrive", "depart"):
        load = act(org, load, action)

    # Off until the operator turns it on, and it says so instead of pretending.
    info = org.get("/assistant").json()
    assert info["enabled"] is False and "isn’t turned on" in info["detail"]
    assert "Loads" in info["using"] and "Finance" in info["using"] and info["hidden"] == []
    assert info["suggestions"][0] == "What needs my attention before the end of the day?"
    org.error("POST", "/assistant/ask", 409, "ASSISTANT_UNAVAILABLE", json={"question": "Anything late?"})

    from app.modules.assistant import service
    monkeypatch.setattr(service, "enabled", lambda: True)
    monkeypatch.setattr(service.anthropic, "Anthropic", FakeClaude)
    answer = org.post("/assistant/ask", {"question": "Anything late?",
                                          "history": [{"question": "Morning", "answer": "Good morning."}]}, 200).json()
    assert answer["intro"] == "One thing first." and answer["records_read"] >= 3
    refs = answer["points"][0]["refs"]
    assert [(r["kind"], r["label"]) for r in refs] == [("load", load["load_number"]), ("driver", "Dana Driver")]
    assert refs[0]["id"] == load["id"]                                                # a key it was never given is dropped
    assert answer["draft"] == {"kind": "customer", "id": s["customer"]["id"], "label": "Message to Globex",
                               "load_id": load["id"], "body": "Hi — running about an hour late."}
    prompt = FakeClaude.seen["messages"][0]["content"]
    assert "<question>Anything late?</question>" in prompt and "<earlier_question>Morning</earlier_question>" in prompt
    assert "revenue 2500.00 USD" in prompt and "Receivables:" in prompt
    assert FakeClaude.seen["system"].startswith("You are Ask FlyFleet")

    # A dispatcher's assistant reads loads and drivers, never money.
    dispatcher = org.add_user("dispatcher")
    mine = dispatcher.get("/assistant").json()
    assert set(mine["hidden"]) == {"Finance", "Rates", "Compliance"} and "Dispatch" in mine["using"]
    dispatcher.post("/assistant/ask", {"question": "Anything late?"}, 200)
    prompt = FakeClaude.seen["messages"][0]["content"]
    assert load["load_number"] in prompt and "revenue" not in prompt and "Receivables" not in prompt

    # Nothing was sent: the draft waits for a person.
    assert org.items("/audit-logs", action="message.sent") == []
