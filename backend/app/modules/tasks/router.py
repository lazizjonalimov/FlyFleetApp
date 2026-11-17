"""My tasks: what one person has to do, from teammates and from fleet alerts."""
import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import AwareDatetime, BaseModel, Field
from sqlalchemy import BigInteger, case, cast, extract, func, or_, select
from sqlalchemy.orm import Session

from app.core.crud import ListParams
from app.core.deps import Principal, get_db, require
from app.core.pagination import Page, Sort, envelope, paginate
from app.modules.organizations.models import Membership, User
from app.modules.tasks import service
from app.modules.tasks.models import Task

router = APIRouter(tags=["tasks"])
READ = require("tasks.read")

Priority = Literal["high", "medium", "low"]


class TaskPerson(BaseModel):
    id: uuid.UUID
    name: str | None


class TaskOut(BaseModel):
    id: uuid.UUID
    title: str
    detail: str | None
    status: Literal["open", "done", "cancelled"]
    priority: Priority
    due_at: datetime | None
    all_day: bool
    assignee: TaskPerson | None
    created_by: TaskPerson | None
    source: Literal["manual", "incident", "reminder"]
    incident_id: uuid.UUID | None
    entity_type: str | None
    entity_id: uuid.UUID | None
    entity_label: str | None
    action: str | None
    done_at: datetime | None
    outcome: str | None
    created_at: datetime
    version: int


class TaskParams(ListParams):
    tab: Literal["open", "today", "by_me", "done"] = "open"


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    detail: str | None = Field(default=None, max_length=300)
    assignee_user_id: uuid.UUID | None = Field(default=None, description="Left out: the task is for you")
    due_at: AwareDatetime | None = None
    all_day: bool = False
    priority: Priority = "medium"
    entity_type: Literal["load", "driver", "vehicle", "customer"] | None = None
    entity_id: uuid.UUID | None = None


class TaskAction(BaseModel):
    action: Literal["complete", "reopen", "assign", "cancel"]
    version: int | None = None
    assignee_user_id: uuid.UUID | None = None
    note: str | None = Field(default=None, max_length=200)


class Teammate(BaseModel):
    id: uuid.UUID
    name: str
    role: str


class TaskCounts(BaseModel):
    open: int
    today: int
    by_me: int
    overdue: int


def _present(db: Session, rows: list[Task]) -> list[TaskOut]:
    ids = {r.assignee_user_id for r in rows} | {r.created_by for r in rows}
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_([i for i in ids if i]))).all()) if ids else {}

    def person(user_id):
        return TaskPerson(id=user_id, name=names.get(user_id)) if user_id else None
    return [TaskOut(id=r.id, title=r.title, detail=r.detail, status=r.status, priority=r.priority, due_at=r.due_at,
                    all_day=r.all_day, assignee=person(r.assignee_user_id), created_by=person(r.created_by),
                    source=r.source, incident_id=r.incident_id, entity_type=r.entity_type, entity_id=r.entity_id,
                    entity_label=r.entity_label, action=r.action, done_at=r.done_at, outcome=r.outcome,
                    created_at=r.created_at, version=r.version) for r in rows]


def _urgency():
    """High first, then what is due soonest; tasks without a due time last."""
    rank = case((Task.priority == "high", 0), (Task.priority == "medium", 1), else_=2)
    due = func.coalesce(Task.due_at, datetime(9999, 1, 1))
    return cast(rank, BigInteger) * 10**11 + cast(extract("epoch", due), BigInteger)


@router.get("/tasks", response_model=Page[TaskOut])
def list_tasks(params: Annotated[TaskParams, Query()], p: Principal = Depends(READ), db: Session = Depends(get_db)):
    service.refresh(db, p)
    db.commit()
    stmt = select(Task).where(*service.mine_filter(p, params.tab))
    if params.q:
        like = f"%{params.q.strip()}%"
        stmt = stmt.where(or_(Task.title.ilike(like), Task.detail.ilike(like), Task.entity_label.ilike(like)))
    sort = Sort("done", func.coalesce(Task.done_at, Task.created_at), True) if params.tab == "done" \
        else Sort("urgency", _urgency(), False)
    rows, info = paginate(db, stmt, sort, Task.id, cursor=params.cursor, limit=params.limit, count=params.count)
    return envelope(_present(db, list(rows)), info)


@router.get("/tasks/counts", response_model=TaskCounts)
def task_counts(p: Principal = Depends(READ), db: Session = Depends(get_db)):
    service.refresh(db, p)
    db.commit()
    return service.counts(db, p)


@router.post("/tasks", response_model=TaskOut, status_code=201)
def create_task(body: TaskIn, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    task = service.create(db, p, title=body.title, detail=body.detail, assignee_user_id=body.assignee_user_id,
                          due_at=body.due_at, all_day=body.all_day, priority=body.priority,
                          entity_type=body.entity_type, entity_id=body.entity_id)
    db.commit()
    return _present(db, [task])[0]


@router.post("/tasks/{task_id}/actions", response_model=TaskOut)
def task_action(task_id: uuid.UUID, body: TaskAction, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    task = service.act(db, p, service.get(db, task_id), body.action, version=body.version,
                       assignee_user_id=body.assignee_user_id, note=body.note)
    db.commit()
    return _present(db, [task])[0]


@router.get("/teammates", response_model=list[Teammate])
def teammates(p: Principal = Depends(require("tasks.assign", "messages.send", "incidents.manage")),
              db: Session = Depends(get_db)):
    """The people on the team, to give a task or an alert to, or to add to a conversation."""
    rows = db.execute(select(User.id, User.full_name, Membership.role).join(Membership, Membership.user_id == User.id)
                      .where(Membership.active.is_(True), Membership.role.notin_(service.APP_ROLES))
                      .order_by(User.full_name)).all()
    return [Teammate(id=i, name=n, role=r) for i, n, r in rows]
