"use client";

import { useQuery } from "@tanstack/react-query";
import { cell } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { addOf } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import type { Cell } from "@/features/console/view";
import { ListScreen } from "@/features/lists/list-screen";
import { INVOICE_TABS } from "@/features/lists/tabs";
import { useList, type ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDate } from "@/lib/format/dates";
import { formatMoney, toCents } from "@/lib/format/money";
import { plural } from "@/lib/format/text";

type Invoice = Schema<"InvoiceListItem">;

function statusCell(invoice: Invoice): Cell {
  if (invoice.status === "draft") return cell.badge("Draft", "draft");
  if (invoice.status === "void") return cell.badge("Void", "cancelled");
  if (invoice.status === "paid") return cell.badge("Paid", "completed");
  if (invoice.is_overdue) return cell.badge("Overdue", "bad");
  return (toCents(invoice.paid) ?? 0) > 0 ? cell.badge("Partially paid", "warn") : cell.badge("Issued", "info");
}

const AGES: [key: string, label: string, tone: string][] = [["current", "Current", "ok"], ["days_1_30", "1–30 days", "info"], ["days_31_60", "31–60 days", "warn"], ["days_61_90", "61–90 days", "late"], ["days_over_90", "90+ days", "bad"]];

/** Invoices: what has been billed, what is still owed and how old it is. */
export function InvoicesScreen() {
  const { me, can, I, set } = useConsole();
  const act = useAction();
  const org = me.organization;
  const money = (value: string | number | null | undefined) => formatMoney(value, org.base_currency);
  const receivables = useQuery({ queryKey: [org.id, "finance", "receivables"], queryFn: () => unwrap(api.GET("/api/v1/finance/receivables")), staleTime: 30_000 });
  const aging = useQuery({ queryKey: [org.id, "reports", "ar-aging"], queryFn: () => unwrap(api.GET("/api/v1/reports/ar-aging")), enabled: can("reports.read"), staleTime: 60_000 });
  const manage = can("invoices.create");
  const record = can("payments.record");

  const issue = (invoice: Invoice) => void act(() => unwrap(api.POST("/api/v1/invoices/{invoice_id}/issue", { params: { path: { invoice_id: invoice.id } } })), (issued) => `Invoice ${issued.invoice_number} issued`);
  const pay = (invoice: Invoice) => set({ ...addOf("payment"), fv: { "payment.invoice": invoice.id, "payment.customer": invoice.customer.id, "payment.amount": invoice.balance } });

  const totals = aging.data?.totals;
  const owed = toCents(String(totals?.total ?? "0")) ?? 0;
  const r = receivables.data;

  const list = useList<Invoice>({
    key: "invoices",
    group: "Finance",
    title: "Invoices",
    sub: () => "Issued invoices are immutable — to correct one, void it and issue it again",
    placeholder: "Invoice # or customer",
    fetch: (query: ListQuery) => unwrap(api.GET("/api/v1/invoices", { params: { query: query as never } })),
    defaultSort: "-created_at",
    tabs: INVOICE_TABS,
    columns: [
      { label: "Invoice", width: "120px", cell: (i) => cell.text(i.invoice_number ?? "Draft", "", i.invoice_number ? "mono fs12 w5" : "mu") },
      { label: "Customer", width: "minmax(0,1.3fr)", sort: "customer", cell: (i) => cell.text(i.customer.name) },
      { label: "Issued", width: "110px", cell: (i) => cell.maybe(i.issue_date ? formatDate(i.issue_date) : "", "num") },
      { label: "Due", width: "110px", cell: (i) => cell.maybe(i.due_date ? formatDate(i.due_date) : "", "num") },
      { label: "Amount", width: "120px", right: true, sort: "total", cell: (i) => cell.money(money(i.total)) },
      { label: "Balance", width: "120px", right: true, cell: (i) => cell.money(money(i.balance)) },
      { label: "Status", width: "132px", cell: statusCell },
      { label: "Notes", width: "minmax(0,1fr)", cell: (i) => cell.maybe(i.is_overdue ? `${plural(i.days_overdue, "day")} late` : "", "t2") },
      {
        label: "",
        width: "132px",
        cell: (i) => (i.status === "draft" && manage ? cell.button("Issue", () => issue(i)) : i.status === "issued" && record ? cell.button("Record payment", () => pay(i)) : cell.text("")),
      },
    ],
    actions: [
      ...(record ? [{ l: "Record payment", cls: "", ic: "", go: () => set(addOf("payment")) }] : []),
      ...(manage ? [{ l: "New invoice", cls: "pri", ic: I.plus, go: () => set(addOf("invoice")) }] : []),
    ],
    kpis: r
      ? [
          { label: "Open receivables", value: money(r.open_balance), suffix: "", sub: `${plural(r.open_invoices, "invoice")} issued and unpaid`, k: "info", sk: "" },
          { label: "Overdue", value: money(r.overdue_balance), suffix: "", sub: `${plural(r.overdue_invoices, "invoice")} past due`, k: "bad", sk: r.overdue_invoices ? "bad" : "" },
          { label: "Delivered, not invoiced", value: money(r.ready_to_invoice_amount), suffix: "", sub: `${plural(r.ready_to_invoice_loads, "load")} ready · ${plural(r.draft_invoices, "draft")}`, k: "warn", sk: "" },
        ]
      : undefined,
    band:
      totals && owed > 0
        ? {
            title: "Open receivables by age",
            sub: `as of ${formatDate(aging.data?.date_to)} · by invoice due date`,
            total: money(String(totals.total)),
            segs: AGES.map(([key, l, k]) => ({ l, k, v: money(String(totals[key] ?? "0")), w: `${(((toCents(String(totals[key] ?? "0")) ?? 0) / owed) * 100).toFixed(2)}%` })),
          }
        : undefined,
    empty: {
      icon: I.invoice,
      title: "No invoices yet",
      text: "An invoice is made from completed loads. Once a load’s proof of delivery is approved, it is ready to bill.",
      action: manage ? { label: "New invoice", go: () => set(addOf("invoice")) } : undefined,
    },
  });
  return <ListScreen list={list} />;
}
