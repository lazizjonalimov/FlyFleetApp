"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { cell } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { addOf } from "@/features/console/shell";
import { useSoon } from "@/features/console/use-action";
import { UnitBulkDialog, type BulkMode } from "@/features/equipment/unit-bulk";
import { freshness, loadLabel, loadTone, TRAILER_TYPES } from "@/features/fleet/labels";
import { ListScreen } from "@/features/lists/list-screen";
import { useList, type Column, type ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDate, todayIn } from "@/lib/format/dates";
import { formatNumber, plural } from "@/lib/format/text";

type Truck = Schema<"VehicleRead">;
type Trailer = Schema<"TrailerRead">;
type Unit = Truck | Trailer;
type Count = Schema<"Count">;

const mmyy = (date: string | null | undefined) => (date ? `${date.slice(5, 7)}/${date.slice(2, 4)}` : "");
const few = (list: Count[], n = 2, join = " · ") => list.slice(0, n).map((x) => `${x.count} ${/^\d/.test(x.label) ? "" : "in "}${x.label}`).join(join);

/** What a unit is doing, as the fleet tables say it. */
function unitStatus(u: Unit, trailer: boolean): [label: string, tone: string] {
  if (u.status === "in_maintenance") return ["In the shop", "warn"];
  if (u.status === "out_of_service") return ["Out of service", "bad"];
  if (u.status === "retired") return ["Retired", "mu"];
  const load = u.current_load;
  if (!load && u.compliance.status === "expired") return ["Not dispatchable", "bad"];
  if (!load) return [trailer ? "Empty" : "Available", "ok"];
  if (trailer) return load.status === "at_pickup" ? ["At pickup", "atpickup"] : load.status === "on_hold" ? ["On hold", "hold"] : ["Loaded", "assigned"];
  return [loadLabel(load.status), loadTone(load.status)];
}

/** Trucks, or trailers: what each unit is doing, who drives it, who owns it, and where it is. */
export function UnitsScreen({ kind }: { kind: "truck" | "trailer" }) {
  const { me, can, I, set } = useConsole();
  const soon = useSoon();
  const truck = kind === "truck";
  const trailer = !truck;
  const org = me.organization;
  const today = todayIn(org.timezone);
  const soonDate = new Date(Date.parse(`${today}T12:00:00Z`) + 60 * 86_400_000).toISOString().slice(0, 10);
  const [bulk, setBulk] = useState<{ mode: BulkMode; units: Unit[] } | null>(null);
  const trucks = useQuery({ queryKey: [org.id, "vehicles", "summary"], queryFn: () => unwrap(api.GET("/api/v1/vehicles/summary")), enabled: truck, staleTime: 30_000 });
  const trailers = useQuery({ queryKey: [org.id, "trailers", "summary"], queryFn: () => unwrap(api.GET("/api/v1/trailers/summary")), enabled: trailer, staleTime: 30_000 });
  const t = trucks.data;
  const r = trailers.data;
  const openLoad = (id: string) => set({ screen: "loads", drawer: id, overlay: "none", modal: "none" });
  const openDriver = (id: string) => set({ screen: "driver", driverId: id, drawer: null, overlay: "none", modal: "none" });
  const openOwner = (id: string) => set({ screen: "owner", ownerId: id, otab: "ov", drawer: null, overlay: "none", modal: "none" });
  const openUnit = (id: string, unitKind: "truck" | "trailer") => set({ screen: "truck", unitId: id, unitKind, drawer: null, overlay: "none", modal: "none" });
  const add = can("equipment.manage") ? () => set(addOf(kind)) : null;
  const manageMaint = can("maintenance.manage");
  const manage = can("equipment.manage");

  const owner = (u: Unit) => {
    const main = [...(u.owners ?? [])].sort((a, b) => Number(b.share_pct) - Number(a.share_pct))[0];
    return main ? cell.name(main.name, () => openOwner(main.owner_id)) : cell.text("Company fleet", "", "mu");
  };
  const share = (u: Unit) => {
    const total = (u.owners ?? []).reduce((sum, o) => sum + Number(o.share_pct), 0);
    return total ? cell.text(`${Number(total.toFixed(2))}%`, "", "num") : cell.text("Company", "", "mu");
  };
  const location = (u: Unit) => {
    const [fresh, tone] = freshness(u.location?.seen_at);
    return u.location?.place ? cell.text(u.location.place, fresh, "", `sk-${tone}`) : cell.text("No position yet", "", "mu");
  };
  const nextService = (u: Unit) => {
    const ns = u.next_service;
    if (!ns) return cell.maybe(null);
    const odometer = "odometer" in u ? u.odometer : null;
    const due = ns.odometer && odometer && ns.odometer > odometer ? `in ${formatNumber(ns.odometer - odometer)} mi` : ns.scheduled_for ? formatDate(ns.scheduled_for).replace(/, \d{4}$/, "") : "";
    return cell.text([ns.title, due].filter(Boolean).join(" "), "", ns.status === "in_progress" || (ns.scheduled_for && ns.scheduled_for < today) ? "sk-warn" : "");
  };
  const plateExp = (u: Unit) => cell.text(mmyy(u.registration_expiry) || "—", "", `mono fs12 ${u.registration_expiry && u.registration_expiry < today ? "sk-bad" : u.registration_expiry && u.registration_expiry <= soonDate ? "sk-warn" : "t2"}`);

  const truckColumns: Column<Unit>[] = [
    { label: "Unit", width: "76px", sort: "unit_number", cell: (u) => cell.text(u.unit_number, "", "mono w5") },
    { label: "Status", width: "128px", cell: (u) => cell.badge(...unitStatus(u, false)) },
    { label: "Driver", width: "150px", cell: (u) => (u.driver ? cell.name(u.driver.name, () => openDriver(u.driver!.id)) : cell.maybe(null)) },
    { label: "Co-driver", width: "140px", cell: (u) => (u.co_driver ? cell.name(u.co_driver.name, () => openDriver(u.co_driver!.id)) : cell.maybe(null)) },
    { label: "Load", width: "96px", cell: (u) => (u.current_load ? cell.id(u.current_load.load_number, () => openLoad(u.current_load!.id)) : cell.maybe(null)) },
    { label: "Location", width: "176px", cell: location, csv: (u) => u.location?.place ?? "" },
    { label: "Owner", width: "176px", sort: "owner", cell: owner },
    { label: "Ownership", width: "84px", cell: share },
    { label: "Year", width: "52px", sort: "year", cell: (u) => cell.maybe(u.year ? String(u.year) : "", "num") },
    { label: "Make", width: "112px", sort: "make", cell: (u) => cell.maybe(u.make) },
    { label: "Model", width: "128px", cell: (u) => cell.maybe("model" in u ? u.model : "") },
    { label: "VIN", width: "172px", cell: (u) => cell.maybe(u.vin, "mono fs12 t2") },
    { label: "Plate", width: "92px", cell: (u) => cell.maybe(u.plate, "mono fs12") },
    { label: "State", width: "52px", cell: (u) => cell.maybe(u.plate_state, "mono fs12 t2") },
    { label: "Plate exp.", width: "76px", cell: plateExp, csv: (u) => u.registration_expiry ?? "" },
    { label: "Odometer", width: "92px", right: true, sort: "odometer", cell: (u) => cell.num("odometer" in u && u.odometer !== null && u.odometer !== undefined ? formatNumber(u.odometer) : "—"), csv: (u) => ("odometer" in u ? u.odometer : null) },
    { label: "Next service", width: "176px", cell: nextService },
    { label: "", width: "28px", cell: () => cell.more() },
  ];
  const trailerColumns: Column<Unit>[] = [
    { label: "Unit", width: "76px", sort: "unit_number", cell: (u) => cell.text(u.unit_number, "", "mono w5") },
    { label: "Type", width: "96px", sort: "type", cell: (u) => cell.text("type" in u ? (TRAILER_TYPES[u.type] ?? u.type) : "") },
    { label: "Status", width: "120px", cell: (u) => cell.badge(...unitStatus(u, true)) },
    { label: "Truck", width: "76px", cell: (u) => (u.truck ? cell.text(u.truck.name, "", "mono fs12") : cell.maybe(null)) },
    { label: "Load", width: "96px", cell: (u) => (u.current_load ? cell.id(u.current_load.load_number, () => openLoad(u.current_load!.id)) : cell.maybe(null)) },
    { label: "Location", width: "176px", cell: location, csv: (u) => u.location?.place ?? "" },
    { label: "Owner", width: "176px", sort: "owner", cell: owner },
    { label: "Length", width: "56px", cell: (u) => cell.maybe("length_ft" in u && u.length_ft ? `${u.length_ft}’` : "", "num t2") },
    { label: "Year", width: "52px", sort: "year", cell: (u) => cell.maybe(u.year ? String(u.year) : "", "num") },
    { label: "Make", width: "140px", sort: "make", cell: (u) => cell.maybe(u.make) },
    { label: "Model", width: "156px", cell: (u) => cell.maybe("model" in u ? u.model : "") },
    { label: "VIN", width: "172px", cell: (u) => cell.maybe(u.vin, "mono fs12 t2") },
    { label: "Plate", width: "92px", cell: (u) => cell.maybe(u.plate, "mono fs12") },
    { label: "State", width: "52px", cell: (u) => cell.maybe(u.plate_state, "mono fs12 t2") },
    { label: "Plate exp.", width: "76px", cell: plateExp, csv: (u) => u.registration_expiry ?? "" },
    { label: "Next service", width: "188px", cell: nextService },
    { label: "", width: "28px", cell: () => cell.more() },
  ];

  const ownerOptions = (owners: Count[] | undefined) => [{ value: "company", label: "Company fleet" }, ...(owners ?? []).map((o) => ({ value: o.value, label: o.label, count: o.count }))];
  const list = useList<Unit>({
    key: truck ? "vehicles" : "trailers",
    noun: truck ? "trucks" : "trailers",
    group: "Safety & fleet",
    title: truck ? "Trucks" : "Trailers",
    sub: () =>
      truck
        ? `${t ? `${plural(t.total, "truck")} · ${t.company} company-owned${t.owner_units ? `, ${t.owner_units} owned by ${plural(t.owners, "outside owner")}` : ""} · ` : ""}trucks out of service or in the shop can’t be dispatched`
        : r
          ? [plural(r.total, "trailer"), r.by_type.map((x) => `${x.count} ${x.count === 1 ? x.label.replace(/s$/, "").toLowerCase() : x.label.toLowerCase()}`).join(", "), r.owner_units ? `${r.owner_units} owned by ${r.owner_list.map((o) => o.label).join(", ")}` : ""].filter(Boolean).join(" · ")
          : "",
    placeholder: truck ? "Unit, VIN, plate, driver or owner" : "Unit, VIN, plate, truck or owner",
    fetch: (query: ListQuery) => (truck ? unwrap(api.GET("/api/v1/vehicles", { params: { query: query as never } })) : unwrap(api.GET("/api/v1/trailers", { params: { query: query as never } }))),
    defaultSort: "unit_number",
    tabs: truck
      ? [{ label: "All" }, { label: "Available", params: { kind: "available" } }, { label: "On a load", params: { kind: "on_loads" } }, { label: "In the shop", params: { kind: "shop" } }, { label: "Owner trucks", params: { kind: "owner" } }, { label: "Team trucks", params: { kind: "team" } }]
      : [{ label: "All" }, { label: "Loaded", params: { kind: "loaded" } }, { label: "Empty", params: { kind: "yard" } }, { label: "In the shop", params: { kind: "shop" } }, { label: "Reefers", params: { type: "reefer" } }, { label: "Owner trailers", params: { kind: "owner" } }],
    kpis: truck
      ? [
          { label: "On loads now", value: t ? String(t.on_loads) : "—", suffix: t ? ` of ${t.total}` : "", sub: t && t.utilization_pct !== null ? `${t.utilization_pct}% utilization${t.last_week_pct !== null ? ` · ${t.last_week_pct}% last week` : ""}` : "", k: "brand", sk: "ok" },
          { label: "Available", value: t ? String(t.available) : "—", suffix: "", sub: t ? few(t.available_at) || "None free right now" : "", k: "ok", sk: "mu" },
          { label: "In the shop", value: t ? String(t.in_maintenance + t.out_of_service) : "—", suffix: "", sub: t ? `${t.in_maintenance} in maintenance · ${t.out_of_service} out of service` : "", k: "warn", sk: "mu" },
          { label: "Team trucks", value: t ? String(t.teams.length) : "—", suffix: "", sub: t ? t.teams.join(" · ") || "No two-driver trucks" : "", k: "violet", sk: "mu" },
          { label: "Owned by outside owners", value: t ? String(t.owner_units) : "—", suffix: t ? ` of ${t.total}` : "", sub: t ? `${plural(t.owners, "owner")} · ${t.company} company-owned` : "", k: "teal", sk: "mu" },
        ]
      : [
          { label: "Loaded now", value: r ? String(r.loaded) : "—", suffix: r ? ` of ${r.total}` : "", sub: r ? `${r.utilization_pct ?? 0}% utilization · ${r.empty} empty` : "", k: "brand", sk: "mu" },
          { label: "Ready in a yard", value: r ? String(r.empty) : "—", suffix: "", sub: r ? r.yard_at.slice(0, 3).map((x) => `${x.label} ${x.count}`).join(" · ") || "None in a yard" : "", k: "ok", sk: "mu" },
          { label: "Reefers running", value: r ? String(r.reefers_loaded) : "—", suffix: r ? ` of ${r.reefers}` : "", sub: r ? (r.reefers ? `${r.reefers - r.reefers_loaded} in a yard` : "No reefers") : "", k: "info", sk: "mu" },
          { label: "Service due · 60 days", value: r ? String(r.service_due) : "—", suffix: "", sub: r ? r.service_due_detail.map((x) => `${x.count} ${x.label}`).join(" · ") || "Nothing due" : "", k: "warn", sk: "mu" },
        ],
    filters: truck
      ? [
          { key: "status", label: "Status", options: [["active", "In service"], ["in_maintenance", "In the shop"], ["out_of_service", "Out of service"], ["retired", "Retired"]].map(([value, label]) => ({ value: value!, label: label! })) },
          { key: "make", label: "Make", options: (t?.makes ?? []).map((x) => ({ value: x.value, label: x.label, count: x.count })) },
          { key: "year", label: "Year", options: (t?.years ?? []).map((x) => ({ value: x.value, label: x.label, count: x.count })) },
          { key: "owner", label: "Owner", options: ownerOptions(t?.owner_list), params: (v) => (v === "company" ? { kind: "company" } : { owner_id: v }) },
        ]
      : [
          { key: "type", label: "Type", options: (r?.by_type ?? []).map((x) => ({ value: x.value, label: TRAILER_TYPES[x.value] ?? x.label, count: x.count })) },
          { key: "make", label: "Make", options: (r?.makes ?? []).map((x) => ({ value: x.value, label: x.label, count: x.count })) },
          { key: "year", label: "Year", options: (r?.years ?? []).map((x) => ({ value: x.value, label: x.label, count: x.count })) },
          { key: "owner", label: "Owner", options: ownerOptions(r?.owner_list), params: (v) => (v === "company" ? { kind: "company" } : { owner_id: v }) },
        ],
    frozen: 1,
    bulk: [
      ...(truck && can("dispatch.assign") ? [{ label: "Assign to a team", go: soon("Assigning trucks to a dispatch team") }] : []),
      ...(manageMaint ? [{ label: "Schedule service", go: (units: Unit[]) => setBulk({ mode: "service", units }) }] : []),
      ...(manage ? [{ label: "Change status", go: (units: Unit[]) => setBulk({ mode: "status", units }) }] : []),
      ...(trailer && manage ? [{ label: "Move to a yard", go: (units: Unit[]) => setBulk({ mode: "yard", units }) }] : []),
      "export" as const,
    ],
    open: (u) => openUnit(u.id, kind),
    columns: truck ? truckColumns : trailerColumns,
    actions: [
      ...(manage ? [{ l: "Import", cls: "", ic: I.sheet, go: () => set({ ...addOf(kind), mstep: "import" }) }] : []),
      ...(add ? [{ l: truck ? "Add truck" : "Add trailer", cls: "pri", ic: I.plus, go: add }] : []),
    ],
    empty: {
      icon: truck ? I.truck : I.trailer,
      title: truck ? "No trucks yet" : "No trailers yet",
      text: "A unit’s record holds its registration, insurance and inspection dates, who drives it and who owns it. When a paper lapses, the unit can’t be dispatched.",
      action: add ? { label: truck ? "Add truck" : "Add trailer", go: add } : undefined,
    },
  });
  return (
    <>
      <ListScreen list={list} />
      {bulk ? <UnitBulkDialog kind={kind} mode={bulk.mode} units={bulk.units} onClose={() => { setBulk(null); set({ lsel: [] }); }} /> : null}
    </>
  );
}
