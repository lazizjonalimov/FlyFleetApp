"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { cell } from "@/components/data-table/cell";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { addOf, goTo } from "@/features/console/shell";
import { ListScreen } from "@/features/lists/list-screen";
import { useList, type ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format/dates";
import { formatNumber, humanize, initials, plural } from "@/lib/format/text";

type Inspection = Schema<"InspectionOut">;

const KINDS: Record<string, string> = { pre_trip: "Pre-trip", post_trip: "Post-trip", annual: "Annual", roadside: "Roadside", other: "Other" };
const RESULT: Record<string, [label: string, tone: string]> = { pass: ["Clean", "ok"], defects: ["Violations", "warn"], out_of_service: ["Out of service", "bad"] };
const STATUS: Record<string, [label: string, tone: string]> = { needs_review: ["Needs review", "info"], reviewed: ["Reviewed", "ok"], repairs_certified: ["Repairs certified", "ok"], dataqs_filed: ["DataQs filed", "violet"] };
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI"];
const short = (name: string) => name.replace(/^Truck /, "").replace(/^Trailer /, "");
const rate = (n: number, of: number) => (of ? Math.round((1000 * n) / of) / 10 : 0);

/** Inspections: roadside reports and the shop's own, what they found, how FMCSA counts it, and what is left to do. */
export function InspectionsScreen() {
  const { me, can, I, set, notify } = useConsole();
  const [opened, setOpened] = useState<string | null>(null);
  const add = can("safety.manage") || can("maintenance.manage") ? () => set(addOf("inspection")) : null;
  const summary = useQuery({ queryKey: [me.organization.id, "inspections", "summary"], queryFn: () => unwrap(api.GET("/api/v1/maintenance/inspections/summary")), refetchInterval: 60_000 });
  const s = summary.data;
  const vehicleRate = s ? rate(s.vehicle_out_of_service, s.vehicle_inspections) : 0;
  const driverRate = s ? rate(s.driver_out_of_service, s.driver_inspections) : 0;
  const a = s?.attention;

  const list = useList<Inspection>({
    key: "inspections",
    group: "Safety & fleet",
    title: "Inspections",
    sub: () => "Roadside inspections and violations · counted over 24 months, as FMCSA counts them",
    placeholder: "Report, driver, truck or location",
    fetch: (query: ListQuery) => unwrap(api.GET("/api/v1/maintenance/inspections", { params: { query: query as never } })),
    defaultSort: "-inspected_on",
    tabs: [
      { label: "All" },
      { label: "Needs review", params: { status: "needs_review" } },
      { label: "Out of service", params: { result: "out_of_service" } },
      { label: "With violations", params: { violations: true } },
      { label: "Clean", params: { result: "pass" } },
      { label: "DataQs", params: { status: "dataqs_filed" } },
    ],
    filters: [
      { key: "level", label: "Level", options: [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `Level ${ROMAN[n]}` })) },
      { key: "result", label: "Result", options: [{ value: "out_of_service", label: "Out of service" }, { value: "defects", label: "Violations" }, { value: "pass", label: "Clean" }] },
      { key: "unit_type", label: "Unit", options: [{ value: "vehicle", label: "Trucks" }, { value: "trailer", label: "Trailers" }] },
    ],
    kpis: [
      { label: "Inspections · 24 months", value: s ? formatNumber(s.roadside) : "—", suffix: "", sub: s ? `${formatNumber(s.clean)} clean · ${formatNumber(s.with_violations)} with violations` : "", k: "brand", sk: "mu" },
      { label: "Vehicle out-of-service rate", value: s && s.vehicle_inspections ? String(vehicleRate) : "—", suffix: s && s.vehicle_inspections ? "%" : "", sub: s ? (s.vehicle_inspections ? `${s.vehicle_out_of_service} of ${s.vehicle_inspections} · ${vehicleRate <= s.national_vehicle_rate ? "below" : "above"} national avg` : "No vehicle inspections yet") : "", k: "warn", sk: s && s.vehicle_inspections && vehicleRate > s.national_vehicle_rate ? "bad" : "mu" },
      { label: "Driver out-of-service rate", value: s && s.driver_inspections ? String(driverRate) : "—", suffix: s && s.driver_inspections ? "%" : "", sub: s ? (s.driver_inspections ? `${s.driver_out_of_service} of ${s.driver_inspections} · ${driverRate <= s.national_driver_rate ? "below" : "above"} national avg` : "No driver inspections yet") : "", k: "ok", sk: s && s.driver_inspections && driverRate > s.national_driver_rate ? "bad" : "mu" },
      { label: "Vehicle Maintenance BASIC", value: "—", suffix: "", sub: "Needs the FMCSA connection", k: "off", sk: "mu" },
      { label: "Waiting for review", value: s ? formatNumber(s.needs_review) : "—", suffix: "", sub: s ? (s.needs_review ? (s.needs_review_from_app ? "Sent from the driver app" : "Scanned or entered") : "Nothing to review") : "", k: "info", sk: "mu" },
    ],
    callout: a
      ? {
          k: a.out_of_service.length ? "bad" : "info",
          ic: I.alert,
          t: `${a.report_number ?? "A roadside report"} needs review${a.out_of_service.length ? `: ${a.out_of_service.map((x) => (x === "vehicle" ? "a truck" : x === "trailer" ? "a trailer" : "the driver")).join(" and ")} ${a.out_of_service.length > 1 ? "were" : "was"} put out of service` : ""}`,
          d: [`${plural(a.violations, "violation")}${a.source === "driver_app" && a.driver ? ` read from ${a.driver}’s photos` : ""}, ${plural(a.points, "severity point")}.`, a.repairs_due_on ? `Repairs have to be certified on the report by ${formatDate(a.repairs_due_on).replace(/, \d{4}$/, "")}.` : ""].filter(Boolean).join(" "),
          b: "Review report",
          go: () => setOpened(a.id),
        }
      : undefined,
    columns: [
      { label: "Date", width: "84px", sort: "inspected_on", cell: (i) => cell.text(formatDate(i.inspected_on).replace(/, \d{4}$/, ""), "", "num") },
      { label: "Report", width: "minmax(0,1fr)", cell: (i) => cell.text(i.report_number || KINDS[i.kind] || humanize(i.kind), i.location ?? "", i.report_number ? "mono fs12 w5" : "") },
      { label: "Level", width: "72px", cell: (i) => cell.text(i.level ? `Level ${ROMAN[i.level]}` : KINDS[i.kind] ?? humanize(i.kind)) },
      { label: "Driver", width: "minmax(0,1fr)", cell: (i) => (i.driver ? cell.person(i.driver.name, initials(i.driver.name)) : cell.text(i.kind === "roadside" && i.level === 5 ? "Yard inspection" : "—", "", "mu")) },
      { label: "Units", width: "136px", cell: (i) => cell.text((i.units.length ? i.units : [i.unit]).map((u) => short(u.name)).join(" · "), "", "mono fs12") },
      { label: "Violations", width: "minmax(0,1.3fr)", cell: (i) => (i.defects.length ? cell.text(plural(i.defects.length, "violation"), i.defects.map((d) => d.item).join(", ")) : cell.text("None", "", "mu")) },
      { label: "Result", width: "128px", cell: (i) => cell.badge(...(RESULT[i.result] ?? [humanize(i.result), "mu"])) },
      { label: "Points", width: "60px", right: true, cell: (i) => cell.num(i.points ? String(i.points) : "—") },
      { label: "Status", width: "140px", cell: (i) => cell.badge(...(STATUS[i.status] ?? [humanize(i.status), "mu"])) },
    ],
    open: (i) => setOpened(i.id),
    actions: [
      { l: "Sync FMCSA", cls: "", ic: I.refresh, go: () => { notify("FMCSA isn’t connected yet: inspections are scanned or entered here. Connect it in Settings › Integrations."); if (can("organization.manage")) set(goTo("settings")); } },
      ...(add ? [{ l: "Add inspection", cls: "pri", ic: I.plus, go: add }] : []),
    ],
    empty: {
      icon: I.inspect,
      title: "No inspections yet",
      text: "Record roadside reports and the shop’s own inspections here. A violation can be turned into a work order, and an out-of-service order keeps the unit off loads until it is repaired.",
      action: add ? { label: "Add inspection", go: add } : undefined,
    },
  });
  return (
    <>
      <ListScreen list={list} />
      {opened ? <InspectionDialog id={opened} onClose={() => setOpened(null)} /> : null}
    </>
  );
}

/** One report: what it found against which unit or the driver, its points, and what is left to do about it. */
function InspectionDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { me, can, notify } = useConsole();
  const queryClient = useQueryClient();
  const fieldId = useId();
  const zone = me.organization.timezone;
  const query = useQuery({ queryKey: [me.organization.id, "inspections", "detail", id], queryFn: () => unwrap(api.GET("/api/v1/maintenance/inspections/{inspection_id}", { params: { path: { inspection_id: id } } })) });
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const i = query.data;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [me.organization.id] });
  };
  const act = async (action: "review" | "certify" | "dataqs") => {
    setPending(true);
    setProblem(null);
    try {
      await unwrap(api.POST("/api/v1/maintenance/inspections/{inspection_id}/actions", { params: { path: { inspection_id: id } }, body: { action, reference: action === "dataqs" ? reference : null } }));
      notify(action === "review" ? "Inspection reviewed" : action === "certify" ? "Repairs certified on the report" : "DataQs challenge recorded");
      refresh();
      onClose();
    } catch (e) {
      setProblem(errorMessage(e));
      setPending(false);
    }
  };
  const repair = async (defectId: string) => {
    try {
      const wo = await unwrap(api.POST("/api/v1/maintenance/inspections/{inspection_id}/defects/{defect_id}/work-order", { params: { path: { inspection_id: id, defect_id: defectId } } }));
      notify(`${wo.number} opened for ${wo.unit.name}`);
      refresh();
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  const allowed = new Set(i?.allowed_actions ?? []);
  const unitName = (against: string | null | undefined) => (against === "driver" ? "Driver" : i?.units.find((u) => u.type === against)?.name ?? i?.unit.name ?? "");
  return (
    <Dialog
      title={i ? `${i.report_number ?? KINDS[i.kind] ?? "Inspection"} · ${formatDate(i.inspected_on)}` : "Inspection"}
      sub={i ? [i.level ? `Level ${ROMAN[i.level]} · ${i.level_label}` : KINDS[i.kind], i.location, i.driver?.name].filter(Boolean).join(" · ") : undefined}
      icon="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
      width={620}
      onClose={() => !pending && onClose()}
      footer={
        <>
          <span className="fs12 mu">{i ? `${plural(i.points, "point")} · counts ${i.points ? `${Math.round(i.weighted_points / Math.max(1, i.points))}×` : "—"} today` : ""}</span>
          <span className="sp"></span>
          <button className="btn" onClick={onClose} disabled={pending}>Close</button>
          {allowed.has("dataqs") ? <button className="btn" onClick={() => void act("dataqs")} disabled={pending || reference.trim().length < 3}>Record DataQs</button> : null}
          {allowed.has("certify") ? <button className="btn" onClick={() => void act("certify")} disabled={pending}>Certify repairs</button> : null}
          {allowed.has("review") ? <button className="btn pri" onClick={() => void act("review")} disabled={pending}>Mark reviewed</button> : null}
        </>
      }
    >
      {query.isPending ? <Skeleton rows={4} /> : null}
      {query.isError ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : null}
      <Problem message={problem} />
      {i ? (
        <>
          <div className="r g8 wrap">
            {(RESULT[i.result] ?? null) ? <span className="badge" data-k={RESULT[i.result]![1]}><i></i>{RESULT[i.result]![0]}</span> : null}
            <span className="badge" data-k={(STATUS[i.status] ?? ["", "mu"])[1]}><i></i>{(STATUS[i.status] ?? [humanize(i.status)])[0]}</span>
            <span className="fs12 mu">{(i.units.length ? i.units : [i.unit]).map((u) => u.name).join(" · ")}</span>
          </div>
          {i.repairs_due_on && i.status !== "repairs_certified" && i.status !== "dataqs_filed" ? (
            <p className="note"><Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />{`Out-of-service repairs have to be certified on the report by ${formatDate(i.repairs_due_on)}. Repair the unit and return it to service first.`}</p>
          ) : null}
          {i.certified_at ? <p className="fs12 t3">{`Repairs certified ${formatDateTime(i.certified_at, zone)}${i.certified_by_name ? ` by ${i.certified_by_name}` : ""}.`}</p> : null}
          {i.dataqs_reference ? <p className="fs12 t3">{`DataQs ${i.dataqs_reference}${i.dataqs_filed_at ? ` · filed ${formatDateTime(i.dataqs_filed_at, zone)}` : ""}.`}</p> : null}
          {i.defects.length ? (
            <div className="c g8">
              {i.defects.map((d) => (
                <div key={d.id} className="vcard">
                  <div className="r g6">
                    {d.code ? <span className="mono fs12 w6 tx">{d.code}</span> : null}
                    <span className="tag" data-k="mu">{unitName(d.against)}</span>
                    <span className="sp"></span>
                    {d.severity === "out_of_service" ? <span className="tag" data-k="bad">Out of service</span> : null}
                  </div>
                  <div className="fs13 w5 tx">{d.item}</div>
                  <div className="r g6 fs12 mu">
                    <span className="f1">{[d.basic, d.points !== null && d.points !== undefined ? `${plural(d.points, "point")}${d.severity === "out_of_service" ? " incl. 2 out of service" : ""}` : "Points not known"].filter(Boolean).join(" · ")}</span>
                    {d.work_order ? <span className="tag" data-k="brand">{`${d.work_order.number} · ${humanize(d.work_order.status)}`}</span> : d.against !== "driver" && can("maintenance.manage") ? <button className="btn xs" onClick={() => void repair(d.id)}>Open work order</button> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="fs13 mu">No violations: a clean inspection.</p>
          )}
          {allowed.has("dataqs") ? (
            <div className="fld">
              <label htmlFor={`${fieldId}-dq`}>DataQs request number (to record a challenge)</label>
              <input id={`${fieldId}-dq`} className="inp" value={reference} maxLength={40} placeholder="Filed at dataqs.fmcsa.dot.gov" onChange={(e) => setReference(e.target.value)} />
            </div>
          ) : null}
          {i.notes ? <p className="fs12 t3">{i.notes}</p> : null}
        </>
      ) : null}
    </Dialog>
  );
}
