"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { useAction } from "@/features/console/use-action";
import { useUpload, viewDocument } from "@/features/documents/use-upload";
import { useOpenConversation } from "@/features/messages/use-message";
import { api, unwrap } from "@/lib/api/client";
import { formatStamp, todayIn } from "@/lib/format/dates";
import { formatNumber, place } from "@/lib/format/text";
import type { DocumentType } from "@/lib/upload";
import { StatusMenu, useLoadActions } from "./load-actions";
import { useLoad, useLoadDocuments } from "./load-data";
import { alertOf, appointment, equipmentLabel, financials, paperwork, riskOf, statusOf, stopStates, type LoadAlert } from "./load-view";
import { usePodRequest } from "./use-pod-request";
import { ActivityFeed, CheckCalls, DriverThread, InvoiceChecklist, MoneyCard, ReeferCard, RepeatCard, StopsEditor, TrackingLinkCard } from "./load-sections";

type Tab = "overview" | "stops" | "money" | "tracking" | "documents" | "messages" | "activity";

/** "2 min ago", "3 h ago", "Nov 12". */
export function sinceNow(iso: string): string {
  const gone = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (gone < 1) return "just now";
  if (gone < 60) return `${gone} min ago`;
  if (gone < 24 * 60) return `${Math.floor(gone / 60)} h ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

/** How fresh the hauling truck's position is, for the truck's card. */
export function positionLine(position: { freshness: string; recorded_at?: string | null } | null | undefined): string {
  if (!position) return "";
  if (position.freshness === "live") return "Telematics live";
  if (position.freshness === "none" || !position.recorded_at) return "No position yet";
  return `Last position ${sinceNow(position.recorded_at)}`;
}

/** Load details in a side drawer, opened from the loads list. */
export function LoadDrawer() {
  const { me, state, closeDrawer, noFin, fin, user, can, set, notify } = useConsole();
  const run = useAction();
  const upload = useUpload();
  const message = useOpenConversation();
  const requestPod = usePodRequest();
  const [menu, setMenu] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const id = typeof state.drawer === "string" ? state.drawer : null;
  const query = useLoad(id);
  const documents = useLoadDocuments(id);
  const load = query.data;
  const actions = useLoadActions(load);
  const driverId = load?.assignment?.driver.id;
  const driver = useQuery({ queryKey: [me.organization.id, "drivers", "detail", driverId ?? ""], queryFn: () => unwrap(api.GET("/api/v1/drivers/{item_id}", { params: { path: { item_id: driverId! } } })), enabled: !!driverId && can("drivers.read") });
  if (!id) return null;
  const zone = me.organization.timezone;
  const full = () => set({ screen: "load", loadId: id, drawer: null, overlay: "none", modal: "none" });

  if (!load) {
    return (
      <>
        <div className="scrim" onClick={closeDrawer}></div>
        <aside className="drawer" aria-label="Load details">
          <div className="r" style={{ padding: "12px 12px 0 20px", flex: "none" }}>
            <span className="sp"></span>
            <button className="btn ghost icon" onClick={closeDrawer} aria-label="Close"><Icon d="M18 6L6 18M6 6l12 12" /></button>
          </div>
          {query.isError ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : <Skeleton rows={8} />}
        </aside>
      </>
    );
  }

  const status = statusOf(load);
  const risk = riskOf(load);
  const alert = alertOf(load, zone, { notify: can("messages.send"), requestPod: can("loads.update", "loads.close") });
  const stops = stopStates(load, undefined, zone);
  const money = financials(load);
  const papers = paperwork(load, documents.data?.items ?? []);
  const assignment = load.assignment;
  const notifyCustomer = () => void message({ customerId: load.customer.id });
  const act = (alert: LoadAlert) => () => (alert.act === "assign" ? actions.start("assign") : alert.act === "release" ? actions.start("release") : alert.act === "ready" ? actions.start("mark_ready") : alert.act === "pod" ? actions.start("approve_pod") : alert.act === "notify" ? notifyCustomer() : alert.act === "request_pod" ? void requestPod(load.id) : undefined);
  // A time today reads as the clock, another day with its date.
  const today = todayIn(zone);
  const dayOf = new Intl.DateTimeFormat("en-CA", { timeZone: zone });
  const at = (iso: string | null | undefined) => (iso ? (dayOf.format(new Date(iso)) === today ? formatStamp(iso, zone).split(" · ")[1] : formatStamp(iso, zone)) : "");
  const askForRates = () => void run(() => unwrap(api.POST("/api/v1/access-requests", { body: { permission: "loads.rates.read", context: `load ${load.load_number}` } })), (out) => (out.already ? `You’ve already asked ${out.admins.join(" and ")}` : `Asked ${out.asked.join(" and ")} for access to rates`));
  const more: [label: string, go: () => void][] = [
    ["Print BOL", () => window.open(`/api/v1/loads/bols.pdf?ids=${load.id}`, "_blank", "noopener")],
    ["Copy link", () => void navigator.clipboard?.writeText(`${window.location.origin}/${me.organization.slug}/loads/${load.id}`).then(() => notify("Link copied"), () => notify("Couldn’t copy the link", true))],
    ...(assignment && can("messages.send") ? [["Message driver", () => void message({ driverId: assignment.driver.id })] as [string, () => void]] : []),
    ...(can("messages.send") ? [["Message customer", notifyCustomer] as [string, () => void]] : []),
  ];
  const primary = actions.has("approve_pod") ? { label: "Review POD", go: () => actions.start("approve_pod") } : actions.has("assign") ? { label: "Assign driver", go: () => actions.start("assign") } : actions.has("dispatch") ? { label: "Dispatch", go: () => actions.start("dispatch") } : { label: "Open full page", go: full };

  return (
    <>
      <div className="scrim" onClick={closeDrawer}></div>
      <aside className="drawer" aria-label="Load details">
        <div style={{ padding: "16px 20px 0", flex: "none", borderBottom: "1px solid var(--bd)" }}>
          <div className="r g8">
            <span className="mono fs13 w5 t2">{load.load_number}</span>
            <span className="badge" data-k={status.tone}>
              <i></i>
              {status.label}
            </span>
            {risk ? (
              <span className="risk" data-k={risk.tone}>
                <Icon className="s14" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
                {risk.label}
              </span>
            ) : null}
            <span className="sp"></span>
            <button className="btn ghost icon" onClick={full} aria-label="Open full page">
              <Icon className="s14" d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </button>
            <div className="dd">
              <button className="btn ghost icon" onClick={() => setMenu(!menu)} aria-label="More" aria-haspopup="menu" aria-expanded={menu}>
                <Icon className="s14" d="M5 12h.01M12 12h.01M19 12h.01" />
              </button>
              {menu ? (
                <>
                  <div className="ddcatch" onClick={() => setMenu(false)}></div>
                  <div className="ddl" role="menu" style={{ left: "auto", right: "0", width: "200px" }}>
                    {more.map(([label, go]) => (
                      <button key={label} className="ddi" role="menuitem" onClick={() => { setMenu(false); go(); }}>{label}</button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            <button className="btn ghost icon" onClick={closeDrawer} aria-label="Close"><Icon d="M18 6L6 18M6 6l12 12" /></button>
          </div>
          <h2 style={{ margin: "10px 0 2px", fontSize: "18px", lineHeight: "24px", fontWeight: "600", letterSpacing: "-0.01em" }}>{place(load.origin_city, load.origin_state)}{" → "}{place(load.destination_city, load.destination_state)}</h2>
          <div className="fs13 mu">{[load.customer.name, load.reference, load.miles ? `${formatNumber(load.miles)} mi` : "", equipmentLabel(load.equipment_type)].filter(Boolean).join(" · ")}</div>
          {alert ? (
            <div className="banner" data-k={alert.tone} style={{ marginTop: "14px" }}>
              <Icon d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
              <div className="f1">
                <div className="bt">{alert.title}</div>
                <div>{alert.text}</div>
              </div>
              {alert.button ? <button className="btn sm" onClick={act(alert)}>{alert.button}</button> : null}
            </div>
          ) : null}
          <div className="r g16" role="tablist" aria-label="Load sections" style={{ marginTop: "12px", overflowX: "auto" }}>
            {([["overview", "Overview"], ["stops", "Stops"], ["money", "Money"], ["tracking", "Tracking"], ["documents", "Documents"], ["messages", "Messages"], ["activity", "Activity"]] as const).map(([k, l]) => (
              <button key={k} className={clsx("dtab", tab === k && "on")} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {l}
                {k === "documents" ? <span className="mono fs11 tc" data-k={papers.tone}>{`${papers.have}/${papers.need}`}</span> : null}
                {k === "money" && noFin ? <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" /> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="c g20" style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "18px 20px 20px" }}>
          {tab === "stops" ? <StopsEditor load={load} /> : null}
          {tab === "money" && fin ? <MoneyCard load={load} /> : null}
          {tab === "money" && fin ? <InvoiceChecklist load={load} start={actions.start} /> : null}
          {tab === "tracking" ? <TrackingLinkCard load={load} /> : null}
          {tab === "tracking" ? <CheckCalls load={load} /> : null}
          {tab === "tracking" ? <ReeferCard load={load} /> : null}
          {tab === "messages" ? <DriverThread load={load} /> : null}
          {tab === "activity" ? <ActivityFeed load={load} /> : null}
          {tab === "overview" ? (
          <div>
            <div className="over" style={{ marginBottom: "10px" }}>Stops</div>
            {stops.map((s, i) => (
              <div key={s.stop.id} className="stop">
                <div className="c" style={{ alignItems: "center" }}>
                  <span className="smk" data-k={s.done ? "ok" : s.here ? "brand" : ""}>
                    {s.done || s.here ? (
                      <Icon className="s12 b" d="M5 12l5 5 9-10" />
                    ) : (
                      <span>{i + 1}</span>
                    )}
                  </span>
                  <span className={clsx("sline", i === stops.length - 1 ? "none" : s.done ? "ok" : "")}></span>
                </div>
                <div style={{ paddingBottom: "16px" }} className="mw0">
                  <div className="over" style={{ letterSpacing: ".04em" }}><span>{s.kind}</span></div>
                  <div className="fs14 w5"><span>{s.stop.name || s.where}</span></div>
                  <div className="fs12 mu num"><span>{s.where}</span>{" · Appt "}<span>{appointment(s.stop, zone)}</span></div>
                </div>
                <div className="fs12 w5 tc num nw rt" data-k={s.done ? "ok" : s.here ? "brand" : "mu"} style={{ paddingTop: "16px" }}>
                  <span>{s.done ? (s.kind === "Pickup" ? `Departed ${at(s.stop.departed_at)}` : "Delivered") : s.here ? `Arrived ${at(s.stop.arrived_at)}` : s.label}</span>
                </div>
              </div>
            ))}
          </div>
          ) : null}
          {tab === "overview" ? (
          <div>
            <div className="over" style={{ marginBottom: "10px" }}>Assignment</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "8px" }}>
              {[
                { k: "Driver", v: assignment?.driver.name ?? "Unassigned", tk: assignment ? "" : "warn", sub: assignment ? (driver.data?.phone ?? "") : "Select a driver" },
                { k: "Truck", v: assignment?.vehicle.name ?? "—", tk: "", sub: assignment ? positionLine(load.position) : "Not assigned" },
                { k: "Trailer", v: assignment?.trailer?.name ?? "—", tk: "", sub: equipmentLabel(load.equipment_type) },
              ].map((x) => (
                <div key={x.k} className="card" style={{ padding: "10px 12px", boxShadow: "none" }}>
                  <div className="fs12 mu"><span>{x.k}</span></div>
                  <div className="fs13 w5 tc" data-k={x.tk} style={{ marginTop: "2px" }}><span>{x.v}</span></div>
                  <div className="fs12 mu ell"><span>{x.sub}</span></div>
                </div>
              ))}
            </div>
          </div>
          ) : null}
          {tab === "overview" && fin ? <InvoiceChecklist load={load} start={actions.start} /> : null}
          {tab === "overview" || tab === "money" ? (
          <div hidden={tab === "money" && fin}>
            <div className="over r g6" style={{ marginBottom: "10px" }}>
              Financials
              {noFin ? (
                <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
              ) : null}
            </div>
            {fin ? (
              <div className="card oh" style={{ boxShadow: "none" }}>
                {money.rows.map((f, i) => (
                  <div key={i} className="r jb fs13" style={{ padding: "8px 12px", borderBottom: "1px solid var(--bd2)" }}>
                    <span className="t3"><span>{f.k}</span></span>
                    <span className="mono num"><span>{f.v}</span></span>
                  </div>
                ))}
                <div className="r jb fs13 w6" style={{ padding: "10px 12px", background: "var(--sf2)" }}>
                  <span>
                    {"Total "}
                    <span className="fs12 mu" style={{ fontWeight: "400" }}>{`· ${money.perMile}/mi · ${load.invoice ? `on invoice ${load.invoice.invoice_number ?? "draft"}` : "not yet invoiced"}`}</span>
                  </span>
                  <span className="mono num">{money.total}</span>
                </div>
              </div>
            ) : null}
            {noFin ? (
              <div className="r g12" style={{ padding: "12px 14px", border: "1px dashed var(--bd3)", borderRadius: "8px", background: "var(--sf2)" }}>
                <span className="eqic"><Icon className="s14" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" /></span>
                <div className="f1">
                  <div className="fs13 w5">Financials are restricted</div>
                  <div className="fs12 mu">Your role (<span>{user.role}</span>) can’t view rates, pay or margins. The server doesn’t send them.</div>
                </div>
                <button className="btn sm" onClick={askForRates}>Request access</button>
              </div>
            ) : null}
          </div>
          ) : null}
          {tab === "overview" || tab === "documents" ? (
          <div>
            <div className="over" style={{ marginBottom: "10px" }}>Documents</div>
            <div className="card oh" style={{ boxShadow: "none" }}>
              {papers.papers.map((paper, i) => (
                <div key={i} className="r g10" style={{ padding: "8px 12px", borderBottom: "1px solid var(--bd2)" }}>
                  <Icon className="mu" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" />
                  <span className="f1 fs13 ell"><span>{paper.label}</span></span>
                  <span className="risk" data-k={paper.tone}>
                    <span className="dot"></span>
                    <span>{paper.state}</span>
                  </span>
                  {paper.document ? (
                    <button className="lnk" style={{ width: "56px", textAlign: "right" }} onClick={() => viewDocument(paper.document!.id)}>View</button>
                  ) : can("documents.upload") ? (
                    <button className="lnk" style={{ width: "56px", textAlign: "right" }} onClick={() => void upload({ type: paper.type as DocumentType, entityType: "load", entityId: load.id, label: paper.label })}>Upload</button>
                  ) : (
                    <span style={{ width: "56px" }}></span>
                  )}
                </div>
              ))}
            </div>
          </div>
          ) : null}
          {tab === "overview" ? <RepeatCard load={load} /> : null}
          {tab === "overview" ? <ActivityFeed load={load} limit={5} /> : null}
        </div>
        <div className="dfoot">
          <span className="fs12 mu" title={formatStamp(load.updated_at, zone)}>{`Updated ${sinceNow(load.updated_at)} · v${load.version}`}</span>
          <span className="sp"></span>
          <StatusMenu items={actions.items} start={actions.start} up />
          <button className="btn pri" onClick={primary.go}>{primary.label}</button>
        </div>
      </aside>
      {actions.dialog}
    </>
  );
}
