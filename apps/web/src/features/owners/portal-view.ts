"use client";

// The owner portal: what an equipment owner sees. Every section follows the owner's portal permissions, which
// the API enforces on each request; this only lays out what came back.
import { useQuery } from "@tanstack/react-query";
import { cell, heading } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import type { Row } from "@/features/console/view";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, initials, plural } from "@/lib/format/text";
import { DOC_TYPES } from "./labels";
import { ownerRanges } from "./owner-record";
import type { OwnerPortalView } from "./types";

type Unit = Schema<"UnitOut">;
const PTABS: [key: string, label: string, needs: string[]][] = [["ov", "Overview", []], ["eq", "Equipment", ["equipment"]], ["loads", "Loads", ["loads", "completed"]], ["stmt", "Statements", ["statements"]], ["exp", "Fuel & expenses", ["fuel", "expenses"]], ["mt", "Maintenance", ["maintenance"]], ["docs", "Documents", ["documents"]]];
const LIVE = ["assigned", "dispatched", "at_pickup", "in_transit", "at_delivery"];
const n = (v: string | number | null | undefined) => Number(v ?? 0);
const fm = (v: string | number | null | undefined) => `$${Math.round(n(v)).toLocaleString("en-US")}`;
const fm2 = (v: string | number | null | undefined) => formatMoney(n(v));
const titled = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const fresh = (seen: string | null | undefined): [string, string] => {
  if (!seen) return ["No position yet", "mu"];
  const minutes = Math.round((Date.now() - Date.parse(seen)) / 60000);
  if (minutes < 15) return [minutes <= 1 ? "Just now" : `${minutes} min ago`, "ok"];
  if (minutes < 120) return [`${minutes} min ago`, "warn"];
  const hours = Math.round(minutes / 60);
  return [hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`, "bad"];
};

export function useOwnerPortal(): { view: OwnerPortalView | null; error: unknown; retry: () => void } {
  const { me, state, set } = useConsole();
  const org = me.organization;
  const preview = org.role !== "owner_portal";
  const ownerId = preview && typeof state.ownerId === "string" ? state.ownerId : undefined;
  const q = ownerId ? { owner_id: ownerId } : {};
  const tabKey = typeof state.ptab === "string" ? state.ptab : "ov";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: org.timezone });
  const week = ownerRanges(today).wk!;
  const home = useQuery({ queryKey: [org.id, "portal", ownerId ?? "me"], queryFn: () => unwrap(api.GET("/api/v1/portal/owner", { params: { query: q } })) });
  const perms = new Set(home.data?.permissions ?? []);
  const has = (...keys: string[]) => keys.some((k) => perms.has(k));
  const ready = !!home.data;
  const equipment = useQuery({ queryKey: [org.id, "portal", ownerId ?? "me", "equipment"], queryFn: () => unwrap(api.GET("/api/v1/portal/owner/equipment", { params: { query: q } })), enabled: ready && has("equipment") });
  const activity = useQuery({ queryKey: [org.id, "portal", ownerId ?? "me", "activity", week.from, week.to], queryFn: () => unwrap(api.GET("/api/v1/portal/owner/activity", { params: { query: { ...q, date_from: week.from, date_to: week.to } } })), enabled: ready && has("loads", "completed", "statements", "performance") });
  const year = useQuery({ queryKey: [org.id, "portal", ownerId ?? "me", "activity", `${today.slice(0, 4)}-01-01`, today], queryFn: () => unwrap(api.GET("/api/v1/portal/owner/activity", { params: { query: { ...q, date_from: `${today.slice(0, 4)}-01-01`, date_to: today } } })), enabled: ready && has("statements") });
  const fuel = useQuery({ queryKey: [org.id, "portal", ownerId ?? "me", "fuel", week.from, week.to], queryFn: () => unwrap(api.GET("/api/v1/portal/owner/fuel", { params: { query: { ...q, date_from: week.from, date_to: week.to } } })), enabled: ready && has("fuel", "expenses") });
  const maintenance = useQuery({ queryKey: [org.id, "portal", ownerId ?? "me", "maintenance"], queryFn: () => unwrap(api.GET("/api/v1/portal/owner/maintenance", { params: { query: q } })), enabled: ready && has("maintenance") });
  const documents = useQuery({ queryKey: [org.id, "portal", ownerId ?? "me", "documents"], queryFn: () => unwrap(api.GET("/api/v1/portal/owner/documents", { params: { query: q } })), enabled: ready && has("documents") });
  const live = useQuery({ queryKey: [org.id, "portal", ownerId ?? "me", "live"], queryFn: () => unwrap(api.GET("/api/v1/portal/owner/live", { params: { query: q } })), enabled: ready && has("locations"), refetchInterval: 60_000 });

  const h = home.data;
  if (!h) return { view: null, error: home.error, retry: () => void home.refetch() };
  const tabs = PTABS.filter(([, , needs]) => !needs.length || has(...needs));
  const tab = tabs.some(([k]) => k === tabKey) ? tabKey : "ov";
  const units: Unit[] = equipment.data ?? [];
  const trucks = units.filter((u) => u.kind === "truck");
  const trailers = units.filter((u) => u.kind === "trailer");
  const a = activity.data;
  const rent = units.length > 0 && units.every((u) => u.agreement_kind === "rental");
  const short = h.entity_type === "business" ? h.owner_name.replace(/,? (LLC|Inc\.?|Corp\.?)$/i, "") : h.owner_name;
  const viewer = h.viewer_name;
  const first = viewer.split(" ")[0] ?? viewer;
  const liveBy = new Map((live.data ?? []).map((l) => [l.unit_id, l] as const));
  const moving = (live.data ?? []).filter((l) => l.load_number).length;
  const hidden = Object.entries(h.labels).filter(([k]) => !perms.has(k)).map(([, l]) => l.replace(/^View /, "").replace(/^./, (c) => c.toUpperCase()));
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: org.timezone }));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const weekday = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: org.timezone });
  const pickUp = (u: Unit) => (u.who_drives === "owner" ? "you" : u.driver?.employer === "owner" ? "your driver" : `${h.company}’s driver`);

  const unitsView = units.map((u) => {
    const where = liveBy.get(u.unit_id);
    const [fl] = fresh(where?.seen_at);
    const figures = a?.by_unit.find((x) => x.unit_id === u.unit_id);
    return {
      u: u.unit_number,
      ymm: [u.year, u.make, u.model].filter(Boolean).join(" ") || (u.kind === "truck" ? "Truck" : "Trailer"),
      kind: u.kind === "truck" ? "Truck" : titled(u.trailer_type ?? "trailer"),
      s: u.on_load ? "On load" : u.dispatchable ? "Available" : "Not in service",
      sk: u.on_load ? "transit" : u.dispatchable ? "ok" : "warn",
      now: has("locations") ? (where?.place ?? "No position yet") : "Location not shared",
      det: has("locations") && where?.seen_at ? fl : "",
      drv: u.kind === "truck" ? (has("drivers") ? (u.driver ? `${u.co_driver ? `${u.driver.name} & ${u.co_driver.name}` : u.driver.name} · ${pickUp(u)}` : "No driver seated") : "Driver details not shared") : `Pulled by any ${h.company} truck`,
      wk: u.kind === "truck" ? `${figures?.loads ?? 0} loads · ${formatNumber(figures?.miles ?? 0)} mi · ${week.label}` : "Trailer",
      svc: u.inspection_expiry ? `Inspection due ${formatDate(u.inspection_expiry)}` : "",
    };
  });
  const kpis: OwnerPortalView["kpis"] = [];
  if (has("statements")) {
    kpis.push({ label: `Net to you · ${today.slice(0, 4)} so far`, value: fm(year.data?.net), suffix: "", sub: "Before adjustments on the statements", k: "ok", sk: "mu" });
    kpis.push({ label: rent ? `Rental · ${week.label}` : `You earned · ${week.label}`, value: fm(a?.owner_gross), suffix: "", sub: rent ? "Trucks by the mile, trailers by the week" : "Before your costs", k: "brand", sk: "mu" });
  }
  if (has("performance", "loads")) kpis.push({ label: `Miles on your trucks · ${week.label}`, value: formatNumber(a?.miles ?? 0), suffix: " mi", sub: `${plural(a?.loads ?? 0, "load")}`, k: "info", sk: "mu" });
  if (has("equipment")) kpis.push({ label: "Trucks moving now", value: String(moving), suffix: ` of ${trucks.length}`, sub: trucks.length - moving ? `${trucks.length - moving} parked or waiting` : trucks.length ? "All on the road" : "No trucks", k: "teal", sk: "mu" });

  const loadRows: Row[] = (a?.load_rows ?? []).filter((r) => r.status !== "cancelled").map((r) => ({
    key: r.load_id,
    open: () => undefined,
    cells: [
      cell.text(r.load_number, "", "mono fs12 w5"),
      cell.text(r.unit_number, "", "mono fs12 t2"),
      cell.text(r.pickup_at ? formatDateTime(r.pickup_at, org.timezone) : "—", "", "num t2"),
      cell.text(r.delivered_at ? formatDateTime(r.delivered_at, org.timezone) : "—", "", "num t2"),
      cell.maybe(r.origin),
      cell.maybe(r.destination),
      cell.badge(titled(r.status), LIVE.includes(r.status) ? "transit" : "completed"),
      cell.num(formatNumber(r.miles)),
      ...(has("statements") ? [cell.money(rent ? "—" : fm2(r.revenue), "", rent ? "mu" : ""), cell.money(fm2(r.owner_gross), "", "w6")] : []),
    ],
  }));
  const fuelRows: Row[] = (fuel.data?.fuel ?? []).filter((r) => r.payer === "owner").map((r) => ({
    key: r.id,
    open: () => undefined,
    cells: [cell.text(formatDate(r.incurred_on), "", "num t2"), cell.maybe(r.unit_number, "mono fs12"), cell.maybe(r.vendor), cell.maybe(null), cell.maybe(r.jurisdiction, "mono fs12 t2"), cell.num(n(r.gallons).toFixed(1)), cell.money(n(r.gallons) ? `$${(n(r.amount) / n(r.gallons)).toFixed(3)}` : "—", "", "t2"), cell.money(fm2(r.amount))],
  }));
  const exp = has("expenses") ? [
    ...(fuel.data?.other ?? []).filter((r) => r.payer === "owner").map((r) => ({ t: `${r.unit_number ?? ""} · ${titled(r.category)}`, d: [formatDate(r.incurred_on), r.vendor].filter(Boolean).join(" · "), v: fm2(r.amount) })),
    ...(fuel.data?.chargebacks ?? []).map((c) => ({ t: `${c.unit_number} · ${c.label}`, d: "Weekly, under the agreement", v: fm2(c.weekly) })),
  ] : [];

  const view: OwnerPortalView = {
    n: h.owner_name,
    ini: initials(h.owner_name),
    k: "brand",
    uini: initials(viewer),
    uname: preview ? h.owner_name : viewer,
    scope: `Only what ${short} owns`,
    preview,
    exit: () => set({ screen: "owner", ownerId: h.owner_id, otab: "acc", overlay: "none", modal: "none" }),
    tabs: tabs.map(([k, l]) => ({ l, on: k === tab ? "on" : "", go: () => set({ ptab: k }) })),
    t: { ov: tab === "ov", eq: tab === "eq", loads: tab === "loads", stmt: tab === "stmt", exp: tab === "exp", mt: tab === "mt", docs: tab === "docs" },
    hello: `${greeting}, ${preview ? short : first}`,
    sub: `${h.owner_name}${units.length ? ` · ${[plural(trucks.length, "truck"), trailers.length ? plural(trailers.length, "trailer") : ""].filter(Boolean).join(" and ")} ${rent ? "rented to" : "leased to"} ${h.company}` : ""} · ${weekday}`,
    showNext: has("statements"),
    next: { t: `Statement · ${week.label}`, v: fm2(a?.net), d: "Worked out from the week’s loads and costs" },
    kpis,
    hiddenN: hidden.length ? `Not shared with you: ${hidden.join(", ")}. Ask ${h.company} if you need them.` : "",
    units: has("equipment") ? unitsView : [],
    ucls: units.length > 4 ? "n6" : "n4",
    showMap: has("locations") && has("equipment"),
    map: null,
    now: (live.data ?? []).map((l) => {
      const [fl, fk] = fresh(l.seen_at);
      return { u: l.unit_number, s: l.load_number ? "On load" : "No load", sk: l.load_number ? "transit" : "mu", lane: l.load_number ? `${l.load_number}${l.lane ? ` · ${l.lane}` : ""}` : "No load right now", loc: l.place ?? "No position yet", fresh: fl, fk, d: l.driver_name ?? "" };
    }),
    foot: `You see only what ${short} owns. ${h.company}’s other trucks, its customers and other owners are never shown here.`,
    eq: {
      cols: `76px 92px 52px 112px 136px 172px 92px 120px${has("locations") ? " 176px" : ""}${has("drivers") ? " 170px" : ""} 168px`,
      fz: "fz1",
      head: [heading("Unit"), heading("Type"), heading("Year"), heading("Make"), heading("Model"), heading("VIN"), heading("Plate"), heading("Status"), ...(has("locations") ? [heading("Location")] : []), ...(has("drivers") ? [heading("Driver")] : []), heading("Next service")],
      rows: units.map((u, i) => {
        const where = liveBy.get(u.unit_id);
        const [fl, fk] = fresh(where?.seen_at);
        return {
          key: u.unit_id,
          open: () => undefined,
          cells: [
            cell.text(u.unit_number, "", "mono w5"),
            cell.text(u.kind === "truck" ? "Truck" : titled(u.trailer_type ?? "trailer"), "", "t2"),
            cell.maybe(u.year ? String(u.year) : null, "num"),
            cell.maybe(u.make),
            cell.maybe(u.model),
            cell.maybe(u.vin, "mono fs12 t2"),
            cell.maybe(u.plate, "mono fs12"),
            cell.badge(unitsView[i]!.s, unitsView[i]!.sk),
            ...(has("locations") ? [where?.place ? cell.text(where.place, fl, "", `sk-${fk}`) : cell.maybe(null)] : []),
            ...(has("drivers") ? [u.driver ? cell.text(u.co_driver ? `${u.driver.name} & ${u.co_driver.name.split(" ")[0]}` : u.driver.name) : cell.maybe(null)] : []),
            cell.maybe(unitsView[i]!.svc, "t2"),
          ],
        };
      }),
    },
    lt: {
      cols: `92px 72px 140px 140px 140px 150px 120px 88px${has("statements") ? " 112px 120px" : ""}`,
      fz: "fz1",
      head: [heading("Load"), heading("Truck"), heading("Pickup"), heading("Delivery"), heading("Origin"), heading("Destination"), heading("Status"), heading("Miles", true), ...(has("statements") ? [heading("Revenue", true), heading(rent ? "Your rental" : "Your share", true)] : [])],
      rows: loadRows,
    },
    ltNote: rent ? "Rental is paid on every mile driven, loaded or empty, so load rates aren’t shown. Customer names are never shown." : "Revenue is line haul, fuel surcharge and accessorials. Customer names are removed from everything you see.",
    sum: [
      { l: rent ? "Rental earned" : "You earned", v: fm2(a?.owner_gross), s: rent ? "Trucks by the mile, trailers by the week" : `Your share of ${fm2(a?.revenue)} in load revenue` },
      { l: "Your costs", v: fm2(a?.owner_costs), s: n(a?.costs?.driver_pay) ? `Includes your drivers’ pay, ${fm2(a?.costs?.driver_pay)}` : "Fuel, insurance, repairs, escrow" },
      { l: "Net to you", v: fm2(a?.net), s: `For ${week.label}` },
    ],
    sl: (a?.by_unit ?? []).map((u) => ({ u: u.unit_number, d: u.kind === "truck" ? `${plural(u.loads, "load")} · ${formatNumber(u.miles)} mi` : "Trailer", g: fm2(u.owner_gross), c: fm2(u.owner_costs), n: fm2(u.owner_net) })),
    past: [],
    canDl: has("download"),
    ft: { cols: "96px 72px 130px 110px 52px 80px 92px 104px", fz: "fz1", head: [heading("Date"), heading("Truck"), heading("Truck stop"), heading("City"), heading("State"), heading("Gallons", true), heading("Price", true), heading("Amount", true)], rows: fuelRows },
    hasFuel: fuelRows.length > 0,
    noFuel: !has("fuel") ? "Fuel purchases aren’t shared with you." : fuelRows.length ? "" : `No fuel was charged to you for ${week.label}.`,
    exp,
    hasExp: has("expenses"),
    mt: {
      cols: "84px 76px 96px 250px 220px 112px 104px",
      fz: "fz1",
      head: [heading("Work order"), heading("Unit"), heading("Date"), heading("Work"), heading("Shop"), heading("Status"), heading("Your cost", true)],
      rows: (maintenance.data?.work_orders ?? []).map((w) => ({ key: w.id, open: () => undefined, cells: [cell.text(w.number, "", "mono fs12 w5"), cell.text(w.unit_number, "", "mono fs12"), cell.text(formatDate(w.completed_on ?? w.opened_on), "", "num t2"), cell.text(w.title), cell.maybe(w.vendor, "t2"), cell.badge(titled(w.status), w.status === "completed" ? "completed" : "info"), cell.money(w.payer === "owner" && n(w.total_cost) ? fm2(w.total_cost) : w.payer === "owner" ? "—" : `${h.company} pays`, "", w.payer === "owner" && n(w.total_cost) ? "" : "mu")] })),
    },
    dt: {
      cols: "320px 110px 92px 120px 150px 120px",
      fz: "fz1",
      head: [heading("Document"), heading("Type"), heading("Unit"), heading("Expires"), heading("Status"), heading("")],
      rows: (documents.data ?? []).map((d) => ({ key: d.id, open: () => undefined, cells: [cell.text(d.filename, "", "w5"), cell.text(DOC_TYPES[d.type] ?? d.type, "", "t2"), cell.text(d.attached_kind === "owner" ? "All units" : d.attached_to, "", "t2"), cell.maybe(d.expires_on ? formatDate(d.expires_on) : null, "t2"), cell.badge(d.review_status === "approved" ? "Reviewed" : "On file", d.review_status === "approved" ? "ok" : "mu"), cell.maybe(has("download") ? "Download in the next release" : "View only")] })),
    },
  };
  return { view, error: null, retry: () => void home.refetch() };
}
