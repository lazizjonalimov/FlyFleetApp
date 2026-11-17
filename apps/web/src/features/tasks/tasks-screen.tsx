"use client";

import { useState } from "react";
import { cell } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import { ListScreen } from "@/features/lists/list-screen";
import { type ListPage, type ListQuery, useList } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { plural } from "@/lib/format/text";
import { NewTask } from "./new-task";

type Task = Schema<"TaskOut">;
type TabKey = "open" | "today" | "by_me" | "done";
const PRIORITY: Record<string, [string, string]> = { high: ["High", "bad"], medium: ["Medium", "warn"], low: ["Low", "mu"] };

/** When a task is due, as a queue reads it: "Now" once it is, the time today, or the day. */
export function dueLabel(t: Pick<Task, "due_at" | "all_day" | "status" | "done_at">, timeZone: string, now = Date.now()): string {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const date = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
  const today = key.format(new Date(now));
  const tomorrow = key.format(new Date(now + 86_400_000));
  if (t.status !== "open") {
    if (!t.done_at) return "—";
    return key.format(new Date(t.done_at)) === today ? time.format(new Date(t.done_at)) : date.format(new Date(t.done_at));
  }
  if (!t.due_at) return "—";
  const at = new Date(t.due_at);
  const day = key.format(at);
  if (t.all_day) return day === today ? "Today" : day === tomorrow ? "Tomorrow" : date.format(at);
  if (at.getTime() <= now) return "Now";
  return day === today ? time.format(at) : day === tomorrow ? "Tomorrow" : date.format(at);
}

/** My tasks: what the signed-in person has to do, from teammates and from fleet alerts, most urgent first. */
export function TasksScreen() {
  const { me, can, set, state } = useConsole();
  const act = useAction();
  const [creating, setCreating] = useState(false);
  const tz = me.organization.timezone;
  const tab = (["open", "today", "by_me", "done"] as TabKey[])[typeof state.ltab === "number" ? state.ltab : 0] ?? "open";

  async function fetchPage(query: ListQuery): Promise<ListPage<Task>> {
    return unwrap(api.GET("/api/v1/tasks", { params: { query: {
      tab: (query.tab as TabKey) ?? "open", q: typeof query.q === "string" ? query.q : undefined,
      cursor: typeof query.cursor === "string" ? query.cursor : undefined, limit: typeof query.limit === "number" ? query.limit : 25, count: true,
    } } }));
  }
  const toggle = (t: Task) =>
    void act(
      () => unwrap(api.POST("/api/v1/tasks/{task_id}/actions", { params: { path: { task_id: t.id } }, body: { action: t.status === "open" ? "complete" : "reopen", version: t.version } })),
      t.status === "open" ? `Done: ${t.title}` : `Reopened: ${t.title}`,
    );
  // Where each task's one action leads, as the design has it per kind of task.
  const go = (t: Task) => {
    if (t.entity_type === "load" && t.entity_id) {
      if (t.action === "Assign" && can("dispatch.assign")) return set({ ...goTo("dispatch"), panel: "assign", assignLoad: t.entity_id });
      return set({ screen: "load", loadId: t.entity_id });
    }
    if (t.entity_type === "vehicle" && t.entity_id) return can("tracking.read") && t.source === "incident" ? set({ ...goTo("tracking"), vehicle: t.entity_id }) : set({ screen: "truck", unitId: t.entity_id, unitKind: "truck" });
    if (t.entity_type === "driver" && t.entity_id) return set({ screen: "driver", driverId: t.entity_id });
    if (t.entity_type === "customer") return set(goTo("customers"));
    if (t.incident_id) return set(goTo("alerts"));
  };
  const list = useList<Task>({
    key: "tasks",
    group: "Overview",
    title: "My tasks",
    sub: () => `Created from exceptions and by teammates · ${me.user.full_name.split(" ")[0]}’s queue`,
    placeholder: "Search tasks",
    fetch: fetchPage,
    defaultSort: "urgency",
    tabs: [
      { label: "Open", params: { tab: "open" } },
      { label: "Due today", params: { tab: "today" } },
      { label: "Assigned by me", params: { tab: "by_me" }, count: false },
      { label: "Done", params: { tab: "done" }, count: false },
    ],
    columns: [
      { label: "", width: "28px", cell: (t) => (tab === "by_me" ? cell.text("") : cell.check(t.status !== "open", () => toggle(t))) },
      {
        label: "Task",
        width: "minmax(0,1.7fr)",
        cell: (t) => cell.text(t.title, [tab === "by_me" && t.assignee ? `For ${t.assignee.name}` : "", t.status !== "open" ? (t.outcome ?? "") : (t.detail ?? "")].filter(Boolean).join(" · "), t.status === "open" ? "w5" : "w5 mu"),
        csv: (t) => `${t.title}${t.detail ? ` · ${t.detail}` : ""}`,
      },
      { label: tab === "done" ? "Done" : "Due", width: "92px", cell: (t) => cell.text(dueLabel(t, tz), "", "num t2"), csv: (t) => t.due_at ?? "" },
      { label: "Priority", width: "96px", cell: (t) => cell.badge(...(PRIORITY[t.priority] ?? ["Medium", "warn"])), csv: (t) => PRIORITY[t.priority]?.[0] ?? t.priority },
      { label: "Linked", width: "104px", cell: (t) => cell.text(t.entity_label ?? "—", "", t.entity_label ? "mono fs12 t2" : "mu"), csv: (t) => t.entity_label ?? "" },
      { label: "", width: "108px", cell: (t) => (t.status === "open" && (t.action || t.entity_id) ? cell.button(t.action ?? "Open", () => go(t)) : cell.text("")) },
    ],
    open: go,
    rowClass: (t) => (t.status === "open" ? "" : "dim"),
    actions: [{ l: "New task", cls: "pri", ic: "M12 5v14M5 12h14", go: () => setCreating(true) }],
    foot: (shown, total) => (total === null ? "" : tab === "open" ? plural(total, "open task") : tab === "today" ? `${plural(total, "task")} due today` : `${shown} shown`),
    empty: {
      icon: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
      title: tab === "done" ? "Nothing done yet" : tab === "by_me" ? "You haven’t given anyone a task" : "Nothing to do right now",
      text: tab === "done" ? "Tasks you finish, and alerts that clear, show here." : "Fleet alerts you own give you a task here, and teammates can give you one. New task adds one for you or a teammate.",
      action: { label: "Open Fleet alerts", go: () => set(goTo("alerts")) },
    },
  });
  return (
    <>
      <ListScreen list={list} />
      {creating ? <NewTask onClose={() => setCreating(false)} /> : null}
    </>
  );
}
