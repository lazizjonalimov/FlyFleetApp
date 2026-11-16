"use client";

import { cell } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { ListScreen } from "@/features/lists/list-screen";
import { useList, type ListPage, type ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import { formatNumber, plural } from "@/lib/format/text";
import { areaOf, placeOf, SEVERITY_LABEL, SEVERITY_TONE, type Exception } from "./exceptions";

type Alert = Exception & { id: string };

/** Fleet alerts: what needs someone now, by kind. Each line opens the records behind it. */
export function AlertsScreen() {
  const { I, set } = useConsole();

  // the API works these out live for the signed-in role; the tabs and search narrow them here
  async function fetchPage(query: ListQuery): Promise<ListPage<Alert>> {
    const all = (await unwrap(api.GET("/api/v1/dashboard/exceptions"))).map((exception) => ({ ...exception, id: exception.code }));
    const q = typeof query.q === "string" ? query.q.toLowerCase() : "";
    const items = all.filter((alert) => (!query.severity || alert.severity === query.severity) && (!query.resource || alert.resource === query.resource) && (!q || `${alert.title} ${alert.detail}`.toLowerCase().includes(q)));
    return { items, page: { has_more: false, next_cursor: null, total_count: items.length } };
  }
  const open = (alert: Alert) => {
    const place = placeOf(alert);
    if (place) set(place);
  };

  const list = useList<Alert>({
    key: "alerts",
    group: "Operations",
    title: "Fleet alerts",
    sub: (total) => (total === null ? "What needs someone now" : total ? `${plural(total, "kind")} of thing need someone now · worked out live for your role` : "Nothing needs anyone right now"),
    placeholder: "Search alerts",
    fetch: fetchPage,
    defaultSort: "severity",
    tabs: [
      { label: "Open" },
      { label: "High", params: { severity: "high" } },
      { label: "Loads", params: { resource: "loads" } },
      { label: "Compliance", params: { resource: "safety" } },
      { label: "Maintenance", params: { resource: "maintenance" } },
      { label: "Documents", params: { resource: "documents" } },
    ],
    open,
    columns: [
      { label: "Severity", width: "112px", cell: (a) => cell.badge(SEVERITY_LABEL[a.severity] ?? a.severity, SEVERITY_TONE[a.severity] ?? "mu") },
      { label: "Alert", width: "minmax(0,1.45fr)", cell: (a) => cell.text(a.title, a.detail, "w5") },
      { label: "Area", width: "minmax(0,0.6fr)", cell: (a) => cell.text(areaOf(a), "", "t2") },
      { label: "Count", width: "88px", right: true, cell: (a) => cell.num(formatNumber(a.count)) },
      { label: "", width: "104px", cell: (a) => (placeOf(a) ? cell.button("Review", () => open(a)) : cell.text("")) },
    ],
    actions: [{ l: "Alert policies", cls: "", ic: "", go: () => set(goTo("policy")) }],
    empty: { icon: I.check, title: "Nothing needs you right now", text: "Late loads, expired paperwork, overdue invoices and urgent repairs show up here as they happen." },
  });
  return <ListScreen list={list} />;
}
