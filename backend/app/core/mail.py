"""Sending email. No provider is connected yet (decision 0003): the "outbox" adapter writes each message to a
file under <storage_dir>/outbox and logs that it did, so links can be followed in development and tests. A
provider adapter (SES or similar) replaces it at deployment, behind this same function."""
import json
import logging
import pathlib
import uuid
from datetime import UTC, datetime

from app.core.config import get_settings

log = logging.getLogger("flyfleet.mail")


def outbox() -> pathlib.Path:
    return pathlib.Path(get_settings().storage_dir) / "outbox"


def send(to: str, subject: str, body: str) -> None:
    settings = get_settings()
    if settings.mail != "outbox":
        raise RuntimeError(f"Unknown mail adapter {settings.mail!r}")
    folder = outbox()
    folder.mkdir(parents=True, exist_ok=True)
    message = {"to": to, "subject": subject, "body": body, "at": datetime.now(UTC).isoformat()}
    (folder / f"{datetime.now(UTC):%Y%m%dT%H%M%S}-{uuid.uuid4().hex[:8]}.json").write_text(json.dumps(message, indent=2))
    log.info("mail written to the outbox: %s", subject)
