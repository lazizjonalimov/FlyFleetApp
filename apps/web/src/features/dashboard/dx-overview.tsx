"use client";

import { useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { usePreference } from "@/hooks/use-preference";
import { toLocalInput } from "@/lib/format/dates";
import type { Schema } from "@/lib/api/types";
import { formatNumber } from "@/lib/format/text";
import { Ring, type DrawerSpec } from "./dx-ui";
import { money, useDay, type Day } from "./dx-data";
import type { CompanyKpis, Kpi } from "./kpi-cards";

function Meter({ label, value, text }: { label: string; value: number | null; text: string }) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="c g4">
      <div className="r jb fs12"><span className="t2 w5">{label}</span><span className="num tx">{value === null ? "—" : `${value}%`}</span></div>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined} aria-valuetext={text} className="dx-track"><i style={{ width: `${pct}%` }}></i></div>
      <span className="fs12 mu">{text}</span>
    </div>
  );
}

/**
 * The day at a glance: a live clock with Refresh, a greeting with what the day looks like, shortcuts to what needs a
 * person, how far the day has got, and the operations score.
 */
export function DayCard() {
  const { me, set, notify } = useConsole();
  const client = useQueryClient();
  const query = useDay();
  const d = query.data;
  const zone = me.organization.timezone;
  const [now] = useState(() => Date.now());
  const when = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "short", day: "numeric" }).format(now);
  const updated = query.dataUpdatedAt ? toLocalInput(new Date(query.dataUpdatedAt).toISOString(), zone).slice(11, 16) : "—";
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(now));
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: [me.organization.id] });
    notify(`Dashboard updated at ${toLocalInput(new Date().toISOString(), zone).slice(11, 16)}`);
  };
  const loads = (params: Record<string, string>) => set({ ...goTo("loads"), lpreset: { screen: "loads", label: params.view === "missing_pod" ? "POD missing" : params.view === "at_risk" ? "Late or at risk" : "Unassigned loads", params } });
  return (
    <section className="card dx-glance" aria-label="Your day at a glance">
      <div className="dx-day-main">
        <div className="r g8 fs12 t2">
          <span className="dx-live" aria-hidden="true"></span>
          <span>{`Live · ${when} · updated ${updated}`}</span>
          <button type="button" className="lnk" onClick={() => void refresh()}>Refresh</button>
        </div>
        <h2 className="fs20 w6 tx" style={{ marginTop: "6px" }}>{`${hello}, ${me.user.full_name.split(" ")[0]}`}</h2>
        <p className="fs13 t2">{d ? d.summary : query.isError ? "Today’s figures couldn’t be loaded." : "Working out your day…"}</p>
        {d ? (
          <div className="r g8 wrap" style={{ marginTop: "10px" }}>
            <button type="button" className="btn sm" onClick={() => loads({ view: "unassigned_soon" })}><span className="dot" data-k="warn"></span>{`${formatNumber(d.unassigned)} unassigned`}</button>
            <button type="button" className="btn sm" onClick={() => loads({ view: "at_risk" })}><span className="dot" data-k="bad"></span>{`${formatNumber(d.late)} late or at risk`}</button>
            <button type="button" className="btn sm" onClick={() => loads({ view: "missing_pod" })}><span className="dot" data-k="info"></span>{`${formatNumber(d.missing_pod)} missing POD`}</button>
          </div>
        ) : null}
      </div>
      {d ? (
        <div className="dx-day-meters">
          <Meter label="Loads delivered" value={d.delivered.pct ?? null} text={d.delivered.text} />
          {d.revenue ? <Meter label="Revenue today vs target" value={d.revenue.pct ?? null} text={`${money(d.revenue.done)} of ${d.revenue.of ? money(d.revenue.of) : "—"} · ${d.revenue.text}`} /> : null}
          <Meter label="On time so far" value={d.on_time.pct ?? null} text={d.on_time.text} />
        </div>
      ) : null}
      {d ? (
        <div className="c g4 dx-score" title={d.definition}>
          <Ring value={d.score ?? null} label="Operations score" />
          <span className="fs12 t2 w5">Operations score</span>
          <span className="sr-only">{d.definition}</span>
        </div>
      ) : null}
    </section>
  );
}

type Attention = Schema<"AttentionItem">;
export type BriefItem = { key: string; k: string; head: string; text: string; action: string; src?: Attention };

/** Up to five things for today, from what needs attention and how the month is going. */
export function briefItems(attention: Attention[], day: Day | undefined, revenue: { now: number; last: number } | null): BriefItem[] {
  const out: BriefItem[] = [];
  const first = (kinds: string[]) => attention.find((a) => kinds.includes(a.kind));
  const assign = first(["unassigned"]);
  if (assign) out.push({ key: `a:${assign.key}`, k: "warn", head: `Assign a driver to ${assign.ref ?? "a load"}`, text: assign.detail, action: assign.action_label, src: assign });
  const late = first(["late", "at_risk"]);
  if (late) out.push({ key: `a:${late.key}`, k: "bad", head: `Warn the customer: ${late.ref ?? "a load"} is running late`, text: late.detail, action: late.action_label, src: late });
  const dwell = first(["dwell"]);
  if (dwell) out.push({ key: `a:${dwell.key}`, k: "warn", head: `Detention is about to start${dwell.ref ? ` on ${dwell.ref}` : ""}`, text: dwell.detail, action: dwell.action_label, src: dwell });
  const doc = first(["documents"]);
  if (doc) out.push({ key: `a:${doc.key}`, k: "warn", head: doc.title, text: doc.detail, action: doc.action_label, src: doc });
  if (revenue && revenue.last > 0 && revenue.now > revenue.last) {
    out.push({ key: `rev:${day?.today ?? ""}`, k: "ok", head: "Revenue is ahead of last month", text: `${money(revenue.now)} so far this month, ${money(revenue.now - revenue.last)} ahead of the same days last month.`, action: "Open Financial" });
  }
  for (const a of attention) if (out.length < 5 && !out.some((o) => o.src?.key === a.key)) out.push({ key: `a:${a.key}`, k: a.tone, head: a.title, text: a.detail, action: a.action_label, src: a });
  return out.slice(0, 5);
}

/** Today's brief: closed until asked for; dismissed items stay dismissed. */
export function TodaysBrief({ attention, revenue, run, openFinancial }: { attention: Attention[]; revenue: { now: number; last: number } | null; run: (a: Attention) => void; openFinancial: () => void }) {
  const day = useDay();
  const [open, setOpen] = useState(false);
  const [gone, setGone] = usePreference<string[]>("dashboard.brief_dismissed", []);
  const items = briefItems(attention, day.data, revenue).filter((i) => !gone.includes(i.key));
  return (
    <section className="card dx-brief" style={{ margin: "12px 24px 0" }}>
      <button type="button" className="dx-brief-h" aria-expanded={open} aria-controls="dx-brief-body" onClick={() => setOpen(!open)}>
        <Icon className="s14" d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        <span className="h2 f1" style={{ textAlign: "left" }}>Today’s brief</span>
        <span className="cnt" data-k={items.length ? "warn" : "ok"}>{items.length}</span>
        <Icon className={clsx("s14 dx-chev", open && "on")} d="M6 9l6 6 6-6" />
      </button>
      {open ? (
        <div id="dx-brief-body">
          {items.length ? (
            <ul className="dx-brief-list">
              {items.map((i) => (
                <li key={i.key}>
                  <span className="dot" data-k={i.k}></span>
                  <div className="f1 mw0"><div className="fs13 w5 tx">{i.head}</div><div className="fs12 mu">{i.text}</div></div>
                  <button type="button" className="btn sm" onClick={() => (i.src ? run(i.src) : openFinancial())}>{i.action}</button>
                  <button type="button" className="btn ghost icon sm" aria-label={`Dismiss: ${i.head}`} onClick={() => setGone([...gone, i.key].slice(-200))}><Icon className="s12" d="M18 6L6 18M6 6l12 12" /></button>
                </li>
              ))}
            </ul>
          ) : <p className="fs13 mu" style={{ padding: "14px 16px" }}>You’re all caught up.</p>}
        </div>
      ) : null}
    </section>
  );
}

/** The drawer for a figure: now, change, 7-period average and peak, its bars, and by company where it has one. */
export function kpiDrawer(kpi: Kpi, companies: CompanyKpis[], openList: () => void, close: () => void, period: string): DrawerSpec {
  const known = kpi.series.filter((v): v is number => v !== null && v !== undefined);
  const avg = known.length ? known.reduce((n, v) => n + v, 0) / known.length : null;
  const peak = known.length ? Math.max(...known) : null;
  const unit = period === "today" ? "day" : period === "week" ? "week" : "month";
  const labels = kpi.series.map((_, i) => (i === kpi.series.length - 1 ? (period === "today" ? "Today" : `This ${unit}`) : `−${kpi.series.length - 1 - i}`));
  const by = companies.map((c) => ({ c, k: c.data.kpis.find((x) => x.key === kpi.key) })).filter((x) => x.k);
  return {
    tag: { label: "Figure", k: kpi.tone },
    title: kpi.label,
    sub: kpi.definition,
    stats: [
      { label: "Now", value: formatNumber(kpi.value) + (typeof kpi.total === "number" ? ` / ${formatNumber(kpi.total)}` : "") },
      { label: "Change", value: kpi.change.text, tone: kpi.change.tone === "good" ? "ok" : kpi.change.tone === "bad" ? "bad" : undefined },
      { label: `7-${unit} average`, value: avg === null ? "—" : avg.toFixed(1).replace(/\.0$/, "") },
      { label: `7-${unit} peak`, value: peak === null ? "—" : formatNumber(peak) },
    ],
    bars: { label: `Last 7 ${unit}s`, points: kpi.series.map((v, i) => ({ label: labels[i]!, value: v ?? null })) },
    rowsTitle: by.length ? "By company" : undefined,
    rows: by.map(({ c, k }) => ({ label: c.organization.name, value: formatNumber(k!.value) })),
    actions: [{ label: "Open the full page", go: () => { close(); openList(); }, primary: true }, { label: "Close", go: close }],
  };
}
