"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { useAction } from "@/features/console/use-action";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { formatDate, formatDateTime, formatStamp, todayIn } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, humanize, plural } from "@/lib/format/text";
import { useMinuteClock } from "@/lib/time/clock";

type Order = Schema<"WorkOrderListItem">;
type View = "board" | "list" | "calendar";

const PRIORITY: Record<string, [label: string, tone: string]> = { urgent: ["Urgent", "bad"], high: ["High", "bad"], normal: ["Medium", "warn"], low: ["Low", "mu"] };
const STATUS: Record<string, [label: string, tone: string]> = { open: ["Open", "warn"], scheduled: ["Scheduled", "violet"], in_progress: ["In progress", "brand"], waiting_parts: ["Waiting parts", "late"], completed: ["Completed", "ok"], cancelled: ["Cancelled", "mu"] };
const TRUCK = "M1 5h14v11H1zM15 9h4l3 3v4h-7zM5.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z";
const DAY = 86_400_000;
const LIST_TABS: [string, Record<string, string | boolean>][] = [["Open", { open: true }], ["Urgent", { open: true, priority: "urgent" }], ["Overdue", { overdue: true }], ["Completed", { status: "completed" }], ["All", {}]];

const short = (date: string) => formatDate(date).replace(/, \d{4}$/, "");
const statusOf = (w: Order) => (w.status === "open" && w.scheduled_for ? "scheduled" : w.status);

/** On the company's clock: "09:12" today, "Nov 12" before. */
function when(iso: string, zone: string, now: number | null): string {
  const [day, time] = formatStamp(iso, zone).split(" · ");
  return now !== null && todayIn(zone, new Date(now)) === todayIn(zone, new Date(iso)) ? `today ${time}` : day!;
}

/** The line under a card's title: who reported it, when it is due, since when it waits. */
function metaOf(w: Order, zone: string, today: string, now: number | null): string {
  const status = statusOf(w);
  if (status === "completed") return w.completed_at ? `Closed ${when(w.completed_at, zone, now)}` : "Closed";
  if (status === "waiting_parts") return w.out_of_service ? `Out of service since ${when(w.created_at, zone, now)}` : `Waiting since ${when(w.started_at ?? w.created_at, zone, now)}`;
  if (status === "in_progress") return w.started_at ? `Started ${when(w.started_at, zone, now)}` : "Started";
  if (status === "scheduled" && w.scheduled_for) {
    const days = Math.round((Date.parse(`${w.scheduled_for}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY);
    return days === 0 ? "Due today" : days > 0 ? `Due in ${plural(days, "day")}` : `${plural(-days, "day")} late`;
  }
  return `Reported${w.reported_by_name ? ` by ${w.reported_by_name}` : ""} · ${when(w.created_at, zone, now)}`;
}

/** The card's foot: who does it, and the date that matters for it. */
function footOf(w: Order, zone: string, now: number | null): [left: string, right: string, late: boolean] {
  const status = statusOf(w);
  const vendor = w.vendor ?? (status === "open" ? "Not scheduled" : "No vendor yet");
  if (status === "completed") return [vendor, w.completed_at ? (when(w.completed_at, zone, now).startsWith("today") ? "Today" : short(todayIn(zone, new Date(w.completed_at)))) : "", false];
  if (status === "waiting_parts") return [vendor, w.parts_eta ? `Part ETA ${short(w.parts_eta)}` : "Part ETA not set", false];
  if (status === "in_progress") return [vendor, w.started_at ? `Since ${when(w.started_at, zone, now).replace(/^today /, "")}` : "", false];
  if (w.scheduled_for) return [vendor, short(w.scheduled_for), w.scheduled_for < todayIn(zone, now === null ? undefined : new Date(now))];
  return [vendor, now !== null && todayIn(zone, new Date(now)) === todayIn(zone, new Date(w.created_at)) ? "Today" : short(todayIn(zone, new Date(w.created_at))), false];
}

/** One work order: what is being done, what it costs, and moving it along. */
function WorkOrder({ id, close }: { id: string; close: () => void }) {
  const { me, can } = useConsole();
  const act = useAction();
  const org = me.organization;
  const query = useQuery({ queryKey: [org.id, "maintenance", "work-order", id], queryFn: () => unwrap(api.GET("/api/v1/maintenance/work-orders/{work_order_id}", { params: { path: { work_order_id: id } } })) });
  const [notes, setNotes] = useState("");
  const [eta, setEta] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const order = query.data;
  const PAST: Record<string, string> = { start: "started", wait_parts: "is waiting for parts", resume: "resumed", complete: "completed", cancel: "cancelled" };
  const move = async (action: "start" | "wait_parts" | "resume" | "complete" | "cancel") => {
    if (!order) return;
    setPending(true);
    setProblem(null);
    try {
      await unwrap(api.POST("/api/v1/maintenance/work-orders/{work_order_id}/transitions", { params: { path: { work_order_id: order.id } }, body: { action, version: order.version, notes: notes.trim() || null, parts_eta: action === "wait_parts" ? eta || null : null } }));
      await act(async () => undefined, `${order.number} ${PAST[action]}`);
      close();
    } catch (error) {
      setProblem(errorMessage(error));
      setPending(false);
    }
  };
  const allowed = new Set(order?.allowed_actions ?? []);
  const manage = can("maintenance.manage");
  return (
    <Dialog
      title={order ? `${order.number} · ${order.title}` : "Work order"}
      sub={order ? [order.unit.name, PRIORITY[order.priority]?.[0], STATUS[statusOf(order)]?.[0] ?? humanize(order.status)].filter(Boolean).join(" · ") : undefined}
      icon={TRUCK}
      width={560}
      onClose={() => !pending && close()}
      footer={
        <>
          <span className="fs12 mu">{order ? `Total ${formatMoney(order.total_cost, order.currency)}` : ""}</span>
          <span className="sp"></span>
          <button className="btn" onClick={close} disabled={pending}>Close</button>
          {manage && allowed.has("cancel") ? <button className="btn bad" onClick={() => void move("cancel")} disabled={pending}>Cancel work order</button> : null}
          {manage && allowed.has("wait_parts") ? <button className="btn" onClick={() => void move("wait_parts")} disabled={pending}>Waiting for parts</button> : null}
          {manage && allowed.has("resume") ? <button className="btn" onClick={() => void move("resume")} disabled={pending}>Parts are in</button> : null}
          {manage && allowed.has("start") ? <button className="btn pri" onClick={() => void move("start")} disabled={pending}>Start</button> : null}
          {manage && allowed.has("complete") ? <button className="btn pri" onClick={() => void move("complete")} disabled={pending}>Complete</button> : null}
        </>
      }
    >
      {query.isError ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : null}
      <Problem message={problem} />
      {order ? (
        <>
          {order.description ? <p className="fs13 t2">{order.description}</p> : null}
          <dl className="kv">
            <dt>Vendor</dt>
            <dd>{order.vendor ?? "—"}</dd>
            <dt>Scheduled for</dt>
            <dd>{order.scheduled_for ? formatDate(order.scheduled_for) : "—"}</dd>
            {order.status === "waiting_parts" ? (
              <>
                <dt>Parts due</dt>
                <dd>{order.parts_eta ? formatDate(order.parts_eta) : "Not set"}</dd>
              </>
            ) : null}
            <dt>Out of service</dt>
            <dd>{order.out_of_service ? "Yes — the unit can’t be dispatched until it is signed back into service" : "No"}</dd>
            <dt>Opened</dt>
            <dd>{`${formatDateTime(order.created_at, org.timezone)}${order.created_by_name ? ` by ${order.created_by_name}` : ""}`}</dd>
            {order.completed_at ? (
              <>
                <dt>Completed</dt>
                <dd>{`${formatDateTime(order.completed_at, org.timezone)}${order.completed_by_name ? ` by ${order.completed_by_name}` : ""}`}</dd>
              </>
            ) : null}
            {order.returned_at ? (
              <>
                <dt>Back in service</dt>
                <dd>{`${formatDateTime(order.returned_at, org.timezone)}${order.returned_by_name ? ` · signed off by ${order.returned_by_name}` : ""}`}</dd>
              </>
            ) : null}
          </dl>
          {order.lines.length ? (
            <div className="card oh" style={{ boxShadow: "none" }}>
              {order.lines.map((line) => (
                <div key={line.id} className="r jb fs13" style={{ padding: "8px 12px", borderBottom: "1px solid var(--bd2)" }}>
                  <span className="t2">{`${line.description} · ${humanize(line.kind)} · ${Number(line.quantity)} × ${formatMoney(line.unit_cost, order.currency)}`}</span>
                  <span className="mono num">{formatMoney(line.amount, order.currency)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="fs12 mu">No parts or labor recorded yet.</p>
          )}
          {manage && allowed.has("wait_parts") ? (
            <div className="fld">
              <label htmlFor="wo-eta">Parts due (if it waits for parts)</label>
              <input id="wo-eta" className="inp" type="date" value={eta} onChange={(event) => setEta(event.target.value)} />
            </div>
          ) : null}
          {manage && (allowed.has("complete") || allowed.has("start") || allowed.has("cancel")) ? (
            <div className="fld">
              <label htmlFor="wo-notes">Notes (optional)</label>
              <textarea id="wo-notes" className="inp" rows={2} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
          ) : null}
        </>
      ) : null}
    </Dialog>
  );
}

/** Maintenance: the board of work orders, the same as a list, and a calendar of what is due. */
export function MaintenanceScreen() {
  const { me, can, fin, state, set, notify } = useConsole();
  const queryClient = useQueryClient();
  const org = me.organization;
  const zone = org.timezone;
  const now = useMinuteClock();
  const today = todayIn(zone);
  const view: View = state.mview === "list" || state.mview === "calendar" ? state.mview : "board";
  const [opened, setOpened] = useState<string | null>(null);
  const summary = useQuery({ queryKey: [org.id, "maintenance", "summary"], queryFn: () => unwrap(api.GET("/api/v1/maintenance/summary")), refetchInterval: 60_000 });
  const open = useQuery({ queryKey: [org.id, "maintenance", "board", "open"], queryFn: () => unwrap(api.GET("/api/v1/maintenance/work-orders", { params: { query: { open: true, sort: "priority", limit: 100 } } })), refetchInterval: 60_000 });
  const done = useQuery({ queryKey: [org.id, "maintenance", "board", "done"], queryFn: () => unwrap(api.GET("/api/v1/maintenance/work-orders", { params: { query: { status: "completed", sort: "-created_at", limit: 12 } } })), refetchInterval: 60_000 });
  const trucks = useQuery({ queryKey: [org.id, "vehicles", "count"], queryFn: () => unwrap(api.GET("/api/v1/vehicles", { params: { query: { limit: 1, count: true } } })), enabled: can("equipment.read"), staleTime: 60_000 });
  const trailers = useQuery({ queryKey: [org.id, "trailers", "count"], queryFn: () => unwrap(api.GET("/api/v1/trailers", { params: { query: { limit: 1, count: true } } })), enabled: can("equipment.read"), staleTime: 60_000 });
  const s = summary.data;
  const orders = open.data?.items ?? [];
  const columns: { l: string; k: string; cards: Order[] }[] = [
    { l: "Open", k: "warn", cards: orders.filter((w) => statusOf(w) === "open") },
    { l: "Scheduled", k: "violet", cards: orders.filter((w) => statusOf(w) === "scheduled") },
    { l: "In progress", k: "brand", cards: orders.filter((w) => w.status === "in_progress") },
    { l: "Waiting parts", k: "late", cards: orders.filter((w) => w.status === "waiting_parts") },
    { l: "Completed", k: "ok", cards: done.data?.items ?? [] },
  ];
  const add = can("maintenance.manage") ? () => set({ modal: "add", kind: "workorder", mstep: "manual", overlay: "none", dd: null, ddq: "", fv: {}, ferr: {} }) : null;
  const units = [trucks.data?.page.total_count, trailers.data?.page.total_count];
  const signOff = async (w: Order) => {
    try {
      await unwrap(api.POST("/api/v1/maintenance/return-to-service", { body: { unit_type: w.unit.type, unit_id: w.unit.id } }));
      notify(`${w.unit.name} is back in service`);
      void queryClient.invalidateQueries({ queryKey: [org.id] });
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  const downtime = s?.downtime_days;
  const before = s?.downtime_days_before;
  const kpis = [
    { label: "Open work orders", value: s ? formatNumber(s.open_work_orders) : "—", suffix: "", sub: s ? (s.high_open ? `${formatNumber(s.high_open)} high priority` : "None high priority") : "", k: "warn", sk: "mu" },
    { label: "Out of service", value: s ? formatNumber(s.units_out_of_service) : "—", suffix: "", sub: s ? (s.longest_off_road ? `${s.longest_off_road.unit.replace(/^(Truck|Trailer) /, "")}${s.longest_off_road.since ? ` since ${short(todayIn(zone, new Date(s.longest_off_road.since)))}` : ""}` : "Every unit can run") : "", k: "bad", sk: s?.units_out_of_service ? "bad" : "mu" },
    { label: "Avg downtime · 30 d", value: downtime !== null && downtime !== undefined ? String(downtime) : "—", suffix: downtime !== null && downtime !== undefined ? " days" : "", sub: downtime === null || downtime === undefined ? "No repair signed off in 30 days" : before !== null && before !== undefined ? `${downtime <= before ? "down" : "up"} from ${before}` : "Per repair that kept a unit off the road", k: "ok", sk: "mu" },
    fin
      ? { label: "Cost this month", value: s ? formatMoney(s.spend_this_month, s.currency) : "—", suffix: "", sub: s ? `${plural(s.completed_this_month, "work order")} · parts + labor` : "", k: "mu", sk: "mu" }
      : { label: "Cost this month", value: "—", suffix: "", sub: "Needs finance access", k: "off", sk: "mu" },
  ];

  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px" }}>
        <div className="f1">
          <div className="crumb">
            <span>{"Safety & fleet"}</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>Maintenance</b>
          </div>
          <h1 className="h1">Maintenance</h1>
          <p className="sub">{`${units[0] !== undefined && units[0] !== null ? `Work orders for ${plural(units[0], "truck")}${units[1] ? ` and ${plural(units[1], "trailer")}` : ""} · ` : ""}equipment in the shop is excluded from dispatch`}</p>
        </div>
        <div className="r g8">
          <div className="seg" role="group" aria-label="View">
            {(["board", "list", "calendar"] as const).map((v) => (
              <button key={v} className={clsx(view === v && "on")} aria-pressed={view === v} onClick={() => set({ mview: v })}>{humanize(v)}</button>
            ))}
          </div>
          {add ? (
            <button className="btn pri" onClick={add}>
              <Icon className="s14 b" d={I.plus} />
              New work order
            </button>
          ) : null}
        </div>
      </div>
      <div className="kpis" style={{ margin: "0 24px", gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
        {kpis.map((k) => (
          <div key={k.label} className="kpi">
            <span className="kl">
              <span className="dot" data-k={k.k}></span>
              <span>{k.label}</span>
            </span>
            <span className="kv2">
              <span>{k.value}</span>
              <small><span>{k.suffix}</span></small>
            </span>
            <span className="ks" data-k={k.sk}><span>{k.sub}</span></span>
          </div>
        ))}
      </div>
      {view === "list" ? <ListView onOpen={setOpened} /> : null}
      {view === "calendar" ? <CalendarView orders={[...orders, ...(done.data?.items ?? [])]} onOpen={setOpened} /> : null}
      {view === "board" && open.isError ? <ErrorState error={open.error} retry={() => void open.refetch()} /> : null}
      {view === "board" && open.data && !orders.length && done.data && !done.data.items.length ? (
        <EmptyState icon={I.wrench} title="No work orders yet" text="Open a work order for a repair or service. A unit marked out of service can’t be dispatched until it is signed back into service.">
          {add ? <button className="btn sm pri" onClick={add}>New work order</button> : null}
        </EmptyState>
      ) : view === "board" ? (
        <div className="kanban">
          {columns.map((col) => (
            <section key={col.l} className="kcol">
              <div className="r g8 kch">
                <span className="dot" data-k={col.k}></span>
                <span className="h3"><span>{col.l}</span></span>
                <span className="cnt" data-k="mu"><span>{col.cards.length}</span></span>
                <span className="sp"></span>
                {add ? <button className="btn ghost xs icon" aria-label={`Add work order to ${col.l.toLowerCase()}`} onClick={add}><Icon className="s14" d={I.plus} /></button> : null}
              </div>
              <div className="c g8" style={{ padding: "0 8px 8px", overflow: "auto", minHeight: "0", flex: "1" }}>
                {col.cards.map((w) => {
                  const [priority, tone] = PRIORITY[w.priority] ?? [humanize(w.priority), "mu"];
                  const [left, right, late] = footOf(w, zone, now);
                  const offRoad = w.unit.status === "in_maintenance" || w.unit.status === "out_of_service";
                  const pendingCheck = w.status === "completed" && w.out_of_service && !w.returned_at && offRoad;
                  return (
                    <article key={w.id} className="wo" onClick={() => setOpened(w.id)} style={{ cursor: "pointer" }}>
                      <div className="r g6">
                        <span className="mono fs12 mu"><span>{w.number}</span></span>
                        <span className="sp"></span>
                        <span className="tag" data-k={tone}><span>{priority}</span></span>
                      </div>
                      <div className="fs13 w5"><span>{w.title}</span></div>
                      <div className="r g6 fs12 t3">
                        <span className="eqic" style={{ width: "22px", height: "22px" }}><Icon className="s12" d={TRUCK} /></span>
                        <span className="mono w5 nw"><span>{w.unit.name.replace(/^(Truck|Trailer) /, "")}</span></span>
                        <span className="mu ell"><span>{metaOf(w, zone, today, now)}</span></span>
                      </div>
                      <div className="r jb fs12 mu" style={{ paddingTop: "6px", borderTop: "1px solid var(--bd2)" }}>
                        <span className="ell"><span>{left}</span></span>
                        <span className={clsx("num nw", late && "tc")} data-k={late ? "bad" : undefined}><span>{right}</span></span>
                      </div>
                      {pendingCheck ? (
                        <div className="banner" data-k="warn" style={{ padding: "6px 8px" }} onClick={(e) => e.stopPropagation()}>
                          <Icon className="s14" d={I.shield} />
                          <div className="f1">
                            <b>Return-to-service check pending</b>
                            {" — not dispatchable until signed off"}
                            {can("maintenance.manage") ? <div style={{ marginTop: "6px" }}><button className="btn xs" onClick={() => void signOff(w)}>Sign off</button></div> : null}
                          </div>
                        </div>
                      ) : w.status === "completed" && w.returned_at ? (
                        <div className="banner" data-k="ok" style={{ padding: "6px 8px" }}>
                          <Icon className="s14" d={I.shield} />
                          <div><b>Returned to service</b>{w.returned_by_name ? ` by ${w.returned_by_name}` : ""}</div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}
      {opened ? <WorkOrder id={opened} close={() => setOpened(null)} /> : null}
    </div>
  );
}

/** Every work order in a table, by tab. */
function ListView({ onOpen }: { onOpen: (id: string) => void }) {
  const { me, fin } = useConsole();
  const org = me.organization;
  const [tab, setTab] = useState(0);
  const [q, setQ] = useState("");
  const params = LIST_TABS[tab]![1];
  const rows = useQuery({ queryKey: [org.id, "maintenance", "list", tab, q], queryFn: () => unwrap(api.GET("/api/v1/maintenance/work-orders", { params: { query: { ...params, q: q.trim() || undefined, sort: "-created_at", limit: 100 } as never } })) });
  const cols = `92px minmax(0,1.6fr) 110px 120px 92px minmax(0,1fr) 110px${fin ? " 104px" : ""}`;
  return (
    <div className="c g10" style={{ padding: "12px 24px 24px", minHeight: "0", flex: "1" }}>
      <div className="r g8">
        <div className="seg sm" role="tablist" aria-label="Work orders">
          {LIST_TABS.map(([label], i) => <button key={label} role="tab" aria-selected={tab === i} className={clsx(tab === i && "on")} onClick={() => setTab(i)}>{label}</button>)}
        </div>
        <span className="sp"></span>
        <input className="inp" style={{ width: "260px", height: "32px" }} placeholder="Number, title, unit or vendor" aria-label="Search work orders" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <section className="card oh c" style={{ minHeight: "0" }}>
        <div className="thead" style={{ gridTemplateColumns: cols }}>
          {["Work order", "Title", "Unit", "Status", "Priority", "Vendor", "Date", ...(fin ? ["Cost"] : [])].map((h) => <span key={h}><span>{h}</span></span>)}
        </div>
        <div className="tbody">
          {rows.isPending ? <Skeleton rows={4} /> : null}
          {rows.isError ? <ErrorState error={rows.error} retry={() => void rows.refetch()} /> : null}
          {rows.data && !rows.data.items.length ? <EmptyState icon={I.wrench} title="No work orders here" text="Nothing matches this tab and search." /> : null}
          {(rows.data?.items ?? []).map((w) => {
            const [status, tone] = STATUS[statusOf(w)] ?? [humanize(w.status), "mu"];
            const [priority, ptone] = PRIORITY[w.priority] ?? [humanize(w.priority), "mu"];
            const date = w.status === "completed" && w.completed_at ? formatDate(todayIn(org.timezone, new Date(w.completed_at))) : w.status === "waiting_parts" && w.parts_eta ? `ETA ${formatDate(w.parts_eta)}` : w.scheduled_for ? formatDate(w.scheduled_for) : "—";
            return (
              <div key={w.id} className="trow" style={{ gridTemplateColumns: cols }} onClick={() => onOpen(w.id)}>
                <span className="mono fs12 w5">{w.number}</span>
                <span className="ell w5">{w.title}</span>
                <span className="mono fs12">{w.unit.name}</span>
                <span className="badge" data-k={tone} style={{ justifySelf: "start" }}><i></i><span>{status}</span></span>
                <span className="tag" data-k={ptone} style={{ justifySelf: "start" }}>{priority}</span>
                <span className="ell t2">{w.vendor ?? "—"}</span>
                <span className="num t2">{date}</span>
                {fin ? <span className="num">{Number(w.total_cost) ? formatMoney(w.total_cost, w.currency) : "—"}</span> : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** A month of work: what is scheduled, what waits for parts and when they are due, and what was done. */
function CalendarView({ orders, onOpen }: { orders: Order[]; onOpen: (id: string) => void }) {
  const { me } = useConsole();
  const zone = me.organization.timezone;
  const today = todayIn(zone);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // weeks start on Monday
  const dayOf = (w: Order): string | null => (w.status === "completed" && w.completed_at ? todayIn(zone, new Date(w.completed_at)) : w.status === "waiting_parts" && w.parts_eta ? w.parts_eta : w.scheduled_for ?? (w.status === "open" || w.status === "in_progress" ? todayIn(zone, new Date(w.created_at)) : null));
  const byDay = new Map<string, Order[]>();
  for (const w of orders) {
    const d = dayOf(w);
    if (d && d.startsWith(month)) byDay.set(d, [...(byDay.get(d) ?? []), w]);
  }
  const shift = (by: number) => {
    const next = new Date(Date.UTC(y, m - 1 + by, 1));
    setMonth(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const title = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  return (
    <div className="c g10" style={{ padding: "12px 24px 24px", minHeight: "0", flex: "1" }}>
      <div className="r g8">
        <button className="btn icon sm" aria-label="Previous month" onClick={() => shift(-1)}><Icon className="s14" d="M15 6l-6 6 6 6" /></button>
        <span className="h2" style={{ minWidth: "150px", textAlign: "center" }}>{title}</span>
        <button className="btn icon sm" aria-label="Next month" onClick={() => shift(1)}><Icon className="s14" d="M9 6l6 6-6 6" /></button>
        <button className="btn sm" onClick={() => setMonth(today.slice(0, 7))}>Today</button>
        <span className="sp"></span>
        <span className="fs12 mu">Scheduled work on its day · waiting for parts on the day they are due · completed work on the day it closed</span>
      </div>
      <section className="card oh" style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="fs12 w5 mu" style={{ padding: "6px 8px", borderBottom: "1px solid var(--bd)" }}>{d}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`lead-${i}`} style={{ minHeight: "92px", borderBottom: "1px solid var(--bd2)", borderRight: "1px solid var(--bd2)", background: "var(--sf2)" }}></div>)}
        {Array.from({ length: days }, (_, i) => {
          const d = `${month}-${String(i + 1).padStart(2, "0")}`;
          const items = byDay.get(d) ?? [];
          return (
            <div key={d} style={{ minHeight: "92px", padding: "4px 6px", borderBottom: "1px solid var(--bd2)", borderRight: "1px solid var(--bd2)", background: d === today ? "var(--prit)" : undefined }}>
              <div className={clsx("fs12 num", d === today ? "w6" : "mu")}>{i + 1}</div>
              <div className="c g2">
                {items.slice(0, 3).map((w) => {
                  const [, tone] = STATUS[statusOf(w)] ?? ["", "mu"];
                  return (
                    <button key={w.id} className="tag ell" data-k={tone} style={{ maxWidth: "100%", textAlign: "left", border: "none", cursor: "pointer" }} onClick={() => onOpen(w.id)} title={`${w.number} · ${w.title} · ${w.unit.name}`}>
                      {`${w.unit.name.replace(/^(Truck|Trailer) /, "")} · ${w.title}`}
                    </button>
                  );
                })}
                {items.length > 3 ? <span className="fs11 mu">{`+${items.length - 3} more`}</span> : null}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
