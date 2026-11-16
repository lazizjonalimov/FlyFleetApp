"use client";

import { cell } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { addOf } from "@/features/console/shell";
import { ListScreen } from "@/features/lists/list-screen";
import { useList, type ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDate } from "@/lib/format/dates";
import { humanize, initials, plural } from "@/lib/format/text";

type Inspection = Schema<"InspectionOut">;

const KINDS: Record<string, string> = { pre_trip: "Pre-trip", post_trip: "Post-trip", annual: "Annual", roadside: "Roadside", other: "Other" };
const RESULT: Record<string, [label: string, tone: string]> = { pass: ["Clean", "ok"], defects: ["Defects", "warn"], out_of_service: ["Out of service", "bad"] };

/** Inspections: what was looked at, by whom, and what was found. */
export function InspectionsScreen() {
  const { can, I, set } = useConsole();
  const add = can("safety.manage") ? () => set(addOf("inspection")) : null;

  const list = useList<Inspection>({
    key: "inspections",
    group: "Safety & fleet",
    title: "Inspections",
    sub: (total) => (total === null ? "Driver, annual and roadside inspections" : `${plural(total, "inspection")} · driver, annual and roadside`),
    placeholder: "Report, unit or inspector",
    fetch: (query: ListQuery) => unwrap(api.GET("/api/v1/maintenance/inspections", { params: { query: query as never } })),
    defaultSort: "-inspected_on",
    tabs: [
      { label: "All" },
      { label: "Out of service", params: { result: "out_of_service" } },
      { label: "With defects", params: { result: "defects" } },
      { label: "Clean", params: { result: "pass" } },
      { label: "Roadside", params: { kind: "roadside" } },
      { label: "Annual", params: { kind: "annual" } },
    ],
    columns: [
      { label: "Date", width: "110px", sort: "inspected_on", cell: (i) => cell.text(formatDate(i.inspected_on), "", "num") },
      { label: "Report", width: "minmax(0,0.95fr)", cell: (i) => cell.text(i.report_number || KINDS[i.kind] || humanize(i.kind), i.location ?? "", i.report_number ? "mono fs12 w5" : "") },
      { label: "Kind", width: "96px", cell: (i) => cell.text(KINDS[i.kind] ?? humanize(i.kind)) },
      { label: "Driver", width: "minmax(0,1fr)", cell: (i) => (i.driver ? cell.person(i.driver.name, initials(i.driver.name)) : cell.maybe(null)) },
      { label: "Unit", width: "124px", cell: (i) => cell.text(i.unit.name) },
      { label: "Defects", width: "minmax(0,1.2fr)", cell: (i) => (i.defects.length ? cell.text(plural(i.defects.length, "defect"), i.defects.map((d) => d.description).join(", ")) : cell.text("None", "", "mu")) },
      { label: "Result", width: "132px", cell: (i) => cell.badge(...(RESULT[i.result] ?? [humanize(i.result), "mu"])) },
      { label: "Recorded by", width: "140px", cell: (i) => cell.maybe(i.created_by_name, "t2") },
    ],
    actions: add ? [{ l: "Add inspection", cls: "pri", ic: I.plus, go: add }] : [],
    empty: {
      icon: I.inspect,
      title: "No inspections yet",
      text: "Record pre-trip, annual and roadside inspections here. A defect found on one can be turned into a work order.",
      action: add ? { label: "Add inspection", go: add } : undefined,
    },
  });
  return <ListScreen list={list} />;
}
