"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useConsole } from "@/features/console/console-provider";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { noteRecords } from "@/lib/api/scope";
import type { Schema } from "@/lib/api/types";
import { dayLabel, dayOf, type Priority, type Task } from "./model";

export const UNDO_MS = 7000;
type Update = Schema<"TaskUpdate">;
type Action = Schema<"TaskAction">["action"];

/** Every task the screen sorts: open, snoozed, given by you, and done in the last 30 days. */
export function useQueue(view: "mine" | "team") {
  const { me } = useConsole();
  return useQuery({
    queryKey: [me.organization.id, "tasks", "queue", view],
    queryFn: async () => {
      const items: Task[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 20; page++) {
        const out = await unwrap(api.GET("/api/v1/tasks", { params: { query: { tab: "queue", view, limit: 100, cursor } } }));
        items.push(...(out.items as Task[]));
        if (!out.page.has_more || !out.page.next_cursor) break;
        cursor = out.page.next_cursor;
      }
      noteRecords(items);
      return items;
    },
    refetchInterval: 60_000,
  });
}

export function useTaskCounts() {
  const { me, can } = useConsole();
  return useQuery({
    queryKey: [me.organization.id, "tasks", "counts"],
    queryFn: () => unwrap(api.GET("/api/v1/tasks/counts")),
    enabled: can("tasks.read"),
    refetchInterval: 60_000,
  });
}

const s = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The changes the screen makes, each with the server's answer: a toast that says what happened, with Undo for
 * completing, snoozing, reassigning and changing priority (it puts back what was there).
 */
export function useTaskActions() {
  const { me, notify } = useConsole();
  const client = useQueryClient();
  const zone = me.organization.timezone;
  const refresh = useCallback(() => client.invalidateQueries({ queryKey: [me.organization.id] }), [client, me.organization.id]);

  const action = (t: Task, body: Omit<Schema<"TaskAction">, "action"> & { action: Action }) =>
    unwrap(api.POST("/api/v1/tasks/{task_id}/actions", { params: { path: { task_id: t.id } }, body }));
  const patch = (t: Task, body: Update) => unwrap(api.PATCH("/api/v1/tasks/{task_id}", { params: { path: { task_id: t.id } }, body }));

  /** Run a change on each task; say what happened, and what couldn't be done. */
  const each = useCallback(
    async <T>(tasks: Task[], run: (t: Task) => Promise<T>, done: (ok: { task: Task; out: T }[]) => string, undo?: (ok: { task: Task; out: T }[]) => Promise<unknown>) => {
      const results = await Promise.allSettled(tasks.map(run));
      const ok = results.flatMap((r, i) => (r.status === "fulfilled" ? [{ task: tasks[i]!, out: r.value }] : []));
      const failed = results.flatMap((r) => (r.status === "rejected" ? [errorMessage(r.reason)] : []));
      await refresh();
      if (!ok.length) {
        notify(failed[0] ?? "That didn’t work", true);
        return ok;
      }
      const text = done(ok) + (failed.length ? ` · ${s(failed.length, "couldn’t", "couldn’t")}: ${failed[0]}` : "");
      notify(text, failed.length > 0, undo ? { ms: UNDO_MS, action: { label: "Undo", run: () => void undo(ok).then(refresh, (e) => notify(errorMessage(e), true)) } } : undefined);
      return ok;
    },
    [notify, refresh],
  );

  const nextLabel = (next: { due_at?: string | null } | null | undefined) => {
    if (!next?.due_at) return "";
    const today = dayOf(Date.now(), zone);
    const label = dayLabel(dayOf(next.due_at, zone), today);
    return ` · next one created for ${label === "Today" || label === "Tomorrow" ? label.toLowerCase() : label}`;
  };

  return {
    refresh,
    complete: (tasks: Task[]) =>
      each(
        tasks,
        (t) => action(t, { action: "complete", version: t.version }),
        (ok) => (ok.length === 1 ? `Done: ${ok[0]!.task.title}${nextLabel(ok[0]!.out.next)}` : `${s(ok.length, "task")} done${ok.some((x) => x.out.next) ? " · next ones created" : ""}`),
        (ok) => Promise.all(ok.flatMap(({ task, out }) => [action(task, { action: "reopen" }), ...(out.next ? [action(out.next as Task, { action: "cancel", note: "Undone" })] : [])])),
      ),
    reopen: (tasks: Task[]) => each(tasks, (t) => action(t, { action: "reopen", version: t.version }), (ok) => (ok.length === 1 ? `Reopened: ${ok[0]!.task.title}` : `${s(ok.length, "task")} reopened`)),
    snooze: (tasks: Task[], until: number, when: string) =>
      each(
        tasks,
        (t) => action(t, { action: "snooze", until: new Date(until).toISOString() }),
        (ok) => `${ok.length === 1 ? "Snoozed" : `${s(ok.length, "task")} snoozed`} until ${when}`,
        (ok) => Promise.all(ok.map(({ task }) => (task.snoozed_until && Date.parse(task.snoozed_until) > Date.now() ? action(task, { action: "snooze", until: task.snoozed_until }) : action(task, { action: "unsnooze" })))),
      ),
    unsnooze: (tasks: Task[]) => each(tasks, (t) => action(t, { action: "unsnooze" }), (ok) => (ok.length === 1 ? `Back on the list: ${ok[0]!.task.title}` : `${s(ok.length, "task")} back on the list`)),
    reassign: (tasks: Task[], userId: string, name: string) =>
      each(
        tasks,
        (t) => action(t, { action: "assign", assignee_user_id: userId }),
        (ok) => `${ok.length === 1 ? "Given" : `${s(ok.length, "task")} given`} to ${name}${userId === me.user.id ? "" : " · they were notified"}`,
        (ok) => Promise.all(ok.filter(({ task }) => task.assignee).map(({ task }) => action(task, { action: "assign", assignee_user_id: task.assignee!.id }))),
      ),
    priority: (tasks: Task[], priority: Priority, label: string) =>
      each(
        tasks,
        (t) => patch(t, { priority }),
        (ok) => (ok.length === 1 ? `Priority set to ${label}` : `${s(ok.length, "task")} set to ${label}`),
        (ok) => Promise.all(ok.map(({ task }) => patch(task, { priority: task.priority }))),
      ),
    escalate: (t: Task) => each([t], (x) => action(x, { action: "escalate" }), (ok) => `Escalated to ${ok[0]!.out.assignee?.name ?? "a manager"} · they were notified`),
    moveDue: (t: Task, due: number, where: string) =>
      each([t], (x) => patch(x, { due_at: new Date(due).toISOString(), all_day: false }), () => `Moved to ${where}`, () => patch(t, { due_at: t.due_at ?? null, all_day: t.all_day })),
    patch: async (t: Task, body: Update, said: string) => {
      try {
        const out = await patch(t, body);
        await refresh();
        notify(said);
        return out;
      } catch (e) {
        notify(errorMessage(e), true);
        return null;
      }
    },
  };
}
