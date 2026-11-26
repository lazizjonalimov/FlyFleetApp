"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { ConsolePortal } from "@/features/console/portal";
import { goTo } from "@/features/console/shell";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import {
  DEFAULT_FILTERS, dayOf, inTab, LINKED, matches, PRIORITY, sameFilters, sectionOf, shortcut, snoozeChoices, sorted, TABS,
  viewFilters, viewParams, type Filters, type Priority, type Task,
} from "./model";
import { NewTask } from "./new-task";
import { ChoiceDialog, Insights, RemindersDialog, type Choice } from "./task-dialogs";
import { TaskDrawer, type Person } from "./task-drawer";
import { TaskBoard, TaskCalendar, TaskList } from "./task-views";
import { useQueue, useTaskActions, useTaskCounts } from "./use-tasks";

export { dueLabel } from "./model";

type Mode = "list" | "board" | "calendar";
type Range = "today" | "week" | "month";
type Menu = { kind: "snooze" | "assign" | "priority"; tasks: Task[] } | null;
const MANAGERS = ["owner", "admin"];
const KEYS = "Keys: J/K move · O open · E done · S snooze · X select · C new task · 1/2/3 views · Esc close";

/** My tasks: what the signed-in person has to do, from teammates, alerts, exceptions and repeating work. */
export function TasksScreen() {
  const { me, can, set, notify } = useConsole();
  const router = useRouter();
  const client = useQueryClient();
  const zone = me.organization.timezone;
  const all = me.organization.slug === "all";
  const manager = !all && MANAGERS.includes(me.organization.role);
  const [view, setView] = useState<"mine" | "team">("mine");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [mode, setMode] = useState<Mode>("list");
  const [range, setRange] = useState<Range>("today");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [creating, setCreating] = useState(false);
  const [reminders, setReminders] = useState(false);
  const [insights, setInsights] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const team = view === "team" && manager;
  const queue = useQueue(team ? "team" : "mine");
  const counts = useTaskCounts();
  const actions = useTaskActions();
  const mates = useQuery({ queryKey: [me.organization.id, "teammates"], queryFn: () => unwrap(api.GET("/api/v1/teammates")), enabled: !all && can("tasks.assign"), staleTime: 60_000 });
  const views = useQuery({ queryKey: [me.organization.id, "saved-views", "tasks"], queryFn: () => unwrap(api.GET("/api/v1/saved-views", { params: { query: { resource: "tasks" } } })), enabled: !all && queue.isSuccess, staleTime: 60_000 });

  const tasks = useMemo(() => queue.data ?? [], [queue.data]);
  const people: Person[] = useMemo(() => {
    const out: Person[] = [{ id: me.user.id, name: me.user.full_name }];
    for (const m of mates.data ?? []) if (m.id !== me.user.id) out.push({ id: m.id, name: m.name });
    return out;
  }, [mates.data, me.user]);
  const companies = useMemo(() => {
    const seen = new Map<string, NonNullable<Task["organization"]>>();
    for (const t of tasks) if (t.organization) seen.set(t.organization.slug, t.organization);
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const ofTab = (tab: Filters["tab"]) => tasks.filter((t) => inTab(t, tab, me.user.id, team, now, zone));
  const tabCounts = Object.fromEntries(TABS.map((t) => [t.key, ofTab(t.key).length])) as Record<Filters["tab"], number>;
  const shown = sorted(ofTab(filters.tab).filter((t) => matches(t, filters)), filters.sort);
  const filtered = filters.priority !== "all" || filters.linked !== "all" || filters.company !== "all" || filters.q.trim() !== "";
  const sections = mode === "list" && (filters.tab === "open" || filters.tab === "today");
  // The order J and K move through: the list as shown, section by section.
  const order = sections ? (["overdue", "now", "today", "later"] as const).flatMap((s) => shown.filter((t) => sectionOf(t, now, zone) === s)) : shown;
  const doneToday = tasks.filter((t) => t.status === "done" && t.done_at && dayOf(t.done_at, zone) === dayOf(now, zone) && (team || t.assignee?.id === me.user.id)).length;
  const mine = tasks.filter((t) => t.assignee?.id === me.user.id && t.status === "open");
  const preview = `${mine.length} open · ${mine.filter((t) => t.due_at && dayOf(t.due_at, zone) === dayOf(now, zone)).length} due today · ${mine.filter((t) => sectionOf(t, now, zone) === "overdue").length} overdue`;
  const hidden = counts.data?.hidden ?? 0;
  const chosen = tasks.filter((t) => selected.has(t.id));

  const put = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const clearSelection = () => setSelected(new Set());
  const toggle = (t: Task) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(t.id)) next.delete(t.id);
    else next.add(t.id);
    return next;
  });

  // Where a task's action leads: the load (or the dispatch board to assign it), the truck, the driver, the record.
  const go = (t: Task) => {
    const slug = t.organization?.slug ?? me.organization.slug;
    const here = !t.organization || slug === me.organization.slug;
    if (t.entity_type === "load" && t.entity_id) {
      if (here && t.action === "Assign" && can("dispatch.assign")) return set({ ...goTo("dispatch"), panel: "assign", assignLoad: t.entity_id });
      return here ? set({ screen: "load", loadId: t.entity_id, drawer: null }) : router.push(`/${slug}/loads/${t.entity_id}`);
    }
    if (t.entity_type === "vehicle" && t.entity_id && here && can("tracking.read") && t.source === "incident") return set({ ...goTo("tracking"), vehicle: t.entity_id });
    const paths: Record<string, string> = { driver: "drivers", vehicle: "equipment/trucks", trailer: "equipment/trailers", statement: "finance/statements" };
    if (t.entity_type && t.entity_id && paths[t.entity_type]) return router.push(`/${slug}/${paths[t.entity_type]}/${t.entity_id}`);
    if (t.entity_type === "invoice") return router.push(`/${slug}/finance/invoices`);
    if (t.entity_type === "customer") return router.push(`/${slug}/customers`);
    if (t.incident_id) return router.push(`/${slug}/alerts`);
    setDrawer(t.id);
  };

  const tick = (t: Task) => void (t.status === "done" || t.status === "cancelled" ? actions.reopen([t]) : actions.complete([t]));
  const openSnooze = (list: Task[]) => setMenu({ kind: "snooze", tasks: list.filter((t) => t.status === "open") });
  const handlers = { now, zone, open: (t: Task) => setDrawer(t.id), tick, go, snooze: (t: Task) => openSnooze([t]), moveDue: (t: Task, due: number, where: string) => void actions.moveDue(t, due, where) };

  // ---------------------------------------------------------------- keyboard, on this screen only
  const latest = useRef({ order, focus, drawer, menu, creating, reminders, selected, mode, tick, openSnooze, toggle });
  useEffect(() => {
    latest.current = { order, focus, drawer, menu, creating, reminders, selected, mode, tick, openSnooze, toggle };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = shortcut(event);
      if (!key) return;
      const s = latest.current;
      const overlay = !!(s.drawer || s.menu || s.creating || s.reminders);
      if (key === "Escape") {
        if (s.menu) setMenu(null);
        else if (s.creating) setCreating(false);
        else if (s.reminders) setReminders(false);
        else if (s.drawer) setDrawer(null);
        else if (s.selected.size) setSelected(new Set());
        return;
      }
      if (overlay) return;
      const focused = s.order.find((t) => t.id === s.focus) ?? null;
      if (key === "j" || key === "k") {
        if (s.mode !== "list" || !s.order.length) return;
        event.preventDefault();
        const at = s.order.findIndex((t) => t.id === s.focus);
        const next = key === "j" ? Math.min(at + 1, s.order.length - 1) : Math.max(at - 1, 0);
        const id = s.order[at === -1 ? 0 : next]!.id;
        setFocus(id);
        document.querySelector<HTMLElement>(`[data-task="${id}"] .tkt`)?.focus();
      } else if (key === "o" && focused) setDrawer(focused.id);
      else if (key === "e" && focused) s.tick(focused);
      else if (key === "s" && focused && focused.status === "open") s.openSnooze([focused]);
      else if (key === "x" && focused) {
        setSelecting(true);
        setMode("list");
        s.toggle(focused);
      } else if (key === "c") {
        event.preventDefault();
        setCreating(true);
      } else if (key === "1" || key === "2" || key === "3") setMode(key === "1" ? "list" : key === "2" ? "board" : "calendar");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------------------------------------------------------------- saved views
  const saveView = async (name: string) => {
    try {
      await unwrap(api.POST("/api/v1/saved-views", { body: { resource: "tasks", name: name.trim(), params: viewParams(filters), shared: false } }));
      await client.invalidateQueries({ queryKey: [me.organization.id, "saved-views", "tasks"] });
      setNaming(null);
      notify(`Saved view “${name.trim()}”`);
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  const removeView = async (id: string, name: string) => {
    try {
      await unwrap(api.DELETE("/api/v1/saved-views/{view_id}", { params: { path: { view_id: id } } }));
      await client.invalidateQueries({ queryKey: [me.organization.id, "saved-views", "tasks"] });
      notify(`Removed saved view “${name}”`);
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };

  // ---------------------------------------------------------------- menus
  const menuChoices = (m: NonNullable<Menu>): Choice[] => {
    if (m.kind === "snooze") return snoozeChoices(now, zone).map((c) => ({ label: c.label, detail: c.when, run: () => void actions.snooze(m.tasks, c.at, c.when).then(clearSelection) }));
    if (m.kind === "assign") return people.map((p) => ({ label: p.id === me.user.id ? `${p.name} (you)` : p.name, run: () => void actions.reassign(m.tasks, p.id, p.id === me.user.id ? "you" : p.name).then(clearSelection) }));
    return (["high", "medium", "low"] as Priority[]).map((p) => ({ label: PRIORITY[p].label, run: () => void actions.priority(m.tasks, p, PRIORITY[p].label).then(clearSelection) }));
  };
  const menuTitle = (m: NonNullable<Menu>) => (m.kind === "snooze" ? "Snooze until" : m.kind === "assign" ? "Reassign to" : "Set priority");
  const menuSub = (m: NonNullable<Menu>) => (m.tasks.length === 1 ? m.tasks[0]!.title : `${m.tasks.length} tasks`);

  const extra = all ? "company" : team ? "assignee" : null;
  const empty = !shown.length && queue.isSuccess;
  const tabLabel = TABS.find((t) => t.key === filters.tab)!.label;

  return (
    <>
      <div className="scr">
        <div className="ph">
          <div className="f1">
            <nav className="crumb" aria-label="Breadcrumb"><span>Overview</span><Icon className="s12" d="M9 6l6 6-6 6" /><b aria-current="page">My tasks</b></nav>
            <h1 className="h1">{team ? "My team’s tasks" : "My tasks"}</h1>
            <p className="sub">{all ? `Across ${companies.length || "your"} companies · from alerts, exceptions, teammates and repeating work` : team ? "Everyone’s open work in this company" : `From alerts, exceptions, teammates and repeating work · ${me.user.full_name.split(" ")[0]}’s queue`}</p>
          </div>
          <div className="r g8 wrap">
            {manager ? (
              <div className="seg" role="group" aria-label="Whose tasks">
                {(["mine", "team"] as const).map((v) => <button key={v} type="button" className={clsx(view === v && "on")} aria-pressed={view === v} onClick={() => { setView(v); clearSelection(); }}>{v === "mine" ? "My tasks" : "My team’s"}</button>)}
              </div>
            ) : null}
            <button type="button" className="btn" aria-pressed={insights} onClick={() => setInsights(!insights)}>Insights</button>
            <button type="button" className="btn" onClick={() => setReminders(true)}><Icon className="s14" d={I.bell} />Reminders</button>
            <button type="button" className="btn pri" onClick={() => setCreating(true)}><Icon className="s14 b" d="M12 5v14M5 12h14" />New task</button>
          </div>
        </div>
        {insights ? <Insights view={team ? "team" : "mine"} manager={manager} /> : null}
        <div className="tabs" role="tablist" aria-label="Task lists">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={filters.tab === t.key} className={clsx("tab", filters.tab === t.key && "on")} onClick={() => { put({ tab: t.key }); clearSelection(); }}>
              {t.label}<span className="tcnt">{tabCounts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="r g8 wrap" style={{ padding: "12px 24px 0" }}>
          <label className="search"><Icon className="s14" d={I.search} /><input placeholder="Search tasks" aria-label="Search tasks" value={filters.q} onChange={(e) => put({ q: e.currentTarget.value })} /></label>
          <select className="inp" aria-label="Priority" style={{ width: "140px", height: "32px" }} value={filters.priority} onChange={(e) => put({ priority: e.currentTarget.value as Filters["priority"] })}>
            <option value="all">Any priority</option>
            {(["high", "medium", "low"] as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
          </select>
          <select className="inp" aria-label="Linked item" style={{ width: "160px", height: "32px" }} value={filters.linked} onChange={(e) => put({ linked: e.currentTarget.value as Filters["linked"] })}>
            <option value="all">Any linked item</option>
            {LINKED.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
            <option value="none">Not linked</option>
          </select>
          {all ? (
            <select className="inp" aria-label="Company" style={{ width: "190px", height: "32px" }} value={filters.company} onChange={(e) => put({ company: e.currentTarget.value })}>
              <option value="all">All companies</option>
              {companies.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          ) : null}
          <select className="inp" aria-label="Sort" style={{ width: "190px", height: "32px" }} value={filters.sort} onChange={(e) => put({ sort: e.currentTarget.value as Filters["sort"] })}>
            <option value="smart">Priority, then due</option>
            <option value="due">Due soonest</option>
            <option value="new">Newest first</option>
          </select>
          <span className="sp"></span>
          <div className="seg" role="group" aria-label="View">
            {(["list", "board", "calendar"] as Mode[]).map((m) => <button key={m} type="button" className={clsx(mode === m && "on")} aria-pressed={mode === m} onClick={() => { setMode(m); if (m !== "list") { setSelecting(false); clearSelection(); } }}>{m === "list" ? "List" : m === "board" ? "Board" : "Calendar"}</button>)}
          </div>
          {mode === "calendar" ? (
            <div className="seg" role="group" aria-label="Calendar range">
              {(["today", "week", "month"] as Range[]).map((r) => <button key={r} type="button" className={clsx(range === r && "on")} aria-pressed={range === r} onClick={() => setRange(r)}>{r === "today" ? "Today" : r === "week" ? "Week" : "Month"}</button>)}
            </div>
          ) : null}
          {mode === "list" ? <button type="button" className="btn sm" aria-pressed={selecting} onClick={() => { setSelecting(!selecting); clearSelection(); }}>{selecting ? "Done selecting" : "Select"}</button> : null}
        </div>
        {!all ? (
          <div className="r g6 wrap" style={{ padding: "8px 24px 0" }} role="group" aria-label="Saved views">
            <span className="fs12 mu">Saved views</span>
            {(views.data ?? []).map((v) => {
              const vf = viewFilters(v.params);
              const pressed = sameFilters(vf, filters);
              return (
                <span key={v.id} className="r g2">
                  <button type="button" className="btn sm" aria-pressed={pressed} onClick={() => { setFilters(vf); clearSelection(); }}>{v.name}</button>
                  {v.owner_user_id === me.user.id ? <button type="button" className="btn ghost icon sm" aria-label={`Remove saved view ${v.name}`} onClick={() => void removeView(v.id, v.name)}><Icon className="s12" d="M18 6L6 18M6 6l12 12" /></button> : null}
                </span>
              );
            })}
            {naming !== null ? (
              <form className="r g6" onSubmit={(e) => { e.preventDefault(); if (naming.trim().length >= 2) void saveView(naming); }}>
                <label className="sr-only" htmlFor="tk-view-name">Name this view</label>
                <input id="tk-view-name" className="inp" style={{ width: "170px", height: "28px" }} placeholder="Name this view" maxLength={80} value={naming} autoFocus onChange={(e) => setNaming(e.currentTarget.value)} />
                <button type="submit" className="btn pri sm" disabled={naming.trim().length < 2}>Save</button>
                <button type="button" className="btn sm" onClick={() => setNaming(null)}>Cancel</button>
              </form>
            ) : <button type="button" className="btn ghost sm" onClick={() => setNaming("")}>Save current filters…</button>}
          </div>
        ) : null}

        <div style={{ padding: "12px 24px 0" }}>
          {queue.isError ? <section className="card"><ErrorState error={queue.error} retry={() => void queue.refetch()} /></section>
            : queue.isPending ? <section className="card"><Skeleton rows={6} /></section>
            : mode === "board" ? <TaskBoard tasks={shown.filter((t) => t.status === "open")} {...handlers} />
            : mode === "calendar" ? <TaskCalendar tasks={shown.filter((t) => t.status === "open" || t.status === "snoozed")} range={range} undated={shown.filter((t) => !t.due_at).length} {...handlers} />
            : (
              <section className="card oh" aria-label={tabLabel}>
                {empty ? (
                  filtered ? (
                    <EmptyState icon={I.search} title="No tasks match" text="Nothing on this list matches the search and filters.">
                      <button type="button" className="btn sm" onClick={() => setFilters({ ...DEFAULT_FILTERS, tab: filters.tab })}>Clear filters</button>
                    </EmptyState>
                  ) : (
                    <EmptyState icon={I.check} title={filters.tab === "done" ? "Nothing done in the last 30 days" : filters.tab === "snoozed" ? "Nothing is snoozed" : filters.tab === "by_me" ? "You haven’t given anyone a task" : "You’re all caught up"}
                      text={filters.tab === "open" || filters.tab === "today" ? `${doneToday} ${doneToday === 1 ? "task" : "tasks"} done today. Alerts you own, exceptions and teammates give you tasks here.` : undefined}>
                      <button type="button" className="btn sm" onClick={() => setCreating(true)}><Icon className="s14" d="M12 5v14M5 12h14" />New task</button>
                    </EmptyState>
                  )
                ) : (
                  <TaskList tasks={shown} sections={sections} extra={extra} selecting={selecting} selected={selected} toggle={toggle}
                    toggleAll={() => setSelected(shown.every((t) => selected.has(t.id)) ? new Set() : new Set(shown.map((t) => t.id)))} focus={focus} {...handlers} />
                )}
              </section>
            )}
        </div>
        <div className="r g8 fs12 mu wrap" style={{ padding: "10px 24px 24px" }}>
          <span className="f1">{`${shown.length} shown · creation, completion and reassignment are recorded in the audit log.`} {`${KEYS}.`}</span>
          {hidden ? <span>{`${hidden} ${hidden === 1 ? "task is" : "tasks are"} hidden because your role can’t open what they link to.`}</span> : null}
        </div>
      </div>

      {selected.size ? (
        <div className="bulk" role="toolbar" aria-label="Bulk actions">
          <span className="fs13 w5" style={{ marginRight: "6px" }} aria-live="polite">{`${selected.size} selected`}</span>
          <span style={{ width: "1px", height: "20px", background: "#2A3550", marginRight: "4px" }}></span>
          <button type="button" onClick={() => void actions.complete(chosen.filter((t) => t.status === "open" || t.status === "snoozed")).then(clearSelection)}>Complete</button>
          <button type="button" onClick={() => openSnooze(chosen)}>Snooze…</button>
          <button type="button" onClick={() => setMenu({ kind: "assign", tasks: chosen })}>Reassign…</button>
          <button type="button" onClick={() => setMenu({ kind: "priority", tasks: chosen })}>Priority…</button>
          <button type="button" className="bx" aria-label="Clear selection" onClick={clearSelection}><Icon className="s14" d="M18 6L6 18M6 6l12 12" /></button>
        </div>
      ) : null}
      {drawer ? <TaskDrawer id={drawer} tasks={tasks} people={people} close={() => setDrawer(null)} openTask={setDrawer} go={go} snooze={(t) => openSnooze([t])} /> : null}
      {menu && menu.tasks.length ? <ConsolePortal><ChoiceDialog title={menuTitle(menu)} sub={menuSub(menu)} choices={menuChoices(menu)} onClose={() => setMenu(null)} /></ConsolePortal> : null}
      {creating ? <ConsolePortal><NewTask onClose={() => setCreating(false)} people={people} companies={all ? me.memberships.filter((m) => m.status === "active").map((m) => ({ id: m.id, name: m.name })) : undefined} /></ConsolePortal> : null}
      {reminders ? <ConsolePortal><RemindersDialog preview={preview} onClose={() => setReminders(false)} /></ConsolePortal> : null}
    </>
  );
}
