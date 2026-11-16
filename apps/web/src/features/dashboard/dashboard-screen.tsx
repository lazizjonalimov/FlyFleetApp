"use client";

import { clsx } from "clsx";
import { Fragment, useState } from "react";
import { cell } from "@/components/data-table/cell";
import { BasicCell } from "@/components/data-table/cells";
import { EmptyState } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { placeOf, SEVERITY_TONE, areaOf } from "@/features/alerts/exceptions";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import type { Cell } from "@/features/console/view";
import { loadLabel, loadTone } from "@/features/fleet/labels";
import { LOAD_TABS, tabFor } from "@/features/lists/tabs";
import { riskOf } from "@/features/loads/load-view";
import { formatDate, formatDateTime, timeZoneLabel, toLocalInput } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, humanize, place, plural } from "@/lib/format/text";
import { cents, useDashboardData } from "./dashboard-data";

/** "$184.2k" — a short amount for a figure that is read at a glance. */
function short(value: string | number, currency: string): string {
  const amount = cents(value) / 100;
  const sign = amount < 0 ? "−" : "";
  const abs = Math.abs(amount);
  const symbol = currency === "USD" ? "$" : `${currency} `;
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}${symbol}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${symbol}${Math.round(abs).toLocaleString("en-US")}`;
}
/** An axis label: "$40K", "$1.2M". */
function axis(amount: number, currency: string): string {
  const symbol = currency === "USD" ? "$" : `${currency} `;
  if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(amount % 1_000_000 ? 1 : 0)}M`;
  if (amount >= 1000) return `${symbol}${(amount / 1000).toFixed(amount % 1000 ? 1 : 0)}K`;
  return `${symbol}${Math.round(amount)}`;
}
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "0%");
const monthName = (day: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" }).format(new Date(`${day}T12:00:00Z`));
const longMonth = (day: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long" }).format(new Date(`${day}T12:00:00Z`));
const span = (from: string, to: string) => `${formatDate(from).replace(/, \d{4}$/, "")}–${new Date(`${to}T12:00:00Z`).getUTCDate()}`;

type Kpi = { label: string; value: string; suffix: string; sub: string; k: string; sk: string; go?: () => void };
type Widget =
  | { kind: "avail"; title: string; note?: string; rows: { label: string; total: number; segs: { l: string; n: string; k: string; w: string }[] }[] }
  | { kind: "money"; title: string; note?: string; items: { label: string; v: string; s: string; k: string }[]; foot: string }
  | { kind: "list"; title: string; link?: string; go?: () => void; note?: string; items: { a: string; b: string; chip: string; k: string }[]; empty: string };

/** Role-aware dashboard: KPIs, financials, exceptions, today’s work and fleet availability. */
export function DashboardScreen() {
  const { me, can, set } = useConsole();
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");
  const [view, setView] = useState<Record<string, "chart" | "table">>({});
  const [tip, setTip] = useState<string | null>(null);
  const data = useDashboardData(period);
  const org = me.organization;
  const zone = org.timezone;
  const currency = org.base_currency;
  const money = (value: string | number | null | undefined) => formatMoney(value, currency);
  const s = data.summary.data;
  const loads = s?.loads;
  const fleet = s?.fleet;
  const receivables = s?.receivables;
  const safety = s?.safety ?? undefined;
  const billing = me.organization.role === "accountant";
  const exceptions = data.exceptions.data ?? [];
  const exception = (code: string) => exceptions.find((each) => each.code === code);
  const loadsTab = (params: Record<string, string>) => set({ ...goTo("loads"), ltab: tabFor(LOAD_TABS, params) });
  const dash = "—";
  const n = (value: number | undefined) => (value === undefined ? dash : formatNumber(value));

  const trucksTotal = data.trucks.data?.items.length ?? (fleet ? fleet.trucks_active + fleet.trucks_unavailable : undefined);
  const kpis: Kpi[] = billing
    ? [
        { label: "Ready to invoice", value: n(receivables?.ready_to_invoice_loads), suffix: "", sub: receivables ? `est. ${short(receivables.ready_to_invoice_amount, currency)}` : "", k: "brand", sk: "mu", go: () => loadsTab({ view: "ready_to_invoice" }) },
        { label: "POD review", value: n(exception("POD_REVIEW")?.count ?? (data.exceptions.isSuccess ? 0 : undefined)), suffix: "", sub: "Approve to invoice", k: "info", sk: "mu", go: () => { const e = exception("POD_REVIEW"); if (e) set(placeOf(e)!); } },
        { label: "Draft invoices", value: n(receivables?.draft_invoices), suffix: "", sub: "Started, not issued", k: "mu", sk: "mu", go: () => set({ ...goTo("invoices"), ltab: 1 }) },
        { label: "Overdue", value: receivables ? short(receivables.overdue_balance, currency) : dash, suffix: "", sub: receivables ? plural(receivables.overdue_invoices, "invoice") : "", k: "bad", sk: receivables?.overdue_invoices ? "bad" : "mu", go: () => set({ ...goTo("invoices"), ltab: 2 }) },
        { label: `Collected · ${monthName(data.today)}`, value: data.month.ready ? short(data.month.cash, currency) : dash, suffix: "", sub: data.month.ready ? plural(data.month.payments, "payment") : "", k: "ok", sk: "mu" },
        { label: "Statements to approve", value: n(data.statements.data?.drafts), suffix: "", sub: data.statements.data ? `${short(data.statements.data.to_pay, currency)} approved, unpaid` : "", k: "warn", sk: data.statements.data?.drafts ? "warn" : "mu", go: () => set({ ...goTo("settlements"), ltab: 1 }) },
      ]
    : [
        { label: "Unassigned loads", value: n(loads?.unassigned), suffix: "", sub: loads ? `${formatNumber(loads.pickups_today)} pick up today` : "", k: "warn", sk: loads?.unassigned ? "warn" : "mu", go: () => loadsTab({ view: "unassigned" }) },
        { label: "Late or at risk", value: n(loads?.at_risk), suffix: "", sub: exception("LOADS_AT_RISK")?.detail ?? "Nothing late right now", k: "bad", sk: loads?.at_risk ? "bad" : "mu", go: () => loadsTab({ view: "at_risk" }) },
        { label: "Deliveries today", value: n(loads?.deliveries_today), suffix: "", sub: loads ? `${formatNumber(loads.in_transit)} on the road` : "", k: "info", sk: "mu", go: () => loadsTab({ view: "deliveries_today" }) },
        { label: "Drivers available", value: fleet ? formatNumber(Math.max(0, fleet.drivers_active - fleet.drivers_on_load - (safety?.drivers_blocked ?? 0))) : dash, suffix: fleet ? ` / ${formatNumber(fleet.drivers_active)}` : "", sub: safety ? `${formatNumber(safety.drivers_blocked)} can’t be dispatched` : "", k: "ok", sk: "mu", go: () => set(goTo("drivers")) },
        { label: "Trucks unavailable", value: n(fleet?.trucks_unavailable), suffix: trucksTotal !== undefined ? ` / ${formatNumber(trucksTotal)}` : "", sub: safety ? `${formatNumber(safety.units_blocked)} blocked by paperwork` : "", k: "mu", sk: "mu", go: () => set(goTo("trucks")) },
        can("invoices.read")
          ? { label: "Overdue invoices", value: receivables ? short(receivables.overdue_balance, currency) : dash, suffix: "", sub: receivables ? plural(receivables.overdue_invoices, "invoice") : "", k: "bad", sk: receivables?.overdue_invoices ? "bad" : "mu", go: () => set({ ...goTo("invoices"), ltab: 2 }) }
          : { label: "POD missing", value: n(loads?.missing_pod), suffix: "", sub: "Delivered, waiting for paperwork", k: "bad", sk: loads?.missing_pod ? "bad" : "mu", go: () => loadsTab({ view: "missing_pod" }) },
      ];

  // the table under Needs attention
  const deliveryRows = (data.deliveries.data?.items ?? []).map((load) => {
    const risk = riskOf(load);
    return {
      key: load.id,
      open: () => set({ screen: "loads", drawer: load.id, overlay: "none", modal: "none" }),
      cells: [
        cell.id(load.load_number, () => set({ screen: "loads", drawer: load.id, overlay: "none", modal: "none" })),
        cell.text(load.customer.name),
        cell.text(place(load.destination_city, load.destination_state), "", "t2"),
        cell.text(load.delivery_at ? (period === "today" ? toLocalInput(load.delivery_at, zone).slice(11) : formatDateTime(load.delivery_at, zone)) : dash, "", "num"),
        risk ? cell.risk(risk.label, risk.tone) : load.delivered_at ? cell.risk("Delivered", "ok") : cell.text(""),
        load.assignment ? cell.text(load.assignment.driver.name) : cell.maybe(null),
        cell.badge(loadLabel(load.status), loadTone(load.status)),
      ] as Cell[],
    };
  });
  const readyRows = (data.ready.data?.items ?? []).map((load) => ({
    key: load.id,
    open: () => set({ screen: "load", loadId: load.id, overlay: "none", modal: "none" }),
    cells: [
      cell.id(load.load_number, () => set({ screen: "load", loadId: load.id, overlay: "none", modal: "none" })),
      cell.text(load.customer.name),
      cell.text(load.delivered_at ? formatDate(load.delivered_at.slice(0, 10)).replace(/, \d{4}$/, "") : dash, "", "num t2"),
      cell.badge("Approved", "ok"),
      cell.money(money(load.revenue)),
      can("invoices.create") ? cell.button("Create invoice", () => set({ modal: "add", kind: "invoice", mstep: "manual", overlay: "none", fv: { "invoice.customer": load.customer.id, "invoice.loads": [load.id] } })) : cell.text(""),
    ] as Cell[],
  }));
  const deliveredCount = data.deliveries.data?.items.filter((load) => ["delivered", "pod_review", "completed"].includes(load.status)).length ?? 0;
  const deliveryTotal = data.deliveries.data?.page.total_count ?? data.deliveries.data?.items.length ?? 0;
  const t = billing
    ? { title: "Ready to invoice", sub: "Delivered, with a reviewed POD", link: "Invoices", go: () => set(goTo("invoices")), cols: "92px minmax(0,1.2fr) 76px 112px 108px 120px", head: ["Load", "Customer", "Delivered", "POD", "Amount", ""], rows: readyRows, loading: data.ready.isPending, empty: "Nothing is waiting to be invoiced" }
    : {
        title: `Deliveries ${period === "today" ? "today" : period === "week" ? "this week" : "this month"}`,
        sub: data.deliveries.data ? `${formatNumber(Math.max(0, deliveryTotal - deliveredCount))} of ${formatNumber(deliveryTotal)} remaining` : "",
        link: "Open in Loads",
        go: () => loadsTab({ view: "deliveries_today" }),
        cols: "88px minmax(0,1.15fr) minmax(0,1fr) 112px 126px minmax(0,0.9fr) 100px",
        head: ["Load", "Customer", "Destination", "Appt", "Risk", "Driver", "Status"],
        rows: deliveryRows,
        loading: data.deliveries.isPending,
        empty: `No deliveries ${period === "today" ? "today" : period === "week" ? "this week" : "this month"}`,
      };

  // side widgets
  const segs = (parts: [label: string, count: number, tone: string][]) => {
    const total = parts.reduce((sum, [, count]) => sum + count, 0);
    return parts.filter(([, count]) => count > 0).map(([l, count, k]) => ({ l, n: formatNumber(count), k, w: `${total ? ((count / total) * 100).toFixed(2) : 0}%` }));
  };
  const trailerItems = data.trailers.data?.items ?? [];
  const truckItems = data.trucks.data?.items ?? [];
  const availability: Widget | null = fleet
    ? {
        kind: "avail",
        title: "Fleet availability",
        note: "Now",
        rows: [
          { label: "Drivers", total: fleet.drivers_active, segs: segs([["On a load", fleet.drivers_on_load, "brand"], ["Available", Math.max(0, fleet.drivers_active - fleet.drivers_on_load - (safety?.drivers_blocked ?? 0)), "ok"], ["Can’t be dispatched", safety?.drivers_blocked ?? 0, "bad"]]) },
          ...(truckItems.length
            ? [{ label: "Trucks", total: truckItems.length, segs: segs([["On a load", truckItems.filter((u) => u.status === "active" && u.current_load).length, "brand"], ["Available", truckItems.filter((u) => u.status === "active" && !u.current_load).length, "ok"], ["In shop", truckItems.filter((u) => u.status === "in_maintenance").length, "warn"], ["Out of service", truckItems.filter((u) => u.status === "out_of_service").length, "bad"]]) }]
            : []),
          ...(trailerItems.length
            ? [{ label: "Trailers", total: trailerItems.length, segs: segs([["Loaded", trailerItems.filter((u) => u.status === "active" && u.current_load).length, "brand"], ["Empty", trailerItems.filter((u) => u.status === "active" && !u.current_load).length, "ok"], ["In shop", trailerItems.filter((u) => u.status === "in_maintenance" || u.status === "out_of_service").length, "warn"]]) }]
            : []),
        ].filter((row) => row.total > 0),
      }
    : null;
  const monthWidget: Widget | null =
    can("invoices.read") && data.month.ready
      ? {
          kind: "money",
          title: "Money this month",
          note: span(data.monthStart, data.today),
          items: [
            { label: "Invoiced", v: short(data.month.invoiced, currency), s: `${plural(data.month.invoices, "invoice")} issued`, k: "brand" },
            { label: "Cash received", v: can("payments.read") ? short(data.month.cash, currency) : dash, s: can("payments.read") ? `${plural(data.month.payments, "payment")} recorded` : "Not shown to your role", k: "ok" },
            { label: "Not yet billed", v: receivables ? short(receivables.ready_to_invoice_amount, currency) : dash, s: receivables ? `estimate · ${plural(receivables.ready_to_invoice_loads, "load")}` : "", k: "warn" },
          ],
          foot: "Three numbers on purpose — estimates, invoices and cash are never added together.",
        }
      : null;
  const onTheRoad: Widget | null = loads
    ? {
        kind: "list",
        title: "Live fleet",
        link: "Open map",
        go: () => set(goTo("tracking")),
        items: [
          { a: "In transit", b: "Picked up, heading to delivery", chip: formatNumber(loads.in_transit), k: "brand" },
          { a: "Picking up today", b: "Pickups scheduled today", chip: formatNumber(loads.pickups_today), k: "mu" },
          { a: "Delivering today", b: "Deliveries scheduled today", chip: formatNumber(loads.deliveries_today), k: "mu" },
          { a: "On hold", b: "Keeping their driver and equipment", chip: formatNumber(loads.on_hold), k: loads.on_hold ? "warn" : "mu" },
        ],
        empty: "",
      }
    : null;
  const expiringWidget: Widget | null = data.expiring.data
    ? {
        kind: "list",
        title: "Expiring in 30 days",
        link: "Compliance",
        go: () => set(goTo("safety")),
        items: data.expiring.data.items.map((item) => ({ a: item.item_label, b: `${item.entity_label} · ${humanize(item.entity_type)}`.toLowerCase().replace(/^./, (c) => c.toUpperCase()), chip: item.days_left === null || item.days_left === undefined ? dash : plural(item.days_left, "day"), k: (item.days_left ?? 99) <= 7 ? "bad" : (item.days_left ?? 99) <= 21 ? "warn" : "mu" })),
        empty: "Nothing expires in the next 30 days",
      }
    : null;
  const totals = data.aging.data?.totals;
  const agingWidget: Widget | null = totals
    ? {
        kind: "list",
        title: "Receivables by age",
        link: "Aging report",
        go: () => set({ ...goTo("reports"), rpt: "ar-aging" }),
        items: ([["current", "Current", "not yet due", "ok"], ["days_1_30", "1–30 days", "past due", "warn"], ["days_31_60", "31–60 days", "past due", "late"], ["days_61_90", "61–90 days", "past due", "bad"], ["days_over_90", "90+ days", "past due", "bad"]] as const).map(([key, a, b, k]) => ({ a, b, chip: short(String(totals[key] ?? "0"), currency), k })),
        empty: "",
      }
    : null;
  const role = me.organization.role;
  const side = (billing ? [monthWidget, agingWidget] : role === "safety_manager" ? [availability, expiringWidget] : role === "owner" || role === "admin" ? [availability, monthWidget, onTheRoad, expiringWidget] : [availability, onTheRoad]).filter((w): w is Widget => !!w);

  // financials
  const weekTotals = data.weekly.totals.map((total) => cents(total));
  const topWeek = Math.max(...weekTotals, 0);
  // three even steps up to the tallest week, each a round number
  const step = (() => {
    const raw = topWeek / 3;
    if (!raw) return 100;
    const power = Math.pow(10, Math.floor(Math.log10(raw)));
    return ([1, 2, 2.5, 5, 10].find((nice) => nice * power >= raw) ?? 10) * power;
  })();
  const scale = step * 3;
  const thisWeek = weekTotals[weekTotals.length - 1] ?? 0;
  const customerRows = data.customers.data?.rows ?? [];
  const customerTotal = cents(String(data.customers.data?.totals?.revenue ?? "0"));
  const topCustomer = Math.max(...customerRows.map((row) => cents(String(row.revenue ?? "0"))), 0);
  const split = data.split;
  const revenue = cents(split.revenue);
  const category = (...names: string[]) => split.categories.filter((each) => names.includes(each.category)).reduce((sum, each) => sum + cents(each.amount), 0);
  const fuel = category("fuel");
  const upkeep = category("repairs", "tires");
  const pay = cents(split.driverPay);
  const otherCosts = split.categories.filter((each) => !["fuel", "repairs", "tires", "advance"].includes(each.category)).reduce((sum, each) => sum + cents(each.amount), 0);
  const margin = revenue - fuel - upkeep - pay - otherCosts;
  const parts = [
    { n: "Driver pay", amount: pay, v: "v1" },
    { n: "Fuel", amount: fuel, v: "v2" },
    { n: "Maintenance & tires", amount: upkeep, v: "v3" },
    { n: "Other costs", amount: otherCosts, v: "vo" },
    { n: margin >= 0 ? "Margin" : "Loss", amount: Math.abs(margin), v: margin >= 0 ? "v4" : "v5" },
  ].filter((part) => part.amount > 0);
  const costs = fuel + upkeep + pay + otherCosts;
  const shown = (key: string) => view[key] ?? "chart";
  const toggle = (key: string) => ({
    c: shown(key) === "chart" ? "on" : "",
    t: shown(key) === "table" ? "on" : "",
    cp: shown(key) === "chart" ? ("true" as const) : ("false" as const),
    tp: shown(key) === "table" ? ("true" as const) : ("false" as const),
    chart: () => setView({ ...view, [key]: "chart" }),
    table: () => setView({ ...view, [key]: "table" }),
  });
  const w = toggle("w");
  const c = toggle("c");
  const sp = toggle("s");
  const weekLabel = (day: string) => formatDate(day).replace(/, \d{4}$/, "");
  const now = new Date();

  return (
    <div className="scr">
      <div className="ph">
        <div className="f1">
          <div className="crumb">
            <span>Overview</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>Dashboard</b>
          </div>
          <h1 className="h1"><span>{billing ? "Billing overview" : "Dashboard"}</span></h1>
          <p className="sub">
            <span>{`${new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "short", day: "numeric" }).format(now)} · updated ${data.summary.dataUpdatedAt ? toLocalInput(new Date(data.summary.dataUpdatedAt).toISOString(), zone).slice(11) : dash} ${timeZoneLabel(zone)}`}</span>
          </p>
        </div>
        <div className="r g8">
          <div className="seg" role="group" aria-label="Period">
            {(["today", "week", "month"] as const).map((each) => (
              <button key={each} className={clsx(period === each && "on")} onClick={() => setPeriod(each)} aria-pressed={period === each}>{each === "today" ? "Today" : each === "week" ? "This week" : "This month"}</button>
            ))}
          </div>
          {can("loads.create") ? (
            <button className="btn pri" onClick={() => set(goTo("newload"))}>
              <Icon className="s14 b" d="M12 5v14M5 12h14" />
              New load
            </button>
          ) : null}
        </div>
      </div>
      <div className="kpis" style={{ margin: "0 24px", gridTemplateColumns: "repeat(6,minmax(0,1fr))" }}>
        {kpis.map((k) => (
          <button key={k.label} className="kpi" onClick={k.go}>
            <span className="kl">
              <span className="dot" data-k={k.k}></span>
              <span className="ell"><span>{k.label}</span></span>
            </span>
            <span className="kv2">
              <span>{k.value}</span>
              <small><span>{k.suffix}</span></small>
            </span>
            <span className="ks" data-k={k.sk}><span>{k.sub}</span></span>
          </button>
        ))}
      </div>
      {data.books ? (
        <>
          <div className="r g8" style={{ padding: "20px 24px 0" }}>
            <span className="over">Financials</span>
            <span className="fs12 mu">{`${span(data.monthStart, data.today)} · revenue, customers and costs`}</span>
            <span className="sp"></span>
            <span className="r g4 fs12 mu">
              <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
              Shown to roles with finance access
            </span>
            <button className="lnk" style={{ marginLeft: "10px" }} onClick={() => set(goTo("reports"))}>Open reports</button>
          </div>
          <div className="biz vz">
            <section className="card c" aria-label="Invoiced revenue by week">
              <div className="ch" style={{ minHeight: "58px" }}>
                <div className="f1 c">
                  <h2 className="h2">Invoiced revenue by week</h2>
                  <span className="fs12 mu">Last 12 weeks</span>
                </div>
                <div className="seg sm" role="group" aria-label="Show revenue by week as">
                  <button className={w.c} onClick={w.chart} aria-pressed={w.cp}>Chart</button>
                  <button className={w.t} onClick={w.table} aria-pressed={w.tp}>Table</button>
                </div>
              </div>
              <div className="cb c g12">
                <div className="bzh">
                  <span className="bzv">{short(data.month.invoiced, currency)}</span>
                  <span className="fs12 t3">{`invoiced ${span(data.monthStart, data.today)}`}</span>
                  {cents(data.weekly.lastMonthToDate) ? (
                    <span className="dlt">{`${cents(data.month.invoiced) >= cents(data.weekly.lastMonthToDate) ? "▲" : "▼"} ${pct(Math.abs(cents(data.month.invoiced) - cents(data.weekly.lastMonthToDate)), cents(data.weekly.lastMonthToDate))} vs ${span(data.weekly.lastStretch.from, data.weekly.lastStretch.to)}`}</span>
                  ) : null}
                </div>
                {!data.weekly.ready ? null : !topWeek ? (
                  <EmptyState icon="M3 3v18h18M7 15l4-4 3 3 5-6" title="Nothing invoiced in the last 12 weeks" />
                ) : shown("w") === "chart" ? (
                  <div className="wk" role="group" aria-label="Columns, one per week">
                    <div className="wky" aria-hidden="true">
                      {[3, 2, 1, 0].map((i) => (
                        <span key={i}>{axis((scale * i) / 3 / 100, currency)}</span>
                      ))}
                    </div>
                    <div className="wkp">
                      {data.weekly.weeks.map((start, i) => {
                        const value = weekTotals[i] ?? 0;
                        const key = `w${i}`;
                        const height = `${((value / scale) * 100).toFixed(2)}%`;
                        return (
                          <button key={start} className="wkc" aria-label={`Week of ${weekLabel(start)}: ${short(value / 100, currency)} invoiced`} onMouseEnter={() => setTip(key)} onFocus={() => setTip(key)} onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}>
                            <span className={clsx("wkb", i === weekTotals.length - 1 && "part")} style={{ height }}></span>
                            {tip === key ? (
                              <span className={clsx("vtip", i < 2 ? "start" : i > 9 ? "end" : "")} style={{ bottom: height }}>
                                <b><span>{short(value / 100, currency)}</span></b>
                                <span><span>{`Week of ${weekLabel(start)}`}</span></span>
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                    <div className="wkx" aria-hidden="true">
                      {data.weekly.weeks.map((start, i) => (
                        <span key={start}><span>{i % 4 === 0 ? weekLabel(start) : ""}</span></span>
                      ))}
                    </div>
                    <div className="wkn">
                      <i></i>
                      {`Lighter column: this week so far (${short(thisWeek / 100, currency)})`}
                    </div>
                  </div>
                ) : (
                  <div className="vt" role="table" aria-label="Invoiced revenue by week">
                    <div className="vtr vth" role="row">
                      <span role="columnheader">Week of</span>
                      <span role="columnheader" className="r2">Invoiced</span>
                    </div>
                    {data.weekly.weeks.map((start, i) => (
                      <div key={start} className="vtr" role="row">
                        <span role="cell"><span>{weekLabel(start)}</span></span>
                        <span role="cell" className="r2"><span>{short((weekTotals[i] ?? 0) / 100, currency)}</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
            <section className="card c" aria-label="Revenue by customer">
              <div className="ch" style={{ minHeight: "58px" }}>
                <div className="f1 c">
                  <h2 className="h2">Revenue by customer</h2>
                  <span className="fs12 mu">{span(data.monthStart, data.today)}</span>
                </div>
                <div className="seg sm" role="group" aria-label="Show revenue by customer as">
                  <button className={c.c} onClick={c.chart} aria-pressed={c.cp}>Chart</button>
                  <button className={c.t} onClick={c.table} aria-pressed={c.tp}>Table</button>
                </div>
              </div>
              <div className="cb">
                {!data.customers.data ? null : !customerRows.length ? (
                  <EmptyState icon="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" title="No delivered loads this month yet" />
                ) : shown("c") === "chart" ? (
                  <>
                    <ol className="rk" aria-label="Largest customers first">
                      {customerRows.slice(0, 6).map((row) => {
                        const value = cents(String(row.revenue ?? "0"));
                        return (
                          <li key={String(row.label)} className="rkr">
                            <span className="rkn ell"><span>{String(row.label)}</span></span>
                            <span className="rkt">
                              <span className="rkb" style={{ width: `${topCustomer ? ((value / topCustomer) * 72).toFixed(1) : 0}%` }}></span>
                              <span className="rkv"><span>{short(value / 100, currency)}</span></span>
                            </span>
                            <span className="rks"><span>{pct(value, customerTotal)}</span></span>
                          </li>
                        );
                      })}
                    </ol>
                    {customerRows[0] && customerTotal ? (
                      <p className="note" style={{ marginTop: "10px" }}>
                        <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
                        <span>{`${String(customerRows[0].label)} is ${pct(cents(String(customerRows[0].revenue ?? "0")), customerTotal)} of ${longMonth(data.today)} so far. Shares over 30% are a concentration risk.`}</span>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div className="vt" role="table" aria-label="Revenue by customer">
                    <div className="vtr vth" role="row">
                      <span role="columnheader">Customer</span>
                      <span role="columnheader" className="r2">Revenue</span>
                      <span role="columnheader" className="r2">Share</span>
                    </div>
                    {customerRows.map((row) => (
                      <div key={String(row.label)} className="vtr" role="row">
                        <span role="cell"><span>{String(row.label)}</span></span>
                        <span role="cell" className="r2"><span>{short(String(row.revenue ?? "0"), currency)}</span></span>
                        <span role="cell" className="r2"><span>{pct(cents(String(row.revenue ?? "0")), customerTotal)}</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
            <section className="card c" aria-label="Where each dollar went">
              <div className="ch" style={{ minHeight: "58px" }}>
                <div className="f1 c">
                  <h2 className="h2">Where each dollar went</h2>
                  <span className="fs12 mu">{`${longMonth(data.lastMonth.from)} · ${short(split.revenue, currency)} revenue`}</span>
                </div>
                <div className="seg sm" role="group" aria-label="Show the cost split as">
                  <button className={sp.c} onClick={sp.chart} aria-pressed={sp.cp}>Chart</button>
                  <button className={sp.t} onClick={sp.table} aria-pressed={sp.tp}>Table</button>
                </div>
              </div>
              <div className="cb c g14">
                {!split.ready ? null : !revenue ? (
                  <EmptyState icon="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" title={`No revenue recorded in ${longMonth(data.lastMonth.from)}`} />
                ) : shown("s") === "chart" ? (
                  <>
                    <div className="sgb" role="group" aria-label={`${longMonth(data.lastMonth.from)} revenue split into costs and margin`}>
                      {parts.map((part, i) => {
                        const key = `s${i}`;
                        const share = pct(part.amount, revenue);
                        return (
                          <button key={part.n} className="sgs" style={{ flex: `${part.amount} 1 0px`, background: `var(--${part.v})` }} aria-label={`${part.n}: ${short(part.amount / 100, currency)}, ${share} of revenue`} onMouseEnter={() => setTip(key)} onFocus={() => setTip(key)} onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}>
                            {part.amount / revenue >= 0.08 ? <span><span>{share}</span></span> : null}
                            {tip === key ? (
                              <span className={clsx("vtip", i === 0 ? "start" : i === parts.length - 1 ? "end" : "")} style={{ bottom: "100%" }}>
                                <b><span>{short(part.amount / 100, currency)}</span></b>
                                <span><span>{part.n}</span>{" · "}<span>{share}</span></span>
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                    <div className="lgd" aria-hidden="true">
                      {parts.map((part) => (
                        <span key={part.n}>
                          <i style={{ background: `var(--${part.v})` }}></i>
                          <span>{part.n}</span>
                        </span>
                      ))}
                    </div>
                    <div className="bzs">
                      <div>
                        <span className="fs12 t3">Operating ratio</span>
                        <span className="fs16 w6 tx">{pct(costs, revenue)}</span>
                      </div>
                      <div>
                        <span className="fs12 t3">Revenue per mile</span>
                        <span className="fs16 w6 tx">{split.miles ? `$${(revenue / 100 / split.miles).toFixed(2)}` : dash}</span>
                      </div>
                      <div>
                        <span className="fs12 t3">Cost per mile</span>
                        <span className="fs16 w6 tx">{split.miles ? `$${(costs / 100 / split.miles).toFixed(2)}` : dash}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="vt" role="table" aria-label={`${longMonth(data.lastMonth.from)} revenue split`}>
                    <div className="vtr vth" role="row">
                      <span role="columnheader">Part</span>
                      <span role="columnheader" className="r2">Amount</span>
                      <span role="columnheader" className="r2">Share</span>
                    </div>
                    {parts.map((part) => (
                      <div key={part.n} className="vtr" role="row">
                        <span role="cell"><span>{part.n}</span></span>
                        <span role="cell" className="r2"><span>{short(part.amount / 100, currency)}</span></span>
                        <span role="cell" className="r2"><span>{pct(part.amount, revenue)}</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      ) : null}
      <div className="dgrid">
        <div className="c g16">
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Needs attention</h2>
              <span className="cnt" data-k={exceptions.some((e) => e.severity === "high") ? "bad" : "warn"}><span>{exceptions.length}</span></span>
              <span className="sp"></span>
              <button className="lnk" onClick={() => set(goTo("alerts"))}>View all exceptions</button>
            </div>
            {data.exceptions.isSuccess && !exceptions.length ? <EmptyState icon="M5 12l5 5 9-10" title="Nothing needs you right now" text="Late loads, expired paperwork, overdue invoices and urgent repairs show up here." /> : null}
            {exceptions.slice(0, 6).map((a) => {
              const target = placeOf(a);
              return (
                <div key={a.code} className="attn">
                  <span className="badge" data-k={SEVERITY_TONE[a.severity] ?? "mu"}>
                    <i></i>
                    <span>{areaOf(a)}</span>
                  </span>
                  <div className="mw0">
                    <div className="r g8">
                      <span className="fs13 w5 ell"><span>{a.title}</span></span>
                      <span className="fs12 t3 w5 nw mono"><span>{formatNumber(a.count)}</span></span>
                    </div>
                    <div className="fs12 mu ell"><span>{a.detail}</span></div>
                  </div>
                  <span className="fs12 mu num rt"><span>now</span></span>
                  {target ? <button className="btn sm" onClick={() => set(target)}><span>Review</span></button> : <span></span>}
                </div>
              );
            })}
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2"><span>{t.title}</span></h2>
              <span className="fs12 mu"><span>{t.sub}</span></span>
              <span className="sp"></span>
              <button className="lnk" onClick={t.go}><span>{t.link}</span></button>
            </div>
            <div className="thead" style={{ gridTemplateColumns: t.cols }}>
              {t.head.map((h, i) => (
                <span key={i} className={h === "Amount" ? "rt" : ""}><span>{h}</span></span>
              ))}
            </div>
            {!t.loading && !t.rows.length ? <EmptyState icon="M5 12l5 5 9-10" title={t.empty} /> : null}
            {t.rows.map((r) => (
              <Fragment key={r.key}>
                <div className="trow" style={{ gridTemplateColumns: t.cols }} onClick={r.open}>
                  {r.cells.map((c2, i2) => (
                    <BasicCell key={i2} c={c2} />
                  ))}
                </div>
              </Fragment>
            ))}
          </section>
        </div>
        <div className="c g16">
          {side.map((widget) => (
            <section key={widget.title} className="card oh">
              <div className="ch">
                <h2 className="h2"><span>{widget.title}</span></h2>
                <span className="sp"></span>
                {widget.kind === "list" && widget.link ? (
                  <button className="lnk" onClick={widget.go}><span>{widget.link}</span></button>
                ) : null}
                {widget.kind !== "list" && widget.note ? (
                  <span className="fs12 mu"><span>{widget.note}</span></span>
                ) : null}
              </div>
              {widget.kind === "avail" ? (
                <div className="cb c g16">
                  {widget.rows.map((f) => (
                    <div key={f.label} className="c g6">
                      <div className="r jb fs13">
                        <span className="w5"><span>{f.label}</span></span>
                        <span className="fs12 mu num"><span>{formatNumber(f.total)}</span>{" total"}</span>
                      </div>
                      <div className="segbar">
                        {f.segs.map((sg) => (
                          <span key={sg.l} data-k={sg.k} style={{ width: sg.w }}></span>
                        ))}
                      </div>
                      <div className="r wrap" style={{ columnGap: "12px", rowGap: "2px" }}>
                        {f.segs.map((sg) => (
                          <span key={sg.l} className="r g4 fs12 t3">
                            <span className="qd" data-k={sg.k} style={{ width: "7px", height: "7px", borderRadius: "2px" }}></span>
                            <span>{sg.l}</span>
                            <span className="w6 tx num"><span>{sg.n}</span></span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {widget.kind === "list" ? (
                widget.items.length ? (
                  widget.items.map((x) => (
                    <div key={`${x.a}-${x.b}`} className="wl">
                      <div className="f1">
                        <div className="fs13 w5 ell">{x.a}</div>
                        <div className="fs12 mu ell">{x.b}</div>
                      </div>
                      <span className="tag mono" data-k={x.k}>{x.chip}</span>
                    </div>
                  ))
                ) : (
                  <div className="cb fs13 mu">{widget.empty}</div>
                )
              ) : null}
              {widget.kind === "money" ? (
                <>
                  <div className="money">
                    {widget.items.map((m) => (
                      <div key={m.label} className="c g2">
                        <span className="r g6 fs12 t3 w5">
                          <span className="dot" data-k={m.k}></span>
                          {m.label}
                        </span>
                        <span className="fs20 w6 num mono">{m.v}</span>
                        <span className="fs12 mu">{m.s}</span>
                      </div>
                    ))}
                  </div>
                  <p className="note" style={{ padding: "0 16px 14px" }}>
                    <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
                    <span>{widget.foot}</span>
                  </p>
                </>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
