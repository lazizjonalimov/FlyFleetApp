"""My tasks in full: steps, snoozing, one task waiting on another, repeating tasks, escalation, bulk changes,
comments and history, what a role can't open, the team's view, insights, saved views and reminders."""
import json
from datetime import UTC, datetime, timedelta

from app.core import mail
from tests.conftest import new_load, seed


def soon(**kw) -> str:
    return (datetime.now(UTC) + timedelta(**kw)).isoformat()


def history(api, task_id: str) -> list[str]:
    return [h["text"] for h in api.get(f"/tasks/{task_id}").json()["history"]]


def newest_mail(to: str) -> dict | None:
    found = [json.loads(p.read_text()) for p in mail.outbox().glob("*.json")]
    found = [m for m in found if m["to"] == to]
    return max(found, key=lambda m: m["at"]) if found else None


def test_steps_history_and_audit(org):
    task = org.post("/tasks", {"title": "Onboard the new driver", "subtasks": ["Collect CDL", "Drug test", " "],
                               "due_at": soon(hours=3), "priority": "medium"}, 201).json()
    assert [s["text"] for s in task["subtasks"]] == ["Collect CDL", "Drug test"] and task["status"] == "open"
    org.error("POST", "/tasks", 422, "VALIDATION_ERROR", json={"title": "ab"})
    steps = [{"text": "Collect CDL", "done": True}, {"text": "Drug test", "done": False}]
    detail = org.patch(f"/tasks/{task['id']}", {"subtasks": steps, "priority": "high"}, 200).json()
    assert detail["subtasks"][0]["done"] and detail["priority"] == "high"
    org.patch(f"/tasks/{task['id']}", {"due_at": None}, 200)
    lines = history(org, task["id"])
    assert lines[0] == "Created" and "Priority Medium → High" in lines and "Ticked ‘Collect CDL’" in lines
    assert lines[-1] == "Due no date"
    commented = org.post(f"/tasks/{task['id']}/comments", {"text": "Called the school"}, 201).json()
    assert [c["text"] for c in commented["comments"]] == ["Called the school"]
    assert commented["comments"][0]["actor"]["name"] == "Olive Owner"
    actions = {e["action"] for e in org.items("/audit-logs", entity_id=task["id"])}
    assert {"task.created", "task.priority", "task.checklist", "task.due", "task.commented"} <= actions


def test_snooze_takes_a_task_off_the_list_until_then(org):
    task = org.post("/tasks", {"title": "Call the broker back"}, 201).json()
    snoozed = org.post(f"/tasks/{task['id']}/actions", {"action": "snooze", "until": soon(hours=1)}, 200).json()
    assert snoozed["status"] == "snoozed"
    assert org.items("/tasks") == [] and [t["id"] for t in org.items("/tasks", tab="snoozed")] == [task["id"]]
    counts = org.get("/tasks/counts").json()
    assert counts["open"] == 0 and counts["snoozed"] == 1
    org.error("POST", f"/tasks/{task['id']}/actions", 422, "VALIDATION_ERROR",
              json={"action": "snooze", "until": soon(hours=-1)})
    back = org.post(f"/tasks/{task['id']}/actions", {"action": "unsnooze"}, 200).json()
    assert back["status"] == "open" and history(org, task["id"])[-1] == "Back on the list"


def test_a_blocked_task_cant_be_done_until_its_blocker_is(org):
    first = org.post("/tasks", {"title": "Get the rate confirmation"}, 201).json()
    second = org.post("/tasks", {"title": "Dispatch the load", "blocked_by": first["id"]}, 201).json()
    assert second["blocker"]["title"] == "Get the rate confirmation"
    err = org.error("POST", f"/tasks/{second['id']}/actions", 409, "BLOCKED", json={"action": "complete"})
    assert err["message"] == "Finish ‘Get the rate confirmation’ first"
    # No loops: the first can't wait on the second.
    org.error("PATCH", f"/tasks/{first['id']}", 422, "VALIDATION_ERROR", json={"blocked_by": second["id"]})
    assert [t["title"] for t in org.get(f"/tasks/{first['id']}").json()["blocking"]] == ["Dispatch the load"]
    org.post(f"/tasks/{first['id']}/actions", {"action": "complete"}, 200)
    done = org.post(f"/tasks/{second['id']}/actions", {"action": "complete"}, 200).json()
    assert done["status"] == "done" and done["blocker"] is None


def test_completing_a_repeating_task_gives_the_next_one(org):
    due = datetime.now(UTC) + timedelta(hours=2)
    task = org.post("/tasks", {"title": "Reconcile fuel", "recurrence": "weekly", "due_at": due.isoformat(),
                               "subtasks": ["Export card data"]}, 201).json()
    assert task["source"] == "recurring"
    org.patch(f"/tasks/{task['id']}", {"subtasks": [{"text": "Export card data", "done": True}]}, 200)
    out = org.post(f"/tasks/{task['id']}/actions", {"action": "complete"}, 200).json()
    nxt = out["next"]
    assert nxt and nxt["title"] == "Reconcile fuel" and nxt["recurrence"] == "weekly"
    assert abs(datetime.fromisoformat(nxt["due_at"]) - (due + timedelta(days=7))) < timedelta(seconds=2)
    assert nxt["subtasks"] == [{"text": "Export card data", "done": False}]


def test_escalating_raises_priority_and_hands_it_to_an_administrator(org):
    admin = org.add_user("admin")
    dispatcher = org.add_user("dispatcher")
    task = dispatcher.post("/tasks", {"title": "Find a cover driver", "priority": "low"}, 201).json()
    out = dispatcher.post(f"/tasks/{task['id']}/actions", {"action": "escalate"}, 200).json()
    assert out["priority"] == "high" and out["escalated"] and out["assignee"]["id"] == admin.user_id
    assert newest_mail(admin.email)["subject"] == "Dispatcher gave you a task: Find a cover driver"
    # The Administrator escalating their own: it goes to the Main Admin.
    again = admin.post(f"/tasks/{task['id']}/actions", {"action": "escalate"}, 200).json()
    assert again["assignee"]["name"] == "Olive Owner"
    assert any(line.startswith("Escalated to Admin · priority High") for line in history(admin, task["id"]))


def test_bulk_changes_report_what_couldnt_change(org):
    a = org.post("/tasks", {"title": "Task number one"}, 201).json()
    b = org.post("/tasks", {"title": "Task number two", "blocked_by": a["id"]}, 201).json()
    out = org.post("/tasks/bulk", {"ids": [a["id"], b["id"]], "action": "priority", "priority": "low"}, 200).json()
    assert {t["priority"] for t in out["done"]} == {"low"}
    out = org.post("/tasks/bulk", {"ids": [b["id"], a["id"]], "action": "complete"}, 200).json()
    assert [t["id"] for t in out["done"]] == [a["id"]]
    assert out["failed"] == [{"id": b["id"], "title": "Task number two", "message": "Finish ‘Task number one’ first"}]
    out = org.post("/tasks/bulk", {"ids": [b["id"]], "action": "snooze", "until": soon(hours=2)}, 200).json()
    assert out["done"][0]["status"] == "snoozed"


def test_tasks_about_what_a_role_cant_open_are_hidden(org):
    s = seed(org)
    fleet = org.add_user("fleet_manager")  # can't open customers
    org.post("/tasks", {"title": "Chase the customer's PO", "assignee_user_id": fleet.user_id,
                        "entity_type": "customer", "entity_id": s["customer"]["id"]}, 201)
    org.post("/tasks", {"title": "Check the trailer lights", "assignee_user_id": fleet.user_id}, 201)
    assert [t["title"] for t in fleet.items("/tasks", tab="queue")] == ["Check the trailer lights"]
    counts = fleet.get("/tasks/counts").json()
    assert counts["open"] == 1 and counts["hidden"] == 1
    # A linked ID people write: a load number.
    load = new_load(org, s["customer"]["id"])
    linked = org.post("/tasks", {"title": "Check the BOL", "entity_type": "load", "entity_ref": load["load_number"].lower()}, 201).json()
    assert linked["entity_id"] == load["id"] and linked["entity_label"] == load["load_number"]
    err = org.error("POST", "/tasks", 422, "VALIDATION_ERROR", json={"title": "Check it", "entity_type": "load", "entity_ref": "NOPE-1"})
    assert err["field_errors"] == {"entity_ref": "No load NOPE-1 found"}


def test_team_view_insights_and_starter_views(org):
    dispatcher = org.add_user("dispatcher")
    org.post("/tasks", {"title": "Renew the IRP", "assignee_user_id": dispatcher.user_id}, 201)
    late = org.post("/tasks", {"title": "Answer the auditor", "due_at": soon(hours=-1)}, 201).json()
    done = org.post("/tasks", {"title": "Sign the lease"}, 201).json()
    org.post(f"/tasks/{done['id']}/actions", {"action": "complete"}, 200)
    team = {t["title"] for t in org.items("/tasks", tab="queue", view="team")}
    assert {"Renew the IRP", "Answer the auditor", "Sign the lease"} <= team
    dispatcher.error("GET", "/tasks", 403, "FORBIDDEN", params={"tab": "queue", "view": "team"})
    mine = org.get("/tasks/insights").json()
    assert mine["done_today"] == 1 and mine["overdue"] == 1 and len(mine["per_day"]) == 7
    assert mine["per_day"][-1]["done"] == 1 and mine["avg_close_minutes"] is not None
    assert {p["name"]: p["open"] for p in mine["per_person"]} == {"Dispatcher": 1, "Olive Owner": 1}
    assert dispatcher.get("/tasks/insights").json()["per_person"] == []
    assert late["id"]
    names = [v["name"] for v in org.get("/saved-views", params={"resource": "tasks"}).json()]
    assert sorted(names) == ["Assigned by me", "High priority"]
    view = next(v for v in org.get("/saved-views", params={"resource": "tasks"}).json() if v["name"] == "High priority")
    org.delete(f"/saved-views/{view['id']}", 204)
    org.items("/tasks", tab="queue")
    assert [v["name"] for v in org.get("/saved-views", params={"resource": "tasks"}).json()] == ["Assigned by me"]


def test_giving_a_task_emails_them_unless_they_turned_it_off(org):
    dispatcher = org.add_user("dispatcher")
    org.post("/tasks", {"title": "Book the reefer wash", "assignee_user_id": dispatcher.user_id}, 201)
    assert newest_mail(dispatcher.email)["subject"] == "Olive Owner gave you a task: Book the reefer wash"
    dispatcher.put("/preferences/tasks.reminders", {"value": {"on_assign": False}}, 204)
    task = org.post("/tasks", {"title": "Wash the reefer again", "assignee_user_id": dispatcher.user_id}, 201).json()
    assert newest_mail(dispatcher.email)["subject"] == "Olive Owner gave you a task: Book the reefer wash"
    assert history(org, task["id"]) == ["Created for Dispatcher"]


def test_morning_summary_and_due_soon_reminders(org):
    import uuid

    from app.core.db import new_session
    from app.core.deps import Principal
    from app.modules.tasks import service
    org.put("/preferences/tasks.reminders", {"value": {"summary": True, "send_at": "00:00", "via": "email"}}, 204)
    task = org.post("/tasks", {"title": "Call the shipper", "due_at": soon(minutes=20)}, 201).json()
    p = Principal(user_id=uuid.UUID(int=0), org_id=uuid.UUID(org.org_id), role="owner", full_name="FlyFleet",
                  email="", timezone="UTC", org_name="Acme")
    with new_session(org_id=p.org_id) as db:
        assert service.send_reminders(db, p) == 2
        db.commit()
    with new_session(org_id=p.org_id) as db:
        assert service.send_reminders(db, p) == 0  # once a day, once a task
        db.commit()
    assert "Reminder emailed to Olive Owner" in history(org, task["id"])[-1]
