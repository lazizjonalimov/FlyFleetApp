"""The dashboard's figures: six per role, each with the list behind it, a comparison with the period before, and its
last seven points.

A figure's number is that list's own count: it is asked of the list endpoint itself, in-process, with the same
parameters the card opens the list with, so the two can't disagree. Figures that count events in a period
(deliveries, loads late, loads waiting for a driver, invoices issued) are counted again for each of the seven
periods. Figures that are a state (drivers available, trucks down, overdue invoices…) can't be counted for the past,
so their value is kept once a day in `dashboard_snapshots` and the comparison and points come from there.
"""
import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal

import httpx
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.deps import Principal
from app.modules.reports.models import DashboardSnapshot

Period = Literal["today", "week", "month"]
Good = Literal["up", "down", "neutral"]
SINCE = {"today": "yesterday", "week": "last week", "month": "last month"}


# ---------------------------------------------------------------- periods
def buckets(today: date, period: Period, n: int = 7) -> list[tuple[date, date]]:
    """The last `n` periods, oldest first, the current one last: days, weeks from Monday, or calendar months."""
    out = []
    if period == "today":
        for i in range(n - 1, -1, -1):
            day = today - timedelta(days=i)
            out.append((day, day))
    elif period == "week":
        monday = today - timedelta(days=today.weekday())
        for i in range(n - 1, -1, -1):
            first = monday - timedelta(weeks=i)
            out.append((first, first + timedelta(days=6)))
    else:
        first = today.replace(day=1)
        months = [first]
        for _ in range(n - 1):
            first = (first - timedelta(days=1)).replace(day=1)
            months.append(first)
        for first in reversed(months):
            last = (first + timedelta(days=32)).replace(day=1) - timedelta(days=1)
            out.append((first, last))
    return out


# ---------------------------------------------------------------- the figures
@dataclass
class Spec:
    key: str
    needs: tuple[str, ...]
    screen: str
    resource: str
    good: Good
    label: Callable[[Period], str]
    definition: Callable[[Period], str]
    # the list's parameters for a period (first, last day); for a state figure the period is ignored
    params: Callable[[Period, date, date], dict]
    flow: Callable[[Period], bool] = lambda period: False
    tone: str = "mu"
    # an optional total shown after the value ("/ 42") and a line under it, as extra counts of other lists
    total: tuple[str, dict] | None = None
    sub: Callable[[Period, int, dict[str, int]], str] = lambda period, value, extra: ""
    extra: dict[str, tuple[str, Callable[[Period, date, date], dict]]] = field(default_factory=dict)


def _word(period: Period) -> str:
    return {"today": "today", "week": "this week", "month": "this month"}[period]


def _range(field_from: str, field_to: str):
    return lambda period, first, last: {field_from: first.isoformat(), field_to: last.isoformat()}


DELIVERED = ["delivered", "pod_review", "completed"]

SPECS: dict[str, Spec] = {s.key: s for s in [
    Spec("unassigned", ("loads.read",), "loads", "loads", "down", tone="warn",
         label=lambda p: "Unassigned loads" if p == "today" else f"Unassigned {_word(p)}",
         definition=lambda p: ("Unassigned loads: loads with a pickup in the next 24 hours (or already past) and no driver "
                               "assigned." if p == "today" else
                               f"Unassigned {_word(p)}: loads picking up {_word(p)} that have no driver assigned."),
         params=lambda p, a, b: {"view": "unassigned_soon"} if p == "today" else
         {"view": "unassigned", "pickup_from": a.isoformat(), "pickup_to": b.isoformat()},
         flow=lambda p: p != "today",
         sub=lambda p, v, x: "Pick up within 24 h, no driver" if p == "today" else f"Pick up {_word(p)}, no driver"),
    Spec("late_or_at_risk", ("loads.read",), "loads", "loads", "down", tone="bad",
         label=lambda p: "Late or at risk" if p == "today" else f"Late or at risk · {p}",
         definition=lambda p: ("Late or at risk: loads past a pickup or delivery appointment, or picking up within 24 hours "
                               "with no driver." if p == "today" else
                               f"Late or at risk · {p}: loads due to deliver {_word(p)} that were delivered after the "
                               "appointment, or are late or at risk now."),
         params=lambda p, a, b: {"view": "at_risk"} if p == "today" else
         {"view": "late_or_at_risk", "delivery_from": a.isoformat(), "delivery_to": b.isoformat()},
         flow=lambda p: p != "today",
         sub=lambda p, v, x: ("Nothing late right now" if not v else "Missed or about to miss an appointment")
         if p == "today" else f"Due {_word(p)}"),
    Spec("deliveries", ("loads.read",), "loads", "loads", "neutral", tone="info",
         label=lambda p: f"Deliveries {_word(p)}",
         definition=lambda p: f"Deliveries {_word(p)}: loads with a delivery appointment {_word(p)}, drafts and cancelled "
                              "loads aside.",
         params=lambda p, a, b: {"view": "deliveries", "delivery_from": a.isoformat(), "delivery_to": b.isoformat()},
         flow=lambda p: True,
         extra={"delivered": ("loads", lambda p, a, b: {"view": "deliveries", "delivery_from": a.isoformat(),
                                                         "delivery_to": b.isoformat(), "status": DELIVERED})},
         sub=lambda p, v, x: f"{x.get('delivered', 0)} delivered · {max(0, v - x.get('delivered', 0))} to go"),
    Spec("drivers_available", ("drivers.read",), "drivers", "drivers", "up", tone="ok",
         label=lambda p: "Drivers available",
         definition=lambda p: "Drivers available: active drivers who aren't on a load and whose licence, medical card "
                              "and required papers are all in date.",
         params=lambda p, a, b: {"kind": "available"}, total=("drivers", {"status": "active"}),
         sub=lambda p, v, x: "Active, free and qualified"),
    Spec("trucks_unavailable", ("equipment.read",), "trucks", "vehicles", "down", tone="mu",
         label=lambda p: "Trucks unavailable",
         definition=lambda p: "Trucks unavailable: trucks in the shop or out of service.",
         params=lambda p, a, b: {"kind": "shop"}, total=("vehicles", {}),
         sub=lambda p, v, x: "In shop or out of service" if v else "Every truck can run"),
    Spec("overdue_invoices", ("invoices.read",), "invoices", "invoices", "down", tone="bad",
         label=lambda p: "Overdue invoices",
         definition=lambda p: "Overdue invoices: issued invoices past their due date with a balance still owed.",
         params=lambda p, a, b: {"overdue": "true"}, sub=lambda p, v, x: "Past due, not yet paid"),
    Spec("missing_pod", ("loads.read",), "loads", "loads", "down", tone="bad",
         label=lambda p: "POD missing",
         definition=lambda p: "POD missing: delivered loads still waiting for proof of delivery, which blocks invoicing.",
         params=lambda p, a, b: {"view": "missing_pod"}, sub=lambda p, v, x: "Blocks invoicing"),
    Spec("drivers_blocked", ("drivers.read", "safety.read"), "drivers", "drivers", "down", tone="bad",
         label=lambda p: "Drivers who can’t be dispatched",
         definition=lambda p: "Drivers who can’t be dispatched: an expired licence, medical card or required "
                              "qualification.",
         params=lambda p, a, b: {"qualification": "blocked"}, sub=lambda p, v, x: "Expired papers"),
    Spec("drivers_expiring", ("drivers.read", "safety.read"), "drivers", "drivers", "down", tone="warn",
         label=lambda p: "Papers expiring",
         definition=lambda p: "Papers expiring: drivers with a licence, medical card or qualification expiring within "
                              "30 days.",
         params=lambda p, a, b: {"qualification": "expiring"}, sub=lambda p, v, x: "Within 30 days"),
    # billing
    Spec("ready_to_invoice", ("invoices.read", "loads.read"), "loads", "loads", "neutral", tone="brand",
         label=lambda p: "Ready to invoice",
         definition=lambda p: "Ready to invoice: completed loads with approved paperwork that aren’t on an invoice yet.",
         params=lambda p, a, b: {"view": "ready_to_invoice"}, sub=lambda p, v, x: "Completed, not yet billed"),
    Spec("pod_review", ("loads.read",), "loads", "loads", "down", tone="info",
         label=lambda p: "POD review",
         definition=lambda p: "POD review: delivered loads whose proof of delivery is waiting to be approved.",
         params=lambda p, a, b: {"status": ["pod_review"]}, sub=lambda p, v, x: "Approve to invoice"),
    Spec("draft_invoices", ("invoices.read",), "invoices", "invoices", "neutral", tone="mu",
         label=lambda p: "Draft invoices",
         definition=lambda p: "Draft invoices: invoices started but not issued.",
         params=lambda p, a, b: {"status": "draft"}, sub=lambda p, v, x: "Started, not issued"),
    Spec("invoiced", ("invoices.read",), "invoices", "invoices", "up", tone="ok",
         label=lambda p: f"Invoiced {_word(p)}",
         definition=lambda p: f"Invoiced {_word(p)}: invoices issued {_word(p)}.",
         params=_range("issued_from", "issued_to"), flow=lambda p: True, sub=lambda p, v, x: "Invoices issued"),
    Spec("statements_to_approve", ("settlements.read",), "settlements", "settlements", "down", tone="warn",
         label=lambda p: "Statements to approve",
         definition=lambda p: "Statements to approve: driver pay statements in draft, waiting for approval.",
         params=lambda p, a, b: {"status": "draft"}, sub=lambda p, v, x: "Driver pay in draft"),
]}

OPERATIONS = ["unassigned", "late_or_at_risk", "deliveries", "drivers_available", "trucks_unavailable",
              "overdue_invoices", "missing_pod", "drivers_blocked", "drivers_expiring"]
BILLING = ["ready_to_invoice", "pod_review", "draft_invoices", "overdue_invoices", "invoiced", "statements_to_approve",
           "missing_pod"]


def choose(p: Principal, billing: bool) -> list[Spec]:
    """Six figures the role can see, in the order that matters for its work."""
    order = BILLING if billing else OPERATIONS
    picked = [SPECS[key] for key in order if all(p.can(perm) for perm in SPECS[key].needs)]
    # overdue invoices take the sixth place from POD missing when the role reads invoices
    if not billing and any(s.key == "overdue_invoices" for s in picked):
        picked = [s for s in picked if s.key != "missing_pod"]
    return picked[:6]


# ---------------------------------------------------------------- what the dashboard gets
class Change(BaseModel):
    delta: int | None = Field(description="This period minus the one before; empty when there's no earlier figure")
    tone: Literal["good", "bad", "neutral"]
    text: str = Field(description="In words, with an arrow: \"▲ 2 vs yesterday\"")


class Target(BaseModel):
    screen: str = Field(description="The console screen that shows the list")
    resource: str = Field(description="The API list behind the figure")
    params: dict[str, str | list[str]] = Field(description="Its parameters: the list's count is the figure")
    label: str


class Kpi(BaseModel):
    key: str
    label: str
    tone: str
    good: Good = Field(description="Which way is better: up, down, or neither")
    value: int
    total: int | None = Field(default=None, description="Shown after the value, as \"/ 42\"")
    sub: str
    definition: str
    change: Change
    series: list[int | None] = Field(description="Seven points, oldest first, the current period last")
    target: Target


class KpisOut(BaseModel):
    period: Period
    today: date
    since: str
    kpis: list[Kpi]


def _change(spec: Spec, now: int, before: int | None, period: Period) -> Change:
    since = SINCE[period]
    if before is None:
        return Change(delta=None, tone="neutral", text=f"No figure for {since} yet")
    delta = now - before
    if delta == 0:
        return Change(delta=0, tone="neutral", text=f"No change vs {since}")
    better = (delta > 0) == (spec.good == "up")
    tone = "neutral" if spec.good == "neutral" else ("good" if better else "bad")
    return Change(delta=delta, tone=tone, text=f"{'▲' if delta > 0 else '▼'} {abs(delta)} vs {since}")


def _scope_key(p: Principal) -> str:
    return f"team:{p.scope.team_id}" if p.scope and p.scope.team_id else ("team:none" if p.scope else "company")


def _snapshots(db: Session, p: Principal, keys: list[str], first: date, today: date, values: dict[str, int]) -> dict:
    """Keep today's value of each state figure, and read back the days before."""
    scope = _scope_key(p)
    for key in keys:
        stmt = insert(DashboardSnapshot).values(organization_id=p.org_id, scope_key=scope, kpi=key, day=today,
                                                value=values[key])
        db.execute(stmt.on_conflict_do_update(index_elements=["organization_id", "scope_key", "kpi", "day"],
                                              set_={"value": stmt.excluded.value}))
    db.commit()
    rows = db.execute(select(DashboardSnapshot.kpi, DashboardSnapshot.day, DashboardSnapshot.value)
                      .where(DashboardSnapshot.scope_key == scope, DashboardSnapshot.kpi.in_(keys),
                             DashboardSnapshot.day >= first, DashboardSnapshot.day <= today)).all()
    out: dict[str, dict[date, int]] = {key: {} for key in keys}
    for kpi, day, value in rows:
        out[kpi][day] = value
    return out


async def compute(app, headers: dict, db: Session, p: Principal, period: Period, billing: bool) -> KpisOut:
    """Every figure for the caller's role, counted by the lists themselves."""
    today = p.today()
    periods = buckets(today, period)
    specs = choose(p, billing)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://flyfleet.internal", timeout=60) as client:
        async def count(resource: str, params: dict) -> int:
            query = {**params, "limit": 1, "count": "true"}
            r = await client.get(f"/api/v1/{resource}", params=query, headers=headers)
            return (r.json()["page"].get("total_count") or 0) if r.status_code < 400 else 0

        jobs: dict[tuple, asyncio.Task] = {}
        for spec in specs:
            flow = spec.flow(period)
            for i, (a, b) in enumerate(periods if flow else periods[-1:]):
                at = i if flow else 6
                jobs[(spec.key, "value", at)] = asyncio.ensure_future(count(spec.resource, spec.params(period, a, b)))
            if spec.total:
                jobs[(spec.key, "total", 0)] = asyncio.ensure_future(count(*spec.total))
            for name, (resource, params) in spec.extra.items():
                jobs[(spec.key, name, 0)] = asyncio.ensure_future(count(resource, params(period, *periods[-1])))
        done = dict(zip(jobs, await asyncio.gather(*jobs.values()), strict=True))

    values = {spec.key: done[(spec.key, "value", 6)] for spec in specs}
    states = [spec.key for spec in specs if not spec.flow(period)]
    history = _snapshots(db, p, states, periods[0][0], today, values) if states else {}

    out = []
    for spec in specs:
        if spec.flow(period):
            series: list[int | None] = [done[(spec.key, "value", i)] for i in range(7)]
        else:
            days = history[spec.key]
            # a period's figure is the last one kept in it; the current period's is now
            series = [max(((d, v) for d, v in days.items() if a <= d <= b), default=(None, None))[1]
                      for a, b in periods[:-1]] + [values[spec.key]]
        extra = {name: done[(spec.key, name, 0)] for name in spec.extra}
        value = values[spec.key]
        a, b = periods[-1]
        params = {k: v for k, v in spec.params(period, a, b).items()}
        out.append(Kpi(
            key=spec.key, label=spec.label(period), tone=spec.tone, good=spec.good, value=value,
            total=done[(spec.key, "total", 0)] if spec.total else None, sub=spec.sub(period, value, extra),
            definition=spec.definition(period), change=_change(spec, value, series[-2], period), series=series,
            target=Target(screen=spec.screen, resource=spec.resource, params=params, label=spec.label(period))))
    return KpisOut(period=period, today=today, since=SINCE[period], kpis=out)
