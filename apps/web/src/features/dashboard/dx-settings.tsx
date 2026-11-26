"use client";

import { clsx } from "clsx";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { usePreference } from "@/hooks/use-preference";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { TABS, type TabKey } from "./dx-data";

export type Section = "day" | "brief" | "schedule" | "by_company" | "financials";
export type Layout = { open_on: TabKey; hide_sections: Section[]; hide_kpis: string[]; hide_tabs: TabKey[] };
export const DEFAULT_LAYOUT: Layout = { open_on: "overview", hide_sections: [], hide_kpis: [], hide_tabs: [] };
export const SECTION_LABEL: Record<Section, string> = { day: "Day at a glance", brief: "Today’s brief", schedule: "Today’s schedule", by_company: "By company", financials: "Financials" };

/** Each person's own dashboard: which tab it opens on and what it shows. */
export function useLayout() {
  const [saved, save, { ready }] = usePreference<Partial<Layout>>("dashboard.layout", DEFAULT_LAYOUT);
  return { layout: { ...DEFAULT_LAYOUT, ...saved } as Layout, save, ready };
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="r g12" style={{ minHeight: "28px" }}>
      <span className="f1 fs13 tx">{label}</span>
      <button type="button" className={clsx("tog", on && "on")} aria-pressed={on} aria-label={label} onClick={() => set(!on)}></button>
    </div>
  );
}

/** Customize: open on, the Overview's sections, the figures and the tabs; saved for this person. */
export function CustomizeDialog({ tabs, sections, kpis, onClose }: { tabs: TabKey[]; sections: Section[]; kpis: { key: string; label: string }[]; onClose: () => void }) {
  const { notify } = useConsole();
  const { layout, save } = useLayout();
  const [draft, setDraft] = useState<Layout>(layout);
  const flip = <K extends "hide_sections" | "hide_kpis" | "hide_tabs">(key: K, value: Layout[K][number], on: boolean) =>
    setDraft((d) => ({ ...d, [key]: on ? (d[key] as string[]).filter((x) => x !== value) : [...(d[key] as string[]), value] }));
  const visibleTabs = tabs.filter((t) => !draft.hide_tabs.includes(t));
  return (
    <Dialog title="Customize the dashboard" sub="Saved for you on this company" icon={I.info} width={520} onClose={onClose}
      footer={<>
        <button type="button" className="btn" onClick={() => setDraft(DEFAULT_LAYOUT)}>Show everything</button>
        <span className="sp"></span>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn pri" onClick={() => { save(draft); notify("Dashboard layout saved"); onClose(); }}>Save</button>
      </>}>
      <div className="fld">
        <label htmlFor="dx-open-on">Open on</label>
        <select id="dx-open-on" className="inp" value={visibleTabs.includes(draft.open_on) ? draft.open_on : "overview"} onChange={(e) => setDraft({ ...draft, open_on: e.currentTarget.value as TabKey })}>
          {visibleTabs.map((t) => <option key={t} value={t}>{TABS.find((x) => x.key === t)!.label}</option>)}
        </select>
      </div>
      <fieldset className="c g4 dx-fs"><legend className="fs12 w6 t2">Overview sections</legend>
        {sections.map((s) => <Toggle key={s} label={SECTION_LABEL[s]} on={!draft.hide_sections.includes(s)} set={(on) => flip("hide_sections", s, on)} />)}
      </fieldset>
      {kpis.length ? (
        <fieldset className="c g4 dx-fs"><legend className="fs12 w6 t2">Figures</legend>
          {kpis.map((k) => <Toggle key={k.key} label={k.label} on={!draft.hide_kpis.includes(k.key)} set={(on) => flip("hide_kpis", k.key, on)} />)}
        </fieldset>
      ) : null}
      <fieldset className="c g4 dx-fs"><legend className="fs12 w6 t2">Tabs</legend>
        {tabs.filter((t) => t !== "overview").map((t) => <Toggle key={t} label={TABS.find((x) => x.key === t)!.label} on={!draft.hide_tabs.includes(t)} set={(on) => flip("hide_tabs", t, on)} />)}
      </fieldset>
    </Dialog>
  );
}

const TIMES = ["06:30", "07:00", "07:30", "08:00", "08:30", "09:00"] as const;
type Share = { frequency: "daily" | "weekly" | "monthly"; send_at: (typeof TIMES)[number]; recipients: "me" | "ops" | "everyone"; tabs: TabKey[] };

/** Share: email the dashboard on a schedule, or now. Each person gets only what their role opens. */
export function ShareDialog({ tabs, onClose }: { tabs: TabKey[]; onClose: () => void }) {
  const { me, notify } = useConsole();
  const [saved] = usePreference<Partial<Share>>("dashboard.share", {});
  const [s, setS] = useState<Share>({ frequency: "daily", send_at: "07:00", recipients: "me", tabs: tabs.filter((t) => t !== "calendar"), ...saved, ...(saved.tabs ? { tabs: saved.tabs.filter((t) => tabs.includes(t)) } : {}) });
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const others = ["owner", "admin"].includes(me.organization.role);
  const who = s.recipients === "me" ? "you" : s.recipients === "ops" ? "the operations team" : "everyone on the team";
  const go = async (now: boolean) => {
    setPending(true);
    setProblem(null);
    try {
      const out = await unwrap(api.POST("/api/v1/dashboard/share", { body: { ...s, now } }));
      const when = `${s.frequency === "daily" ? "Every day" : s.frequency === "weekly" ? "Every Monday" : "On the 1st of each month"} at ${s.send_at}`;
      notify(now ? `Dashboard sent to ${out.sent_to.length === 1 ? out.sent_to[0] : `${out.sent_to.length} people`} · ${when} from now on` : `Scheduled · ${when} to ${who}`);
      onClose();
    } catch (e) {
      setProblem(errorMessage(e));
      setPending(false);
    }
  };
  return (
    <Dialog title="Share the dashboard" sub="By email, on a schedule" icon={I.bell} width={500} onClose={onClose}
      footer={<><span className="sp"></span><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn" disabled={pending || !s.tabs.length} onClick={() => void go(true)}>Send now</button><button type="button" className="btn pri" disabled={pending || !s.tabs.length} onClick={() => void go(false)}>Schedule</button></>}>
      <Problem message={problem} />
      <div className="c g6">
        <span className="lbl" id="dx-sh-f">Frequency</span>
        <div className="seg" role="group" aria-labelledby="dx-sh-f">
          {(["daily", "weekly", "monthly"] as const).map((f) => <button key={f} type="button" className={clsx(s.frequency === f && "on")} aria-pressed={s.frequency === f} onClick={() => setS({ ...s, frequency: f })}>{f === "daily" ? "Daily" : f === "weekly" ? "Weekly" : "Monthly"}</button>)}
        </div>
      </div>
      <div className="fld">
        <label htmlFor="dx-sh-t">Send time</label>
        <select id="dx-sh-t" className="inp" value={s.send_at} onChange={(e) => setS({ ...s, send_at: e.currentTarget.value as Share["send_at"] })}>
          {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="c g6">
        <span className="lbl" id="dx-sh-r">Recipients</span>
        <div className="seg" role="group" aria-labelledby="dx-sh-r">
          {(["me", "ops", "everyone"] as const).map((r) => <button key={r} type="button" className={clsx(s.recipients === r && "on")} aria-pressed={s.recipients === r} disabled={r !== "me" && !others} onClick={() => setS({ ...s, recipients: r })}>{r === "me" ? "Just me" : r === "ops" ? "Ops team" : "Everyone"}</button>)}
        </div>
        {!others ? <span className="fs12 mu">Only a Main Admin or Administrator sends it to others.</span> : null}
      </div>
      <div className="c g6">
        <span className="lbl" id="dx-sh-tabs">Include</span>
        <div className="r g6 wrap" role="group" aria-labelledby="dx-sh-tabs">
          {tabs.map((t) => <button key={t} type="button" className="btn sm" aria-pressed={s.tabs.includes(t)} onClick={() => setS({ ...s, tabs: s.tabs.includes(t) ? s.tabs.filter((x) => x !== t) : [...s.tabs, t] })}>{TABS.find((x) => x.key === t)!.label}</button>)}
        </div>
      </div>
      <p className="note" aria-live="polite">{s.tabs.length ? `${s.frequency === "daily" ? "Every day" : s.frequency === "weekly" ? "Every Monday" : "On the 1st of each month"} at ${s.send_at}, ${who} get${s.recipients === "me" ? "" : "s"} ${s.tabs.map((t) => TABS.find((x) => x.key === t)!.label).join(", ")}. Recipients see only what their role can open.` : "Choose at least one tab to include."}</p>
    </Dialog>
  );
}
