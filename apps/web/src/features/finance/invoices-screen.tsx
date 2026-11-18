"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cell } from "@/components/data-table/cell";
import { Confirm } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { addOf } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import type { Cell } from "@/features/console/view";
import { ListScreen } from "@/features/lists/list-screen";
import { INVOICE_TABS, READY_TAB } from "@/features/lists/tabs";
import { useList, type Column, type ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { todayIn } from "@/lib/format/dates";
import { formatMoney, toCents } from "@/lib/format/money";
import { place, plural } from "@/lib/format/text";

type Invoice = Schema<"InvoiceListItem">;
type ReadyLoad = Schema<"LoadListItem">;
/** A row of the list: an invoice, or on "Ready to invoice" a delivered load not yet on one. */
type Item = { id: string; invoice: Invoice; load?: never } | { id: string; load: ReadyLoad; invoice?: never };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Oct 2", with the year only when it isn't this year's. */
function day(iso: string | null | undefined, thisYear: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}${y === thisYear ? "" : `, ${y}`}`;
}
/** "Nov 1–13": a range within one month, or two dates. */
function span(from: string, to: string, thisYear: string): string {
  if (from === to) return day(from, thisYear);
  return from.slice(0, 7) === to.slice(0, 7) ? `${day(from, thisYear)}–${Number(to.slice(8, 10))}` : `${day(from, thisYear)} – ${day(to, thisYear)}`;
}
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The status as the list shows it: something paid on an issued invoice reads as partially paid, late or not. */
function statusOf(i: Invoice): [label: string, tone: string] {
  if (i.status === "draft") return ["Draft", "draft"];
  if (i.status === "void") return ["Void", "mu"];
  if (i.status === "paid") return ["Paid", "ok"];
  if ((toCents(i.paid) ?? 0) > 0) return ["Partially paid", "warn"];
  if (i.is_overdue) return ["Overdue", "bad"];
  return ["Issued", "info"];
}

const only = (kind: "invoice" | "load", columns: Column<Item>[]): Column<Item>[] =>
  columns.map((column) => ({ ...column, cell: (item) => (item[kind] ? column.cell(item) : cell.text("")), csv: column.csv && ((item) => (item[kind] ? column.csv!(item) : "")) }));

const STATES: [value: string, label: string][] = [["draft", "Draft"], ["issued", "Issued"], ["partially_paid", "Partially paid"], ["overdue", "Overdue"], ["paid", "Paid"], ["void", "Void"]];
const AGES: [key: string, label: string, tone: string][] = [["current", "Current", "ok"], ["days_1_30", "1–30 days", "warn"], ["days_31_60", "31–60 days", "late"], ["days_61_90", "61–90 days", "bad"], ["days_over_90", "90+ days", "bad"]];
/** The invoice-only parameters a "Ready to invoice" page of loads leaves out. */
const INVOICE_ONLY = new Set(["open", "state", "status", "overdue", "due_from", "due_to", "ready"]);

/** Invoices: what has been billed, what is still owed and how old it is, and the delivered loads waiting for one. */
export function InvoicesScreen() {
  const { me, can, I, set, state, notify } = useConsole();
  const act = useAction();
  const client = useQueryClient();
  const org = me.organization;
  const zone = org.timezone;
  const today = todayIn(zone);
  const year = today.slice(0, 4);
  const money = (value: string | number | null | undefined) => formatMoney(value, org.base_currency);
  /** "$62.4k": an amount read at a glance. */
  const glance = (value: string | number | null | undefined) => {
    const amount = (toCents(String(value ?? "0")) ?? 0) / 100;
    const symbol = org.base_currency === "USD" ? "$" : `${org.base_currency} `;
    if (Math.abs(amount) >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
    return Math.abs(amount) >= 100 ? `${symbol}${(amount / 1000).toFixed(1)}k` : `${symbol}${Math.round(amount)}`;
  };
  const whole = (value: string | number | null | undefined) => money(Math.round((toCents(String(value ?? "0")) ?? 0) / 100)).replace(/\.00$/, "");
  const receivables = useQuery({ queryKey: [org.id, "finance", "receivables"], queryFn: () => unwrap(api.GET("/api/v1/finance/receivables")), staleTime: 30_000 });
  const aging = useQuery({ queryKey: [org.id, "reports", "ar-aging"], queryFn: () => unwrap(api.GET("/api/v1/reports/ar-aging")), enabled: can("reports.read"), staleTime: 60_000 });
  const customers = useQuery({ queryKey: [org.id, "customers", "options"], queryFn: () => unwrap(api.GET("/api/v1/customers", { params: { query: { limit: 100, sort: "name" } } })), enabled: can("customers.read"), staleTime: 60_000 });
  const manage = can("invoices.create");
  const record = can("payments.record");
  const rates = can("loads.rates.read");
  const [ask, setAsk] = useState<{ kind: "void" | "delete"; invoice: Invoice } | null>(null);
  const tabIndex = typeof state.ltab === "number" ? state.ltab : 0;
  const ready = INVOICE_TABS[tabIndex]?.label === READY_TAB;

  const refresh = () => void client.invalidateQueries({ queryKey: [org.id] });
  const issue = (invoice: Invoice) => void act(() => unwrap(api.POST("/api/v1/invoices/{invoice_id}/issue", { params: { path: { invoice_id: invoice.id } } })), (issued) => `Invoice ${issued.invoice_number} issued to ${issued.customer.name}`);
  const pay = (invoice: Invoice) => set({ ...addOf("payment"), fv: { "payment.invoice": invoice.id, "payment.customer": invoice.customer.id, "payment.amount": invoice.balance } });
  /** One draft per customer for the loads chosen, then the drafts to look over. */
  const invoiceLoads = async (loads: ReadyLoad[]) => {
    const byCustomer = new Map<string, ReadyLoad[]>();
    for (const load of loads) byCustomer.set(load.customer.id, [...(byCustomer.get(load.customer.id) ?? []), load]);
    await act(
      async () => {
        for (const [customerId, group] of byCustomer) {
          await unwrap(api.POST("/api/v1/invoices", { body: { customer_id: customerId, load_ids: group.map((l) => l.id), notes: null, due_date: null } }));
        }
        return byCustomer.size;
      },
      (made) => (made === 1 ? `Draft invoice created for ${loads[0].customer.name} · ${plural(loads.length, "load")}` : `${plural(made, "draft invoice")} created · ${plural(loads.length, "load")}`),
    );
    set({ ltab: INVOICE_TABS.findIndex((t) => t.label === "Drafts"), lsel: [], lpage: [] });
  };
  const readyFor = async (load: ReadyLoad) => {
    const page = await unwrap(api.GET("/api/v1/loads", { params: { query: { view: "ready_to_invoice", customer_id: load.customer.id, limit: 100 } } }));
    await invoiceLoads(page.items);
  };

  const fetch = async (query: ListQuery) => {
    if (query.ready) {
      // Loads take the search, the customer and the paging; the sort is their delivery.
      const params = Object.fromEntries(Object.entries(query).filter(([key]) => !INVOICE_ONLY.has(key) && key !== "sort"));
      const page = await unwrap(api.GET("/api/v1/loads", { params: { query: { ...params, view: "ready_to_invoice", sort: "delivery_at" } as never } }));
      return { ...page, items: page.items.map((load): Item => ({ id: load.id, load })) };
    }
    const params = Object.fromEntries(Object.entries(query).filter(([key]) => key !== "ready"));
    const page = await unwrap(api.GET("/api/v1/invoices", { params: { query: params as never } }));
    return { ...page, items: page.items.map((invoice): Item => ({ id: invoice.id, invoice })) };
  };

  const note = (i: Invoice): Cell => {
    const [, tone] = statusOf(i);
    if (i.status === "draft") {
      const text = (toCents(i.total) ?? 0) <= 0 ? "Nothing to bill yet" : i.due_date && i.due_date < today ? "The due date has passed" : "Ready to issue";
      return cell.text(text, "", "t3");
    }
    if (i.status === "void") return cell.text(i.void_reason ? `Voided: ${i.void_reason}` : "Voided", "", "t3");
    if (i.status === "paid") return cell.text(i.paid_on ? `Paid ${day(i.paid_on, year)}` : "Paid", "", "t3");
    if (i.is_overdue) return cell.text(`${plural(i.days_overdue, "day")} late`, "", tone === "bad" ? "w5" : "t3");
    const left = i.due_date ? daysBetween(today, i.due_date) : null;
    return cell.text(left === null ? "" : left === 0 ? "Due today" : left === 1 ? "Due tomorrow" : `Due in ${left} days`, "", "t3");
  };
  const menu = (i: Invoice): Cell => {
    const items: [string, () => void, string?][] = [];
    if (i.status === "draft" && manage) items.push(["Issue invoice", () => issue(i)], ["Delete draft", () => setAsk({ kind: "delete", invoice: i }), "bad"]);
    if (i.status === "issued" && record) items.push(["Record payment", () => pay(i)]);
    if (i.status === "issued" && manage && (toCents(i.paid) ?? 0) === 0) items.push(["Void invoice", () => setAsk({ kind: "void", invoice: i }), "bad"]);
    return cell.menu(items);
  };

  const invoiceColumns: Column<Item>[] = [
    { label: "Invoice", width: "96px", cell: ({ invoice: i }) => (i!.invoice_number ? cell.text(i!.invoice_number, "", "mono w5") : cell.text("Draft", "", "mu")) },
    { label: "Customer", width: "minmax(0,1.3fr)", sort: "customer", cell: ({ invoice: i }) => cell.text(i!.customer.name) },
    { label: "Loads", width: "52px", right: true, cell: ({ invoice: i }) => cell.num(String(i!.loads)) },
    { label: "Issued", width: "70px", sort: "issue_date", cell: ({ invoice: i }) => cell.maybe(day(i!.issue_date, year), "num t3"), csv: ({ invoice: i }) => i!.issue_date },
    { label: "Due", width: "70px", sort: "due_date", cell: ({ invoice: i }) => cell.maybe(day(i!.due_date, year), "num t3"), csv: ({ invoice: i }) => i!.due_date },
    { label: "Amount", width: "104px", right: true, sort: "total", cell: ({ invoice: i }) => cell.money(money(i!.total)), csv: ({ invoice: i }) => i!.total },
    { label: "Balance", width: "104px", right: true, cell: ({ invoice: i }) => cell.money(money(i!.balance), "", (toCents(i!.balance) ?? 0) ? "" : "mu"), csv: ({ invoice: i }) => i!.balance },
    { label: "Status", width: "124px", cell: ({ invoice: i }) => cell.badge(...statusOf(i!)) },
    { label: "Notes", width: "minmax(0,1fr)", cell: ({ invoice: i }) => note(i!) },
    { label: "", width: "28px", cell: ({ invoice: i }) => menu(i!) },
  ];
  const openLoad = (load: ReadyLoad) => set({ screen: "loads", drawer: load.id, overlay: "none", modal: "none" });
  const deliveredOn = (load: ReadyLoad) => (load.delivered_at ? new Date(load.delivered_at).toLocaleDateString("en-CA", { timeZone: zone }) : null);
  /** How long a delivered load has waited to be billed. */
  const waiting = (load: ReadyLoad) => {
    const on = deliveredOn(load);
    const days = on ? daysBetween(on, today) : null;
    return days === null ? "Proof of delivery approved" : days <= 0 ? "Delivered today" : `Delivered ${plural(days, "day")} ago`;
  };
  const loadColumns: Column<Item>[] = [
    { label: "Load", width: "96px", cell: ({ load: l }) => cell.id(l!.load_number, () => openLoad(l!)), csv: ({ load: l }) => l!.load_number },
    { label: "Customer", width: "minmax(0,1.3fr)", cell: ({ load: l }) => cell.text(l!.customer.name, l!.reference ? `Ref ${l!.reference}` : "") },
    { label: "Route", width: "minmax(0,1.4fr)", cell: ({ load: l }) => cell.text(`${place(l!.origin_city, l!.origin_state)} → ${place(l!.destination_city, l!.destination_state)}`, "", "t2") },
    { label: "Delivered", width: "84px", cell: ({ load: l }) => cell.maybe(day(deliveredOn(l!), year), "num t3"), csv: ({ load: l }) => deliveredOn(l!) },
    { label: "Amount", width: "104px", right: true, cell: ({ load: l }) => (rates ? cell.money(money(l!.revenue), "", "") : cell.maybe("")), csv: ({ load: l }) => l!.revenue },
    { label: "Status", width: "124px", cell: () => cell.badge("Ready to invoice", "brand") },
    { label: "Notes", width: "minmax(0,1fr)", cell: ({ load: l }) => cell.text(waiting(l!), "", "t3") },
    { label: "", width: "28px", cell: ({ load: l }) => cell.menu(manage ? [["Create invoice", () => void invoiceLoads([l!])], [`Invoice all ready for ${l!.customer.name}`, () => void readyFor(l!)], ["Open load", () => openLoad(l!)]] : [["Open load", () => openLoad(l!)]]) },
  ];

  const r = receivables.data;
  const totals = aging.data?.totals;
  const owed = toCents(String(totals?.total ?? "0")) ?? 0;
  const range = r ? span(r.period_from, r.period_to, year) : "";
  const weekEnd = addDays(today, 6 - ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const dues: Record<string, [label: string, from?: string, to?: string]> = {
    past: ["Past due", undefined, addDays(today, -1)],
    week: ["Due this week", today, weekEnd],
    month: ["Due in 30 days", today, addDays(today, 30)],
    later: ["Due later", addDays(today, 31), undefined],
  };

  const list = useList<Item>({
    key: "invoices",
    group: "Finance",
    title: "Invoices",
    sub: () => "Issued invoices are immutable — to correct one, void it and issue it again",
    placeholder: "Invoice #, customer or load",
    fetch,
    defaultSort: "-created_at",
    tabs: INVOICE_TABS,
    // The page of the tab just left stays up until the new one arrives, so a column draws only its own kind of row.
    columns: ready ? only("load", loadColumns) : only("invoice", invoiceColumns),
    rowClass: (item) => (item.invoice?.status === "void" ? "dim" : ""),
    open: (item) => (item.load ? openLoad(item.load) : undefined),
    bulk: ready && manage ? [{ label: "Create invoices", go: (items: Item[]) => invoiceLoads(items.flatMap((x) => (x.load ? [x.load] : []))) }, "export"] : undefined,
    noun: ready ? "loads" : "invoices",
    filters: [
      { key: "customer_id", label: "Customer", options: (customers.data?.items ?? []).map((c) => ({ value: c.id, label: c.name })) },
      ...(ready ? [] : [{ key: "state", label: "Status", options: STATES.map(([value, label]) => ({ value, label })) }]),
      ...(ready ? [] : [{ key: "due", label: "Due date", options: Object.entries(dues).map(([value, [label]]) => ({ value, label })), params: (value: string) => (dues[value] ? { ...(dues[value][1] ? { due_from: dues[value][1] } : {}), ...(dues[value][2] ? { due_to: dues[value][2] } : {}) } : {}) }]),
    ],
    actions: [
      ...(record ? [{ l: "Record payment", cls: "", ic: I.dollar, go: () => set(addOf("payment")) }] : []),
      ...(manage ? [{ l: "New invoice", cls: "pri", ic: I.plus, go: () => set(addOf("invoice")) }] : []),
    ],
    kpis: r
      ? [
          { label: `Invoiced · ${range}`, value: whole(r.invoiced_amount), suffix: "", sub: `${plural(r.invoiced_count, "invoice")} issued`, k: "brand", sk: "mu" },
          ...(r.received_amount !== null && r.received_count !== null
            ? [{ label: `Cash received · ${range}`, value: whole(r.received_amount), suffix: "", sub: `${plural(r.received_count, "payment")} applied`, k: "ok", sk: "mu" }]
            : []),
          {
            label: "Delivered, not invoiced",
            value: rates ? whole(String(((toCents(r.ready_to_invoice_amount) ?? 0) + (toCents(r.blocked_amount) ?? 0)) / 100)) : String(r.ready_to_invoice_loads + r.blocked_loads),
            suffix: rates ? "" : r.ready_to_invoice_loads + r.blocked_loads === 1 ? "load" : "loads",
            sub: `${rates ? "Estimate · " : ""}${plural(r.ready_to_invoice_loads, "load")} ready${r.blocked_loads ? `, ${r.blocked_loads} blocked` : ""}`,
            k: "warn",
            sk: r.ready_to_invoice_loads || r.blocked_loads ? "warn" : "mu",
          },
        ]
      : undefined,
    band:
      totals && owed > 0
        ? {
            title: "Open receivables by age",
            sub: `as of ${day(aging.data?.date_to, year)} · invoice due date`,
            total: glance(String(totals.total)),
            segs: AGES.map(([key, l, k]) => ({ l, k, v: glance(String(totals[key] ?? "0")), w: `${(((toCents(String(totals[key] ?? "0")) ?? 0) / owed) * 100).toFixed(2)}%` })),
          }
        : undefined,
    empty: {
      icon: I.invoice,
      title: "No invoices yet",
      text: "An invoice is made from completed loads. Once a load’s proof of delivery is approved, it is ready to bill.",
      action: manage ? { label: "New invoice", go: () => set(addOf("invoice")) } : undefined,
    },
  });

  return (
    <>
      <ListScreen list={list} />
      {ask?.kind === "void" ? (
        <Confirm
          title={`Void ${ask.invoice.invoice_number}?`}
          text={`It stays on record, marked void, and its ${plural(ask.invoice.loads, "load")} can be invoiced again. This can’t be undone.`}
          confirm="Void invoice"
          destructive
          reason={{ label: "Reason", required: true, placeholder: "Wrong rate, billed to the wrong customer…" }}
          onClose={() => setAsk(null)}
          run={async ({ reason }) => {
            const voided = await unwrap(api.POST("/api/v1/invoices/{invoice_id}/void", { params: { path: { invoice_id: ask.invoice.id } }, body: { reason } }));
            notify(`Invoice ${voided.invoice_number} voided`);
            refresh();
          }}
        />
      ) : null}
      {ask?.kind === "delete" ? (
        <Confirm
          title="Delete this draft?"
          text={`The draft for ${ask.invoice.customer.name} is discarded and its ${plural(ask.invoice.loads, "load")} go back to being ready to invoice.`}
          confirm="Delete draft"
          destructive
          onClose={() => setAsk(null)}
          run={async () => {
            await unwrap(api.DELETE("/api/v1/invoices/{invoice_id}", { params: { path: { invoice_id: ask.invoice.id } } }));
            notify(`Draft for ${ask.invoice.customer.name} deleted`);
            refresh();
          }}
        />
      ) : null}
    </>
  );
}
