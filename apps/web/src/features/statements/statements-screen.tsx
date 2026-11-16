"use client";

import { useQuery } from "@tanstack/react-query";
import { cell } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { addOf } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import type { Cell } from "@/features/console/view";
import { ListScreen } from "@/features/lists/list-screen";
import { STATEMENT_TABS } from "@/features/lists/tabs";
import { useList, type ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDate } from "@/lib/format/dates";
import { formatMoney, toCents } from "@/lib/format/money";
import { initials, plural } from "@/lib/format/text";

type Statement = Schema<"SettlementListItem">;

const STATUS: Record<string, [label: string, tone: string]> = { draft: ["Draft", "draft"], approved: ["Approved", "ok"], paid: ["Paid", "completed"], void: ["Void", "cancelled"] };
const signed = (value: string, sign: "+" | "−", money: (v: string) => string): Cell => ((toCents(value) ?? 0) === 0 ? cell.money("—", "", "mu") : cell.money(`${sign}${money(value)}`, "", "t2"));

/** Statements: one pay statement per driver per period, from draft to paid. */
export function StatementsScreen() {
  const { me, can, I, set } = useConsole();
  const act = useAction();
  const org = me.organization;
  const money = (value: string | number | null | undefined) => formatMoney(value, org.base_currency);
  const summary = useQuery({ queryKey: [org.id, "settlements", "summary"], queryFn: () => unwrap(api.GET("/api/v1/settlements/summary")), staleTime: 30_000 });
  const manage = can("settlements.manage");
  const open = (statement: Statement) => set({ screen: "stmt", statementId: statement.id, drawer: null, overlay: "none", modal: "none" });

  const approve = (statement: Statement) =>
    void act(() => unwrap(api.POST("/api/v1/settlements/{settlement_id}/approve", { params: { path: { settlement_id: statement.id } }, body: { version: statement.version } })), (approved) => `Statement ${approved.number ?? ""} approved for ${statement.driver.name}`.replace("  ", " "));
  // paying asks how and when it was paid
  const pay = (statement: Statement) => set({ ...addOf("payout"), fv: { "payout.statement": statement.id } });

  const s = summary.data;
  const list = useList<Statement>({
    key: "settlements",
    group: "Finance",
    title: "Statements",
    sub: () => "One statement per driver per pay period · approved before it is paid",
    placeholder: "Driver or statement #",
    fetch: (query: ListQuery) => unwrap(api.GET("/api/v1/settlements", { params: { query: query as never } })),
    defaultSort: "-period_end",
    tabs: STATEMENT_TABS,
    open,
    columns: [
      { label: "Driver", width: "minmax(200px,1.2fr)", cell: (t) => cell.person(t.driver.name, initials(t.driver.name)) },
      { label: "Statement", width: "120px", cell: (t) => cell.text(t.number ?? "Draft", "", t.number ? "mono fs12 w5" : "mu") },
      { label: "Period", width: "minmax(170px,0.9fr)", sort: "period_end", cell: (t) => cell.text(`${formatDate(t.period_start)} – ${formatDate(t.period_end)}`, "", "num") },
      { label: "Gross pay", width: "112px", right: true, cell: (t) => cell.money(money(t.earnings)) },
      { label: "Deductions", width: "112px", right: true, cell: (t) => signed(t.deductions, "−", money) },
      { label: "Reimbursed", width: "112px", right: true, cell: (t) => signed(t.reimbursements, "+", money) },
      { label: "Net pay", width: "120px", right: true, sort: "net_pay", cell: (t) => cell.money(money(t.net_pay), "", "w6") },
      { label: "Paid on", width: "112px", cell: (t) => cell.maybe(t.paid_on ? formatDate(t.paid_on) : "", "num") },
      { label: "Status", width: "112px", cell: (t) => cell.badge(...(STATUS[t.status] ?? [t.status, "mu"])) },
      { label: "", width: "92px", cell: (t) => (manage && t.status === "draft" ? cell.button("Approve", () => approve(t)) : manage && t.status === "approved" ? cell.button("Mark paid", () => pay(t)) : cell.button("View", () => open(t))) },
    ],
    actions: manage ? [{ l: "Run statements", cls: "pri", ic: I.plus, go: () => set(addOf("statement")) }] : [],
    kpis: s
      ? [
          { label: "Drafts in progress", value: String(s.drafts), suffix: "", sub: "Not yet approved", k: "draft", sk: "" },
          { label: "Approved, not yet paid", value: money(s.to_pay), suffix: "", sub: plural(s.approved_unpaid, "statement"), k: "warn", sk: "" },
          { label: "Paid this month", value: money(s.paid_this_month), suffix: "", sub: "By pay date", k: "ok", sk: "" },
        ]
      : undefined,
    empty: {
      icon: I.dollar,
      title: "No statements yet",
      text: "A statement gathers a driver’s completed loads and expenses for a period. Run one when the period closes.",
      action: manage ? { label: "Run statements", go: () => set(addOf("statement")) } : undefined,
    },
  });
  return <ListScreen list={list} />;
}
