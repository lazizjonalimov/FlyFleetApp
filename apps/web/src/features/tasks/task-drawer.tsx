"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { addDays, at, clockOf, dayLabel, dayOf, linkedLabel, PRIORITY, REPEAT, slaOf, SOURCE, stepsDone, type Priority, type Task } from "./model";
import { useTaskActions } from "./use-tasks";

type Detail = Schema<"TaskDetail">;
export type Person = { id: string; name: string };
const CHECK = "M5 12l5 5 9-10";
const INFO = "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01";
const WAIT = "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01";
const REPEAT_IC = "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5";

/** Due choices: what it is now, no date, and the usual next times. */
function dueChoices(current: string | null, allDay: boolean, now: number, zone: string): { v: string; l: string }[] {
  const today = dayOf(now, zone);
  const monday = addDays(today, ((8 - new Date(`${today}T12:00:00Z`).getUTCDay()) % 7) || 7);
  const options = [
    { v: new Date(now + 3_600_000).toISOString(), l: `In 1 hour (${clockOf(now + 3_600_000, zone)})` },
    { v: new Date(at(today, "17:00", zone)).toISOString(), l: "Today 17:00" },
    { v: new Date(at(addDays(today, 1), "09:00", zone)).toISOString(), l: "Tomorrow 09:00" },
    { v: new Date(at(monday, "09:00", zone)).toISOString(), l: `${dayLabel(monday, today) === "Tomorrow" ? "Tomorrow" : "Monday"} 09:00` },
    { v: new Date(at(addDays(today, 7), "09:00", zone)).toISOString(), l: "In a week, 09:00" },
  ].filter((o) => Date.parse(o.v) > now);
  const label = current ? `${dayLabel(dayOf(current, zone), today)}${allDay ? "" : ` ${clockOf(current, zone)}`}` : "No date";
  return [{ v: "keep", l: label }, ...(current ? [{ v: "none", l: "No date" }] : []), ...options];
}

type Props = {
  id: string;
  tasks: Task[];
  people: Person[];
  close: () => void;
  openTask: (id: string) => void;
  go: (t: Task) => void;
  snooze: (t: Task) => void;
};

/** One task in full: why it exists, its clock, what it waits on, its steps, who has it, comments and history. */
export function TaskDrawer({ id, tasks, people, close, openTask, go, snooze }: Props) {
  const { me, notify, can } = useConsole();
  const client = useQueryClient();
  const zone = me.organization.timezone;
  const actions = useTaskActions();
  const listed = tasks.find((t) => t.id === id);
  const detail = useQuery({
    queryKey: [me.organization.id, "tasks", "detail", id, listed?.version ?? 0],
    queryFn: () => unwrap(api.GET("/api/v1/tasks/{task_id}", { params: { path: { task_id: id } } })),
  });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => heading.current?.focus(), [id]);

  const t = (detail.data ?? null) as (Detail & Task) | null;
  const shell = (body: React.ReactNode) => (
    <>
      <div className="scrim" onClick={close}></div>
      <aside className="drawer" aria-label="Task details">{body}</aside>
    </>
  );
  if (!t) {
    return shell(
      <>
        <div className="r" style={{ padding: "12px 12px 0 20px" }}><span className="sp"></span><button type="button" className="btn ghost icon sm" onClick={close} aria-label="Close"><Icon d="M18 6L6 18M6 6l12 12" /></button></div>
        {detail.isError ? <ErrorState error={detail.error} retry={() => void detail.refetch()} /> : <Skeleton rows={8} />}
      </>,
    );
  }

  const task = { ...(listed ?? {}), ...t } as Task & Detail;
  const done = t.status === "done" || t.status === "cancelled";
  const sla = slaOf(t, now);
  const change = async (body: Schema<"TaskUpdate">, said: string) => {
    setBusy(true);
    await actions.patch(task, body, said);
    setBusy(false);
  };
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      notify(errorMessage(e), true);
    }
    setBusy(false);
  };
  const steps = t.subtasks;
  const tick = (i: number) => {
    const next = steps.map((s, j) => (j === i ? { ...s, done: !s.done } : s));
    void change({ subtasks: next }, `${next[i]!.done ? "Ticked" : "Unticked"} ‘${steps[i]!.text}’ · ${next.filter((s) => s.done).length} of ${next.length}`);
  };
  const whoOptions = [...people];
  if (t.assignee && !whoOptions.some((p) => p.id === t.assignee!.id)) whoOptions.unshift({ id: t.assignee.id, name: t.assignee.name ?? "Someone" });
  const blockable = tasks.filter((x) => x.id !== t.id && (x.status === "open" || x.status === "snoozed") && x.blocked_by !== t.id && (x.organization?.slug ?? "") === (listed?.organization?.slug ?? ""));
  const blocker = t.blocked_by ? tasks.find((x) => x.id === t.blocked_by) ?? (t.blocker ? { id: t.blocker.id, title: t.blocker.title } : null) : null;
  const send = () =>
    void run(async () => {
      const out = await unwrap(api.POST("/api/v1/tasks/{task_id}/send", { params: { path: { task_id: t.id } }, body: { body: t.suggested_message! } }));
      await actions.refresh();
      notify(`Sent to the customer · ${t.title} done${out.next ? " · next one created" : ""}`);
      close();
    });
  const addComment = () =>
    void run(async () => {
      await unwrap(api.POST("/api/v1/tasks/{task_id}/comments", { params: { path: { task_id: t.id } }, body: { text: comment.trim() } }));
      setComment("");
      await client.invalidateQueries({ queryKey: [me.organization.id, "tasks", "detail", id] });
      notify("Comment added");
    });
  const stamp = (iso: string) => `${dayLabel(dayOf(iso, zone), dayOf(now, zone))} ${clockOf(iso, zone)}`;

  return shell(
    <>
      <div style={{ padding: "16px 20px 14px", flex: "none", borderBottom: "1px solid var(--bd)" }}>
        <div className="r g8">
          <span className="tag" data-k={PRIORITY[t.priority].k}>{PRIORITY[t.priority].label}</span>
          <span className="tag" data-k={SOURCE[t.source].k}>{SOURCE[t.source].label}</span>
          {done ? <span className="tag" data-k="ok">Done</span> : t.status === "snoozed" ? <span className="tag" data-k="warn">Snoozed</span> : null}
          <span className="sp"></span>
          <button type="button" className="btn ghost icon sm" onClick={close} aria-label="Close"><Icon d="M18 6L6 18M6 6l12 12" /></button>
        </div>
        <h2 className="fs16 w6 tx" style={{ marginTop: "8px", outline: "none" }} tabIndex={-1} ref={heading}>{t.title}</h2>
        {t.detail || t.outcome ? <p className="fs13 mu" style={{ marginTop: "2px" }}>{done && t.outcome ? t.outcome : t.detail}</p> : null}
      </div>
      <div className="c g16" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "16px 20px" }}>
        <div className="c g4" style={{ padding: "10px 12px", borderRadius: "8px", background: "var(--sf2)", border: "1px solid var(--bd2)" }}>
          <span className="fs12 w6 t2">Why this task exists</span>
          <span className="fs13 t2">{t.why ?? (t.created_by ? (t.created_by.id === me.user.id ? "You added it." : `${t.created_by.name ?? "A teammate"} gave it to ${t.assignee?.id === me.user.id ? "you" : t.assignee?.name ?? "someone"}.`) : "FlyFleet added it.")}</span>
        </div>
        {t.auto_close ? <p className="note"><Icon className="s14 ic" d={INFO} /><span>{t.auto_close}</span></p> : null}
        {sla || t.escalated ? (
          <div className="r g8">
            <span className="fs12 mu">Timer</span>
            {sla ? <span className="tag" data-k={sla.k}>{sla.text}</span> : null}
            {t.escalated ? <span className="tag" data-k="bad">Escalated</span> : null}
          </div>
        ) : null}
        {t.blocker ? (
          <p className="note" role="note"><Icon className="s14 ic" d={WAIT} /><span className="f1">{`Waiting on “${t.blocker.title}”. This can’t be completed until it’s done.`}</span><button type="button" className="btn sm" onClick={() => openTask(t.blocker!.id)}>Open it</button></p>
        ) : null}
        {t.blocking.length ? <p className="fs12 mu">{`Blocking: ${t.blocking.map((b) => b.title).join(", ")}`}</p> : null}
        {t.suggested_message && !done ? (
          <section className="card" aria-labelledby="tk-sug">
            <div className="ch"><h3 className="h2" id="tk-sug">Suggested message</h3></div>
            <div className="cb c g10">
              <p className="fs13 t2">{t.suggested_message}</p>
              <div className="r g8">
                {can("messages.send") ? <button type="button" className="btn pri sm" disabled={busy || !!t.blocker} onClick={send}>Send to customer</button> : null}
                <button type="button" className="btn sm" onClick={() => go(task)}>Open load</button>
              </div>
            </div>
          </section>
        ) : null}
        {steps.length ? (
          <section className="card" aria-labelledby="tk-steps">
            <div className="ch"><h3 className="h2" id="tk-steps">Checklist</h3><span className="sp"></span><span className="fs12 mu">{`${stepsDone(t)} of ${steps.length}`}</span></div>
            <div className="cb c g8">
              <span aria-hidden="true" style={{ height: "6px", borderRadius: "3px", background: "var(--bd3)", overflow: "hidden", display: "block" }}><i style={{ display: "block", height: "100%", width: `${(stepsDone(t) / steps.length) * 100}%`, background: "var(--pri)" }}></i></span>
              {steps.map((s, i) => (
                <div key={i} className="r g8 fs13">
                  <button type="button" className={clsx("chk", s.done && "on")} aria-pressed={s.done} aria-label={s.text} disabled={busy} onClick={() => tick(i)}><Icon className="s12 b" d={CHECK} /></button>
                  <span className={clsx("f1", s.done && "mu")}>{s.text}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div className="c g6">
            <span className="lbl" id="tk-dr-pri">Priority</span>
            <div className="seg" role="group" aria-labelledby="tk-dr-pri">
              {(["high", "medium", "low"] as Priority[]).map((p) => (
                <button key={p} type="button" className={clsx(t.priority === p && "on")} aria-pressed={t.priority === p} disabled={busy}
                  onClick={() => t.priority !== p && void change({ priority: p }, `Priority set to ${PRIORITY[p].label}`)}>{PRIORITY[p].label}</button>
              ))}
            </div>
          </div>
          <div className="fld">
            <label htmlFor="tk-dr-due">Due</label>
            <select id="tk-dr-due" className="inp" value="keep" disabled={busy || done} onChange={(e) => {
              const v = e.currentTarget.value;
              if (v === "keep") return;
              const label = e.currentTarget.selectedOptions[0]?.text ?? "";
              void change(v === "none" ? { due_at: null } : { due_at: v, all_day: false }, v === "none" ? "Due date removed" : `Due ${label}`);
            }}>
              {dueChoices(t.due_at ?? null, t.all_day, now, zone).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="tk-dr-who">Assigned to</label>
            <select id="tk-dr-who" className="inp" value={t.assignee?.id ?? ""} disabled={busy || done} onChange={(e) => {
              const person = whoOptions.find((p) => p.id === e.currentTarget.value);
              if (person) void run(() => actions.reassign([task], person.id, person.id === me.user.id ? "you" : person.name));
            }}>
              {whoOptions.map((p) => <option key={p.id} value={p.id}>{p.id === me.user.id ? `${p.name} (you)` : p.name}</option>)}
            </select>
          </div>
          <div className="c g6"><span className="lbl">Created by</span><span className="fs13 tx" style={{ paddingTop: "8px" }}>{t.created_by?.name ?? "FlyFleet"}</span></div>
          <div className="fld" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="tk-dr-blk">Blocked by</label>
            <select id="tk-dr-blk" className="inp" value={t.blocked_by ?? ""} disabled={busy || done} onChange={(e) => {
              const v = e.currentTarget.value || null;
              const title = blockable.find((x) => x.id === v)?.title;
              void change({ blocked_by: v }, v ? `Waiting on ‘${title}’` : "No longer waiting on another task");
            }}>
              <option value="">Nothing — it can be done now</option>
              {blocker && !blockable.some((x) => x.id === blocker.id) ? <option value={blocker.id}>{blocker.title}</option> : null}
              {blockable.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
          </div>
        </div>
        {t.entity_label ? <div className="r g8"><span className="fs12 mu">Linked</span><span className="fs12 t2">{linkedLabel(t.entity_type)}</span><span className="mono fs12 tx">{t.entity_label}</span></div> : null}
        {t.recurrence !== "none" ? <p className="note"><Icon className="s14 ic" d={REPEAT_IC} /><span>{`Repeats ${REPEAT[t.recurrence].toLowerCase()} · completing it creates the next one.`}</span></p> : null}
        <section className="card" aria-labelledby="tk-cm">
          <div className="ch"><h3 className="h2" id="tk-cm">Comments</h3></div>
          <div className="cb c g10">
            {t.comments.length ? t.comments.map((c) => (
              <div key={c.id} className="c g2"><span className="fs12"><b>{c.actor?.name ?? "Someone"}</b> <span className="mu">{`· ${stamp(c.at)}`}</span></span><span className="fs13 t2 pre">{c.text}</span></div>
            )) : <span className="fs12 mu">No comments yet.</span>}
            <div className="fld"><label htmlFor="tk-dr-c" className="sr-only">Add a comment</label><textarea id="tk-dr-c" className="inp" rows={2} maxLength={500} style={{ height: "auto", padding: "8px 10px" }} placeholder="Add a comment" value={comment} onChange={(e) => setComment(e.currentTarget.value)} /></div>
            <div className="r"><button type="button" className="btn sm" disabled={busy || !comment.trim()} onClick={addComment}>Comment</button></div>
          </div>
        </section>
        <section className="card" aria-labelledby="tk-hist">
          <div className="ch"><h3 className="h2" id="tk-hist">History</h3></div>
          <ul className="cb c g8" style={{ listStyle: "none", margin: 0 }}>
            {t.history.map((h) => (
              <li key={h.id} className="r g8 fs12"><span className="dot" data-k="mu"></span><span className="f1 t2">{h.actor?.name ? `${h.actor.name}: ${h.text}` : h.text}</span><span className="mu">{stamp(h.at)}</span></li>
            ))}
          </ul>
        </section>
      </div>
      <div className="r g8" style={{ padding: "12px 20px", borderTop: "1px solid var(--bd)", flex: "none" }}>
        <button type="button" className="btn pri" disabled={busy} onClick={() => void run(async () => {
          if (done) await actions.reopen([task]);
          else if ((await actions.complete([task])).length) close();
        })}>{done ? "Reopen" : "Mark done"}</button>
        {t.status === "open" ? <button type="button" className="btn" disabled={busy} onClick={() => snooze(task)}>Snooze…</button> : null}
        {t.status === "snoozed" ? <button type="button" className="btn" disabled={busy} onClick={() => void run(() => actions.unsnooze([task]))}>Wake now</button> : null}
        {!done && !t.escalated ? <button type="button" className="btn" disabled={busy} onClick={() => void run(() => actions.escalate(task))}>Escalate</button> : null}
        <span className="sp"></span>
        {!done && (t.action || t.entity_id) ? <button type="button" className="btn" onClick={() => go(task)}>{t.action ?? "Open"}</button> : null}
      </div>
    </>,
  );
}
