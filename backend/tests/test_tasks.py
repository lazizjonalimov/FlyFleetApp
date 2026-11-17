"""My tasks: given by teammates, and given by fleet alerts to the person who owns them, closing when the alert does."""
from datetime import UTC, datetime, timedelta

from tests.conftest import assign, new_load, seed


def stops(pickup: datetime, delivery: datetime) -> list[dict]:
    return [{"type": "pickup", "name": "Shipper DC", "city": "Dallas", "state": "TX", "appt_start": pickup.isoformat()},
            {"type": "delivery", "name": "Receiver", "city": "Austin", "state": "TX", "appt_start": delivery.isoformat()}]


def test_tasks_people_give_each_other(org):
    dispatcher = org.add_user("dispatcher")
    due = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
    mine = org.post("/tasks", {"title": "Call the insurance broker", "priority": "high", "due_at": due}, 201).json()
    assert mine["assignee"]["name"] == "Olive Owner" and mine["status"] == "open" and mine["source"] == "manual"
    given = org.post("/tasks", {"title": "Book the reefer wash", "detail": "Before Friday's load",
                                "assignee_user_id": dispatcher.user_id, "all_day": True, "due_at": due}, 201).json()
    assert given["all_day"] and datetime.fromisoformat(given["due_at"]).time().strftime("%H:%M:%S") == "23:59:59"
    assert [t["title"] for t in org.items("/tasks")] == ["Call the insurance broker"]
    assert [t["title"] for t in org.items("/tasks", tab="by_me")] == ["Book the reefer wash"]
    assert [t["title"] for t in dispatcher.items("/tasks")] == ["Book the reefer wash"]
    assert dispatcher.get("/tasks/counts").json()["open"] == 1

    done = dispatcher.post(f"/tasks/{given['id']}/actions", {"action": "complete", "version": given["version"]}, 200).json()
    assert done["status"] == "done" and done["outcome"] == "Done"
    dispatcher.error("POST", f"/tasks/{given['id']}/actions", 409, "VERSION_CONFLICT",
                     json={"action": "reopen", "version": given["version"]})
    assert [t["title"] for t in dispatcher.items("/tasks", tab="done")] == ["Book the reefer wash"]
    assert dispatcher.items("/tasks") == [] and org.items("/tasks", tab="by_me") == []
    again = dispatcher.post(f"/tasks/{given['id']}/actions", {"action": "reopen"}, 200).json()
    assert again["status"] == "open"
    # Someone the task isn't for, and who didn't give it, can't change it unless they may give tasks.
    viewer = org.add_user("viewer")
    viewer.error("POST", f"/tasks/{mine['id']}/actions", 403, "FORBIDDEN", json={"action": "complete"})
    viewer.error("POST", "/tasks", 403, "FORBIDDEN", json={"title": "x", "assignee_user_id": dispatcher.user_id})
    assert viewer.post("/tasks", {"title": "Read the safety manual"}, 201).json()["assignee"]["name"] == "Viewer"
    assert {x["role"] for x in dispatcher.get("/teammates").json()} == {"owner", "dispatcher", "viewer"}
    viewer.error("GET", "/teammates", 403, "FORBIDDEN")
    org.error("POST", "/tasks", 422, "VALIDATION_ERROR", json={"title": "x", "assignee_user_id": viewer.user_id,
                                                               "entity_type": "load", "entity_id": mine["id"]})


def test_an_alert_gives_its_owner_a_task_that_closes_with_it(org):
    s = seed(org)
    now = datetime.now(UTC)
    load = new_load(org, s["customer"]["id"], stops=stops(now + timedelta(hours=3), now + timedelta(hours=9)))
    [task] = org.items("/tasks")
    assert task["title"] == f"Assign a driver to {load['load_number']}" and task["action"] == "Assign"
    assert task["priority"] == "high" and task["entity_label"] == load["load_number"] and task["source"] == "incident"
    assert task["detail"].startswith("Pickup ") and task["detail"].endswith(" in Dallas")
    due = datetime.fromisoformat(task["due_at"])
    assert abs(due - (now + timedelta(hours=2))) < timedelta(minutes=2)  # an hour before pickup
    assert org.get("/tasks/counts").json()["open"] == 1
    assign(org, load, s)
    assert org.items("/tasks") == []
    [closed] = org.items("/tasks", tab="done")
    assert closed["outcome"] == "Cleared — a driver was assigned"


def test_a_task_closed_by_hand_is_not_given_again_and_follows_the_alert(org):
    s = seed(org)
    dispatcher = org.add_user("dispatcher")  # an alert nobody owns goes to the dispatcher on duty
    now = datetime.now(UTC)
    first = new_load(org, s["customer"]["id"], stops=stops(now + timedelta(hours=5), now + timedelta(hours=9)))
    second = new_load(org, s["customer"]["id"], stops=stops(now + timedelta(hours=6), now + timedelta(hours=10)))
    tasks = {t["entity_label"]: t for t in dispatcher.items("/tasks")}
    assert set(tasks) == {first["load_number"], second["load_number"]} and org.items("/tasks") == []
    dispatcher.post(f"/tasks/{tasks[first['load_number']]['id']}/actions",
                    {"action": "complete", "note": "Waiting on the customer"}, 200)
    assert [t["entity_label"] for t in dispatcher.items("/tasks")] == [second["load_number"]]
    assert dispatcher.items("/tasks", tab="done")[0]["outcome"] == "Waiting on the customer"
    # Giving the task to someone else hands them the alert too.
    me = org.get("/auth/me").json()["user"]["id"]
    moved = dispatcher.post(f"/tasks/{tasks[second['load_number']]['id']}/actions",
                            {"action": "assign", "assignee_user_id": me}, 200).json()
    assert moved["assignee"]["id"] == me and [t["entity_label"] for t in org.items("/tasks")] == [second["load_number"]]
    alert = next(x for x in org.items("/incidents") if x["load"] and x["load"]["load_number"] == second["load_number"])
    assert alert["owner"]["id"] == me
    assert dispatcher.items("/tasks") == []
