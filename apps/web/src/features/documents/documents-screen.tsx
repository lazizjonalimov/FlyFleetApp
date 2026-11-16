"use client";

import { cell } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { useSoon } from "@/features/console/use-action";
import { ListScreen } from "@/features/lists/list-screen";
import { DOCUMENT_TABS } from "@/features/lists/tabs";
import { useList, type ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format/dates";
import { formatBytes, humanize } from "@/lib/format/text";

export type Document = Schema<"DocumentOut">;

export const DOCUMENT_TYPES: Record<string, string> = {
  bol: "Bill of lading", pod: "Proof of delivery", rate_confirmation: "Rate confirmation", receipt: "Receipt", license: "Licence", medical: "Medical certificate",
  insurance: "Insurance", registration: "Registration", inspection: "Inspection", maintenance: "Maintenance", invoice: "Invoice", other: "Other",
};
export const REVIEW: Record<string, [label: string, tone: string]> = { pending: ["Needs review", "info"], approved: ["Approved", "ok"], rejected: ["Rejected", "bad"], not_required: ["Filed", "mu"] };
const SCAN: Record<string, [label: string, tone: string]> = { clean: ["Passed", "ok"], infected: ["Blocked", "bad"], not_scanned: ["Not scanned", "mu"], pending: ["Scanning", "mu"] };

/** Documents: everything uploaded, what it is attached to, and what is waiting for a review. */
export function DocumentsScreen() {
  const { me, I, set } = useConsole();
  const soon = useSoon();
  const zone = me.organization.timezone;

  const list = useList<Document>({
    key: "documents",
    group: "Safety & fleet",
    title: "Documents",
    sub: () => "BOLs, PODs, licences, insurance and inspections · private storage",
    placeholder: "File name",
    fetch: (query: ListQuery) => unwrap(api.GET("/api/v1/documents", { params: { query: query as never } })),
    defaultSort: "-created_at",
    tabs: DOCUMENT_TABS,
    open: (d) => set({ screen: "docreview", docId: d.id, drawer: null, overlay: "none", modal: "none" }),
    columns: [
      { label: "Document", width: "minmax(0,1.35fr)", cell: (d) => cell.text(d.filename, "", "w5") },
      { label: "Type", width: "150px", cell: (d) => cell.text(DOCUMENT_TYPES[d.type] ?? humanize(d.type)) },
      { label: "Linked to", width: "minmax(0,0.8fr)", cell: (d) => cell.maybe(d.links.map((link) => link.label).filter(Boolean).join(", ")) },
      { label: "Uploaded by", width: "140px", cell: (d) => cell.maybe(d.uploaded_by_name, "t2") },
      { label: "Size", width: "72px", right: true, cell: (d) => cell.num(formatBytes(d.size_bytes)) },
      { label: "Malware scan", width: "120px", cell: (d) => cell.risk(...(SCAN[d.scan_status] ?? [humanize(d.scan_status), "mu"])) },
      { label: "Expires", width: "110px", cell: (d) => cell.maybe(d.expires_on ? formatDate(d.expires_on) : "", "num") },
      { label: "Uploaded", width: "128px", cell: (d) => cell.text(formatDateTime(d.created_at, zone), "", "num t2") },
      { label: "State", width: "128px", cell: (d) => cell.badge(...(REVIEW[d.review_status] ?? [humanize(d.review_status), "mu"])) },
    ],
    actions: [
      { l: "Scan with phone", cls: "", ic: "", go: soon("Scanning with a phone") },
      { l: "Upload", cls: "pri", ic: I.upload, go: soon("Uploading here — add documents from a load, driver or unit") },
    ],
    empty: { icon: I.file, title: "No documents yet", text: "Documents are uploaded from the record they belong to: a load’s paperwork, a driver’s licence, a unit’s registration." },
  });
  return <ListScreen list={list} />;
}
