"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Fragment } from "react";
import { cell } from "@/components/data-table/cell";
import { BasicCell } from "@/components/data-table/cells";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { useSoon } from "@/features/console/use-action";
import type { Cell } from "@/features/console/view";
import { toApiError } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { formatDate, formatDateTime, timeZoneLabel, todayIn } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { PERIODS, periodRange } from "@/lib/format/periods";
import { formatNumber } from "@/lib/format/text";
import { FuelReport, fuelReportUrl } from "./fuel-report";
import { OnTimeReport, onTimeUrl } from "./on-time-report";
import { DX_KEYS, DxReport, type DxKey } from "./dx-reports";

type Report = Schema<"Report">;
type Key = "on-time" | "loads-by-status" | "awaiting-pod" | "utilization" | "expiring" | "drivers" | "trucks" | "revenue-customer" | "ar-aging" | "expenses" | "driver-statements" | "fuel" | "revenue-month" | "revenue-terminal" | DxKey;
const FINANCE = ["reports.read", "loads.rates.read", "invoices.read", "expenses.read"];

// The design's catalog first, then the reports FlyFleet adds. Each lists every permission it needs.
// Three groups, as the dashboard has them. Financial reports need finance access. Each lists every permission it needs.
const CATALOG: { l: string; items: { key: Key; l: string; needs: string[] }[] }[] = [
  {
    l: "Operational",
    items: [
      { key: "on-time", l: "On-time delivery", needs: ["reports.read"] },
      { key: "dwell", l: "Dwell and pickup demand", needs: ["reports.read", "loads.read"] },
      { key: "loads-by-status", l: "Loads by status", needs: ["reports.read"] },
      { key: "awaiting-pod", l: "Delivered, awaiting POD", needs: ["reports.read"] },
    ],
  },
  {
    l: "Fleet & drivers",
    items: [
      { key: "leaderboard", l: "Driver leaderboard", needs: ["reports.read", "drivers.read", "equipment.read"] },
      { key: "utilization", l: "Fleet utilization", needs: ["reports.read", "drivers.read", "equipment.read"] },
      { key: "safety", l: "Safety scorecard", needs: ["reports.read", "drivers.read", "equipment.read"] },
      { key: "compliance", l: "Compliance & maintenance", needs: ["reports.read", "drivers.read", "equipment.read"] },
      { key: "trucks", l: "Truck performance", needs: ["reports.read"] },
    ],
  },
  {
    l: "Financial",
    items: [
      { key: "revenue-cost", l: "Revenue and cost", needs: FINANCE },
      { key: "lanes", l: "Lane profitability", needs: FINANCE },
      { key: "ar-aging", l: "Invoice aging", needs: FINANCE },
      { key: "cash", l: "Cash forecast", needs: FINANCE },
      { key: "revenue-customer", l: "Revenue by customer", needs: FINANCE },
      { key: "driver-statements", l: "Driver statements", needs: [...FINANCE, "settlements.read"] },
      { key: "fuel", l: "Fuel & IFTA", needs: FINANCE },
      { key: "expenses", l: "Expenses by category", needs: FINANCE },
      { key: "revenue-month", l: "Revenue by month", needs: FINANCE },
      { key: "revenue-terminal", l: "Revenue by terminal", needs: FINANCE },
    ],
  },
];
const ON_LOADS = "Cancelled loads, loads not yet delivered";
const DEFINITIONS: Partial<Record<Key, { what: string; term: string; sources: string; excludes: string }>> = {
  "on-time": { what: "Share of delivery stops that arrived inside the appointment window", term: "", sources: "load_stops, load_status_events", excludes: "Cancelled, on-hold loads" },
  "loads-by-status": { what: "Where the loads picking up in the period stand now.", term: "Period — a load counts in the period of its first pickup appointment, or of when it was entered if it has none.", sources: "loads", excludes: "Nothing: every status is shown" },
  "awaiting-pod": { what: "Loads delivered whose proof of delivery hasn’t been approved yet. They can’t be invoiced until it is.", term: "Days waiting — whole days since the delivery, in the company’s time.", sources: "loads, load_stops, documents", excludes: "Loads not yet delivered, and completed loads" },
  utilization: { what: "How much of the period each truck spent on a load, with the loads it delivered.", term: "On a load — from arriving at the first pickup to delivering; a load still on the road counts until now.", sources: "loads, load_stops, dispatch_assignments", excludes: "Retired trucks; time before a truck reached its pickup" },
  expiring: { what: "Licenses, medical cards, qualifications, registrations, insurance and the company’s own filings that have run out or run out in the next 60 days.", term: "Days left — days from today to the expiry date; below zero it has run out.", sources: "drivers, driver_qualifications, vehicles, trailers, documents", excludes: "Items with no expiry date, and drivers and units out of service" },
  "revenue-customer": { what: "Revenue of the loads each customer had delivered in the period, with miles and revenue per mile.", term: "Revenue — the customer rate plus billable charges, counted when the load is delivered.", sources: "loads, load charges", excludes: ON_LOADS },
  "revenue-month": { what: "Delivered revenue month by month.", term: "Revenue — the customer rate plus billable charges, counted when the load is delivered.", sources: "loads, load charges", excludes: ON_LOADS },
  "revenue-terminal": { what: "Delivered revenue split by the terminal each load belongs to.", term: "Revenue — the customer rate plus billable charges, counted when the load is delivered.", sources: "loads, terminals", excludes: ON_LOADS },
  drivers: { what: "Loads each driver delivered in the period: miles, on-time delivery and revenue.", term: "On time — arrived at the last stop no later than the end of its appointment.", sources: "loads, stops, assignments", excludes: ON_LOADS },
  trucks: { what: "Loads each truck delivered in the period: miles, on-time delivery and revenue.", term: "On time — arrived at the last stop no later than the end of its appointment.", sources: "loads, stops, assignments", excludes: ON_LOADS },
  "ar-aging": { what: "What each customer owes on issued invoices, by how far past the due date it is.", term: "Age — days past the invoice’s due date, as of today.", sources: "invoices, payments", excludes: "Draft and void invoices" },
  expenses: { what: "What was spent in the period, by category.", term: "Period — by the date each expense was incurred.", sources: "expenses", excludes: "Nothing: every expense recorded" },
  "driver-statements": { what: "Each driver’s statements for pay periods ending in the period: earned, reimbursed, deducted and paid.", term: "Net pay — earnings plus reimbursements, less deductions.", sources: "driver_settlements", excludes: "Void statements" },
  fuel: { what: "Fuel cost per mile by week, MPG by truck and the quarter’s fuel tax.", term: "MPG — miles divided by gallons bought.", sources: "expenses, ifta_trips", excludes: "Non-fuel purchases" },
};
/** The columns whose totals head a report, where not all of them mean something summed. */
const KPI_COLUMNS: Partial<Record<Key, string[]>> = { "loads-by-status": ["loads", "miles", "revenue"], expenses: ["count", "amount"], "driver-statements": ["statements", "earnings", "deductions", "net"], utilization: ["loads", "miles", "days", "utilization"] };
type Row = Record<string, unknown>;
/** Figures worked out from the rows, for reports of things waiting rather than amounts. */
const KPIS: Partial<Record<Key, (rows: Row[], money: (v: unknown) => string) => { label: string; value: string; suffix: string }[]>> = {
  "awaiting-pod": (rows, money) => [
    { label: "Loads waiting", value: formatNumber(rows.length), suffix: "" },
    { label: "Longest wait", value: rows.length ? formatNumber(Math.max(...rows.map((r) => Number(r.waiting ?? 0)))) : "—", suffix: rows.length ? " days" : "" },
    { label: "Not received", value: formatNumber(rows.filter((r) => r.pod === "Not received").length), suffix: "" },
    ...(rows.some((r) => "revenue" in r) ? [{ label: "Revenue waiting", value: money(rows.reduce((sum, r) => sum + Number(r.revenue ?? 0), 0)), suffix: "" }] : []),
  ],
  expiring: (rows) => [
    { label: "Expired", value: formatNumber(rows.filter((r) => r.state === "Expired").length), suffix: "" },
    { label: "Expiring in 60 days", value: formatNumber(rows.filter((r) => r.state === "Expiring").length), suffix: "" },
    { label: "Within 14 days", value: formatNumber(rows.filter((r) => r.state === "Expiring" && Number(r.left) <= 14).length), suffix: "" },
  ],
};
/** Reports that show things as they are today rather than over a period. */
const AS_OF: Key[] = ["ar-aging", "awaiting-pod", "expiring"];
const PATHS: Partial<Record<Key, string>> = { "loads-by-status": "loads-by-status", "awaiting-pod": "awaiting-pod", utilization: "utilization", expiring: "expiring", expenses: "expenses", "driver-statements": "driver-statements" };

/** The address of a report, with its period, as JSON or CSV. */
function reportUrl(key: Key, from: string, to: string, format: "json" | "csv") {
  const query = new URLSearchParams({ format });
  if (!AS_OF.includes(key)) {
    query.set("date_from", from);
    query.set("date_to", to);
  }
  if (key.startsWith("revenue")) query.set("group_by", key.split("-")[1]!);
  const path = key.startsWith("revenue") ? "revenue" : (PATHS[key] ?? key);
  return `/api/v1/reports/${path}?${query}`;
}

/** Reports: each with its numbers, its definition, and a CSV download. */
export function ReportsScreen() {
  const { me, can, state, set } = useConsole();
  const soon = useSoon();
  const org = me.organization;
  const zone = org.timezone;
  const today = todayIn(zone);
  const allowed = (needs: string[]) => needs.every((permission) => can(permission));
  const available = CATALOG.flatMap((group) => group.items).filter((item) => allowed(item.needs));
  const key = (available.find((item) => item.key === state.rpt)?.key ?? available[0]?.key ?? "on-time") as Key;
  const dx = (DX_KEYS as string[]).includes(key) ? (key as DxKey) : null;
  const custom = key === "fuel" || key === "on-time" || !!dx;
  const period = typeof state.rperiod === "string" ? state.rperiod : "this_month";
  const range = periodRange(period, today);
  const query = useQuery({
    queryKey: [org.id, "reports", "screen", key, range.from, range.to],
    queryFn: async () => {
      const response = await fetch(reportUrl(key, range.from, range.to, "json"), { credentials: "same-origin" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw toApiError(response.status, body);
      return body as Report;
    },
    enabled: available.length > 0 && !custom,
  });
  const report = query.data;
  const item = available.find((each) => each.key === key);
  const definition = DEFINITIONS[key] ?? { what: "", term: "", sources: "", excludes: "" };
  const money = (value: unknown) => formatMoney(String(value ?? "0"), report?.currency ?? org.base_currency);
  // The first column names the row and reads in bold; dates read as dates; an empty value is a dash.
  const show = (kind: string, value: unknown, first = false): Cell =>
    kind === "money" ? cell.money(money(value))
    : kind === "number" ? cell.num(value === null || value === undefined ? "—" : formatNumber(Number(value)))
    : kind === "percent" ? cell.num(value === null || value === undefined ? "—" : `${value}%`)
    : kind === "date" ? cell.maybe(typeof value === "string" ? formatDate(value) : "", "num t2")
    : cell.text(value === null || value === undefined || value === "" ? "—" : String(value), "", first ? "w5" : value ? "" : "mu");
  const columns = report?.columns ?? [];
  const cols = columns.map((column, i) => (i === 0 ? "minmax(0,1.6fr)" : column.kind === "text" ? "minmax(0,1fr)" : column.kind === "money" ? "132px" : "112px")).join(" ");
  const rows = (report?.rows ?? []).map((row, i) => ({ key: String(i), cells: columns.map((column, c) => show(column.kind, row[column.key], c === 0)) }));
  const totals = report?.totals ?? null;
  // The figures over the table: the report's own where a total would mean nothing, otherwise the totals of its
  // first number columns.
  const picked = KPI_COLUMNS[key];
  const kpis: { label: string; value: string; suffix: string }[] = report && KPIS[key]
    ? KPIS[key]!(report.rows, money)
    : columns.filter((column) => column.kind !== "text" && column.kind !== "date" && (!picked || picked.includes(column.key))).slice(0, 4).map((column) => {
        const value = totals?.[column.key] ?? (column.kind === "money" || column.kind === "number" ? (report?.rows ?? []).reduce((sum, row) => sum + Number(row[column.key] ?? 0), 0) : null);
        return { label: totals ? `${column.label} · total` : column.label, value: value === null || value === undefined ? "—" : column.kind === "money" ? money(value) : column.kind === "percent" ? `${value}` : formatNumber(Number(value)), suffix: column.kind === "percent" && value !== null && value !== undefined ? "%" : "" };
      });
  const fuelWeeks = typeof state.rweeks === "number" ? state.rweeks : 8;
  const fuelTruck = typeof state.rtruck === "string" ? state.rtruck : "";
  const customer = typeof state.rcust === "string" ? state.rcust : "";
  const csv = key === "fuel" ? fuelReportUrl(fuelWeeks, fuelTruck, "csv") : key === "on-time" ? onTimeUrl(fuelWeeks, customer, "csv") : reportUrl(key, range.from, range.to, "csv");
  const exportable = (can("reports.export") || can("reports.read")) && (!dx || dx === "ar-aging");

  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px", borderBottom: "1px solid var(--bd)" }}>
        <div className="f1">
          <div className="crumb">
            <span>Analytics</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>Reports</b>
          </div>
          <h1 className="h1">Reports</h1>
          <p className="sub">Every number ships with its definition, source, timezone and filters</p>
        </div>
        <div className="r g8">
          <button className="btn" onClick={soon("Scheduling reports")}>
            <Icon className="s14" d="M3 5h18v16H3zM16 3v4M8 3v4M3 10h18" />
            Schedule
          </button>
          {exportable ? (
            <a className="btn pri" href={csv} download>
              <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              Export CSV
            </a>
          ) : null}
        </div>
      </div>
      <div className="rpg">
        <nav className="rcat" aria-label="Report catalog">
          {CATALOG.map((group) => (
            <div key={group.l} className="c g2" style={{ marginBottom: "14px" }}>
              <div className="over" style={{ padding: "0 8px 6px" }}><span>{group.l}</span></div>
              {group.items.map((it) => {
                const locked = !allowed(it.needs);
                return (
                  <button key={it.key} className={clsx("rci", it.key === key && "on")} onClick={() => !locked && set({ rpt: it.key })} aria-current={it.key === key ? "page" : undefined} disabled={locked}>
                    <span className="f1 ell"><span>{it.l}</span></span>
                    {locked ? <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" /> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="c g16" style={{ padding: "20px 24px 24px", overflow: "auto", minHeight: "0" }}>
          {key === "fuel" ? <FuelReport /> : null}
          {key === "on-time" ? <OnTimeReport /> : null}
          {dx ? <DxReport kind={dx} /> : null}
          <div className="c g16 vz" hidden={custom}>
            <div className="r g12 ast">
              <div className="f1">
                <h2 style={{ fontSize: "18px", lineHeight: "24px", fontWeight: "600" }}>{item?.l ?? "Report"}</h2>
                <p className="fs13 mu">{definition.what}</p>
              </div>
              {!AS_OF.includes(key) ? (
                <div className="seg sm" role="group" aria-label="Period">
                  {PERIODS.map((each) => (
                    <button key={each.value} className={clsx(period === each.value && "on")} onClick={() => set({ rperiod: each.value })} aria-pressed={period === each.value}>{each.label}</button>
                  ))}
                </div>
              ) : (
                <span className="chip">{`As of ${formatDate(today)}`}</span>
              )}
            </div>
            {kpis.length ? (
              <div className="kpis" style={{ gridTemplateColumns: `repeat(${kpis.length},minmax(0,1fr))` }}>
                {kpis.map((k) => (
                  <div key={k.label} className="kpi">
                    <span className="kl"><span>{k.label}</span></span>
                    <span className="kv2">
                      <span>{k.value}</span>
                      <small><span>{k.suffix}</span></small>
                    </span>
                    <span className="ks"><span>{AS_OF.includes(key) ? `As of ${formatDate(today)}` : `${formatDate(range.from)} – ${formatDate(range.to)}`}</span></span>
                  </div>
                ))}
              </div>
            ) : null}
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">{report?.title ?? item?.l}</h2>
                <span className="fs12 mu">{report ? `${formatNumber(report.rows.length)} rows` : ""}</span>
              </div>
              {query.isPending ? <Skeleton /> : null}
              {query.isError ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : null}
              {report && !rows.length ? <EmptyState icon="M3 3v18h18M7 15l4-4 3 3 5-6" title="Nothing in this period" text="Try a longer period, or check back once loads are delivered." /> : null}
              {rows.length ? (
                <>
                  <div className="thead" style={{ gridTemplateColumns: cols }}>
                    {columns.map((column) => (
                      <span key={column.key} className={column.kind === "text" ? "" : "rt"}><span>{column.label}</span></span>
                    ))}
                  </div>
                  {rows.map((r) => (
                    <Fragment key={r.key}>
                      <div className="trow" style={{ gridTemplateColumns: cols }}>
                        {r.cells.map((c, i2) => (
                          <BasicCell key={i2} c={c} />
                        ))}
                      </div>
                    </Fragment>
                  ))}
                  {totals ? (
                    <div className="trow tot" style={{ gridTemplateColumns: cols }}>
                      {columns.map((column, i2) => (
                        <BasicCell key={i2} c={show(column.kind, totals[column.key])} />
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Definition</h2>
                <Icon className="s14 mu" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
              </div>
              <div className="cb c g10 fs12 t2" style={{ lineHeight: "17px" }}>
                <p>{definition.term}</p>
                <dl className="kv" style={{ fontSize: "12px" }}>
                  <dt>Sources</dt>
                  <dd className="mono">{definition.sources}</dd>
                  <dt>Timezone</dt>
                  <dd>{`The company’s · ${timeZoneLabel(zone)}`}</dd>
                  <dt>Excludes</dt>
                  <dd>{definition.excludes}</dd>
                  <dt>Access</dt>
                  <dd className="mono">{item?.needs.join(", ")}</dd>
                  <dt>Generated</dt>
                  <dd className="num">{query.dataUpdatedAt ? formatDateTime(new Date(query.dataUpdatedAt).toISOString(), zone) : "—"}</dd>
                </dl>
              </div>
            </section>
          </div>
          <section className="card oh" hidden={!exportable}>
            <div className="ch">
              <h2 className="h2">Exports</h2>
              <span className="fs12 mu">A CSV of the report as shown, for the chosen period</span>
            </div>
            <div className="wl">
              <span className="eqic"><Icon className="s14" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" /></span>
              <div className="f1">
                <div className="fs13 w5">{key === "fuel" ? `fuel_${fuelWeeks}_weeks.csv` : key === "on-time" ? `on_time_by_customer_${fuelWeeks}w.csv` : `${report?.name ?? key}${AS_OF.includes(key) ? `_${today}` : `_${range.from}_to_${range.to}`}.csv`}</div>
                <div className="fs12 mu">{item?.l}</div>
              </div>
              <span className="badge" data-k="ok">
                <i></i>
                Ready
              </span>
              {exportable ? <a className="btn xs" href={csv} download>Download</a> : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
