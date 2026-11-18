"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useMemo, useState } from "react";
import { combo } from "@/components/forms/combo";
import { Combobox } from "@/components/forms/combobox";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import { useOpenConversation } from "@/features/messages/use-message";
import { useSecondClock } from "@/lib/time/clock";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { plural } from "@/lib/format/text";
import { boundsOf, FleetMap, type MapMarker } from "./fleet-map";

type Live = Awaited<ReturnType<typeof fetchLive>>;
type Vehicle = Live["vehicles"][number];
type Incident = Schema<"IncidentOut">;
type Filter = "all" | "moving" | "stopped" | "alerts" | "stale";
const FILTERS: [Filter, string, string][] = [["all", "All", "brand"], ["moving", "Moving", "brand"], ["stopped", "Stopped", "mu"], ["alerts", "Alerts", "bad"], ["stale", "Stale", "off"]];
const FRESH: Record<string, string> = { live: "ok", delayed: "warn", stale: "bad", none: "off" };
const SOURCE: Record<string, string> = { telematics: "Vehicle telematics", driver_app: "Driver app GPS", manual: "Entered by hand" };
const RANGES: [key: string, label: string][] = [["2h", "Last 2 hours"], ["today", "Today"], ["24h", "Last 24 hours"], ["yesterday", "Yesterday"]];
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const TRUCK = "M1 5h14v11H1zM15 9h4l3 3v4h-7zM5.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z";

const fetchLive = () => unwrap(api.GET("/api/v1/fleet/live"));
const age = (iso: string | null | undefined, now: number) => {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} m` : s < 172_800 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86_400)} d`;
};
const matches = (v: Vehicle, f: Filter) =>
  f === "all" || (f === "moving" && v.moving) || (f === "stopped" && !!v.position && !v.moving && (v.freshness === "live" || v.freshness === "delayed")) || (f === "alerts" && !!v.incident) || (f === "stale" && v.freshness === "stale");
const toneOf = (v: Vehicle) => (v.incident && v.incident.severity === "high" ? "bad" : v.freshness === "none" ? "off" : v.freshness === "stale" ? "off" : v.moving ? "brand" : "mu");

/** Live fleet: every truck on the map with how fresh its position is, its load and any alert; the selected truck's
 * speed, trail and alert, with who was told and what to do. */
export function TrackingScreen() {
  const { me, can, set, state, notify } = useConsole();
  const org = me.organization;
  const act = useAction();
  const message = useOpenConversation();
  // Now, to the second, once the screen is in the browser.
  const tick = useSecondClock();
  const now = tick ?? 0;
  const live = useQuery({ queryKey: [org.id, "fleet", "live"], queryFn: fetchLive, refetchInterval: 15_000 });
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"attention" | "unit" | "speed">("attention");
  const [layers, setLayers] = useState({ fences: true, trails: true, labels: false });
  const [range, setRange] = useState("2h");
  const [loadPick, setLoadPick] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [ddq, setDdq] = useState("");
  const selected = typeof state.vehicle === "string" ? state.vehicle : null;
  const select = (id: string | null) => set({ vehicle: id });
  const data: Live | undefined = live.data;
  const vehicles = data?.vehicles ?? [];
  const chosen = vehicles.find((v) => v.vehicle_id === selected) ?? null;
  const zone = useMemo(() => new Intl.DateTimeFormat("en-US", { timeZone: org.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "short" }), [org.timezone]);
  const hm = useMemo(() => new Intl.DateTimeFormat("en-US", { timeZone: org.timezone, hour: "2-digit", minute: "2-digit", hour12: false }), [org.timezone]);
  const hms = useMemo(() => new Intl.DateTimeFormat("en-US", { timeZone: org.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }), [org.timezone]);
  const parts = zone.formatToParts(new Date(now));
  const clock = tick === null ? "" : `${parts.filter((x) => ["hour", "minute", "second", "literal"].includes(x.type)).map((x) => x.value).join("").trim()} ${parts.find((x) => x.type === "timeZoneName")?.value ?? ""}`.replace(/,/g, "");

  // The trail for the selected truck over the chosen period.
  const span = useMemo(() => {
    const end = new Date();
    if (range === "today" || range === "yesterday") {
      const local = new Date(end.toLocaleString("en-US", { timeZone: org.timezone }));
      const offset = end.getTime() - local.getTime();
      const midnight = new Date(local.getFullYear(), local.getMonth(), local.getDate()).getTime() + offset;
      return range === "today" ? { since: new Date(midnight).toISOString(), until: end.toISOString() } : { since: new Date(midnight - 86_400_000).toISOString(), until: new Date(midnight).toISOString() };
    }
    return { since: new Date(end.getTime() - (range === "24h" ? 24 : 2) * 3_600_000).toISOString(), until: end.toISOString() };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the period is worked out when it is chosen or the truck changes
  }, [range, selected, org.timezone]);
  const track = useQuery({
    queryKey: [org.id, "fleet", "track", selected, range],
    queryFn: () => unwrap(api.GET("/api/v1/fleet/vehicles/{vehicle_id}/track", { params: { path: { vehicle_id: selected! }, query: span } })),
    enabled: !!selected,
    refetchInterval: range === "2h" ? 30_000 : false,
  });

  const shown = vehicles
    .filter((v) => matches(v, filter))
    .filter((v) => !loadPick || v.load?.id === loadPick)
    .filter((v) => !q.trim() || `${v.unit_number} ${v.driver?.name ?? ""} ${v.load?.load_number ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) =>
      sort === "unit" ? a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true })
      : sort === "speed" ? (b.position?.speed_mph ?? -1) - (a.position?.speed_mph ?? -1)
      : Number(!!b.incident) - Number(!!a.incident) || Number(b.moving) - Number(a.moving) || a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true }));
  const markers: MapMarker[] = shown.flatMap((v) =>
    v.position
      ? [{ id: v.vehicle_id, unit: v.unit_number, label: layers.labels && v.driver?.name ? `${v.unit_number} · ${v.driver.name.split(" ").slice(-1)[0]}` : v.unit_number, lat: v.position.lat, lon: v.position.lon, heading: v.moving ? v.position.heading ?? null : null, tone: toneOf(v), stale: v.freshness === "stale", aria: `${v.unit_number}${v.driver?.name ? `, ${v.driver.name}` : ""}: ${v.line}` }]
      : [],
  );
  const positioned = vehicles.filter((v) => v.position);
  const [focusKey, setFocusKey] = useState("none");
  if (data && focusKey === "none" && positioned.length) setFocusKey(`fit-${positioned.length}`);
  const focus = useMemo(() => ({ key: focusKey, bounds: boundsOf(positioned.map((v) => ({ lat: v.position!.lat, lon: v.position!.lon }))) }), [focusKey]); // eslint-disable-line react-hooks/exhaustive-deps -- refit only on purpose
  const trail = (track.data?.points ?? []).map((p): [number, number] => [p.lon, p.lat]);
  const plan: [number, number][] = chosen?.position && chosen.load?.next_stop_at && range === "2h" ? [[chosen.position.lon, chosen.position.lat], [chosen.load.next_stop_at[1], chosen.load.next_stop_at[0]]] : [];
  const sources = (data?.sources ?? []).map((s) => (s === "telematics" ? "vehicle telematics" : s === "driver_app" ? "the driver app" : "entered by hand"));
  const sub = data ? `${plural(data.counts.all, "truck")} · ${data.reporting} reporting · ${sources.length ? `positions from ${sources.join(" and ")}` : "no positions yet"}` : "";
  const ddState = { open, q: ddq, setOpen, setQ: setDdq };
  const statusField = combo(ddState, { k: "status", l: "Status", value: filter === "all" ? "" : filter, options: FILTERS.slice(1).map(([v, l]) => ({ v, l, ab: String(data?.counts[v] ?? "") })), onPick: (v) => setFilter(v as Filter), placeholder: "Status", head: "Show trucks that are" });
  const loadField = combo(ddState, { k: "load", l: "Load", value: loadPick, options: vehicles.filter((v) => v.load).map((v) => ({ v: v.load!.id, l: v.load!.load_number, ab: v.unit_number })), onPick: (v) => { setLoadPick(v); const truck = vehicles.find((x) => x.load?.id === v); if (truck) select(truck.vehicle_id); }, placeholder: "Load", head: "Loads on the road", search: true, qph: "Search loads" });
  const rangeField = combo(ddState, { k: "range", l: "Trip history", value: range, options: RANGES.map(([v, l]) => ({ v, l })), onPick: (v) => { if (!selected) notify("Choose a truck to see its trips"); setRange(v); }, placeholder: "Trip history", head: selected ? `Trail of ${chosen?.unit_number ?? "the truck"}` : "Choose a truck first" });

  return (
    <div className="col">
      <div className="mtop">
        <div className="c">
          <div className="r g10">
            <h1 className="h1" style={{ fontSize: "18px", lineHeight: "24px" }}>Live fleet</h1>
            {data?.reporting ? (
              <span className="badge" data-k="ok"><i></i><span>{`Live · ${clock}`}</span></span>
            ) : (
              <span className="badge" data-k="mu"><i></i>No live positions</span>
            )}
          </div>
          <span className="fs12 mu"><span>{sub}</span></span>
        </div>
        <span className="sp"></span>
        {filter !== "all" ? (
          <button className="chip on" onClick={() => setFilter("all")} aria-label={`Status: ${FILTERS.find((f) => f[0] === filter)?.[1]}. Remove the filter`}>
            {`Status: ${FILTERS.find((f) => f[0] === filter)?.[1]}`}
            <Icon className="s12 b" d="M18 6L6 18M6 6l12 12" />
          </button>
        ) : (
          <Combobox f={statusField} chip="Status" />
        )}
        {loadPick ? (
          <button className="chip on" onClick={() => setLoadPick("")} aria-label="Remove the load filter">
            {`Load: ${vehicles.find((v) => v.load?.id === loadPick)?.load?.load_number ?? ""}`}
            <Icon className="s12 b" d="M18 6L6 18M6 6l12 12" />
          </button>
        ) : (
          <Combobox f={loadField} chip="Load" />
        )}
        <div className="seg" role="group" aria-label="Map layers">
          {([["fences", "Geofences"], ["trails", "Trails"], ["labels", "Labels"]] as const).map(([k, l]) => (
            <button key={k} className={layers[k] ? "on" : ""} aria-pressed={layers[k]} onClick={() => setLayers((x) => ({ ...x, [k]: !x[k] }))}>
              {layers[k] ? <Icon className="s12 b" d="M5 12l5 5 9-10" /> : null}
              {l}
            </button>
          ))}
        </div>
        <Combobox f={rangeField} end button={{ label: range === "2h" ? "Trip history" : RANGES.find((r) => r[0] === range)?.[1] ?? "Trip history", icon: "M6 4l14 8-14 8z" }} />
      </div>
      <div className="mapw">
        <FleetMap markers={markers} fences={(data?.geofences ?? []).map((g) => ({ ...g, tone: g.kind === "yard" ? "ok" : g.kind === "shop" ? "warn" : "info" }))} trail={trail} plan={plan}
          selected={selected} onSelect={(id) => select(id === selected ? null : id)} focus={focus}
          padding={{ left: 332, right: chosen ? 380 : 16, top: 16, bottom: 56 }} showFences={layers.fences} showTrails={layers.trails} />
        {data && !positioned.length ? (
          <div className="card" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-30%,-50%)", width: "380px", padding: "18px", zIndex: 3 }}>
            <div className="c g8" style={{ alignItems: "center", textAlign: "center" }}>
              <span className="eqic"><Icon className="s16" d={I.pin} /></span>
              <h2 className="h2">No positions yet</h2>
              <p className="fs13 mu">Trucks show here once their telematics is connected, or drivers share their location from the driver app. Until then, dispatchers log check calls on each load.</p>
              {can("organization.manage") ? <button className="btn sm" onClick={() => set({ ...goTo("settings"), setpage: "integrations" })}>Connect telematics</button> : null}
            </div>
          </div>
        ) : null}
        <section className="mpl card" aria-label="Vehicles">
          <div className="r g8" style={{ padding: "12px 12px 8px" }}>
            <span className="h2">Vehicles</span>
            <span className="cnt" data-k="mu"><span>{vehicles.length}</span></span>
            <span className="sp"></span>
            <button className="btn ghost xs icon" aria-label={`Sorted by ${sort === "attention" ? "what needs attention" : sort}. Change the order`} title={sort === "attention" ? "Needs attention first" : sort === "unit" ? "By unit number" : "Fastest first"} onClick={() => setSort((s) => (s === "attention" ? "unit" : s === "unit" ? "speed" : "attention"))}>
              <Icon className="s14" d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
            </button>
          </div>
          <div style={{ padding: "0 12px 8px" }}>
            <label className="search" style={{ width: "100%" }}>
              <Icon className="s14" d={I.search} />
              <input placeholder="Unit, driver or load" aria-label="Search vehicles" value={q} onChange={(e) => setQ(e.currentTarget.value)} />
            </label>
          </div>
          <div className="r g4 wrap" style={{ padding: "0 12px 10px", borderBottom: "1px solid var(--bd2)" }}>
            {FILTERS.map(([key, label, k]) => (
              <button key={key} className={clsx("mf", filter === key && "on")} data-k={k} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                <span className="dot"></span>
                <span>{label}</span>
                <span className="mono"><span>{data ? data.counts[key] : ""}</span></span>
              </button>
            ))}
          </div>
          <div className="mlist">
            {data && !shown.length ? <div className="cb fs13 mu">{vehicles.length ? "No truck matches." : "No trucks yet."}</div> : null}
            {shown.map((v) => {
              const speed = v.position?.speed_mph;
              const alert = v.incident && (v.incident.kind === "speeding" || v.incident.kind === "yard_speed");
              return (
                <button key={v.vehicle_id} className={clsx("mrow", v.vehicle_id === selected && "on")} aria-pressed={v.vehicle_id === selected} onClick={() => select(v.vehicle_id === selected ? null : v.vehicle_id)}>
                  <span className="mstat" data-k={v.incident ? "bad" : v.moving ? "brand" : "mu"}><Icon className="s14" d={TRUCK} /></span>
                  <span className="f1 c mw0">
                    <span className="r g6">
                      <span className="mono fs13 w6 tx"><span>{v.unit_number}</span></span>
                      <span className="fs12 t3 ell"><span>{v.driver?.name ?? "No driver"}</span></span>
                    </span>
                    <span className="fs12 mu ell"><span>{v.line}</span></span>
                  </span>
                  <span className="c" style={{ alignItems: "flex-end" }}>
                    <span className="mono fs13 w6 tc" data-k={alert ? "bad" : ""}><span>{speed === null || speed === undefined || v.freshness === "stale" || v.freshness === "none" ? "–" : `${Math.round(speed)} mph`}</span></span>
                    <span className="r g4 fs11 mu nw">
                      <span className="dot" data-k={FRESH[v.freshness]} style={{ width: "6px", height: "6px" }}></span>
                      <span>{v.position ? age(v.position.recorded_at, now) : "never"}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        {chosen ? (
          <VehiclePanel v={chosen} incident={track.data?.incident ?? null} miles={track.data?.miles ?? null} points={track.data?.points ?? []} now={now} hm={hm} hms={hms} range={RANGES.find((r) => r[0] === range)?.[1] ?? ""}
            onClose={() => select(null)} onLoad={(id) => set({ screen: "loads", drawer: id, overlay: "none", modal: "none" })} onMessage={() => (chosen.driver?.id ? void message({ driverId: chosen.driver.id }) : notify("No driver is on this truck", true))}
            act={(action, note) => void act(() => unwrap(api.POST("/api/v1/incidents/{incident_id}/actions", { params: { path: { incident_id: track.data!.incident!.id } }, body: { action, version: track.data!.incident!.version, note: note ?? null } })), action === "acknowledge" ? "Acknowledged" : "Resolved")}
            canAct={can("incidents.manage")}
            fence={can("alert_policies.manage") && chosen.position && !chosen.moving ? (body) => void act(() => unwrap(api.POST("/api/v1/geofences", { body: { ...body, lat: chosen.position!.lat, lon: chosen.position!.lon } })), `Geofence “${body.name}” drawn`) : null} />
        ) : null}
        <div className="mleg">
          <span className="r g6"><span className="dot" data-k="ok"></span>{"Live < 2 min"}</span>
          <span className="r g6"><span className="dot" data-k="warn"></span>Delayed 2–15 min</span>
          <span className="r g6"><span className="dot" data-k="bad"></span>{"Stale > 15 min"}</span>
          <span className="r g6"><span className="dot" data-k="off"></span>No signal</span>
          <span className="mu">{"· Location shown to roles that can see live locations"}</span>
        </div>
      </div>
    </div>
  );
}

function VehiclePanel({ v, incident, miles, points, now, hm, hms, range, onClose, onLoad, onMessage, act, canAct, fence }: {
  v: Vehicle;
  incident: Incident | null;
  miles: number | null;
  points: Schema<"TrackPoint">[];
  now: number;
  hm: Intl.DateTimeFormat;
  hms: Intl.DateTimeFormat;
  range: string;
  onClose: () => void;
  onLoad: (id: string) => void;
  onMessage: () => void;
  act: (action: "acknowledge" | "resolve", note?: string) => void;
  canAct: boolean;
  /** Draw a geofence centred on where the truck is parked, when allowed. */
  fence: ((body: { name: string; kind: "customer" | "yard" | "shop" | "other"; radius_m: number }) => void) | null;
}) {
  const [resolving, setResolving] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [fenceName, setFenceName] = useState("");
  const [fenceKind, setFenceKind] = useState<"customer" | "yard" | "shop" | "other">("customer");
  const [fenceRadius, setFenceRadius] = useState("400");
  const [note, setNote] = useState("");
  const pos = v.position;
  const speeding = incident && (incident.kind === "speeding" || incident.kind === "yard_speed");
  const badge: [string, string] = v.incident ? [v.incident.label, v.incident.severity === "high" ? "bad" : "warn"] : v.freshness === "none" ? ["No signal", "off"] : v.freshness === "stale" ? ["Stale", "bad"] : v.moving ? ["Moving", "brand"] : ["Stopped", "mu"];
  const t = (iso: string | null | undefined) => (iso ? hm.format(new Date(iso)) : "");
  // The speed over the last half hour, against the policy's lines.
  const limit = Number(incident?.data?.limit ?? 0);
  const threshold = Number(incident?.data?.threshold ?? 0);
  const recent = points.filter((p) => p.mph !== null && new Date(p.at).getTime() >= now - 30 * 60_000);
  const chart = speeding && recent.length > 1 ? (() => {
    const t0 = new Date(recent[0]!.at).getTime();
    const t1 = Math.max(new Date(recent.at(-1)!.at).getTime(), t0 + 60_000);
    const lo = Math.min(threshold - 20, ...recent.map((p) => p.mph!)) - 2;
    const hi = Math.max(limit + 10, ...recent.map((p) => p.mph!)) + 2;
    const x = (ms: number) => ((ms - t0) / (t1 - t0)) * 312;
    const y = (mph: number) => 96 - ((mph - lo) / (hi - lo)) * 96;
    const start = incident!.data?.started_at ? new Date(String(incident!.data.started_at)).getTime() : new Date(incident!.detected_at).getTime();
    return {
      d: recent.map((p, i) => `${i ? "L" : "M"}${x(new Date(p.at).getTime()).toFixed(1)},${y(p.mph!).toFixed(1)}`).join(""),
      zone: [Math.max(0, x(start)), Math.max(4, x(new Date(incident!.last_seen_at).getTime()) - Math.max(0, x(start)))],
      yLimit: y(limit), yThreshold: y(threshold), ticks: [t0, (t0 + t1) / 2, t1].map((ms) => hm.format(new Date(ms))),
    };
  })() : null;
  const late = v.load?.late_by_minutes ?? 0;
  const waiting = incident && ["open", "notified", "watching"].includes(incident.state);
  const deg = pos?.heading;
  return (
    <section className="mpr card" aria-label={`Truck ${v.unit_number}`}>
      <div className="r g8" style={{ padding: "14px 16px 0" }}>
        <span className="mono" style={{ fontSize: "18px", fontWeight: "600" }}>{v.unit_number}</span>
        <span className="badge" data-k={badge[1]}><i></i><span>{badge[0]}</span></span>
        <span className="sp"></span>
        <button className="btn ghost icon sm" aria-label="Close vehicle panel" onClick={onClose}><Icon d="M18 6L6 18M6 6l12 12" /></button>
      </div>
      <div className="fs13 t3" style={{ padding: "2px 16px 0" }}>
        {v.driver?.name ?? "No driver"}
        {v.load ? (
          <>
            {" · "}
            <button className="lnk" style={{ fontSize: "13px" }} onClick={() => onLoad(v.load!.id)}>{v.load.load_number}</button>
            {` ${v.load.lane}`}
          </>
        ) : null}
      </div>
      <div className="mstats">
        <div>
          <div className="fs12 mu">Speed</div>
          <div className="kv2 tc" data-k={speeding ? "bad" : ""} style={{ fontSize: "24px", lineHeight: "30px" }}>
            {pos?.speed_mph === null || pos?.speed_mph === undefined ? "–" : Math.round(pos.speed_mph)}
            <small>mph</small>
          </div>
        </div>
        <div>
          <div className="fs12 mu">Heading</div>
          <div className="fs15 w6">{deg === null || deg === undefined ? "–" : `${deg}° ${COMPASS[Math.round(deg / 45) % 8]}`}</div>
        </div>
        <div>
          <div className="fs12 mu">Updated</div>
          <div className="fs15 w6 num">{pos ? `${age(pos.recorded_at, now)} ago` : "Never"}</div>
        </div>
      </div>
      <div className="c g2" style={{ padding: "0 16px 12px" }}>
        <span className="fs13 w5">{v.place ?? "No position received yet"}</span>
        {pos ? (
          <span className="fs12 mu">{`${SOURCE[pos.source] ?? pos.source}${pos.accuracy_m !== null && pos.accuracy_m !== undefined ? ` · ±${pos.accuracy_m} m` : ""} · event ${hms.format(new Date(pos.recorded_at))}, received ${hms.format(new Date(pos.received_at))}`}</span>
        ) : null}
        {miles !== null && points.length > 1 ? <span className="fs12 mu">{`${range} · ${miles.toLocaleString("en-US")} mi on the trail`}</span> : null}
      </div>
      {incident ? (
        <div className="incident">
          <div className="r g8">
            <span className="h3">{`${incident.label} incident`}</span>
            <span className="mono fs12 mu">{incident.number}</span>
            <span className="sp"></span>
            <span className="tag" data-k={incident.state === "acknowledged" ? "ok" : incident.state === "watching" ? "info" : "warn"}>
              {incident.state === "acknowledged" ? "Acknowledged" : incident.state === "watching" ? "Watching" : "Not acknowledged"}
            </span>
          </div>
          {!speeding ? <div className="fs13"><b>{incident.title}</b>{incident.detail ? ` · ${incident.detail}` : ""}</div> : null}
          {chart ? (
            <div className="spark">
              <svg viewBox="0 0 312 96" preserveAspectRatio="none" aria-label={`Speed over the last half hour; ${incident.title.toLowerCase()}`} role="img">
                <rect className="spz" x={chart.zone[0]} y="0" width={chart.zone[1]} height="96" />
                <line className="spt" x1="0" x2="312" y1={chart.yThreshold} y2={chart.yThreshold} />
                <line className="spt2" x1="0" x2="312" y1={chart.yLimit} y2={chart.yLimit} />
                <path className="spl2" d={chart.d} />
              </svg>
              <span className="spk" style={{ top: `${Math.max(0, chart.yThreshold - 7)}px` }}>{`${threshold} limit set by company`}</span>
              <span className="spk" style={{ top: `${Math.max(0, chart.yLimit - 20)}px`, color: "#B42318" }}>{`${limit} with tolerance`}</span>
              <div className="r jb fs11 mu mono" style={{ marginTop: "4px" }}>
                {chart.ticks.map((x, i) => <span key={i}>{x}</span>)}
              </div>
            </div>
          ) : null}
          <ol className="itl">
            {incident.events.map((e, i) => (
              <li key={i}>
                <span className="dot" data-k={e.tone === "mu" ? "off" : e.tone}></span>
                <span className={clsx("f1", e.tone === "mu" && "mu")}>{e.text}</span>
                <span className="mono mu">{t(e.at)}</span>
              </li>
            ))}
            {incident.pending ? (
              <li>
                <span className="dot" data-k="off"></span>
                <span className="f1 mu">{incident.pending.text}</span>
                <span className="mono mu">{t(incident.pending.at)}</span>
              </li>
            ) : null}
          </ol>
          {canAct ? (
            resolving ? (
              <div className="c g6">
                <input className="inp" style={{ height: "30px" }} placeholder="What was done (optional)" aria-label="What was done" value={note} onChange={(e) => setNote(e.currentTarget.value)} autoFocus />
                <div className="r g8">
                  <button className="btn pri sm" onClick={() => { act("resolve", note.trim() || undefined); setResolving(false); setNote(""); }}>Resolve</button>
                  <button className="btn sm ghost" onClick={() => setResolving(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="r g8">
                {waiting ? <button className="btn pri sm" onClick={() => act("acknowledge")}>Acknowledge</button> : null}
                <button className="btn sm" onClick={onMessage}>
                  <Icon className="s14" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  Message
                </button>
                <button className="btn sm ghost" onClick={() => setResolving(true)}>Resolve…</button>
              </div>
            )
          ) : null}
        </div>
      ) : null}
      {speeding && incident?.policy ? (
        <p className="note" style={{ padding: "10px 16px 0" }}>
          <Icon className="s14" d={I.info} />
          {`Measured against the company threshold in policy “${incident.policy.name} v${incident.policy.version}”, not the posted speed limit.`}
        </p>
      ) : null}
      {fence ? (
        drawing ? (
          <div className="c g8" style={{ margin: "12px 16px 0", padding: "12px", border: "1px solid var(--bd)", borderRadius: "10px" }}>
            <span className="fs13 w6">Draw a geofence here</span>
            <input className="inp" style={{ height: "30px" }} placeholder="Name, like the customer’s dock or your yard" aria-label="Geofence name" value={fenceName} onChange={(e) => setFenceName(e.currentTarget.value)} />
            <div className="r g8">
              <select className="inp" style={{ height: "30px" }} aria-label="Kind of place" value={fenceKind} onChange={(e) => setFenceKind(e.currentTarget.value as "yard")}>
                <option value="customer">Customer site</option>
                <option value="yard">Our yard</option>
                <option value="shop">Shop</option>
                <option value="other">Other</option>
              </select>
              <input className="inp mono" style={{ height: "30px", width: "96px" }} inputMode="numeric" aria-label="Radius in meters" value={fenceRadius} onChange={(e) => setFenceRadius(e.currentTarget.value)} />
              <span className="fs12 mu">m</span>
            </div>
            <div className="r g8">
              <button className="btn pri sm" disabled={!fenceName.trim() || !(Number(fenceRadius) >= 50 && Number(fenceRadius) <= 20000)} onClick={() => { fence({ name: fenceName.trim(), kind: fenceKind, radius_m: Math.round(Number(fenceRadius)) }); setDrawing(false); setFenceName(""); }}>Draw it</button>
              <button className="btn sm ghost" onClick={() => setDrawing(false)}>Cancel</button>
            </div>
            <span className="fs12 mu">Centred on where the truck is parked. Dwell and yard-speed rules use it.</span>
          </div>
        ) : (
          <div style={{ padding: "10px 16px 0" }}><button className="lnk fs12" onClick={() => setDrawing(true)}>Draw a geofence here</button></div>
        )
      ) : null}
      {v.load ? (
        <div className="r g8" style={{ padding: "12px 16px 16px" }}>
          <span className="risk" data-k={late > 0 ? "late" : "ok"}>
            <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2" />
            {v.load.eta ? `${v.load.load_number} ETA ${t(v.load.eta)}${late > 0 ? ` · +${late}m` : " · on time"}` : `${v.load.load_number} · ${v.load.next_stop ?? "no stop left"}`}
          </span>
          <span className="sp"></span>
          <button className="lnk" onClick={() => onLoad(v.load!.id)}>Open load</button>
        </div>
      ) : null}
    </section>
  );
}
