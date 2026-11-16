"use client";

import { cell } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { useSoon } from "@/features/console/use-action";
import { ListScreen } from "@/features/lists/list-screen";
import { useList, type ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format/dates";
import { humanize, initials } from "@/lib/format/text";

type Event = Schema<"AuditOut">;

/** Audit log: who did what to which record, newest first. It is only ever added to. */
export function AuditScreen() {
  const { me, I } = useConsole();
  const soon = useSoon();
  const zone = me.organization.timezone;

  const list = useList<Event>({
    key: "audit",
    group: "Administration",
    title: "Audit log",
    sub: () => "Append-only · every change to a record, with who made it",
    placeholder: "Action or entity",
    fetch: (query: ListQuery) => unwrap(api.GET("/api/v1/audit-logs", { params: { query: query as never } })),
    defaultSort: "-created_at",
    tabs: [
      { label: "All events" },
      { label: "Loads & dispatch", params: { entity_type: "load" } },
      { label: "Invoices", params: { entity_type: "invoice" } },
      { label: "Payments", params: { entity_type: "payment" } },
      { label: "Statements", params: { entity_type: "settlement" } },
      { label: "Documents", params: { entity_type: "document" } },
    ],
    columns: [
      { label: "Time", width: "150px", cell: (e) => cell.text(formatDateTime(e.created_at, zone), "", "num t2") },
      { label: "Actor", width: "minmax(0,1.15fr)", cell: (e) => (e.actor_name ? cell.person(e.actor_name, initials(e.actor_name)) : cell.text("System", "", "mu")) },
      { label: "Action", width: "minmax(0,1.2fr)", cell: (e) => cell.text(e.action, "", "mono fs12 w5") },
      { label: "Entity", width: "minmax(0,1.1fr)", cell: (e) => cell.text(humanize(e.entity_type), e.entity_id ? e.entity_id.slice(0, 8) : "", "", "mono") },
      { label: "Request ID", width: "112px", cell: (e) => cell.maybe(e.request_id ? e.request_id.slice(0, 10) : "", "mono fs12 t3") },
    ],
    actions: [{ l: "Export", cls: "", ic: I.download, go: soon("Exporting the audit log") }],
    empty: { icon: I.history, title: "Nothing recorded yet", text: "Every change to a load, invoice, document or setting is written here with who made it." },
  });
  return <ListScreen list={list} />;
}
