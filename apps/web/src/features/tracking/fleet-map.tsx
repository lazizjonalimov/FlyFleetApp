"use client";

import { clsx } from "clsx";
import { geoMercator, geoPath, type GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import usAtlas from "us-atlas/states-10m.json";
import worldAtlas from "world-atlas/countries-110m.json";
import { Icon } from "@/components/ui/icon";
import { INTERSTATES } from "@/lib/reference/interstates";
import { US_CITIES } from "@/lib/reference/us-cities";

// Outlines: US Census cartographic boundaries (us-atlas) and Natural Earth (world-atlas), both public domain.
const US = usAtlas as unknown as Topology<{ states: GeometryCollection<{ name: string }>; nation: GeometryCollection }>;
const WORLD = worldAtlas as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const NEIGHBOURS = new Set(["124", "484"]); // Canada, Mexico
const LOWER_48: Bounds = [[-124.8, 24.4], [-66.9, 49.4]];
const ARROW = "M12 2l7 19-7-4-7 4z";

export type Bounds = [[number, number], [number, number]];
export type MapMarker = {
  id: string;
  unit: string;
  label?: string;
  lat: number;
  lon: number;
  heading: number | null;
  /** The marker's colour: brand (moving), mu (stopped), bad (alert), off (no signal). */
  tone: string;
  stale: boolean;
  aria: string;
};
export type MapFence = { id: string; name: string; lat: number; lon: number; radius_m: number; tone: string };
export type Padding = { left: number; right: number; top: number; bottom: number };
type View = { k: number; x: number; y: number };
type Pt = [number, number];

/** Where a set of positions sits, opened out so a single truck isn't shown at street level. */
export function boundsOf(points: { lat: number; lon: number }[]): Bounds {
  if (!points.length) return LOWER_48;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of points) {
    x0 = Math.min(x0, p.lon);
    x1 = Math.max(x1, p.lon);
    y0 = Math.min(y0, p.lat);
    y1 = Math.max(y1, p.lat);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = Math.max(x1 - x0, 4.5);
  const h = Math.max(y1 - y0, 3);
  return [[cx - w / 2, cy - h / 2], [cx + w / 2, cy + h / 2]];
}

const corners = (b: Bounds): Feature<Geometry> => ({ type: "Feature", properties: {}, geometry: { type: "MultiPoint", coordinates: [b[0], b[1], [b[0][0], b[1][1]], [b[1][0], b[0][1]]] } });

/**
 * The live fleet's map: water, land and state lines, the main interstates, cities, geofences, the trucks and the
 * selected truck's trail. Drag to move, scroll or use the buttons to zoom. Trucks close together gather into a
 * numbered circle that zooms in when clicked.
 */
export function FleetMap({ markers, fences, trail, plan, selected, onSelect, focus, padding, showFences, showTrails }: {
  markers: MapMarker[];
  fences: MapFence[];
  trail: Pt[];
  plan: Pt[];
  selected: string | null;
  onSelect: (id: string) => void;
  /** What to show; a new object refits the view. */
  focus: { bounds: Bounds; key: string };
  padding: Padding;
  showFences: boolean;
  showTrails: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [fitted, setFitted] = useState<{ bounds: Bounds; key: string; pad: Padding } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]!.contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A new focus (first data, "fit", a changed panel) refits the view.
  if (!fitted || fitted.key !== focus.key) {
    setFitted({ bounds: focus.bounds, key: focus.key, pad: padding });
    setView({ k: 1, x: 0, y: 0 });
  }

  const projection = useMemo<GeoProjection | null>(() => {
    if (!size.w || !size.h || !fitted) return null;
    const pad = fitted.pad;
    const x0 = Math.min(pad.left, size.w / 3);
    const x1 = Math.max(size.w - pad.right, x0 + 120);
    return geoMercator().fitExtent([[x0 + 30, pad.top + 30], [x1 - 30, Math.max(size.h - pad.bottom - 30, pad.top + 120)]], corners(fitted.bounds));
  }, [size.w, size.h, fitted]);

  const base = useMemo(() => {
    if (!projection) return null;
    const path = geoPath(projection);
    const countries = feature(WORLD, WORLD.objects.countries) as FeatureCollection<Geometry, { name: string }>;
    const states = feature(US, US.objects.states) as FeatureCollection<Geometry, { name: string }>;
    return {
      neighbours: countries.features.filter((f) => NEIGHBOURS.has(String(f.id))).map((f) => path(f) ?? "").join(""),
      nation: path(feature(US, US.objects.nation) as FeatureCollection) ?? "",
      borders: path(mesh(US, US.objects.states, (a, b) => a !== b)) ?? "",
      roads: Object.entries(INTERSTATES).map(([n, line]) => ({ n, d: path({ type: "LineString", coordinates: line.map((p) => [p[0], p[1]]) }) ?? "", pts: line.map((p) => projection([p[0], p[1]]) as Pt) })),
      states: states.features.filter((f) => f.properties.name).map((f) => {
        const [[bx0, by0], [bx1, by1]] = path.bounds(f);
        return { name: f.properties.name, c: path.centroid(f) as Pt, w: bx1 - bx0, h: by1 - by0 };
      }),
      cities: US_CITIES.map(([name, , lat, lon, pop]) => ({ name, pop, p: projection([lon, lat]) as Pt })),
      perDegree: Math.abs((projection([-90, 40]) as Pt)[0] - (projection([-89, 40]) as Pt)[0]),
    };
  }, [projection]);

  const at = (p: Pt): Pt => [p[0] * view.k + view.x, p[1] * view.k + view.y];
  const project = (lon: number, lat: number): Pt | null => {
    const p = projection?.([lon, lat]);
    return p ? at(p as Pt) : null;
  };
  const inside = (p: Pt, margin = 40) => p[0] > -margin && p[1] > -margin && p[0] < size.w + margin && p[1] < size.h + margin;

  // Labels that fit: bigger places first, nothing drawn over something already placed.
  const placed: [number, number, number, number][] = [];
  const free = (x: number, y: number, w: number, h: number) => {
    if (placed.some(([a, b, c, d]) => x < a + c && x + w > a && y < b + d && y + h > b)) return false;
    placed.push([x, y, w, h]);
    return true;
  };
  const ppd = (base?.perDegree ?? 0) * view.k;
  const minPop = ppd < 14 ? 1_000_000 : ppd < 28 ? 500_000 : ppd < 55 ? 200_000 : ppd < 110 ? 100_000 : 50_000;
  const states = (base?.states ?? []).flatMap((s) => {
    const p = at(s.c);
    if (!inside(p, 0) || s.w * view.k < 150 || s.h * view.k < 60) return [];
    const w = s.name.length * 10 + 10;
    return free(p[0] - w / 2, p[1] - 8, w, 16) ? [{ name: s.name, p }] : [];
  });
  const cities = (base?.cities ?? []).flatMap((c) => {
    if (c.pop < minPop || !c.p) return [];
    const p = at(c.p);
    if (!inside(p, 0)) return [];
    const w = c.name.length * 6.6 + 8;
    return placed.length < 70 && free(p[0] - w / 2, p[1] - 7, w, 14) ? [{ name: c.name, big: c.pop >= 400_000, p }] : [];
  });
  const shields: { n: string; p: Pt }[] = [];
  for (const r of base?.roads ?? []) {
    for (let i = 1; i < r.pts.length; i++) {
      const a = at(r.pts[i - 1]!);
      const b = at(r.pts[i]!);
      const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 90 || !inside(m, -20) || shields.length >= 16) continue;
      if (shields.some((s) => Math.hypot(s.p[0] - m[0], s.p[1] - m[1]) < 150)) continue;
      if (free(m[0] - 13, m[1] - 9, 26, 18)) shields.push({ n: r.n, p: m });
    }
  }

  // Trucks, gathered into a numbered circle where three or more would sit on top of each other.
  const shown = markers.flatMap((m) => {
    const p = project(m.lon, m.lat);
    return p && inside(p) ? [{ ...m, p }] : [];
  });
  const groups: { at: Pt; items: typeof shown }[] = [];
  for (const m of [...shown].sort((a, b) => Number(b.id === selected) - Number(a.id === selected))) {
    const g = m.id === selected ? null : groups.find((x) => !x.items.some((i) => i.id === selected) && Math.hypot(x.at[0] - m.p[0], x.at[1] - m.p[1]) < 30);
    if (g) {
      g.items.push(m);
      g.at = [(g.at[0] * (g.items.length - 1) + m.p[0]) / g.items.length, (g.at[1] * (g.items.length - 1) + m.p[1]) / g.items.length];
    } else groups.push({ at: m.p, items: [m] });
  }
  const zoomAt = (factor: number, cx = size.w / 2, cy = size.h / 2) =>
    setView((v) => {
      const k = Math.min(60, Math.max(0.4, v.k * factor));
      const f = k / v.k;
      return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
    });
  // Bring the chosen truck into view when it is off the map or under a panel.
  const selPos = selected ? markers.find((m) => m.id === selected) : undefined;
  const [lastSel, setLastSel] = useState<string | null>(null);
  if (selected !== lastSel && projection) {
    setLastSel(selected);
    const s = selPos ? project(selPos.lon, selPos.lat) : null;
    const hidden = s && (s[0] < padding.left + 20 || s[0] > size.w - padding.right - 20 || s[1] < padding.top + 20 || s[1] > size.h - padding.bottom - 20);
    if (selPos && hidden) {
      const p = projection([selPos.lon, selPos.lat]) as Pt;
      const cx = (padding.left + size.w - padding.right) / 2;
      setView((v) => ({ ...v, x: cx - p[0] * v.k, y: (padding.top + size.h - padding.bottom) / 2 - p[1] * v.k }));
    }
  }

  const line = (pts: Pt[]) => pts.map((p, i) => {
    const q = project(p[0], p[1]);
    return q ? `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}` : "";
  }).join("");

  return (
    <div
      ref={box}
      className="mcanvas"
      style={{ position: "absolute", inset: 0, cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
      onWheel={(e) => {
        const r = box.current!.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) {
          d.moved = true;
          setDragging(true);
        }
        setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
      }}
      onPointerUp={() => {
        drag.current = null;
        setDragging(false);
      }}
    >
      {base ? (
        <svg width={size.w} height={size.h} style={{ position: "absolute", left: 0, top: 0 }} aria-hidden="true">
          <rect width={size.w} height={size.h} className="mwater" />
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            <path d={base.neighbours} style={{ fill: "var(--land)", stroke: "var(--line)", strokeWidth: 0.8 }} vectorEffect="non-scaling-stroke" />
            <path d={base.nation} style={{ fill: "var(--land)", stroke: "var(--line)", strokeWidth: 1 }} vectorEffect="non-scaling-stroke" />
            <path d={base.borders} className="mstate" vectorEffect="non-scaling-stroke" />
            {base.roads.map((r) => <path key={`c${r.n}`} d={r.d} className="mcase" vectorEffect="non-scaling-stroke" />)}
            {base.roads.map((r) => <path key={`r${r.n}`} d={r.d} className="mmajor" vectorEffect="non-scaling-stroke" />)}
          </g>
          {showTrails && trail.length > 1 ? <path d={line(trail)} className="mtrail" /> : null}
          {showTrails && plan.length > 1 ? <path d={line(plan)} className="mplan" /> : null}
        </svg>
      ) : null}
      {states.map((s) => (
        <span key={`s${s.name}`} className="city st" style={{ left: `${s.p[0]}px`, top: `${s.p[1]}px` }}><span>{s.name}</span></span>
      ))}
      {cities.map((c) => (
        <span key={`c${c.name}${c.p[0]}`} className={clsx("city", c.big && "big")} style={{ left: `${c.p[0]}px`, top: `${c.p[1]}px` }}><span>{c.name}</span></span>
      ))}
      {shields.map((s) => (
        <span key={`h${s.n}${s.p[0]}`} className="shield" style={{ left: `${s.p[0]}px`, top: `${s.p[1]}px` }}><span>{s.n}</span></span>
      ))}
      {showFences
        ? fences.map((f) => {
            const c = project(f.lon, f.lat);
            const n = project(f.lon, f.lat + f.radius_m / 111_320);
            if (!c || !n || !inside(c, 200)) return null;
            const d = Math.max(14, Math.abs(c[1] - n[1]) * 2);
            return (
              <span key={f.id} className="fence" data-k={f.tone} style={{ left: `${c[0]}px`, top: `${c[1]}px`, width: `${d}px`, height: `${d}px` }}>
                <span className="fencel"><span>{f.name}</span></span>
              </span>
            );
          })
        : null}
      {groups.map((g) =>
        g.items.length >= 3 ? (
          <button key={`g${g.items[0]!.id}`} className="vcl" style={{ left: `${g.at[0]}px`, top: `${g.at[1]}px` }} aria-label={`${g.items.length} trucks: ${g.items.map((i) => i.unit).join(", ")}. Zoom in`} onClick={() => zoomAt(2.4, g.at[0], g.at[1])}>
            <span>{g.items.length}</span>
          </button>
        ) : (
          g.items.map((m) => (
            <button key={m.id} className={clsx("vm", m.stale && "stale", m.id === selected && "sel")} data-k={m.tone} style={{ left: `${m.p[0]}px`, top: `${m.p[1]}px` }} aria-label={m.aria} aria-pressed={m.id === selected} onClick={() => onSelect(m.id)}>
              <span className="vmh">
                {m.heading !== null && !m.stale ? (
                  <span className="r" style={{ transform: `rotate(${m.heading}deg)` }}><Icon className="s12 fill" d={ARROW} /></span>
                ) : (
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "currentColor" }}></span>
                )}
              </span>
              <span className="vml"><span>{m.label ?? m.unit}</span></span>
            </button>
          ))
        ),
      )}
      <div className="c g4" style={{ position: "absolute", right: `${padding.right}px`, bottom: "16px", zIndex: 4 }}>
        <button className="btn icon sm" aria-label="Zoom in" onClick={() => zoomAt(1.6)}><Icon className="s14" d="M12 5v14M5 12h14" /></button>
        <button className="btn icon sm" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.6)}><Icon className="s14" d="M5 12h14" /></button>
        <button className="btn icon sm" aria-label="Fit the trucks in view" onClick={() => setView({ k: 1, x: 0, y: 0 })}><Icon className="s14" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></button>
      </div>
    </div>
  );
}
