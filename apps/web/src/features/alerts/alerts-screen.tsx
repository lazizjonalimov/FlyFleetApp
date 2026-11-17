"use client";

import { useQuery } from "@tanstack/react-query";
import { cell } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import { ListScreen } from "@/features/lists/list-screen";
import { useList, type ListPage, type ListQuery } from "@/features/lists/use-list";
import { usePodRequest } from "@/features/loads/use-pod-request";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatNumber, plural } from "@/lib/format/text";

type Row = Schema<"IncidentRow">;
type Group = "open" | "speeding" | "late" | "documents" | "equipment" | "resolved";
// The badge for each kind of incident, in the design's tones.
const KIND: Record<string, string> = { speeding: "bad", yard_speed: "warn", at_risk: "bad", unassigned: "warn", late: "late", pod_missing: "bad", gps_stale: "warn", dwell: "info", out_of_service: "bad", documents: "warn" };
const KINDS: [string, string][] = [["speeding", "Speeding"], ["yard_speed", "Yard speed"], ["late", "Late"], ["at_risk", "At risk"], ["unassigned", "Unassigned"], ["dwell", "Dwell"], ["gps_stale", "GPS stale"], ["pod_missing", "POD missing"], ["out_of_service", "Out of service"], ["documents", "Documents"]];
const STATE: Record<string, [string, string]> = { open: ["Open", "bad"], notified: ["Notified", "warn"], acknowledged: ["Acknowledged", "info"], watching: ["Watching", "mu"], resolved: ["Resolved", "ok"] };

/** Fleet alerts: one incident per episode, each with an owner, a state and a trail, and the one thing to do next. */
export function AlertsScreen() {
  const { me, I, can, set } = useConsole();
  const act = useAction();
  const requestPod = usePodRequest();
  const org = me.organization;
  const counts = useQuery({ queryKey: [org.id, "incidents", "counts"], queryFn: () => unwrap(api.GET("/api/v1/incidents/counts")) });
  const members = useQuery({ queryKey: [org.id, "members", "owners"], queryFn: () => unwrap(api.GET("/api/v1/members")), enabled: can("incidents.manage") || can("users.manage"), staleTime: 60_000 });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone }).format(new Date());
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone });
  const time = new Intl.DateTimeFormat("en-US", { timeZone: org.timezone, hour: "2-digit", minute: "2-digit", hour12: false });
  const date = new Intl.DateTimeFormat("en-US", { timeZone: org.timezone, month: "short", day: "numeric" });
  const when = (iso: string) => (day.format(new Date(iso)) === today ? time.format(new Date(iso)) : date.format(new Date(iso)));

  async function fetchPage(query: ListQuery): Promise<ListPage<Row>> {
    const out = await unwrap(api.GET("/api/v1/incidents", { params: { query: {
      group: (query.group as Group) ?? "open", q: typeof query.q === "string" ? query.q : undefined, cursor: typeof query.cursor === "string" ? query.cursor : undefined,
      limit: typeof query.limit === "number" ? query.limit : 25, count: true,
      kind: typeof query.kind === "string" ? [query.kind] : undefined, owner_id: typeof query.owner_id === "string" ? [query.owner_id] : undefined,
    } } }));
    return out as ListPage<Row>;
  }
  const ack = (r: Row) => act(() => unwrap(api.POST("/api/v1/incidents/{incident_id}/actions", { params: { path: { incident_id: r.id } }, body: { action: "acknowledge", version: r.version } })), `${r.number} acknowledged`);
  const onMap = (r: Row) => r.vehicle?.id ? set({ ...goTo("tracking"), vehicle: r.vehicle.id }) : undefined;
  const toLoad = (r: Row) => (r.load?.id ? set({ screen: "loads", drawer: r.load.id, overlay: "none", modal: "none" }) : undefined);
  // The one thing to do next, as the design labels it per kind of incident.
  const next = (r: Row): [string, () => void, string] | null => {
    const waiting = r.state === "open" || r.state === "notified";
    if ((r.kind === "speeding" || r.kind === "yard_speed") && waiting && can("incidents.manage")) return ["Acknowledge", () => void ack(r), "pri"];
    if (r.kind === "speeding" || r.kind === "yard_speed") return ["View", () => onMap(r), ""];
    if (r.kind === "gps_stale") return ["Check", () => onMap(r), ""];
    if (r.kind === "at_risk") return ["Review", () => toLoad(r), ""];
    if (r.kind === "unassigned") return ["Assign", () => set({ ...goTo("dispatch"), ...(r.load?.id && can("dispatch.assign") ? { panel: "assign", assignLoad: r.load.id } : {}) }), ""];
    if (r.kind === "pod_missing" && r.load?.id && can("loads.update", "loads.close")) return ["Request", () => void requestPod(r.load!.id!), ""];
    if (r.kind === "pod_missing") return ["Open", () => toLoad(r), ""];
    if (r.kind === "out_of_service") return ["Open", () => set(goTo("maintenance")), ""];
    if (r.kind === "documents") return ["Open", () => (r.driver?.id ? set({ screen: "driver", driverId: r.driver.id }) : r.vehicle?.id ? set({ screen: "truck", unitId: r.vehicle.id, unitKind: "truck" }) : set(goTo("safety"))), ""];
    return r.load?.id ? ["Open", () => toLoad(r), ""] : null;
  };
  const open = (r: Row) => {
    const go = next(r);
    if (r.load?.id && !(r.kind === "speeding" || r.kind === "gps_stale")) toLoad(r);
    else if (go && go[0] !== "Acknowledge") go[1]();
    else onMap(r);
  };
  const c = counts.data;
  const list = useList<Row>({
    key: "incidents",
    group: "Operations",
    title: "Fleet alerts",
    sub: () => "One incident per episode, each with an owner and a trail — never one alert per GPS sample",
    placeholder: "Truck, driver, load or incident",
    fetch: fetchPage,
    defaultSort: "priority",
    tabs: [
      { label: "Open", params: { group: "open" } },
      { label: "Speeding", params: { group: "speeding" } },
      { label: "Late & at risk", params: { group: "late" } },
      { label: "Documents", params: { group: "documents" } },
      { label: "Equipment", params: { group: "equipment" } },
      { label: "Resolved", params: { group: "resolved" } },
    ],
    open,
    rowClass: (r) => (r.state === "resolved" ? "dim" : ""),
    filters: [
      { key: "kind", label: "Type", options: KINDS.map(([value, label]) => ({ value, label })) },
      { key: "owner_id", label: "Owner", options: (members.data ?? []).filter((m) => m.active).map((m) => ({ value: m.user_id, label: m.full_name })) },
    ],
    columns: [
      { label: "Type", width: "124px", cell: (r) => cell.badge(r.label, KIND[r.kind] ?? "mu"), csv: (r) => r.label },
      { label: "Incident", width: "minmax(0,1.6fr)", cell: (r) => cell.text(r.title, r.detail ?? "", "w5"), csv: (r) => `${r.title}${r.detail ? ` · ${r.detail}` : ""}` },
      { label: "Truck · driver", width: "minmax(0,1fr)", cell: (r) => (r.vehicle || r.driver ? cell.text(r.vehicle?.unit_number ?? "–", r.driver?.name ?? "", "mono fs12 w5") : cell.maybe(null)), csv: (r) => [r.vehicle?.unit_number, r.driver?.name].filter(Boolean).join(" · ") },
      { label: "Load", width: "100px", cell: (r) => cell.maybe(r.load?.load_number, "mono"), csv: (r) => r.load?.load_number ?? "" },
      { label: "Detected", width: "78px", cell: (r) => cell.text(when(r.detected_at), "", "num"), csv: (r) => r.detected_at },
      { label: "State", width: "128px", cell: (r) => cell.badge(...(STATE[r.state] ?? [r.state, "mu"])), csv: (r) => STATE[r.state]?.[0] ?? r.state },
      { label: "", width: "116px", cell: (r) => { const n = next(r); return n ? cell.button(n[0], n[1], n[2]) : cell.text(""); } },
    ],
    actions: [{ l: "Alert policies", cls: "", ic: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6", go: () => set(goTo("policy")) }],
    foot: (shown, total) => (c ? `${plural(c.open, "open incident")} · ${formatNumber(c.high)} high severity` : total === null ? "" : `${formatNumber(total)} incidents`),
    empty: { icon: I.check, title: "Nothing needs anyone right now", text: "Speeding episodes, late or at-risk loads, trucks that stop reporting, missing PODs and expired paperwork show up here as they happen." },
  });
  return <ListScreen list={list} />;
}
