"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { loadLabel, loadTone } from "@/features/fleet/labels";
import type { LoadListItem } from "@/features/loads/load-data";
import { equipmentLabel, riskOf } from "@/features/loads/load-view";
import { usePreference } from "@/hooks/use-preference";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { formatDateTime, timeZoneLabel, todayIn, toLocalInput } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, initials, plural } from "@/lib/format/text";
import { useMinuteClock } from "@/lib/time/clock";
import { AssignPanel } from "./assign-panel";
import {
  alertsFor, boardKey, bucketOf, csv, dayLabel, dayOf, download, FIRST_HOUR, hm, hoursBooked, hoursInto, LAST_HOUR, monday, pct,
  planHtml, planText, shift, SPAN, span, STATUSES, utilization, width, type Status,
} from "./board-model";
import { BoardCalendar, BoardTable } from "./board-views";

type Seat = Schema<"DriverSeat">;
type Candidate = Schema<"Candidate">;
const GRIP = "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01";
const ALERT = "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01";
const SORTS: [string, string][] = [["pickup", "Pickup time"], ["urgency", "Urgency"], ["rate", "Highest rate"], ["miles", "Longest haul"]];
const ON_BOARD = ["planned", "assigned", "dispatched", "at_pickup", "in_transit", "at_delivery", "delivered", "pod_review", "completed", "on_hold"] as const;
const until = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m` : `${Math.max(1, minutes)}m`);

async function everyPage(query: Record<string, unknown>): Promise<LoadListItem[]> {
  const out: LoadListItem[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 6; i++) {
    const page = await unwrap(api.GET("/api/v1/dispatch/board", { params: { query: { ...query, limit: 100, cursor } as never } }));
    out.push(...(page.items as LoadListItem[]));
    if (!page.page.has_more || !page.page.next_cursor) break;
    cursor = page.page.next_cursor;
  }
  return out;
}

/** Pick the truck and trailer that go with a driver for a load, as the server would: their own seat first. */
export function kit(found: Schema<"EligibleResources">, driver: Candidate) {
  const trucks = found.vehicles.filter((v) => v.eligible);
  const truck = trucks.find((v) => v.id === driver.seat?.vehicle_id) ?? trucks[0];
  const trailer = found.needs_trailer ? found.trailers.find((t) => t.eligible) : undefined;
  return { truck, trailer, missing: !truck ? "No truck is free for it" : found.needs_trailer && !trailer ? "No suitable trailer is free for it" : null };
}

/** The dispatch board: loads waiting for a driver, each driver's day, a table and a calendar, and the assign panel. */
export function DispatchScreen() {
  const { me, can, fin, state, set, notify } = useConsole();
  const client = useQueryClient();
  const org = me.organization;
  const zone = org.timezone;
  const today = todayIn(zone);
  const day = typeof state.bday === "string" ? state.bday : today;
  const view = (state.bview === "table" || state.bview === "cal" ? state.bview : "tl") as "tl" | "table" | "cal";
  const cal = state.bcal === "month" ? "month" : "week";
  const st = (typeof state.bst === "string" ? state.bst : "all") as Status | "all";
  const qRaw = typeof state.bq === "string" ? state.bq : "";
  const q = qRaw.trim().toLowerCase();
  const equipment = Array.isArray(state.beq) ? (state.beq as string[]) : [];
  const grp = state.bgrp === "eq" || state.bgrp === "av" ? state.bgrp : "none";
  const sortBy = typeof state.bsort === "string" ? state.bsort : "pickup";
  const pick = typeof state.bpick === "string" ? state.bpick : null;
  const panelLoad = state.panel === "assign" && typeof state.assignLoad === "string" ? state.assignLoad : null;
  const [menu, setMenu] = useState<"export" | "equipment" | null>(null);
  const [live, setLive] = useState(true);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<{ id: string; label: string; x0: number; y0: number; x: number; y: number; moving: boolean } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const clock = useMinuteClock();
  const now = clock ?? Date.parse(`${day}T12:00:00Z`);
  const isToday = day === today;
  const refresh = live ? 30_000 : false;
  const [dismissed, setDismissed] = usePreference<{ day: string; ids: string[] }>("dispatch.dismissed", { day: today, ids: [] });
  const gone = dismissed.day === today ? dismissed.ids : [];

  // ---------------------------------------------------------------- data
  const range = view === "cal" ? (cal === "week" ? [monday(day), shift(monday(day), 6)] : [shift(`${day.slice(0, 8)}01`, -7), shift(`${day.slice(0, 8)}01`, 41)]) : [shift(day, -2), shift(day, 1)];
  const loadsQ = useQuery({ queryKey: [org.id, "dispatch", "loads", range[0], range[1]], queryFn: () => everyPage({ status: ON_BOARD, pickup_from: range[0], pickup_to: range[1], sort: "pickup_at" }), refetchInterval: refresh });
  const queueQ = useQuery({ queryKey: [org.id, "dispatch", "queue"], queryFn: () => everyPage({ view: "unassigned", sort: "pickup_at" }), refetchInterval: refresh });
  const driversQ = useQuery({ queryKey: [org.id, "drivers", "board"], queryFn: () => unwrap(api.GET("/api/v1/drivers", { params: { query: { status: "active", sort: "name", limit: 100 } } })), enabled: can("drivers.read"), refetchInterval: refresh ? 60_000 : false });
  const seatsQ = useQuery({ queryKey: [org.id, "dispatch", "seats"], queryFn: () => unwrap(api.GET("/api/v1/dispatch/seats")), refetchInterval: refresh ? 60_000 : false });
  const pickQ = useQuery({ queryKey: [org.id, "dispatch", "eligible", pick], queryFn: () => unwrap(api.GET("/api/v1/dispatch/eligible-resources", { params: { query: { load_id: pick! } } })), enabled: !!pick });
  const panelQ = useQuery({ queryKey: [org.id, "dispatch", "eligible", panelLoad], queryFn: () => unwrap(api.GET("/api/v1/dispatch/eligible-resources", { params: { query: { load_id: panelLoad! } } })), enabled: !!panelLoad });
  const updated = Math.max(loadsQ.dataUpdatedAt, queueQ.dataUpdatedAt);
  const seats = useMemo(() => new Map((seatsQ.data ?? []).map((s: Seat) => [s.driver_id, s])), [seatsQ.data]);
  const invalidate = () => client.invalidateQueries({ queryKey: [org.id] });

  const matches = (l: LoadListItem) => (!q || [l.load_number, l.reference, l.customer.name, l.origin_city, l.destination_city, l.assignment?.driver.name].some((t) => t?.toLowerCase().includes(q))) && (!equipment.length || equipment.includes(l.equipment_type));
  const statusOk = (l: LoadListItem) => st === "all" || bucketOf(l).includes(st);
  const allLoads = loadsQ.data ?? [];
  const onDay = (l: LoadListItem) => !!span(l, day, zone) || (!!l.pickup_at && dayOf(l.pickup_at, zone) === day);
  const dayLoads = allLoads.filter(onDay);
  const assignedOnDay = dayLoads.filter((l) => l.assignment);
  const order: Record<string, (a: LoadListItem, b: LoadListItem) => number> = {
    pickup: (a, b) => (a.pickup_at ?? "~").localeCompare(b.pickup_at ?? "~"),
    urgency: (a, b) => b.risks.length - a.risks.length || (a.pickup_at ?? "~").localeCompare(b.pickup_at ?? "~"),
    rate: (a, b) => Number(b.revenue ?? 0) - Number(a.revenue ?? 0),
    miles: (a, b) => (b.miles ?? 0) - (a.miles ?? 0),
  };
  const queueAll = (queueQ.data ?? []).filter((l) => l.pickup_at && [day, shift(day, 1)].includes(dayOf(l.pickup_at, zone)));
  const waiting = queueAll.filter(matches).sort(order[sortBy] ?? order.pickup);
  const kinds = [...new Set([...(queueQ.data ?? []), ...allLoads].map((l) => l.equipment_type))].sort();
  const picked = pick ? (queueQ.data ?? []).find((l) => l.id === pick) ?? null : null;
  const pickFor = new Map((pickQ.data?.drivers ?? []).map((d) => [d.id, d]));
  const chosen = panelQ.data ? (typeof state.assignDriver === "string" ? state.assignDriver : (panelQ.data.drivers.find((d) => d.eligible && !d.reasons.length) ?? panelQ.data.drivers.find((d) => d.eligible))?.id) : null;
  const panelItem = panelLoad ? [...(queueQ.data ?? []), ...allLoads].find((l) => l.id === panelLoad) ?? null : null;
  const lane = (l: LoadListItem) => `${l.origin_city ?? "—"} → ${l.destination_city ?? "—"}`;
  const openLoad = (id: string) => set({ screen: "loads", drawer: id, overlay: "none", modal: "none" });

  // ---------------------------------------------------------------- assigning from the board
  async function assignTo(load: LoadListItem, driverId: string) {
    try {
      const found = await client.fetchQuery({ queryKey: [org.id, "dispatch", "eligible", load.id], queryFn: () => unwrap(api.GET("/api/v1/dispatch/eligible-resources", { params: { query: { load_id: load.id } } })) });
      const driver = found.drivers.find((d) => d.id === driverId);
      if (!driver) return notify("That driver isn’t on this board", true);
      if (!driver.eligible) return notify(`${driver.name} can’t take ${load.load_number} · ${driver.reasons[0]?.message ?? "Not available"}`, true);
      const { truck, trailer, missing } = kit(found, driver);
      if (missing || !truck) return notify(`${driver.name} can’t take ${load.load_number} · ${missing}`, true);
      const out = await unwrap(api.POST("/api/v1/dispatch/assignments", { body: { load_id: load.id, version: load.version, driver_id: driver.id, vehicle_id: truck.id, trailer_id: trailer?.id ?? null, dispatch: true, notify: true } }));
      set({ bpick: null });
      await invalidate();
      const shows = out.pickup_at && dayOf(out.pickup_at, zone) !== day ? ` · shows on ${dayLabel(dayOf(out.pickup_at, zone))}` : "";
      notify(`${out.load_number} assigned to ${driver.name}${shows} · driver notified`, false, { ms: 7000, action: { label: "Undo", run: () => void undo(out.assignment!.id, out.version, out.load_number) } });
    } catch (e) {
      notify(errorMessage(e), true);
      void invalidate();
    }
  }
  async function undo(assignmentId: string, version: number, number: string) {
    try {
      await unwrap(api.POST("/api/v1/dispatch/assignments/{assignment_id}/undo", { params: { path: { assignment_id: assignmentId } }, body: { version } }));
      await invalidate();
      notify(`${number} is back in the queue`);
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }

  // Dragging a waiting load onto a driver, with pointer events, so a mouse, a pen and a finger all work.
  useEffect(() => {
    if (!drag) return;
    const rowAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-driver]") as HTMLElement | null)?.dataset.driver ?? null;
    const move = (e: PointerEvent) => {
      const moving = drag.moving || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6;
      setDrag({ ...drag, x: e.clientX, y: e.clientY, moving });
      if (moving) setOver(rowAt(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => {
      const driver = drag.moving ? rowAt(e.clientX, e.clientY) : null;
      const load = (queueQ.data ?? []).find((l) => l.id === drag.id);
      setDrag(null);
      setOver(null);
      if (driver && load) void assignTo(load, driver);
    };
    const cancel = () => { setDrag(null); setOver(null); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); };
  });

  // ---------------------------------------------------------------- drivers' rows
  const nowH = isToday && clock !== null ? hoursInto(new Date(now).toISOString(), day, zone) : -1;
  const allRows = (driversQ.data?.items ?? []).filter((d) => !state.bgroup || d.terminal_id === state.bgroup).map((d) => {
    const theirs = assignedOnDay.filter((l) => l.assignment?.driver.id === d.id);
    const spans = theirs.map((l) => ({ l, s: span(l, day, zone) })).filter((x): x is { l: LoadListItem; s: { start: number; end: number } } => !!x.s);
    const { booked, left } = hoursBooked(spans.map((x) => x.s));
    const seat = seats.get(d.id);
    const busyNow = isToday && (spans.some((x) => x.s.start <= nowH && x.s.end > nowH) || !!seat?.moving);
    const blocked = d.compliance.issues.some((i) => i.severity === "blocking");
    const late = isToday && theirs.some((l) => l.late_by_minutes > 0 || l.risks.some((r) => r.code.startsWith("LATE")));
    const blocks = spans.filter((x) => statusOk(x.l)).map(({ l, s }) => {
      const risk = riskOf(l);
      return { id: l.id, number: l.load_number, lane: lane(l), k: loadTone(l.status), left: pct(s.start), w: width(s.start, s.end), cls: risk?.tone === "bad" ? "rk" : risk ? "rkl" : "", alert: risk?.tone === "bad", status: loadLabel(l.status), preview: false };
    });
    if (panelItem && chosen === d.id && panelItem.assignment?.driver.id !== d.id) {
      const s = span(panelItem, day, zone);
      if (s) blocks.push({ id: `preview-${panelItem.id}`, number: panelItem.load_number, lane: `Preview · ${lane(panelItem)}`, k: "", left: pct(s.start), w: width(s.start, s.end), cls: "ghost", alert: false, status: "Preview", preview: true });
    }
    const can_ = pick ? pickFor.get(d.id) : undefined;
    return {
      id: d.id, name: d.full_name, ini: initials(d.full_name), seat, booked, left, busyNow, blocked, late, blocks, any: spans.length > 0,
      units: [seat?.truck ?? theirs[0]?.assignment?.vehicle.name, seat?.trailer ?? theirs[0]?.assignment?.trailer?.name].filter(Boolean).join(" · "),
      loc: isToday && seat?.place ? `${seat.moving ? "In transit · near" : "Parked ·"} ${seat.place}` : "",
      eqKey: seat?.trailer_type ? equipmentLabel(seat.trailer_type) : "No trailer yet",
      here: can_ ? { ok: can_.eligible, why: can_.eligible ? "" : can_.reasons[0]?.message ?? "Not available", miles: can_.seat?.miles_to_pickup ?? null } : null,
      search: [d.full_name, ...theirs.map((l) => `${l.load_number} ${lane(l)} ${l.customer.name}`)].join(" ").toLowerCase(),
    };
  });
  let rows = allRows.filter((r) => !q || r.search.includes(q));
  if (st === "unassigned") rows = rows.filter((r) => !r.any);
  else if (st !== "all") rows = rows.filter((r) => r.blocks.some((b) => !b.preview));
  const groups: { key: string; rows: typeof rows }[] = grp === "none" ? [{ key: "", rows }] : [...new Set(rows.map((r) => (grp === "eq" ? r.eqKey : r.busyNow ? "Busy now" : "Free now")))].sort().map((key) => ({ key, rows: rows.filter((r) => (grp === "eq" ? r.eqKey : r.busyNow ? "Busy now" : "Free now") === key) }));

  // ---------------------------------------------------------------- figures for the header and chips
  const util = utilization(allRows.map((r) => r.booked));
  const runningLate = allRows.filter((r) => r.late).length;
  const counts: Record<Status, number> = { unassigned: queueAll.filter((l) => l.pickup_at && dayOf(l.pickup_at, zone) === day).length, assigned: 0, transit: 0, bad: 0, delivered: 0 };
  for (const l of dayLoads) for (const b of bucketOf(l)) if (b !== "unassigned") counts[b] += 1;
  const alerts = isToday ? alertsFor(queueAll.filter((l) => l.pickup_at && dayOf(l.pickup_at, zone) === today), assignedOnDay, now, zone, gone, (l) => l.assignment?.driver.name) : [];
  const filtered = !!q || equipment.length > 0 || st !== "all";
  const clear = () => set({ bq: "", beq: [], bst: "all" });
  const subtitle = [dayLabel(day) + (isToday ? " · today" : ""), driversQ.data ? `${plural(allRows.length, "driver")} on this board` : "", queueQ.data ? plural(counts.unassigned, "unassigned load") : "", `times in ${timeZoneLabel(zone)}`, driversQ.data ? `${util}% of driving hours booked` : "", runningLate ? `${runningLate} running late` : "", me.scope?.team_name ?? ""].filter(Boolean).join(" · ");

  // ---------------------------------------------------------------- export
  const planRows = allRows.map((r) => ({ driver: r.name, items: assignedOnDay.filter((l) => l.assignment?.driver.id === r.id).sort((a, b) => (a.pickup_at ?? "").localeCompare(b.pickup_at ?? "")).map((l) => `${l.pickup_at ? hm(l.pickup_at, zone) : "--:--"}–${l.delivery_at ? hm(l.delivery_at, zone) : "--:--"}  ${l.load_number}  ${lane(l)}`) }));
  const planWaiting = queueAll.filter((l) => l.pickup_at && dayOf(l.pickup_at, zone) === day).map((l) => `${hm(l.pickup_at!, zone)}  ${l.load_number}  ${lane(l)}  ${equipmentLabel(l.equipment_type)}`);
  const tableRows = [...dayLoads, ...queueAll.filter((l) => l.pickup_at && dayOf(l.pickup_at, zone) === day && !dayLoads.some((x) => x.id === l.id))];
  const exportCsv = () => {
    download(`flyfleet-loads-${day}.csv`, csv([["Load", "Lane", "Driver", "Window", "Status"], ...tableRows.map((l) => [l.load_number, lane(l), l.assignment?.driver.name ?? "Unassigned", `${l.pickup_at ? hm(l.pickup_at, zone) : ""}–${l.delivery_at ? hm(l.delivery_at, zone) : ""}`, l.assignment ? loadLabel(l.status) : "Unassigned"])]), "text/csv");
    setMenu(null);
    notify(`Loads exported as CSV · ${tableRows.length} rows`);
  };
  const exports = {
    plan: () => { download(`flyfleet-dispatch-${day}.html`, planHtml(org.name, dayLabel(day), timeZoneLabel(zone), planRows, planWaiting), "text/html"); setMenu(null); notify("Day plan downloaded · open it and print to save as PDF"); },
    csv: exportCsv,
    copy: () => { setMenu(null); void navigator.clipboard?.writeText(planText(dayLabel(day), timeZoneLabel(zone), planRows, planWaiting)).then(() => notify("Day plan copied to the clipboard"), () => notify("Couldn’t copy · try the download instead", true)); },
  };

  // ---------------------------------------------------------------- keyboard, on this board only
  const latest = useRef({ day, pick, menu, set });
  useEffect(() => { latest.current = { day, pick, menu, set }; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = boardKey(e);
      if (!k) return;
      const s = latest.current;
      if (k === "Escape") {
        if (s.pick || s.menu) { s.set({ bpick: null }); setMenu(null); }
        return;
      }
      e.preventDefault();
      if (k === "t") s.set({ bview: "tl" });
      else if (k === "b") s.set({ bview: "table" });
      else if (k === "c") s.set({ bview: "cal" });
      else if (k === "n") s.set({ bday: todayIn(zone), bpick: null });
      else if (k === "ArrowLeft") s.set({ bday: shift(s.day, -1), bpick: null });
      else if (k === "ArrowRight") s.set({ bday: shift(s.day, 1), bpick: null });
      else if (k === "/") document.getElementById("db-q")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zone]);

  const hours = Array.from({ length: SPAN }, (_, i) => (i % 2 === 0 ? `${String(FIRST_HOUR + i).padStart(2, "0")}:00` : ""));
  const nowF = nowH >= FIRST_HOUR && nowH <= LAST_HOUR ? (nowH - FIRST_HOUR) / SPAN : -1;
  const assign = (l: { id: string }) => set({ screen: "dispatch", panel: "assign", assignLoad: l.id, assignDriver: null, bpick: null, drawer: null, overlay: "none", modal: "none" });

  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px" }}>
        <div className="f1">
          <nav className="crumb" aria-label="Breadcrumb"><span>Operations</span><Icon className="s12" d="M9 6l6 6-6 6" /><b aria-current="page">Dispatch board</b></nav>
          <h1 className="h1">Dispatch board</h1>
          <p className="sub"><span>{subtitle}</span></p>
        </div>
        <div className="r g8 wrap" style={{ justifyContent: "flex-end" }}>
          <div className="r" style={{ border: "1px solid var(--bd3)", borderRadius: "6px", background: "var(--sf)", height: "32px", overflow: "hidden", boxShadow: "var(--sh1)" }}>
            <button type="button" className="btn ghost icon" style={{ height: "30px", borderRadius: "0" }} aria-label="Previous day" onClick={() => set({ bday: shift(day, -1), bpick: null })}><Icon className="s14" d="M15 6l-6 6 6 6" /></button>
            <span className="fs13 w5" style={{ padding: "0 10px", borderLeft: "1px solid var(--bd)", borderRight: "1px solid var(--bd)", lineHeight: "30px" }} aria-live="polite">{dayLabel(day)}</span>
            <button type="button" className="btn ghost icon" style={{ height: "30px", borderRadius: "0" }} aria-label="Next day" onClick={() => set({ bday: shift(day, 1), bpick: null })}><Icon className="s14" d="M9 6l6 6-6 6" /></button>
          </div>
          <button type="button" className="btn" onClick={() => set({ bday: today, bpick: null })}>Today</button>
          <div className="seg" role="group" aria-label="Board layout">
            {([["tl", "Timeline"], ["table", "Table"], ["cal", "Calendar"]] as const).map(([k, l]) => <button key={k} type="button" className={clsx(view === k && "on")} aria-pressed={view === k} onClick={() => set({ bview: k })}>{l}</button>)}
            <button type="button" onClick={() => set(goTo("tracking"))}>Map</button>
          </div>
          <div className="dd">
            <button type="button" className="btn" aria-haspopup="true" aria-expanded={menu === "export"} onClick={() => setMenu(menu === "export" ? null : "export")}>Export<Icon className="s12" d="M6 9l6 6 6-6" /></button>
            {menu === "export" ? (
              <>
                <div className="ddcatch" onClick={() => setMenu(null)}></div>
                <div className="ddl" role="group" aria-label="Export options" style={{ left: "auto", right: 0, width: "250px" }}>
                  <div className="ddo">
                    <button type="button" className="ddi" onClick={exports.plan}>Download day plan (print to PDF)</button>
                    <button type="button" className="ddi" onClick={exports.csv}>Download loads as CSV</button>
                    <button type="button" className="ddi" onClick={exports.copy}>Copy plan as text</button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
          {can("loads.create") ? <button type="button" className="btn pri" onClick={() => set(goTo("newload"))}><Icon className="s14 b" d="M12 5v14M5 12h14" />New load</button> : null}
        </div>
      </div>

      <div className="r g8 wrap" style={{ padding: "0 24px 12px", flex: "none" }}>
        <div className="sumbar" role="group" aria-label="Show loads by status">
          {STATUSES.map((s) => (
            <button key={s.key} type="button" className={clsx("sumi", st === s.key && "on")} data-k={s.k} aria-pressed={st === s.key} onClick={() => set({ bst: st === s.key ? "all" : s.key })}>
              <span className="dot"></span><span>{s.label}</span><span className="mono w6 tx">{loadsQ.data ? formatNumber(counts[s.key]) : "—"}</span>
            </button>
          ))}
        </div>
        <span className="sp"></span>
        <label className="search" style={{ width: "200px" }}>
          <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
          <input id="db-q" placeholder="Find driver or load" aria-label="Find driver or load" value={qRaw} onChange={(e) => set({ bq: e.target.value })} />
        </label>
        <div className="dd">
          <button type="button" className="btn sm" aria-haspopup="true" aria-expanded={menu === "equipment"} onClick={() => setMenu(menu === "equipment" ? null : "equipment")}>
            {`Equipment: ${!equipment.length ? "All types" : equipment.length === 1 ? equipmentLabel(equipment[0]!) : `${equipment.length} types`}`}<Icon className="s12" d="M6 9l6 6 6-6" />
          </button>
          {menu === "equipment" ? (
            <>
              <div className="ddcatch" onClick={() => setMenu(null)}></div>
              <div className="ddl" role="group" aria-label="Equipment types" style={{ width: "230px" }}>
                <div className="ddo">
                  {kinds.length ? kinds.map((k) => (
                    <button key={k} type="button" className={clsx("ddi", equipment.includes(k) && "on")} aria-pressed={equipment.includes(k)} onClick={() => set({ beq: equipment.includes(k) ? equipment.filter((x) => x !== k) : [...equipment, k] })}>
                      <Icon className="ddk" d="M5 12l5 5 9-10" />{equipmentLabel(k)}
                    </button>
                  )) : <div className="ddn">No loads on the board yet</div>}
                  <button type="button" className="ddi" onClick={() => set({ beq: [] })}><span className="fs12 mu">Clear selection</span></button>
                </div>
              </div>
            </>
          ) : null}
        </div>
        {view === "tl" ? (
          <>
            <span className="fs12 mu">Group by</span>
            <div className="seg sm" role="group" aria-label="Group drivers by">
              {([["none", "None"], ["eq", "Equipment"], ["av", "Availability"]] as const).map(([k, l]) => <button key={k} type="button" className={clsx(grp === k && "on")} aria-pressed={grp === k} onClick={() => set({ bgrp: k })}>{l}</button>)}
            </div>
          </>
        ) : null}
        {filtered ? <button type="button" className="btn ghost sm" onClick={clear}>Clear filters</button> : null}
        <button type="button" className="btn ghost sm" aria-pressed={live} onClick={() => setLive(!live)}>
          <span className="dot" data-k={!live ? "mu" : loadsQ.isError || queueQ.isError ? "bad" : "ok"}></span>
          {live ? `Auto-refresh · ${updated ? toLocalInput(new Date(updated).toISOString(), zone).slice(11, 16) : "…"}` : "Paused"}
        </button>
      </div>

      {alerts.length ? (
        <div className="c g6" style={{ padding: "0 24px 12px", flex: "none" }}>
          {alerts.map((a) => (
            <div key={a.id} className="banner" data-k={a.k} role="status">
              <Icon d={ALERT} />
              <div className="f1"><div className="bt">{a.title}</div><div>{a.detail}</div></div>
              <button type="button" className="btn sm" aria-label={`${a.button} ${a.title.split(" ")[0]}${a.button === "Place" ? " on a driver" : ""}`} onClick={() => (a.button === "Place" ? set({ bpick: a.loadId, bview: "tl", panel: "none" }) : openLoad(a.loadId))}>{a.button}</button>
              <button type="button" className="btn ghost icon sm" aria-label={`Dismiss alert: ${a.title}`} onClick={() => setDismissed({ day: today, ids: [...gone, a.id] })}><Icon className="s12" d="M18 6L6 18M6 6l12 12" /></button>
            </div>
          ))}
        </div>
      ) : null}
      {picked ? (
        <div style={{ padding: "0 24px 12px", flex: "none" }}>
          <p className="note" style={{ width: "100%" }}><Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" /><span className="f1">{`Placing ${picked.load_number} · ${lane(picked)}. Choose a driver below.`}</span><button type="button" className="btn sm" onClick={() => set({ bpick: null })}>Cancel</button></p>
        </div>
      ) : null}

      <div className={clsx("dboard", panelLoad && "wp")}>
        {!panelLoad ? (
          <section className="card oh c" style={{ minHeight: 0 }} aria-label="Unassigned loads">
            <div className="ch" style={{ minHeight: "46px", padding: "0 14px" }}>
              <h2 className="h2">Unassigned</h2>
              <span className="cnt" data-k="warn"><span>{queueQ.data ? waiting.length : "…"}</span></span>
              <span className="sp"></span>
              <label className="sr-only" htmlFor="db-sort">Sort unassigned loads</label>
              <select id="db-sort" className="inp" style={{ width: "132px", height: "26px", fontSize: "12px" }} value={sortBy} onChange={(e) => set({ bsort: e.target.value })}>
                {SORTS.filter(([k]) => k !== "rate" || fin).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="queue">
              {queueQ.isError ? <ErrorState error={queueQ.error} retry={() => void queueQ.refetch()} /> : null}
              {queueQ.data && !waiting.length ? <p className="fs13 mu" style={{ padding: "16px", textAlign: "center" }}>Nothing unassigned for this day.</p> : null}
              {waiting.map((l) => {
                const risk = riskOf(l);
                const minutes = l.pickup_at ? Math.round((Date.parse(l.pickup_at) - now) / 60_000) : null;
                const urgency = risk ? { t: risk.label, k: risk.tone } : minutes !== null && minutes > 0 && minutes < 24 * 60 ? { t: `Pickup in ${until(minutes)}`, k: minutes < 240 ? "warn" : "mu" } : { t: dayOf(l.pickup_at!, zone) === day ? "Today" : "Tomorrow", k: "mu" };
                const movable = can("dispatch.assign") && l.status === "planned";
                const pk = pick === l.id;
                return (
                  <div key={l.id} className={clsx("qcard", (risk || pk) && "hot", drag?.moving && drag.id === l.id && "sel")}
                    onPointerDown={(e) => {
                      if (!movable || e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
                      e.preventDefault();
                      setDrag({ id: l.id, label: `${l.load_number} · ${lane(l)}`, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moving: false });
                    }}>
                    <div className="r g8">
                      {movable ? <Icon className="s12 mu" d={GRIP} /> : null}
                      <span className="mono fs12 w5 t2">{l.load_number}</span>
                      <span className="sp"></span>
                      <span className="tag" data-k={urgency.k}>{urgency.t}</span>
                      {movable ? <button type="button" className="btn xs" aria-pressed={pk} aria-label={pk ? `Stop placing ${l.load_number}` : `Place ${l.load_number} on a driver`} onClick={() => set({ bpick: pk ? null : l.id, bview: "tl" })}>{pk ? "Cancel" : "Place"}</button> : null}
                    </div>
                    <div className="r g6 fs13 w5"><span className="ell">{[l.origin_city, l.origin_state].filter(Boolean).join(", ")}</span><Icon className="s12 mu" d="M5 12h14M13 6l6 6-6 6" /><span className="ell">{[l.destination_city, l.destination_state].filter(Boolean).join(", ")}</span></div>
                    <div className="fs12 mu num">{[l.pickup_at ? formatDateTime(l.pickup_at, zone) : "No pickup time", l.miles ? `${formatNumber(l.miles)} mi` : "", equipmentLabel(l.equipment_type)].filter(Boolean).join(" · ")}</div>
                    <div className="r jb fs12" style={{ marginTop: "3px", paddingTop: "7px", borderTop: "1px solid var(--bd2)" }}>
                      <span className="t3 ell">{l.customer.name}</span>
                      {fin && l.revenue ? <span className="mono w5 tx">{formatMoney(l.revenue, l.currency)}</span> : null}
                      {movable ? <button type="button" className="btn xs" onClick={() => assign(l)} aria-label={`Assign ${l.load_number}`}>Assign</button> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {view === "tl" ? (
          <section className="card oh c" style={{ minHeight: 0 }} aria-label="Drivers’ day">
            <div className="tlh">
              <div className="tlh0">Driver · equipment</div>
              <div className="tlhours">
                {hours.map((h, i) => <span key={i}><span>{h}</span></span>)}
                {nowF >= 0 ? <span className="nowtag" style={{ left: `${(nowF * 100).toFixed(3)}%` }}>{toLocalInput(new Date(now).toISOString(), zone).slice(11, 16)}</span> : null}
              </div>
            </div>
            <div className="tlbody">
              {driversQ.isError ? <ErrorState error={driversQ.error} retry={() => void driversQ.refetch()} /> : null}
              {driversQ.data && !allRows.length ? <EmptyState icon="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" title="No active drivers yet" text="Add drivers under Directory to plan their days here." /> : null}
              {driversQ.data && allRows.length && !rows.length ? (
                <div className="c g8" style={{ alignItems: "center", padding: "36px 16px", textAlign: "center" }}><span className="fs14 w6">No drivers match</span><span className="fs12 mu">Try a different filter or clear the search.</span><button type="button" className="btn sm" onClick={clear}>Clear filters</button></div>
              ) : null}
              {groups.map((g) => {
                const shut = !!closed[g.key];
                return (
                  <div key={g.key || "all"}>
                    {g.key ? (
                      <button type="button" className="tlgrp" aria-expanded={!shut} onClick={() => setClosed({ ...closed, [g.key]: !shut })}>
                        <Icon className="s12" d="M6 9l6 6 6-6" style={shut ? { transform: "rotate(-90deg)" } : undefined} />
                        <span className="fs12 w6">{g.key}</span><span className="fs12 mu">{plural(g.rows.length, "driver")}</span>
                      </button>
                    ) : null}
                    {shut ? null : g.rows.map((d) => (
                      <div key={d.id} className={clsx("tlrow", (over === d.id || (chosen === d.id && panelLoad)) && "sel")} data-driver={d.id}>
                        <div className="tld">
                          <span className="av" data-k={d.blocked ? "bad" : d.any ? "brand" : "ok"}><span>{d.ini}</span><span className="pres"></span></span>
                          <div className="f1 mw0">
                            <div className="fs13 w5 ell">{d.name}</div>
                            {d.units ? <div className="mono fs11 mu ell">{d.units}</div> : null}
                            <div className="fs11 mu ell" title={d.loc || undefined}>{[`${d.left.toFixed(1)} h left`, d.loc, d.here?.miles !== null && d.here?.miles !== undefined ? `${formatNumber(d.here.miles)} mi to pickup` : ""].filter(Boolean).join(" · ")}</div>
                          </div>
                          {d.late ? <span className="tag" data-k="warn">Late</span> : null}
                          {d.here ? (d.here.ok
                            ? <button type="button" className="btn xs pri" onClick={() => picked && void assignTo(picked, d.id)} aria-label={`Assign ${picked?.load_number ?? "the load"} here, to ${d.name}`}>Assign here</button>
                            : <span className="fs11 mu" title={d.here.why}>Can’t<span className="sr-only">{`: ${d.here.why}`}</span></span>)
                            : !d.any ? <span className="fs11 w5 tc nw" data-k={d.blocked ? "bad" : "ok"}>{d.blocked ? "Not dispatchable" : "Available"}</span> : null}
                        </div>
                        <div className="tltrack">
                          {d.blocks.map((b) => (
                            <button key={b.id} type="button" className={clsx("blk2", b.cls)} data-k={b.k} style={{ left: b.left, width: b.w, textAlign: "left" }} title={`${b.number} · ${b.status}`} aria-label={`${b.number}, ${b.status}, ${b.lane}`} onClick={() => (b.preview ? undefined : openLoad(b.id))}>
                              <div className="r g4"><span className="mono fs11 w6 nw">{b.number}</span>{b.alert ? <Icon className="s12 b" d={ALERT} /> : null}</div>
                              <div className="fs11 ell">{b.lane}</div>
                            </button>
                          ))}
                          {!d.blocks.length && !pick ? <div className="tlempty">{d.blocked ? "Can’t be dispatched until their papers are in date" : "Available all day · use Place on a queued load, or Assign"}</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {nowF >= 0 ? <div className="nowline" style={{ left: `calc(208px + (100% - 208px) * ${nowF.toFixed(5)})` }}></div> : null}
            </div>
          </section>
        ) : view === "table" ? (
          <BoardTable day={day} loads={tableRows} zone={zone} onOpen={openLoad} onAssign={assign} onCsv={exportCsv} refresh={invalidate} />
        ) : (
          <BoardCalendar day={day} cal={cal} loads={[...allLoads, ...(queueQ.data ?? []).filter((l) => !allLoads.some((x) => x.id === l.id))].filter((l) => matches(l) && statusOk(l))} zone={zone} today={today} onOpen={openLoad} refresh={invalidate} />
        )}
        {panelLoad ? <AssignPanel key={panelLoad} loadId={panelLoad} close={() => set({ panel: "none", assignLoad: null, assignDriver: null })} onUndo={undo} /> : null}
        {drag?.moving ? (
          <div className="qcard" aria-hidden="true" style={{ position: "fixed", left: drag.x + 12, top: drag.y + 8, zIndex: 60, pointerEvents: "none", width: "240px", boxShadow: "var(--sh3)" }}>
            <span className="fs12 w5 ell">{drag.label}</span>
            <span className="fs11 mu">{over ? "Drop to assign to this driver" : "Drop on a driver"}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
