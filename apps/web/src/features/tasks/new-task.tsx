"use client";

import { clsx } from "clsx";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { api, unwrap } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fromLocalInput } from "@/lib/format/dates";
import type { Schema } from "@/lib/api/types";
import { addDays, at, dayLabel, dayOf, LINKED, PRIORITY, REPEAT, type Linked, type Priority } from "./model";
import type { Person } from "./task-drawer";
import { useTaskActions } from "./use-tasks";

type Template = { name: string; title: string; priority: Priority; steps: string[]; repeat: Schema<"TaskIn">["recurrence"]; linked?: Linked };
/** Starting points for work that comes round often. */
export const TEMPLATES: Template[] = [
  { name: "Onboard a new driver", title: "Onboard a new driver", priority: "medium", linked: "driver", repeat: "none",
    steps: ["Collect CDL, medical card and MVR", "Run background and drug-screen checks", "Add to a dispatch team", "Connect the driver app", "Assign a truck", "Send the welcome message", "First-load check-in call"] },
  { name: "Weekly: review expiring documents", title: "Review documents expiring in 30 days", priority: "medium", repeat: "weekly", steps: ["Drivers", "Trucks and trailers", "Insurance"] },
  { name: "Weekly: reconcile fuel", title: "Reconcile fuel purchases", priority: "low", repeat: "weekly", steps: ["Import the fuel card file", "Match purchases to trucks", "Flag unmatched cards"] },
  { name: "Send driver statements", title: "Approve and send driver statements", priority: "high", repeat: "weekly", steps: ["Check detention adjustments", "Approve statements", "Send to drivers"] },
];

type Due = "none" | "hour" | "today" | "tomorrow" | "monday" | "custom";

function dueAt(choice: Due, custom: string, now: number, zone: string): string | null {
  const today = dayOf(now, zone);
  const monday = addDays(today, ((8 - new Date(`${today}T12:00:00Z`).getUTCDay()) % 7) || 7);
  if (choice === "hour") return new Date(now + 3_600_000).toISOString();
  if (choice === "today") return new Date(at(today, "17:00", zone)).toISOString();
  if (choice === "tomorrow") return new Date(at(addDays(today, 1), "09:00", zone)).toISOString();
  if (choice === "monday") return new Date(at(monday, "09:00", zone)).toISOString();
  if (choice === "custom") return custom ? fromLocalInput(custom, zone) : null;
  return null;
}

type Props = { onClose: () => void; people: Person[]; companies?: { id: string; name: string }[] };

/** A task for you or a teammate: from a template or written fresh, with what it's about, when, and its steps. */
export function NewTask({ onClose, people, companies }: Props) {
  const { me, can, notify } = useConsole();
  const { refresh } = useTaskActions();
  const zone = me.organization.timezone;
  const [title, setTitle] = useState("");
  const [touched, setTouched] = useState(false);
  const [detail, setDetail] = useState("");
  const [linked, setLinked] = useState<"" | Linked>("");
  const [ref, setRef] = useState("");
  const [due, setDue] = useState<Due>("today");
  const [custom, setCustom] = useState("");
  const [who, setWho] = useState(me.user.id);
  const [priority, setPriority] = useState<Priority>("medium");
  const [repeat, setRepeat] = useState<Schema<"TaskIn">["recurrence"]>("none");
  const [steps, setSteps] = useState("");
  const [company, setCompany] = useState(companies?.length === 1 ? companies[0]!.id : "");
  const [problem, setProblem] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [now] = useState(() => Date.now());
  const short = title.trim().length < 3;
  const valid = !short && (!linked || ref.trim().length > 0) && (due !== "custom" || !!custom) && (!companies || !!company);
  const today = dayOf(now, zone);
  const monday = addDays(today, ((8 - new Date(`${today}T12:00:00Z`).getUTCDay()) % 7) || 7);

  const use = (t: Template) => {
    setTitle(t.title);
    setPriority(t.priority);
    setRepeat(t.repeat);
    setSteps(t.steps.join("\n"));
    if (t.linked) setLinked(t.linked);
    setTouched(false);
  };

  const save = async () => {
    setTouched(true);
    if (!valid) return;
    setPending(true);
    setProblem(null);
    setFieldError(null);
    try {
      const body: Schema<"TaskIn"> & { organization_id?: string } = {
        title: title.trim(), detail: detail.trim() || null, assignee_user_id: who, due_at: dueAt(due, custom, Date.now(), zone), all_day: false, priority,
        entity_type: linked || null, entity_ref: linked ? ref.trim() : null, recurrence: repeat, subtasks: steps.split("\n").map((s) => s.trim()).filter(Boolean),
        ...(companies ? { organization_id: company } : {}),
      };
      await unwrap(api.POST("/api/v1/tasks", { body }));
      await refresh();
      const person = people.find((p) => p.id === who);
      notify(who === me.user.id ? `Task created: ${title.trim()}` : `Task created for ${person?.name ?? "them"} · they were notified`);
      onClose();
    } catch (e) {
      const fields = e instanceof ApiError ? e.fieldErrors : undefined;
      const first = fields ? Object.entries(fields)[0] : undefined;
      if (first) setFieldError({ field: first[0], message: String(first[1]) });
      else setProblem(errorMessage(e));
      setPending(false);
    }
  };
  const err = (field: string) => (fieldError?.field === field ? fieldError.message : null);
  const titleError = (touched && short ? "Use at least 3 characters" : null) ?? err("title");

  return (
    <Dialog title="New task" sub="Start from a template, or write your own" icon={I.tasks} width={560} onClose={() => !pending && onClose()}
      footer={<><span className="sp"></span><button type="button" className="btn" onClick={onClose} disabled={pending}>Cancel</button><button type="button" className="btn pri" onClick={() => void save()} disabled={pending || !valid}>{pending ? "Creating…" : "Create task"}</button></>}>
      <Problem message={problem} />
      <div className="c g6">
        <span className="lbl" id="nt-tpl">Templates</span>
        <div className="r g6 wrap" role="group" aria-labelledby="nt-tpl">
          {TEMPLATES.map((t) => <button key={t.name} type="button" className="btn sm" onClick={() => use(t)}>{t.name}</button>)}
        </div>
      </div>
      {companies ? (
        <div className="fld">
          <label htmlFor="nt-co">Company</label>
          <select id="nt-co" className="inp" value={company} onChange={(e) => setCompany(e.currentTarget.value)}>
            <option value="">Choose a company</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      ) : null}
      <div className="fld">
        <label htmlFor="nt-title">Title</label>
        <input id="nt-title" className="inp" maxLength={200} placeholder="What needs to happen?" value={title} autoFocus aria-invalid={!!titleError} aria-describedby={titleError ? "nt-title-err" : undefined}
          onChange={(e) => setTitle(e.currentTarget.value)} onBlur={() => title && setTouched(true)} />
        {titleError ? <span id="nt-title-err" className="fs12 tc" data-k="bad">{titleError}</span> : null}
      </div>
      <div className="fld">
        <label htmlFor="nt-detail">Details <span className="mu">(optional)</span></label>
        <input id="nt-detail" className="inp" maxLength={300} value={detail} onChange={(e) => setDetail(e.currentTarget.value)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div className="fld">
          <label htmlFor="nt-lt">Linked to</label>
          <select id="nt-lt" className="inp" value={linked} onChange={(e) => setLinked(e.currentTarget.value as Linked | "")}>
            <option value="">Nothing</option>
            {LINKED.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </div>
        {linked ? (
          <div className="fld">
            <label htmlFor="nt-ref">{`${LINKED.find((l) => l.key === linked)!.label} ID or name`}</label>
            <input id="nt-ref" className="inp mono" maxLength={60} value={ref} aria-invalid={!!err("entity_ref")} aria-describedby={err("entity_ref") ? "nt-ref-err" : undefined} onChange={(e) => setRef(e.currentTarget.value)} />
            {err("entity_ref") ? <span id="nt-ref-err" className="fs12 tc" data-k="bad">{err("entity_ref")}</span> : null}
          </div>
        ) : <div></div>}
        <div className="fld">
          <label htmlFor="nt-due">Due</label>
          <select id="nt-due" className="inp" value={due} onChange={(e) => setDue(e.currentTarget.value as Due)}>
            <option value="none">No date</option>
            <option value="hour">In 1 hour</option>
            <option value="today">Today 17:00</option>
            <option value="tomorrow">Tomorrow 09:00</option>
            <option value="monday">{`${dayLabel(monday, today) === "Tomorrow" ? "Tomorrow" : "Monday"} 09:00`}</option>
            <option value="custom">Pick a date and time…</option>
          </select>
        </div>
        {due === "custom" ? (
          <div className="fld">
            <label htmlFor="nt-when">Date and time</label>
            <input id="nt-when" className="inp mono" type="datetime-local" value={custom} onChange={(e) => setCustom(e.currentTarget.value)} />
          </div>
        ) : null}
        <div className="fld">
          <label htmlFor="nt-who">Assign to</label>
          <select id="nt-who" className="inp" value={who} disabled={!can("tasks.assign")} onChange={(e) => setWho(e.currentTarget.value)}>
            {people.map((p) => <option key={p.id} value={p.id}>{p.id === me.user.id ? `${p.name} (you)` : p.name}</option>)}
          </select>
          {err("assignee_user_id") ? <span className="fs12 tc" data-k="bad">{err("assignee_user_id")}</span> : null}
        </div>
        <div className="c g6">
          <span className="lbl" id="nt-pri">Priority</span>
          <div className="seg" role="group" aria-labelledby="nt-pri">
            {(["high", "medium", "low"] as Priority[]).map((p) => <button key={p} type="button" className={clsx(priority === p && "on")} aria-pressed={priority === p} onClick={() => setPriority(p)}>{PRIORITY[p].label}</button>)}
          </div>
        </div>
        <div className="fld">
          <label htmlFor="nt-rep">Repeat</label>
          <select id="nt-rep" className="inp" value={repeat} onChange={(e) => setRepeat(e.currentTarget.value as typeof repeat)}>
            {(Object.keys(REPEAT) as (keyof typeof REPEAT)[]).map((k) => <option key={k} value={k}>{REPEAT[k]}</option>)}
          </select>
        </div>
      </div>
      <div className="fld">
        <label htmlFor="nt-steps">Checklist <span className="mu">(one step per line, optional)</span></label>
        <textarea id="nt-steps" className="inp" rows={3} style={{ height: "auto", padding: "8px 10px" }} value={steps} onChange={(e) => setSteps(e.currentTarget.value)} />
      </div>
    </Dialog>
  );
}
