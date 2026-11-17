"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { cell } from "@/components/data-table/cell";
import { Confirm } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { addOf } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import type { Cell } from "@/features/console/view";
import { ListScreen } from "@/features/lists/list-screen";
import { useList, type ListPage, type ListQuery } from "@/features/lists/use-list";
import { CATEGORY, ownerInitials } from "@/features/owners/labels";
import { ownerRanges, rangeLabel } from "@/features/owners/owner-record";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatMoney, toCents } from "@/lib/format/money";
import { formatNumber, initials, plural } from "@/lib/format/text";

type DriverRow = Schema<"SettlementListItem">;
type OwnerRow = Schema<"OwnerSettlementRow">;
type Row = (DriverRow & { source: "driver" }) | (OwnerRow & { source: "owner" });

const STATUS: Record<string, [label: string, tone: string]> = { draft: ["Draft", "draft"], approved: ["Approved", "ok"], paid: ["Paid", "completed"], void: ["Void", "cancelled"] };
const PAY_KIND: Record<string, [label: string, tone: string]> = { company: ["Company driver", "mu"], team: ["Company · team", "info"], owners_driver: ["Owner’s driver", "teal"], owners_team: ["Owner’s team", "violet"] };
const DAY = 86_400_000;

/** Statements: one per payee per week. Driver pay for company, team and owners' drivers; owner settlements. */
export function StatementsScreen() {
  const { me, can, I, set, state, notify } = useConsole();
  const act = useAction();
  const org = me.organization;
  const money = (value: string | number | null | undefined) => formatMoney(value, org.base_currency);
  const signed = (value: string, sign: "+" | "−"): Cell => ((toCents(value) ?? 0) === 0 ? cell.money("—", "", "mu") : cell.money(`${sign}${money(value)}`, "", "t2"));
  const manage = can("settlements.manage");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: org.timezone });
  const lastWeek = ownerRanges(today).wk!;
  const [running, setRunning] = useState(false);

  // The week on screen: the latest week with statements, or last week when there are none yet.
  const latest = useQuery({
    queryKey: [org.id, "settlements", "latest-week"],
    queryFn: async () => {
      const [drivers, owners] = await Promise.all([
        unwrap(api.GET("/api/v1/settlements", { params: { query: { sort: "-period_end", limit: 1 } } })),
        unwrap(api.GET("/api/v1/owner-settlements", { params: { query: { sort: "-period_end", limit: 1 } } })),
      ]);
      const starts = [drivers.items[0]?.period_start, owners.items[0]?.period_start].filter(Boolean) as string[];
      return starts.sort().at(-1) ?? null;
    },
  });
  const weekStart = latest.data ?? lastWeek.from;
  const weekEnd = new Date(Date.parse(`${weekStart}T12:00:00Z`) + 6 * DAY).toISOString().slice(0, 10);
  const week = { period_from: weekStart, period_to: weekEnd };
  const summary = useQuery({ queryKey: [org.id, "owner-settlements", "summary", weekStart], queryFn: () => unwrap(api.GET("/api/v1/owner-settlements/summary", { params: { query: { period_start: weekStart, period_end: weekEnd } } })), enabled: latest.isFetched });
  const s = summary.data;
  const tab = typeof state.ltab === "number" ? state.ltab : 0;
  const payDay = new Date(Date.parse(`${weekEnd}T12:00:00Z`) + 5 * DAY).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  const openDriver = (t: DriverRow) => set({ screen: "stmt", statementId: t.id, drawer: null, overlay: "none", modal: "none" });
  const openOwner = (t: OwnerRow) => set({ screen: "ostmt", statementId: t.id, drawer: null, overlay: "none", modal: "none" });
  const approveDriver = (t: DriverRow) => void act(() => unwrap(api.POST("/api/v1/settlements/{settlement_id}/approve", { params: { path: { settlement_id: t.id } }, body: { version: t.version } })), (x) => `Statement ${x.number ?? ""} approved for ${t.driver.name}`);
  const approveOwner = (t: OwnerRow) => void act(() => unwrap(api.POST("/api/v1/owner-settlements/{settlement_id}/approve", { params: { path: { settlement_id: t.id } }, body: { version: t.version } })), (x) => `Settlement ${x.number ?? ""} approved for ${t.owner_name}`);
  const payDriver = (t: DriverRow) => set({ ...addOf("payout"), fv: { "payout.statement": t.id } });

  const fetch = async (query: ListQuery): Promise<ListPage<Row>> => {
    const { source, ...rest } = query;
    if (source === "owner") {
      const page = await unwrap(api.GET("/api/v1/owner-settlements", { params: { query: { ...rest, ...week } as never } }));
      return { items: page.items.map((x) => ({ ...x, source: "owner" as const })), page: page.page };
    }
    const page = await unwrap(api.GET("/api/v1/settlements", { params: { query: { ...rest, ...week } as never } }));
    return { items: page.items.map((x) => ({ ...x, source: "driver" as const })), page: page.page };
  };
  const action = (t: Row): Cell =>
    t.source === "driver"
      ? manage && t.status === "draft" ? cell.button("Approve", () => approveDriver(t)) : manage && t.status === "approved" ? cell.button("Mark paid", () => payDriver(t)) : cell.button("View", () => openDriver(t))
      : manage && t.status === "draft" ? cell.button("Approve", () => approveOwner(t)) : cell.button("View", () => openOwner(t));

  const driverColumns = [
    { label: "Driver", width: "200px", cell: (t: Row) => (t.source === "driver" ? cell.person(t.driver.name, initials(t.driver.name)) : cell.maybe(null)) },
    { label: "Pay type", width: "150px", cell: (t: Row) => (t.source === "driver" ? cell.tags([{ v: PAY_KIND[t.context.pay_kind]?.[0] ?? "", k: PAY_KIND[t.context.pay_kind]?.[1] ?? "mu" }]) : cell.maybe(null)) },
    { label: "Works for", width: "200px", cell: (t: Row) => (t.source === "driver" ? cell.maybe(t.context.works_for) : cell.maybe(null)) },
    { label: "Team partner", width: "150px", cell: (t: Row) => (t.source === "driver" ? cell.maybe(t.context.team_partner) : cell.maybe(null)) },
    { label: "Truck", width: "84px", cell: (t: Row) => (t.source === "driver" ? cell.maybe(t.context.truck, "mono w5") : cell.maybe(null)) },
    { label: "Truck owner", width: "190px", cell: (t: Row) => (t.source === "driver" ? cell.maybe(t.context.truck_owner, t.context.truck_owner === "Company fleet" ? "mu" : "w5") : cell.maybe(null)) },
    { label: "Loads", width: "64px", right: true, cell: (t: Row) => cell.num(t.source === "driver" ? String(t.context.loads) : "") },
    { label: "Miles", width: "96px", right: true, cell: (t: Row) => (t.source === "driver" ? cell.num(formatNumber(t.context.miles), t.context.team_partner ? "team miles" : "") : cell.maybe(null)) },
    { label: "Pay basis", width: "180px", cell: (t: Row) => (t.source === "driver" ? cell.maybe(t.context.pay_basis, "t2") : cell.maybe(null)) },
    { label: "Gross pay", width: "112px", right: true, cell: (t: Row) => (t.source === "driver" ? cell.money(money(t.earnings)) : cell.maybe(null)) },
    { label: "Deductions", width: "112px", right: true, cell: (t: Row) => (t.source === "driver" ? signed(t.deductions, "−") : cell.maybe(null)) },
    { label: "Reimbursed", width: "112px", right: true, cell: (t: Row) => (t.source === "driver" ? signed(t.reimbursements, "+") : cell.maybe(null)) },
    { label: "Net pay", width: "120px", right: true, sort: "net_pay", cell: (t: Row) => (t.source === "driver" ? cell.money(money(t.net_pay), "", "w6") : cell.maybe(null)) },
    { label: "Status", width: "112px", cell: (t: Row) => cell.badge(...(STATUS[t.status] ?? [t.status, "mu"])) },
    { label: "", width: "100px", cell: action },
  ];
  const ownerColumns = [
    { label: "Owner", width: "230px", cell: (t: Row) => (t.source === "owner" ? cell.person(t.owner_name, ownerInitials({ name: t.owner_name, entity_type: t.entity_type })) : cell.maybe(null)) },
    { label: "Entity", width: "96px", cell: (t: Row) => cell.text(t.source === "owner" ? (t.entity_type === "business" ? "Business" : "Individual") : "", "", "t2") },
    { label: "Category", width: "170px", cell: (t: Row) => (t.source === "owner" ? cell.tags([{ v: CATEGORY[t.category]?.[0] ?? t.category, k: CATEGORY[t.category]?.[1] ?? "mu" }]) : cell.maybe(null)) },
    { label: "Trucks", width: "64px", right: true, cell: (t: Row) => cell.num(t.source === "owner" ? String(t.trucks) : "") },
    { label: "Trailers", width: "72px", right: true, cell: (t: Row) => cell.num(t.source === "owner" && t.trailers ? String(t.trailers) : "—") },
    { label: "Loads", width: "64px", right: true, cell: (t: Row) => cell.num(t.source === "owner" ? String(t.loads) : "") },
    { label: "Load revenue", width: "120px", right: true, cell: (t: Row) => (t.source === "owner" && toCents(t.load_revenue) ? cell.money(money(t.load_revenue)) : cell.money("—", "", "mu")) },
    { label: `${org.name}’s share`, width: "140px", right: true, cell: (t: Row) => (t.source === "owner" && toCents(t.carrier_share) ? cell.money(money(t.carrier_share), "", "t2") : cell.money("—", "", "mu")) },
    { label: "Owner gross", width: "120px", right: true, cell: (t: Row) => (t.source === "owner" ? cell.money(money(t.owner_gross)) : cell.maybe(null)) },
    { label: "Fuel", width: "104px", right: true, cell: (t: Row) => (t.source === "owner" ? signed(t.fuel, "−") : cell.maybe(null)) },
    { label: "Driver pay run", width: "120px", right: true, cell: (t: Row) => (t.source === "owner" ? signed(t.driver_pay_run, "−") : cell.maybe(null)) },
    { label: "Other costs", width: "112px", right: true, cell: (t: Row) => (t.source === "owner" ? signed(t.other_costs, "−") : cell.maybe(null)) },
    { label: "Escrow", width: "100px", right: true, cell: (t: Row) => (t.source === "owner" ? signed(t.escrow, "−") : cell.maybe(null)) },
    { label: "Net", width: "120px", right: true, sort: "net", cell: (t: Row) => (t.source === "owner" ? cell.money(money(t.net), "", "w6") : cell.maybe(null)) },
    { label: "Status", width: "112px", cell: (t: Row) => cell.badge(...(STATUS[t.status] ?? [t.status, "mu"])) },
    { label: "", width: "100px", cell: action },
  ];

  const exportPayFile = async () => {
    const response = await window.fetch(`/api/v1/settlement-pay-file?period_start=${weekStart}`);
    if (!response.ok) return notify("The pay file couldn’t be made", true);
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `pay-file-${weekStart}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const list = useList<Row>({
    key: "statements",
    group: "Finance",
    title: "Statements",
    sub: () => `Week of ${rangeLabel(weekStart, weekEnd)} · pays ${payDay} · one statement per payee per week`,
    placeholder: tab === 1 ? "Owner or statement #" : "Name, truck or owner",
    fetch,
    defaultSort: tab === 1 ? "-net" : "-net_pay",
    tabs: [{ label: "Driver pay", params: { source: "driver" } }, { label: "Owner settlements", params: { source: "owner" } }],
    frozen: 1,
    open: (t) => (t.source === "driver" ? openDriver(t) : openOwner(t)),
    columns: tab === 1 ? ownerColumns : driverColumns,
    adds: ["Status", "Pay type", "Truck owner"],
    actions: manage
      ? [
          { l: "Export pay file", cls: "", ic: I.download, go: () => void exportPayFile() },
          { l: "Run statements", cls: "pri", ic: I.play, go: () => setRunning(true) },
        ]
      : [],
    kpis: [
      { label: "Company and team driver pay", value: s ? money(s.driver_pay) : "—", suffix: "", sub: s ? `${plural(s.drivers, "driver")} · paid by ${org.name}` : "", k: "brand", sk: "mu" },
      { label: "Driver pay run for owners", value: s ? money(s.driver_pay_run) : "—", suffix: "", sub: s ? (s.pay_run_drivers ? `${plural(s.pay_run_drivers, "driver")} · charged to ${plural(s.pay_run_owners, "owner")}` : "No owners’ drivers this week") : "", k: "mu", sk: "mu" },
      { label: "Owner settlements · net", value: s ? money(s.owner_net) : "—", suffix: "", sub: s ? `${plural(s.owner_settlements, "owner")} · ${plural(s.owner_trucks, "truck")} · ${plural(s.owner_trailers, "trailer")}` : "", k: "teal", sk: "mu" },
      { label: "Escrow held for owners", value: s ? money(s.escrow_held) : "—", suffix: "", sub: s ? (s.escrow_due.length ? `${s.escrow_due.map((x) => x.name).join(", ")}: refund due` : "No refunds due") : "", k: "warn", sk: s?.escrow_due.length ? "warn" : "mu" },
    ],
    callout: { t: "Every dollar has one home", d: `Customers pay load revenue. ${org.name} keeps its share under each truck’s agreement and pays its company drivers from it. Owners get their share minus their own costs, on one owner settlement a week. Owner-operators are paid only there, never on a driver statement too, and team drivers each get their own statement.`, ic: I.info, k: "info", b: "" },
    empty: {
      icon: I.dollar,
      title: tab === 1 ? "No owner settlements for this week" : "No driver statements for this week",
      text: "Run statements when the week closes: one draft per payee, built from delivered loads, expenses and each unit’s agreement.",
      action: manage ? { label: "Run statements", go: () => setRunning(true) } : undefined,
    },
  });
  return (
    <>
      <ListScreen list={list} />
      {running ? (
        <Confirm title={`Run statements for ${lastWeek.label}`} text="Drafts a statement for every driver and owner who doesn’t have one for that week. Drafts can be checked and recalculated before they’re approved." confirm="Run statements"
          onClose={() => setRunning(false)}
          run={async () => {
            const result = await unwrap(api.POST("/api/v1/settlement-runs", { body: { period_start: lastWeek.from, period_end: lastWeek.to } }));
            await act(async () => undefined, `${plural(result.drivers_created, "driver statement")} and ${plural(result.owners_created, "owner settlement")} drafted${result.skipped.length ? ` · ${result.skipped.length} skipped` : ""}`);
          }} />
      ) : null}
    </>
  );
}
