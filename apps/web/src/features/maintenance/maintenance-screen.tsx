"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { useAction, useSoon } from "@/features/console/use-action";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { formatDate, formatDateTime, todayIn } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, humanize, plural } from "@/lib/format/text";

type Order = Schema<"WorkOrderListItem">;

const PRIORITY: Record<string, [label: string, tone: string]> = { urgent: ["Urgent", "bad"], high: ["High", "bad"], normal: ["Normal", "warn"], low: ["Low", "mu"] };
const TRUCK = "M1 5h14v11H1zM15 9h4l3 3v4h-7zM5.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z";

/** One work order: what is being done, what it costs, and moving it along. */
function WorkOrder({ id, close }: { id: string; close: () => void }) {
  const { me, can } = useConsole();
  const act = useAction();
  const org = me.organization;
  const query = useQuery({ queryKey: [org.id, "maintenance", "work-order", id], queryFn: () => unwrap(api.GET("/api/v1/maintenance/work-orders/{work_order_id}", { params: { path: { work_order_id: id } } })) });
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const order = query.data;
  const move = async (action: "start" | "complete" | "cancel") => {
    if (!order) return;
    setPending(true);
    setProblem(null);
    try {
      await unwrap(api.POST("/api/v1/maintenance/work-orders/{work_order_id}/transitions", { params: { path: { work_order_id: order.id } }, body: { action, version: order.version, notes: notes.trim() || null } }));
      await act(async () => undefined, `${order.number} ${action === "start" ? "started" : action === "complete" ? "completed" : "cancelled"}`);
      close();
    } catch (error) {
      setProblem(errorMessage(error));
      setPending(false);
    }
  };
  const allowed = new Set(order?.allowed_actions ?? []);
  return (
    <Dialog
      title={order ? `${order.number} · ${order.title}` : "Work order"}
      sub={order ? [order.unit.name, PRIORITY[order.priority]?.[0], humanize(order.status)].filter(Boolean).join(" · ") : undefined}
      icon={TRUCK}
      width={560}
      onClose={() => !pending && close()}
      footer={
        <>
          <span className="fs12 mu">{order ? `Total ${formatMoney(order.total_cost, order.currency)}` : ""}</span>
          <span className="sp"></span>
          <button className="btn" onClick={close} disabled={pending}>Close</button>
          {can("maintenance.manage") && allowed.has("cancel") ? <button className="btn bad" onClick={() => void move("cancel")} disabled={pending}>Cancel work order</button> : null}
          {can("maintenance.manage") && allowed.has("start") ? <button className="btn pri" onClick={() => void move("start")} disabled={pending}>Start</button> : null}
          {can("maintenance.manage") && allowed.has("complete") ? <button className="btn pri" onClick={() => void move("complete")} disabled={pending}>Complete</button> : null}
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
            <dt>Out of service</dt>
            <dd>{order.out_of_service ? "Yes — the unit can’t be dispatched until it is done" : "No"}</dd>
            <dt>Opened</dt>
            <dd>{`${formatDateTime(order.created_at, org.timezone)}${order.created_by_name ? ` by ${order.created_by_name}` : ""}`}</dd>
            {order.completed_at ? (
              <>
                <dt>Completed</dt>
                <dd>{`${formatDateTime(order.completed_at, org.timezone)}${order.completed_by_name ? ` by ${order.completed_by_name}` : ""}`}</dd>
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
          {can("maintenance.manage") && (allowed.has("complete") || allowed.has("start") || allowed.has("cancel")) ? (
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

/** Maintenance board of work orders. */
export function MaintenanceScreen() {
  const { me, can, set } = useConsole();
  const soon = useSoon();
  const org = me.organization;
  const today = todayIn(org.timezone);
  const [opened, setOpened] = useState<string | null>(null);
  const summary = useQuery({ queryKey: [org.id, "maintenance", "summary"], queryFn: () => unwrap(api.GET("/api/v1/maintenance/summary")), refetchInterval: 60_000 });
  const open = useQuery({ queryKey: [org.id, "maintenance", "board", "open"], queryFn: () => unwrap(api.GET("/api/v1/maintenance/work-orders", { params: { query: { open: true, sort: "priority", limit: 100 } } })), refetchInterval: 60_000 });
  const done = useQuery({ queryKey: [org.id, "maintenance", "board", "done"], queryFn: () => unwrap(api.GET("/api/v1/maintenance/work-orders", { params: { query: { status: "completed", sort: "-created_at", limit: 12 } } })), refetchInterval: 60_000 });
  const trucks = useQuery({ queryKey: [org.id, "vehicles", "count"], queryFn: () => unwrap(api.GET("/api/v1/vehicles", { params: { query: { limit: 1, count: true } } })), enabled: can("equipment.read"), staleTime: 60_000 });
  const trailers = useQuery({ queryKey: [org.id, "trailers", "count"], queryFn: () => unwrap(api.GET("/api/v1/trailers", { params: { query: { limit: 1, count: true } } })), enabled: can("equipment.read"), staleTime: 60_000 });
  const s = summary.data;
  const orders = open.data?.items ?? [];
  const columns: { l: string; k: string; cards: Order[] }[] = [
    { l: "Open", k: "warn", cards: orders.filter((order) => order.status === "open" && !order.scheduled_for) },
    { l: "Scheduled", k: "violet", cards: orders.filter((order) => order.status === "open" && order.scheduled_for) },
    { l: "In progress", k: "brand", cards: orders.filter((order) => order.status === "in_progress") },
    { l: "Done", k: "ok", cards: done.data?.items ?? [] },
  ];
  const add = can("maintenance.manage") ? () => set({ modal: "add", kind: "workorder", mstep: "manual", overlay: "none", dd: null, ddq: "", fv: {}, ferr: {} }) : null;
  const units = [trucks.data?.page.total_count, trailers.data?.page.total_count];

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
            <button className="on">Board</button>
            <button onClick={soon("The list view of work orders")}>List</button>
            <button onClick={soon("The calendar of work orders")}>Calendar</button>
          </div>
          {add ? (
            <button className="btn pri" onClick={add}>
              <Icon className="s14 b" d="M12 5v14M5 12h14" />
              New work order
            </button>
          ) : null}
        </div>
      </div>
      <div className="kpis" style={{ margin: "0 24px", gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
        {[
          { label: "Open work orders", value: s ? formatNumber(s.open_work_orders) : "—", suffix: "", sub: s ? `${plural(s.urgent_open, "urgent one")}` : "", k: "warn", sk: s?.urgent_open ? "bad" : "mu" },
          { label: "Out of service", value: s ? formatNumber(s.units_out_of_service) : "—", suffix: "", sub: "Units off the road", k: "bad", sk: s?.units_out_of_service ? "bad" : "mu" },
          { label: "Past their date", value: s ? formatNumber(s.overdue) : "—", suffix: "", sub: "Scheduled for a day that has passed", k: "late", sk: s?.overdue ? "warn" : "mu" },
          { label: "Cost this month", value: s ? formatMoney(s.spend_this_month, s.currency) : "—", suffix: "", sub: "Parts and labor on work orders", k: "mu", sk: "mu" },
        ].map((k) => (
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
      {open.isError ? <ErrorState error={open.error} retry={() => void open.refetch()} /> : null}
      {open.data && !orders.length && done.data && !done.data.items.length ? (
        <EmptyState icon="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" title="No work orders yet" text="Open a work order for a repair or service. A unit marked out of service can’t be dispatched until the work is done.">
          {add ? <button className="btn sm pri" onClick={add}>New work order</button> : null}
        </EmptyState>
      ) : (
        <div className="kanban">
          {columns.map((col) => (
            <section key={col.l} className="kcol">
              <div className="r g8 kch">
                <span className="dot" data-k={col.k}></span>
                <span className="h3"><span>{col.l}</span></span>
                <span className="cnt" data-k="mu"><span>{col.cards.length}</span></span>
                <span className="sp"></span>
                {add && col.l !== "Done" ? <button className="btn ghost xs icon" aria-label="Add work order" onClick={add}><Icon className="s14" d="M12 5v14M5 12h14" /></button> : null}
              </div>
              <div className="c g8" style={{ padding: "0 8px 8px", overflow: "auto", minHeight: "0", flex: "1" }}>
                {col.cards.map((w) => {
                  const [priority, tone] = PRIORITY[w.priority] ?? [humanize(w.priority), "mu"];
                  const late = w.scheduled_for && w.scheduled_for < today && w.status !== "completed";
                  return (
                    <article key={w.id} className={clsx("wo")} onClick={() => setOpened(w.id)} style={{ cursor: "pointer" }}>
                      <div className="r g6">
                        <span className="mono fs12 mu"><span>{w.number}</span></span>
                        <span className="sp"></span>
                        <span className="tag" data-k={tone}><span>{priority}</span></span>
                      </div>
                      <div className="fs13 w5"><span>{w.title}</span></div>
                      <div className="r g6 fs12 t3">
                        <span className="eqic" style={{ width: "22px", height: "22px" }}>
                          <Icon className="s12" d={TRUCK} />
                        </span>
                        <span className="mono w5"><span>{w.unit.name}</span></span>
                        <span className="mu ell"><span>{w.status === "completed" && w.completed_at ? `Done ${formatDateTime(w.completed_at, org.timezone)}` : Number(w.total_cost) ? formatMoney(w.total_cost, w.currency) : ""}</span></span>
                      </div>
                      <div className="r jb fs12 mu" style={{ paddingTop: "6px", borderTop: "1px solid var(--bd2)" }}>
                        <span className="ell"><span>{w.vendor ?? "No vendor yet"}</span></span>
                        <span className={clsx("num nw", late && "tc")} data-k={late ? "bad" : undefined}><span>{w.scheduled_for ? formatDate(w.scheduled_for).replace(/, \d{4}$/, "") : formatDate(w.created_at.slice(0, 10)).replace(/, \d{4}$/, "")}</span></span>
                      </div>
                      {w.out_of_service && w.status !== "completed" && w.status !== "cancelled" ? (
                        <div className="banner" data-k="bad" style={{ padding: "6px 8px" }}>
                          <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
                          <div>
                            <b>Out of service</b>
                            {" until this is completed"}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      {opened ? <WorkOrder id={opened} close={() => setOpened(null)} /> : null}
    </div>
  );
}
