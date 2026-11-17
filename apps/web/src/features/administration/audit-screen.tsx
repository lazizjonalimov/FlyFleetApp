"use client";

import { useQuery } from "@tanstack/react-query";
import { cell } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import type { Row } from "@/features/console/view";
import { ListScreen } from "@/features/lists/list-screen";
import { type ListPage, type ListQuery, useList } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format/dates";
import { humanize, initials } from "@/lib/format/text";

type Event = Schema<"AuditOut">;
type Group = "all" | "security" | "permissions" | "operations" | "finance" | "support";
const GROUPS: [Group, string][] = [["all", "All events"], ["security", "Security"], ["permissions", "Permissions"], ["operations", "Loads & dispatch"], ["finance", "Finance"], ["support", "Platform support"]];
const ENTITIES = ["load", "driver", "vehicle", "trailer", "customer", "invoice", "payment", "settlement", "document", "user", "role", "dispatch_team", "incident", "task", "organization"];
const SINCE: [string, string, number][] = [["day", "Last 24 hours", 1], ["week", "Last 7 days", 7], ["month", "Last 30 days", 30]];

/** An audit entry's details, as recorded: what changed and the values that went with it. */
function details(e: Event): Row["x"] {
  const data = e.data ?? {};
  const show = (v: unknown) => {
    const text = v === null || v === undefined || v === "" ? "—" : typeof v === "string" ? v : JSON.stringify(v);
    return text.length > 160 ? `${text.slice(0, 159)}…` : text;
  };
  // A change records each field's value before and after; anything else is shown as it was recorded.
  const changes = data.changes && typeof data.changes === "object" ? (data.changes as Record<string, unknown>) : null;
  const lines = changes
    ? Object.entries(changes).map(([k, v]) => (Array.isArray(v) && v.length === 2 ? { k: humanize(k), a: show(v[0]), b: show(v[1]) } : { k: humanize(k), a: "", b: show(v) }))
    : Object.entries(data).filter(([k]) => k !== "text").map(([k, v]) => ({ k: humanize(k), a: "", b: show(v) }));
  if (!lines.length && !data.text) return null;
  return { title: typeof data.text === "string" ? data.text : e.action, meta: e.request_id ?? "", lines };
}

/** Audit log: who did what to which record, newest first. It is only ever added to. */
export function AuditScreen() {
  const { me, I, can, state } = useConsole();
  const zone = me.organization.timezone;
  const members = useQuery({ queryKey: [me.organization.id, "members"], queryFn: () => unwrap(api.GET("/api/v1/members")), enabled: can("users.manage"), staleTime: 60_000 });
  const tab = GROUPS[typeof state.ltab === "number" ? state.ltab : 0]?.[0] ?? "all";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const when = (iso: string) => (day.format(new Date(iso)) === today ? time.format(new Date(iso)) : formatDateTime(iso, zone));

  const list = useList<Event>({
    key: "audit",
    group: "Administration",
    title: "Audit log",
    sub: () => "Append-only · who did what to which record · passwords and secrets are never recorded",
    placeholder: "Actor, action or request ID",
    fetch: async (query: ListQuery) => (await unwrap(api.GET("/api/v1/audit-logs", { params: { query: query as never } }))) as ListPage<Event>,
    defaultSort: "-created_at",
    tabs: GROUPS.map(([group, label]) => ({ label, params: { group }, count: group === "permissions" || group === "support" })),
    filters: [
      { key: "since", label: "When", options: SINCE.map(([value, label]) => ({ value, label })), params: (v) => ({ since: new Date(Date.now() - (SINCE.find((x) => x[0] === v)?.[2] ?? 1) * 86_400_000).toISOString() }) },
      ...(members.data ? [{ key: "actor_user_id", label: "Actor", options: members.data.map((m) => ({ value: m.user_id, label: m.full_name })) }] : []),
      { key: "entity_type", label: "Entity", options: ENTITIES.map((value) => ({ value, label: humanize(value) })) },
    ],
    columns: [
      { label: "Time", width: "150px", cell: (e) => cell.text(when(e.created_at), "", "mono fs12 t3"), csv: (e) => e.created_at },
      { label: "Actor", width: "minmax(0,1.15fr)", cell: (e) => (e.actor_name ? cell.person(e.actor_name, initials(e.actor_name), e.actor_role ?? "") : cell.text("FlyFleet", "System", "mu")) },
      { label: "Action", width: "minmax(0,1.2fr)", cell: (e) => cell.text(e.action, "", "mono fs12 w5") },
      { label: "Entity", width: "minmax(0,1fr)", cell: (e) => cell.text(e.entity_label ?? (e.entity_id ? e.entity_id.slice(0, 8) : "—"), humanize(e.entity_type), "t2"), csv: (e) => `${e.entity_type} ${e.entity_label ?? e.entity_id ?? ""}` },
      { label: "Request", width: "112px", cell: (e) => cell.maybe(e.request_id ? e.request_id.slice(0, 10) : "", "mono fs12 mu") },
      { label: "Source", width: "96px", cell: (e) => (e.source === "Support" ? cell.tags([{ v: "Support", k: "warn" }]) : cell.text(e.source, "", "t3")) },
    ],
    expand: details,
    actions: [],
    // The server writes the file, so the export itself is recorded in the log.
    exportFile: () => window.open(`/api/v1/audit-logs?format=csv&group=${tab}`, "_blank", "noopener"),
    foot: (shown, total) => (total === null ? "" : `Showing ${shown} of ${total.toLocaleString("en-US")} events · select a row for its details`),
    empty: {
      icon: I.history,
      title: tab === "support" ? "FlyFleet support hasn’t accessed this company" : "Nothing recorded yet",
      text: tab === "support" ? "If FlyFleet staff ever open your company to help, every step they take is recorded here." : "Every change to a load, invoice, document, role or setting is written here with who made it.",
    },
  });
  return <ListScreen list={list} />;
}
