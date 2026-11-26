"use client";

import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { ConsolePortal } from "@/features/console/portal";
import { I } from "@/features/console/icons";
import { loadLabel, loadTone } from "@/features/fleet/labels";
import type { LoadListItem } from "@/features/loads/load-data";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { dayLabel, dayOf, daysBetween, hm, monday, shift } from "./board-model";

type Col = "lane" | "drv" | "win" | "st";
const COLS: [Col, string][] = [["lane", "Lane"], ["drv", "Driver"], ["win", "Window"], ["st", "Status"]];
const WIDTH: Record<"id" | Col, string> = { id: "110px", lane: "minmax(0,1.6fr)", drv: "minmax(0,1fr)", win: "130px", st: "130px" };
const s = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Row = { id: string; number: string; lane: string; drv: string; win: string; st: string; k: string; driverId: string | null; unassigned: boolean; version: number };
export function tableRow(l: LoadListItem, zone: string): Row {
  return {
    id: l.id, number: l.load_number, lane: `${l.origin_city ?? "—"} → ${l.destination_city ?? "—"}`,
    drv: l.assignment?.driver.name ?? "Unassigned", driverId: l.assignment?.driver.id ?? null, unassigned: !l.assignment,
    win: `${l.pickup_at ? hm(l.pickup_at, zone) : "--:--"}–${l.delivery_at ? hm(l.delivery_at, zone) : "--:--"}`,
    st: l.assignment ? loadLabel(l.status) : "Unassigned", k: l.assignment ? loadTone(l.status) : "warn", version: l.version,
  };
}

/** A message to several drivers at once: each gets it in their own conversation. */
function MessageDrivers({ drivers, onClose }: { drivers: { id: string; name: string }[]; onClose: () => void }) {
  const { notify } = useConsole();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const send = async () => {
    setPending(true);
    try {
      for (const d of drivers) {
        const conv = await unwrap(api.POST("/api/v1/conversations", { body: { kind: "driver", driver_id: d.id } }));
        await unwrap(api.POST("/api/v1/conversations/{conversation_id}/messages", { params: { path: { conversation_id: conv.id } }, body: { body: text.trim() } }));
      }
      notify(`Message sent to ${drivers.map((d) => d.name).join(", ")}`);
      onClose();
    } catch (e) {
      setProblem(errorMessage(e));
      setPending(false);
    }
  };
  return (
    <Dialog title={`Message ${s(drivers.length, "driver")}`} sub={drivers.map((d) => d.name).join(", ")} icon={I.info} width={460} onClose={onClose}
      footer={<><span className="sp"></span><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn pri" disabled={pending || !text.trim()} onClick={() => void send()}>{pending ? "Sending…" : "Send"}</button></>}>
      <Problem message={problem} />
      <div className="fld"><label htmlFor="db-msg">Message</label><textarea id="db-msg" className="inp" rows={4} style={{ height: "auto", padding: "8px 10px" }} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} autoFocus /></div>
    </Dialog>
  );
}

/** The day's loads as a table: columns to show, sorting, and best-match assignment or a message for a selection. */
export function BoardTable({ day, loads, zone, onOpen, onAssign, onCsv, refresh }: { day: string; loads: LoadListItem[]; zone: string; onOpen: (id: string) => void; onAssign: (l: { id: string }) => void; onCsv: () => void; refresh: () => Promise<unknown> }) {
  const { can, notify } = useConsole();
  const [hidden, setHidden] = useState<Col[]>([]);
  const [menu, setMenu] = useState(false);
  const [sort, setSort] = useState<{ k: "id" | Col | ""; dir: 1 | -1 }>({ k: "", dir: 1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [messaging, setMessaging] = useState(false);
  const shown = COLS.filter(([k]) => !hidden.includes(k));
  const cols = `34px ${WIDTH.id} ${shown.map(([k]) => WIDTH[k]).join(" ")} 100px`;
  const rows = loads.map((l) => tableRow(l, zone));
  if (sort.k) {
    const key = sort.k === "id" ? "number" : sort.k;
    rows.sort((a, b) => String(a[key]).localeCompare(String(b[key]), undefined, { numeric: true }) * sort.dir);
  }
  const chosen = rows.filter((r) => sel.has(r.id));
  const loose = chosen.filter((r) => r.unassigned);
  const drivers = [...new Map(chosen.filter((r) => r.driverId).map((r) => [r.driverId!, { id: r.driverId!, name: r.drv }])).values()];
  const toggle = (id: string) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const head = (k: "id" | Col, label: string) => (
    <span key={k}>
      <button type="button" className="lnk" style={{ font: "inherit", color: "inherit", textTransform: "inherit", letterSpacing: "inherit" }}
        aria-label={`Sort by ${label}${sort.k === k ? (sort.dir > 0 ? ", ascending" : ", descending") : ""}`} onClick={() => setSort({ k, dir: sort.k === k ? (-sort.dir as 1 | -1) : 1 })}>
        {label}{sort.k === k ? (sort.dir > 0 ? " ↑" : " ↓") : ""}
      </button>
    </span>
  );
  const best = async () => {
    try {
      const out = await unwrap(api.POST("/api/v1/dispatch/best-match", { body: { load_ids: loose.map((r) => r.id) } }));
      setSel(new Set());
      await refresh();
      const text = `${s(out.assigned.length, "load")} assigned to best-match drivers${out.failed.length ? ` · ${out.failed.length} had no eligible driver` : ""}`;
      notify(text, !out.assigned.length, out.assigned.length ? { ms: 7000, action: { label: "Undo", run: () => void Promise.all(out.assigned.map((a) => unwrap(api.POST("/api/v1/dispatch/assignments/{assignment_id}/undo", { params: { path: { assignment_id: a.assignment_id } }, body: { version: a.version } })))).then(refresh, (e) => notify(errorMessage(e), true)) } } : undefined);
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  return (
    <section className="card oh c" style={{ minHeight: 0 }} aria-label={`All loads on ${dayLabel(day)}`}>
      <div className="ch">
        <h2 className="h2">{`All loads on ${dayLabel(day)}`}</h2>
        <span className="sp"></span>
        <div className="dd">
          <button type="button" className="btn sm" aria-haspopup="true" aria-expanded={menu} onClick={() => setMenu(!menu)}>Columns<Icon className="s12" d="M6 9l6 6 6-6" /></button>
          {menu ? (
            <>
              <div className="ddcatch" onClick={() => setMenu(false)}></div>
              <div className="ddl" role="group" aria-label="Visible columns" style={{ left: "auto", right: 0, width: "180px" }}>
                <div className="ddo">
                  {COLS.map(([k, l]) => <button key={k} type="button" className={clsx("ddi", !hidden.includes(k) && "on")} aria-pressed={!hidden.includes(k)} onClick={() => setHidden(hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k])}><Icon className="ddk" d="M5 12l5 5 9-10" />{l}</button>)}
                </div>
              </div>
            </>
          ) : null}
        </div>
        <button type="button" className="btn sm" onClick={onCsv}>Export CSV</button>
      </div>
      {sel.size ? (
        <div className="r g8 wrap" style={{ padding: "8px 14px", borderBottom: "1px solid var(--bd2)", background: "var(--sel)" }} role="group" aria-label="Bulk actions">
          <span className="fs13 w6" aria-live="polite">{`${sel.size} selected`}</span>
          {loose.length && can("dispatch.assign") ? <button type="button" className="btn sm pri" onClick={() => void best()}>{`Assign ${loose.length} to best match`}</button> : null}
          {drivers.length && can("messages.send") ? <button type="button" className="btn sm" onClick={() => setMessaging(true)}>{`Message ${s(drivers.length, "driver")}`}</button> : null}
          <span className="sp"></span>
          <button type="button" className="btn ghost sm" onClick={() => setSel(new Set())}>Clear selection</button>
        </div>
      ) : null}
      <div className="thead" style={{ gridTemplateColumns: cols }}>
        <span><input type="checkbox" aria-label="Select all loads" checked={rows.length > 0 && chosen.length === rows.length} onChange={() => setSel(chosen.length === rows.length ? new Set() : new Set(rows.map((r) => r.id)))} /></span>
        {head("id", "Load")}
        {shown.map(([k, l]) => head(k, l))}
        <span></span>
      </div>
      <div style={{ overflow: "auto", minHeight: 0 }}>
        {rows.map((r) => (
          <div key={r.id} className="trow" style={{ gridTemplateColumns: cols, cursor: "default" }}>
            <span><input type="checkbox" aria-label={`Select ${r.number}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></span>
            <span><button type="button" className="lnk mono" onClick={() => onOpen(r.id)}>{r.number}</button></span>
            {shown.map(([k]) => k === "st" ? <span key={k}><span className="tag" data-k={r.k}>{r.st}</span></span> : <span key={k} className={clsx(k === "drv" ? "w5 tx ell" : k === "win" ? "num t2" : "t2 ell")}>{r[k]}</span>)}
            <span className="r" style={{ justifyContent: "flex-end" }}>{r.unassigned && can("dispatch.assign") ? <button type="button" className="btn xs" onClick={() => onAssign({ id: r.id })} aria-label={`Assign ${r.number}`}>Assign</button> : null}</span>
          </div>
        ))}
        {!rows.length ? <div className="c g8" style={{ alignItems: "center", padding: "36px 16px", textAlign: "center" }}><span className="fs14 w6">Nothing to show</span><span className="fs12 mu">No loads pick up or run on this day.</span></div> : null}
      </div>
      {messaging ? <ConsolePortal><MessageDrivers drivers={drivers} onClose={() => { setMessaging(false); setSel(new Set()); }} /></ConsolePortal> : null}
    </section>
  );
}

/** A week or a month of loads by pickup day; dragging a load to another day moves its appointments. */
export function BoardCalendar({ day, cal, loads, zone, today, onOpen, refresh }: { day: string; cal: "week" | "month"; loads: LoadListItem[]; zone: string; today: string; onOpen: (id: string) => void; refresh: () => Promise<unknown> }) {
  const { can, set, notify } = useConsole();
  const [drag, setDrag] = useState<{ l: LoadListItem; x0: number; y0: number; x: number; y: number; moving: boolean } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const byDay = new Map<string, LoadListItem[]>();
  for (const l of loads) {
    if (!l.pickup_at) continue;
    const d = dayOf(l.pickup_at, zone);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(l);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.pickup_at!.localeCompare(b.pickup_at!));
  const movable = (l: LoadListItem) => can("dispatch.assign") && ["draft", "planned", "assigned", "dispatched"].includes(l.status);
  const move = async (l: LoadListItem, to: string, version = l.version, undoing = false) => {
    const days = daysBetween(dayOf(l.pickup_at!, zone), to);
    if (!days) return;
    try {
      const out = await unwrap(api.POST("/api/v1/dispatch/reschedule", { body: { load_id: l.id, version, days } }));
      await refresh();
      if (undoing) return notify(`${l.load_number} moved back to ${dayLabel(to)}`);
      notify(`${l.load_number} moved to ${dayLabel(to)}`, false, { ms: 7000, action: { label: "Undo", run: () => void move({ ...l, pickup_at: out.pickup_at }, dayOf(l.pickup_at!, zone), out.version, true) } });
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  // Dragging a load to another day, with pointer events, so a mouse, a pen and a finger all work.
  useEffect(() => {
    if (!drag) return;
    const dayAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-day]") as HTMLElement | null)?.dataset.day ?? null;
    const moveP = (e: PointerEvent) => {
      const moving = drag.moving || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6;
      setDrag({ ...drag, x: e.clientX, y: e.clientY, moving });
      if (moving) setOver(dayAt(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => {
      const to = drag.moving ? dayAt(e.clientX, e.clientY) : null;
      const l = drag.l;
      setDrag(null);
      setOver(null);
      if (to) void move(l, to);
    };
    const cancel = () => { setDrag(null); setOver(null); };
    window.addEventListener("pointermove", moveP);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => { window.removeEventListener("pointermove", moveP); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); };
  });
  const drop = (d: string) => ({ "data-day": d });
  const card = (l: LoadListItem, compact: boolean) => (
    <button key={l.id} type="button" className={clsx("dbcal-it", compact && "compact", drag?.moving && drag.l.id === l.id && "dragging")} data-k={l.assignment ? loadTone(l.status) : "warn"}
      onPointerDown={(e) => { if (!movable(l) || e.button !== 0) return; setDrag({ l, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moving: false }); }}
      onClick={(e) => { if (drag?.moving) { e.preventDefault(); return; } onOpen(l.id); }} aria-label={`${l.load_number}, ${l.assignment ? loadLabel(l.status) : "Unassigned"}, ${l.origin_city ?? ""} to ${l.destination_city ?? ""}, ${l.assignment?.driver.name ?? "no driver"}. Open load.`}>
      {compact ? <span className="tag" data-k={l.assignment ? loadTone(l.status) : "warn"}><span className="mono fs11">{l.load_number}</span></span> : (
        <>
          <span className="r g4"><span className="mono fs11 w6 nw">{l.load_number}</span><span className="tag" data-k={l.assignment ? loadTone(l.status) : "warn"}>{l.assignment ? loadLabel(l.status) : "Unassigned"}</span></span>
          <span className="fs11 t2 ell">{`${l.origin_city ?? "—"} → ${l.destination_city ?? "—"}`}</span>
          <span className="fs11 mu ell">{`${hm(l.pickup_at!, zone)}${l.delivery_at ? `–${hm(l.delivery_at, zone)}` : ""} · ${l.assignment?.driver.name ?? "Unassigned"}`}</span>
        </>
      )}
    </button>
  );
  const week = Array.from({ length: 7 }, (_, i) => shift(monday(day), i));
  const first = `${day.slice(0, 8)}01`;
  const lead = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const month: string[] = [];
  for (let d = shift(first, -lead); month.length < 35 || d.slice(0, 7) === first.slice(0, 7) || month.length % 7; d = shift(d, 1)) month.push(d);
  const top = Math.max(1, ...month.map((d) => byDay.get(d)?.length ?? 0));
  return (
    <section className="card oh c" style={{ minHeight: 0 }} aria-label="Calendar">
      <div className="ch" style={{ flexWrap: "wrap", rowGap: "6px" }}>
        <h2 className="h2">{cal === "week" ? `Week of ${dayLabel(week[0]!)}` : new Date(`${first}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
        <span className="sp"></span>
        {cal === "month" ? <><span className="fs11 mu" aria-hidden="true">Fewer loads</span><span aria-hidden="true" className="dbcal-scale"></span><span className="fs11 mu" aria-hidden="true">More loads</span></> : null}
        <span className="fs11 mu">Drag a load to another day to reschedule</span>
        <div className="seg sm" role="group" aria-label="Calendar range">
          {(["week", "month"] as const).map((k) => <button key={k} type="button" className={clsx(cal === k && "on")} aria-pressed={cal === k} onClick={() => set({ bcal: k })}>{k === "week" ? "Week" : "Month"}</button>)}
        </div>
      </div>
      {cal === "week" ? (
        <div className="dbcal-week">
          {week.map((d) => {
            const list = byDay.get(d) ?? [];
            return (
              <div key={d} className={clsx("dbcal-day", d === today && "today", over === d && "over")} {...drop(d)}>
                <button type="button" className="btn sm" style={{ justifyContent: "space-between" }} onClick={() => set({ bday: d, bview: "tl" })} aria-label={`Open ${dayLabel(d)} on the timeline, ${s(list.length, "load")}`}>
                  <span className="w6">{dayLabel(d)}</span><span className="fs11 mu">{s(list.length, "load")}</span>
                </button>
                {list.map((l) => card(l, false))}
                {!list.length ? <span className="fs12 mu" style={{ padding: "6px 2px" }}>No loads</span> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ overflow: "auto", minHeight: 0, flex: 1 }}>
          <div className="dbcal-mh" aria-hidden="true">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((h) => <span key={h}>{h}</span>)}</div>
          <div className="dbcal-month">
            {month.map((d) => {
              const list = byDay.get(d) ?? [];
              return (
                <div key={d} className={clsx("dbcal-cell", d === today && "today", d.slice(0, 7) !== first.slice(0, 7) && "out", over === d && "over")} style={{ background: `color-mix(in srgb, var(--pri) ${Math.round((list.length / top) * 30)}%, var(--sf))` }} {...drop(d)}>
                  <button type="button" className="btn ghost xs" style={{ justifyContent: "space-between" }} onClick={() => set({ bday: d, bview: "tl" })} aria-label={`${dayLabel(d)}${d === today ? ", today" : ""}, ${s(list.length, "load")}. Open on the timeline.`}>
                    <span className="w6">{Number(d.slice(8))}</span><span className="fs11 mu">{list.length || ""}</span>
                  </button>
                  {list.slice(0, 2).map((l) => card(l, true))}
                  {list.length > 2 ? <span className="fs11 mu" style={{ padding: "0 4px" }}>{`+${list.length - 2} more`}</span> : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {drag?.moving ? (
        <div className="qcard" aria-hidden="true" style={{ position: "fixed", left: drag.x + 12, top: drag.y + 8, zIndex: 60, pointerEvents: "none", width: "220px", boxShadow: "var(--sh3)" }}>
          <span className="fs12 w5 ell">{drag.l.load_number}</span>
          <span className="fs11 mu">{over ? `Drop to move to ${dayLabel(over)}` : "Drop on a day"}</span>
        </div>
      ) : null}
    </section>
  );
}
