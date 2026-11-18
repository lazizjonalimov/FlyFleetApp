"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Fragment, useEffect, useState } from "react";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { loadLabel, loadTone } from "@/features/fleet/labels";
import type { LoadListItem } from "@/features/loads/load-data";
import { equipmentLabel, riskOf } from "@/features/loads/load-view";
import { api, unwrap } from "@/lib/api/client";
import { formatDateTime, fromLocalInput, timeZoneLabel, todayIn, toLocalInput } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, initials, plural } from "@/lib/format/text";
import { useMinuteClock } from "@/lib/time/clock";
import { AssignPanel } from "./assign-panel";

const FIRST_HOUR = 6;
/** How the queue can be ordered; rate only for roles that see money. */
const SORTS: [key: string, label: string][] = [["pickup", "Pickup time"], ["delivery", "Delivery time"], ["miles", "Miles"], ["rate", "Rate"]];
const GRIP = "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01";
/** "2h 40m": how long until something, for a pickup coming up. */
const until = (hours: number) => (hours >= 1 ? `${Math.floor(hours)}h ${String(Math.round((hours % 1) * 60)).padStart(2, "0")}m` : `${Math.max(1, Math.round(hours * 60))}m`);
const HOURS = 16;

/** A calendar date some days from another: "2026-11-15" + 1 → "2026-11-16". */
const shift = (day: string, by: number) => new Date(Date.parse(`${day}T12:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);
/** Hours from the start of `day`, on the company's clock. */
const hoursInto = (iso: string, day: string, zone: string) => (Date.parse(iso) - Date.parse(fromLocalInput(`${day}T00:00`, zone) ?? `${day}T00:00:00Z`)) / 3_600_000;
const dayLabel = (day: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));
const longDay = (day: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));

/** Dispatch board: loads waiting for a driver, each driver's day, and the assignment panel. */
export function DispatchScreen() {
  const { me, can, fin, state, set } = useConsole();
  const [menu, setMenu] = useState<"sort" | "equipment" | "group" | null>(null);
  // Dragging a waiting load onto a driver: done with pointer events, so it works the same with a mouse, a pen or a
  // finger. Dropping opens the assignment with that driver chosen; nothing is saved until it is confirmed there.
  const [drag, setDrag] = useState<{ id: string; label: string; x0: number; y0: number; x: number; y: number; moving: boolean } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const dragging = drag?.moving ? drag.id : null;
  useEffect(() => {
    if (!drag) return;
    const rowAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-driver]") as HTMLElement | null)?.dataset.driver ?? null;
    const move = (event: PointerEvent) => {
      const moving = drag.moving || Math.hypot(event.clientX - drag.x0, event.clientY - drag.y0) > 6;
      setDrag({ ...drag, x: event.clientX, y: event.clientY, moving });
      if (moving) setOver(rowAt(event.clientX, event.clientY));
    };
    const up = (event: PointerEvent) => {
      const driver = drag.moving ? rowAt(event.clientX, event.clientY) : null;
      setDrag(null);
      setOver(null);
      if (driver) set({ screen: "dispatch", panel: "assign", assignLoad: drag.id, assignDriver: driver, drawer: null, overlay: "none", modal: "none" });
    };
    const cancel = () => { setDrag(null); setOver(null); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [drag, set]);
  const sortBy = typeof state.bsort === "string" ? state.bsort : "pickup";
  const equipment = Array.isArray(state.beq) ? (state.beq as string[]) : [];
  const group = typeof state.bgroup === "string" ? state.bgroup : "";
  const org = me.organization;
  const zone = org.timezone;
  const today = todayIn(zone);
  const day = typeof state.bday === "string" ? state.bday : today;
  // Now, to the minute, once the board is in the browser (the server draws it without a now-line).
  const clock = useMinuteClock();
  const now = clock ?? Date.parse(`${day}T12:00:00Z`);
  const q = typeof state.bq === "string" ? state.bq.trim().toLowerCase() : "";
  const panelLoad = state.panel === "assign" && typeof state.assignLoad === "string" ? state.assignLoad : null;

  const queue = useQuery({ queryKey: [org.id, "dispatch", "queue"], queryFn: () => unwrap(api.GET("/api/v1/dispatch/board", { params: { query: { view: "unassigned", sort: "pickup_at", limit: 100 } } })), refetchInterval: 30_000 });
  const active = useQuery({ queryKey: [org.id, "dispatch", "active"], queryFn: () => unwrap(api.GET("/api/v1/dispatch/board", { params: { query: { view: "active", sort: "pickup_at", limit: 100 } } })), refetchInterval: 30_000 });
  const drivers = useQuery({ queryKey: [org.id, "drivers", "board"], queryFn: () => unwrap(api.GET("/api/v1/drivers", { params: { query: { status: "active", sort: "name", limit: 100 } } })), enabled: can("drivers.read"), refetchInterval: 60_000 });
  const summary = useQuery({ queryKey: [org.id, "dispatch", "summary"], queryFn: () => unwrap(api.GET("/api/v1/dispatch/summary")), refetchInterval: 30_000 });
  const terminals = useQuery({ queryKey: [org.id, "terminals"], queryFn: () => unwrap(api.GET("/api/v1/terminals")), staleTime: 5 * 60_000 });
  const [assigned, delivered] = useQueries({
    queries: (["assigned", "delivered"] as const).map((status) => ({
      queryKey: [org.id, "loads", "count", status],
      queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { status: [status], limit: 1, count: true } } })),
      refetchInterval: 30_000,
    })),
  });

  const matches = (load: LoadListItem) => !q || [load.load_number, load.reference, load.customer.name, load.origin_city, load.destination_city, load.assignment?.driver.name].some((text) => text?.toLowerCase().includes(q));
  const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY);
  const order: Record<string, (a: LoadListItem, b: LoadListItem) => number> = {
    pickup: (a, b) => time(a.pickup_at) - time(b.pickup_at),
    delivery: (a, b) => time(a.delivery_at) - time(b.delivery_at),
    miles: (a, b) => (b.miles ?? 0) - (a.miles ?? 0),
    rate: (a, b) => Number(b.revenue ?? 0) - Number(a.revenue ?? 0),
  };
  const kinds = [...new Set([...(queue.data?.items ?? []), ...(active.data?.items ?? [])].map((load) => load.equipment_type))].sort();
  const waiting = (queue.data?.items ?? []).filter((load) => matches(load) && (!equipment.length || equipment.includes(load.equipment_type))).sort(order[sortBy] ?? order.pickup);
  const groups = (terminals.data?.items ?? []).map((t) => ({ id: t.id, name: t.name }));
  const groupName = groups.find((g) => g.id === group)?.name;
  const onBoard = active.data?.items ?? [];
  const assign = (load: { id: string }) => set({ screen: "dispatch", panel: "assign", assignLoad: load.id, assignDriver: null, drawer: null, overlay: "none", modal: "none" });
  // The load being assigned, previewed on the row of the driver chosen for it (the panel's best match until then).
  const eligible = useQuery({ queryKey: [org.id, "dispatch", "eligible", panelLoad], queryFn: () => unwrap(api.GET("/api/v1/dispatch/eligible-resources", { params: { query: { load_id: panelLoad! } } })), enabled: !!panelLoad });
  const candidates = eligible.data?.drivers ?? [];
  const previewDriver = typeof state.assignDriver === "string" ? state.assignDriver : (candidates.find((d) => d.eligible && !d.reasons.length) ?? candidates.find((d) => d.eligible))?.id ?? null;
  const previewLoad = panelLoad ? [...(queue.data?.items ?? []), ...onBoard].find((load) => load.id === panelLoad) ?? null : null;
  const updated = Math.max(queue.dataUpdatedAt, active.dataUpdatedAt);

  // where a load sits on the day: from pickup to delivery, cut to the hours shown
  const place = (load: LoadListItem) => {
    if (!load.pickup_at) return null;
    const start = hoursInto(load.pickup_at, day, zone);
    const end = load.delivery_at ? hoursInto(load.delivery_at, day, zone) : start + 2;
    const from = Math.max(start, FIRST_HOUR);
    const to = Math.min(end, FIRST_HOUR + HOURS);
    if (to <= from) return null;
    return { l: `${(((from - FIRST_HOUR) / HOURS) * 100).toFixed(3)}%`, w: `${(((to - from) / HOURS) * 100).toFixed(3)}%` };
  };
  const rows = (drivers.data?.items ?? []).filter((driver) => !group || driver.terminal_id === group).map((driver) => {
    const loads = onBoard.filter((load) => load.assignment?.driver.id === driver.id);
    const units = loads[0]?.assignment ? [loads[0].assignment.vehicle.name, loads[0].assignment.trailer?.name].filter(Boolean).join(" · ") : "";
    const blocks = loads.flatMap((load) => {
      const spot = place(load);
      const risk = riskOf(load);
      return spot ? [{ id: load.id, number: load.load_number, lane: `${load.origin_city ?? ""} → ${load.destination_city ?? ""}`, k: loadTone(load.status), cls: risk?.tone === "bad" ? "rk" : risk ? "rkl" : "", alert: risk?.tone === "bad", title: `${load.load_number} · ${loadLabel(load.status)}`, ...spot }] : [];
    });
    const busy = driver.current_load;
    const blocked = driver.compliance.issues.some((issue) => issue.severity === "blocking");
    const chip = blocked ? "Not dispatchable" : busy ? loadLabel(busy.status) : "Available";
    const ck = blocked ? "bad" : busy ? "mu" : "ok";
    const spot = previewLoad && driver.id === previewDriver && previewLoad.assignment?.driver.id !== driver.id ? place(previewLoad) : null;
    if (spot && previewLoad) blocks.push({ id: `preview-${previewLoad.id}`, number: previewLoad.load_number, lane: `Preview · ${previewLoad.origin_city ?? ""} → ${previewLoad.destination_city ?? ""}`, k: "", cls: "ghost", alert: false, title: `${previewLoad.load_number} would go to ${driver.full_name}`, ...spot });
    return { id: driver.id, n: driver.full_name, ini: initials(driver.full_name), units: units || (driver.employee_number ?? ""), chip, ck, pk: blocked ? "bad" : busy ? "brand" : "ok", blocks, empty: !blocks.length, sel: spot || over === driver.id ? "sel" : "" };
  }).filter((row) => !q || row.n.toLowerCase().includes(q) || row.blocks.some((block) => block.number.toLowerCase().includes(q)));
  const nowF = day === today && clock !== null ? (hoursInto(new Date(now).toISOString(), day, zone) - FIRST_HOUR) / HOURS : -1;
  const showNow = nowF >= 0 && nowF <= 1;
  const hours = Array.from({ length: HOURS }, (_, i) => (i % 2 === 0 ? `${String(FIRST_HOUR + i).padStart(2, "0")}:00` : ""));
  const sum: [string, number | undefined, string][] = [
    ["Unassigned", summary.data?.unassigned, "warn"],
    ["Assigned", assigned?.data?.page.total_count ?? undefined, "assigned"],
    ["In transit", summary.data?.in_transit, "transit"],
    ["At risk", summary.data?.at_risk, "bad"],
    ["Delivered", delivered?.data?.page.total_count ?? undefined, "ok"],
  ];
  const nowLabel = toLocalInput(new Date(now).toISOString(), zone).slice(11);

  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px" }}>
        <div className="f1">
          <div className="crumb">
            <span>Operations</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>Dispatch board</b>
          </div>
          <h1 className="h1">Dispatch board</h1>
          <p className="sub"><span>{[longDay(day), me.scope ? me.scope.team_name : "", me.scope ? plural(me.scope.trucks, "truck") : "", drivers.data ? `${plural(rows.length, "driver")} on this board` : "", !me.scope && queue.data ? `${plural(queue.data.items.length, "unassigned load")}` : "", `times in ${timeZoneLabel(zone)}`].filter(Boolean).join(" · ")}</span></p>
        </div>
        <div className="r g8">
          <button className="btn" onClick={() => set({ bday: today })} disabled={day === today}>
            <Icon className="s14" d="M12 2l10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5" />
            View: Today
          </button>
          <div className="r" style={{ border: "1px solid var(--bd3)", borderRadius: "6px", background: "var(--sf)", height: "32px", overflow: "hidden", boxShadow: "var(--sh1)" }}>
            <button className="btn ghost icon" style={{ height: "30px", borderRadius: "0" }} aria-label="Previous day" onClick={() => set({ bday: shift(day, -1) })}><Icon className="s14" d="M15 6l-6 6 6 6" /></button>
            <span className="fs13 w5" style={{ padding: "0 10px", borderLeft: "1px solid var(--bd)", borderRight: "1px solid var(--bd)", lineHeight: "30px" }}>{dayLabel(day)}</span>
            <button className="btn ghost icon" style={{ height: "30px", borderRadius: "0" }} aria-label="Next day" onClick={() => set({ bday: shift(day, 1) })}><Icon className="s14" d="M9 6l6 6-6 6" /></button>
          </div>
          <div className="seg" role="group" aria-label="Board layout">
            <button className="on">Timeline</button>
            <button onClick={() => set(goTo("loads"))}>Table</button>
            <button onClick={() => set(goTo("tracking"))}>Map</button>
          </div>
          {can("loads.create") ? (
            <button className="btn pri" onClick={() => set(goTo("newload"))}>
              <Icon className="s14 b" d="M12 5v14M5 12h14" />
              New load
            </button>
          ) : null}
        </div>
      </div>
      <div className="r g8" style={{ padding: "0 24px 12px", flex: "none" }}>
        <div className="sumbar">
          {sum.map(([label, n, k]) => (
            <button key={label} className="sumi" data-k={k}>
              <span className="dot"></span>
              <span>{label}</span>
              <span className="mono w6 tx"><span>{n === undefined ? "—" : formatNumber(n)}</span></span>
            </button>
          ))}
        </div>
        <span className="sp"></span>
        <label className="search" style={{ width: "176px" }}>
          <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
          <input placeholder="Find driver or load" aria-label="Find driver or load" value={typeof state.bq === "string" ? state.bq : ""} onChange={(event) => set({ bq: event.target.value })} />
        </label>
        <div className="dd">
          {equipment.length ? (
            <button className="chip" onClick={() => set({ beq: [] })} aria-label={`Equipment: ${equipment.map(equipmentLabel).join(", ")} · clear`}>
              {`Equipment: ${equipment.map(equipmentLabel).join(", ")}`}
              <Icon className="s12 b" d="M18 6L6 18M6 6l12 12" />
            </button>
          ) : (
            <button className="chip add" onClick={() => setMenu(menu === "equipment" ? null : "equipment")} aria-haspopup="menu" aria-expanded={menu === "equipment"}>
              <Icon className="s12 b" d="M12 5v14M5 12h14" />
              Equipment
            </button>
          )}
          {menu === "equipment" ? (
            <>
              <div className="ddcatch" onClick={() => setMenu(null)}></div>
              <div className="ddl" role="menu" aria-label="Equipment" style={{ width: "220px" }}>
                <div className="ddh">Loads needing</div>
                <div className="ddo">
                  {kinds.length ? kinds.map((kind) => (
                    <button key={kind} className={clsx("ddi", equipment.includes(kind) && "on")} role="menuitemcheckbox" aria-checked={equipment.includes(kind)} onClick={() => set({ beq: equipment.includes(kind) ? equipment.filter((k) => k !== kind) : [...equipment, kind] })}>
                      <Icon className="ddk" d="M5 12l5 5 9-10" />
                      {equipmentLabel(kind)}
                    </button>
                  )) : <div className="ddn">No loads on the board yet</div>}
                </div>
              </div>
            </>
          ) : null}
        </div>
        <div className="dd">
          {groupName ? (
            <button className="chip" onClick={() => set({ bgroup: "" })} aria-label={`Driver group: ${groupName} · clear`}>
              {`Driver group: ${groupName}`}
              <Icon className="s12 b" d="M18 6L6 18M6 6l12 12" />
            </button>
          ) : (
            <button className="chip add" onClick={() => setMenu(menu === "group" ? null : "group")} aria-haspopup="menu" aria-expanded={menu === "group"}>
              <Icon className="s12 b" d="M12 5v14M5 12h14" />
              Driver group
            </button>
          )}
          {menu === "group" ? (
            <>
              <div className="ddcatch" onClick={() => setMenu(null)}></div>
              <div className="ddl" role="menu" aria-label="Driver group" style={{ width: "240px" }}>
                <div className="ddh">Drivers by home terminal</div>
                <div className="ddo">
                  {groups.length ? groups.map((g) => (
                    <button key={g.id} className="ddi" role="menuitem" onClick={() => { setMenu(null); set({ bgroup: g.id }); }}>{g.name}</button>
                  )) : <div className="ddn">No terminals yet. Drivers are grouped by the home terminal set on each driver.</div>}
                </div>
              </div>
            </>
          ) : null}
        </div>
        <span className="fs12 mu nw r g6">
          <span className="dot" data-k={queue.isError || active.isError ? "bad" : "ok"}></span>
          {updated ? `Auto-refresh · ${toLocalInput(new Date(updated).toISOString(), zone).slice(11)}` : "Loading…"}
        </span>
      </div>
      <div className={clsx("dboard", panelLoad && "wp")}>
        {!panelLoad ? (
          <section className="card oh c" style={{ minHeight: "0" }}>
            <div className="ch" style={{ minHeight: "46px", padding: "0 14px" }}>
              <h2 className="h2">Unassigned</h2>
              <span className="cnt" data-k="warn"><span>{queue.data ? waiting.length : "…"}</span></span>
              <span className="sp"></span>
              <div className="dd">
                <button className="btn ghost xs" onClick={() => setMenu(menu === "sort" ? null : "sort")} aria-haspopup="menu" aria-expanded={menu === "sort"} aria-label={`Order by ${(SORTS.find(([k]) => k === sortBy) ?? SORTS[0]!)[1]}`}>
                  {(SORTS.find(([k]) => k === sortBy) ?? SORTS[0]!)[1]}
                  <Icon className="s12" d="M6 9l6 6 6-6" />
                </button>
                {menu === "sort" ? (
                  <>
                    <div className="ddcatch" onClick={() => setMenu(null)}></div>
                    <div className="ddl" role="menu" aria-label="Order the queue by" style={{ left: "auto", right: "0", width: "180px" }}>
                      <div className="ddo">
                        {SORTS.filter(([k]) => k !== "rate" || fin).map(([k, l]) => (
                          <button key={k} className={clsx("ddi", sortBy === k && "on")} role="menuitemradio" aria-checked={sortBy === k} onClick={() => { setMenu(null); set({ bsort: k }); }}>
                            <Icon className="ddk" d="M5 12l5 5 9-10" />
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            <div className="queue">
              {queue.isError ? <ErrorState error={queue.error} retry={() => void queue.refetch()} /> : null}
              {queue.data && !waiting.length ? <EmptyState icon="M5 12l5 5 9-10" title={q ? "No unassigned loads match" : "Every load has a driver"} text={q ? undefined : "Loads waiting for a driver show up here, the most urgent first."} /> : null}
              {waiting.map((load) => {
                const risk = riskOf(load);
                const hoursAway = load.pickup_at ? (Date.parse(load.pickup_at) - now) / 3_600_000 : null;
                // What makes it urgent: a risk first, then how soon it picks up; a draft says what it is missing.
                const urgency = risk ? { t: risk.label, k: risk.tone }
                  : load.status === "draft" ? { t: load.papers.rate_confirmation ? "Draft" : "Draft · no rate con", k: "mu" }
                  : hoursAway !== null && hoursAway > 0 && hoursAway < 24 ? { t: `Pickup in ${until(hoursAway)}`, k: hoursAway < 4 ? "warn" : "mu" }
                  : { t: "Planned", k: "mu" };
                const movable = can("dispatch.assign") && load.status === "planned";
                return (
                  <div key={load.id} className={clsx("qcard", risk && "hot", dragging === load.id && "sel")} style={dragging === load.id ? { opacity: 0.5 } : undefined}
                    onPointerDown={(event) => {
                      if (!movable || event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
                      event.preventDefault();
                      setDrag({ id: load.id, label: `${load.load_number} · ${load.origin_city ?? ""} → ${load.destination_city ?? ""}`, x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, moving: false });
                    }}>
                    <div className="r g8">
                      {movable ? <Icon className="s12 mu" d={GRIP} /> : null}
                      <span className="mono fs12 w5 t2"><span>{load.load_number}</span></span>
                      <span className="sp"></span>
                      <span className="tag" data-k={urgency.k}><span>{urgency.t}</span></span>
                    </div>
                    <div className="r g6 fs13 w5">
                      <span className="ell"><span>{[load.origin_city, load.origin_state].filter(Boolean).join(", ")}</span></span>
                      <Icon className="s12 mu" d="M5 12h14M13 6l6 6-6 6" />
                      <span className="ell"><span>{[load.destination_city, load.destination_state].filter(Boolean).join(", ")}</span></span>
                    </div>
                    <div className="fs12 mu num">{[load.pickup_at ? formatDateTime(load.pickup_at, zone) : "No pickup time", load.miles ? `${formatNumber(load.miles)} mi` : "", equipmentLabel(load.equipment_type)].filter(Boolean).join(" · ")}</div>
                    <div className="r jb fs12" style={{ marginTop: "3px", paddingTop: "7px", borderTop: "1px solid var(--bd2)" }}>
                      <span className="t3 ell"><span>{load.customer.name}</span></span>
                      {fin && load.revenue ? <span className="mono w5 tx"><span>{formatMoney(load.revenue, load.currency)}</span></span> : null}
                      {can("dispatch.assign") && load.status === "planned" ? <button className="btn xs" onClick={() => assign(load)}>Assign</button> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
        <section className="card oh c" style={{ minHeight: "0" }}>
          <div className="tlh">
            <div className="tlh0">Driver · equipment</div>
            <div className="tlhours">
              {hours.map((h, i) => (
                <span key={i}><span>{h}</span></span>
              ))}
              {showNow ? <span className="nowtag" style={{ left: `${(nowF * 100).toFixed(3)}%` }}>{nowLabel}</span> : null}
            </div>
          </div>
          <div className="tlbody">
            {drivers.isError ? <ErrorState error={drivers.error} retry={() => void drivers.refetch()} /> : null}
            {drivers.data && !rows.length ? <EmptyState icon="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" title={q ? "No drivers match" : "No active drivers yet"} text={q ? undefined : "Add drivers under Directory to plan their days here."} /> : null}
            {rows.map((d) => (
              <div key={d.id} className={clsx("tlrow", d.sel)} data-driver={d.id}>
                <div className="tld">
                  <span className="av" data-k={d.pk}>
                    <span>{d.ini}</span>
                    <span className="pres"></span>
                  </span>
                  <div className="f1">
                    <div className="fs13 w5 ell"><span>{d.n}</span></div>
                    <div className="mono fs11 mu"><span>{d.units}</span></div>
                  </div>
                  <span className="fs11 w5 tc nw" data-k={d.ck}><span>{d.chip}</span></span>
                </div>
                <div className="tltrack">
                  {d.blocks.map((b) => (
                    <Fragment key={b.id}>
                      {" "}
                      <button className={clsx("blk2", b.cls)} data-k={b.k} style={{ left: b.l, width: b.w, textAlign: "left" }} title={b.title} onClick={() => (b.id.startsWith("preview-") ? undefined : set({ screen: "loads", drawer: b.id, overlay: "none", modal: "none" }))}>
                        <div className="r g4">
                          <span className="mono fs11 w6 nw"><span>{b.number}</span></span>
                          {b.alert ? (
                            <Icon className="s12 b" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
                          ) : null}
                        </div>
                        <div className="fs11 ell"><span>{b.lane}</span></div>
                      </button>
                      {" "}
                    </Fragment>
                  ))}
                  {d.empty ? <div className="tlempty">{d.ck === "ok" ? (can("dispatch.assign") ? "Available all day · drag a load here or use Assign" : "Available all day") : "Nothing scheduled this day"}</div> : null}
                </div>
              </div>
            ))}
            {showNow ? <div className="nowline" style={{ left: `calc(208px + (100% - 208px) * ${nowF.toFixed(5)})` }}></div> : null}
          </div>
        </section>
        {panelLoad ? <AssignPanel key={panelLoad} loadId={panelLoad} close={() => set({ panel: "none", assignLoad: null, assignDriver: null })} /> : null}
        {drag?.moving ? (
          <div className="qcard" aria-hidden="true" style={{ position: "fixed", left: drag.x + 12, top: drag.y + 8, zIndex: 60, pointerEvents: "none", width: "240px", boxShadow: "var(--sh3)" }}>
            <span className="fs12 w5 ell">{drag.label}</span>
            <span className="fs11 mu">{over ? "Drop to choose this driver" : "Drop on a driver"}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
