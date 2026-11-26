"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { duration, weekdayOf } from "./model";

export type Choice = { label: string; detail?: string; run: () => void };

/** Snooze, reassign or priority for one task or the selection: a short list of choices. */
export function ChoiceDialog({ title, sub, choices, onClose }: { title: string; sub: string; choices: Choice[]; onClose: () => void }) {
  return (
    <Dialog title={title} sub={sub} icon={I.clock} width={380} onClose={onClose} footer={<><span className="sp"></span><button type="button" className="btn" onClick={onClose}>Cancel</button></>}>
      <ul className="c g4" style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label={title}>
        {choices.map((c) => (
          <li key={c.label}>
            <button type="button" className="menui" onClick={() => { onClose(); c.run(); }}>
              <span className="f1 fs13 w5 tx">{c.label}</span>
              {c.detail ? <span className="fs12 mu">{c.detail}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export type ReminderSettings = { summary: boolean; send_at: string; via: "email" | "telegram" | "both"; before_due: boolean; on_assign: boolean };
export const REMINDER_DEFAULTS: ReminderSettings = { summary: true, send_at: "07:00", via: "email", before_due: true, on_assign: true };
const TIMES = ["06:30", "07:00", "07:30", "08:00", "08:30", "09:00"];
const VIA: [ReminderSettings["via"], string][] = [["email", "Email"], ["telegram", "Telegram"], ["both", "Both"]];

function Switch({ label, hint, on, set }: { label: string; hint?: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="r g12">
      <div className="f1 c"><span className="fs13 w5 tx">{label}</span>{hint ? <span className="fs12 mu">{hint}</span> : null}</div>
      <button type="button" className={clsx("tog", on && "on")} aria-pressed={on} aria-label={label} onClick={() => set(!on)}></button>
    </div>
  );
}

/** When FlyFleet tells you about your tasks: the morning summary, 30 minutes before due, and when you're given one. */
export function RemindersDialog({ preview, onClose }: { preview: string; onClose: () => void }) {
  const { me, notify } = useConsole();
  const prefs = useQuery({ queryKey: [me.organization.id, "preferences"], queryFn: () => unwrap(api.GET("/api/v1/preferences")), staleTime: 60_000 });
  const saved = { ...REMINDER_DEFAULTS, ...((prefs.data?.["tasks.reminders"] as Partial<ReminderSettings> | undefined) ?? {}) };
  const [draft, setDraft] = useState<ReminderSettings | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const s = draft ?? saved;
  const put = (patch: Partial<ReminderSettings>) => setDraft({ ...s, ...patch });
  const save = async () => {
    setPending(true);
    try {
      await unwrap(api.PUT("/api/v1/preferences/{key}", { params: { path: { key: "tasks.reminders" } }, body: { value: s } }));
      await prefs.refetch();
      const via = VIA.find(([k]) => k === s.via)![1].toLowerCase();
      notify(s.summary ? `Morning summary on · ${s.send_at} by ${via === "both" ? "email and Telegram" : via}` : "Morning summary off");
      onClose();
    } catch (e) {
      setProblem(errorMessage(e));
      setPending(false);
    }
  };
  return (
    <Dialog title="Reminders and daily summary" sub="Hear about your tasks without opening FlyFleet" icon={I.bell} width={460} onClose={onClose}
      footer={<><span className="sp"></span><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn pri" disabled={pending || prefs.isPending} onClick={() => void save()}>{pending ? "Saving…" : "Save"}</button></>}>
      <Problem message={problem} />
      <Switch label="Morning summary" hint="What’s open, due today and overdue" on={s.summary} set={(v) => put({ summary: v })} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div className="fld">
          <label htmlFor="tk-rm-at">Send at</label>
          <select id="tk-rm-at" className="inp" value={s.send_at} disabled={!s.summary} onChange={(e) => put({ send_at: e.currentTarget.value })}>
            {TIMES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div className="c g6">
          <span className="lbl" id="tk-rm-via">Send by</span>
          <div className="seg" role="group" aria-labelledby="tk-rm-via">
            {VIA.map(([k, l]) => <button key={k} type="button" className={clsx(s.via === k && "on")} aria-pressed={s.via === k} onClick={() => put({ via: k })}>{l}</button>)}
          </div>
        </div>
      </div>
      {s.via !== "email" ? <p className="note">Telegram isn’t connected for your account yet, so those messages wait until it is. Email goes out now.</p> : null}
      <div className="c g4" style={{ padding: "10px 12px", borderRadius: "8px", background: "var(--sf2)", border: "1px solid var(--bd2)" }} aria-live="polite">
        <span className="fs12 w6 t2">Today’s summary would say</span>
        <span className="fs13 tx">{preview}</span>
      </div>
      <Switch label="Remind me 30 minutes before a task is due" on={s.before_due} set={(v) => put({ before_due: v })} />
      <Switch label="Tell me when someone assigns me a task" hint="By email, as soon as it happens" on={s.on_assign} set={(v) => put({ on_assign: v })} />
    </Dialog>
  );
}

/** Done today, time to close, overdue and promises at risk; the last seven days; who holds what (for managers). */
export function Insights({ view, manager }: { view: "mine" | "team"; manager: boolean }) {
  const { me } = useConsole();
  const query = useQuery({
    queryKey: [me.organization.id, "tasks", "insights", view],
    queryFn: () => unwrap(api.GET("/api/v1/tasks/insights", { params: { query: { view } } })),
    refetchInterval: 60_000,
  });
  const d = query.data;
  if (query.isError) return <div className="banner" data-k="bad" role="alert" style={{ margin: "12px 24px 0" }}><div className="f1">Insights couldn’t be loaded. {errorMessage(query.error)}</div></div>;
  const most = Math.max(1, ...(d?.per_day.map((x) => x.done) ?? [1]));
  const busiest = Math.max(1, ...(d?.per_person.map((x) => x.open) ?? [1]));
  const stats = d
    ? [
        { l: "Done today", v: String(d.done_today), x: view === "team" ? "Across the team" : "By you" },
        { l: "Average time to close", v: d.avg_close_minutes === null || d.avg_close_minutes === undefined ? "—" : duration(d.avg_close_minutes), x: "Last 7 days" },
        { l: "Overdue", v: String(d.overdue), x: d.overdue ? "Past their due time" : "Nothing late" },
        { l: "SLA at risk", v: String(d.sla_at_risk), x: "Due in under 2 h, or late" },
      ]
    : [];
  return (
    <section className="card" style={{ margin: "12px 24px 0" }} aria-label="Insights">
      <div className="cb c g16">
        {!d ? <span className="fs13 mu">Working out your insights…</span> : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "12px" }}>
              {stats.map((x) => <div key={x.l} className="c g2"><span className="fs12 mu">{x.l}</span><span className="fs16 w6 tx">{x.v}</span><span className="fs12 mu">{x.x}</span></div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: manager && d.per_person.length ? "1fr 1fr" : "1fr", gap: "24px" }}>
              <div className="c g6">
                <span className="fs12 w6 t2">Done per day, last 7 days</span>
                <span className="sr-only">{d.per_day.map((x) => `${weekdayOf(x.day)}: ${x.done}`).join(", ")}</span>
                <div className="r g6" aria-hidden="true" style={{ height: "72px", alignItems: "stretch" }}>
                  {d.per_day.map((x) => (
                    <div key={x.day} className="tkbar"><i style={{ height: `${Math.max(4, (x.done / most) * 52)}px` }}></i><span className="fs12 mu">{weekdayOf(x.day)}</span></div>
                  ))}
                </div>
              </div>
              {manager && d.per_person.length ? (
                <div className="c g6">
                  <span className="fs12 w6 t2">Open tasks per person</span>
                  <ul className="c g6" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {d.per_person.map((w) => (
                      <li key={w.name} className="r g8">
                        <span className="fs12 t2 ell" style={{ width: "120px" }}>{w.name}</span>
                        <span aria-hidden="true" style={{ flex: 1, height: "8px", background: "var(--bd3)", borderRadius: "4px", overflow: "hidden", display: "block" }}><i style={{ display: "block", height: "100%", width: `${(w.open / busiest) * 100}%`, background: "var(--pri)" }}></i></span>
                        <span className="fs12 mono tx" style={{ width: "24px", textAlign: "right" }}>{w.open}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
