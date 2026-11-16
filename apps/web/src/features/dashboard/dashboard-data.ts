"use client";

import { useQuery } from "@tanstack/react-query";
import { useConsole } from "@/features/console/console-provider";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { todayIn } from "@/lib/format/dates";
import { sumMoney, toCents } from "@/lib/format/money";

type Invoice = Schema<"InvoiceListItem">;
type Payment = Schema<"PaymentListItem">;
type Statement = Schema<"SettlementListItem">;

/** A calendar date some days from another. */
export const addDays = (day: string, by: number) => new Date(Date.parse(`${day}T12:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
const previousMonth = (day: string) => {
  const end = addDays(monthStart(day), -1);
  return { from: monthStart(end), to: end };
};
/** Monday of the week a day is in. */
export const weekStart = (day: string) => addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));

/** Every page of a list, up to a limit, for totals the API doesn't sum itself. */
async function everything<T>(page: (cursor?: string) => Promise<{ items: T[]; page: { has_more: boolean; next_cursor?: string | null } }>, pages = 10): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < pages; i++) {
    const result = await page(cursor);
    out.push(...result.items);
    if (!result.page.has_more || !result.page.next_cursor) break;
    cursor = result.page.next_cursor;
  }
  return out;
}

const billed = (invoice: Invoice) => invoice.status === "issued" || invoice.status === "paid";

/**
 * What the dashboard shows, from the API. Each part is asked for only by roles that may read it, and is
 * refreshed every minute; a part that fails leaves the rest of the dashboard working.
 */
export function useDashboardData(period: "today" | "week" | "month") {
  const { me, can } = useConsole();
  const org = me.organization;
  const today = todayIn(org.timezone);
  const minute = 60_000;
  const money = can("invoices.read");
  const books = money && can("reports.read") && can("expenses.read");

  const summary = useQuery({ queryKey: [org.id, "dashboard", "summary"], queryFn: () => unwrap(api.GET("/api/v1/dashboard/summary")), refetchInterval: minute, enabled: can("dashboard.read") });
  const exceptions = useQuery({ queryKey: [org.id, "dashboard", "exceptions"], queryFn: () => unwrap(api.GET("/api/v1/dashboard/exceptions")), refetchInterval: minute, enabled: can("dashboard.read") });
  const range = period === "today" ? { view: "deliveries_today" as const } : { delivery_from: period === "week" ? weekStart(today) : monthStart(today), delivery_to: period === "week" ? addDays(weekStart(today), 6) : addDays(monthStart(addDays(monthStart(today), 32)), -1) };
  const deliveries = useQuery({
    queryKey: [org.id, "loads", "dashboard", "deliveries", period, today],
    queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { ...range, sort: "delivery_at", limit: 8, count: true } } })),
    refetchInterval: minute,
    enabled: can("loads.read"),
  });
  const ready = useQuery({ queryKey: [org.id, "loads", "dashboard", "ready"], queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { view: "ready_to_invoice", sort: "delivery_at", limit: 8, count: true } } })), refetchInterval: minute, enabled: money });
  const trailers = useQuery({ queryKey: [org.id, "trailers", "dashboard"], queryFn: () => unwrap(api.GET("/api/v1/trailers", { params: { query: { limit: 100 } } })), refetchInterval: minute, enabled: can("equipment.read") });
  const trucks = useQuery({ queryKey: [org.id, "vehicles", "dashboard"], queryFn: () => unwrap(api.GET("/api/v1/vehicles", { params: { query: { limit: 100 } } })), refetchInterval: minute, enabled: can("equipment.read") });
  const expiring = useQuery({ queryKey: [org.id, "safety", "dashboard", "expiring"], queryFn: () => unwrap(api.GET("/api/v1/safety/expirations", { params: { query: { state: "expiring", within_days: 30, sort: "expires_on", limit: 5 } } })), refetchInterval: minute, enabled: can("safety.read") });
  const aging = useQuery({ queryKey: [org.id, "reports", "ar-aging"], queryFn: () => unwrap(api.GET("/api/v1/reports/ar-aging")), enabled: money && can("reports.read"), staleTime: minute });
  const statements = useQuery({ queryKey: [org.id, "settlements", "summary"], queryFn: () => unwrap(api.GET("/api/v1/settlements/summary")), enabled: can("settlements.read"), staleTime: minute });

  // this month's invoices and payments, summed here
  const invoicedThisMonth = useQuery({
    queryKey: [org.id, "invoices", "dashboard", "month", monthStart(today)],
    queryFn: () => everything<Invoice>((cursor) => unwrap(api.GET("/api/v1/invoices", { params: { query: { issued_from: monthStart(today), limit: 100, cursor } } }))),
    enabled: money,
    staleTime: minute,
  });
  const paidThisMonth = useQuery({
    queryKey: [org.id, "payments", "dashboard", "month", monthStart(today)],
    queryFn: () => everything<Payment>((cursor) => unwrap(api.GET("/api/v1/payments", { params: { query: { received_from: monthStart(today), status: "recorded", limit: 100, cursor } } }))),
    enabled: can("payments.read"),
    staleTime: minute,
  });

  // the books: twelve weeks of invoicing, this month's customers, and last month's costs
  const twelveWeeks = addDays(weekStart(today), -77);
  const weekly = useQuery({
    queryKey: [org.id, "invoices", "dashboard", "weeks", twelveWeeks],
    queryFn: () => everything<Invoice>((cursor) => unwrap(api.GET("/api/v1/invoices", { params: { query: { issued_from: twelveWeeks, limit: 100, cursor } } }))),
    enabled: books,
    staleTime: minute,
  });
  const customers = useQuery({ queryKey: [org.id, "reports", "revenue", "customer", monthStart(today), today], queryFn: () => unwrap(api.GET("/api/v1/reports/revenue", { params: { query: { group_by: "customer", date_from: monthStart(today), date_to: today } } })), enabled: books, staleTime: minute });
  const last = previousMonth(today);
  const lastRevenue = useQuery({ queryKey: [org.id, "reports", "revenue", "month", last.from], queryFn: () => unwrap(api.GET("/api/v1/reports/revenue", { params: { query: { group_by: "month", date_from: last.from, date_to: last.to } } })), enabled: books, staleTime: minute });
  const lastExpenses = useQuery({ queryKey: [org.id, "expenses", "summary", last.from], queryFn: () => unwrap(api.GET("/api/v1/expenses/summary", { params: { query: { date_from: last.from, date_to: last.to } } })), enabled: books, staleTime: minute });
  const lastPay = useQuery({
    queryKey: [org.id, "settlements", "dashboard", last.from],
    queryFn: () => everything<Statement>((cursor) => unwrap(api.GET("/api/v1/settlements", { params: { query: { period_from: last.from, period_to: last.to, limit: 100, cursor } } }))),
    enabled: books && can("settlements.read"),
    staleTime: minute,
  });

  const invoiced = (invoicedThisMonth.data ?? []).filter(billed);
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(twelveWeeks, i * 7));
  // the same stretch of last month, to compare this month against
  const elapsed = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${monthStart(today)}T12:00:00Z`)) / 86_400_000);
  const lastStretchEnd = addDays(last.from, elapsed);
  const lastMonthToDate = sumMoney((weekly.data ?? []).filter((invoice) => billed(invoice) && invoice.issue_date && invoice.issue_date >= last.from && invoice.issue_date <= lastStretchEnd && invoice.issue_date <= last.to).map((invoice) => invoice.total));
  const byWeek = weeks.map((start) => sumMoney((weekly.data ?? []).filter((invoice) => billed(invoice) && invoice.issue_date && invoice.issue_date >= start && invoice.issue_date < addDays(start, 7)).map((invoice) => invoice.total)));

  return {
    today,
    monthStart: monthStart(today),
    lastMonth: last,
    books,
    summary,
    exceptions,
    deliveries,
    ready,
    trailers,
    trucks,
    expiring,
    aging,
    statements,
    month: {
      ready: invoicedThisMonth.isSuccess && (paidThisMonth.isSuccess || !can("payments.read")),
      invoiced: sumMoney(invoiced.map((invoice) => invoice.total)),
      invoices: invoiced.length,
      cash: sumMoney((paidThisMonth.data ?? []).map((payment) => payment.amount)),
      payments: paidThisMonth.data?.length ?? 0,
    },
    weekly: { ready: weekly.isSuccess, weeks, totals: byWeek, lastMonthToDate, lastStretch: { from: last.from, to: lastStretchEnd < last.to ? lastStretchEnd : last.to } },
    customers,
    split: {
      ready: lastRevenue.isSuccess && lastExpenses.isSuccess && (lastPay.isSuccess || !can("settlements.read")),
      revenue: String(lastRevenue.data?.totals?.revenue ?? "0"),
      miles: Number(lastRevenue.data?.totals?.miles ?? 0),
      categories: lastExpenses.data?.by_category ?? [],
      driverPay: sumMoney((lastPay.data ?? []).filter((statement) => statement.status !== "void").map((statement) => statement.earnings)),
    },
  };
}

export const cents = (value: string | number | null | undefined) => toCents(value) ?? 0;
