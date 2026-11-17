"use client";

import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { clsx } from "clsx";
import { cell } from "@/components/data-table/cell";
import { BasicCell } from "@/components/data-table/cells";
import { EmptyState, ErrorState, FilteredEmpty, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { addOf, goTo } from "@/features/console/shell";
import { LOAD_TABS } from "@/features/lists/tabs";
import { BulkBar, ColumnsButton, ExportButton, FilterChips, PageSize, Pager } from "@/features/lists/list-screen";
import { cellText, useList, type ListQuery } from "@/features/lists/use-list";
import type { Cell } from "@/features/console/view";
import { LoadDrawer } from "@/features/loads/load-drawer";
import { api, unwrap } from "@/lib/api/client";
import { formatDate, formatStamp, timeZoneLabel, todayIn } from "@/lib/format/dates";
import { formatWholeMoney, toCents } from "@/lib/format/money";
import { place, plural } from "@/lib/format/text";
import type { LoadListItem } from "./load-data";
import { BulkStatus } from "./bulk-status";
import { statusOf } from "./load-view";
import { SaveViewDialog, useSavedViews, type ViewParams } from "./saved-views";
import { loadLabel } from "@/features/fleet/labels";

const STATUSES = ["draft", "planned", "assigned", "dispatched", "at_pickup", "in_transit", "at_delivery", "delivered", "pod_review", "completed", "on_hold", "cancelled"] as const;

/** "1h 40m", "35m". */
const span = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${Math.max(0, minutes)}m`);
const addDays = (day: string, by: number) => new Date(Date.parse(`${day}T12:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);
const monday = (day: string) => addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
const short = (day: string) => formatDate(day).replace(/, \d{4}$/, "");

/**
 * What to know about a load at a glance, in the order it matters: late or at risk, then how its ETA compares
 * with the appointment, why it is held, or the paper a draft is missing.
 */
function riskCell(l: LoadListItem): Cell {
  const code = l.risks[0]?.code;
  if (code === "UNASSIGNED_SOON" && l.pickup_at) return cell.risk(`No driver · pickup in ${span(Math.round((Date.parse(l.pickup_at) - Date.now()) / 60_000))}`, "warn");
  if (code === "MISSING_POD") return cell.risk("POD missing", "bad");
  if (code === "LATE_PICKUP") return cell.risk("Late pickup", "bad");
  if (code === "LATE_DELIVERY") return cell.risk(l.eta && l.late_by_minutes > 0 ? `ETA +${span(l.late_by_minutes)}` : "Late delivery", "bad");
  if (l.eta) return l.late_by_minutes > 0 ? cell.risk(`ETA +${span(l.late_by_minutes)}`, l.late_by_minutes >= 60 ? "bad" : "late") : cell.risk("On time", "ok");
  if (l.status === "on_hold") return cell.risk(l.hold_reason || "On hold", "warn");
  if (l.status === "draft" && !l.papers.rate_confirmation) return cell.risk("No rate confirmation", "warn");
  return cell.maybe(null);
}

/** Loads list with views, search, selection and the detail drawer. */
export function LoadsScreen() {
  const { me, can, fin, noFin, I, state, set, notify } = useConsole();
  const zone = me.organization.timezone;
  const create = can("loads.create") ? () => set(goTo("newload")) : null;
  const open = (load: LoadListItem) => set({ screen: "loads", drawer: load.id, overlay: "none", modal: "none" });
  const customers = useQuery({ queryKey: [me.organization.id, "customers", "filter"], queryFn: () => unwrap(api.GET("/api/v1/customers", { params: { query: { sort: "name", limit: 100 } } })), enabled: can("customers.read"), staleTime: 60_000 });
  const drawer = typeof state.drawer === "string" ? state.drawer : null;
  // Pickup dates the filter offers, on the company's calendar.
  const today = todayIn(zone);
  const monthStart = `${today.slice(0, 7)}-01`;
  const ranges: Record<string, [label: string, from: string, to: string]> = {
    today: ["Today", today, today],
    tomorrow: ["Tomorrow", addDays(today, 1), addDays(today, 1)],
    week: ["This week", monday(today), addDays(monday(today), 6)],
    next: ["Next week", addDays(monday(today), 7), addDays(monday(today), 13)],
    month: ["This month", monthStart, addDays(`${addDays(monthStart, 32).slice(0, 7)}-01`, -1)],
  };
  const picked = (state.lf && typeof state.lf === "object" ? state.lf : {}) as Record<string, string>;
  const pickupRange = picked.pickup ? ranges[picked.pickup] : undefined;
  const [dialog, setDialog] = useState<{ kind: "status"; loads: LoadListItem[] } | { kind: "view" } | null>(null);
  // Saved views: the list as it is now, named, to come back to.
  const tabIndex = typeof state.ltab === "number" ? state.ltab : 0;
  const current: ViewParams = { tab: LOAD_TABS[tabIndex]?.label ?? LOAD_TABS[0].label, filters: picked, q: typeof state.lq === "string" ? state.lq : "", sort: typeof state.lsort === "string" ? state.lsort : "" };
  const saved = useSavedViews("loads", current);
  const applyView = (params: Partial<ViewParams>) => set({ ltab: Math.max(0, LOAD_TABS.findIndex((t) => t.label === params.tab)), lf: params.filters ?? {}, lq: params.q ?? "", lsort: params.sort ?? "", lpage: [], lsel: [] });
  const plain = tabIndex === 0 && !current.q && !current.sort && !Object.keys(picked).length;

  const list = useList<LoadListItem>({
    key: "loads",
    group: "Operations",
    title: "Loads",
    sub: (total) => `${total === null ? "" : `${plural(total, "load")} · `}${pickupRange ? `${short(pickupRange[1])}${pickupRange[2] !== pickupRange[1] ? ` – ${short(pickupRange[2])}` : ""} · ` : ""}times in ${timeZoneLabel(zone)}`,
    placeholder: "Load #, reference, customer, city",
    fetch: (query: ListQuery) => unwrap(api.GET("/api/v1/loads", { params: { query: query as never } })),
    defaultSort: "-pickup_at",
    tabs: LOAD_TABS,
    bulk: [
      ...(can("dispatch.assign")
        ? [{
            label: "Assign driver",
            // The board's assignment panel opens on the first selected load still waiting for a driver.
            go: (chosen: LoadListItem[]) => {
              const waiting = chosen.find((l) => l.status === "planned");
              if (!waiting) return notify("None of these loads is waiting for a driver", true);
              set({ ...goTo("dispatch"), panel: "assign", assignLoad: waiting.id });
            },
          }]
        : []),
      ...(can("loads.update", "loads.cancel") ? [{ label: "Change status", go: (chosen: LoadListItem[]) => setDialog({ kind: "status", loads: chosen }) }] : []),
      // Bills of lading as a PDF, one page per load, in a new tab to print.
      { label: "Print BOLs", go: (chosen: LoadListItem[]) => window.open(`/api/v1/loads/bols.pdf?${chosen.map((l) => `ids=${encodeURIComponent(l.id)}`).join("&")}`, "_blank", "noopener") },
      "export" as const,
    ],
    noun: "loads",
    filters: [
      { key: "pickup", label: "Pickup", options: Object.entries(ranges).map(([value, [label]]) => ({ value, label })), params: (value) => (ranges[value] ? { pickup_from: ranges[value][1], pickup_to: ranges[value][2] } : {}) },
      { key: "status", label: "Status", options: STATUSES.map((v) => ({ value: v, label: loadLabel(v) })) },
      { key: "customer_id", label: "Customer", options: (customers.data?.items ?? []).map((c) => ({ value: c.id, label: c.name })) },
      { key: "risk", label: "Risk", options: [["at_risk", "At risk"], ["unassigned", "Unassigned"], ["missing_pod", "Missing POD"]].map(([value, label]) => ({ value: value!, label: label! })), params: (value) => ({ view: value }) },
    ],
    open,
    rowClass: (load) => (load.id === drawer ? "sel" : load.status === "cancelled" ? "dim" : ""),
    columns: [
      { label: "Load", width: "148px", cell: (l) => cell.id(l.load_number, () => open(l), l.customer.name) },
      { label: "Status", width: "112px", cell: (l) => cell.badge(statusOf(l).label, statusOf(l).tone) },
      { label: "Risk", width: "150px", cell: riskCell, csv: (l) => cellText(riskCell(l)) },
      { label: "Pickup", width: "minmax(0,1fr)", cell: (l) => cell.text(place(l.origin_city, l.origin_state), l.pickup_at ? formatStamp(l.pickup_at, zone) : "", "", "num") },
      { label: "Delivery", width: "minmax(0,1fr)", cell: (l) => cell.text(place(l.destination_city, l.destination_state), l.delivery_at ? formatStamp(l.delivery_at, zone) : "", "", "num") },
      {
        label: "Driver · equipment",
        width: "minmax(0,1fr)",
        cell: (l) => (l.assignment ? cell.text(l.assignment.driver.name, [l.assignment.vehicle.name, l.assignment.trailer?.name].filter(Boolean).join(" · ")) : l.status === "cancelled" ? cell.maybe(null) : cell.risk("Unassigned", "warn", I.user)),
      },
      ...(fin ? [{ label: "Rate", width: "96px", right: true, cell: (l: LoadListItem) => cell.money(formatWholeMoney(l.revenue, l.currency), l.miles && l.revenue ? `$${((toCents(l.revenue) ?? 0) / 100 / l.miles).toFixed(2)}/mi` : "") }] : []),
      {
        label: "Docs",
        width: "72px",
        cell: (l: LoadListItem) => cell.docs([l.papers.rate_confirmation, l.papers.bol, l.papers.pod].filter(Boolean).length, l.status === "delivered" && !l.papers.pod),
        csv: (l: LoadListItem) => (["Rate confirmation", "BOL", "POD"] as const).filter((_, i) => [l.papers.rate_confirmation, l.papers.bol, l.papers.pod][i]).join(", "),
      },
      { label: "", width: "28px", cell: () => cell.more() },
    ],
    actions: [],
    empty: {
      icon: I.loads,
      title: "No loads yet",
      text: "A load is the unit of work: a customer, where it picks up and delivers, and what it pays. Book the first one to see it here and on the dispatch board.",
      action: create ? { label: "New load", go: create } : undefined,
    },
  });
  const { L, status, pager } = list;
  const cols = L.cols.replace(/^16px /, "28px ");
  const byPickup = (typeof state.lsort === "string" ? state.lsort : "-pickup_at") === "pickup_at";

  return (
    <>
      <div className="col">
        <div className="ph" style={{ paddingBottom: "12px" }}>
          <div className="f1">
            <div className="crumb">
              <span>Operations</span>
              <Icon className="s12" d="M9 6l6 6-6 6" />
              <b>Loads</b>
            </div>
            <h1 className="h1">Loads</h1>
            <p className="sub"><span>{L.sub}</span></p>
          </div>
          <div className="r g8">
            {create ? (
              <button className="btn" onClick={() => set({ ...addOf("load"), mstep: "import" })}>
                <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                Import
              </button>
            ) : null}
            <ExportButton L={L} cls="btn" />
            {create ? (
              <button className="btn pri" onClick={create}>
                <Icon className="s14 b" d="M12 5v14M5 12h14" />
                New load
              </button>
            ) : null}
          </div>
        </div>
        <div className="tabs">
          {L.tabs?.map((t, i) => (
            <button key={i} className={clsx("tab", !saved.active && t.on)} onClick={t.go}>
              <span>{t.l}</span>
              {t.n ? (
                <span className="tcnt"><span>{t.n}</span></span>
              ) : null}
            </button>
          ))}
          {saved.views.map((view) => {
            const on = saved.active?.id === view.id;
            return (
              <span key={view.id} className="r" style={{ alignItems: "stretch" }}>
                <button className={clsx("tab", on && "on")} onClick={() => applyView(view.params as Partial<ViewParams>)} title={view.shared ? "Shared with the company" : "Your view"}>
                  {view.shared ? <Icon className="s12" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /> : null}
                  <span>{view.name}</span>
                </button>
                {on && (saved.mine(view) || (view.shared && can("organization.manage"))) ? (
                  <button className="tab" style={{ padding: "0 4px", marginLeft: "-10px" }} onClick={() => void saved.remove(view)} aria-label={`Remove view ${view.name}`}>
                    <Icon className="s12" d="M18 6L6 18M6 6l12 12" />
                  </button>
                ) : null}
              </span>
            );
          })}
          <button className="tab" style={{ color: plain || saved.active ? "var(--mu)" : "var(--pri)" }} onClick={() => setDialog({ kind: "view" })} disabled={plain || !!saved.active} title={plain ? "Filter or search the list first, then save it as a view" : saved.active ? "Already saved" : undefined}>
            <Icon className="s12 b" d="M12 5v14M5 12h14" />
            Save view
          </button>
        </div>
        <div className="fb">
          <label className="search">
            <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
            <input placeholder={L.ph} aria-label="Search loads" value={L.qv} onChange={L.setQ} />
          </label>
          <FilterChips L={L} />
          <button className="lnk" style={{ color: "var(--mu)", padding: "0 4px" }} onClick={list.clearFilters}>Clear all</button>
          <span className="sp"></span>
          {noFin ? (
            <span className="fs12 mu r g6">
              <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
              Rates hidden for your role
            </span>
          ) : null}
          <ColumnsButton L={L} />
          <button className="btn sm" onClick={() => set({ lsort: byPickup ? "-pickup_at" : "pickup_at", lpage: [], lsel: [] })} aria-label={`Sort by pickup date, ${byPickup ? "earliest" : "latest"} first`}>
            <Icon className="s14" d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
            Pickup date
          </button>
        </div>
        <div className="card oh c" style={{ flex: "1", minHeight: "0", margin: "0 24px 24px" }}>
          <div className="thead" style={{ gridTemplateColumns: cols }}>
            <button className={clsx("chk", L.allOn)} onClick={L.toggleAll} aria-label={L.allAria}>
              {L.allOn ? (
                <span style={{ width: "8px", height: "2px", borderRadius: "1px", background: "#fff" }}></span>
              ) : null}
            </button>
            {L.head.map((h, i) => (
              <span key={i} className={h.al}><span>{h.l}</span></span>
            ))}
          </div>
          {status === "ready" ? (
            <div className="tbody">
              {L.rows.map((r) => (
                <Fragment key={r.key}>
                  <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: cols }} onClick={r.open}>
                    {r.cells.map((c, i2) => (
                      <BasicCell key={i2} c={c} />
                    ))}
                  </div>
                </Fragment>
              ))}
            </div>
          ) : null}
          {status === "loading" ? <div className="tbody"><Skeleton /></div> : null}
          {status === "error" ? <ErrorState error={list.error} retry={list.retry} /> : null}
          {status === "filtered" ? <FilteredEmpty what="loads" clear={list.clearFilters} /> : null}
          {status === "empty" ? (
            <EmptyState icon={list.empty.icon} title={list.empty.title} text={list.empty.text}>
              {list.empty.action ? <button className="btn sm pri" onClick={list.empty.action.go}>{list.empty.action.label}</button> : null}
            </EmptyState>
          ) : null}
          <div className="tfoot">
            {L.range ? (
              <span className="num">Showing <b className="tx w5">{L.range}</b>{L.of ? ` of ${L.of}` : ""}</span>
            ) : (
              <span className="num"><span>{L.foot}</span></span>
            )}
            <span className="sp"></span>
            <PageSize L={L} />
            <Pager L={L} pager={pager} style={{ marginLeft: "8px" }} />
          </div>
        </div>
      </div>
      <BulkBar L={L} />
      <LoadDrawer />
      {dialog?.kind === "status" ? <BulkStatus loads={dialog.loads} onClose={() => { setDialog(null); set({ lsel: [] }); }} /> : null}
      {dialog?.kind === "view" ? <SaveViewDialog what={[current.tab, ...list.L.chips.map((c) => c.l), current.q ? `“${current.q}”` : ""].filter(Boolean).join(" · ")} onSave={saved.save} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
