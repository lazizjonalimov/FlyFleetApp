"""Send the compliance reminders that are due, for every active company.

    python scripts/run_reminders.py

Run it every hour from a scheduler (cron, a Kubernetes CronJob, a platform's scheduled task). Each company's
reminders go out once a night at the hour its rules name; a run that finds nothing due changes nothing, and the
compliance pages catch up on their own if a night was missed.
"""
import sys
import uuid
from pathlib import Path

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.db import new_session  # noqa: E402
from app.core.deps import Principal  # noqa: E402
from app.modules.safety import reminders  # noqa: E402

# Reminders are sent by FlyFleet itself, not by a person.
SYSTEM = uuid.UUID(int=0)


def main() -> int:
    with new_session() as db:
        companies = db.execute(text("SELECT id, timezone FROM jobs_active_organizations()")).all()
    failed = 0
    for org_id, zone in companies:
        try:
            with new_session(org_id=org_id) as db:
                reminders.catch_up(db, Principal(user_id=SYSTEM, org_id=org_id, role="owner", full_name="FlyFleet",
                                                 email="", timezone=zone or "UTC"))
                db.commit()
        except Exception as error:  # one company's problem must not stop the others' reminders
            failed += 1
            print(f"reminders failed for {org_id}: {error}", file=sys.stderr)
    print(f"checked {len(companies)} companies, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
