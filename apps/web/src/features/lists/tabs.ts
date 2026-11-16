import type { Tab } from "./use-list";

// The tabs of the lists that other screens link into with a filter already applied (an alert that says "4
// loads waiting for a driver" opens Loads on that tab). Each tab is a filter the API understands.

export const LOAD_TABS: Tab[] = [
  { label: "All loads" },
  { label: "Unassigned", params: { view: "unassigned" } },
  { label: "In transit", params: { view: "in_transit" } },
  { label: "Delivering today", params: { view: "deliveries_today" } },
  { label: "At risk", params: { view: "at_risk" } },
  { label: "Missing POD", params: { view: "missing_pod" } },
  { label: "Ready to invoice", params: { view: "ready_to_invoice" } },
];

export const INVOICE_TABS: Tab[] = [
  { label: "Open", params: { status: "issued" } },
  { label: "Drafts", params: { status: "draft" } },
  { label: "Overdue", params: { overdue: true } },
  { label: "Paid", params: { status: "paid" } },
  { label: "Void", params: { status: "void" } },
  { label: "All" },
];

export const DOCUMENT_TABS: Tab[] = [
  { label: "Needs review", params: { review_status: "pending" } },
  { label: "Approved", params: { review_status: "approved" } },
  { label: "Rejected", params: { review_status: "rejected" } },
  { label: "Expiring", params: { expiring: true } },
  { label: "All" },
];

export const STATEMENT_TABS: Tab[] = [
  { label: "All" },
  { label: "Drafts", params: { status: "draft" } },
  { label: "Approved", params: { status: "approved" } },
  { label: "Paid", params: { status: "paid" } },
  { label: "Void", params: { status: "void" } },
];

export const WORK_ORDER_TABS: Tab[] = [
  { label: "Open", params: { open: true } },
  { label: "Urgent", params: { open: true, priority: "urgent" } },
  { label: "Overdue", params: { overdue: true } },
  { label: "Completed", params: { status: "completed" } },
  { label: "All" },
];

export const EXPIRATION_TABS: Tab[] = [
  { label: "All" },
  { label: "Expired", params: { state: "expired" } },
  { label: "Expiring", params: { state: "expiring" } },
  { label: "Missing", params: { state: "missing" } },
  { label: "Drivers", params: { entity_type: "driver" } },
  { label: "Equipment", params: { entity_type: "equipment" } },
];

/** The tab whose filter is the given one, or the first tab when none is. */
export function tabFor(tabs: Tab[], params: Record<string, unknown>): number {
  const wanted = Object.entries(params).map(([key, value]) => `${key}=${String(value)}`).sort().join("&");
  const exact = tabs.findIndex((tab) => Object.entries(tab.params ?? {}).map(([key, value]) => `${key}=${String(value)}`).sort().join("&") === wanted);
  if (exact >= 0) return exact;
  // otherwise the tab that asks for the most of it
  const within = tabs.map((tab, index) => [index, Object.entries(tab.params ?? {})] as const).filter(([, entries]) => entries.length && entries.every(([key, value]) => String(params[key]) === String(value)));
  return within.sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? 0;
}
