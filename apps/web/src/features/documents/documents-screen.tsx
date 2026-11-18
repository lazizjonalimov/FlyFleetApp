"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { cell } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { UploadDialog } from "@/features/documents/upload-dialog";
import { ListScreen } from "@/features/lists/list-screen";
import { DOCUMENT_TABS } from "@/features/lists/tabs";
import { useList, type ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatStamp, todayIn } from "@/lib/format/dates";
import { humanize } from "@/lib/format/text";
import { useMinuteClock } from "@/lib/time/clock";

export type Document = Schema<"DocumentOut">;

export const DOCUMENT_TYPES: Record<string, string> = {
  bol: "Bill of lading", pod: "Proof of delivery", rate_confirmation: "Rate confirmation", receipt: "Receipt", license: "Licence", medical: "Medical certificate",
  insurance: "Insurance", registration: "Registration", inspection: "Inspection", maintenance: "Maintenance", invoice: "Invoice", lease: "Lease",
  w9: "W-9", title: "Title", cab_card: "Cab card", ach_authorization: "ACH authorization", mvr: "MVR review", clearinghouse: "Clearinghouse query",
  road_test: "Road test certificate", drug_test: "Drug test result", authority: "Operating authority", ucr: "UCR registration",
  ifta_license: "IFTA license", other: "Other",
};
export const REVIEW: Record<string, [label: string, tone: string]> = { pending: ["Needs review", "info"], approved: ["Approved", "ok"], rejected: ["Rejected", "bad"], not_required: ["Filed", "mu"] };
const SCAN: Record<string, [label: string, tone: string]> = { clean: ["Passed", "ok"], infected: ["Blocked", "bad"], not_scanned: ["Not scanned", "mu"], pending: ["Scanning", "mu"] };

const STATE: Record<string, [label: string, tone: string]> = {
  needs_review: ["Needs review", "info"], processing: ["Uploading", "violet"], failed: ["Failed · unreadable", "bad"],
  approved: ["Approved", "ok"], rejected: ["Rejected", "bad"], filed: ["Filed", "mu"],
};
const LINKED: [value: string, label: string][] = [["load", "Load"], ["driver", "Driver"], ["vehicle", "Truck"], ["trailer", "Trailer"], ["customer", "Customer"], ["organization", "Company"], ["owner", "Owner"], ["work_order", "Work order"], ["inspection", "Inspection"], ["expense", "Expense"]];

/** "Driver app scan", "Upload · Rosa D.", "Added by FlyFleet". */
export function sourceOf(d: Document): string {
  if (d.source === "driver app") return "Driver app scan";
  if (d.source === "system") return "Added by FlyFleet";
  const [first, ...rest] = (d.uploaded_by_name ?? "").split(" ");
  return first ? `Upload · ${first}${rest.length ? ` ${rest[rest.length - 1]![0]}.` : ""}` : "Upload";
}

/** "Today · 09:12" or "Nov 12 · 11:42", on the company's clock. */
export function stampOf(iso: string, zone: string, now: number | null): string {
  const stamp = formatStamp(iso, zone);
  return now !== null && todayIn(zone, new Date(now)) === todayIn(zone, new Date(iso)) ? `Today · ${stamp.split(" · ")[1]}` : stamp;
}

/** Documents: everything uploaded, what it is attached to, and what is waiting for a review. */
export function DocumentsScreen() {
  const { me, can, I, set, notify } = useConsole();
  const now = useMinuteClock();
  const zone = me.organization.timezone;
  const [uploading, setUploading] = useState(false);
  const people = useQuery({ queryKey: [me.organization.id, "teammates"], queryFn: () => unwrap(api.GET("/api/v1/teammates")), enabled: can("tasks.assign") || can("messages.send") || can("incidents.manage"), staleTime: 300_000 });

  const list = useList<Document>({
    key: "documents",
    group: "Safety & fleet",
    title: "Documents",
    sub: () => "BOLs, PODs, licenses, insurance and inspections · private storage · read when they arrive",
    placeholder: "File name, load or person",
    fetch: (query: ListQuery) => unwrap(api.GET("/api/v1/documents", { params: { query: query as never } })),
    defaultSort: "-created_at",
    tabs: DOCUMENT_TABS,
    filters: [
      { key: "type", label: "Type", options: Object.entries(DOCUMENT_TYPES).map(([value, label]) => ({ value, label })) },
      { key: "entity_type", label: "Linked to", options: LINKED.map(([value, label]) => ({ value, label })) },
      {
        key: "uploaded_by",
        label: "Uploaded by",
        options: [{ value: "source:driver_app", label: "The driver app" }, { value: "source:system", label: "FlyFleet" }, ...(people.data ?? []).map((m) => ({ value: m.id, label: m.name }))],
        params: (v) => (v.startsWith("source:") ? { source: v.slice(7) } : { uploaded_by: v }),
      },
    ],
    open: (d) => set({ screen: "docreview", docId: d.id, drawer: null, overlay: "none", modal: "none" }),
    columns: [
      { label: "Document", width: "minmax(0,1.3fr)", cell: (d) => cell.text(d.filename, "", "mono fs12 w5") },
      { label: "Type", width: "150px", cell: (d) => cell.text(DOCUMENT_TYPES[d.type] ?? humanize(d.type)) },
      { label: "Linked to", width: "minmax(0,0.9fr)", cell: (d) => cell.maybe(d.links.map((link) => link.label).filter(Boolean).join(", ")) },
      { label: "Source", width: "140px", cell: (d) => cell.text(sourceOf(d), "", "t2") },
      { label: "Pages", width: "56px", right: true, cell: (d) => cell.num(d.pages ? String(d.pages) : "—") },
      { label: "Malware scan", width: "120px", cell: (d) => cell.risk(...(SCAN[d.scan_status] ?? [humanize(d.scan_status), "mu"])) },
      { label: "OCR confidence", width: "128px", cell: (d) => (d.read_confidence !== null && d.read_confidence !== undefined ? cell.bar(`${d.read_confidence}%`, `${d.read_confidence}%`, d.read_confidence >= 90 ? "ok" : d.read_confidence >= 60 ? "warn" : "bad") : cell.maybe(d.read_status === "needs_reader" ? "Needs the photo reader" : null, "mu fs12")), csv: (d) => (d.read_confidence !== null && d.read_confidence !== undefined ? `${d.read_confidence}%` : "") },
      { label: "Uploaded", width: "112px", cell: (d) => cell.text(stampOf(d.created_at, zone, now), "", "num t2") },
      { label: "State", width: "140px", cell: (d) => cell.badge(...(d.state === "failed" && d.scan_status === "failed" ? (["Failed · blocked", "bad"] as [string, string]) : (STATE[d.state] ?? REVIEW[d.review_status] ?? [humanize(d.review_status), "mu"]))) },
    ],
    actions: [
      { l: "Scan with phone", cls: "", ic: I.camera, go: () => notify("Scanning with a phone comes with the FlyFleet mobile app. Until then, upload a photo or PDF here.") },
      ...(can("documents.upload") ? [{ l: "Upload", cls: "pri", ic: I.upload, go: () => setUploading(true) }] : []),
    ],
    empty: { icon: I.file, title: "No documents yet", text: "Upload a document here, or from the record it belongs to: a load’s paperwork, a driver’s licence, a unit’s registration." },
  });
  return (
    <>
      <ListScreen list={list} />
      {uploading ? <UploadDialog onClose={() => setUploading(false)} /> : null}
    </>
  );
}
