"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useOpenConversation } from "@/features/messages/use-message";
import { api, unwrap } from "@/lib/api/client";
import { toLocalInput } from "@/lib/format/dates";
import { formatNumber } from "@/lib/format/text";
import { HIGHWAYS, hours, project, useLive, useOps, shortDay, type Ops } from "./dx-data";
import { BarList, DxEmpty, DxHead, Gauge, Spark, type DrawerSpec } from "./dx-ui";

type Vehicle = NonNullable<ReturnType<typeof useLive>["data"]>["vehicles"][number];
export type PinStatus = "transit" | "pickup" | "delivery" | "late" | "available";
export const PIN: Record<PinStatus, { label: string; k: string }> = {
  transit: { label: "In transit", k: "brand" },
  pickup: { label: "At pickup", k: "teal" },
  delivery: { label: "At delivery", k: "violet" },
  late: { label: "Late", k: "bad" },
  available: { label: "Available", k: "ok" },
};

/** A truck's status on the map, from its load. */
export function pinStatus(v: Pick<Vehicle, "load">): PinStatus {
  const load = v.load;
  if (!load) return "available";
  if (load.late_by_minutes > 0 || load.delivery_late_by_minutes > 0) return "late";
  if (load.status === "at_pickup") return "pickup";
  if (load.status === "at_delivery") return "delivery";
  return "transit";
}

/** Whether a truck matches the search: unit, driver, load or route. */
export function matchesTruck(v: Vehicle, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [v.unit_number, v.driver?.name, v.load?.load_number, v.load?.lane, v.place].some((x) => x?.toLowerCase().includes(s));
}

function Tiles({ ops }: { ops: Ops }) {
  const { set } = useConsole();
  return (
    <div className="dx-tiles" role="group" aria-label="Live status">
      {ops.tiles.map((t) => (
        <button key={t.key} type="button" className="dx-tile" onClick={() => set({ ...goTo("loads"), lpreset: { screen: "loads", label: t.label, params: t.params } })}
          aria-label={`${t.label}: ${t.count}. ${t.sub}. Open the list.`}>
          <span className="r g6 fs12 t2 w5"><span className="dot" data-k={t.tone}></span>{t.label}</span>
          <span className="fs24 w6 tx num">{formatNumber(t.count)}</span>
          <span className="fs12 mu">{t.sub}</span>
        </button>
      ))}
    </div>
  );
}

/** The live fleet on a drawn map: one pin per truck, coloured by status, filterable and searchable. */
function LiveMap({ cities, openTruck }: { cities: Ops["cities"]; openTruck: (v: Vehicle) => void }) {
  const { set } = useConsole();
  const live = useLive();
  const [filter, setFilter] = useState<PinStatus | "all">("all");
  const [q, setQ] = useState("");
  const all = useMemo(() => (live.data?.vehicles ?? []).filter((v) => v.position), [live.data]);
  const W = 720;
  const H = 360;
  const proj = useMemo(() => project(all.map((v) => ({ id: v.vehicle_id, lat: v.position!.lat, lon: v.position!.lon })), W, H), [all]);
  const at = new Map(proj.pins.map((p) => [p.id, p]));
  const counts = Object.fromEntries((Object.keys(PIN) as PinStatus[]).map((k) => [k, all.filter((v) => pinStatus(v) === k).length])) as Record<PinStatus, number>;
  const shown = all.filter((v) => (filter === "all" || pinStatus(v) === filter) && matchesTruck(v, q));
  const b = proj.bounds;
  const visibleCities = cities.filter((c) => c.lat >= b.minLat && c.lat <= b.maxLat && c.lon >= b.minLon && c.lon <= b.maxLon).slice(0, 14);
  return (
    <section className="card oh" aria-labelledby="dx-map-h">
      <div className="ch" style={{ flexWrap: "wrap", rowGap: "8px" }}>
        <h2 className="h2 f1" id="dx-map-h">Live fleet</h2>
        <label className="search" style={{ width: "220px" }}><Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" /><input aria-label="Find a truck by unit, driver, load or route" placeholder="Truck, driver, load or route" value={q} onChange={(e) => setQ(e.currentTarget.value)} /></label>
        <button type="button" className="lnk" onClick={() => set(goTo("tracking"))}>Open live fleet</button>
      </div>
      <div className="r g6 wrap" style={{ padding: "0 16px 8px" }} role="group" aria-label="Show trucks by status">
        <button type="button" className="btn xs" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>{`All ${all.length}`}</button>
        {(Object.keys(PIN) as PinStatus[]).map((k) => (
          <button key={k} type="button" className="btn xs" aria-pressed={filter === k} onClick={() => setFilter(filter === k ? "all" : k)}><span className="dot" data-k={PIN[k].k}></span>{`${PIN[k].label} ${counts[k]}`}</button>
        ))}
      </div>
      <div className="dx-map">
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="dx-mapbg" preserveAspectRatio="xMidYMid meet">
          {HIGHWAYS.map((h) => <path key={h.name} d={h.path.map(([la, lo], i) => { const [x, y] = proj.toXY(la, lo); return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(" ")} className="hw" />)}
          {visibleCities.map((c) => { const [x, y] = proj.toXY(c.lat, c.lon); return <g key={`${c.name}-${c.state}`}><circle cx={x} cy={y} r="2.5" className="city" /><text x={x + 5} y={y - 4} className="cityl">{c.name}</text></g>; })}
        </svg>
        {shown.map((v) => {
          const p = at.get(v.vehicle_id)!;
          const st = pinStatus(v);
          return (
            <button key={v.vehicle_id} type="button" className={clsx("dx-pin", st === "late" && "late")} data-k={PIN[st].k} style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }} onClick={() => openTruck(v)}
              aria-label={`Truck ${v.unit_number}${v.driver?.name ? `, ${v.driver.name}` : ""}, ${PIN[st].label}${v.load ? `, ${v.load.lane}` : ""}`}></button>
          );
        })}
      </div>
      <p className="fs12 mu" style={{ padding: "8px 16px 12px" }} aria-live="polite">
        {live.isPending ? "Finding trucks…" : !all.length ? "No truck has sent a position yet. Positions come from telematics or the driver app." : !shown.length ? "No truck matches the search and filter." : `Showing ${shown.length} of ${all.length} trucks`}
      </p>
    </section>
  );
}

/** A truck's drawer: speed, ETA, load, driver, its last seven hours of speed, and where to go next. */
export function useTruckDrawer() {
  const { me, set, can } = useConsole();
  const [truck, setTruck] = useState<Vehicle | null>(null);
  const message = useOpenConversation();
  const zone = me.organization.timezone;
  const speed = useQuery({ queryKey: [me.organization.id, "dx", "truck", truck?.vehicle_id], queryFn: () => unwrap(api.GET("/api/v1/dashboard/trucks/{vehicle_id}", { params: { path: { vehicle_id: truck!.vehicle_id } } })), enabled: !!truck });
  const close = () => setTruck(null);
  const spec: DrawerSpec | null = truck ? {
    tag: { label: PIN[pinStatus(truck)].label, k: PIN[pinStatus(truck)].k },
    title: `Truck ${truck.unit_number}`,
    sub: truck.line,
    stats: [
      { label: "Speed", value: truck.position?.speed_mph !== null && truck.position?.speed_mph !== undefined ? `${Math.round(truck.position.speed_mph)} mph` : "—" },
      { label: "ETA", value: truck.load?.eta ? toLocalInput(truck.load.eta, zone).slice(11, 16) + (truck.load.late_by_minutes > 0 ? ` · ${hours(truck.load.late_by_minutes)} late` : "") : "—", tone: truck.load && truck.load.late_by_minutes > 0 ? "bad" : undefined },
      { label: "Load", value: truck.load?.load_number ?? "None" },
      { label: "Driver", value: truck.driver?.name ?? "Nobody" },
    ],
    bars: { label: "Average speed, last 7 hours (mph)", points: (speed.data?.hours ?? []).map((h) => ({ label: toLocalInput(h.hour, zone).slice(11, 13), value: h.avg_mph ?? null })) },
    rows: truck.load ? [{ label: truck.load.lane, value: truck.load.customer, sub: truck.load.next_stop ? `Next: ${truck.load.next_stop}` : undefined }] : [],
    rowsTitle: "Route",
    actions: [
      ...(truck.load ? [{ label: "Open load", primary: true, go: () => { close(); set({ screen: "load", loadId: truck.load!.id, drawer: null }); } }] : []),
      ...(can("tracking.read") ? [{ label: "Open live tracking", go: () => { close(); set({ ...goTo("tracking"), vehicle: truck.vehicle_id }); } }] : []),
      ...(truck.driver?.id && can("messages.send") ? [{ label: "Message driver", go: () => { close(); void message({ driverId: truck.driver!.id! }); } }] : []),
    ],
  } : null;
  return { open: setTruck, spec, close };
}

const SHADES = ["0", "1", "2", "3", "4"];

/** The Operations tab. */
export function OperationsTab({ openTruck }: { openTruck: (v: Vehicle) => void }) {
  const { me, can, set } = useConsole();
  const ops = useOps();
  const zone = me.organization.timezone;
  const o = ops.data;
  if (ops.isError) return <div className="banner" data-k="bad" role="alert" style={{ margin: "12px 24px" }}><div className="f1">Operations couldn’t be loaded. It will try again in a minute.</div></div>;
  if (!o) return <p className="fs13 mu" style={{ padding: "24px" }}>Loading operations…</p>;
  const busiest = Math.max(1, ...o.heatmap.flat());
  const totalPickups = o.heatmap.flat().reduce((n, v) => n + v, 0);
  const peak = o.heatmap.flatMap((row, d) => row.map((v, b) => ({ v, d, b }))).sort((a, c) => c.v - a.v)[0];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekTrend = o.on_time.weeks;
  return (
    <div className="c g16" style={{ padding: "16px 24px 24px" }}>
      <Tiles ops={o} />
      <div className="dx-2col">
        {can("tracking.read") ? <LiveMap cities={o.cities} openTruck={openTruck} /> : <section className="card cb"><DxEmpty text="Your role doesn’t include live tracking." /></section>}
        <section className="card oh" aria-labelledby="dx-act">
          <div className="ch"><h2 className="h2" id="dx-act">Activity today</h2><span className="sp"></span><span className="fs12 mu">{`${o.activity.length} events`}</span></div>
          {o.activity.length ? (
            <ol className="dx-feed">
              {o.activity.map((a, i) => (
                <li key={`${a.at}-${i}`}>
                  <span className="num fs12 t3">{toLocalInput(a.at, zone).slice(11, 16)}</span>
                  <span className="dot" data-k={a.tone}></span>
                  {a.load_id ? <button type="button" className="lnk fs13" style={{ justifySelf: "start", textAlign: "left" }} onClick={() => set({ screen: "load", loadId: a.load_id!, drawer: null })}>{a.text}</button> : <span className="fs13 t2">{a.text}</span>}
                </li>
              ))}
            </ol>
          ) : <div className="cb"><DxEmpty text="Nothing has happened yet today." /></div>}
        </section>
      </div>
      <div className="dx-3col">
        <section className="card" aria-label="On-time delivery">
          <DxHead title="On-time delivery" sub={`Last 5 weeks · ${formatNumber(o.on_time.deliveries)} deliveries`} report="on-time" />
          <div className="cb c g8" style={{ alignItems: "center" }}>
            <Gauge value={o.on_time.pct === null || o.on_time.pct === undefined ? null : Math.round(o.on_time.pct)} goal={o.on_time.target_pct} label="On-time delivery, last 5 weeks" />
            <div className="r g8" style={{ width: "100%" }}><span className="fs12 mu">Trend</span><Spark points={weekTrend.map((v) => v ?? null)} k="ok" /></div>
            <p className="sr-only">{`Weekly on-time: ${o.on_time.week_starts.map((w, i) => `week of ${shortDay(w)} ${weekTrend[i] === null ? "no deliveries" : `${weekTrend[i]}%`}`).join(", ")}.`}</p>
          </div>
        </section>
        <section className="card" aria-label="Pickup heatmap">
          <DxHead title="When pickups happen" sub={`Last ${o.heatmap_weeks} weeks · darker is busier`} report="dwell" />
          <div className="cb">
            <p className="sr-only">{totalPickups ? `${totalPickups} pickups. Busiest: ${days[peak!.d]} ${String(peak!.b * 2).padStart(2, "0")}:00 to ${String(peak!.b * 2 + 2).padStart(2, "0")}:00 with ${peak!.v}.` : "No pickups in this period."}</p>
            <div className="dx-heat" aria-hidden="true">
              <span></span>{Array.from({ length: 12 }, (_, b) => <span key={b} className="fs11 mu">{b % 3 === 0 ? String(b * 2).padStart(2, "0") : ""}</span>)}
              {o.heatmap.map((row, d) => [<span key={`l${d}`} className="fs11 mu">{days[d]}</span>, ...row.map((v, b) => <i key={`${d}-${b}`} data-s={SHADES[v ? Math.min(4, Math.ceil((v / busiest) * 4)) : 0]} title={`${days[d]} ${b * 2}:00 · ${v}`}></i>)])}
            </div>
          </div>
        </section>
        <section className="card" aria-label="Longest dwell">
          <DxHead title="Longest dwell" sub={`By facility, last ${o.dwell_days} days`} report="dwell" />
          <div className="cb">
            {o.dwell.length ? <BarList label="Average time at each facility" items={o.dwell.map((x) => ({ key: x.facility, label: x.facility, sub: `${x.visits} visits`, value: x.avg_minutes }))} format={(n) => hours(Math.round(n))} tone={(n) => (n >= 120 ? "bad" : n >= 90 ? "warn" : "brand")} /> : <DxEmpty text="No stops reached in the last 30 days." />}
          </div>
        </section>
      </div>
    </div>
  );
}
