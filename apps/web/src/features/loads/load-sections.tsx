"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import { useUpload } from "@/features/documents/use-upload";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatDate, formatStamp, fromLocalInput } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, place } from "@/lib/format/text";
import type { DocumentType } from "@/lib/upload";
import { AddStop } from "./add-stop";
import type { LoadDetail, Stop } from "./load-data";
import { FUEL_CHOICES, WEEKDAYS } from "./load-money";
import { CHARGES } from "./load-view";
import { usePodRequest } from "./use-pod-request";
import { weekdayOf } from "./row-actions";

type Props = { load: LoadDetail; start?: (action: string) => void };
const UNDO_MS = 7000;
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
const KIND: Record<string, string> = { pickup: "Pickup", delivery: "Delivery", fuel_scale: "Fuel / scale" };
const HANDLING: Record<string, string> = { live: "Live", drop: "Drop", hook: "Hook" };
const NEXT_HANDLING: Record<string, "live" | "drop" | "hook"> = { live: "drop", drop: "hook", hook: "live" };

/** A section's heading with an optional line on the right. */
function Head({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="r g6" style={{ marginBottom: "10px" }}>
      <div className="over">{title}</div>
      <span className="sp"></span>
      {right}
    </div>
  );
}

const keep = (stop: Stop) => ({
  type: stop.type, name: stop.name, address: stop.address, city: stop.city, state: stop.state, postal_code: stop.postal_code,
  contact_name: stop.contact_name, contact_phone: stop.contact_phone, reference: stop.reference, instructions: stop.instructions,
  appt_start: stop.appt_start, appt_end: stop.appt_end, handling: stop.handling,
});

// ---------------------------------------------------------------- stops
/** The route: reorder, remove and add stops until the truck is sent; cycle a stop's handling; see dwell. */
export function StopsEditor({ load }: Props) {
  const { me } = useConsole();
  const act = useAction();
  const [adding, setAdding] = useState(false);
  const zone = me.organization.timezone;
  const editable = load.editable.stops;
  const save = (stops: ReturnType<typeof keep>[], said: string) =>
    act(() => unwrap(api.PUT("/api/v1/loads/{load_id}/stops", { params: { path: { load_id: load.id } }, body: { version: load.version, stops } })), said);
  const all = load.stops.map(keep);
  const swap = (i: number, by: number) => {
    const next = [...all];
    const [moved] = next.splice(i, 1);
    next.splice(i + by, 0, moved!);
    void save(next, `Stop ${i + 1} moved ${by < 0 ? "up" : "down"}`);
  };
  const remove = (i: number) => void save(all.filter((_, j) => j !== i), `Stop removed${load.miles ? " · about 35 mi less" : ""}`);
  const cycle = (i: number) => void save(all.map((s, j) => (j === i ? { ...s, handling: NEXT_HANDLING[s.handling ?? "live"]! } : s)), `Stop ${i + 1} is now ${HANDLING[NEXT_HANDLING[all[i]!.handling ?? "live"]!]!.toLowerCase()}`);

  return (
    <section aria-label="Stops">
      <Head title="Stops" right={editable ? <button className="btn xs" onClick={() => setAdding(true)}><Icon className="s12 b" d="M12 5v14M5 12h14" />Add stop</button> : <span className="fs12 mu">Route fixed once dispatched</span>} />
      <div className="card oh" style={{ boxShadow: "none" }}>
        {load.stops.map((s, i) => (
          <div key={s.id} className="r g10" style={{ padding: "10px 12px", borderBottom: "1px solid var(--bd2)", alignItems: "flex-start" }}>
            <span className="smk" data-k={s.departed_at ? "ok" : s.arrived_at ? "brand" : ""}>{i + 1}</span>
            <div className="f1 mw0">
              <div className="r g6">
                <span className="over" style={{ letterSpacing: ".04em" }}>{KIND[s.type] ?? s.type}</span>
                {s.type !== "fuel_scale" ? (
                  <button className="tag" data-k={s.handling === "live" ? "" : "info"} disabled={!editable} onClick={() => cycle(i)} aria-label={`Handling ${HANDLING[s.handling ?? "live"]}${editable ? ", change it" : ""}`} title={editable ? "Live → Drop → Hook" : undefined}>{HANDLING[s.handling ?? "live"]}</button>
                ) : null}
                {s.reference ? <span className="fs12 mono mu">{s.reference}</span> : null}
              </div>
              <div className="fs14 w5 ell">{s.name || place(s.city, s.state)}</div>
              <div className="fs12 mu num">
                {[place(s.city, s.state), s.appt_start ? `Appt ${formatStamp(s.appt_start, zone)}` : "No appointment"].join(" · ")}
              </div>
              {s.dwell_minutes !== null && s.dwell_minutes !== undefined ? (
                <div className="fs12 num" data-k={s.dwell_minutes > Number(load.detention_free_hours ?? 2) * 60 ? "warn" : ""}>
                  {`${s.departed_at ? "Dwell" : "At the stop for"} ${dur(s.dwell_minutes)}${s.dwell_minutes > Number(load.detention_free_hours ?? 2) * 60 ? ` · past ${Number(load.detention_free_hours ?? 2)} h free` : ""}`}
                </div>
              ) : null}
            </div>
            {editable ? (
              <div className="r g2">
                <button className="btn ghost xs icon" disabled={i === 0} onClick={() => swap(i, -1)} aria-label={`Move stop ${i + 1} up`}><Icon className="s12" d="M18 15l-6-6-6 6" /></button>
                <button className="btn ghost xs icon" disabled={i === load.stops.length - 1} onClick={() => swap(i, 1)} aria-label={`Move stop ${i + 1} down`}><Icon className="s12" d="M6 9l6 6 6-6" /></button>
                {load.stops.length > 2 ? <button className="btn ghost xs icon" onClick={() => remove(i)} aria-label={`Remove stop ${i + 1}`}><Icon className="s12" d="M18 6L6 18M6 6l12 12" /></button> : null}
              </div>
            ) : null}
          </div>
        ))}
        {!load.stops.length ? <p className="fs13 mu" style={{ padding: "12px" }}>No stops yet. Add the pickup and the delivery.</p> : null}
      </div>
      {editable && load.miles ? <p className="fs12 mu" style={{ marginTop: "6px" }}>Each stop added or removed changes the miles by about 35.</p> : null}
      {adding ? <AddStop load={load} onClose={() => setAdding(false)} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------- money
/** Line haul, fuel, detention, extra charges and the margin estimate. Only for roles that may see rates. */
export function MoneyCard({ load }: Props) {
  const { me, notify } = useConsole();
  const act = useAction();
  const client = useQueryClient();
  const [adding, setAdding] = useState<{ type: string; amount: string; note: string; bill: boolean } | null>(null);
  const m = load.money;
  if (!m) return null;
  const cur = load.currency;
  const money = (v: string | null | undefined) => formatMoney(v ?? "0", cur);
  const open = load.editable.rates;
  const charges = load.charges.filter((c) => !c.managed);
  const patchLoad = (body: Record<string, unknown>, said: string) => act(() => unwrap(api.PATCH("/api/v1/loads/{load_id}", { params: { path: { load_id: load.id } }, body: { version: load.version, ...body } as never })), said);
  const review = (ids: string[] | null, verdict: "approved" | "rejected") =>
    act(() => unwrap(api.POST("/api/v1/loads/{load_id}/charges/review", { params: { path: { load_id: load.id } }, body: { verdict, charge_ids: ids } })), ids ? `Charge ${verdict}` : `All waiting charges ${verdict}`);
  const remove = async (c: (typeof charges)[number]) => {
    try {
      await unwrap(api.DELETE("/api/v1/loads/{parent_id}/charges/{item_id}", { params: { path: { parent_id: load.id, item_id: c.id } } }));
      await client.invalidateQueries({ queryKey: [me.organization.id] });
      notify(`${CHARGES[c.type] ?? c.type} charge removed`, false, {
        ms: UNDO_MS,
        action: { label: "Undo", run: () => void act(() => unwrap(api.POST("/api/v1/loads/{parent_id}/charges", { params: { path: { parent_id: load.id } }, body: { type: c.type, description: c.description, quantity: c.quantity, rate: c.rate, billable: c.billable, driver_payable: c.driver_payable, status: c.status } })), "Charge put back") },
      });
    } catch (error) {
      notify(errorMessage(error), true);
    }
  };
  const add = async () => {
    if (!adding || !/^\d{1,8}(\.\d{1,2})?$/.test(adding.amount)) return notify("Enter the amount, like 75.00", true);
    const done = await act(() => unwrap(api.POST("/api/v1/loads/{parent_id}/charges", { params: { path: { parent_id: load.id } }, body: { type: adding.type as "other", description: adding.note.trim() || null, quantity: "1", rate: adding.amount, billable: adding.bill, driver_payable: false, status: "pending" } })), "Charge added · waiting for approval");
    if (done) setAdding(null);
  };
  const row = (label: React.ReactNode, value: string, strong = false, k = "") => (
    <div className={clsx("r jb fs13", strong && "w6")} style={{ padding: "7px 12px", borderBottom: "1px solid var(--bd2)" }}>
      <span className={strong ? "" : "t3"}>{label}</span>
      <span className="mono num tc" data-k={k}>{value}</span>
    </div>
  );

  return (
    <section aria-label="Money">
      <Head title="Money" right={m.pending_charges ? <span className="tag" data-k="warn">{`${m.pending_charges} charge${m.pending_charges > 1 ? "s" : ""} waiting · invoicing blocked`}</span> : null} />
      <div className="card oh" style={{ boxShadow: "none" }}>
        {row("Line haul", money(m.line_haul))}
        <div className="r jb fs13" style={{ padding: "6px 12px", borderBottom: "1px solid var(--bd2)" }}>
          <span className="r g8 t3">
            Fuel surcharge
            <span className="seg sm" role="group" aria-label="Fuel surcharge percent">
              {FUEL_CHOICES.map((pct) => (
                <button key={pct} className={clsx(Number(m.fuel_pct) === pct && "on")} aria-pressed={Number(m.fuel_pct) === pct} disabled={!open} onClick={() => void patchLoad({ fuel_surcharge_pct: String(pct) }, `Fuel surcharge set to ${pct}%`)}>{`${pct}%`}</button>
              ))}
            </span>
          </span>
          <span className="mono num">{money(m.fuel)}</span>
        </div>
        {m.detention_lines.length
          ? m.detention_lines.map((d) => row(<span title={d.explain}>{`Detention · ${d.stop}`}<span className="fs12 mu" style={{ display: "block" }}>{d.explain}</span></span>, money(d.amount)))
          : row(<span>Detention<span className="fs12 mu" style={{ display: "block" }}>{`${Number(m.detention_free_hours)} h free, then ${money(m.detention_rate)}/h from the stop times`}</span></span>, money("0"))}
        {charges.map((c) => (
          <div key={c.id} className="r g8 fs13" style={{ padding: "7px 12px", borderBottom: "1px solid var(--bd2)" }}>
            <span className="f1 mw0">
              <span className="t3">{CHARGES[c.type] ?? c.type}</span>
              {c.description ? <span className="fs12 mu" style={{ display: "block" }}>{c.description}</span> : null}
            </span>
            <span className="tag" data-k={c.status === "approved" ? "ok" : c.status === "rejected" ? "bad" : "warn"}>{c.status === "approved" ? "Approved" : c.status === "rejected" ? "Rejected" : "Waiting"}</span>
            {!c.billable ? <span className="tag">Not billed</span> : null}
            <span className={clsx("mono num", c.status === "rejected" && "mu")} style={{ textDecoration: c.status === "rejected" ? "line-through" : undefined }}>{money(c.amount)}</span>
            {open ? (
              <span className="r g2">
                {c.status !== "approved" ? <button className="btn xs" onClick={() => void review([c.id], "approved")}>Approve</button> : null}
                {c.status !== "rejected" ? <button className="btn xs ghost" onClick={() => void review([c.id], "rejected")}>Reject</button> : null}
                <button className="btn ghost xs icon" aria-label={c.billable ? "Don’t bill to the customer" : "Bill to the customer"} title={c.billable ? "Billed to the customer: click to stop billing it" : "Not billed: click to bill it"}
                  onClick={() => void act(() => unwrap(api.PATCH("/api/v1/loads/{parent_id}/charges/{item_id}", { params: { path: { parent_id: load.id, item_id: c.id } }, body: { billable: !c.billable } })), c.billable ? "No longer billed to the customer" : "Billed to the customer")}>
                  <Icon className="s12" d="M2 7h20v10H2zM6 12h.01M18 12h.01M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
                </button>
                <button className="btn ghost xs icon" aria-label="Remove charge" onClick={() => void remove(c)}><Icon className="s12" d="M18 6L6 18M6 6l12 12" /></button>
              </span>
            ) : null}
          </div>
        ))}
        {adding ? (
          <div className="r g6" style={{ padding: "8px 12px", borderBottom: "1px solid var(--bd2)", flexWrap: "wrap" }}>
            <select className="inp sm" style={{ width: "140px" }} value={adding.type} onChange={(e) => setAdding({ ...adding, type: e.target.value })} aria-label="Charge type">
              {["detention", "lumper", "layover", "tonu", "extra_stop", "driver_assist", "other"].map((t) => <option key={t} value={t}>{CHARGES[t] ?? t}</option>)}
            </select>
            <input className="inp sm mono" style={{ width: "96px" }} inputMode="decimal" placeholder="Amount" aria-label="Amount" value={adding.amount} onChange={(e) => setAdding({ ...adding, amount: e.target.value })} />
            <input className="inp sm f1" placeholder="Note" aria-label="Note" value={adding.note} onChange={(e) => setAdding({ ...adding, note: e.target.value })} />
            <label className="r g4 fs12"><input type="checkbox" checked={adding.bill} onChange={(e) => setAdding({ ...adding, bill: e.target.checked })} />Bill customer</label>
            <button className="btn xs pri" onClick={() => void add()}>Add</button>
            <button className="btn xs ghost" onClick={() => setAdding(null)}>Cancel</button>
          </div>
        ) : null}
        <div className="r jb fs13 w6" style={{ padding: "10px 12px", background: "var(--sf2)" }}>
          <span>{"Total "}<span className="fs12 mu" style={{ fontWeight: 400 }}>{`· ${m.rate_per_mile ? `${money(m.rate_per_mile)}/mi` : "no miles"} · ${load.invoice ? `on invoice ${load.invoice.invoice_number ?? "draft"}` : "not yet invoiced"}`}</span></span>
          <span className="mono num">{money(m.total)}</span>
        </div>
      </div>
      {open ? (
        <div className="r g8" style={{ marginTop: "8px" }}>
          {!adding ? <button className="btn xs" onClick={() => setAdding({ type: "detention", amount: "", note: "", bill: true })}><Icon className="s12 b" d="M12 5v14M5 12h14" />Add charge</button> : null}
          {m.pending_charges > 1 ? <button className="btn xs" onClick={() => void review(null, "approved")}>Approve all</button> : null}
        </div>
      ) : null}
      <div className="card oh" style={{ boxShadow: "none", marginTop: "10px" }} aria-label="Margin estimate">
        {row("Revenue", money(m.total))}
        {row(`Driver pay · ${formatNumber(m.miles)} mi × $${Number(m.costs.driver_pay_per_mile).toFixed(2)}`, `−${money(m.driver_pay)}`)}
        {row(`Fuel · ${Number(m.costs.mpg)} mpg at $${Number(m.costs.fuel_price).toFixed(2)}`, `−${money(m.fuel_cost)}`)}
        {row(`Overhead · $${Number(m.costs.overhead_per_mile).toFixed(2)}/mi`, `−${money(m.overhead)}`)}
        {row(<span>Margin{m.margin_pct !== null && m.margin_pct !== undefined ? <span className="fs12 mu" style={{ fontWeight: 400 }}>{` · ${m.margin_pct}%`}</span> : null}</span>, money(m.margin), true, m.warning ? "warn" : "ok")}
      </div>
      {m.warning ? <p className="fs12 tc" data-k="warn" style={{ marginTop: "6px" }}>Margin is below 25%. Check the rate or the costs.</p> : null}
      {!m.miles ? <p className="fs12 mu" style={{ marginTop: "6px" }}>Add the miles to estimate costs.</p> : null}
    </section>
  );
}

// ---------------------------------------------------------------- ready to invoice
/** What the load still needs before it can be invoiced, each with what to do about it, then Create invoice. */
export function InvoiceChecklist({ load, start }: Props) {
  const { can, set, notify } = useConsole();
  const act = useAction();
  const upload = useUpload();
  const requestPod = usePodRequest();
  const checklist = load.checklist ?? [];
  if (!checklist.length && !load.invoice) return null;
  if (!checklist.length && load.invoice) {
    return (
      <section aria-label="Invoice">
        <Head title="Invoice" />
        <div className="card r g8" style={{ padding: "10px 12px", boxShadow: "none" }}>
          <Icon className="s14" d="M5 12l5 5 9-10" />
          <span className="f1 fs13">{`On invoice ${load.invoice.invoice_number ?? "(draft)"}`}</span>
          {can("invoices.read") ? <button className="btn xs" onClick={() => set({ ...goTo("invoices"), drawer: load.invoice!.id })}>Open invoice</button> : null}
        </div>
      </section>
    );
  }
  const paper = (type: DocumentType, label: string) => () => void upload({ type, entityType: "load", entityId: load.id, label });
  const doIt: Record<string, (() => void) | undefined> = {
    rate_confirmation: paper("rate_confirmation", "Rate confirmation"),
    bol: paper("bol", "Bill of lading"),
    pod: load.status === "delivered" ? () => void requestPod(load.id) : paper("pod", "Proof of delivery"),
    pod_reviewed: start ? () => start("approve_pod") : undefined,
    charges: () => void act(() => unwrap(api.POST("/api/v1/loads/{load_id}/charges/review", { params: { path: { load_id: load.id } }, body: { verdict: "approved", charge_ids: null } })), "Charges approved"),
    terms: () => set({ ...goTo("customers"), drawer: load.customer.id }),
  };
  const done = checklist.filter((i) => i.done).length;
  const create = async () => {
    const out = await act(() => unwrap(api.POST("/api/v1/loads/{load_id}/invoice", { params: { path: { load_id: load.id } } })));
    if (out) notify(`Draft invoice made for ${load.load_number}`, false, can("invoices.read") ? { action: { label: "Open", run: () => set({ ...goTo("invoices"), drawer: out.invoice_id }) } } : undefined);
  };
  return (
    <section aria-label="Ready to invoice">
      <Head title="Ready to invoice" right={<span className="fs12 mu num">{`${done} of ${checklist.length}`}</span>} />
      <div className="card oh" style={{ boxShadow: "none" }}>
        {checklist.map((i) => (
          <div key={i.key} className="r g10 fs13" style={{ padding: "8px 12px", borderBottom: "1px solid var(--bd2)" }}>
            <span className="tc" data-k={i.done ? "ok" : "mu"}><Icon className="s14" d={i.done ? "M5 12l5 5 9-10" : "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"} /></span>
            <span className={clsx("f1", i.done && "t3")}>{i.label}{i.detail ? <span className="fs12 mu">{` · ${i.detail}`}</span> : null}</span>
            {!i.done && i.action && doIt[i.key] ? <button className="btn xs" onClick={doIt[i.key]}>{i.action}</button> : null}
          </div>
        ))}
      </div>
      {can("invoices.create") ? (
        <button className="btn sm pri" style={{ marginTop: "8px" }} disabled={!load.ready_to_invoice} onClick={() => void create()} title={load.ready_to_invoice ? undefined : "Finish the open items first"}>Create invoice</button>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- tracking link
/** A no-sign-in page for the customer: what it shows, copy it, and send it to their contact. */
export function TrackingLinkCard({ load }: Props) {
  const { me, can, notify } = useConsole();
  const act = useAction();
  const link = load.tracking_link;
  const [sending, setSending] = useState<{ to: string; message: string } | null>(null);
  if (["draft", "cancelled"].includes(load.status) || !can("loads.update")) {
    return link ? null : null;
  }
  const url = link ? `${typeof window === "undefined" ? "" : window.location.origin}${link.url_path}` : "";
  const put = (body: Record<string, boolean>, said: string) => act(() => unwrap(api.PUT("/api/v1/loads/{load_id}/tracking-link", { params: { path: { load_id: load.id } }, body })), said);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      notify("Tracking link copied");
    } catch {
      notify(url);
    }
  };
  const send = async () => {
    if (!sending) return;
    const done = await act(() => unwrap(api.POST("/api/v1/loads/{load_id}/tracking-link/send", { params: { path: { load_id: load.id } }, body: { to: sending.to.trim() || null, message: sending.message } })), (out) => `Tracking link sent to ${out.tracking_link?.sent_to ?? "the customer"}`);
    if (done) setSending(null);
  };
  const flags = [["show_eta", "ETA"], ["show_location", "Truck location"], ["show_pod", "POD after delivery"], ["show_driver", "Driver name and phone"]] as const;
  return (
    <section aria-label="Tracking link">
      <Head title="Customer tracking link" right={link?.enabled ? <span className="tag" data-k="ok">On</span> : <span className="tag">Off</span>} />
      <div className="card" style={{ padding: "10px 12px", boxShadow: "none" }}>
        {!link?.enabled ? (
          <div className="r g8">
            <span className="f1 fs13 t2">A page the customer can open without signing in, showing only what you choose.</span>
            <button className="btn xs pri" onClick={() => void put({ enabled: true }, "Tracking link on")}>Turn on</button>
          </div>
        ) : (
          <div className="c g8">
            <div className="r g6">
              <input className="inp sm mono f1" readOnly value={url} aria-label="Tracking link" onFocus={(e) => e.target.select()} />
              <button className="btn xs" onClick={() => void copy()}>Copy</button>
              <button className="btn xs" onClick={() => setSending({ to: link.contact_email ?? "", message: `Here is the live tracking for load ${load.load_number}${load.reference ? ` (${load.reference})` : ""}.` })}>Send</button>
              <button className="btn xs ghost" onClick={() => void put({ enabled: false }, "Tracking link off · it no longer opens")}>Turn off</button>
            </div>
            <div className="r g12 fs12" role="group" aria-label="What the link shows" style={{ flexWrap: "wrap" }}>
              {flags.map(([k, l]) => (
                <label key={k} className="r g4"><input type="checkbox" checked={!!link[k]} onChange={(e) => void put({ [k]: e.target.checked }, `${l} ${e.target.checked ? "shown" : "hidden"} on the link`)} />{l}</label>
              ))}
            </div>
            <span className="fs12 mu">
              {[link.sent_at ? `Sent to ${link.sent_to} ${formatStamp(link.sent_at, me.organization.timezone)}` : "Not sent yet", link.expires_at ? `stops working ${formatDate(link.expires_at.slice(0, 10))}` : "stops working 7 days after delivery"].join(" · ")}
            </span>
          </div>
        )}
        {sending ? (
          <div className="c g6" style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--bd2)" }}>
            <input className="inp sm" placeholder="Customer contact’s email" aria-label="Send to" value={sending.to} onChange={(e) => setSending({ ...sending, to: e.target.value })} />
            <textarea className="inp" rows={3} aria-label="Message" value={sending.message} onChange={(e) => setSending({ ...sending, message: e.target.value })} />
            <div className="r g6"><span className="fs12 mu f1">The link is added under your message.</span><button className="btn xs ghost" onClick={() => setSending(null)}>Cancel</button><button className="btn xs pri" onClick={() => void send()}>Send email</button></div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- check calls
/** Where the truck said it was, logged by hand, with a reminder when it goes quiet. */
export function CheckCalls({ load }: Props) {
  const { me, can } = useConsole();
  const act = useAction();
  const zone = me.organization.timezone;
  const [form, setForm] = useState<{ city: string; state: string; via: "phone" | "driver_app" | "text" | "eld" | "email"; note: string; eta: string } | null>(null);
  const cc = load.check_calls;
  const calls = load.tracking.filter((t) => t.kind === "check_call");
  const moving = ["dispatched", "at_pickup", "in_transit", "at_delivery"].includes(load.status);
  const editable = can("loads.update");
  const log = async () => {
    if (!form) return;
    const eta = form.eta ? fromLocalInput(form.eta, zone) : null;
    const done = await act(() => unwrap(api.POST("/api/v1/loads/{load_id}/tracking", { params: { path: { load_id: load.id } }, body: { kind: "check_call", city: form.city.trim() || null, state: form.state.trim().toUpperCase() || null, note: form.note.trim() || null, via: form.via, eta } })), "Check call logged");
    if (done) setForm(null);
  };
  const remind = (hours: 2 | 4 | 6 | null) => act(() => unwrap(api.PATCH("/api/v1/loads/{load_id}", { params: { path: { load_id: load.id } }, body: { version: load.version, checkcall_reminder_hours: hours } })), hours ? `Reminder after ${hours} h without a check call` : "Check-call reminder off");
  return (
    <section aria-label="Check calls">
      <Head title="Check calls" right={cc ? <span className="fs12 tc" data-k={cc.overdue ? "bad" : "mu"}>{cc.text}</span> : null} />
      {editable ? (
        <div className="r g8" style={{ marginBottom: "8px", flexWrap: "wrap" }}>
          <span className="fs12 mu">Remind me after</span>
          <div className="seg sm" role="group" aria-label="Check-call reminder">
            {([null, 2, 4, 6] as const).map((h) => (
              <button key={String(h)} className={clsx((cc?.reminder_hours ?? null) === h && "on")} aria-pressed={(cc?.reminder_hours ?? null) === h} onClick={() => void remind(h)}>{h ? `${h} h` : "Off"}</button>
            ))}
          </div>
          <span className="sp"></span>
          {moving && !form ? <button className="btn xs" onClick={() => setForm({ city: "", state: "", via: "phone", note: "", eta: "" })}><Icon className="s12 b" d="M12 5v14M5 12h14" />Log check call</button> : null}
        </div>
      ) : null}
      {form ? (
        <div className="card c g6" style={{ padding: "10px 12px", boxShadow: "none", marginBottom: "8px" }}>
          <div className="r g6">
            <input className="inp sm f1" placeholder="City" aria-label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <input className="inp sm mono" style={{ width: "56px" }} maxLength={2} placeholder="ST" aria-label="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            <select className="inp sm" style={{ width: "120px" }} aria-label="How" value={form.via} onChange={(e) => setForm({ ...form, via: e.target.value as "phone" })}>
              {[["phone", "Phone"], ["text", "Text"], ["driver_app", "Driver app"], ["eld", "ELD"], ["email", "Email"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="r g6">
            <label className="fs12 mu r g4">ETA<input className="inp sm mono" type="datetime-local" aria-label="ETA" value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} /></label>
            <input className="inp sm f1" placeholder="Note" aria-label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="r g6"><span className="sp"></span><button className="btn xs ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn xs pri" onClick={() => void log()}>Log</button></div>
        </div>
      ) : null}
      <div className="card oh" style={{ boxShadow: "none" }}>
        {calls.slice(0, 6).map((t) => (
          <div key={t.id} className="r g10 fs13" style={{ padding: "7px 12px", borderBottom: "1px solid var(--bd2)" }}>
            <span className="f1 mw0">
              <span className="w5">{place(t.city, t.state) || "—"}</span>
              <span className="fs12 mu" style={{ display: "block" }}>{[t.actor_name, t.via?.replace("_", " "), t.eta ? `ETA ${formatStamp(t.eta, zone)}` : "", t.note].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="fs12 mu num nw">{formatStamp(t.occurred_at, zone)}</span>
          </div>
        ))}
        {!calls.length ? <p className="fs13 mu" style={{ padding: "10px 12px" }}>{moving ? "No check calls yet." : "Check calls are logged once the truck is on its way."}</p> : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- reefer
/** The trailer's temperature against the set point, with the ±2°F band. */
export function ReeferCard({ load }: Props) {
  const act = useAction();
  const r = load.reefer;
  if (!r) return null;
  const sp = r.set_point_f;
  const setPoint = (v: number) => act(() => unwrap(api.PATCH("/api/v1/loads/{load_id}", { params: { path: { load_id: load.id } }, body: { version: load.version, reefer_set_point_f: v.toFixed(1) } })), `Set point ${v.toFixed(0)}°F`);
  const pts = r.readings;
  const lo = Math.min(...pts.map((p) => p.temp_f), (sp ?? 0) - 4);
  const hi = Math.max(...pts.map((p) => p.temp_f), (sp ?? 0) + 4);
  const W = 320;
  const H = 72;
  const y = (t: number) => H - ((t - lo) / (hi - lo || 1)) * H;
  const t0 = pts.length ? Date.parse(pts[0]!.at) : 0;
  const t1 = pts.length ? Date.parse(pts.at(-1)!.at) : 1;
  const x = (at: string) => ((Date.parse(at) - t0) / (t1 - t0 || 1)) * W;
  const k = r.state === "out_of_range" ? "bad" : r.state === "drifting" ? "warn" : r.state === "in_range" ? "ok" : "";
  return (
    <section aria-label="Reefer">
      <Head title="Reefer" right={<span className="tag" data-k={k}>{{ in_range: "In range", drifting: "Drifting", out_of_range: "Out of range", no_data: "No data" }[r.state]}</span>} />
      <div className="card c g8" style={{ padding: "10px 12px", boxShadow: "none" }}>
        <div className="r g10">
          <span className="fs24 w6 num" style={{ fontSize: "24px" }}>{r.current_f !== null && r.current_f !== undefined ? `${r.current_f.toFixed(1)}°F` : "—"}</span>
          <span className="f1 fs12 mu">{r.text}</span>
          <span className="r g4 fs12">
            Set point
            <button className="btn xs icon" aria-label="Set point down 1°F" disabled={sp === null || sp === undefined || !load.editable.details} onClick={() => void setPoint((sp ?? 0) - 1)}>−</button>
            <span className="mono w6">{sp !== null && sp !== undefined ? `${sp.toFixed(0)}°F` : "—"}</span>
            <button className="btn xs icon" aria-label="Set point up 1°F" disabled={!load.editable.details} onClick={() => void setPoint((sp ?? 34) + (sp === null || sp === undefined ? 0 : 1))}>+</button>
          </span>
        </div>
        {pts.length > 1 && sp !== null && sp !== undefined ? (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`Temperature over the last ${Math.round((t1 - t0) / 3_600_000) || 1} h, band ${r.low_f}°F to ${r.high_f}°F`}>
            <rect x="0" width={W} y={y(sp + 2)} height={y(sp - 2) - y(sp + 2)} fill="var(--okt, rgba(16,150,90,.12))" />
            <line x1="0" x2={W} y1={y(sp)} y2={y(sp)} stroke="var(--mu)" strokeDasharray="3 3" strokeWidth="1" />
            <polyline fill="none" stroke="var(--pri)" strokeWidth="2" points={pts.map((p) => `${x(p.at).toFixed(1)},${y(p.temp_f).toFixed(1)}`).join(" ")} />
          </svg>
        ) : (
          <p className="fs12 mu">{sp === null || sp === undefined ? "Set the temperature the load must stay at." : "Readings appear here as the reefer unit reports them."}</p>
        )}
        <span className="fs12 mu">Dispatch and the driver are alerted when it stays out of the ±2°F band for 15 minutes.</span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- repeat
/** Book the same load again every week: the days, until when, and the next three dates. */
export function RepeatCard({ load }: Props) {
  const { me, can } = useConsole();
  const act = useAction();
  const rec = load.recurrence;
  const [days, setDays] = useState<number[]>(rec?.days ?? []);
  const [until, setUntil] = useState<"dec31" | "jan31" | "none">(!rec?.until ? (rec ? "none" : "dec31") : rec.until.endsWith("-01-31") ? "jan31" : "dec31");
  if (!can("loads.update") || load.status === "cancelled") return null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.organization.timezone });
  const year = Number(today.slice(0, 4));
  const end = until === "none" ? null : until === "dec31" ? `${year}-12-31` : `${today.slice(5) > "01-31" ? year + 1 : year}-01-31`;
  const save = (next: number[] | null) => act(() => unwrap(api.PATCH("/api/v1/loads/{load_id}", { params: { path: { load_id: load.id } }, body: { version: load.version, recurrence: next && next.length ? { days: next, until: end } : null } })), next && next.length ? `Repeats every ${next.map((d) => WEEKDAYS[d]).join(", ")}` : "No longer repeats");
  const changed = JSON.stringify(days) !== JSON.stringify(rec?.days ?? []) || (rec && (rec.until ?? null) !== end);
  return (
    <section aria-label="Repeat">
      <Head title="Repeat weekly" right={rec?.parent_id ? <span className="fs12 mu">Made by a repeat</span> : null} />
      <div className="card c g8" style={{ padding: "10px 12px", boxShadow: "none" }}>
        <div className="r g8" style={{ flexWrap: "wrap" }}>
          <div className="seg sm" role="group" aria-label="Repeat on">
            {WEEKDAYS.map((l, d) => <button key={l} className={clsx(days.includes(d) && "on")} aria-pressed={days.includes(d)} onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort())}>{l}</button>)}
          </div>
          <div className="seg sm" role="group" aria-label="Repeat until">
            {([["dec31", "Dec 31"], ["jan31", "Jan 31"], ["none", "No end"]] as const).map(([v, l]) => <button key={v} className={clsx(until === v && "on")} aria-pressed={until === v} onClick={() => setUntil(v)}>{l}</button>)}
          </div>
          <span className="sp"></span>
          {!days.length && load.pickup_at && !rec ? <button className="btn xs" onClick={() => setDays([weekdayOf(load.pickup_at!, me.organization.timezone)])}>{`Every ${WEEKDAYS[weekdayOf(load.pickup_at, me.organization.timezone)]}`}</button> : null}
          {changed ? <button className="btn xs pri" onClick={() => void save(days)}>{days.length ? "Save repeat" : "Stop repeating"}</button> : null}
        </div>
        <span className="fs12 mu">
          {rec?.next_dates.length && !changed
            ? `Next: ${rec.next_dates.map((d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })).join(" · ")}. Each is made as a draft two weeks ahead, without a driver or a rate.`
            : days.length ? "Save to start repeating. Each repeat is a draft to confirm." : "Not repeating."}
        </span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- activity
/** Every change to the load, who made it and when. */
export function ActivityFeed({ load, limit }: Props & { limit?: number }) {
  const { me } = useConsole();
  const zone = me.organization.timezone;
  const all = load.activity ?? [];
  const rows = limit ? all.slice(0, limit) : all;
  return (
    <section aria-label="Activity">
      <Head title="Activity" />
      {rows.map((a) => (
        <div key={a.id} className="act">
          <span className="dot" data-k={a.tone === "bad" ? "bad" : a.tone === "warn" ? "warn" : a.tone === "ok" ? "ok" : "info"} style={{ marginTop: "6px" }}></span>
          <div className="fs13 t2"><span className="w5 tx">{a.actor_name ?? "FlyFleet"}</span>{" "}<span>{a.text}</span></div>
          <span className="fs12 mu num nw">{formatStamp(a.at, zone)}</span>
        </div>
      ))}
      {!rows.length ? <p className="fs13 mu">Nothing yet.</p> : null}
    </section>
  );
}

// ---------------------------------------------------------------- messages
/** The conversation with the load's driver, to read and answer without leaving the load. */
export function DriverThread({ load }: Props) {
  const { me, can, notify } = useConsole();
  const driverId = load.assignment?.driver.id;
  const [text, setText] = useState("");
  const thread = useQuery({
    queryKey: [me.organization.id, "conversations", "driver", driverId ?? ""],
    queryFn: () => unwrap(api.POST("/api/v1/conversations", { body: { kind: "driver", driver_id: driverId! } })),
    enabled: !!driverId && can("messages.send"),
  });
  if (!driverId) return <section aria-label="Messages"><Head title="Messages" /><p className="fs13 mu">Assign a driver to message them here.</p></section>;
  if (!can("messages.send")) return null;
  const send = async () => {
    const body = text.trim();
    if (!body || !thread.data) return;
    try {
      await unwrap(api.POST("/api/v1/conversations/{conversation_id}/messages", { params: { path: { conversation_id: thread.data.id } }, body: { body, load_id: load.id } }));
      setText("");
      await thread.refetch();
    } catch (error) {
      notify(errorMessage(error), true);
    }
  };
  const msgs = thread.data?.messages ?? [];
  return (
    <section aria-label="Messages">
      <Head title={`Messages with ${load.assignment!.driver.name}`} />
      <div className="card c g6" style={{ padding: "10px 12px", boxShadow: "none", maxHeight: "320px", overflow: "auto" }}>
        {msgs.slice(-20).map((m) => (
          <div key={m.id} className="c" style={{ alignItems: m.direction === "out" ? "flex-end" : "flex-start" }}>
            <span className="fs13" style={{ padding: "6px 10px", borderRadius: "10px", background: m.direction === "out" ? "var(--prit)" : "var(--sf3)", maxWidth: "85%" }}>{m.title ? <b>{`${m.title} · `}</b> : null}{m.body}</span>
            <span className="fs11 mu">{[m.author_name, formatStamp(m.created_at, me.organization.timezone)].filter(Boolean).join(" · ")}</span>
          </div>
        ))}
        {thread.isPending ? <p className="fs12 mu">Loading…</p> : !msgs.length ? <p className="fs12 mu">No messages yet.</p> : null}
      </div>
      <div className="r g6" style={{ marginTop: "8px" }}>
        <input className="inp sm f1" placeholder={`Message ${load.assignment!.driver.name}`} aria-label="Message the driver" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} />
        <button className="btn xs pri" onClick={() => void send()} disabled={!text.trim()}>Send</button>
      </div>
    </section>
  );
}
