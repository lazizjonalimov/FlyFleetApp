"use client";

import { clsx } from "clsx";

/** Where the axis of a chart starts and ends, and the ticks between: the smallest round step that keeps the axis
 * to a handful of ticks, with a little room around the values. `floor` and `ceiling` bound it (0 and 100 for a
 * share). */
export function scale(values: number[], steps: number[], most = 5, floor = -Infinity, ceiling = Infinity) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  for (const step of steps) {
    const lo = Math.max(floor, Math.floor((min - step / 4) / step) * step);
    const hi = Math.min(ceiling, Math.ceil((max + step / 4) / step) * step);
    if ((hi - lo) / step <= most || step === steps.at(-1)) {
      const ticks: number[] = [];
      for (let v = hi; v >= lo - step / 1000; v -= step) ticks.push(Number(v.toFixed(4)));
      return { lo, hi: hi === lo ? lo + step : hi, ticks: hi === lo ? [lo + step, lo] : ticks };
    }
  }
  return { lo: min, hi: max, ticks: [max, min] };
}

export type LinePoint = {
  /** The week (or other step) on the axis: "Sep 21". */
  label: string;
  /** No value leaves a gap in the line. */
  value: number | null;
  /** The value as read: "91.4%". */
  text: string;
  /** A second line in the tooltip. */
  tip?: string;
};

/**
 * A line by week: values labelled at both ends, every point with a tooltip, an optional dashed reference line (a
 * target). A step with no value is a gap: the line breaks there rather than drawing through it.
 */
export function LineChart({ points, ticks, lo, hi, format, reference, aria, tall }: { points: LinePoint[]; ticks: number[]; lo: number; hi: number; format: (v: number) => string; reference?: { value: number; label: string } | null; aria: string; tall?: boolean }) {
  const n = points.length;
  const x = (i: number) => (i + 0.5) / n;
  const y = (v: number) => 1 - (v - lo) / (hi - lo);
  const shown = points.map((p, i) => ({ ...p, i })).filter((p) => p.value !== null);
  let path = "";
  points.forEach((p, i) => {
    if (p.value === null) return;
    path += `${i && points[i - 1]?.value !== null ? "L" : "M"}${(x(i) * 800).toFixed(1)},${(y(p.value) * 200).toFixed(1)} `;
  });
  const first = shown[0];
  const last = shown.at(-1);
  const chart = (
    <div className="lnch" role="group" aria-label={aria}>
      <div className="cy">
        {ticks.map((t) => <span key={t}><span>{format(t)}</span></span>)}
      </div>
      <div className="lnpl" style={{ backgroundSize: `100% ${(100 / Math.max(1, ticks.length - 1)).toFixed(4)}%` }}>
        <svg viewBox="0 0 800 200" preserveAspectRatio="none" aria-hidden="true"><path d={path.trim()} /></svg>
        {reference && reference.value >= lo && reference.value <= hi ? (
          <span className="lnref" style={{ top: `${(y(reference.value) * 100).toFixed(2)}%` }}><b><span>{reference.label}</span></b></span>
        ) : null}
        {points.map((p, i) => {
          const at = p.value === null ? null : `${(y(p.value) * 100).toFixed(2)}%`;
          const end = i === first?.i || i === last?.i;
          const neighbour = i === first?.i ? shown[1] : i === last?.i ? shown.at(-2) : undefined;
          // Below the point when the line leaves it upwards, unless that runs into the axis; above near the top.
          const height = p.value === null ? 0 : y(p.value);
          const below = height < 0.12 || (height < 0.82 && p.value !== null && neighbour?.value !== null && neighbour?.value !== undefined && neighbour.value > p.value);
          return (
            <span key={`${p.label}-${i}`} className="lnpt" style={{ left: `${(x(i) * 100).toFixed(3)}%`, width: `${(100 / n).toFixed(3)}%` }} tabIndex={0} aria-label={`Week of ${p.label}: ${p.text}${p.tip ? `. ${p.tip}` : ""}`}>
              {at ? <span className="lndot" style={{ top: at }}></span> : null}
              {at && end && shown.length > 1 ? <span className={clsx("lnval", below && "dn")} style={{ top: at }}><span>{p.text}</span></span> : null}
              <span className="lntip" style={{ top: at ?? "50%" }}>
                <b><span>{p.text}</span></b>
                <span>{"Week of "}<span>{p.label}</span></span>
                {p.tip ? <span><span>{p.tip}</span></span> : null}
              </span>
              <span className="lnx"><span>{p.label}</span></span>
            </span>
          );
        })}
      </div>
    </div>
  );
  return tall ? <div className="lntall">{chart}</div> : chart;
}
