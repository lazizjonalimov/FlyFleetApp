"use client";

import { clsx } from "clsx";
import { useState } from "react";
import { formatNumber } from "@/lib/format/text";
import { shortDay, useFleet, type FleetData } from "./dx-data";
import { BarList, Donut, DxEmpty, DxHead, Lines, type DrawerSpec } from "./dx-ui";

type Driver = FleetData["drivers"][number];
type Rank = "score" | "miles" | "on_time";
const STATUS_K: Record<string, string> = { driving: "brand", at_dock: "teal", available: "ok", in_shop: "warn" };

export function rankDrivers(drivers: Driver[], by: Rank): Driver[] {
  const v = (d: Driver) => (by === "score" ? d.score ?? -1 : by === "miles" ? d.miles : d.on_time_pct ?? -1);
  return [...drivers].sort((a, b) => v(b) - v(a) || b.miles - a.miles || a.name.localeCompare(b.name));
}

export function FleetStats({ f }: { f: FleetData }) {
  return (
    <div className="dx-tiles four" role="group" aria-label="Fleet figures">
      {f.stats.map((s) => (
        <div key={s.key} className="dx-tile" title={s.definition}>
          <span className="fs12 t2 w5">{s.label}</span>
          <span className="fs24 w6 tx num">{s.value === null || s.value === undefined ? "—" : `${Number(s.value).toLocaleString("en-US")}`}<small className="fs12 mu w4">{s.value === null || s.value === undefined ? "" : ` ${s.unit}`}</small></span>
          <span className="fs12 mu">{s.sub}</span>
          <span className="sr-only">{s.definition}</span>
        </div>
      ))}
    </div>
  );
}

export function StatusCard({ f }: { f: FleetData }) {
  const total = f.status.reduce((n, s) => n + s.count, 0);
  return (
    <section className="card" aria-label="Fleet status">
      <DxHead title="Fleet status" sub={`${total} trucks`} report="utilization" />
      <div className="cb r g16 wrap" style={{ alignItems: "center" }}>
        <Donut parts={f.status.map((s) => ({ label: s.label, value: s.count, k: STATUS_K[s.key]! }))} center={f.working_pct === null || f.working_pct === undefined ? "—" : `${f.working_pct}%`} sub="working" label="Fleet status" />
        <ul className="dx-legend f1">
          {f.status.map((s) => <li key={s.key}><span className="dot" data-k={STATUS_K[s.key]}></span><span className="t2 f1">{s.label}</span><b className="num tx">{s.count}</b></li>)}
        </ul>
      </div>
    </section>
  );
}

export function Leaderboard({ f, open }: { f: FleetData; open: (d: Driver) => void }) {
  const [by, setBy] = useState<Rank>("score");
  const rows = rankDrivers(f.drivers, by);
  return (
    <section className="card oh" aria-label="Driver leaderboard">
      <DxHead title="Driver leaderboard" sub="Last 30 days" report="leaderboard">
        <div className="seg sm" role="group" aria-label="Rank by">
          {([["score", "Score"], ["miles", "Miles"], ["on_time", "On time"]] as const).map(([k, l]) => <button key={k} type="button" className={clsx(by === k && "on")} aria-pressed={by === k} onClick={() => setBy(k)}>{l}</button>)}
        </div>
      </DxHead>
      {rows.length ? (
        <ol className="dx-lead">
          {rows.slice(0, 10).map((d, i) => (
            <li key={d.driver_id}>
              <button type="button" onClick={() => open(d)} aria-label={`${i + 1}. ${d.name}: score ${d.score ?? "none"}, ${formatNumber(d.miles)} miles, on time ${d.on_time_pct ?? "—"}%, ${d.incidents} incidents. Open details.`}>
                <span className="num fs12 mu">{i + 1}</span>
                <span className="fs13 tx ell">{d.name}</span>
                <span className="dx-bt" aria-hidden="true"><i data-k={d.score !== null && d.score !== undefined && d.score >= 90 ? "ok" : d.score !== null && d.score !== undefined && d.score >= 75 ? "warn" : "bad"} style={{ width: `${d.score ?? 0}%` }}></i></span>
                <span className="num fs12 tx">{d.score ?? "—"}</span>
                <span className="num fs12 t2">{`${formatNumber(d.miles)} mi`}</span>
                <span className="num fs12 t2">{d.on_time_pct === null || d.on_time_pct === undefined ? "—" : `${d.on_time_pct}%`}</span>
                <span className="tag" data-k={d.incidents ? "bad" : "ok"}>{d.incidents ? `${d.incidents} incidents` : "No incidents"}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : <div className="cb"><DxEmpty text="No driver delivered a load in the last 30 days." /></div>}
      <p className="fs12 mu" style={{ padding: "8px 16px 12px" }}>{f.definitions.score}</p>
    </section>
  );
}

export function driverDrawer(d: Driver, close: () => void, profile: () => void, openLoad: (id: string) => void): DrawerSpec {
  return {
    tag: { label: "Driver", k: "brand" },
    title: d.name,
    sub: `${d.loads} loads in the last 30 days`,
    stats: [
      { label: "Score", value: d.score === null || d.score === undefined ? "—" : `${d.score}/100` },
      { label: "Miles", value: formatNumber(d.miles) },
      { label: "On time", value: d.on_time_pct === null || d.on_time_pct === undefined ? "—" : `${d.on_time_pct}%` },
      { label: "Incidents", value: String(d.incidents), tone: d.incidents ? "bad" : undefined },
    ],
    bars: { label: "Score by week", points: d.weeks.slice(-7).map((w) => ({ label: shortDay(w.week_start), value: w.score ?? null })) },
    rowsTitle: "Recent loads",
    rows: d.recent.map((r) => ({ label: r.load_number, sub: r.lane, value: r.on_time === null || r.on_time === undefined ? "—" : r.on_time ? "On time" : "Late", go: () => { close(); openLoad(r.load_id); } })),
    actions: [{ label: "Open driver profile", primary: true, go: () => { close(); profile(); } }, { label: "Close", go: close }],
  };
}

export function ExpiringCard({ f }: { f: FleetData }) {
  const c = f.expiring_counts;
  return (
    <section className="card" aria-label="Expiring soon">
      <DxHead title="Expiring soon" sub="Licences, medical cards, registrations, insurance" report="compliance" />
      <div className="cb c g10">
        <div className="dx-counts">
          <div><b className="fs20 tc num" data-k="bad">{c.expired ?? 0}</b><span className="fs12 mu">Expired</span></div>
          <div><b className="fs20 tc num" data-k="bad">{c["7"] ?? 0}</b><span className="fs12 mu">In 7 days</span></div>
          <div><b className="fs20 tc num" data-k="warn">{c["30"] ?? 0}</b><span className="fs12 mu">In 30 days</span></div>
          <div><b className="fs20 tx num">{c["60"] ?? 0}</b><span className="fs12 mu">In 60 days</span></div>
        </div>
        {f.expiring.length ? (
          <ul className="dx-legend">
            {f.expiring.slice(0, 6).map((e, i) => <li key={`${e.holder}-${e.item}-${i}`}><span className="dot" data-k={e.days_left < 0 ? "bad" : e.days_left <= 7 ? "bad" : e.days_left <= 30 ? "warn" : "mu"}></span><span className="t2 f1 ell">{`${e.item} · ${e.holder}`}</span><b className="num tx">{e.days_left < 0 ? `${-e.days_left} days ago` : `${e.days_left} days`}</b></li>)}
          </ul>
        ) : <DxEmpty text="Nothing runs out in the next 60 days." />}
      </div>
    </section>
  );
}

export function MaintenanceCard({ f }: { f: FleetData }) {
  const known = f.maintenance.filter((m) => m.pct_used !== null && m.pct_used !== undefined);
  return (
    <section className="card" aria-label="Maintenance">
      <DxHead title="Maintenance" sub={`Share of the ${formatNumber(f.pm_interval_mi)}-mile service interval used`} report="compliance" />
      <div className="cb">
        {known.length ? <BarList label="Service interval used per truck" items={known.slice(0, 8).map((m) => ({ key: m.vehicle_id, label: m.unit_number, sub: m.miles_since === null || m.miles_since === undefined ? undefined : `${formatNumber(m.miles_since)} mi`, value: m.pct_used! }))} format={(n) => `${n}%`} tone={(n) => (n >= 90 ? "bad" : n >= 75 ? "warn" : "brand")} />
          : <DxEmpty text="No completed work order with an odometer reading yet, so no interval can be measured." />}
      </div>
    </section>
  );
}

export function SafetyCard({ f }: { f: FleetData }) {
  const scores = f.safety.map((w) => w.score ?? 0);
  return (
    <section className="card" aria-label="Safety trend">
      <DxHead title="Safety trend" sub="Last 8 weeks" report="safety" />
      <div className="cb c g12">
        <Lines series={[{ key: "s", label: "Safety score", k: "ok", points: scores }, { key: "i", label: "Incidents", k: "bad", points: f.safety.map((w) => w.incidents) }]} labels={f.safety.map((w) => shortDay(w.week_start))} height={140}
          summary={`Safety by week: ${f.safety.map((w) => `${shortDay(w.week_start)} score ${w.score ?? "none"}, ${w.incidents} incidents`).join("; ")}.`} />
        {f.by_type.length ? <BarList label="Incidents by type, last 30 days" items={f.by_type.map((t) => ({ key: t.kind, label: t.label, value: t.count }))} tone={() => "bad"} /> : <DxEmpty text="No alerts in the last 30 days." />}
      </div>
    </section>
  );
}

export function FleetTab({ openDriver }: { openDriver: (d: Driver) => void }) {
  const fleet = useFleet();
  const f = fleet.data;
  if (fleet.isError) return <div className="banner" data-k="bad" role="alert" style={{ margin: "12px 24px" }}><div className="f1">The fleet figures couldn’t be loaded.</div></div>;
  if (!f) return <p className="fs13 mu" style={{ padding: "24px" }}>Loading the fleet…</p>;
  return (
    <div className="c g16" style={{ padding: "16px 24px 24px" }}>
      <FleetStats f={f} />
      <div className="dx-2col"><Leaderboard f={f} open={openDriver} /><StatusCard f={f} /></div>
      <div className="dx-3col"><ExpiringCard f={f} /><MaintenanceCard f={f} /><SafetyCard f={f} /></div>
    </div>
  );
}
