"""Send the task reminders that are due, for every active company: each person's morning summary at the time
they chose under My tasks › Reminders, and a note 30 minutes before a task is due.

    python scripts/run_task_reminders.py

Run it every few minutes from a scheduler (cron, a Kubernetes CronJob, a platform's scheduled task). A summary
goes out once a day per person and company, a due-soon note once per task; a run that finds nothing due changes
nothing.
"""
import sys
import uuid
from pathlib import Path

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.db import new_session  # noqa: E402
from app.core.deps import Principal  # noqa: E402
from app.modules.tasks import service  # noqa: E402

# Reminders are sent by FlyFleet itself, not by a person.
SYSTEM = uuid.UUID(int=0)


def main() -> int:
    with new_session() as db:
        companies = db.execute(text("SELECT id, timezone FROM jobs_active_organizations()")).all()
    failed = sent = 0
    for org_id, zone in companies:
        try:
            with new_session(org_id=org_id) as db:
                name = db.scalar(text("SELECT name FROM organizations WHERE id = :id"), {"id": org_id}) or ""
                sent += service.send_reminders(db, Principal(user_id=SYSTEM, org_id=org_id, role="owner",
                                                             full_name="FlyFleet", email="", timezone=zone or "UTC",
                                                             org_name=name))
                db.commit()
        except Exception as error:  # one company's problem must not stop the others' reminders
            failed += 1
            print(f"task reminders failed for {org_id}: {error}", file=sys.stderr)
    print(f"checked {len(companies)} companies, sent {sent}, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
