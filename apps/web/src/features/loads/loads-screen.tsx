"use client";

import { Fragment, useState } from "react";
import { clsx } from "clsx";
import { cell } from "@/components/data-table/cell";
import { BasicCell } from "@/components/data-table/cells";
import { EmptyState, ErrorState, FilteredEmpty, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { addOf, goTo } from "@/features/console/shell";
import { LOAD_TABS } from "@/features/lists/tabs";
import { BulkBar, ColumnsButton, ExportButton, PageSize, Pager } from "@/features/lists/list-screen";
import { cellText, useList, type ListQuery } from "@/features/lists/use-list";
import type { Cell } from "@/features/console/view";
import { LoadDrawer } from "@/features/loads/load-drawer";
import { api, unwrap } from "@/lib/api/client";
import { formatDate, formatStamp, timeZoneLabel, todayIn } from "@/lib/format/dates";
import { formatWholeMoney, toCents } from "@/lib/format/money";
import { formatNumber, place, plural } from "@/lib/format/text";
import type { LoadListItem } from "./load-data";
import { BulkStatus } from "./bulk-status";
import { LoadFilters } from "./load-filters";
import { LoadsBoard } from "./loads-board";
import { useRowActions, weekdayOf } from "./row-actions";
import { WEEKDAYS } from "./load-money";
import { equipmentLabel } from "./load-view";
import { statusOf } from "./load-view";
import { SaveViewDialog, useSavedViews, type ViewParams } from "./saved-views";


/** "1h 40m", "35m". */
const span = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${Math.max(0, minutes)}m`);
const addDays = (day: string, by: number) => new Date(Date.parse(`${day}T12:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);
const monday = (day: string) => addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
const short = (day: string) => formatDate(day).replace(/, \d{4}$/, "");

/**
 * What to know about a load at a glance: the risk's short label, with the reason in plain words under it; else how
 * its ETA compares with the appointment, why it is held, or the paper a draft is missing.
 */
function riskCell(l: LoadListItem): Cell {
  const r = l.risks[0];
  if (r) {
    const tone = r.code === "UNASSIGNED_SOON" ? "warn" : r.code === "LATE_DELIVERY" && l.late_by_minutes > 0 && l.late_by_minutes < 60 ? "late" : "bad";
    return { ...cell.risk(r.label || r.message, tone), s: r.reason || undefined };
  }
  if (l.eta) return l.late_by_minutes > 0 ? { ...cell.risk(`ETA +${span(l.late_by_minutes)}`, l.late_by_minutes >= 60 ? "bad" : "late"), s: "Past the delivery appointment" } : cell.risk("On time", "ok");
  if (l.status === "on_hold") return cell.risk(l.hold_reason || "On hold", "warn");
  if (l.status === "draft" && !l.papers.rate_confirmation) return { ...cell.risk("No rate confirmation", "warn"), s: "Stays a draft until it is attached" };
  return cell.maybe(null);
}

/** Loads list with views, search, selection and the detail drawer. */
export function LoadsScreen() {
  const { me, can, fin, noFin, I, state, set, notify } = useConsole();
  const actions = useRowActions();
  const layout = state.llayout === "board" ? "board" : "table";
  const zone = me.organization.timezone;
  const create = can("loads.create") ? () => set(goTo("newload")) : null;
  const open = (load: LoadListItem) => set({ screen: "loads", drawer: load.id, overlay: "none", modal: "none" });
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

  const MULTI_FILTERS = [
    { key: "status", label: "Status", options: [], params: (v: string) => ({ status: v.split(",") }) },
    { key: "customer", label: "Customer", options: [], params: (v: string) => ({ customer_ids: v.split(",") }) },
    { key: "risk", label: "Risk", options: [], params: (v: string) => ({ risks: v.split(",") }) },
    { key: "equipment", label: "Equipment", options: [], params: (v: string) => ({ equipment_types: v.split(",") }) },
    { key: "driver", label: "Driver", options: [], params: (v: string) => ({ driver_ids: v.split(",") }) },
  ];
  /** A row's ⋯ menu. */
  const rowMenu = (l: LoadListItem) => {
    const items: [string, () => void, string?][] = [
      ["Open load", () => open(l)],
      ["Open full page", () => set({ screen: "load", loadId: l.id, drawer: null })],
    ];
    if (can("loads.create")) items.push(["Duplicate as a draft", () => void actions.duplicate(l)]);
    if (can("loads.update") && l.status !== "cancelled") items.push([l.repeat_days?.length ? `Stop repeating (every ${l.repeat_days.map((d) => WEEKDAYS[d]).join(", ")})` : `Repeat every ${l.pickup_at ? WEEKDAYS[weekdayOf(l.pickup_at, zone)] : "week"}`, () => void actions.repeat(l, !!l.repeat_days?.length)]);
    if (can("loads.update") && !["draft", "cancelled"].includes(l.status)) items.push(["Copy tracking link", () => void actions.copyLink(l)]);
    if (can("loads.cancel") && ["draft", "planned", "assigned", "dispatched", "on_hold"].includes(l.status)) items.push(["Cancel load", () => void actions.cancel(l), "bad"]);
    return cell.menu(items);
  };

  const list = useList<LoadListItem>({
    key: "loads",
    group: "Operations",
    title: "Loads",
    sub: (total) => `${total === null ? "" : `${plural(total, "load")} · `}${pickupRange ? `${short(pickupRange[1])}${pickupRange[2] !== pickupRange[1] ? ` – ${short(pickupRange[2])}` : ""} · ` : ""}times in ${timeZoneLabel(zone)}`,
    placeholder: "Load #, PO, BOL, pickup or delivery #, customer, city, driver",
    sizes: [10, 25, 50],
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
      ...(can("loads.update", "loads.close")
        ? [{
            label: "Request PODs",
            go: async (chosen: LoadListItem[]) => {
              const waiting = chosen.filter((l) => l.status === "delivered");
              if (!waiting.length) return notify("None of these loads is waiting for its proof of delivery", true);
              let sent = 0;
              for (const l of waiting) {
                try {
                  const out = await unwrap(api.POST("/api/v1/loads/{load_id}/pod-request", { params: { path: { load_id: l.id } } }));
                  if (out.sent) sent++;
                } catch { /* counted below */ }
              }
              notify(`POD requested for ${plural(sent, "load")}${sent < waiting.length ? ` · ${waiting.length - sent} couldn’t reach the driver` : ""}`, sent < waiting.length);
            },
          }]
        : []),
      // Bills of lading as a PDF, one page per load, in a new tab to print.
      { label: "Print BOLs", go: (chosen: LoadListItem[]) => window.open(`/api/v1/loads/bols.pdf?${chosen.map((l) => `ids=${encodeURIComponent(l.id)}`).join("&")}`, "_blank", "noopener") },
      "export" as const,
    ],
    noun: "loads",
    filters: [
      { key: "pickup", label: "Pickup", options: Object.entries(ranges).map(([value, [label]]) => ({ value, label })), params: (value) => (ranges[value] ? { pickup_from: ranges[value][1], pickup_to: ranges[value][2] } : {}) },
      ...MULTI_FILTERS,
    ],
    // The server makes the file, so rates and margin are left out for roles that can't see them.
    exportFile: () => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(list.params)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) q.append(k, String(x));
      q.set("sort", list.sort);
      window.open(`/api/v1/loads/export.csv?${q}`, "_blank", "noopener");
      notify("Loads exported as CSV");
    },
    open,
    rowClass: (load) => (load.id === drawer ? "sel" : load.status === "cancelled" ? "dim" : ""),
    columns: [
      { label: "Load", width: "148px", sort: "load_number", cell: (l) => cell.id(l.load_number, () => open(l), `${l.customer.name}${l.repeat_days?.length ? ` · repeats ${l.repeat_days.map((d) => WEEKDAYS[d]).join(", ")}` : ""}`) },
      { label: "Status", width: "112px", sort: "status", cell: (l) => cell.badge(statusOf(l).label, statusOf(l).tone) },
      { label: "Risk", width: "172px", cell: riskCell, csv: (l) => cellText(riskCell(l)) },
      { label: "References", width: "minmax(0,1fr)", hidden: true, cell: (l) => cell.text(l.reference || "—", [l.pickup_number && `PU ${l.pickup_number}`, l.delivery_number && `DL ${l.delivery_number}`, l.bol_number && `BOL ${l.bol_number}`].filter(Boolean).join(" · "), "mono fs12", "mono") },
      { label: "Pickup", width: "minmax(0,1fr)", sort: "pickup_at", cell: (l) => cell.text(place(l.origin_city, l.origin_state), l.pickup_at ? formatStamp(l.pickup_at, zone) : "", "", "num") },
      { label: "Delivery", width: "minmax(0,1fr)", sort: "delivery_at", cell: (l) => cell.text(place(l.destination_city, l.destination_state), l.delivery_at ? formatStamp(l.delivery_at, zone) : "", "", "num") },
      {
        label: "Driver · equipment",
        width: "minmax(0,1fr)",
        sort: "driver",
        cell: (l) => (l.assignment ? cell.text(l.assignment.driver.name, [l.assignment.vehicle.name, l.assignment.trailer?.name].filter(Boolean).join(" · ")) : l.status === "cancelled" ? cell.maybe(null) : cell.risk("Unassigned", "warn", I.user)),
      },
      { label: "Equipment", width: "92px", hidden: true, sort: "equipment", cell: (l: LoadListItem) => cell.text(equipmentLabel(l.equipment_type), "", "fs12") },
      { label: "Miles", width: "72px", hidden: true, right: true, sort: "miles", cell: (l: LoadListItem) => cell.text(l.miles ? formatNumber(l.miles) : "—", "", "num") },
      ...(fin ? [{ label: "Margin", width: "96px", hidden: true, right: true, sort: "margin", cell: (l: LoadListItem) => (l.margin === null || l.margin === undefined || l.status === "cancelled" ? cell.maybe(null) : { ...cell.money(formatWholeMoney(l.margin, l.currency), l.margin_pct === null || l.margin_pct === undefined ? "" : `${l.margin_pct}%`), ...(l.margin_pct !== null && l.margin_pct !== undefined && l.margin_pct < 25 ? { cls: "warn" } : {}) }) }] : []),
      ...(fin ? [{ label: "Rate", width: "96px", right: true, sort: "revenue", cell: (l: LoadListItem) => cell.money(formatWholeMoney(l.revenue, l.currency), l.miles && l.revenue ? `$${((toCents(l.revenue) ?? 0) / 100 / l.miles).toFixed(2)}/mi` : "") }] : []),
      {
        label: "Docs",
        width: "72px",
        cell: (l: LoadListItem) => cell.docs([l.papers.rate_confirmation, l.papers.bol, l.papers.pod].filter(Boolean).length, l.status === "delivered" && !l.papers.pod),
        csv: (l: LoadListItem) => (["Rate confirmation", "BOL", "POD"] as const).filter((_, i) => [l.papers.rate_confirmation, l.papers.bol, l.papers.pod][i]).join(", "),
      },
      { label: "", width: "28px", cell: (l: LoadListItem) => rowMenu(l) },
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
        <div className="fb" style={{ flexWrap: "wrap", rowGap: "8px" }}>
          <label className="search">
            <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
            <input placeholder={L.ph} aria-label="Search loads" value={L.qv} onChange={L.setQ} />
          </label>
          <LoadFilters params={list.params} single={{ key: "pickup", label: "Pickup", options: Object.entries(ranges).map(([value, [label]]) => ({ value, label })) }} clearAll={list.clearFilters} preset={L.chips.find((c) => c.l.startsWith("From dashboard"))} />
          <span className="sp"></span>
          <div className="seg sm" role="group" aria-label="Loads layout">
            {(["table", "board"] as const).map((k) => (
              <button key={k} className={clsx(layout === k && "on")} aria-pressed={layout === k} onClick={() => set({ llayout: k })}>{k === "table" ? "Table" : "Board"}</button>
            ))}
          </div>
          {noFin ? (
            <span className="fs12 mu r g6">
              <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
              Rates hidden for your role
            </span>
          ) : null}
          {layout === "table" ? <ColumnsButton L={L} /> : null}
          {layout === "table" ? (
            <button className="btn sm" onClick={() => set({ lsort: byPickup ? "-pickup_at" : "pickup_at", lpage: [], lsel: [] })} aria-label={`Sort by pickup date, ${byPickup ? "earliest" : "latest"} first`}>
              <Icon className="s14" d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
              Pickup date
            </button>
          ) : null}
        </div>
        {layout === "board" ? <LoadsBoard params={list.params} open={(id) => set({ drawer: id, overlay: "none", modal: "none" })} /> : null}
        <div className="card oh c" style={{ flex: "1", minHeight: "0", margin: "0 24px 24px" }} hidden={layout === "board"}>
          <div className="thead" style={{ gridTemplateColumns: cols }}>
            <button className={clsx("chk", L.allOn)} onClick={L.toggleAll} aria-label={L.allAria}>
              {L.allOn ? (
                <span style={{ width: "8px", height: "2px", borderRadius: "1px", background: "#fff" }}></span>
              ) : null}
            </button>
            {L.head.map((h, i) =>
              h.srt ? (
                <button key={i} className={clsx("thb", h.al, h.son)} onClick={h.go} aria-label={h.aria}>
                  <span>{h.l}</span>
                  <Icon d={h.sic} />
                </button>
              ) : (
                <span key={i} className={h.al}><span>{h.l}</span></span>
              ),
            )}
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
