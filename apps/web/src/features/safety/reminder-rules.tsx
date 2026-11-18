"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useId, useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { formatStamp, timeZoneLabel } from "@/lib/format/dates";

type Rules = Schema<"ReminderRules">;
type FileType = Schema<"FileItemIn">["type"];
type Channel = Schema<"ReminderRulesIn">["channels"][number];
type CopyTo = Schema<"ReminderRulesIn">["copy_to"][number];
const LEADS = [90, 60, 45, 30, 21, 14, 7, 3, 1];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** "60 · 30 · 14 · 7 · 1 days" */
export const leadLine = (days: number[]) => `${[...days].sort((a, b) => b - a).join(" · ")} days`;

/** The reminder rules and the qualification file: what goes out when, to whom, and what keeps a driver off loads. */
export function ReminderRulesDialog({ rules, onClose }: { rules: Rules; onClose: () => void }) {
  const { me, can, notify } = useConsole();
  const org = me.organization;
  const id = useId();
  const queryClient = useQueryClient();
  const editable = can("safety.manage");
  const [enabled, setEnabled] = useState(rules.enabled);
  const [leads, setLeads] = useState<number[]>(rules.lead_days);
  const [channels, setChannels] = useState<string[]>(rules.channels);
  const [copyTo, setCopyTo] = useState<string[]>(rules.copy_to);
  const [runHour, setRunHour] = useState(rules.run_hour);
  const [checklist, setChecklist] = useState(rules.checklist);
  const [adding, setAdding] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = useQuery({ queryKey: [org.id, "safety", "reminders", "sent"], queryFn: () => unwrap(api.GET("/api/v1/safety/reminders/sent", { params: { query: { limit: 8 } } })) });
  const labelOf = (type: string) => rules.item_options.find((o) => o.key === type)?.label ?? type;
  const addable = rules.item_options.filter((o) => !checklist.some((i) => i.type === o.key));
  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  const offline = rules.channel_options.filter((o) => channels.includes(o.key) && !o.connected).map((o) => o.label);

  async function save() {
    if (!leads.length) return setError("Choose at least one lead time");
    if (!channels.length) return setError("Choose how drivers are reminded");
    setPending(true);
    setError(null);
    try {
      await unwrap(api.PUT("/api/v1/safety/reminders", {
        body: { enabled, lead_days: leads, channels: channels as Channel[], copy_to: copyTo as CopyTo[], run_hour: runHour, checklist: checklist.map((i) => ({ type: i.type as FileType, blocks: i.blocks })), version: rules.version },
      }));
      await queryClient.invalidateQueries({ queryKey: [org.id, "safety"] });
      await queryClient.invalidateQueries({ queryKey: [org.id, "drivers"] });
      notify("Reminder rules saved");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  return (
    <Dialog
      title="Reminder rules"
      sub="Expiry reminders, and the qualification file every driver needs before dispatch"
      icon={I.bell}
      width={620}
      onClose={() => !pending && onClose()}
      footer={
        <>
          {editable ? null : <span className="fs12 mu">Only safety managers can change these rules.</span>}
          <span className="sp"></span>
          <button className="btn" onClick={onClose} disabled={pending}>{editable ? "Cancel" : "Close"}</button>
          {editable ? <button className="btn pri" onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save rules"}</button> : null}
        </>
      }
    >
      <Problem message={error} />
      <div className="r g10">
        <div className="f1">
          <div className="fs13 w5">Send reminders</div>
          <div className="fs12 mu">Once a night, one reminder per item for each window it reaches. A reminder never marks anything compliant: a reviewer approves the replacement.</div>
        </div>
        <button className={clsx("sw5", enabled && "on")} role="switch" aria-checked={enabled} aria-label="Send reminders" disabled={!editable} onClick={() => setEnabled(!enabled)}><i></i></button>
      </div>
      <fieldset className="c g6" disabled={!editable} style={{ border: "none", padding: 0, margin: 0 }}>
        <legend className="fs12 w5 t3" style={{ marginBottom: "6px" }}>Lead times · days before the expiry</legend>
        <div className="r g6" style={{ flexWrap: "wrap" }}>
          {LEADS.map((d) => (
            <button key={d} type="button" className={clsx("chip5", leads.includes(d) && "on")} aria-pressed={leads.includes(d)} onClick={() => setLeads(toggle(leads.map(String), String(d)).map(Number).sort((a, b) => b - a))}>{d}</button>
          ))}
        </div>
      </fieldset>
      <div className="g2c" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <fieldset className="c g6" disabled={!editable} style={{ border: "none", padding: 0, margin: 0 }}>
          <legend className="fs12 w5 t3" style={{ marginBottom: "6px" }}>Remind the driver by</legend>
          {rules.channel_options.map((o) => (
            <label key={o.key} className="r g8 fs13">
              <input type="checkbox" className="cbx" checked={channels.includes(o.key)} onChange={() => setChannels(toggle(channels, o.key))} />
              <span className="f1">{o.label}</span>
              <span className="tag" data-k={o.connected ? "ok" : "mu"}>{o.connected ? "Connected" : "Not connected"}</span>
            </label>
          ))}
        </fieldset>
        <div className="c g12">
          <fieldset className="c g6" disabled={!editable} style={{ border: "none", padding: 0, margin: 0 }}>
            <legend className="fs12 w5 t3" style={{ marginBottom: "6px" }}>Copies to</legend>
            {rules.copy_options.map((o) => (
              <label key={o.key} className="r g8 fs13">
                <input type="checkbox" className="cbx" checked={copyTo.includes(o.key)} onChange={() => setCopyTo(toggle(copyTo, o.key))} />
                {o.label}
              </label>
            ))}
            <span className="fs12 mu">As a task that follows the item until it is renewed.</span>
          </fieldset>
          <div className="fld">
            <label htmlFor={`${id}-hour`}>Send at</label>
            <div className="r g8">
              <select id={`${id}-hour`} className="inp" style={{ width: "110px" }} value={runHour} disabled={!editable} onChange={(e) => setRunHour(Number(e.target.value))}>
                {HOURS.map((h) => <option key={h} value={h}>{hour(h)}</option>)}
              </select>
              <span className="fs12 mu">{timeZoneLabel(org.timezone)}</span>
            </div>
          </div>
        </div>
      </div>
      {offline.length ? (
        <p className="note">
          <Icon className="s14" d={I.info} />
          {`${offline.join(" and ")} ${offline.length > 1 ? "aren’t" : "isn’t"} connected yet: those reminders are recorded as not sent. Connect messaging in Settings › Integrations.`}
        </p>
      ) : null}
      <div className="hr"></div>
      <div className="c g8">
        <div className="r g8">
          <div className="f1">
            <div className="fs13 w5">Qualification file</div>
            <div className="fs12 mu">Beyond the CDL and medical card, which every driver needs. An item required before dispatch keeps a driver off loads while it is missing or run out.</div>
          </div>
        </div>
        {checklist.map((item) => (
          <div key={item.type} className="r g10" style={{ padding: "6px 10px", border: "1px solid var(--bd)", borderRadius: "8px" }}>
            <span className="f1 fs13 w5">{labelOf(item.type)}</span>
            <label className="r g6 fs12 t3">
              <button className={clsx("sw5", item.blocks && "on")} role="switch" aria-checked={item.blocks} aria-label={`${labelOf(item.type)} required before dispatch`} disabled={!editable}
                onClick={() => setChecklist(checklist.map((i) => (i.type === item.type ? { ...i, blocks: !i.blocks } : i)))}><i></i></button>
              Required before dispatch
            </label>
            {editable ? (
              <button className="btn ghost icon sm" aria-label={`Remove ${labelOf(item.type)}`} onClick={() => setChecklist(checklist.filter((i) => i.type !== item.type))}>
                <Icon className="s14" d={I.x} />
              </button>
            ) : null}
          </div>
        ))}
        {editable && addable.length ? (
          <div className="r g8">
            <select className="inp" aria-label="Item to add" style={{ width: "240px" }} value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Add an item…</option>
              {addable.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button className="btn sm" disabled={!adding} onClick={() => { setChecklist([...checklist, { type: adding, blocks: true }]); setAdding(""); }}>Add</button>
          </div>
        ) : null}
      </div>
      <div className="hr"></div>
      <div className="c g6">
        <div className="fs13 w5">Recently sent</div>
        {sent.data && !sent.data.length ? <div className="fs12 mu">No reminders have gone out yet.</div> : null}
        {(sent.data ?? []).map((r) => {
          const toDriver = r.deliveries.find((d) => d.to === "driver");
          return (
            <div key={r.id} className="r g8 fs12">
              <span className="f1 ell"><b className="w5">{r.item_label}</b>{` · ${r.entity_label} · ${r.lead_days === 1 ? "1 day" : `${r.lead_days} days`} out`}</span>
              <span className="mu nw">{formatStamp(r.sent_at, org.timezone)}</span>
              <span className="tag" data-k={r.failed ? "bad" : toDriver && toDriver.status === "not_sent" ? "warn" : "ok"}>
                {r.failed ? "Reached nobody" : toDriver ? (toDriver.status === "not_sent" ? "Driver not reached" : "Sent") : "Task"}
              </span>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
