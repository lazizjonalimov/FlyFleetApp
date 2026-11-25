"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatNumber, plural } from "@/lib/format/text";

export type Kpi = Schema<"Kpi">;
export type Period = "today" | "week" | "month";
type Company = { id: string; code: string; name: string; slug: string; color: string; logo_url?: string | null };
export type CompanyKpis = { organization: Company; data: Schema<"KpisOut"> };
const SINCE: Record<Period, string> = { today: "yesterday", week: "last week", month: "last month" };

/** The change between the last two points, in words with an arrow, judged by which way is better. */
export function changeOf(kpi: Pick<Kpi, "good">, now: number, before: number | null | undefined, period: Period): Kpi["change"] {
  const since = SINCE[period];
  if (before === null || before === undefined) return { delta: null, tone: "neutral", text: `No figure for ${since} yet` };
  const delta = now - before;
  if (!delta) return { delta: 0, tone: "neutral", text: `No change vs ${since}` };
  const better = delta > 0 === (kpi.good === "up");
  return { delta, tone: kpi.good === "neutral" ? "neutral" : better ? "good" : "bad", text: `${delta > 0 ? "▲" : "▼"} ${formatNumber(Math.abs(delta))} vs ${since}` };
}

/**
 * The same figures for several companies, added up: values, totals and each point (a point is missing only when
 * every company's is). The list behind a summed figure is the same list across all companies.
 */
export function sumKpis(companies: CompanyKpis[], period: Period): Kpi[] {
  const order: string[] = [];
  const byKey = new Map<string, Kpi[]>();
  for (const company of companies) {
    for (const kpi of company.data.kpis) {
      if (!byKey.has(kpi.key)) {
        byKey.set(kpi.key, []);
        order.push(kpi.key);
      }
      byKey.get(kpi.key)!.push(kpi);
    }
  }
  return order.slice(0, 6).map((key) => {
    const all = byKey.get(key)!;
    const first = all[0]!;
    const value = all.reduce((n, k) => n + k.value, 0);
    const totals = all.map((k) => k.total).filter((t): t is number => typeof t === "number");
    const series = first.series.map((_, i) => {
      const points = all.map((k) => k.series[i]).filter((v): v is number => typeof v === "number");
      return points.length ? points.reduce((n, v) => n + v, 0) : null;
    });
    series[series.length - 1] = value;
    return { ...first, value, total: totals.length ? totals.reduce((n, t) => n + t, 0) : null, series,
      sub: `across ${plural(all.length, "company", "companies")}`, change: changeOf(first, value, series[series.length - 2], period) };
  });
}

/** The figures for the company in the address, or for every company the person can open, summed. */
export function useKpis(period: Period) {
  const { me } = useConsole();
  const all = me.organization.slug === "all";
  return useQuery({
    queryKey: [me.organization.id, "dashboard", "kpis", period],
    queryFn: async () => {
      if (!all) {
        const out = await unwrap(api.GET("/api/v1/dashboard/kpis", { params: { query: { period } } }));
        return { kpis: out.kpis, companies: [] as CompanyKpis[] };
      }
      const combined = (await unwrap(api.GET("/api/v1/dashboard/kpis", { params: { query: { period } } }))) as unknown as { by_company: CompanyKpis[] };
      return { kpis: sumKpis(combined.by_company, period), companies: combined.by_company };
    },
    refetchInterval: 60_000,
  });
}

/** A seven-point line, drawn only for the eye: the numbers are in the card's text. */
function Sparkline({ points, tone }: { points: (number | null)[]; tone: string }) {
  const known = points.filter((p): p is number => p !== null);
  if (known.length < 2) return <svg className="kspark" viewBox="0 0 100 24" aria-hidden="true"></svg>;
  const max = Math.max(...known);
  const min = Math.min(...known);
  const y = (v: number) => (max === min ? 12 : 21 - ((v - min) / (max - min)) * 18);
  const x = (i: number) => (i / (points.length - 1)) * 100;
  let path = "";
  points.forEach((p, i) => {
    if (p === null) return;
    path += `${path && points[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)} ${y(p).toFixed(1)} `;
  });
  const last = points.length - 1;
  return (
    <svg className="kspark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true" data-k={tone}>
      <path d={path.trim()} fill="none" vectorEffect="non-scaling-stroke" />
      {points[last] !== null ? <circle cx={x(last)} cy={y(points[last]!)} r="2" /> : null}
    </svg>
  );
}

/** Six cards: each says what it counts, how it changed, and opens the exact list behind its number. */
export function KpiCards({ kpis, loading }: { kpis: Kpi[]; loading: boolean }) {
  const { set } = useConsole();
  const open = (kpi: Kpi) => set({ ...goTo(kpi.target.screen), lpreset: { screen: kpi.target.screen, label: kpi.target.label, params: kpi.target.params } });
  if (loading && !kpis.length) {
    return <div className="kpis" style={{ margin: "0 24px", gridTemplateColumns: "repeat(6,minmax(0,1fr))", minHeight: "126px" }} aria-busy="true"></div>;
  }
  return (
    <div className="kpis" style={{ margin: "0 24px", gridTemplateColumns: `repeat(${Math.max(1, kpis.length)},minmax(0,1fr))` }}>
      {kpis.map((k) => (
        <button key={k.key} type="button" className="kpi" onClick={() => open(k)} title={k.definition}
          aria-label={`${k.label}: ${formatNumber(k.value)}${typeof k.total === "number" ? ` of ${formatNumber(k.total)}` : ""}. ${k.sub}. ${k.change.text}. Open the list.`}>
          <span className="kl">
            <span className="dot" data-k={k.tone}></span>
            <span className="ell"><span>{k.label}</span></span>
          </span>
          <span className="kv2">
            <span>{formatNumber(k.value)}</span>
            {typeof k.total === "number" ? <small><span>{` / ${formatNumber(k.total)}`}</span></small> : null}
          </span>
          <span className="ks mu"><span>{k.sub}</span></span>
          <span className={clsx("kchg", k.change.tone)}><span>{k.change.text}</span></span>
          <Sparkline points={k.series} tone={k.tone} />
        </button>
      ))}
    </div>
  );
}
