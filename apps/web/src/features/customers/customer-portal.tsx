"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { signOut } from "@/features/auth/switch-organization";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { equipmentLabel } from "@/features/loads/load-view";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { timeZoneLabel } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { useMinuteClock } from "@/lib/time/clock";

type Shipment = Schema<"CustomerShipment">;
type Detail = Schema<"CustomerShipmentDetail">;
type Paper = Schema<"CustomerDocument">;
type Tab = "shipments" | "documents" | "invoices";
type View = "active" | "delivered" | "all";

const STATES: Record<Shipment["state"], [label: string, tone: string]> = {
  scheduled: ["Scheduled", "info"], at_pickup: ["At pickup", "atpickup"], in_transit: ["In transit", "transit"],
  delivered: ["Delivered", "ok"], on_hold: ["On hold", "hold"], cancelled: ["Cancelled", "cancelled"],
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const DOC = "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5";
const SHIELD = "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4";

/** The road on the map, as one curve: where the truck is along it, by how far along the trip it is. */
const P0 = [70, 160], P1 = [380, 150], P2 = [690, 42];
const at = (t: number) => [0, 1].map((k) => (1 - t) ** 2 * P0[k]! + 2 * (1 - t) * t * P1[k]! + t ** 2 * P2[k]!) as [number, number];
const split = (t: number) => {
  const a = [0, 1].map((k) => P0[k]! + (P1[k]! - P0[k]!) * t);
  const b = [0, 1].map((k) => P1[k]! + (P2[k]! - P1[k]!) * t);
  const m = at(t);
  return { done: `M${P0[0]} ${P0[1]} Q ${a[0]} ${a[1]}, ${m[0]} ${m[1]}`, rest: `M${m[0]} ${m[1]} Q ${b[0]} ${b[1]}, ${P2[0]} ${P2[1]}`, m };
};

/**
 * The shipment portal: a customer's own shipments, with where the truck is while their freight is on it, the
 * papers the carrier shares, their invoices, and a way to write to dispatch. `customerId` previews it for staff.
 */
export function CustomerPortal({ customerId }: { customerId?: string }) {
  const { notify } = useConsole();
  const preview: Record<string, string> = customerId ? { customer_id: customerId } : {};
  const [tab, setTab] = useState<Tab>("shipments");
  const [view, setView] = useState<View>("active");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const home = useQuery({ queryKey: ["portal", customerId ?? "me"], queryFn: () => unwrap(api.GET("/api/v1/portal/customer", { params: { query: preview } })) });
  const list = useQuery({ queryKey: ["portal", customerId ?? "me", "shipments", view, q.trim()], queryFn: () => unwrap(api.GET("/api/v1/portal/customer/shipments", { params: { query: { ...preview, view, ...(q.trim() ? { q: q.trim() } : {}) } } })), enabled: tab === "shipments", placeholderData: (previous) => previous });
  const shipments = list.data ?? [];
  const chosen = picked && shipments.some((s) => s.id === picked) ? picked : shipments[0]?.id ?? null;
  const detail = useQuery({ queryKey: ["portal", customerId ?? "me", "shipment", chosen], queryFn: () => unwrap(api.GET("/api/v1/portal/customer/shipments/{load_id}", { params: { path: { load_id: chosen! }, query: preview } })), enabled: tab === "shipments" && !!chosen });
  const zone = home.data?.timezone ?? "UTC";

  const local = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: zone });
  const clock = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("en-US", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false }) : "");
  const now = useMinuteClock();
  // Until the clock has ticked once (the first paint), days read as dates.
  const today = now === null ? "" : new Date(now).toLocaleDateString("en-CA", { timeZone: zone });
  const tomorrow = now === null ? "" : new Date(now + 86_400_000).toLocaleDateString("en-CA", { timeZone: zone });
  /** "today", "tomorrow" or "Nov 12" for an instant, in the carrier's time. */
  const day = (iso: string | null | undefined) => {
    if (!iso) return "";
    const d = local(iso);
    return d === today ? "today" : d === tomorrow ? "tomorrow" : `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
  };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const when = (s: Shipment) => {
    if (s.state === "delivered") return `Delivered ${day(s.delivered_at)}${s.delivered_at ? ` · ${clock(s.delivered_at)}` : ""} · ${s.pod_available ? "POD available" : "POD to come"}`;
    if (s.state === "cancelled") return "Cancelled";
    if (s.state === "on_hold") return "On hold · dispatch will update you";
    if (s.state === "scheduled") return `Pickup ${day(s.pickup_at)} ${clock(s.pickup_at)}${s.delivery_at ? ` · delivery ${day(s.delivery_at) === day(s.pickup_at) ? "" : `${day(s.delivery_at)} `}${clock(s.delivery_at)}` : ""}`.trim();
    if (s.state === "at_pickup") return `At pickup · delivery ${day(s.delivery_at)} ${clock(s.delivery_at)}`.trim();
    return `Delivery ${day(s.delivery_at)}${s.eta ? ` · ETA ${clock(s.eta)}${s.delivery_at ? ` (appt ${clock(s.delivery_at)})` : ""}` : s.delivery_at ? ` · appt ${clock(s.delivery_at)}` : ""}`;
  };
  const download = async (paper: Paper) => {
    try {
      const query = new URLSearchParams(preview).toString();
      const response = await fetch(`/api/v1/portal/customer/documents/${paper.id}/download${query ? `?${query}` : ""}`, { credentials: "same-origin" });
      if (!response.ok) throw new Error("The file couldn’t be downloaded");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = paper.filename ?? `${paper.label}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };

  const h = home.data;
  return (
    <div className="portal">
      <header className="ptop">
        <div className="r g10">
          <span className="orgmk" style={{ background: "#E8A317", width: "30px", height: "30px" }}>{h ? initials(h.carrier) : ""}</span>
          <div className="c">
            <span className="fs14 w6">{h?.carrier ?? ""}</span>
            <span className="fs11 mu">{h?.preview ? "Shipment portal · preview" : "Shipment portal"}</span>
          </div>
        </div>
        <nav className="r g4" style={{ marginLeft: "28px" }} aria-label="Portal">
          {(["shipments", "documents", "invoices"] as Tab[]).map((t) => (
            <button key={t} className={clsx("ptab", tab === t && "on")} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>{cap(t)}</button>
          ))}
        </nav>
        <span className="sp"></span>
        <span className="fs12 mu">{h?.customer ?? ""}</span>
        {h && !h.preview ? (
          <button className="av md" title={`${h.user_name} · sign out`} aria-label="Sign out" onClick={() => void signOut()}>{initials(h.user_name)}</button>
        ) : h ? <span className="av md">{initials(h.customer)}</span> : null}
      </header>
      {home.isError ? <div className="pbody"><ErrorState error={home.error} retry={() => void home.refetch()} /></div> : null}
      {tab === "shipments" && h ? (
        <div className="pbody">
          <section className="c g10" style={{ minHeight: "0" }}>
            <div className="r g8">
              <h1 className="h1" style={{ fontSize: "18px" }}>Shipments</h1>
              <span className="sp"></span>
              <label className="search" style={{ width: "200px" }}>
                <Icon className="s14" d={I.search} />
                <input placeholder="PO or load number" aria-label="Search shipments" value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
            </div>
            <div className="seg sm" style={{ alignSelf: "flex-start" }} role="group" aria-label="Which shipments">
              {([["active", `Active · ${h.active}`], ["delivered", "Delivered"], ["all", "All"]] as [View, string][]).map(([v, l]) => (
                <button key={v} className={clsx(view === v && "on")} aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>
              ))}
            </div>
            {list.isPending ? <Skeleton /> : null}
            {list.data && !shipments.length ? <EmptyState icon={I.loads} title={q.trim() ? "No shipment matches" : view === "active" ? "Nothing on the road for you right now" : "No shipments here yet"} text={q.trim() ? "Search by your PO or the carrier’s load number." : `Shipments ${h.carrier} books for ${h.customer} show here.`} /> : null}
            {shipments.map((s) => (
              <button key={s.id} className={clsx("pship", s.id === chosen && "on")} onClick={() => setPicked(s.id)} aria-pressed={s.id === chosen}>
                <div className="r g8">
                  <span className="mono fs12 w5 t2">{s.load_number}</span>
                  {s.reference ? <span className="fs12 mu">{s.reference}</span> : null}
                  <span className="sp"></span>
                  <span className="badge" data-k={STATES[s.state][1]}><i></i>{STATES[s.state][0]}</span>
                </div>
                <div className="fs14 w5 tx" style={{ marginTop: "6px" }}>{`${s.origin} → ${s.destination}`}</div>
                <div className="fs12 mu num" style={{ marginTop: "2px" }}>{when(s)}</div>
              </button>
            ))}
          </section>
          <section className="card oh c" style={{ minHeight: "0" }}>
            {detail.data ? (
              <ShipmentView d={detail.data} carrier={h.carrier} customer={h.customer} clock={clock} day={day} zoneLabel={timeZoneLabel(zone)} onWrite={h.preview ? null : () => setWriting(true)} onDownload={(p) => void download(p)} />
            ) : chosen ? <Skeleton /> : <EmptyState icon={I.loads} title="No shipment picked" text="Pick a shipment to see where it is, its stops and its papers." />}
          </section>
        </div>
      ) : null}
      {tab === "documents" && h ? <PortalDocuments preview={preview} carrier={h.carrier} day={day} onDownload={(p) => void download(p)} /> : null}
      {tab === "invoices" && h ? <PortalInvoices preview={preview} /> : null}
      {writing && h ? <ContactDispatch carrier={h.carrier} shipment={detail.data ?? null} onClose={() => setWriting(false)} clock={clock} day={day} /> : null}
    </div>
  );
}

function ShipmentView({ d, carrier, customer, clock, day, zoneLabel, onWrite, onDownload }: { d: Detail; carrier: string; customer: string; clock: (iso: string | null | undefined) => string; day: (iso: string | null | undefined) => string; zoneLabel: string; onWrite: (() => void) | null; onDownload: (p: Paper) => void }) {
  const [label, tone] = STATES[d.state];
  const pickup = d.stops.find((s) => s.type === "pickup");
  const delivery = [...d.stops].reverse().find((s) => s.type === "delivery");
  const late = d.late_by_minutes > 0 && d.eta;
  const progress = d.state === "delivered" ? 1 : d.position ? d.position.progress : d.state === "scheduled" || d.state === "at_pickup" ? 0 : null;
  const road = progress === null ? null : split(Math.max(0.02, Math.min(0.98, progress)));
  return (
    <>
      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--bd2)" }}>
        <div className="r g8">
          <span className="mono fs13 w5 t2">{d.load_number}</span>
          {d.reference ? <span className="fs12 mu">{d.reference}</span> : null}
          <span className="badge" data-k={tone}><i></i>{label}</span>
          <span className="sp"></span>
          {onWrite ? <button className="btn sm" onClick={onWrite}><Icon className="s14" d={I.msg} />Contact dispatch</button> : null}
        </div>
        <h2 style={{ fontSize: "20px", lineHeight: "26px", fontWeight: 600, marginTop: "8px" }}>{`${d.origin} → ${d.destination}`}</h2>
      </div>
      <div style={{ padding: "16px 20px", overflow: "auto" }} className="c g16">
        {d.update || late ? (
          <div className="banner" data-k={late ? "late" : "info"}>
            <Icon d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2" />
            <div className="f1">
              <div className="bt">{late ? `Delivery estimate: ${clock(d.eta)} ${zoneLabel}` : `Update from ${carrier}`}</div>
              <div>
                {late && d.delivery_at ? `Your appointment is ${clock(d.delivery_at)}. ` : ""}
                {d.update ? `${d.update.body} Updated ${clock(d.update.at)} ${zoneLabel} by ${carrier}.` : ""}
              </div>
            </div>
          </div>
        ) : null}
        <div className="pmile">
          {d.milestones.map((m) => (
            <div key={m.key} className={clsx("lcs", m.done && "done", m.current && "cur")}>
              <span className="lcd">{m.done ? <Icon className="s12 b" d="M5 12l5 5 9-10" /> : null}</span>
              <span className="lcl">{m.label}</span>
              <span className="lct">{m.at ? (m.key === "booked" ? day(m.at) : `${m.expected && !m.done ? (m.key === "in_transit" ? "ETA " : "") : ""}${day(m.at) === "today" ? "" : `${day(m.at)} `}${clock(m.at)}`.trim()) : ""}</span>
            </div>
          ))}
        </div>
        <div className="lpmap" style={{ borderRadius: "10px", border: "1px solid var(--bd)", height: "180px" }}>
          <svg viewBox="0 0 760 200" preserveAspectRatio="none" aria-hidden="true" className="lpsvg">
            <path className="mroad" d={`M${P0[0]} ${P0[1]} Q ${P1[0]} ${P1[1]}, ${P2[0]} ${P2[1]}`}></path>
            {road && progress! > 0 ? <path className="mdone" d={d.state === "delivered" ? `M${P0[0]} ${P0[1]} Q ${P1[0]} ${P1[1]}, ${P2[0]} ${P2[1]}` : road.done}></path> : null}
            {road && d.state !== "delivered" ? <path className="mrest" d={progress! > 0 ? road.rest : `M${P0[0]} ${P0[1]} Q ${P1[0]} ${P1[1]}, ${P2[0]} ${P2[1]}`}></path> : null}
          </svg>
          <span className="mpin" style={{ left: `${P0[0]}px`, top: `${P0[1]}px` }} data-k="ok" title={d.origin}></span>
          <span className="mpin" style={{ left: `${P2[0]}px`, top: `${P2[1]}px` }} data-k="brand" title={d.destination}></span>
          {d.position && road ? (
            <>
              <span className="mtruck" style={{ left: `${road.m[0]}px`, top: `${road.m[1]}px` }}><Icon className="s12 fill" d="M12 2l7 19-7-4-7 4z" /></span>
              <span className="mlab" style={{ left: `${Math.max(10, road.m[0] - 52)}px`, top: `${road.m[1] + 20}px` }}>{`${d.position.place} · ${clock(d.position.at)}`}</span>
            </>
          ) : (
            <span className="mlab" style={{ left: "300px", top: "128px" }}>
              {d.state === "delivered" ? `Delivered ${day(d.delivered_at)} ${clock(d.delivered_at)}` : d.state === "in_transit" ? "Where the truck is will show when it next reports in" : d.state === "scheduled" ? "Not picked up yet" : label}
            </span>
          )}
        </div>
        <div className="pgrid2">
          <div className="card" style={{ padding: "12px 14px", boxShadow: "none" }}>
            <div className="over" style={{ marginBottom: "8px" }}>Stops</div>
            <dl className="kv" style={{ fontSize: "12px" }}>
              <dt>Pickup</dt>
              <dd>{[pickup?.name || pickup?.place, pickup?.departed_at ? `picked up ${day(pickup.departed_at) === "today" ? "" : `${day(pickup.departed_at)} `}${clock(pickup.departed_at)}` : pickup?.appt_start ? `appt ${day(pickup.appt_start) === "today" ? "" : `${day(pickup.appt_start)} `}${clock(pickup.appt_start)}` : ""].filter(Boolean).join(" · ")}</dd>
              <dt>Delivery</dt>
              <dd>{[delivery?.name || delivery?.place, delivery?.arrived_at ? `arrived ${clock(delivery.arrived_at)}` : delivery?.appt_start ? `appt ${day(delivery.appt_start) === "today" ? "" : `${day(delivery.appt_start)} `}${clock(delivery.appt_start)}` : ""].filter(Boolean).join(" · ")}</dd>
              <dt>Equipment</dt>
              <dd>{equipmentLabel(d.equipment_type)}</dd>
            </dl>
          </div>
          <div className="card" style={{ padding: "12px 14px", boxShadow: "none" }}>
            <div className="over" style={{ marginBottom: "8px" }}>Documents</div>
            <div className="c g8">
              {d.documents.map((p) => (
                <div key={p.type} className={clsx("r g8 fs13", !p.available && "mu")}>
                  <Icon className={clsx("s14", p.available && "mu")} d={DOC} />
                  <span className="f1">{p.label}</span>
                  {p.available ? <button className="lnk" onClick={() => onDownload(p)}>Download</button> : <span className="fs12">{p.note}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="note"><Icon className="s14" d={SHIELD} />{`You see shipments ${carrier} shares with ${customer}. Rates and driver details aren’t shared.`}</p>
      </div>
    </>
  );
}

function PortalDocuments({ preview, carrier, day, onDownload }: { preview: Record<string, string>; carrier: string; day: (iso: string | null | undefined) => string; onDownload: (p: Paper) => void }) {
  const docs = useQuery({ queryKey: ["portal", preview.customer_id ?? "me", "documents"], queryFn: () => unwrap(api.GET("/api/v1/portal/customer/documents", { params: { query: preview } })) });
  const cols = "minmax(0,1.2fr) 120px minmax(0,1.4fr) 100px 96px";
  return (
    <div className="pbody" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
      <section className="card oh">
        <div className="ch"><h2 className="h2">Documents</h2><span className="fs12 mu">{`Bills of lading, and proofs of delivery once ${carrier} has checked them`}</span></div>
        {docs.isPending ? <Skeleton /> : null}
        {docs.data && !docs.data.length ? <EmptyState icon={I.file} title="No documents yet" text="Papers show here as your shipments are picked up and delivered." /> : null}
        {docs.data?.length ? (
          <>
            <div className="thead" style={{ gridTemplateColumns: cols }}><span>Document</span><span>Shipment</span><span>File</span><span>Added</span><span></span></div>
            {docs.data.map((p) => (
              <div key={p.id} className="trow" style={{ gridTemplateColumns: cols, cursor: "default" }}>
                <div className="td"><span className="w5">{p.label}</span></div>
                <div className="td"><span className="mono fs12">{p.load_number}</span></div>
                <div className="td mw0"><span className="ell t2">{p.filename}</span></div>
                <div className="td"><span className="num t3">{day(p.at)}</span></div>
                <div className="td rt"><button className="btn xs" onClick={() => onDownload(p)}>Download</button></div>
              </div>
            ))}
          </>
        ) : null}
      </section>
    </div>
  );
}

function PortalInvoices({ preview }: { preview: Record<string, string> }) {
  const bills = useQuery({ queryKey: ["portal", preview.customer_id ?? "me", "invoices"], queryFn: () => unwrap(api.GET("/api/v1/portal/customer/invoices", { params: { query: preview } })) });
  const cols = "120px 100px 100px minmax(0,1fr) 120px 120px 110px";
  const date = (d: string | null) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}` : "—");
  return (
    <div className="pbody" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
      <section className="card oh">
        <div className="ch"><h2 className="h2">Invoices</h2><span className="fs12 mu">What has been billed, and what is still open</span></div>
        {bills.isPending ? <Skeleton /> : null}
        {bills.data && !bills.data.length ? <EmptyState icon={I.invoice} title="No invoices yet" text="Invoices show here once they are issued." /> : null}
        {bills.data?.length ? (
          <>
            <div className="thead" style={{ gridTemplateColumns: cols }}><span>Invoice</span><span>Issued</span><span>Due</span><span>Shipments</span><span className="rt">Amount</span><span className="rt">Balance</span><span>Status</span></div>
            {bills.data.map((b) => (
              <div key={b.id} className="trow" style={{ gridTemplateColumns: cols, cursor: "default" }}>
                <div className="td"><span className="mono w5">{b.invoice_number}</span></div>
                <div className="td"><span className="num t3">{date(b.issue_date)}</span></div>
                <div className="td"><span className="num t3">{date(b.due_date)}</span></div>
                <div className="td mw0"><span className="ell mono fs12 t2">{b.loads.join(", ") || "—"}</span></div>
                <div className="td rt"><span className="mono w5 num">{formatMoney(b.total, b.currency)}</span></div>
                <div className="td rt"><span className={clsx("mono w5 num", Number(b.balance) === 0 && "mu")}>{formatMoney(b.balance, b.currency)}</span></div>
                <div className="td"><span className="badge" data-k={b.status === "paid" ? "ok" : b.status === "overdue" ? "bad" : "info"}><i></i>{b.status === "paid" ? "Paid" : b.status === "overdue" ? "Overdue" : "Open"}</span></div>
              </div>
            ))}
          </>
        ) : null}
      </section>
    </div>
  );
}

function ContactDispatch({ carrier, shipment, onClose, clock, day }: { carrier: string; shipment: Detail | null; onClose: () => void; clock: (iso: string | null | undefined) => string; day: (iso: string | null | undefined) => string }) {
  const client = useQueryClient();
  const thread = useQuery({ queryKey: ["portal", "me", "messages"], queryFn: () => unwrap(api.GET("/api/v1/portal/customer/messages")) });
  const [body, setBody] = useState("");
  const [about, setAbout] = useState(!!shipment);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const send = async () => {
    if (!body.trim()) return setProblem("Write a message");
    setPending(true);
    setProblem(null);
    try {
      await unwrap(api.POST("/api/v1/portal/customer/messages", { body: { body: body.trim(), load_id: about && shipment ? shipment.id : null } }));
      setBody("");
      await client.invalidateQueries({ queryKey: ["portal", "me", "messages"] });
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog title={`Contact ${carrier} dispatch`} sub="Your message goes to their dispatchers, who answer here" icon={I.msg} width={540} onClose={onClose}
      footer={<><span className="sp"></span><button className="btn" onClick={onClose} disabled={pending}>Close</button><button className="btn pri" onClick={() => void send()} disabled={pending}>{pending ? "Sending…" : "Send"}</button></>}>
      <Problem message={problem} />
      <div className="c g8" style={{ maxHeight: "260px", overflow: "auto" }}>
        {thread.data && !thread.data.length ? <p className="fs13 mu">No messages yet.</p> : null}
        {thread.data?.map((m) => (
          <div key={m.id} className={clsx("c g2", m.mine && "aiq")} style={m.mine ? undefined : { alignSelf: "flex-start", maxWidth: "85%", padding: "9px 12px", borderRadius: "14px 14px 14px 4px", background: "var(--sf3)", fontSize: "13px", lineHeight: "18px" }}>
            <span>{m.body}</span>
            <span className="fs11" style={{ opacity: 0.75 }}>{`${m.mine ? "You" : m.author} · ${day(m.at)} ${clock(m.at)}${m.load_number ? ` · ${m.load_number}` : ""}`}</span>
          </div>
        ))}
      </div>
      <div className="fld">
        <label htmlFor="portal-msg">Message</label>
        <textarea id="portal-msg" className="inp" rows={3} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} style={{ height: "auto", padding: "8px 10px" }} />
      </div>
      {shipment ? (
        <label className="r g8 fs13"><input type="checkbox" checked={about} onChange={(e) => setAbout(e.target.checked)} />{`About ${shipment.load_number}${shipment.reference ? ` (${shipment.reference})` : ""}`}</label>
      ) : null}
    </Dialog>
  );
}
