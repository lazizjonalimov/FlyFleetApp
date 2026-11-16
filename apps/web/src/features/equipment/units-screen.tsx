"use client";

import { cell } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { addOf } from "@/features/console/shell";
import { complianceCell, monthYear, OWNERSHIP, TRAILER_TYPES, workCell } from "@/features/fleet/labels";
import { ListScreen } from "@/features/lists/list-screen";
import { useList, type Column, type ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatNumber, plural } from "@/lib/format/text";

type Truck = Schema<"VehicleRead">;
type Trailer = Schema<"TrailerRead">;
type Unit = Truck | Trailer;

const STATUS_TABS = [
  { label: "Active", params: { status: "active" } },
  { label: "In the shop", params: { status: "in_maintenance" } },
  { label: "Out of service", params: { status: "out_of_service" } },
  { label: "Retired", params: { status: "retired" } },
  { label: "All" },
];

/** Trucks, or trailers: what each unit is doing, and the dates that can take it off the road. */
export function UnitsScreen({ kind }: { kind: "truck" | "trailer" }) {
  const { can, I, set } = useConsole();
  const truck = kind === "truck";
  const openLoad = (id: string) => set({ screen: "loads", drawer: id, overlay: "none", modal: "none" });
  const shared: Column<Unit>[] = [
    { label: "Load", width: "96px", cell: (u) => (u.current_load ? cell.id(u.current_load.load_number, () => openLoad(u.current_load!.id)) : cell.maybe(null)) },
    { label: "Ownership", width: "150px", cell: (u) => cell.text(OWNERSHIP[u.ownership] ?? u.ownership) },
    { label: "Year", width: "64px", cell: (u) => cell.maybe(u.year ? String(u.year) : "", "num") },
    { label: "Make", width: "128px", cell: (u) => cell.maybe(u.make) },
  ];
  const papers: Column<Unit>[] = [
    { label: "VIN", width: "184px", cell: (u) => cell.maybe(u.vin, "mono fs12") },
    { label: "Plate", width: "100px", cell: (u) => cell.maybe(u.plate, "mono fs12") },
    { label: "State", width: "56px", cell: (u) => cell.maybe(u.plate_state) },
    { label: "Registration", width: "112px", cell: (u) => cell.maybe(monthYear(u.registration_expiry)) },
    { label: "Insurance", width: "112px", cell: (u) => cell.maybe(monthYear(u.insurance_expiry)) },
    { label: "Inspection", width: "112px", cell: (u) => cell.maybe(monthYear(u.inspection_expiry)) },
    { label: "Compliance", width: "236px", cell: (u) => complianceCell(u.compliance, "In order") },
  ];
  const add = can("equipment.manage") ? () => set(addOf(kind)) : null;

  const list = useList<Unit>({
    key: truck ? "vehicles" : "trailers",
    group: "Safety & fleet",
    title: truck ? "Trucks" : "Trailers",
    sub: (total) => (total === null ? "" : `${plural(total, kind)} · `) + "units out of service or in the shop can’t be dispatched",
    placeholder: "Unit, VIN or plate",
    fetch: (query: ListQuery) => (truck ? unwrap(api.GET("/api/v1/vehicles", { params: { query: query as never } })) : unwrap(api.GET("/api/v1/trailers", { params: { query: query as never } }))),
    defaultSort: "unit_number",
    tabs: truck ? STATUS_TABS : [...STATUS_TABS.slice(0, 1), { label: "Reefers", params: { status: "active", type: "reefer" } }, ...STATUS_TABS.slice(1)],
    frozen: 2,
    bulk: [],
    open: (u) => set({ screen: "truck", unitId: u.id, unitKind: kind, drawer: null, overlay: "none", modal: "none" }),
    columns: [
      { label: "Unit", width: "84px", sort: "unit_number", cell: (u) => cell.text(u.unit_number, "", "mono w5") },
      ...(truck ? [] : [{ label: "Type", width: "110px", cell: (u: Unit) => cell.text("type" in u ? (TRAILER_TYPES[u.type] ?? u.type) : "") }]),
      { label: "Status", width: "140px", cell: (u) => workCell(u.status, u.current_load, truck ? { free: "Available", busy: "On a load" } : { free: "Empty", busy: "Loaded" }) },
      ...shared,
      ...(truck ? [{ label: "Model", width: "140px", cell: (u: Unit) => cell.maybe("model" in u ? u.model : "") }] : [{ label: "Length", width: "72px", cell: (u: Unit) => cell.maybe("length_ft" in u && u.length_ft ? `${u.length_ft}’` : "") }]),
      ...papers.slice(0, 3),
      ...(truck ? [{ label: "Odometer", width: "104px", right: true, cell: (u: Unit) => cell.num("odometer" in u && u.odometer !== null && u.odometer !== undefined ? formatNumber(u.odometer) : "—") }] : []),
      ...papers.slice(3),
    ],
    actions: add ? [{ l: truck ? "Add truck" : "Add trailer", cls: "pri", ic: I.plus, go: add }] : [],
    empty: {
      icon: truck ? I.truck : I.trailer,
      title: truck ? "No trucks yet" : "No trailers yet",
      text: "A unit’s record holds its registration, insurance and inspection dates. When one lapses, the unit can’t be dispatched.",
      action: add ? { label: truck ? "Add truck" : "Add trailer", go: add } : undefined,
    },
  });
  return <ListScreen list={list} />;
}
