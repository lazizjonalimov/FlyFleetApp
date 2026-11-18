"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { combo } from "@/components/forms/combo";
import { Combobox } from "@/components/forms/combobox";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import { stateName } from "@/features/fuel/shared";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { timeZoneLabel } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber } from "@/lib/format/text";
import { scale } from "./line-chart";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKS = [8, 13, 26];
const day = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const usd = (v: number, places = 3) => `$${v.toFixed(places)}`;

/** The address of the fuel report as JSON or CSV. */
export function fuelReportUrl(weeks: number, truck: string, format: "json" | "csv") {
  const q = new URLSearchParams({ weeks: String(weeks), format });
  if (truck) q.set("vehicle_id", truck);
  return `/api/v1/ifta/report?${q}`;
}

/** Reports · Fuel & IFTA: what fuel costs per mile week by week, which trucks burn the most against the fleet
 * average, and where the quarter's return stands. */
export function FuelReport() {
  const { me, can, state, set } = useConsole();
  const org = me.organization;
  const weeks = typeof state.rweeks === "number" ? state.rweeks : 8;
  const truck = typeof state.rtruck === "string" ? state.rtruck : "";
  const [table, setTable] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const report = useQuery({ queryKey: [org.id, "ifta", "report", weeks, truck], queryFn: async () => (await unwrap(api.GET("/api/v1/ifta/report", { params: { query: { weeks, ...(truck ? { vehicle_id: truck } : {}) } } }))) as Schema<"FuelReport"> });
  const trucks = useQuery({ queryKey: [org.id, "vehicles", "pick"], queryFn: () => unwrap(api.GET("/api/v1/vehicles", { params: { query: { sort: "unit_number", limit: 100 } } })), staleTime: 60_000 });
  const r = report.data;
  const money = (v: string | number) => formatMoney(String(v), org.base_currency);
  const q4 = r ? r.quarter.slice(4) : "";
  const points = (r?.weeks ?? []).filter((w) => w.cost_per_mile !== null);
  const cpm = r?.cost_per_mile ? Number(r.cost_per_mile) : null;
  const prevCpm = r?.previous_cost_per_mile ? Number(r.previous_cost_per_mile) : null;
  const mpg = r?.fleet_mpg ? Number(r.fleet_mpg) : null;
  const prevMpg = r?.previous_mpg ? Number(r.previous_mpg) : null;
  const gallons = r ? Number(r.gallons) : 0;
  const kpis = r
    ? [
        { label: `Fuel spend · ${q4} so far`, value: money(r.amount), sub: gallons ? `${formatNumber(Math.round(gallons))} gal · ${usd(Number(r.amount) / gallons, 2)} a gallon` : "No fuel bought yet", sk: "mu" },
        { label: "Fuel cost per mile", value: cpm !== null ? usd(cpm) : "—", sub: cpm !== null && prevCpm !== null ? `${cpm <= prevCpm ? "▼" : "▲"} ${(Math.abs(cpm - prevCpm) * 100).toFixed(1)}¢ vs ${prevQ(r.quarter)}` : "Needs miles and fuel", sk: cpm !== null && prevCpm !== null ? (cpm <= prevCpm ? "ok" : "warn") : "mu" },
        { label: "Fleet MPG", value: mpg !== null ? mpg.toFixed(2) : "—", sub: mpg !== null && prevMpg !== null ? `${mpg >= prevMpg ? "▲" : "▼"} ${Math.abs(mpg - prevMpg).toFixed(2)} vs ${prevQ(r.quarter)}` : "Miles ÷ gallons", sk: mpg !== null && prevMpg !== null ? (mpg >= prevMpg ? "ok" : "warn") : "mu" },
        { label: "IFTA net due · estimate", value: Number(r.net_tax) < 0 ? `(${money(-Number(r.net_tax))})` : money(r.net_tax), sub: r.missing_rates.length ? `No rate yet for ${r.missing_rates.slice(0, 3).join(", ")}` : r.base_tax !== null && Number(r.base_tax) < 0 ? `${stateName(r.base)} credit offsets ${money(-Number(r.base_tax))}` : `${q4} so far`, sk: r.missing_rates.length ? "warn" : "mu" },
      ]
    : [];
  // The line: fuel cost per mile by week, labelled at both ends, with each week's price and MPG on hover.
  const chart = points.length >= 2 ? (() => {
    const values = points.map((w) => Number(w.cost_per_mile));
    const { lo, hi, ticks } = scale(values, [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1]);
    const n = points.length;
    const x = (i: number) => (i + 0.5) / n;
    const y = (v: number) => 1 - (v - lo) / (hi - lo);
    return {
      ticks: ticks.map((t) => usd(t, 2)),
      grid: `${(100 / (ticks.length - 1)).toFixed(4)}%`,
      path: values.map((v, i) => `${i ? "L" : "M"}${(x(i) * 800).toFixed(1)},${(y(v) * 200).toFixed(1)}`).join(" "),
      w: `${(100 / n).toFixed(3)}%`,
      pts: points.map((w, i) => ({
        l: day(w.week_start), v: usd(values[i]!), x: `${(x(i) * 100).toFixed(3)}%`, y: `${(y(values[i]!) * 100).toFixed(2)}%`, lab: i === 0 || i === n - 1,
        lp: (i === 0 && values[1]! > values[0]!) || (i === n - 1 && values[n - 2]! > values[n - 1]!) ? "dn" : "",
        tip: [w.price_per_gallon ? `Diesel ${usd(Number(w.price_per_gallon), 2)}/gal` : "", w.mpg ? `${w.mpg} MPG` : ""].filter(Boolean).join(" · "),
      })),
      low: points.reduce((a, b) => (Number(b.cost_per_mile) < Number(a.cost_per_mile) ? b : a)),
    };
  })() : null;
  const prices = points.map((w) => Number(w.price_per_gallon)).filter((v) => v > 0);
  const mpgs = points.map((w) => Number(w.mpg)).filter((v) => v > 0);
  // The dot plot: each truck's MPG against the fleet average, best first; the axis starts where the trucks are.
  const ranked = [...(r?.trucks ?? [])].sort((a, b) => Number(b.mpg) - Number(a.mpg));
  const plot = ranked.length && mpg !== null ? (() => {
    const { lo, hi, ticks } = scale([...ranked.map((t) => Number(t.mpg)), mpg], [0.5, 1, 2], 6);
    const px = (v: number) => `${(((v - lo) / (hi - lo)) * 100).toFixed(2)}%`;
    return {
      ref: px(mpg),
      axis: [...ticks].reverse().map((t) => ({ l: t.toFixed(1), x: px(t) })),
      rows: ranked.slice(0, 12).map((t) => {
        const v = Number(t.mpg);
        const last = t.driver ? t.driver.split(" ").slice(-1)[0] : "no driver";
        return { key: t.vehicle_id, n: `${t.unit_number} · ${last}`, v: v.toFixed(2), x: px(v), sl: px(Math.min(v, mpg)), sw: `${((Math.abs(v - mpg) / (hi - lo)) * 100).toFixed(2)}%`, on: t.vehicle_id === truck,
          aria: `${t.unit_number}: ${v.toFixed(2)} MPG, ${formatNumber(Math.round(Number(t.miles)))} mi on ${formatNumber(Math.round(Number(t.gallons)))} gal · ${v >= mpg ? "+" : "−"}${Math.abs(v - mpg).toFixed(2)} vs fleet` };
      }),
    };
  })() : null;
  const truckOptions = (trucks.data?.items ?? []).map((u) => ({ v: u.id, l: u.unit_number, ab: u.make ?? "" }));
  const truckField = combo({ open, q, setOpen, setQ }, { k: "rtruck", l: "Truck", value: truck, options: truckOptions, onPick: (v) => set({ rtruck: v }), placeholder: "Truck", head: "Show one truck", search: true, qph: "Search trucks", size: "sm" });
  const picked = truckOptions.find((t) => t.v === truck);
  return (
    <div className="c g16 vz">
      <div className="r g12 ast">
        <div className="f1">
          <h2 style={{ fontSize: "18px", lineHeight: "24px", fontWeight: "600" }}>{"Fuel & IFTA"}</h2>
          <p className="fs13 mu">What fuel costs per mile, which trucks burn the most, and where the quarter’s tax return stands</p>
        </div>
        <button className="chip" onClick={() => set({ rweeks: WEEKS[(WEEKS.indexOf(weeks) + 1) % WEEKS.length] })} aria-label={`Last ${weeks} weeks · change the period`}>
          {`Last ${weeks} weeks`}
          {weeks !== 8 ? <span role="button" aria-label="Back to 8 weeks" onClick={(e) => { e.stopPropagation(); set({ rweeks: 8 }); }}><Icon className="s12 b" d="M18 6L6 18M6 6l12 12" /></span> : null}
        </button>
        {picked ? (
          <button className="chip" onClick={() => set({ rtruck: "" })} aria-label={`Showing ${picked.l} · show the whole fleet`}>
            {picked.l}
            <Icon className="s12 b" d="M18 6L6 18M6 6l12 12" />
          </button>
        ) : (
          <Combobox f={truckField} chip="Truck" />
        )}
      </div>
      {report.isPending ? <Skeleton /> : null}
      {report.isError ? <ErrorState error={report.error} retry={() => void report.refetch()} /> : null}
      {r ? (
        <>
          <div className="kpis" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
            {kpis.map((k) => (
              <div key={k.label} className="kpi">
                <span className="kl"><span>{k.label}</span></span>
                <span className="kv2"><span>{k.value}</span></span>
                <span className="ks" data-k={k.sk}><span>{k.sub}</span></span>
              </div>
            ))}
          </div>
          <div className="rgrid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
            <section className="card oh">
              <div className="ch">
                <div className="f1 c">
                  <h2 className="h2">Fuel cost per mile</h2>
                  <span className="fs12 mu">{`By week · diesel price ÷ MPG${picked ? ` · ${picked.l}` : ""}`}</span>
                </div>
                <div className="seg sm" role="group" aria-label="Show as">
                  <button className={table ? "" : "on"} aria-pressed={!table} onClick={() => setTable(false)}>Chart</button>
                  <button className={table ? "on" : ""} aria-pressed={table} onClick={() => setTable(true)}>Table</button>
                </div>
              </div>
              {!chart && !table ? <EmptyState icon={I.chart} title="Not enough weeks yet" text="A week shows once it has both miles and fuel. Miles come from GPS, imports and trips added by hand." /> : null}
              {chart && !table ? (
                <>
                  <div className="lntall">
                    <div className="lnch" role="group" aria-label={`Fuel cost per mile by week, from ${chart.pts[0]!.v} in the week of ${chart.pts[0]!.l} to ${chart.pts.at(-1)!.v} in the week of ${chart.pts.at(-1)!.l}`}>
                      <div className="cy">
                        {chart.ticks.map((t) => <span key={t}><span>{t}</span></span>)}
                      </div>
                      <div className="lnpl" style={{ backgroundSize: `100% ${chart.grid}` }}>
                        <svg viewBox="0 0 800 200" preserveAspectRatio="none" aria-hidden="true"><path d={chart.path} /></svg>
                        {chart.pts.map((pt) => (
                          <span key={pt.l} className="lnpt" style={{ left: pt.x, width: chart.w }} tabIndex={0} aria-label={`Week of ${pt.l}: ${pt.v}${pt.tip ? `. ${pt.tip}` : ""}`}>
                            <span className="lndot" style={{ top: pt.y }}></span>
                            {pt.lab ? <span className={clsx("lnval", pt.lp)} style={{ top: pt.y }}><span>{pt.v}</span></span> : null}
                            <span className="lntip" style={{ top: pt.y }}>
                              <b><span>{pt.v}</span></b>
                              <span>{"Week of "}<span>{pt.l}</span></span>
                              {pt.tip ? <span><span>{pt.tip}</span></span> : null}
                            </span>
                            <span className="lnx"><span>{pt.l}</span></span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="lnsum">
                    <div>
                      <b className="mono">{usd(Number(chart.low.cost_per_mile))}</b>
                      <em>{`Lowest · week of ${day(chart.low.week_start)}`}</em>
                    </div>
                    <div>
                      <b className="mono">{prices.length ? `${usd(Math.min(...prices), 2)}–${usd(Math.max(...prices), 2)}` : "—"}</b>
                      <em>Diesel, per gallon</em>
                    </div>
                    <div>
                      <b className="mono">{mpgs.length ? `${Math.min(...mpgs).toFixed(2)}–${Math.max(...mpgs).toFixed(2)}` : "—"}</b>
                      <em>Weekly MPG range</em>
                    </div>
                  </div>
                </>
              ) : null}
              {table ? (
                <>
                  <div className="wtab h">
                    <span>Week of</span>
                    <span className="tr">Diesel</span>
                    <span className="tr">MPG</span>
                    <span className="tr">Per mile</span>
                  </div>
                  {r.weeks.map((w) => (
                    <div key={w.week_start} className="wtab">
                      <span className="mono"><span>{day(w.week_start)}</span></span>
                      <span className="mono tr"><span>{w.price_per_gallon ? usd(Number(w.price_per_gallon), 2) : "—"}</span></span>
                      <span className="mono tr"><span>{w.mpg ?? "—"}</span></span>
                      <span className="mono tr w5"><span>{w.cost_per_mile ? usd(Number(w.cost_per_mile)) : "—"}</span></span>
                    </div>
                  ))}
                </>
              ) : null}
            </section>
            <section className="card oh">
              <div className="ch">
                <div className="f1 c">
                  <h2 className="h2">MPG by truck</h2>
                  <span className="fs12 mu">{`${q4} so far · best first · ${Math.min(12, ranked.length)} of ${ranked.length} ${ranked.length === 1 ? "truck" : "trucks"}`}</span>
                </div>
              </div>
              {!plot ? <EmptyState icon={I.truck} title="No truck has miles and fuel yet" text="Each truck’s MPG is its miles this quarter divided by the gallons bought for it." /> : null}
              {plot ? (
                <>
                  <ol className="rk dplot" style={{ padding: "10px 10px 0" }} aria-label="Trucks by miles per gallon, best first">
                    {plot.rows.map((row) => (
                      <li key={row.key} className={clsx("rkr", row.on && "on")} title={row.aria} aria-label={row.aria}>
                        <span className="rkn ell"><span>{row.n}</span></span>
                        <span className="dpt">
                          <i className="dpa" style={{ left: plot.ref }}></i>
                          <i className="dps" style={{ left: row.sl, width: row.sw }}></i>
                          <i className="dpd" style={{ left: row.x }}></i>
                        </span>
                        <span className="rkv mono tr"><span>{row.v}</span></span>
                      </li>
                    ))}
                  </ol>
                  <div className="dpax" aria-hidden="true">
                    <span></span>
                    <div className="axl">
                      {plot.axis.map((t) => <b key={t.l} className="axt" style={{ left: t.x }}><span>{t.l}</span></b>)}
                    </div>
                    <span></span>
                  </div>
                  <div className="rkey">
                    <i></i>
                    {`Fleet average ${mpg!.toFixed(2)} MPG · each line runs from the average to the truck`}
                  </div>
                </>
              ) : null}
            </section>
          </div>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Definitions</h2>
              <Icon className="s14 mu" d={I.info} />
              <span className="sp"></span>
              {can("expenses.read") ? <button className="lnk" onClick={() => set(goTo("fuel"))}>{"Open Fuel & IFTA"}</button> : null}
            </div>
            <div className="cb c g8 fs12 t2" style={{ lineHeight: "17px" }}>
              <p>
                <b>MPG</b>
                {" — miles driven (GPS, imports and trips added by hand) divided by gallons bought on fuel cards and receipts in the same period. "}
                <b>Fuel cost per mile</b>
                {" — the week’s fuel spend divided by that week’s miles: the diesel price divided by MPG."}
              </p>
              <dl className="kv" style={{ fontSize: "12px" }}>
                <dt>Sources</dt>
                <dd className="mono">expenses (fuel), ifta_trips, ifta_trip_miles</dd>
                <dt>Period</dt>
                <dd>{`Weeks start Monday, the company’s time · ${timeZoneLabel(org.timezone)}`}</dd>
                <dt>Access</dt>
                <dd className="mono">reports.read</dd>
              </dl>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

const prevQ = (q: string) => (q.endsWith("Q1") ? "Q4" : `Q${Number(q.slice(5)) - 1}`);
