"use client";

import { clsx } from "clsx";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";

// ---------------------------------------------------------------- the shared detail drawer
export type DrawerStat = { label: string; value: string; tone?: string };
export type DrawerRow = { label: string; value: string; sub?: string; go?: () => void };
export type DrawerAction = { label: string; go: () => void; primary?: boolean };
export type DrawerSpec = {
  tag: { label: string; k: string };
  title: string;
  sub?: string;
  stats: DrawerStat[];
  bars?: { label: string; points: { label: string; value: number | null }[]; format?: (n: number) => string };
  rowsTitle?: string;
  rows?: DrawerRow[];
  actions: DrawerAction[];
};

/**
 * One drawer for every detail on the dashboard: a figure, a truck, a driver, a lane or a calendar event. It closes
 * with Escape or the scrim, and gives focus back to what opened it.
 */
export function DxDrawer({ spec, onClose }: { spec: DrawerSpec; onClose: () => void }) {
  const opener = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    heading.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      opener.current?.focus?.();
    };
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose}></div>
      <aside className="drawer dx-drawer" aria-label={`${spec.title} details`}>
        <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid var(--bd)" }}>
          <div className="r g8">
            <span className="tag" data-k={spec.tag.k}>{spec.tag.label}</span>
            <span className="sp"></span>
            <button type="button" className="btn ghost icon sm" onClick={onClose} aria-label="Close"><Icon d="M18 6L6 18M6 6l12 12" /></button>
          </div>
          <h2 ref={heading} tabIndex={-1} className="fs16 w6 tx" style={{ marginTop: "8px", outline: "none" }}>{spec.title}</h2>
          {spec.sub ? <p className="fs13 mu" style={{ marginTop: "2px" }}>{spec.sub}</p> : null}
        </div>
        <div className="c g16" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "16px 20px" }}>
          <dl className="dx-stats">
            {spec.stats.slice(0, 4).map((s) => (
              <div key={s.label}><dt>{s.label}</dt><dd className={clsx(s.tone && "tc")} data-k={s.tone}>{s.value}</dd></div>
            ))}
          </dl>
          {spec.bars ? <Bars title={spec.bars.label} points={spec.bars.points} format={spec.bars.format} /> : null}
          {spec.rows?.length ? (
            <section className="c g6" aria-label={spec.rowsTitle ?? "Details"}>
              <h3 className="fs12 w6 t2">{spec.rowsTitle ?? "Details"}</h3>
              <ul className="dx-rows">
                {spec.rows.map((r, i) => (
                  <li key={`${r.label}-${i}`}>
                    {r.go ? (
                      <button type="button" className="dx-rowb" onClick={r.go}><span className="f1 mw0"><span className="fs13 tx ell">{r.label}</span>{r.sub ? <span className="fs12 mu ell">{r.sub}</span> : null}</span><span className="fs13 num t2">{r.value}</span></button>
                    ) : (
                      <div className="dx-rowb"><span className="f1 mw0"><span className="fs13 tx ell">{r.label}</span>{r.sub ? <span className="fs12 mu ell">{r.sub}</span> : null}</span><span className="fs13 num t2">{r.value}</span></div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <div className="r g8 wrap" style={{ padding: "12px 20px", borderTop: "1px solid var(--bd)" }}>
          {spec.actions.map((a) => <button key={a.label} type="button" className={clsx("btn", a.primary && "pri")} onClick={a.go}>{a.label}</button>)}
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------- charts (each with a text alternative)
/** Up to seven bars with labels under them; the numbers are also said in words. */
export function Bars({ title, points, format = (n) => n.toLocaleString("en-US") }: { title: string; points: { label: string; value: number | null }[]; format?: (n: number) => string }) {
  const top = Math.max(1, ...points.map((p) => p.value ?? 0));
  return (
    <figure className="c g6" style={{ margin: 0 }}>
      <figcaption className="fs12 w6 t2">{title}</figcaption>
      <p className="sr-only">{points.map((p) => `${p.label}: ${p.value === null ? "no figure" : format(p.value)}`).join(", ")}</p>
      <div className="dx-bars" aria-hidden="true">
        {points.map((p, i) => (
          <div key={`${p.label}-${i}`} className="dx-bar">
            <span className="fs12 num t3">{p.value === null ? "" : format(p.value)}</span>
            <i style={{ height: `${p.value === null ? 0 : Math.max(3, (p.value / top) * 64)}px` }} className={clsx(i === points.length - 1 && "now")}></i>
            <span className="fs12 mu">{p.label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** A ring from 0 to 100 with the number in the middle. */
export function Ring({ value, label, size = 72, k = "brand" }: { value: number | null; label: string; size?: number; k?: string }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${value === null ? "no figure yet" : `${value} out of 100`}`} className="dx-ring" data-k={k}>
      <circle cx={size / 2} cy={size / 2} r={r} className="trk" />
      <circle cx={size / 2} cy={size / 2} r={r} className="val" strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="num">{value === null ? "—" : value}</text>
    </svg>
  );
}

/** A half circle, 0 to 100, with a mark at the goal. */
export function Gauge({ value, goal, label }: { value: number | null; goal: number; label: string }) {
  const w = 180;
  const r = 70;
  const cx = w / 2;
  const cy = 86;
  const pt = (pct: number) => {
    const a = Math.PI * (1 - pct / 100);
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as const;
  };
  const arc = (pct: number) => {
    const [x, y] = pt(pct);
    return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`;
  };
  const [gx, gy] = pt(goal);
  const tone = value === null ? "mu" : value >= goal ? "ok" : value >= goal - 5 ? "warn" : "bad";
  return (
    <svg viewBox={`0 0 ${w} 100`} width={w} height={100} role="img" aria-label={`${label}: ${value === null ? "no deliveries judged yet" : `${value}%`}, goal ${goal}%`} className="dx-gauge" data-k={tone}>
      <path d={arc(100)} className="trk" />
      {value !== null ? <path d={arc(Math.max(0.5, value))} className="val" /> : null}
      <line x1={gx} y1={gy} x2={cx + (gx - cx) * 0.78} y2={cy + (gy - cy) * 0.78} className="goal" />
      <text x={cx} y={cy - 12} textAnchor="middle" className="big num">{value === null ? "—" : `${value}%`}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" className="small">{`Goal ${goal}%`}</text>
    </svg>
  );
}

/** A small line, drawn for the eye only: the numbers are in the text beside it. */
export function Spark({ points, k = "brand" }: { points: (number | null)[]; k?: string }) {
  const known = points.filter((p): p is number => p !== null);
  if (known.length < 2) return <svg className="dx-spark" viewBox="0 0 100 24" aria-hidden="true"></svg>;
  const max = Math.max(...known);
  const min = Math.min(...known);
  const y = (v: number) => (max === min ? 12 : 21 - ((v - min) / (max - min)) * 18);
  let d = "";
  points.forEach((p, i) => {
    if (p === null) return;
    d += `${d && points[i - 1] !== null ? "L" : "M"}${((i / (points.length - 1)) * 100).toFixed(1)} ${y(p).toFixed(1)} `;
  });
  return <svg className="dx-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true" data-k={k}><path d={d.trim()} fill="none" vectorEffect="non-scaling-stroke" /></svg>;
}

export type Series = { key: string; label: string; k: string; points: number[]; dotted?: boolean };
/** Lines over the same x axis, with labels on the axis; drawn for the eye, summarised in `summary`. */
export function Lines({ series, labels, summary, height = 180, format = (n: number) => String(n) }: { series: Series[]; labels: string[]; summary: string; height?: number; format?: (n: number) => string }) {
  const all = series.flatMap((s) => s.points);
  const top = Math.max(1, ...all);
  const w = 600;
  const pad = 36;
  const x = (i: number) => pad + (labels.length < 2 ? 0 : (i / (labels.length - 1)) * (w - pad - 8));
  const y = (v: number) => 8 + (1 - v / top) * (height - 30);
  return (
    <figure style={{ margin: 0 }}>
      <p className="sr-only">{summary}</p>
      <svg viewBox={`0 0 ${w} ${height}`} className="dx-lines" aria-hidden="true" preserveAspectRatio="none">
        {[0, 0.5, 1].map((f) => (
          <g key={f}><line x1={pad} x2={w - 8} y1={y(top * f)} y2={y(top * f)} className="grid" /><text x={pad - 6} y={y(top * f) + 4} textAnchor="end" className="ax">{format(top * f)}</text></g>
        ))}
        {series.map((s) => (
          <path key={s.key} data-k={s.k} className={clsx("ln", s.dotted && "dot")} d={s.points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")} />
        ))}
        {labels.map((l, i) => (i % Math.ceil(labels.length / 6) === 0 || i === labels.length - 1 ? <text key={`${l}-${i}`} x={x(i)} y={height - 4} textAnchor={i === labels.length - 1 ? "end" : i === 0 ? "start" : "middle"} className="ax">{l}</text> : null))}
      </svg>
    </figure>
  );
}

/** A donut of parts with the headline in the middle. */
export function Donut({ parts, center, sub, label }: { parts: { label: string; value: number; k: string }[]; center: string; sub: string; label: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const r = 46;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" width={132} height={132} role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(", ")}. ${center} ${sub}.`} className="dx-donut">
      <circle cx="60" cy="60" r={r} className="trk" />
      {total ? parts.map((p) => {
        const len = (p.value / total) * c;
        const el = <circle key={p.label} cx="60" cy="60" r={r} data-k={p.k} className="seg" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />;
        offset += len;
        return el;
      }) : null}
      <text x="60" y="58" textAnchor="middle" className="big num">{center}</text>
      <text x="60" y="76" textAnchor="middle" className="small">{sub}</text>
    </svg>
  );
}

/** A list of bars with a name and a value, longest first. */
export function BarList({ items, label, format = (n: number) => String(n), tone }: { items: { key: string; label: string; value: number; sub?: string; k?: string; go?: () => void }[]; label: string; format?: (n: number) => string; tone?: (n: number) => string }) {
  const top = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="dx-blist" aria-label={label}>
      {items.map((i) => {
        const body = (
          <>
            <span className="fs13 t2 ell dx-bn">{i.label}{i.sub ? <span className="fs12 mu">{` · ${i.sub}`}</span> : null}</span>
            <span className="dx-bt" aria-hidden="true"><i data-k={i.k ?? tone?.(i.value) ?? "brand"} style={{ width: `${(i.value / top) * 100}%` }}></i></span>
            <span className="fs12 num tx dx-bv">{format(i.value)}</span>
          </>
        );
        return <li key={i.key}>{i.go ? <button type="button" className="dx-bl" onClick={i.go}>{body}</button> : <div className="dx-bl">{body}</div>}</li>;
      })}
    </ul>
  );
}

/** A card header with an Open report link, for roles that open Reports. */
export function DxHead({ title, sub, report, children }: { title: string; sub?: string; report?: string; children?: ReactNode }) {
  const { can, set } = useConsole();
  return (
    <div className="ch" style={{ flexWrap: "wrap", rowGap: "6px" }}>
      <div className="f1 c mw0">
        <h2 className="h2">{title}</h2>
        {sub ? <span className="fs12 mu">{sub}</span> : null}
      </div>
      {children}
      {report && can("reports.read") ? <button type="button" className="lnk" onClick={() => set({ ...goTo("reports"), rpt: report })} aria-label={`Open report: ${title}`}>Open report</button> : null}
    </div>
  );
}

/** Nothing to draw yet: what's missing and why. */
export function DxEmpty({ text }: { text: string }) {
  return <p className="fs13 mu" style={{ padding: "16px 0", textAlign: "center" }}>{text}</p>;
}
