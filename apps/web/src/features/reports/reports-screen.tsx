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

type Report = Schema<"Report">;
type Key = "revenue-customer" | "revenue-month" | "revenue-terminal" | "drivers" | "trucks" | "ar-aging";

const CATALOG: { l: string; items: { key: Key; l: string; anyOf: string[] }[] }[] = [
  { l: "Operational", items: [{ key: "drivers", l: "Driver performance", anyOf: ["reports.read"] }, { key: "trucks", l: "Truck performance", anyOf: ["reports.read"] }] },
  {
    l: "Financial",
    items: [
      { key: "revenue-customer", l: "Revenue by customer", anyOf: ["reports.read"] },
      { key: "revenue-month", l: "Revenue by month", anyOf: ["reports.read"] },
      { key: "revenue-terminal", l: "Revenue by terminal", anyOf: ["reports.read"] },
      { key: "ar-aging", l: "Receivables aging", anyOf: ["reports.read", "invoices.read"] },
    ],
  },
];
const DEFINITIONS: Record<Key, { what: string; term: string; sources: string; excludes: string }> = {
  "revenue-customer": { what: "Revenue of the loads each customer had delivered in the period, with miles and revenue per mile.", term: "Revenue — the customer rate plus billable charges, counted when the load is delivered.", sources: "loads, load charges", excludes: "Cancelled loads, loads not yet delivered" },
  "revenue-month": { what: "Delivered revenue month by month.", term: "Revenue — the customer rate plus billable charges, counted when the load is delivered.", sources: "loads, load charges", excludes: "Cancelled loads, loads not yet delivered" },
  "revenue-terminal": { what: "Delivered revenue split by the terminal each load belongs to.", term: "Revenue — the customer rate plus billable charges, counted when the load is delivered.", sources: "loads, terminals", excludes: "Cancelled loads, loads not yet delivered" },
  drivers: { what: "Loads each driver delivered in the period: miles, on-time delivery and revenue.", term: "On time — arrived at the last stop no later than the end of its appointment.", sources: "loads, stops, assignments", excludes: "Cancelled loads, loads not yet delivered" },
  trucks: { what: "Loads each truck delivered in the period: miles, on-time delivery and revenue.", term: "On time — arrived at the last stop no later than the end of its appointment.", sources: "loads, stops, assignments", excludes: "Cancelled loads, loads not yet delivered" },
  "ar-aging": { what: "What each customer owes on issued invoices, by how far past the due date it is.", term: "Age — days past the invoice’s due date, as of today.", sources: "invoices, payments", excludes: "Draft and void invoices" },
};

/** The address of a report, with its period, as JSON or CSV. */
function reportUrl(key: Key, from: string, to: string, format: "json" | "csv") {
  const query = new URLSearchParams({ format });
  if (key !== "ar-aging") {
    query.set("date_from", from);
    query.set("date_to", to);
  }
  if (key.startsWith("revenue")) query.set("group_by", key.split("-")[1]!);
  const path = key.startsWith("revenue") ? "revenue" : key;
  return `/api/v1/reports/${path}?${query}`;
}

/** Reports: each with its numbers, its definition, and a CSV download. */
export function ReportsScreen() {
  const { me, can, state, set } = useConsole();
  const soon = useSoon();
  const org = me.organization;
  const zone = org.timezone;
  const today = todayIn(zone);
  const available = CATALOG.flatMap((group) => group.items).filter((item) => can(...item.anyOf));
  const key = (available.find((item) => item.key === state.rpt)?.key ?? available[0]?.key ?? "revenue-customer") as Key;
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
    enabled: available.length > 0,
  });
  const report = query.data;
  const item = available.find((each) => each.key === key);
  const definition = DEFINITIONS[key];
  const money = (value: unknown) => formatMoney(String(value ?? "0"), report?.currency ?? org.base_currency);
  const show = (kind: string, value: unknown): Cell => (kind === "money" ? cell.money(money(value)) : kind === "number" ? cell.num(formatNumber(Number(value ?? 0))) : kind === "percent" ? cell.num(value === null || value === undefined ? "—" : `${value}%`) : cell.text(String(value ?? "—"), "", "w5"));
  const columns = report?.columns ?? [];
  const cols = columns.map((column, i) => (i === 0 ? "minmax(0,1.6fr)" : column.kind === "money" ? "132px" : "112px")).join(" ");
  const rows = (report?.rows ?? []).map((row, i) => ({ key: String(i), cells: columns.map((column) => show(column.kind, row[column.key])) }));
  const totals = report?.totals ?? null;
  const kpis = columns.filter((column) => column.kind !== "text").slice(0, 4).map((column) => {
    const value = totals?.[column.key] ?? (column.kind === "money" || column.kind === "number" ? (report?.rows ?? []).reduce((sum, row) => sum + Number(row[column.key] ?? 0), 0) : null);
    return { label: column.label, value: value === null || value === undefined ? "—" : column.kind === "money" ? money(value) : column.kind === "percent" ? `${value}` : formatNumber(Number(value)), suffix: column.kind === "percent" && value !== null && value !== undefined ? "%" : "" };
  });
  const csv = reportUrl(key, range.from, range.to, "csv");
  const exportable = can("reports.export") || can("reports.read");

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
                const locked = !can(...it.anyOf);
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
          <div className="c g16 vz">
            <div className="r g12 ast">
              <div className="f1">
                <h2 style={{ fontSize: "18px", lineHeight: "24px", fontWeight: "600" }}>{item?.l ?? "Report"}</h2>
                <p className="fs13 mu">{definition.what}</p>
              </div>
              {key !== "ar-aging" ? (
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
                    <span className="kl"><span>{totals ? `${k.label} · total` : k.label}</span></span>
                    <span className="kv2">
                      <span>{k.value}</span>
                      <small><span>{k.suffix}</span></small>
                    </span>
                    <span className="ks"><span>{key === "ar-aging" ? "Open balances" : `${formatDate(range.from)} – ${formatDate(range.to)}`}</span></span>
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
                  <dd className="mono">{item?.anyOf.join(", ")}</dd>
                  <dt>Generated</dt>
                  <dd className="num">{query.dataUpdatedAt ? formatDateTime(new Date(query.dataUpdatedAt).toISOString(), zone) : "—"}</dd>
                </dl>
              </div>
            </section>
          </div>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Exports</h2>
              <span className="fs12 mu">A CSV of the report as shown, for the chosen period</span>
            </div>
            <div className="wl">
              <span className="eqic"><Icon className="s14" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" /></span>
              <div className="f1">
                <div className="fs13 w5">{`${report?.name ?? key}${key === "ar-aging" ? `_${today}` : `_${range.from}_to_${range.to}`}.csv`}</div>
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
