"use client";

import { clsx } from "clsx";
import { useState } from "react";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { formatNumber } from "@/lib/format/text";
import { addDays, monday, money, monthTitle, shortDay, tileValue, useFinancial, type Fin } from "./dx-data";
import { DxEmpty, DxHead, Lines, Ring, Spark, type DrawerSpec, type Series } from "./dx-ui";

type Lane = Fin["lanes"][number];
const AGING_K = ["ok", "warn", "late", "bad", "bad"];
export const marginTone = (pct: number | null | undefined) => (pct === null || pct === undefined ? "mu" : pct >= 20 ? "ok" : pct >= 10 ? "warn" : "bad");

/** The money figures, each with seven months of history and whether the change is good. */
export function MoneyTiles({ fin }: { fin: Fin }) {
  return (
    <div className="dx-tiles" role="group" aria-label="Money figures">
      {fin.tiles.map((t) => (
        <div key={t.key} className="dx-tile" title={t.definition}>
          <span className="fs12 t2 w5">{t.label}</span>
          <span className="fs24 w6 tx num">{tileValue(t.value ?? null, t.unit)}</span>
          <span className="fs12 tc" data-k={t.tone === "good" ? "ok" : t.tone === "bad" ? "bad" : "mu"}>{t.change_text}</span>
          <Spark points={t.series.map((v) => (v === null || v === undefined ? null : Number(v)))} k={t.tone === "bad" ? "bad" : "brand"} />
          <span className="sr-only">{t.definition}</span>
        </div>
      ))}
    </div>
  );
}

/** Revenue and cost by week, with the same weeks before for comparison. */
export function RevenueCost({ weeks, setWeeks, fin }: { weeks: 4 | 12 | 26; setWeeks: (w: 4 | 12 | 26) => void; fin: Fin }) {
  const [compare, setCompare] = useState(false);
  const rev = fin.weeks.map((w) => Number(w.revenue));
  const cost = fin.weeks.map((w) => Number(w.cost));
  const series: Series[] = [
    { key: "rev", label: "Revenue", k: "brand", points: rev },
    { key: "cost", label: "Cost", k: "warn", points: cost },
    ...(compare ? [{ key: "prev", label: "Revenue, previous period", k: "mu", points: fin.weeks.map((w) => Number(w.prior_revenue)), dotted: true }] : []),
  ];
  const t = fin.totals;
  const summary = `Over ${weeks} weeks: revenue ${money(t.revenue)}, cost ${money(t.cost)}, margin ${money(t.margin)}.` + (compare ? ` Previous ${weeks} weeks: revenue ${money(t.prior_revenue)}.` : "") + ` By week: ${fin.weeks.map((w) => `${shortDay(w.week_start)} ${money(w.revenue)} revenue, ${money(w.cost)} cost`).join("; ")}.`;
  return (
    <section className="card" aria-label="Revenue and cost">
      <DxHead title="Revenue and cost" sub="By week" report="revenue-cost">
        <div className="seg sm" role="group" aria-label="Weeks shown">
          {([4, 12, 26] as const).map((w) => <button key={w} type="button" className={clsx(weeks === w && "on")} aria-pressed={weeks === w} onClick={() => setWeeks(w)}>{`${w} weeks`}</button>)}
        </div>
        <button type="button" className="btn xs" aria-pressed={compare} onClick={() => setCompare(!compare)}>Compare to previous period</button>
      </DxHead>
      <div className="cb c g10">
        <div className="r g16 wrap fs12" aria-hidden="true">
          {series.map((s) => <span key={s.key} className="r g6"><i className={clsx("dx-key", s.dotted && "dot")} data-k={s.k}></i><span className="t2">{s.label}</span><b className="tx num">{money(s.key === "rev" ? t.revenue : s.key === "cost" ? t.cost : t.prior_revenue)}</b></span>)}
          <span className="r g6"><span className="t2">Margin</span><b className="tx num">{money(t.margin)}</b></span>
        </div>
        {series.some((x) => x.points.some((v) => v > 0))
          ? <Lines series={series} labels={fin.weeks.map((w) => shortDay(w.week_start))} summary={summary} format={(n) => money(n)} />
          : <DxEmpty text={`No revenue or cost recorded in the last ${weeks} weeks.`} />}
        <p className="fs12 mu">{fin.definitions.cost}</p>
      </div>
    </section>
  );
}

export function GoalCard({ fin }: { fin: Fin }) {
  const g = fin.goal;
  return (
    <section className="card" aria-label={`${monthTitle(fin.today).split(" ")[0]} goal`}>
      <DxHead title={`${monthTitle(fin.today).split(" ")[0]} goal`} sub={g.basis} report="revenue-cost" />
      <div className="cb r g16" style={{ alignItems: "center" }}>
        <Ring value={g.pct ?? null} label="Progress to the month's goal, percent" size={96} k={g.pct !== null && g.pct !== undefined && g.pct >= 100 ? "ok" : "brand"} />
        <dl className="c g6 fs13" style={{ margin: 0 }}>
          <div><dt className="fs12 mu">So far</dt><dd className="w6 tx num">{money(g.so_far)}</dd></div>
          <div><dt className="fs12 mu">Goal</dt><dd className="tx num">{g.goal ? money(g.goal) : "—"}</dd></div>
          <div><dt className="fs12 mu">{`At this pace, by month end (${g.days_left} days left)`}</dt><dd className="tx num">{g.projected ? money(g.projected) : "—"}</dd></div>
        </dl>
      </div>
    </section>
  );
}

export function AgingCard({ fin }: { fin: Fin }) {
  const total = Number(fin.aging_total);
  return (
    <section className="card" aria-label="Receivables aging">
      <DxHead title="Receivables aging" sub={`${money(fin.aging_total)} owed`} report="ar-aging" />
      <div className="cb c g10">
        {total ? (
          <>
            <div className="dx-stack" role="img" aria-label={`Receivables by age: ${fin.aging.map((b) => `${b.label} ${money(b.amount)}`).join(", ")}`}>
              {fin.aging.filter((b) => Number(b.amount) > 0).map((b) => <i key={b.key} data-k={AGING_K[fin.aging.indexOf(b)]} style={{ flex: `${Number(b.amount)} 1 0` }}></i>)}
            </div>
            <ul className="dx-legend">
              {fin.aging.map((b, i) => <li key={b.key}><span className="dot" data-k={AGING_K[i]}></span><span className="t2 f1">{b.label}</span><b className="num tx">{money(b.amount)}</b><span className="mu num">{b.share === null || b.share === undefined ? "—" : `${b.share}%`}</span></li>)}
            </ul>
          </>
        ) : <DxEmpty text="Nobody owes anything on issued invoices." />}
      </div>
    </section>
  );
}

export function CashCard({ fin }: { fin: Fin }) {
  const top = Math.max(1, ...fin.cash.flatMap((w) => [Number(w.cash_in), Number(w.cash_out)]));
  return (
    <section className="card" aria-label="Cash forecast">
      <DxHead title="Cash forecast" sub="Next 4 weeks" report="cash" />
      <div className="cb c g8">
        <p className="sr-only">{fin.cash.map((w) => `Week of ${shortDay(w.week_start)}: in ${money(w.cash_in)}, out ${money(w.cash_out)}, net ${money(w.net)}`).join(". ")}</p>
        <div className="dx-paired" aria-hidden="true">
          {fin.cash.map((w) => (
            <div key={w.week_start} className="c g4">
              <div className="dx-pcols"><i data-k="ok" style={{ height: `${(Number(w.cash_in) / top) * 90}px` }}></i><i data-k="warn" style={{ height: `${(Number(w.cash_out) / top) * 90}px` }}></i></div>
              <span className="fs12 mu">{shortDay(w.week_start)}</span>
              <span className="fs12 num tc" data-k={Number(w.net) >= 0 ? "ok" : "bad"}>{`${Number(w.net) >= 0 ? "+" : ""}${money(w.net)}`}</span>
            </div>
          ))}
        </div>
        <div className="r g12 fs12 t2" aria-hidden="true"><span className="r g6"><i className="dx-key" data-k="ok"></i>In</span><span className="r g6"><i className="dx-key" data-k="warn"></i>Out</span></div>
        <p className="fs12 mu">{fin.definitions.cash}</p>
      </div>
    </section>
  );
}

export function LaneTable({ fin, open }: { fin: Fin; open: (l: Lane) => void }) {
  return (
    <section className="card oh" aria-label="Lane profitability">
      <DxHead title="Lane profitability" sub={`Last ${fin.lane_days} days`} report="lanes" />
      {fin.lanes.length ? (
        <div role="table" aria-label="Lanes by revenue">
          <div role="row" className="thead dx-lanes"><span role="columnheader">Lane</span><span role="columnheader" className="rt">Loads</span><span role="columnheader" className="rt">Revenue</span><span role="columnheader" className="rt">Cost</span><span role="columnheader">Margin</span></div>
          {fin.lanes.map((l) => (
            <button key={l.key} type="button" role="row" className="trow dx-lanes" onClick={() => open(l)} aria-label={`${l.key}: ${l.loads} loads, revenue ${money(l.revenue)}, cost ${money(l.cost)}, margin ${l.margin_pct ?? "—"}%. Open details.`}>
              <span role="cell" className="fs13 tx ell">{l.key}</span>
              <span role="cell" className="rt num">{formatNumber(l.loads)}</span>
              <span role="cell" className="rt num">{money(l.revenue)}</span>
              <span role="cell" className="rt num">{money(l.cost)}</span>
              <span role="cell" className="r g8"><span className="dx-bt" aria-hidden="true"><i data-k={marginTone(l.margin_pct)} style={{ width: `${Math.max(0, Math.min(100, l.margin_pct ?? 0))}%` }}></i></span><span className="tag" data-k={marginTone(l.margin_pct)}>{l.margin_pct === null || l.margin_pct === undefined ? "—" : `${l.margin_pct}%`}</span></span>
            </button>
          ))}
        </div>
      ) : <div className="cb"><DxEmpty text="No loads delivered in the last 90 days." /></div>}
      <p className="fs12 mu" style={{ padding: "8px 16px 12px" }}>{fin.definitions.lanes}</p>
    </section>
  );
}

export function laneDrawer(l: Lane, today: string, close: () => void, openLoads: () => void): DrawerSpec {
  const first = addDays(monday(today), -49);
  return {
    tag: { label: "Lane", k: marginTone(l.margin_pct) },
    title: l.key,
    sub: `${formatNumber(l.loads)} loads · ${formatNumber(l.miles)} miles · last 90 days`,
    stats: [
      { label: "Revenue", value: money(l.revenue) },
      { label: "Cost", value: money(l.cost) },
      { label: "Profit", value: money(l.profit), tone: Number(l.profit) >= 0 ? "ok" : "bad" },
      { label: "Loads", value: formatNumber(l.loads) },
    ],
    bars: { label: "Revenue by week, last 7 weeks", points: l.weeks.slice(-7).map((v, i) => ({ label: shortDay(addDays(first, 7 * (i + 1))), value: Number(v) })), format: (n) => money(n) },
    rowsTitle: "Top customers",
    rows: l.customers.map((c) => ({ label: c.name, value: money(c.revenue), sub: `${c.loads} loads` })),
    actions: [{ label: "Open Loads", primary: true, go: () => { close(); openLoads(); } }, { label: "Close", go: close }],
  };
}

/** The Financial tab, for roles with finance access. */
export function FinancialTab({ openLane }: { openLane: (l: Lane) => void }) {
  const [weeks, setWeeks] = useState<4 | 12 | 26>(12);
  const fin = useFinancial(weeks);
  const f = fin.data;
  if (fin.isError) return <div className="banner" data-k="bad" role="alert" style={{ margin: "12px 24px" }}><div className="f1">The money figures couldn’t be loaded.</div></div>;
  if (!f) return <p className="fs13 mu" style={{ padding: "24px" }}>Loading the money figures…</p>;
  return (
    <div className="c g16" style={{ padding: "16px 24px 24px" }}>
      <MoneyTiles fin={f} />
      <div className="dx-2col"><RevenueCost weeks={weeks} setWeeks={setWeeks} fin={f} /><GoalCard fin={f} /></div>
      <div className="dx-2col even"><AgingCard fin={f} /><CashCard fin={f} /></div>
      <LaneTable fin={f} open={openLane} />
    </div>
  );
}

export function useOpenLoads() {
  const { set } = useConsole();
  return () => set(goTo("loads"));
}
