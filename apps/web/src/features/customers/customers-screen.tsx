"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { cell } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { addOf } from "@/features/console/shell";
import { ListScreen } from "@/features/lists/list-screen";
import { useList, type ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { todayIn } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, plural } from "@/lib/format/text";
import { PortalAccessDialog } from "./portal-access-dialog";

type Customer = Schema<"CustomerRead">;

const terms = (days: number | null | undefined) => (days === null || days === undefined ? "—" : days === 0 ? "Due on receipt" : `Net ${days}`);
const daysAgo = (today: string, days: number) => new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** Customers: who the carrier hauls for, with what they have open and how much they shipped lately. */
export function CustomersScreen() {
  const { me, can, I, set } = useConsole();
  const [portal, setPortal] = useState<{ id: string; name: string } | null>(null);
  const org = me.organization;
  const today = todayIn(org.timezone);
  const reports = can("reports.read");
  // what each customer shipped in the last 30 days, and what they owe: both are reported by customer name
  const shipped = useQuery({ queryKey: [org.id, "reports", "revenue", "customer", today], queryFn: () => unwrap(api.GET("/api/v1/reports/revenue", { params: { query: { group_by: "customer", date_from: daysAgo(today, 30), date_to: today } } })), enabled: reports, staleTime: 60_000 });
  const aging = useQuery({ queryKey: [org.id, "reports", "ar-aging"], queryFn: () => unwrap(api.GET("/api/v1/reports/ar-aging")), enabled: reports && can("invoices.read"), staleTime: 60_000 });
  const loadsOf = new Map((shipped.data?.rows ?? []).map((row) => [String(row.label), Number(row.loads ?? 0)]));
  const owedBy = new Map((aging.data?.rows ?? []).map((row) => [String(row.label), String(row.total ?? "0")]));
  const fetchPage = (query: ListQuery) => unwrap(api.GET("/api/v1/customers", { params: { query: query as never } }));

  const list = useList<Customer>({
    key: "customers",
    group: "Directory",
    title: "Customers",
    sub: (total) => (total === null ? "Operational and billing contacts are kept separate" : `${plural(total, "customer")} · operational and billing contacts are kept separate`),
    placeholder: "Name, code or phone",
    fetch: fetchPage,
    defaultSort: "name",
    tabs: [{ label: "Active", params: { status: "active" } }, { label: "Archived", params: { status: "archived" } }, { label: "All" }],
    columns: [
      { label: "Customer", width: "minmax(220px,1.4fr)", sort: "name", cell: (c) => cell.text(c.name, c.legal_name && c.legal_name !== c.name ? c.legal_name : "", "w5") },
      { label: "Code", width: "110px", cell: (c) => cell.maybe(c.code, "mono fs12") },
      { label: "Status", width: "124px", cell: (c) => (c.status === "active" ? cell.badge("Active", "ok") : cell.badge("Archived", "mu")) },
      { label: "Billing email", width: "minmax(180px,1fr)", cell: (c) => cell.maybe(c.billing_email) },
      { label: "Phone", width: "128px", cell: (c) => cell.maybe(c.phone, "num") },
      { label: "City", width: "150px", cell: (c) => cell.maybe([c.billing_city, c.billing_state].filter(Boolean).join(", ")) },
      { label: "Terms", width: "110px", cell: (c) => cell.text(terms(c.payment_terms_days)) },
      ...(reports ? [{ label: "Loads · 30 d", width: "96px", right: true, cell: (c: Customer) => cell.num(shipped.data ? formatNumber(loadsOf.get(c.name) ?? 0) : "—") }] : []),
      ...(reports && can("invoices.read") ? [{ label: "Open balance", width: "120px", right: true, cell: (c: Customer) => cell.money(aging.data ? formatMoney(owedBy.get(c.name) ?? 0, org.base_currency) : "—") }] : []),
      { label: "", width: "28px", cell: (c: Customer) => cell.menu([["Shipment portal access", () => setPortal({ id: c.id, name: c.name })], ["Preview shipment portal", () => set({ screen: "customerportal", customerId: c.id })]]) },
    ],
    actions: can("customers.manage") ? [{ l: "New customer", cls: "pri", ic: I.plus, go: () => set(addOf("customer")) }] : [],
    kpis: shipped.data
      ? [
          { label: "Loads · 30 days", value: formatNumber(Number(shipped.data.totals?.loads ?? 0)), suffix: "", sub: `${formatNumber(Number(shipped.data.totals?.miles ?? 0))} loaded miles`, k: "info", sk: "" },
          { label: "Revenue · 30 days", value: formatMoney(String(shipped.data.totals?.revenue ?? 0), org.base_currency), suffix: "", sub: `${plural(shipped.data.rows.length, "customer")} shipped`, k: "ok", sk: "" },
          ...(aging.data ? [{ label: "Open receivables", value: formatMoney(String(aging.data.totals?.total ?? 0), org.base_currency), suffix: "", sub: `${plural(aging.data.rows.length, "customer")} with a balance`, k: "warn", sk: "" }] : []),
        ]
      : undefined,
    empty: {
      icon: I.building,
      title: "No customers yet",
      text: "Customers hold billing terms and contacts. Add the first one to start booking loads.",
      action: can("customers.manage") ? { label: "New customer", go: () => set(addOf("customer")) } : undefined,
    },
  });
  return (
    <>
      <ListScreen list={list} />
      {portal ? <PortalAccessDialog customer={portal} onClose={() => setPortal(null)} /> : null}
    </>
  );
}
