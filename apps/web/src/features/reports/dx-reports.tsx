"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { addDays, hours, monday, money, shortDay, tileValue, useFinancial, useFleet, useOps, useToday, type TabKey } from "@/features/dashboard/dx-data";
import { marginTone } from "@/features/dashboard/dx-financial";
import { rankDrivers } from "@/features/dashboard/dx-fleet";
import { BarList, Donut, Lines, type Series } from "@/features/dashboard/dx-ui";
import { api, unwrap } from "@/lib/api/client";
import { formatDate, timeZoneLabel } from "@/lib/format/dates";
import { formatNumber } from "@/lib/format/text";

export type DxKey = "dwell" | "leaderboard" | "utilization" | "safety" | "compliance" | "revenue-cost" | "lanes" | "ar-aging" | "cash";
const TAB: Record<DxKey, TabKey> = { dwell: "operations", leaderboard: "fleet", utilization: "fleet", safety: "fleet", compliance: "fleet", "revenue-cost": "financial", lanes: "financial", "ar-aging": "financial", cash: "financial" };
export const DX_KEYS = Object.keys(TAB) as DxKey[];
const STATUS_K: Record<string, string> = { driving: "brand", at_dock: "teal", available: "ok", in_shop: "warn" };

type Tile = { label: string; value: string; sub?: string };
type Def = { what: string; sources: string; excludes?: string };

function Frame({ title, what, tab, tiles, children, def }: { title: string; what: string; tab: TabKey; tiles: Tile[]; children: ReactNode; def: Def }) {
  const { me, set } = useConsole();
  return (
    <div className="c g16">
      <div className="r g12 ast wrap">
        <div className="f1 mw0">
          <h2 style={{ fontSize: "18px", lineHeight: "24px", fontWeight: 600 }}>{title}</h2>
          <p className="fs13 mu">{what}</p>
        </div>
        <button type="button" className="btn" onClick={() => set({ ...goTo("dashboard"), dtab: tab })}><Icon className="s14" d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />See it on the dashboard</button>
      </div>
      <div className="kpis" style={{ gridTemplateColumns: `repeat(${tiles.length},minmax(0,1fr))` }}>
        {tiles.map((t) => (
          <div key={t.label} className="kpi">
            <span className="kl"><span>{t.label}</span></span>
            <span className="kv2"><span>{t.value}</span></span>
            {t.sub ? <span className="ks mu"><span>{t.sub}</span></span> : null}
          </div>
        ))}
      </div>
      {children}
      <section className="card oh" aria-label="Definition">
        <div className="ch"><h2 className="h2">Definition</h2></div>
        <div className="cb c g10 fs12 t2">
          <p>{def.what}</p>
          <dl className="kv" style={{ fontSize: "12px" }}>
            <dt>Sources</dt><dd className="mono">{def.sources}</dd>
            <dt>Timezone</dt><dd>{`The company’s · ${timeZoneLabel(me.organization.timezone)}`}</dd>
            {def.excludes ? <><dt>Excludes</dt><dd>{def.excludes}</dd></> : null}
          </dl>
        </div>
      </section>
    </div>
  );
}

function Block({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="card oh" aria-label={title}>
      <div className="ch"><h2 className="h2">{title}</h2>{sub ? <span className="fs12 mu">{sub}</span> : null}</div>
      {children}
    </section>
  );
}

type Col = { label: string; num?: boolean };
/** A table whose rows are buttons where they lead somewhere. */
function Table({ cols, rows, label, empty }: { cols: Col[]; rows: { key: string; cells: ReactNode[]; go?: () => void; aria?: string }[]; label: string; empty: string }) {
  const grid = cols.map((c, i) => (i === 0 ? "minmax(0,1.8fr)" : c.num ? "110px" : "minmax(0,1fr)")).join(" ");
  if (!rows.length) return <p className="fs13 mu" style={{ padding: "16px" }}>{empty}</p>;
  return (
    <div role="table" aria-label={label}>
      <div role="row" className="thead" style={{ gridTemplateColumns: grid }}>{cols.map((c) => <span key={c.label} role="columnheader" className={c.num ? "rt" : ""}>{c.label}</span>)}</div>
      {rows.map((r) => {
        const cells = r.cells.map((c, i) => <span key={i} role="cell" className={clsx(cols[i]!.num && "rt num", i === 0 && "w5 tx ell")}>{c}</span>);
        return r.go
          ? <button key={r.key} type="button" role="row" className="trow dx-trow" style={{ gridTemplateColumns: grid }} onClick={r.go} aria-label={r.aria}>{cells}</button>
          : <div key={r.key} role="row" className="trow" style={{ gridTemplateColumns: grid, cursor: "default" }}>{cells}</div>;
      })}
    </div>
  );
}

const Loading = ({ error }: { error?: boolean }) => <p className="fs13 mu" style={{ padding: "16px 0" }}>{error ? "This report couldn’t be loaded." : "Working it out…"}</p>;

function Dwell() {
  const ops = useOps();
  const o = ops.data;
  if (!o) return <Loading error={ops.isError} />;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const pickups = o.heatmap.flat().reduce((n, v) => n + v, 0);
  const byDay = o.heatmap.map((row) => row.reduce((n, v) => n + v, 0));
  const busiestDay = byDay.indexOf(Math.max(...byDay));
  const visits = o.dwell.reduce((n, d) => n + d.visits, 0);
  const avg = visits ? Math.round(o.dwell.reduce((n, d) => n + d.avg_minutes * d.visits, 0) / visits) : null;
  return (
    <Frame title="Dwell and pickup demand" what="How long trucks wait at each facility, and when pickups are booked." tab="operations"
      tiles={[
        { label: "Pickups", value: formatNumber(pickups), sub: `Last ${o.heatmap_weeks} weeks` },
        { label: "Busiest day", value: pickups ? days[busiestDay]! : "—", sub: pickups ? `${byDay[busiestDay]} pickups` : "" },
        { label: "Average dwell", value: avg === null ? "—" : hours(avg), sub: `Top facilities, last ${o.dwell_days} days` },
        { label: "Facilities over 2 h", value: formatNumber(o.dwell.filter((d) => d.avg_minutes >= 120).length), sub: "On average" },
      ]}
      def={{ what: "Dwell: from arriving at a stop to leaving it (or until now, for a truck still there), averaged per facility. Pickup demand: pickup appointments by weekday and two-hour block.", sources: "load_stops, loads", excludes: "Draft and cancelled loads" }}>
      <Block title="Pickups by weekday" sub={`Last ${o.heatmap_weeks} weeks`}>
        <div className="cb"><BarList label="Pickups by weekday" items={byDay.map((v, i) => ({ key: days[i]!, label: days[i]!, value: v }))} /></div>
      </Block>
      <Block title="Dwell by facility" sub={`Last ${o.dwell_days} days`}>
        <Table label="Dwell by facility" empty="No stops reached in the last 30 days." cols={[{ label: "Facility" }, { label: "Visits", num: true }, { label: "Average", num: true }, { label: "Longest", num: true }]}
          rows={o.dwell.map((d) => ({ key: d.facility, cells: [d.facility, formatNumber(d.visits), <span key="a" className={clsx(d.avg_minutes >= 120 && "tc")} data-k={d.avg_minutes >= 120 ? "bad" : undefined}>{hours(d.avg_minutes)}</span>, hours(d.longest_minutes)] }))} />
      </Block>
    </Frame>
  );
}

function Leaderboard() {
  const { set } = useConsole();
  const fleet = useFleet();
  const f = fleet.data;
  if (!f) return <Loading error={fleet.isError} />;
  const rows = rankDrivers(f.drivers, "score");
  const scored = rows.filter((r) => r.score !== null && r.score !== undefined);
  return (
    <Frame title="Driver leaderboard" what="Drivers ranked by score: on-time delivery and safety over the last 30 days." tab="fleet"
      tiles={[
        { label: "Drivers ranked", value: formatNumber(rows.length) },
        { label: "Average score", value: scored.length ? String(Math.round(scored.reduce((n, r) => n + r.score!, 0) / scored.length)) : "—" },
        { label: "Miles", value: formatNumber(rows.reduce((n, r) => n + r.miles, 0)) },
        { label: "Incidents", value: formatNumber(rows.reduce((n, r) => n + r.incidents, 0)) },
      ]}
      def={{ what: f.definitions.score, sources: "loads, load_stops, dispatch_assignments, incidents", excludes: "Loads not delivered; alerts other than speeding" }}>
      <Block title="Drivers" sub="Last 30 days">
        <Table label="Drivers by score" empty="No driver delivered a load in the last 30 days." cols={[{ label: "Driver" }, { label: "Score", num: true }, { label: "Loads", num: true }, { label: "Miles", num: true }, { label: "On time", num: true }, { label: "Incidents", num: true }]}
          rows={rows.map((d) => ({ key: d.driver_id, go: () => set({ screen: "driver", driverId: d.driver_id }), aria: `${d.name}: score ${d.score ?? "none"}. Open profile.`, cells: [d.name, d.score ?? "—", formatNumber(d.loads), formatNumber(d.miles), d.on_time_pct === null || d.on_time_pct === undefined ? "—" : `${d.on_time_pct}%`, d.incidents] }))} />
      </Block>
    </Frame>
  );
}

function Utilization() {
  const { me, set } = useConsole();
  const fleet = useFleet();
  const today = useToday();
  const util = useQuery({ queryKey: [me.organization.id, "reports", "utilization", today], queryFn: () => unwrap(api.GET("/api/v1/reports/utilization", { params: { query: { date_from: addDays(today, -29), date_to: today } } })) });
  const f = fleet.data;
  if (!f) return <Loading error={fleet.isError} />;
  const total = f.status.reduce((n, s) => n + s.count, 0);
  const rows = util.data?.rows ?? [];
  return (
    <Frame title="Fleet utilization" what="What each truck is doing now, and how much of the last 30 days each spent on a load." tab="fleet"
      tiles={[
        { label: "Trucks", value: formatNumber(total) },
        { label: "Working now", value: f.working_pct === null || f.working_pct === undefined ? "—" : `${f.working_pct}%`, sub: "Driving or at a dock" },
        { label: "Available", value: formatNumber(f.status.find((s) => s.key === "available")?.count ?? 0) },
        { label: "In the shop", value: formatNumber(f.status.find((s) => s.key === "in_shop")?.count ?? 0) },
      ]}
      def={{ what: `${f.definitions.status} On a load: from arriving at the first pickup to delivering.`, sources: "vehicles, dispatch_assignments, loads, load_stops", excludes: "Retired trucks" }}>
      <Block title="Fleet status" sub="Now">
        <div className="cb r g16 wrap" style={{ alignItems: "center" }}>
          <Donut parts={f.status.map((s) => ({ label: s.label, value: s.count, k: STATUS_K[s.key]! }))} center={f.working_pct === null || f.working_pct === undefined ? "—" : `${f.working_pct}%`} sub="working" label="Fleet status" />
          <ul className="dx-legend f1">{f.status.map((s) => <li key={s.key}><span className="dot" data-k={STATUS_K[s.key]}></span><span className="t2 f1">{s.label}</span><b className="num tx">{s.count}</b></li>)}</ul>
        </div>
      </Block>
      <Block title="By truck" sub="Last 30 days">
        <Table label="Utilization by truck" empty={util.isPending ? "Working it out…" : "No truck delivered a load in the last 30 days."} cols={(util.data?.columns ?? []).map((c) => ({ label: c.label, num: c.kind !== "text" }))}
          rows={rows.map((r, i) => ({ key: String(i), go: () => set(goTo("trucks")), aria: `${String(r.label)}. Open Trucks.`, cells: (util.data?.columns ?? []).map((c) => (r[c.key] === null || r[c.key] === undefined ? "—" : c.kind === "percent" ? `${r[c.key]}%` : String(r[c.key]))) }))} />
      </Block>
    </Frame>
  );
}

function Safety() {
  const fleet = useFleet();
  const f = fleet.data;
  if (!f) return <Loading error={fleet.isError} />;
  const score = f.stats.find((s) => s.key === "safety");
  const total = f.by_type.reduce((n, t) => n + t.count, 0);
  const last = f.safety[f.safety.length - 1];
  return (
    <Frame title="Safety scorecard" what="The fleet's safety score week by week, and the alerts behind it." tab="fleet"
      tiles={[
        { label: "Fleet safety score", value: score?.value === null || score?.value === undefined ? "—" : `${Number(score.value)}/100`, sub: "Last 30 days" },
        { label: "Alerts", value: formatNumber(total), sub: "Last 30 days" },
        { label: "This week", value: last ? `${last.incidents} incidents` : "—" },
        { label: "Drivers with incidents", value: formatNumber(f.drivers.filter((d) => d.incidents).length) },
      ]}
      def={{ what: score?.definition ?? "", sources: "incidents, loads", excludes: "Alerts about loads (late, unassigned) count by type but not in the score" }}>
      <Block title="Score by week" sub="Last 8 weeks">
        <div className="cb"><Lines series={[{ key: "s", label: "Score", k: "ok", points: f.safety.map((w) => w.score ?? 0) }]} labels={f.safety.map((w) => shortDay(w.week_start))} height={160} summary={f.safety.map((w) => `${shortDay(w.week_start)}: ${w.score ?? "no miles"}, ${w.incidents} incidents`).join("; ")} /></div>
      </Block>
      <Block title="Alerts by type" sub="Last 30 days">
        <div className="cb">{f.by_type.length ? <BarList label="Alerts by type" items={f.by_type.map((t) => ({ key: t.kind, label: t.label, value: t.count }))} tone={() => "bad"} /> : <p className="fs13 mu">No alerts in the last 30 days.</p>}</div>
      </Block>
    </Frame>
  );
}

function Compliance() {
  const { set } = useConsole();
  const fleet = useFleet();
  const f = fleet.data;
  if (!f) return <Loading error={fleet.isError} />;
  const c = f.expiring_counts;
  return (
    <Frame title="Compliance & maintenance" what="Papers that have run out or run out within 60 days, and how much of each truck's service interval is used." tab="fleet"
      tiles={[
        { label: "Expired", value: formatNumber(c.expired ?? 0) },
        { label: "Within 30 days", value: formatNumber(c["30"] ?? 0) },
        { label: "Within 60 days", value: formatNumber(c["60"] ?? 0) },
        { label: "Service due", value: formatNumber(f.maintenance.filter((m) => (m.pct_used ?? 0) >= 90).length), sub: `90% of ${formatNumber(f.pm_interval_mi)} mi or more` },
      ]}
      def={{ what: `Days left: from today to the expiry date. Service: miles since the last completed work order with an odometer reading, out of the ${formatNumber(f.pm_interval_mi)}-mile interval.`, sources: "drivers, driver_qualifications, vehicles, trailers, documents, work_orders, vehicle_positions", excludes: "Items with no expiry date" }}>
      <Block title="Expiring documents" sub="Next 60 days">
        <Table label="Expiring documents" empty="Nothing runs out in the next 60 days." cols={[{ label: "Item" }, { label: "Holder" }, { label: "Expires", num: true }, { label: "Days left", num: true }]}
          rows={f.expiring.map((e, i) => ({ key: `${e.holder}-${i}`, go: () => set(goTo("safety")), aria: `${e.item}, ${e.holder}: ${e.days_left} days left. Open compliance.`, cells: [e.item, e.holder, formatDate(e.expires), <span key="d" className="tc" data-k={e.days_left < 0 || e.days_left <= 7 ? "bad" : e.days_left <= 30 ? "warn" : "mu"}>{e.days_left}</span>] }))} />
      </Block>
      <Block title="Service intervals" sub="Per truck">
        <Table label="Service intervals" empty="No trucks yet." cols={[{ label: "Truck" }, { label: "Miles since service", num: true }, { label: "Interval used", num: true }, { label: "Last service", num: true }]}
          rows={f.maintenance.map((m) => ({ key: m.vehicle_id, go: () => set({ screen: "truck", unitId: m.vehicle_id, unitKind: "truck" }), aria: `${m.unit_number}. Open truck.`, cells: [m.unit_number, m.miles_since === null || m.miles_since === undefined ? "—" : formatNumber(m.miles_since), m.pct_used === null || m.pct_used === undefined ? "No service recorded" : <span key="p" className="tc" data-k={m.pct_used >= 90 ? "bad" : "mu"}>{`${m.pct_used}%`}</span>, m.last_service ? formatDate(m.last_service) : "—"] }))} />
      </Block>
    </Frame>
  );
}

function RevenueCost() {
  const [weeks, setWeeks] = useState<4 | 12 | 26>(12);
  const fin = useFinancial(weeks);
  const f = fin.data;
  if (!f) return <Loading error={fin.isError} />;
  const t = f.totals;
  const series: Series[] = [{ key: "r", label: "Revenue", k: "brand", points: f.weeks.map((w) => Number(w.revenue)) }, { key: "c", label: "Cost", k: "warn", points: f.weeks.map((w) => Number(w.cost)) }];
  return (
    <Frame title="Revenue and cost" what="Revenue and cost week by week, with the margin between them." tab="financial"
      tiles={[
        { label: "Revenue", value: money(t.revenue), sub: `${weeks} weeks` },
        { label: "Cost", value: money(t.cost) },
        { label: "Margin", value: money(t.margin), sub: Number(t.revenue) ? `${Math.round((Number(t.margin) / Number(t.revenue)) * 100)}% of revenue` : "" },
        { label: "Previous period", value: money(t.prior_revenue), sub: "Revenue" },
      ]}
      def={{ what: `${f.definitions.revenue} ${f.definitions.cost}`, sources: "loads, load_charges, expenses, driver_settlements", excludes: "Cash advances" }}>
      <Block title="By week">
        <div className="cb c g10">
          <div className="seg sm" role="group" aria-label="Weeks shown" style={{ alignSelf: "flex-start" }}>
            {([4, 12, 26] as const).map((w) => <button key={w} type="button" className={clsx(weeks === w && "on")} aria-pressed={weeks === w} onClick={() => setWeeks(w)}>{`${w} weeks`}</button>)}
          </div>
          <Lines series={series} labels={f.weeks.map((w) => shortDay(w.week_start))} format={(n) => money(n)} summary={`Revenue ${money(t.revenue)}, cost ${money(t.cost)} over ${weeks} weeks.`} />
        </div>
        <Table label="Revenue and cost by week" empty="" cols={[{ label: "Week of" }, { label: "Revenue", num: true }, { label: "Cost", num: true }, { label: "Margin", num: true }]}
          rows={f.weeks.map((w) => ({ key: w.week_start, cells: [shortDay(w.week_start), money(w.revenue, 2), money(w.cost, 2), money(w.margin, 2)] }))} />
      </Block>
      <Block title="The month" sub={f.goal.basis}>
        <div className="cb fs13 t2">{`So far ${money(f.goal.so_far)}${f.goal.goal ? ` of ${money(f.goal.goal)} (${f.goal.pct}%)` : ""}. At this pace, ${money(f.goal.projected)} by month end.`}</div>
      </Block>
    </Frame>
  );
}

function Lanes() {
  const { set } = useConsole();
  const fin = useFinancial(12);
  const f = fin.data;
  if (!f) return <Loading error={fin.isError} />;
  const rev = f.lanes.reduce((n, l) => n + Number(l.revenue), 0);
  const profit = f.lanes.reduce((n, l) => n + Number(l.profit), 0);
  const best = [...f.lanes].sort((a, b) => (b.margin_pct ?? -999) - (a.margin_pct ?? -999))[0];
  return (
    <Frame title="Lane profitability" what="Revenue, cost and margin for each lane over the last 90 days." tab="financial"
      tiles={[
        { label: "Lanes", value: formatNumber(f.lanes.length) },
        { label: "Revenue", value: money(rev) },
        { label: "Profit", value: money(profit), sub: rev ? `${Math.round((profit / rev) * 100)}% margin` : "" },
        { label: "Best margin", value: best?.margin_pct === null || best?.margin_pct === undefined ? "—" : `${best.margin_pct}%`, sub: best?.key ?? "" },
      ]}
      def={{ what: f.definitions.lanes, sources: "loads, settlement_lines, expenses", excludes: "Loads not yet delivered" }}>
      <Block title="Lanes" sub={`Last ${f.lane_days} days`}>
        <Table label="Lanes by revenue" empty="No loads delivered in the last 90 days." cols={[{ label: "Lane" }, { label: "Loads", num: true }, { label: "Revenue", num: true }, { label: "Cost", num: true }, { label: "Margin", num: true }]}
          rows={f.lanes.map((l) => ({ key: l.key, go: () => set(goTo("loads")), aria: `${l.key}. Open Loads.`, cells: [l.key, formatNumber(l.loads), money(l.revenue), money(l.cost), <span key="m" className="tag" data-k={marginTone(l.margin_pct)}>{l.margin_pct === null || l.margin_pct === undefined ? "—" : `${l.margin_pct}%`}</span>] }))} />
      </Block>
    </Frame>
  );
}

function Aging() {
  const { me, set } = useConsole();
  const fin = useFinancial(12);
  const report = useQuery({ queryKey: [me.organization.id, "reports", "ar-aging"], queryFn: () => unwrap(api.GET("/api/v1/reports/ar-aging")) });
  const f = fin.data;
  if (!f) return <Loading error={fin.isError} />;
  const past = f.aging.filter((b) => b.key !== "current").reduce((n, b) => n + Number(b.amount), 0);
  const AK = ["ok", "warn", "late", "bad", "bad"];
  return (
    <Frame title="Invoice aging" what="What customers owe on issued invoices, by how far past the due date it is." tab="financial"
      tiles={[
        { label: "Owed", value: money(f.aging_total) },
        { label: "Past due", value: money(past) },
        { label: "Over 90 days", value: money(f.aging[4]?.amount ?? 0) },
        { label: "Days sales outstanding", value: tileValue(f.tiles.find((t) => t.key === "dso")?.value ?? null, "days") },
      ]}
      def={{ what: "Age: days past each invoice's due date, as of today. Balance: the invoice total less the payments applied to it.", sources: "invoices, payments, payment_allocations", excludes: "Draft and void invoices" }}>
      <Block title="By age">
        <div className="cb"><BarList label="Owed by age" items={f.aging.map((b, i) => ({ key: b.key, label: b.label, sub: b.share === null || b.share === undefined ? undefined : `${b.share}%`, value: Number(b.amount), k: AK[i] }))} format={(n) => money(n)} /></div>
      </Block>
      <Block title="By customer">
        <Table label="Owed by customer" empty={report.isPending ? "Working it out…" : "Nobody owes anything."} cols={[{ label: "Customer" }, { label: "Not yet due", num: true }, { label: "1–30", num: true }, { label: "31–60", num: true }, { label: "Over 60", num: true }, { label: "Total", num: true }]}
          rows={(report.data?.rows ?? []).map((r, i) => ({ key: String(i), go: () => set({ ...goTo("invoices"), lq: String(r.label) }), aria: `${String(r.label)}: ${money(String(r.total))} owed. Open invoices.`, cells: [String(r.label), money(String(r.current)), money(String(r.days_1_30)), money(String(r.days_31_60)), money(Number(r.days_61_90) + Number(r.days_over_90)), money(String(r.total))] }))} />
      </Block>
    </Frame>
  );
}

function Cash() {
  const fin = useFinancial(12);
  const today = useToday();
  const f = fin.data;
  if (!f) return <Loading error={fin.isError} />;
  const into = f.cash.reduce((n, w) => n + Number(w.cash_in), 0);
  const out = f.cash.reduce((n, w) => n + Number(w.cash_out), 0);
  const top = Math.max(1, ...f.cash.flatMap((w) => [Number(w.cash_in), Number(w.cash_out)]));
  return (
    <Frame title="Cash forecast" what={`What should come in and go out over the four weeks from ${shortDay(monday(today))}.`} tab="financial"
      tiles={[
        { label: "Coming in", value: money(into) },
        { label: "Going out", value: money(out) },
        { label: "Net", value: money(into - out) },
        { label: "Weakest week", value: money(Math.min(...f.cash.map((w) => Number(w.net)))) },
      ]}
      def={{ what: f.definitions.cash, sources: "invoices, payments, driver_settlements, expenses" }}>
      <Block title="By week">
        <div className="cb">
          <p className="sr-only">{f.cash.map((w) => `Week of ${shortDay(w.week_start)}: in ${money(w.cash_in)}, out ${money(w.cash_out)}`).join(". ")}</p>
          <div className="dx-paired" aria-hidden="true">
            {f.cash.map((w) => <div key={w.week_start} className="c g4"><div className="dx-pcols"><i data-k="ok" style={{ height: `${(Number(w.cash_in) / top) * 90}px` }}></i><i data-k="warn" style={{ height: `${(Number(w.cash_out) / top) * 90}px` }}></i></div><span className="fs12 mu">{shortDay(w.week_start)}</span></div>)}
          </div>
        </div>
        <Table label="Cash by week" empty="" cols={[{ label: "Week of" }, { label: "In", num: true }, { label: "Out", num: true }, { label: "Net", num: true }]}
          rows={f.cash.map((w) => ({ key: w.week_start, cells: [shortDay(w.week_start), money(w.cash_in, 2), money(w.cash_out, 2), <span key="n" className="tc" data-k={Number(w.net) >= 0 ? "ok" : "bad"}>{money(w.net, 2)}</span>] }))} />
      </Block>
    </Frame>
  );
}

/** One of the command center's reports: the same numbers as its dashboard card, at length. */
export function DxReport({ kind }: { kind: DxKey }) {
  if (kind === "dwell") return <Dwell />;
  if (kind === "leaderboard") return <Leaderboard />;
  if (kind === "utilization") return <Utilization />;
  if (kind === "safety") return <Safety />;
  if (kind === "compliance") return <Compliance />;
  if (kind === "revenue-cost") return <RevenueCost />;
  if (kind === "lanes") return <Lanes />;
  if (kind === "ar-aging") return <Aging />;
  return <Cash />;
}
