"use client";

import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { clsx } from "clsx";
import { cell } from "@/components/data-table/cell";
import { BasicCell } from "@/components/data-table/cells";
import { EmptyState, ErrorState, FilteredEmpty, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useSoon } from "@/features/console/use-action";
import { LOAD_TABS } from "@/features/lists/tabs";
import { BulkBar, ColumnsButton, ExportButton, FilterChips, Pager } from "@/features/lists/list-screen";
import { useList, type ListQuery } from "@/features/lists/use-list";
import { LoadDrawer } from "@/features/loads/load-drawer";
import { api, unwrap } from "@/lib/api/client";
import { formatDateTime, timeZoneLabel } from "@/lib/format/dates";
import { formatMoney, toCents } from "@/lib/format/money";
import { place, plural } from "@/lib/format/text";
import type { LoadListItem } from "./load-data";
import { riskOf, statusOf } from "./load-view";
import { loadLabel } from "@/features/fleet/labels";

const STATUSES = ["draft", "planned", "assigned", "dispatched", "at_pickup", "in_transit", "at_delivery", "delivered", "pod_review", "completed", "on_hold", "cancelled"] as const;

/** Loads list with views, search, selection and the detail drawer. */
export function LoadsScreen() {
  const { me, can, fin, noFin, I, state, set } = useConsole();
  const soon = useSoon();
  const zone = me.organization.timezone;
  const create = can("loads.create") ? () => set(goTo("newload")) : null;
  const open = (load: LoadListItem) => set({ screen: "loads", drawer: load.id, overlay: "none", modal: "none" });
  const customers = useQuery({ queryKey: [me.organization.id, "customers", "filter"], queryFn: () => unwrap(api.GET("/api/v1/customers", { params: { query: { sort: "name", limit: 100 } } })), enabled: can("customers.read"), staleTime: 60_000 });
  const drawer = typeof state.drawer === "string" ? state.drawer : null;

  const list = useList<LoadListItem>({
    key: "loads",
    group: "Operations",
    title: "Loads",
    sub: (total) => `${total === null ? "" : `${plural(total, "load")} · `}times in ${timeZoneLabel(zone)}`,
    placeholder: "Load #, reference, customer, city",
    fetch: (query: ListQuery) => unwrap(api.GET("/api/v1/loads", { params: { query: query as never } })),
    defaultSort: "-pickup_at",
    tabs: LOAD_TABS,
    bulk: [
      ...(can("dispatch.assign") ? [{ label: "Assign driver", go: () => set(goTo("dispatch")) }] : []),
      { label: "Change status", go: soon("Changing several loads’ status") },
      { label: "Print BOLs", go: soon("Printing bills of lading") },
      "export" as const,
    ],
    noun: "loads",
    filters: [
      { key: "status", label: "Status", options: STATUSES.map((v) => ({ value: v, label: loadLabel(v) })) },
      { key: "customer_id", label: "Customer", options: (customers.data?.items ?? []).map((c) => ({ value: c.id, label: c.name })) },
      { key: "risk", label: "Risk", options: [["at_risk", "At risk"], ["unassigned", "Unassigned"], ["missing_pod", "Missing POD"]].map(([value, label]) => ({ value: value!, label: label! })), params: (value) => ({ view: value }) },
    ],
    open,
    rowClass: (load) => (load.id === drawer ? "sel" : load.status === "cancelled" ? "dim" : ""),
    columns: [
      { label: "Load", width: "148px", cell: (l) => cell.id(l.load_number, () => open(l), l.customer.name) },
      { label: "Status", width: "112px", cell: (l) => cell.badge(statusOf(l).label, statusOf(l).tone) },
      { label: "Risk", width: "138px", cell: (l) => (riskOf(l) ? cell.risk(riskOf(l)!.label, riskOf(l)!.tone) : cell.text("")) },
      { label: "Pickup", width: "minmax(0,1fr)", cell: (l) => cell.text(place(l.origin_city, l.origin_state), l.pickup_at ? formatDateTime(l.pickup_at, zone) : "", "", "num") },
      { label: "Delivery", width: "minmax(0,1fr)", cell: (l) => cell.text(place(l.destination_city, l.destination_state), l.delivery_at ? formatDateTime(l.delivery_at, zone) : "", "", "num") },
      {
        label: "Driver · equipment",
        width: "minmax(0,1fr)",
        cell: (l) => (l.assignment ? cell.text(l.assignment.driver.name, [l.assignment.vehicle.name, l.assignment.trailer?.name].filter(Boolean).join(" · ")) : ["cancelled", "draft"].includes(l.status) ? cell.maybe(null) : cell.risk("Unassigned", "warn", I.user)),
      },
      ...(fin ? [{ label: "Rate", width: "96px", right: true, cell: (l: LoadListItem) => cell.money(formatMoney(l.revenue, l.currency), l.miles && l.revenue ? `$${((toCents(l.revenue) ?? 0) / 100 / l.miles).toFixed(2)}/mi` : "") }] : []),
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
            <button className="btn" onClick={soon("Importing loads")}>
              <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              Import
            </button>
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
            <button key={i} className={clsx("tab", t.on)} onClick={t.go}>
              <span>{t.l}</span>
              {t.n ? (
                <span className="tcnt"><span>{t.n}</span></span>
              ) : null}
            </button>
          ))}
          <button className="tab" style={{ color: "var(--pri)" }} onClick={soon("Saving a view")}>
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
            <span className="num"><span>{L.foot}</span></span>
            <span className="sp"></span>
            <Pager L={L} pager={pager} style={{ marginLeft: "8px" }} />
          </div>
        </div>
      </div>
      <BulkBar L={L} />
      <LoadDrawer />
    </>
  );
}
