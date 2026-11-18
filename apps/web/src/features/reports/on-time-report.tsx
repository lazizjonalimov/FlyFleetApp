"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { cell } from "@/components/data-table/cell";
import { DataCell } from "@/components/data-table/cells";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { combo } from "@/components/forms/combo";
import { Combobox } from "@/components/forms/combobox";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { api, unwrap } from "@/lib/api/client";
import { timeZoneLabel } from "@/lib/format/dates";
import { formatNumber, plural } from "@/lib/format/text";
import { LineChart, scale } from "./line-chart";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
/** The periods the chip steps through. */
export const WEEKS = [8, 13, 26];
const COLS = "minmax(0,1.4fr) 64px 72px 60px minmax(0,1.2fr) 84px";
/** "42 min", or hours once it runs past two. */
const lateness = (minutes: number) => (minutes < 120 ? [formatNumber(minutes), " min"] : [(minutes / 60).toFixed(1), " h"]);
const tone = (pct: number) => (pct >= 95 ? "ok" : pct >= 90 ? "brand" : "late");

/** The address of the on-time report as JSON or CSV. */
export function onTimeUrl(weeks: number, customer: string, format: "json" | "csv") {
  const q = new URLSearchParams({ weeks: String(weeks), format });
  if (customer) q.set("customer_id", customer);
  return `/api/v1/reports/on-time?${q}`;
}

/** Reports · On-time delivery: the share of delivery stops reached inside their appointment, week by week against
 * the target, which customers fare worst, and the weakest lane. */
export function OnTimeReport() {
  const { me, state, set, can } = useConsole();
  const org = me.organization;
  const weeks = typeof state.rweeks === "number" ? state.rweeks : 8;
  const customer = typeof state.rcust === "string" ? state.rcust : "";
  const [count, setCount] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const report = useQuery({
    queryKey: [org.id, "reports", "on-time", weeks, customer],
    queryFn: () => unwrap(api.GET("/api/v1/reports/on-time", { params: { query: { weeks, ...(customer ? { customer_id: customer } : {}) } } })),
    staleTime: 5 * 60_000,
  });
  const customers = useQuery({ queryKey: [org.id, "customers", "options"], queryFn: () => unwrap(api.GET("/api/v1/customers", { params: { query: { limit: 100, sort: "name" } } })), enabled: can("customers.read"), staleTime: 60_000 });
  const r = report.data;
  const pct = r?.pct === null || r?.pct === undefined ? null : Number(r.pct);
  const before = r?.previous_pct === null || r?.previous_pct === undefined ? null : Number(r.previous_pct);
  const delta = pct !== null && before !== null ? pct - before : null;
  const kpis = r
    ? [
        {
          label: "On-time delivery",
          value: pct === null ? "—" : pct.toFixed(1),
          suffix: pct === null ? "" : "%",
          sub: pct === null ? `No deliveries in the last ${weeks} weeks` : delta === null ? `No deliveries in the ${weeks} weeks before` : delta === 0 ? `No change vs prior ${weeks} weeks` : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)} pts vs prior ${weeks} weeks`,
          sk: delta === null || delta === 0 ? "mu" : delta > 0 ? "ok" : "bad",
        },
        { label: "Late deliveries", value: formatNumber(r.late), suffix: ` of ${formatNumber(r.deliveries)}`, sub: r.deliveries ? `${((100 * r.late) / r.deliveries).toFixed(1)}% of delivered stops` : "No delivered stops yet", sk: "mu" },
        r.avg_late_minutes !== null
          ? { label: "Average lateness", value: lateness(r.avg_late_minutes)[0]!, suffix: lateness(r.avg_late_minutes)[1]!, sub: r.median_late_minutes !== null ? `median ${lateness(r.median_late_minutes).join("")}` : "", sk: "mu" }
          : { label: "Average lateness", value: "—", suffix: "", sub: "No late deliveries", sk: "mu" },
        r.weakest_lane
          ? { label: "Weakest lane", value: `${r.weakest_lane.origin.split(",")[0]}→${r.weakest_lane.destination.split(",")[0]}`, suffix: "", sub: `${Number(r.weakest_lane.pct).toFixed(0)}% on time · ${plural(r.weakest_lane.deliveries, "load")}`, sk: "late", title: `${r.weakest_lane.origin} → ${r.weakest_lane.destination}` }
          : { label: "Weakest lane", value: "—", suffix: "", sub: "No lane with 3 or more deliveries", sk: "mu" },
      ]
    : [];

  const weeksOf = r?.by_week ?? [];
  const values = weeksOf.map((w) => (count ? (w.deliveries ? w.on_time : null) : w.pct === null ? null : Number(w.pct)));
  const present = values.filter((v): v is number => v !== null);
  const axis = present.length ? (count ? scale(present, [1, 2, 5, 10, 20, 50, 100, 200, 500], 5, 0) : scale([...present, r!.target_pct], [5, 10, 20, 25], 5, 0, 100)) : null;
  const points = weeksOf.map((w, i) => ({
    label: day(w.week_start),
    value: values[i] ?? null,
    text: values[i] === null || values[i] === undefined ? "No deliveries" : count ? formatNumber(values[i]!) : `${values[i]!.toFixed(1)}%`,
    tip: w.deliveries ? `${formatNumber(w.on_time)} of ${formatNumber(w.deliveries)} on time` : "",
  }));
  const below = present.length && !count ? present.every((v) => v < r!.target_pct) : false;
  const aria = present.length
    ? `${count ? "On-time deliveries" : "On-time delivery"} by week, from ${points.find((p) => p.value !== null)!.text} to ${[...points].reverse().find((p) => p.value !== null)!.text}${below ? `, below the ${r!.target_pct}% target every week` : ""}`
    : "No deliveries in these weeks";
  const options = (customers.data?.items ?? []).map((c) => ({ v: c.id, l: c.name, ab: "" }));
  const picked = options.find((o) => o.v === customer);
  const field = combo({ open, q, setOpen, setQ }, { k: "rcust", l: "Customer", value: customer, options, onPick: (v) => set({ rcust: v }), placeholder: "Customer", head: "Show one customer", search: true, qph: "Search customers", size: "sm" });

  return (
    <div className="c g16 vz">
      <div className="r g12 ast">
        <div className="f1">
          <h2 style={{ fontSize: "18px", lineHeight: "24px", fontWeight: "600" }}>On-time delivery</h2>
          <p className="fs13 mu">Share of delivery stops that arrived inside the appointment window</p>
        </div>
        <button className="chip" onClick={() => set({ rweeks: WEEKS[(WEEKS.indexOf(weeks) + 1) % WEEKS.length] })} aria-label={`Last ${weeks} weeks · change the period`}>
          {`Last ${weeks} weeks`}
          {weeks !== 8 ? <span role="button" aria-label="Back to 8 weeks" onClick={(e) => { e.stopPropagation(); set({ rweeks: 8 }); }}><Icon className="s12 b" d="M18 6L6 18M6 6l12 12" /></span> : null}
        </button>
        {picked ? (
          <button className="chip" onClick={() => set({ rcust: "" })} aria-label={`Showing ${picked.l} · show every customer`}>
            {picked.l}
            <Icon className="s12 b" d="M18 6L6 18M6 6l12 12" />
          </button>
        ) : options.length ? (
          <Combobox f={field} chip="Customer" />
        ) : null}
      </div>
      {report.isPending ? <Skeleton /> : null}
      {report.isError ? <ErrorState error={report.error} retry={() => void report.refetch()} /> : null}
      {r ? (
        <>
          <div className="kpis" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
            {kpis.map((k) => (
              <div key={k.label} className="kpi" title={"title" in k ? k.title : undefined}>
                <span className="kl"><span>{k.label}</span></span>
                <span className="kv2 ell">
                  <span>{k.value}</span>
                  <small><span>{k.suffix}</span></small>
                </span>
                <span className="ks" data-k={k.sk}><span>{k.sub}</span></span>
              </div>
            ))}
          </div>
          <div className="rgrid">
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">By week</h2>
                <span className="fs12 mu">{count ? "On-time deliveries" : `Target ${r.target_pct}%`}</span>
                <span className="sp"></span>
                <div className="seg sm" role="group" aria-label="Show as">
                  <button className={clsx(!count && "on")} aria-pressed={!count} onClick={() => setCount(false)}>%</button>
                  <button className={clsx(count && "on")} aria-pressed={count} onClick={() => setCount(true)}>Count</button>
                </div>
              </div>
              {axis ? (
                <LineChart points={points} ticks={axis.ticks} lo={axis.lo} hi={axis.hi} format={(v) => (count ? formatNumber(v) : `${v}%`)} reference={count ? null : { value: r.target_pct, label: `Target ${r.target_pct}%` }} aria={aria} />
              ) : (
                <EmptyState icon={I.chart} title="No deliveries in these weeks" text="A week shows once a delivery stop with an appointment has been reached." />
              )}
            </section>
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Definition</h2>
                <Icon className="s14 mu" d={I.info} />
              </div>
              <div className="cb c g10 fs12 t2" style={{ lineHeight: "17px" }}>
                <p>
                  <b>On time</b>
                  {" — arrival event at a delivery stop at or before the end of its appointment window, or within 15 minutes of a fixed appointment."}
                </p>
                <dl className="kv" style={{ fontSize: "12px" }}>
                  <dt>Sources</dt>
                  <dd className="mono">load_stops, load_status_events</dd>
                  <dt>Timezone</dt>
                  <dd>{`Weeks from Monday · ${timeZoneLabel(org.timezone)}`}</dd>
                  <dt>Excludes</dt>
                  <dd>Cancelled, on-hold loads; stops with no appointment</dd>
                  <dt>Access</dt>
                  <dd className="mono">reports.read</dd>
                  <dt>Generated</dt>
                  <dd className="num">{report.dataUpdatedAt ? `${new Date(report.dataUpdatedAt).toLocaleTimeString("en-US", { timeZone: org.timezone, hour: "2-digit", minute: "2-digit", hour12: false })} ${timeZoneLabel(org.timezone)} · cached 5 min` : "—"}</dd>
                </dl>
              </div>
            </section>
          </div>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">By customer</h2>
              <span className="fs12 mu">Worst first</span>
            </div>
            {r.by_customer.length ? (
              <>
                <div className="thead" style={{ gridTemplateColumns: COLS }}>
                  {["Customer", "Loads", "On time", "Late", "On-time %", "Avg late"].map((h, i) => (
                    <span key={h} className={i && i !== 4 ? "rt" : ""}><span>{h}</span></span>
                  ))}
                </div>
                {r.by_customer.map((c) => {
                  const share = Number(c.pct);
                  return (
                    <div key={c.customer_id} className="trow" style={{ gridTemplateColumns: COLS }}>
                      {[
                        cell.text(c.name, "", "w5"),
                        cell.num(formatNumber(c.deliveries)),
                        cell.num(formatNumber(c.on_time)),
                        cell.num(formatNumber(c.late)),
                        cell.bar(`${share.toFixed(0)}%`, `${share}%`, tone(share)),
                        cell.num(c.avg_late_minutes === null ? "—" : lateness(c.avg_late_minutes).join("")),
                      ].map((each, i) => <DataCell key={i} c={each} />)}
                    </div>
                  );
                })}
              </>
            ) : (
              <EmptyState icon={I.chart} title="Nothing delivered in these weeks" text="Customers show here once their loads reach a delivery stop with an appointment." />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

