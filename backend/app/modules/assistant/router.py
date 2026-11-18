import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import Principal, get_db, require
from app.core.errors import Conflict
from app.modules.assistant import service
from app.modules.organizations.models import Organization

router = APIRouter(tags=["assistant"])


class AssistantInfo(BaseModel):
    enabled: bool
    detail: str | None = Field(description="Why it can't answer, when it is off")
    using: list[str] = Field(description="What it reads for this person")
    hidden: list[str] = Field(description="What this person's role keeps from it")
    suggestions: list[str]


class AskTurn(BaseModel):
    question: str = Field(max_length=500)
    answer: str = Field(max_length=4000)


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    history: list[AskTurn] = Field(default_factory=list, max_length=4, description="The conversation so far, oldest first")


class AskRecord(BaseModel):
    key: str
    kind: str = Field(description="What it opens: load, driver, vehicle, incident, conversation, invoices…")
    label: str
    id: uuid.UUID | None


class AskPoint(BaseModel):
    text: str
    refs: list[AskRecord]


class AskDraft(BaseModel):
    """A message the answer suggests. It is only sent if the person approves it."""
    kind: str = Field(description="customer or driver")
    id: uuid.UUID
    label: str
    load_id: uuid.UUID | None
    body: str


class AskAnswer(BaseModel):
    intro: str
    points: list[AskPoint]
    draft: AskDraft | None
    records_read: int
    as_of: datetime


@router.get("/assistant", response_model=AssistantInfo)
def info(p: Principal = Depends(require("dashboard.read"))):
    using, hidden = service.scope(p)
    on = service.enabled()
    return AssistantInfo(enabled=on, using=using, hidden=hidden, suggestions=service.suggestions(p),
                         detail=None if on else "Ask FlyFleet answers with Claude through the AI connection, which "
                                                "isn’t turned on for this FlyFleet installation. Integrations shows "
                                                "what is connected.")


@router.post("/assistant/ask", response_model=AskAnswer)
def ask(body: AskIn, p: Principal = Depends(require("dashboard.read")), db: Session = Depends(get_db)):
    """Answer a question from the records the asker's role can see. Read-only: nothing is changed or sent."""
    company = db.get(Organization, p.org_id)
    try:
        return service.ask(db, p, company.name if company else "the company", body.question.strip(),
                           [(t.question, t.answer) for t in body.history])
    except service.AssistantError as e:
        raise Conflict(str(e), code="ASSISTANT_UNAVAILABLE") from e
