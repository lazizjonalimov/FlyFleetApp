"""My tasks: what one person has to do, from teammates and from fleet alerts."""
import uuid
from datetime import UTC, date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import AwareDatetime, BaseModel, Field
from sqlalchemy import BigInteger, case, cast, extract, func, or_, select
from sqlalchemy.orm import Session

from app.core.crud import ListParams
from app.core.deps import Principal, get_db, require
from app.core.errors import AppError, Forbidden, Invalid, NotFound
from app.core.pagination import Page, Sort, envelope, paginate
from app.modules.organizations.models import Membership, User
from app.modules.tasks import service
from app.modules.tasks.models import Task, TaskEvent

router = APIRouter(tags=["tasks"])
READ = require("tasks.read")

Priority = Literal["high", "medium", "low"]


class TaskPerson(BaseModel):
    id: uuid.UUID
    name: str | None


Linked = Literal["load", "driver", "vehicle", "trailer", "customer", "invoice", "statement"]
Recurrence = Literal["none", "daily", "weekly", "monthly"]


class Step(BaseModel):
    text: str = Field(max_length=200)
    done: bool = False


class TaskOut(BaseModel):
    id: uuid.UUID
    title: str
    detail: str | None
    status: Literal["open", "snoozed", "done", "cancelled"] = Field(
        description="snoozed: open, but put aside until snoozed_until")
    priority: Priority
    due_at: datetime | None
    all_day: bool
    assignee: TaskPerson | None
    created_by: TaskPerson | None
    source: Literal["manual", "incident", "reminder", "recurring"]
    incident_id: uuid.UUID | None
    entity_type: str | None
    entity_id: uuid.UUID | None
    entity_label: str | None
    action: str | None
    done_at: datetime | None
    outcome: str | None
    created_at: datetime
    version: int
    snoozed_until: datetime | None
    why: str | None
    auto_close: str | None
    recurrence: Recurrence
    blocked_by: uuid.UUID | None
    blocker: "TaskRef | None" = Field(description="The task this one waits on, while it is open")
    sla_at: datetime | None
    sla_label: str | None
    escalated: bool
    subtasks: list[Step]


class TaskRef(BaseModel):
    id: uuid.UUID
    title: str
    status: str


class TaskParams(ListParams):
    tab: Literal["open", "today", "by_me", "snoozed", "done", "queue"] = Field(
        "open", description="queue: every task the screen sorts (open, snoozed, given by you, done in 30 days)")
    view: Literal["mine", "team"] = Field("mine", description="team: everyone's tasks, for full-access roles")


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    detail: str | None = Field(default=None, max_length=300)
    assignee_user_id: uuid.UUID | None = Field(default=None, description="Left out: the task is for you")
    due_at: AwareDatetime | None = None
    all_day: bool = False
    priority: Priority = "medium"
    entity_type: Linked | None = None
    entity_id: uuid.UUID | None = None
    entity_ref: str | None = Field(default=None, max_length=60,
                                   description="The record's own ID as people write it (a load number, a unit)")
    why: str | None = Field(default=None, max_length=300)
    subtasks: list[str] = Field(default_factory=list, description="The steps, one per entry")
    recurrence: Recurrence = "none"
    blocked_by: uuid.UUID | None = None


class TaskAction(BaseModel):
    action: Literal["complete", "reopen", "assign", "snooze", "unsnooze", "escalate", "cancel"]
    version: int | None = None
    assignee_user_id: uuid.UUID | None = None
    note: str | None = Field(default=None, max_length=200)
    until: AwareDatetime | None = Field(default=None, description="snooze: when it comes back")


class TaskActionOut(TaskOut):
    next: TaskOut | None = Field(default=None, description="The next one, when completing a repeating task gave it")


class TaskUpdate(BaseModel):
    version: int | None = None
    title: str | None = Field(default=None, max_length=200)
    detail: str | None = Field(default=None, max_length=300)
    priority: Priority | None = None
    due_at: AwareDatetime | None = None
    all_day: bool | None = None
    assignee_user_id: uuid.UUID | None = None
    blocked_by: uuid.UUID | None = None
    subtasks: list[Step] | None = None


class BulkIn(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=100)
    action: Literal["complete", "reopen", "assign", "snooze", "unsnooze", "priority"]
    assignee_user_id: uuid.UUID | None = None
    until: AwareDatetime | None = None
    priority: Priority | None = None


class BulkOut(BaseModel):
    done: list[TaskOut]
    failed: list["BulkFailure"]
    created: list[TaskOut] = Field(description="Next ones given by repeating tasks that were completed")


class BulkFailure(BaseModel):
    id: uuid.UUID
    title: str
    message: str


class TaskEventOut(BaseModel):
    id: uuid.UUID
    kind: Literal["comment", "history"]
    text: str
    actor: TaskPerson | None
    at: datetime


class TaskDetail(TaskOut):
    comments: list[TaskEventOut]
    history: list[TaskEventOut]
    blocking: list[TaskRef] = Field(description="Open tasks waiting on this one")
    suggested_message: str | None = Field(description="What to send the customer, for a task that asks for it")


class CommentIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class SendIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class DayDone(BaseModel):
    day: date
    done: int


class PersonOpen(BaseModel):
    name: str
    open: int


class TaskInsights(BaseModel):
    done_today: int
    avg_close_minutes: int | None
    overdue: int
    sla_at_risk: int
    per_day: list[DayDone]
    per_person: list[PersonOpen]


TaskOut.model_rebuild()
BulkOut.model_rebuild()


class Teammate(BaseModel):
    id: uuid.UUID
    name: str
    role: str


class TaskCounts(BaseModel):
    open: int
    today: int
    by_me: int
    snoozed: int
    done: int
    overdue: int
    hidden: int = Field(description="Your open tasks about records your role can't open, so not shown")


def _names(db: Session, ids) -> dict:
    ids = [i for i in ids if i]
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all()) if ids else {}


def _present(db: Session, rows: list[Task], cls: type[TaskOut] = TaskOut, **extra) -> list:
    names = _names(db, {r.assignee_user_id for r in rows} | {r.created_by for r in rows})
    wanted = {r.blocked_by for r in rows if r.blocked_by}
    blockers = {t.id: t for t in db.scalars(select(Task).where(Task.id.in_(wanted)))} if wanted else {}
    now = datetime.now(UTC)

    def person(user_id):
        return TaskPerson(id=user_id, name=names.get(user_id)) if user_id else None

    def blocker(r):
        b = blockers.get(r.blocked_by)
        return TaskRef(id=b.id, title=b.title, status=b.status) if b is not None and b.status == "open" else None

    def status(r):
        return "snoozed" if r.status == "open" and r.snoozed_until and r.snoozed_until > now else r.status
    return [cls(id=r.id, title=r.title, detail=r.detail, status=status(r), priority=r.priority, due_at=r.due_at,
                all_day=r.all_day, assignee=person(r.assignee_user_id), created_by=person(r.created_by),
                source=r.source, incident_id=r.incident_id, entity_type=r.entity_type, entity_id=r.entity_id,
                entity_label=r.entity_label, action=r.action, done_at=r.done_at, outcome=r.outcome,
                created_at=r.created_at, version=r.version, snoozed_until=r.snoozed_until, why=r.why,
                auto_close=r.auto_close, recurrence=r.recurrence, blocked_by=r.blocked_by, blocker=blocker(r),
                sla_at=r.sla_at, sla_label=r.sla_label, escalated=r.escalated, subtasks=r.subtasks or [], **extra)
            for r in rows]


def _detail(db: Session, task: Task) -> TaskDetail:
    events = list(db.scalars(select(TaskEvent).where(TaskEvent.task_id == task.id).order_by(TaskEvent.at, TaskEvent.id)))
    names = _names(db, {e.actor_user_id for e in events})

    def out(e):
        return TaskEventOut(id=e.id, kind=e.kind, text=e.text, at=e.at,
                            actor=TaskPerson(id=e.actor_user_id, name=names.get(e.actor_user_id)) if e.actor_user_id else None)
    blocking = db.scalars(select(Task).where(Task.blocked_by == task.id, Task.status == "open").order_by(Task.created_at))
    return _present(db, [task], TaskDetail, comments=[out(e) for e in events if e.kind == "comment"],
                    history=[out(e) for e in events if e.kind == "history"],
                    blocking=[TaskRef(id=t.id, title=t.title, status=t.status) for t in blocking],
                    suggested_message=service.suggested_message(db, task))[0]


def _open(db: Session, p: Principal, task_id: uuid.UUID) -> Task:
    """A task the caller may see: theirs, one they gave, or (for full-access roles) anyone's; and about something
    their role can open."""
    task = service.get(db, task_id)
    mine = p.user_id in (task.assignee_user_id, task.created_by)
    if (not mine and not service.manages(p) and not p.can("tasks.assign")) or task.entity_type in service.hidden_types(p):
        raise NotFound("Task not found")
    return task


def _urgency():
    """High first, then what is due soonest; tasks without a due time last."""
    rank = case((Task.priority == "high", 0), (Task.priority == "medium", 1), else_=2)
    due = func.coalesce(Task.due_at, datetime(9999, 1, 1))
    return cast(rank, BigInteger) * 10**11 + cast(extract("epoch", due), BigInteger)


@router.get("/tasks", response_model=Page[TaskOut])
def list_tasks(params: Annotated[TaskParams, Query()], p: Principal = Depends(READ), db: Session = Depends(get_db)):
    service.refresh(db, p)
    if params.tab == "queue" and not p.preview:
        service.seed_views(db, p)
    db.commit()
    if params.view == "team" and not service.manages(p):
        raise Forbidden("Only a Main Admin or Administrator sees the team's tasks")
    stmt = select(Task).where(*service.mine_filter(p, params.tab, params.view == "team"))
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


@router.get("/tasks/insights", response_model=TaskInsights)
def task_insights(view: Literal["mine", "team"] = "mine", p: Principal = Depends(READ), db: Session = Depends(get_db)):
    return service.insights(db, p, view == "team")


@router.post("/tasks", response_model=TaskOut, status_code=201)
def create_task(body: TaskIn, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    task = service.create(db, p, title=body.title, detail=body.detail, assignee_user_id=body.assignee_user_id,
                          due_at=body.due_at, all_day=body.all_day, priority=body.priority,
                          entity_type=body.entity_type, entity_id=body.entity_id, entity_ref=body.entity_ref,
                          why=body.why, subtasks=body.subtasks, recurrence=body.recurrence, blocked_by=body.blocked_by)
    db.commit()
    return _present(db, [task])[0]


@router.post("/tasks/bulk", response_model=BulkOut)
def bulk(body: BulkIn, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    """The same change to several tasks. Each that can't take it (closed, waiting on another task) is reported and
    left as it was; the rest are changed."""
    done, failed, created = [], [], []
    for task_id in dict.fromkeys(body.ids):
        task = None
        try:
            with db.begin_nested():
                task = _open(db, p, task_id)
                if body.action == "priority":
                    if body.priority is None:
                        raise Invalid("Choose a priority", field="priority")
                    service.update(db, p, task, {"priority": body.priority})
                else:
                    _, nxt = service.act(db, p, task, body.action, assignee_user_id=body.assignee_user_id,
                                         until=body.until)
                    if nxt is not None:
                        created.append(nxt)
            done.append(task)
        except AppError as error:
            failed.append(BulkFailure(id=task_id, title=task.title if task else "Task", message=error.message))
    db.commit()
    return BulkOut(done=_present(db, done), failed=failed, created=_present(db, created))


@router.get("/tasks/{task_id}", response_model=TaskDetail)
def task_detail(task_id: uuid.UUID, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    return _detail(db, _open(db, p, task_id))


@router.patch("/tasks/{task_id}", response_model=TaskDetail)
def update_task(task_id: uuid.UUID, body: TaskUpdate, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    changes = body.model_dump(exclude_unset=True, exclude={"version"})
    if "subtasks" in changes and changes["subtasks"] is not None:
        changes["subtasks"] = [s.model_dump() for s in body.subtasks or []]
    if "priority" in changes and changes["priority"] is None:
        raise Invalid("Choose a priority", field="priority")
    task = service.update(db, p, _open(db, p, task_id), changes, body.version)
    db.commit()
    return _detail(db, task)


@router.post("/tasks/{task_id}/actions", response_model=TaskActionOut)
def task_action(task_id: uuid.UUID, body: TaskAction, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    task, nxt = service.act(db, p, service.get(db, task_id), body.action, version=body.version,
                            assignee_user_id=body.assignee_user_id, note=body.note, until=body.until)
    db.commit()
    return _present(db, [task], TaskActionOut, next=_present(db, [nxt])[0] if nxt else None)[0]


@router.post("/tasks/{task_id}/comments", response_model=TaskDetail, status_code=201)
def add_comment(task_id: uuid.UUID, body: CommentIn, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    task = _open(db, p, task_id)
    service.comment(db, p, task, body.text)
    db.commit()
    return _detail(db, task)


@router.post("/tasks/{task_id}/send", response_model=TaskActionOut)
def send_update(task_id: uuid.UUID, body: SendIn, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    """Send the suggested update to the load's customer, and mark the task done."""
    task, nxt = service.send_to_customer(db, p, _open(db, p, task_id), body.body)
    db.commit()
    return _present(db, [task], TaskActionOut, next=_present(db, [nxt])[0] if nxt else None)[0]


@router.get("/teammates", response_model=list[Teammate])
def teammates(p: Principal = Depends(require("tasks.assign", "messages.send", "incidents.manage")),
              db: Session = Depends(get_db)):
    """The people on the team, to give a task or an alert to, or to add to a conversation."""
    rows = db.execute(select(User.id, User.full_name, Membership.role).join(Membership, Membership.user_id == User.id)
                      .where(Membership.active.is_(True), Membership.role.notin_(service.APP_ROLES))
                      .order_by(User.full_name)).all()
    return [Teammate(id=i, name=n, role=r) for i, n, r in rows]
