// Small chart builders shared by the owner screens: stacked columns, multi-line and ranked bars. They turn
// series of numbers into the percentages and labels the design's chart markup draws.

/** The design's categorical series tones, in order. */
export const VK = ["v1", "v2", "v3", "v4", "v5", "v6"];

/** A round axis maximum just above `v`: 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Dollars, shortened: $68.6k, $159k, $412. */
export const kfmt = (v: number): string => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(Math.abs(v) >= 100000 ? 0 : 1)}k` : `$${Math.round(v)}`);

export type Series = { n: string; vals: number[]; k?: string };

/** An empty chart still gets a readable axis: $0 to $1k for money, 0 to 4 for counts. */
const floorOf = (fmt: (v: number) => string) => (fmt === kfmt ? 1000 : 4);

export function colStack(series: Series[], labels: string[], fmt: (v: number) => string = kfmt) {
  const tot = labels.map((_, i) => series.reduce((a, s) => a + (s.vals[i] || 0), 0));
  const mx = Math.max(niceMax(Math.max(0, ...tot) * 1.08), floorOf(fmt));
  return {
    ticks: [mx, mx * 0.75, mx * 0.5, mx * 0.25, 0].map(fmt),
    legend: series.map((s, i) => ({ n: s.n, k: s.k || VK[i % 6]! })),
    cols: labels.map((l, i) => ({
      l,
      tot: fmt(tot[i]!),
      b: `${((tot[i]! / mx) * 100).toFixed(2)}%`,
      title: `${l}: ${series.map((s) => `${s.n} ${fmt(s.vals[i] || 0)}`).join(" · ")}`,
      segs: series
        .map((s, j) => ({ k: s.k || VK[j % 6]!, h: `${(tot[i] ? ((s.vals[i] || 0) / tot[i]!) * 100 : 0).toFixed(2)}%`, on: (s.vals[i] || 0) > 0 }))
        .filter((sg) => sg.on),
    })),
  };
}

export function multiLine(series: Series[], labels: string[], fmt: (v: number) => string = kfmt) {
  const all = series.flatMap((s) => s.vals);
  const mx = Math.max(niceMax(Math.max(0, ...all) * 1.08), floorOf(fmt));
  const n = labels.length;
  const xf = (i: number) => (i + 0.5) / n;
  const yf = (v: number) => 1 - v / mx;
  return {
    vb: "0 0 800 200",
    ticks: [mx, mx * 0.75, mx * 0.5, mx * 0.25, 0].map(fmt),
    w: `${(100 / n).toFixed(3)}%`,
    legend: series.map((s, i) => ({ n: s.n, k: s.k || VK[i % 6]! })),
    paths: series.map((s, i) => ({ k: s.k || VK[i % 6]!, d: s.vals.map((v, j) => `${j ? "L" : "M"}${(xf(j) * 800).toFixed(1)},${(yf(v) * 200).toFixed(1)}`).join(" ") })),
    pts: labels.map((l, j) => ({
      l,
      x: `${(xf(j) * 100).toFixed(3)}%`,
      dots: series.map((s, i) => ({ k: s.k || VK[i % 6]!, y: `${(yf(s.vals[j] ?? 0) * 100).toFixed(2)}%` })),
      tip: series.map((s, i) => ({ k: s.k || VK[i % 6]!, n: s.n, v: fmt(s.vals[j] ?? 0) })),
      aria: `${l}: ${series.map((s) => `${s.n} ${fmt(s.vals[j] ?? 0)}`).join(", ")}`,
    })),
    ends: series.map((s, i) => ({ k: s.k || VK[i % 6]!, v: fmt(s.vals[n - 1] ?? 0), y: `${(yf(s.vals[n - 1] ?? 0) * 100).toFixed(2)}%` })),
  };
}

export type Bar = { n: string; v: number; s?: string; k?: string };

export const hbars = (items: Bar[], fmt: (v: number) => string = kfmt) => {
  const mx = Math.max(1, ...items.map((x) => Math.abs(x.v)));
  return items.map((x, i) => ({ n: x.n, v: fmt(x.v), s: x.s || "", k: x.k || VK[i % 6]!, w: `${((Math.abs(x.v) / mx) * 74).toFixed(2)}%`, neg: x.v < 0 ? "neg" : "" }));
};
