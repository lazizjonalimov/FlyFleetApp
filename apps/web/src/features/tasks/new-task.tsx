"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { combo } from "@/components/forms/combo";
import { Combobox } from "@/components/forms/combobox";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { fromLocalInput, todayIn } from "@/lib/format/dates";

const PRIORITIES: ["high" | "medium" | "low", string][] = [["high", "High"], ["medium", "Medium"], ["low", "Low"]];

/** A task for yourself or a teammate: what, by when, how urgent, and the load it's about. */
export function NewTask({ onClose, loadId }: { onClose: () => void; loadId?: string }) {
  const { me, can, notify } = useConsole();
  const client = useQueryClient();
  const org = me.organization;
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [who, setWho] = useState(me.user.id);
  const [day, setDay] = useState(todayIn(org.timezone));
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [load, setLoad] = useState(loadId ?? "");
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const state = { open, q, setOpen, setQ };
  const team = useQuery({ queryKey: [org.id, "teammates"], queryFn: () => unwrap(api.GET("/api/v1/teammates")), enabled: can("tasks.assign"), staleTime: 60_000 });
  const loads = useQuery({ queryKey: [org.id, "loads", "pick-task"], queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { sort: "-pickup_at", limit: 100 } } })), enabled: can("loads.read"), staleTime: 30_000 });
  const people = [{ v: me.user.id, l: `${me.user.full_name} (you)` }, ...(team.data ?? []).filter((m) => m.id !== me.user.id).map((m) => ({ v: m.id, l: m.name, ab: m.role.replace("_", " ") }))];
  const whoField = combo(state, { k: "who", l: "For", value: who, options: people, onPick: setWho, placeholder: "Choose who", head: "Team", search: people.length > 8, qph: "Search the team" });
  const loadOptions = (loads.data?.items ?? []).map((l) => ({ v: l.id, l: l.load_number, ab: `${l.origin_city ?? ""} → ${l.destination_city ?? ""}` }));
  const loadField = combo(state, { k: "load", l: "Load", value: load, options: loadOptions, onPick: setLoad, placeholder: "Optional", head: "Recent loads", search: true, qph: "Search loads" });

  const save = async () => {
    if (!title.trim()) return setProblem("Say what needs doing");
    setPending(true);
    setProblem(null);
    try {
      const due = day ? fromLocalInput(`${day}T${time || "23:59"}`, org.timezone) : null;
      await unwrap(api.POST("/api/v1/tasks", { body: {
        title: title.trim(), detail: detail.trim() || null, assignee_user_id: who, due_at: due, all_day: !!day && !time, priority,
        entity_type: load ? "load" : null, entity_id: load || null,
      } }));
      await client.invalidateQueries({ queryKey: [org.id] });
      notify(who === me.user.id ? "Task added" : `Task given to ${people.find((x) => x.v === who)?.l ?? "them"}`);
      onClose();
    } catch (e) {
      setProblem(errorMessage(e));
      setPending(false);
    }
  };

  return (
    <Dialog
      title="New task"
      sub="For you or a teammate"
      icon={I.tasks}
      width={520}
      onClose={() => !pending && onClose()}
      footer={
        <>
          <span className="sp"></span>
          <button className="btn" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn pri" onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Add task"}</button>
        </>
      }
    >
      <Problem message={problem} />
      <div className="fld">
        <label htmlFor="task-title">Task</label>
        <input id="task-title" className="inp" maxLength={200} placeholder="What needs doing" value={title} onChange={(e) => setTitle(e.currentTarget.value)} autoFocus />
      </div>
      <div className="fld">
        <label htmlFor="task-detail">Details</label>
        <input id="task-detail" className="inp" maxLength={300} placeholder="Optional" value={detail} onChange={(e) => setDetail(e.currentTarget.value)} />
      </div>
      <div className="mgrid">
        <div className="fld" style={{ gridColumn: "span 2" }}>
          <span className="lbl"><span>For</span></span>
          {can("tasks.assign") ? <Combobox f={whoField} /> : <input className="inp" value={`${me.user.full_name} (you)`} readOnly aria-label="For" />}
        </div>
        <div className="fld" style={{ gridColumn: "span 2" }}>
          <span className="lbl"><span>Load</span></span>
          <Combobox f={loadField} />
        </div>
        <div className="fld" style={{ gridColumn: "span 2" }}>
          <label htmlFor="task-day">Due</label>
          <input id="task-day" className="inp mono" type="date" value={day} onChange={(e) => setDay(e.currentTarget.value)} />
        </div>
        <div className="fld" style={{ gridColumn: "span 2" }}>
          <label htmlFor="task-time">Time</label>
          <input id="task-time" className="inp mono" type="time" value={time} onChange={(e) => setTime(e.currentTarget.value)} />
          <span className="fs12 mu">Leave empty for any time that day</span>
        </div>
      </div>
      <div className="fld">
        <span className="lbl"><span>Priority</span></span>
        <div className="seg sm" role="radiogroup" aria-label="Priority" style={{ alignSelf: "flex-start" }}>
          {PRIORITIES.map(([key, label]) => <button key={key} role="radio" aria-checked={priority === key} className={clsx(priority === key && "on")} onClick={() => setPriority(key)}>{label}</button>)}
        </div>
      </div>
    </Dialog>
  );
}
