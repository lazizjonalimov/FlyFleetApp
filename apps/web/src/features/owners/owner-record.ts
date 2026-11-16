"use client";

// The owner record: its nine tabs built from the owner's API records. Money splits, costs and series come from
// /owners/{id}/activity; everything here only shapes them for the screen.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { cell, heading } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { addOf, goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import type { Row } from "@/features/console/view";
import { viewDocument } from "@/features/documents/use-upload";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, initials, plural } from "@/lib/format/text";
import { colStack, hbars, multiLine, VK } from "./charts";
import { agreementKind, agreementLine, CATEGORY, DOC_TYPES, employment, ENTITY, ownerInitials, PAYER, PERMISSION_DETAIL, shortName, STATUS } from "./labels";
import { downloadCsv } from "./owner-dialogs";
import type { OwnerView } from "./types";

type Detail = Schema<"OwnerDetail">;
type Activity = Schema<"OwnerActivity">;
type Fuel = Schema<"OwnerFuel">;
type Maintenance = Schema<"OwnerMaintenance">;
type Doc = Schema<"OwnerDocument">;
type Live = Schema<"LiveUnit">;
type Unit = Schema<"UnitOut">;

const DAY = 86_400_000;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const OTABS: [key: string, label: string][] = [["ov", "Overview"], ["eq", "Equipment"], ["live", "Live tracking"], ["loads", "Loads & dispatch"], ["fuel", "Fuel & expenses"], ["stmt", "Statements"], ["mt", "Maintenance"], ["docs", "Documents"], ["acc", "Access & permissions"]];
const LIVE_LOAD = ["assigned", "dispatched", "at_pickup", "in_transit", "at_delivery"];
const DONE_LOAD = ["delivered", "pod_review", "completed"];
const PRESETS: [key: string, label: string][] = [["full", "Full owner"], ["monitor", "Monitor only"], ["bookkeeper", "Bookkeeper"]];

const n = (v: string | number | null | undefined) => Number(v ?? 0);
const fm = (v: string | number | null | undefined) => `${n(v) < 0 ? "−" : ""}$${Math.abs(Math.round(n(v))).toLocaleString("en-US")}`;
const fm2 = (v: string | number | null | undefined) => (n(v) < 0 ? `−${formatMoney(Math.abs(n(v)))}` : formatMoney(n(v)));
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY);
const short = (d: Date) => `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;

/** "Nov 2–8", "Oct 26 – Nov 1", "Jun 1 – Nov 16". */
export function rangeLabel(from: string, to: string): string {
  const a = day(from), b = day(to);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) return `${short(a)}–${b.getUTCDate()}`;
  return `${short(a)} – ${short(b)}`;
}

/** The three ranges the record offers: the last settlement week, the last full month, six months to date. */
export function ownerRanges(today: string): Record<string, { from: string; to: string; label: string }> {
  const t = day(today);
  const monday = addDays(t, -((t.getUTCDay() + 6) % 7));
  const wkFrom = addDays(monday, -7), wkTo = addDays(monday, -1);
  const moFrom = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
  const moTo = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0));
  const sixFrom = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 5, 1));
  return {
    wk: { from: iso(wkFrom), to: iso(wkTo), label: rangeLabel(iso(wkFrom), iso(wkTo)) },
    mo: { from: iso(moFrom), to: iso(moTo), label: MONTH[moFrom.getUTCMonth()]! },
    six: { from: iso(sixFrom), to: today, label: rangeLabel(iso(sixFrom), today) },
  };
}

/** The owner's pay day after a settlement week ends: "Fri Nov 14". */
function payDay(weekEnd: string, payDayName: string): string {
  const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const target = Math.max(0, names.indexOf(payDayName));
  let d = addDays(day(weekEnd), 1);
  while (d.getUTCDay() !== target) d = addDays(d, 1);
  return short(d);
}

const fresh = (seen: string | null | undefined): [label: string, tone: string] => {
  if (!seen) return ["No position yet", "mu"];
  const minutes = Math.round((Date.now() - Date.parse(seen)) / 60000);
  if (minutes < 15) return [minutes <= 1 ? "Just now" : `${minutes} min ago`, "ok"];
  if (minutes < 120) return [`${minutes} min ago`, "warn"];
  const hours = Math.round(minutes / 60);
  return [hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`, "bad"];
};

export type OwnerRecordInput = {
  detail: Detail;
  activity?: Activity;
  fuel?: Fuel;
  maintenance?: Maintenance;
  documents: Doc[];
  live: Live[];
  fin: boolean;
  today: string;
  zone: string;
  carrier: string;
  tab: string;
  range: string;
  unit: string;
  loadFilter: number;
  canManage: boolean;
  go: {
    tab: (key: string) => void;
    range: (key: string) => void;
    unit: (id: string) => void;
    loads: (i: number) => void;
    truck: (u: { id: string; kind: string }) => void;
    driver: (id: string) => void;
    load: (id: string) => void;
    edit: () => void;
    portal: () => void;
    statements: () => void;
    setPermissions: (keys: string[]) => void;
    dialog: (which: "transfer" | "invite" | "upload") => void;
    schedule: () => void;
    teamRules: () => void;
    toggleDoc: (id: string, inPortal: boolean) => void;
    csv: (filename: string, header: string[], rows: (string | number | null | undefined)[][]) => void;
  };
};

/** Everything the owner record draws. Pure: the same records give the same screen. */
export function buildOwnerView(x: OwnerRecordInput): OwnerView {
  const o = x.detail;
  const units = o.units;
  const trucks = units.filter((u) => u.kind === "truck");
  const trailers = units.filter((u) => u.kind === "trailer");
  const tab = OTABS.some(([k]) => k === x.tab) ? x.tab : "ov";
  const ranges = ownerRanges(x.today);
  const range = ranges[x.range] ? x.range : "wk";
  const rl = ranges[range]!.label;
  const a = x.activity;
  const isBiz = o.entity_type === "business";
  const name = o.name;
  const ownerShort = shortName(o);
  const [el] = ENTITY[o.entity_type] ?? [""];
  const [cl, ck] = CATEGORY[o.category] ?? ["", "mu"];
  const [st, sk] = STATUS[o.status] ?? [o.status, "mu"];
  const pick = units.find((u) => u.unit_id === x.unit);
  const loadsActive = (a?.load_rows ?? []).filter((r) => LIVE_LOAD.includes(r.status)).length;
  const permN = o.portal_permissions.length;
  const contact = o.contacts.find((c) => c.is_primary) ?? o.contacts[0];
  const truckOf = (u: Unit) => () => x.go.truck({ id: u.unit_id, kind: u.kind });
  const agreementFor = (u: Unit) => o.agreements.find((g) => g.id === u.agreement_id);
  const unitById = new Map(units.map((u) => [u.unit_id, u] as const));
  const linkUnit = (id: string, number: string) => {
    const u = unitById.get(id);
    return u ? cell.id(number, truckOf(u)) : cell.text(number, "", "mono w5");
  };
  const sinceLabel = (d: string) => `${MON[day(d).getUTCMonth()]} ${day(d).getUTCFullYear()}`;
  const ownerSince = o.owner_since ? sinceLabel(o.owner_since) : "";
  const taxLine = x.fin ? (isBiz ? (o.ein_last4 ? `EIN ending ${o.ein_last4}` : "") : o.tax_id_last4 ? `Tax ID ending ${o.tax_id_last4}` : "") : "";
  const city = [o.city, o.state].filter(Boolean).join(", ");

  // ---------------------------------------------------------------- header and tabs
  const view = {
    rl,
    n: name,
    ini: ownerInitials(o),
    ek: isBiz ? "violet" : "info",
    el,
    ck,
    cl,
    st,
    sk,
    sub: [
      o.status === "onboarding" ? `Onboarding since ${formatDate(o.created_at.slice(0, 10))}` : o.status === "ended" && o.ended_on ? `Owner ${ownerSince} – ${sinceLabel(o.ended_on)}` : ownerSince ? `Owner since ${ownerSince}` : "",
      isBiz ? (contact ? `${contact.person.first_name} ${contact.person.last_name}${contact.title ? `, ${contact.title.toLowerCase()}` : ""}` : "") : o.dba ? `DBA ${o.dba}` : "",
      o.phone ?? "",
      taxLine,
      city,
    ].filter(Boolean).join(" · "),
    edit: x.go.edit,
    canRun: x.canManage && o.status === "active",
    openStmt: x.go.statements,
    hasStmt: x.fin && o.status !== "onboarding",
    portalPreview: x.go.portal,
    hasPortal: o.portal_enabled && o.status !== "onboarding",
    tabs: OTABS.map(([k, l]) => ({
      l,
      n: k === "eq" ? String(units.length) : k === "loads" ? (loadsActive ? String(loadsActive) : "") : k === "docs" ? (x.documents.length ? String(x.documents.length) : "") : k === "acc" ? `${permN}/12` : "",
      on: k === tab ? "on" : "",
      go: () => x.go.tab(k),
    })),
    t: { ov: tab === "ov", eq: tab === "eq", live: tab === "live", loads: tab === "loads", fuel: tab === "fuel", stmt: tab === "stmt", mt: tab === "mt", docs: tab === "docs", acc: tab === "acc" },
    ranges: (["wk", "mo", "six"] as const).map((k) => ({ l: ranges[k]!.label, on: k === range ? "on" : "", go: () => x.go.range(k) })),
    units: [{ l: "All units", on: pick ? "" : "on", go: () => x.go.unit("") }].concat(units.map((u) => ({ l: u.unit_number, on: u.unit_id === pick?.unit_id ? "on" : "", go: () => x.go.unit(u.unit_id) }))),
    filt: `${pick ? pick.unit_number : [plural(trucks.length, "truck"), trailers.length ? plural(trailers.length, "trailer") : ""].filter(Boolean).join(" and ")} · ${rl}`,
    fin: x.fin,
    noFin: !x.fin,
  } satisfies Partial<OwnerView>;

  // ---------------------------------------------------------------- banner, lifecycle
  const missing = o.checklist.filter((c) => !c.done);
  const blockedUnits = units.filter((u) => !u.dispatchable);
  const escrowDue = o.ended_on ? addDays(day(o.ended_on), 45) : null;
  const banner =
    o.status === "onboarding"
      ? {
          k: "info",
          t: blockedUnits.length ? `${blockedUnits.map((u) => u.unit_number).join(", ")} can’t be dispatched yet` : "Onboarding",
          d: missing.length ? `Waiting on: ${missing.map((m) => m.label.toLowerCase().replace("w-9", "W-9").replace("ach ", "ACH ")).join(", ")}.` : "Everything is on file. Set the owner to Active to dispatch their units.",
          b: "Open checklist",
        }
      : o.status === "ended" && escrowDue
        ? { k: "warn", t: `Final accounting due ${short(escrowDue)}`, d: `Lease ended ${formatDate(o.ended_on)}. Escrow of ${fm2(o.escrow_balance)} must be returned with a final accounting within 45 days of the end of the lease.`, b: "Run final accounting" }
        : o.status === "suspended"
          ? { k: "warn", t: "Suspended", d: "Units owned by a suspended owner can’t be dispatched until the owner is active again.", b: "Edit owner" }
          : o.employee_role
            ? { k: "info", t: `${o.person?.first_name ?? ownerShort} also works at ${x.carrier}`, d: `Their owner portal sign-in is separate from their staff sign-in, and their own trucks’ statements are approved by someone else.`, b: "View rule" }
            : null;

  const act5 = o.status === "active";
  const onb = o.status === "onboarding";
  const endc = o.status === "ended";
  const rev = n(a?.revenue);
  const carrier = n(a?.carrier_share);
  const gross = n(a?.owner_gross);
  const costs = n(a?.owner_costs);
  const net = n(a?.net);
  const drvRun = n(a?.costs?.driver_pay);
  const pct = rev ? Math.round((carrier / rev) * 100) : 0;
  const trailerRent = n(a?.rental_gross);
  const nextPay = payDay(ranges.wk!.to, o.pay_day);

  let cards: OwnerView["cards"] = x.fin
    ? [
        { label: "Equipment", value: String(trucks.length), suffix: trucks.length === 1 ? " truck" : " trucks", sub: `${trailers.length ? `${plural(trailers.length, "trailer")} · ` : ""}${a?.trucks_on_loads ?? 0} on loads now`, k: "brand", sk: "mu" },
        { label: `Loads · ${rl}`, value: formatNumber(a?.loads ?? 0), suffix: "", sub: `${formatNumber(a?.miles ?? 0)} mi · ${a?.active_loads ?? 0} active now`, k: "info", sk: "mu" },
        { label: "Load revenue", value: fm(rev), suffix: "", sub: "What customers paid", k: "v1", sk: "mu" },
        { label: `${x.carrier}’s share`, value: fm(carrier), suffix: "", sub: `${pct}% of load revenue`, k: "mu", sk: "mu" },
        { label: "Owner’s costs", value: fm(costs), suffix: "", sub: drvRun ? `Includes ${fm(drvRun)} driver pay` : "Fuel, insurance, repairs", k: "warn", sk: "mu" },
        { label: "Net to owner", value: fm(net), suffix: "", sub: range === "wk" ? `Statement pays ${nextPay}` : "Before adjustments on the statements", k: "ok", sk: "ok" },
      ]
    : [
        { label: "Trucks", value: String(trucks.length), suffix: "", sub: `${a?.trucks_on_loads ?? 0} on loads now`, k: "brand", sk: "mu" },
        { label: "Trailers", value: String(trailers.length), suffix: "", sub: trailers.length ? `In ${x.carrier} service` : "None owned", k: "violet", sk: "mu" },
        { label: "Active loads", value: String(a?.active_loads ?? 0), suffix: "", sub: "Right now", k: "info", sk: "mu" },
        { label: `Loads · ${rl}`, value: formatNumber(a?.loads ?? 0), suffix: "", sub: "On the owner’s trucks", k: "ok", sk: "mu" },
        { label: `Miles · ${rl}`, value: formatNumber(a?.miles ?? 0), suffix: " mi", sub: "All units", k: "teal", sk: "mu" },
        { label: "Next service", value: x.maintenance?.upcoming[0]?.unit_number ?? "—", suffix: "", sub: x.maintenance?.upcoming[0] ? `${x.maintenance.upcoming[0].label} · ${formatDate(x.maintenance.upcoming[0].due_on)}` : "Nothing due in 60 days", k: "warn", sk: "mu" },
      ];
  let chk: OwnerView["chk"];
  if (onb) {
    const done = o.checklist.filter((c) => c.done).length;
    const items = o.checklist.map((c) => ({ t: c.label, d: c.done ? "On file" : "Missing", k: c.done ? "ok" : "warn" }));
    const ownDriver = units.find((u) => u.who_drives === "owner");
    if (ownDriver?.driver) items.push({ t: `${ownDriver.driver.name}’s driver file`, d: "Same person as this owner", k: ownDriver.driver.status === "active" ? "ok" : "warn" });
    chk = { sub: blockedUnits.length ? `${blockedUnits.map((u) => u.unit_number).join(", ")} ${blockedUnits.length === 1 ? "stays" : "stay"} out of dispatch until every line is green` : "Every unit is clear for dispatch", done: `${done} of ${o.checklist.length} done`, pct: `${((done / Math.max(1, o.checklist.length)) * 100).toFixed(1)}%`, items };
    const lease = o.checklist.find((c) => c.key === "lease");
    const insurance = o.checklist.find((c) => c.key === "insurance");
    cards = [
      { label: "Equipment", value: String(trucks.length), suffix: trucks.length === 1 ? " truck" : " trucks", sub: blockedUnits.length ? `${blockedUnits.map((u) => u.unit_number).join(", ")} · not in service yet` : "Ready", k: "brand", sk: "mu" },
      { label: "Checklist", value: String(done), suffix: ` of ${o.checklist.length}`, sub: missing.length ? `${missing.length} still missing` : "All on file", k: missing.length ? "warn" : "ok", sk: missing.length ? "warn" : "ok" },
      { label: "Lease", value: lease?.done ? "Signed" : "Not signed", suffix: "", sub: lease?.done ? "On file" : "Needed before the first load", k: lease?.done ? "ok" : "warn", sk: "mu" },
      { label: "Insurance", value: insurance?.done ? "On file" : "Missing", suffix: "", sub: "Physical damage and bobtail", k: insurance?.done ? "ok" : "bad", sk: "mu" },
      { label: "Driver file", value: ownDriver?.driver ? "Linked" : "—", suffix: "", sub: ownDriver?.driver ? "Same person" : "Nobody drives yet", k: "info", sk: "mu" },
      { label: "Portal", value: o.portal_enabled ? (o.portal_users_list.some((u) => u.signed_in) ? "Active" : o.portal_users_list.length ? "Invited" : "On") : "Off", suffix: "", sub: o.portal_users_list.length ? plural(o.portal_users_list.length, "user") : "No users yet", k: "mu", sk: "mu" },
    ];
  }
  let fa: OwnerView["fa"];
  if (endc) {
    const returned = o.past_units.filter((u) => u.effective_to);
    fa = {
      kv: [
        ["Lease ended", formatDate(o.ended_on)],
        ["Units returned", returned.length ? `${returned.map((u) => u.unit_number).join(" and ")}` : "None on file"],
        ["Open chargebacks", "None"],
        ["Escrow to return", fm2(o.escrow_balance)],
        ["Due", escrowDue ? `${formatDate(iso(escrowDue))} · 45 days after the lease ended` : "—"],
      ].map(([k, v]) => ({ k: k!, v: v! })),
      steps: [
        ["Units returned and inspected", units.length ? `${units.length} still assigned` : "Done", units.length ? "warn" : "ok"],
        ["Final weekly settlement paid", "From the statements", "mu"],
        ["Escrow refund and final accounting", escrowDue ? `Due ${formatDate(iso(escrowDue))}` : "—", "warn"],
        [`1099-NEC for ${o.ended_on ? day(o.ended_on).getUTCFullYear() : ""}`, `By Jan 31, ${o.ended_on ? day(o.ended_on).getUTCFullYear() + 1 : ""}`, "mu"],
      ].map(([t, d, k]) => ({ t: t!, d: d!, k: k! })),
    };
    cards = [
      { label: "Equipment", value: String(trucks.length), suffix: trucks.length === 1 ? " truck" : " trucks", sub: returned.length ? `${plural(returned.length, "unit")} returned` : "None", k: "mu", sk: "mu" },
      { label: "Escrow to return", value: fm(o.escrow_balance), suffix: "", sub: escrowDue ? `Due ${short(escrowDue)}` : "", k: "warn", sk: "warn" },
      { label: "Lease ended", value: o.ended_on ? short(day(o.ended_on)) : "—", suffix: "", sub: o.end_reason ?? "", k: "mu", sk: "mu" },
      { label: "Portal", value: o.portal_enabled ? "Read-only" : "Off", suffix: "", sub: "Until the 1099s are out", k: "mu", sk: "mu" },
      { label: "Owner since", value: ownerSince || "—", suffix: "", sub: "", k: "teal", sk: "mu" },
      { label: "Units on file", value: String(o.past_units.length + units.length), suffix: "", sub: "Including returned units", k: "info", sk: "mu" },
    ];
  }

  // ---------------------------------------------------------------- where the money went
  const base = rev + trailerRent;
  const companyDrivers = units.filter((u) => u.driver && u.driver.employer === "carrier").length;
  const mm = {
    title: `Where the money went · ${rl}${pick ? ` · ${pick.unit_number}` : ""}`,
    steps: [
      { l: "Load revenue", s: `${formatNumber(a?.loads ?? 0)} loads · paid by customers`, v: fm(rev), k: "v1" },
      { l: `${x.carrier}’s share`, s: `${pct}% kept under the agreements`, v: `−${fm(carrier)}`, k: "mu" },
      ...(trailerRent ? [{ l: "Trailer rental", s: "By the trailer week", v: `+${fm(trailerRent)}`, k: "v1" }] : []),
      { l: "Owner gross", s: "The owner’s share", v: fm(gross), k: "v1" },
      { l: "Owner’s costs", s: "Deducted on the settlement", v: `−${fm(costs)}`, k: "v2" },
      { l: "Net settlement", s: `Paid to ${ownerShort}`, v: fm(net), k: "v3" },
    ],
    bar: base > 0 ? [
      { k: "mu", w: `${((carrier / base) * 100).toFixed(2)}%`, l: `${x.carrier} · ${Math.round((carrier / base) * 100)}%` },
      { k: "v2", w: `${((Math.max(0, costs) / base) * 100).toFixed(2)}%`, l: `Owner’s costs · ${Math.round((costs / base) * 100)}%` },
      { k: "v3", w: `${((Math.max(0, net) / base) * 100).toFixed(2)}%`, l: `Owner net · ${Math.round((net / base) * 100)}%` },
    ] : [],
    outside: [
      companyDrivers ? { t: `Driver pay ${x.carrier} paid its own drivers on these trucks`, v: "On driver statements", s: "Company drivers are on driver statements, never on the owner’s" } : null,
      trucks.some((u) => agreementFor(u)?.fuel_paid_by === "carrier") ? { t: `Fuel ${x.carrier} bought for ${trucks.filter((u) => agreementFor(u)?.fuel_paid_by === "carrier").map((u) => u.unit_number).join(", ")}`, v: "Not on it", s: `${x.carrier} pays fuel under ${trucks.length === 1 ? "this unit’s" : "those units’"} agreement` } : null,
      units.some((u) => u.driver?.pay_by === "owner") ? { t: "Pay for drivers the owner hires and pays", v: "Not in FlyFleet", s: `${ownerShort} pays them directly` } : null,
    ].filter((v): v is { t: string; v: string; s: string } => v !== null),
    hasOut: false,
  };
  mm.hasOut = mm.outside.length > 0;

  // ---------------------------------------------------------------- charts
  const months = a?.months ?? [];
  const monthLabels = months.map((m, i) => (i === months.length - 1 ? `${MON[day(m.month).getUTCMonth()]} 1–${day(x.today).getUTCDate()}` : MON[day(m.month).getUTCMonth()]!));
  const truckNumbers = Array.from(new Set(months.flatMap((m) => Object.keys(m.by_unit)))).sort().slice(0, 6);
  const ch1 = colStack(truckNumbers.map((u, j) => ({ n: u, vals: months.map((m) => n(m.by_unit[u])), k: VK[j] })), monthLabels);
  const line = multiLine(
    [
      { n: "Load revenue", vals: months.map((m) => n(m.revenue)), k: "v1" },
      { n: "Owner gross", vals: months.map((m) => n(m.owner_gross)), k: "v4" },
      { n: "Net to owner", vals: months.map((m) => n(m.net)), k: "v3" },
    ],
    monthLabels.length ? monthLabels : [""],
  );
  const ch2 = { ...line, aria: `Load revenue, owner gross and net to owner by month${monthLabels.length ? `, ${monthLabels[0]} to ${monthLabels[monthLabels.length - 1]}` : ""}`, p: [...line.paths.map((p) => p.d), "", "", ""] };
  const truckFigures = (a?.by_unit ?? []).filter((u) => u.kind === "truck" && (!pick || u.unit_id === pick.unit_id));
  const ch3 = hbars(truckFigures.map((u, j) => ({ n: u.unit_number, v: u.miles, s: u.driver_name ?? "", k: VK[j % 6] })).sort((p, q) => q.v - p.v), (v) => `${formatNumber(v)} mi`);
  const pmMax = Math.max(0.01, ...truckFigures.map((u) => (u.miles ? n(u.revenue) / u.miles : 0)));
  const ch4 = truckFigures.filter((u) => u.miles).map((u) => {
    const seg = (v: number, k: string, t: string) => ({ k, w: `${((Math.max(0, v) / u.miles / pmMax) * 72).toFixed(2)}%`, t: `${t} $${(v / u.miles).toFixed(2)} a mile` });
    return { n: u.unit_number, v: `$${(n(u.revenue) / u.miles).toFixed(2)}`, segs: [seg(n(u.carrier_share), "mu", x.carrier), seg(n(u.owner_costs), "v2", "Owner’s costs"), seg(n(u.owner_net), "v3", "Owner net")] };
  });

  // ---------------------------------------------------------------- people and who drives what
  const roleTone = (l: string) => (/portal admin/i.test(l) ? "info" : /invited/i.test(l) ? "warn" : /owner/i.test(l) ? "violet" : /driver/i.test(l) ? "brand" : "teal");
  const people: OwnerView["people"] = [];
  if (isBiz) {
    people.push({ n: name, ini: ownerInitials(o), d: [plural(trucks.length, "truck"), trailers.length ? plural(trailers.length, "trailer") : "", x.fin && o.ein_last4 ? `EIN ending ${o.ein_last4}` : ""].filter(Boolean).join(" · "), note: "The owner on record is the business. People below act for it.", roles: [{ l: "Owner · business", k: "violet" }] });
    for (const c of o.contacts) {
      const roles = [c.title ?? "Contact", ...(c.portal ? [c.portal === "active" ? "Portal admin" : "Portal invited"] : [])];
      people.push({ n: `${c.person.first_name} ${c.person.last_name}`, ini: initials(`${c.person.first_name} ${c.person.last_name}`), d: c.signs ? "Signs the lease and approves settlement disputes" : (c.note ?? ""), note: "", roles: roles.map((l) => ({ l, k: roleTone(l) })) });
    }
  } else if (o.person) {
    const drives = units.find((u) => u.who_drives === "owner");
    const roles = ["Owner", ...(drives ? ["Driver"] : []), ...(o.employee_role ? ["Employee"] : []), ...(o.portal_users_list.length ? [o.portal_users_list.some((u) => u.signed_in) ? "Portal user" : "Portal invited"] : [])];
    people.push({ n: name, ini: ownerInitials(o), d: drives ? `Drives ${drives.unit_number} · one record for driving and owning` : "Owns equipment; others drive it", note: "", roles: roles.map((l) => ({ l, k: roleTone(l) })) });
  }
  const who: Row[] = trucks.map((u) => {
    const [employedBy, paid] = employment(u.driver, ownerShort, x.carrier);
    return {
      key: u.unit_id,
      open: truckOf(u),
      cells: [
        cell.id(u.unit_number, truckOf(u)),
        u.driver ? cell.name(u.driver.name, () => x.go.driver(u.driver!.id)) : cell.maybe(null),
        u.co_driver ? cell.text(u.co_driver.name) : cell.maybe(null),
        cell.text(employedBy || "—", "", employedBy ? "t2" : "mu"),
        cell.text(paid || "—", "", paid ? "t2" : "mu"),
        cell.text(agreementKind(u.agreement_kind), "", "t2"),
      ],
    };
  });

  // ---------------------------------------------------------------- equipment
  const liveBy = new Map(x.live.map((l) => [l.unit_id, l] as const));
  const nextService = (u: Unit) => {
    const item = x.maintenance?.upcoming.find((m) => m.unit_number === u.unit_number);
    return item ? `${item.label} · ${formatDate(item.due_on)}` : "";
  };
  const eqRows: Row[] = units.map((u) => {
    const where = liveBy.get(u.unit_id);
    const [fl, fk] = fresh(where?.seen_at);
    const terms = agreementFor(u);
    const [al, as] = terms ? agreementLine(terms) : ["—", ""];
    return {
      key: u.unit_id,
      open: truckOf(u),
      cells: [
        cell.id(u.unit_number, truckOf(u)),
        cell.text(u.kind === "truck" ? "Truck" : (u.trailer_type ?? "Trailer").replace("_", " ").replace(/^./, (c) => c.toUpperCase()), "", "t2"),
        cell.maybe(u.year ? String(u.year) : null, "num"),
        cell.maybe(u.make),
        cell.maybe(u.model),
        cell.maybe(u.vin, "mono fs12 t2"),
        cell.maybe(u.plate, "mono fs12"),
        cell.maybe(u.plate_state, "mono fs12 t2"),
        cell.maybe(u.registration_expiry ? formatDate(u.registration_expiry) : null, "mono fs12 t2"),
        cell.num(`${Number(u.share_pct)}%`),
        cell.text(formatDate(u.effective_from), "", "t2"),
        cell.text(al, as, "", "t3"),
        u.driver ? cell.text(u.driver.name) : cell.maybe(u.kind === "trailer" ? `Any ${x.carrier} truck` : null),
        u.co_driver ? cell.text(u.co_driver.name) : cell.maybe(null),
        u.kind === "truck" && u.driver ? cell.text(employment(u.driver, ownerShort, x.carrier)[0], "", "t2") : cell.maybe(null),
        cell.badge(u.dispatchable ? (u.on_load ? "On load" : "Available") : u.status === "active" ? "Blocked" : u.status.replace(/_/g, " "), u.dispatchable ? (u.on_load ? "transit" : "ok") : "warn"),
        where?.place ? cell.text(where.place, fl, "", `sk-${fk}`) : cell.maybe(null),
        cell.maybe(nextService(u), "t2"),
        u.odometer ? cell.num(formatNumber(u.odometer)) : cell.maybe(null),
      ],
    };
  });

  // ---------------------------------------------------------------- live
  const live = x.live.map((l) => {
    const [fl, fk] = fresh(l.seen_at);
    const u = unitById.get(l.unit_id);
    return {
      u: l.unit_number,
      k: "brand",
      d: l.driver_name ?? (u?.driver?.name ?? "No driver seated"),
      s: l.load_number ? "On load" : u?.dispatchable ? "Available" : "Blocked",
      sk: l.load_number ? "transit" : u?.dispatchable ? "ok" : "warn",
      loc: l.place ?? "No position yet",
      fresh: fl,
      fk,
      lane: l.load_number ? `${l.load_number}${l.lane ? ` · ${l.lane}` : ""}` : "No load now",
      go: u ? truckOf(u) : () => undefined,
    };
  });

  // ---------------------------------------------------------------- loads
  const lrows = a?.load_rows ?? [];
  const LF: [string, (r: (typeof lrows)[number]) => boolean][] = [["Active", (r) => LIVE_LOAD.includes(r.status)], ["Completed", (r) => DONE_LOAD.includes(r.status)], ["Cancelled", (r) => r.status === "cancelled"], ["All", () => true]];
  const li = Math.min(Math.max(x.loadFilter, 0), 3);
  const loadRows: Row[] = lrows.filter(LF[li]![1]).map((r) => ({
    key: r.load_id,
    open: () => x.go.load(r.load_id),
    cells: [
      cell.id(r.load_number, () => x.go.load(r.load_id)),
      linkUnit(r.unit_id, r.unit_number),
      cell.maybe(r.driver_name),
      cell.maybe(r.customer_name, "t2"),
      cell.maybe(r.origin),
      cell.maybe(r.destination),
      cell.text(r.pickup_at ? formatDateTime(r.pickup_at, x.zone) : "—", "", "num t2"),
      cell.text(r.delivered_at ? formatDateTime(r.delivered_at, x.zone) : "—", "", "num t2"),
      cell.badge(r.status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), DONE_LOAD.includes(r.status) ? "completed" : r.status === "cancelled" ? "mu" : "transit"),
      r.miles ? cell.num(formatNumber(r.miles)) : cell.maybe(null),
      ...(x.fin
        ? [
            cell.money(fm2(r.line_haul)),
            cell.money(n(r.fuel_surcharge) ? fm2(r.fuel_surcharge) : "—", "", n(r.fuel_surcharge) ? "" : "mu"),
            cell.money(n(r.accessorials) ? fm2(r.accessorials) : "—", "", n(r.accessorials) ? "" : "mu"),
            cell.money(fm2(r.revenue), "", "w6"),
            cell.money(r.status === "cancelled" ? "—" : fm2(r.owner_gross), r.agreement_kind === "rental" ? "By the mile" : "", r.status === "cancelled" ? "mu" : ""),
          ]
        : []),
    ],
  }));
  const weeks = a?.on_time ?? [];
  const ot = colStack(
    [
      { n: "On time", vals: weeks.map((w) => w.on_time), k: "v1" },
      { n: "Late", vals: weeks.map((w) => w.late), k: "v2" },
    ],
    weeks.map((w, i) => (i === weeks.length - 1 ? `${short(day(w.week_start))} · to date` : short(day(w.week_start)))),
    (v) => String(Math.round(v)),
  );
  const onTime = weeks.reduce((s, w) => s + w.on_time, 0);
  const late = weeks.reduce((s, w) => s + w.late, 0);
  const otSub = onTime + late ? `${Math.round((onTime / (onTime + late)) * 1000) / 10}% on time over ${weeks.length} weeks · ${late} late of ${onTime + late} loads` : "No delivered loads with an appointment in the last 8 weeks";

  // ---------------------------------------------------------------- fuel and expenses
  const f = x.fuel;
  const fuelRows = (f?.fuel ?? []).filter((r) => !pick || r.unit_number === pick.unit_number);
  const gal = fuelRows.reduce((s, r) => s + n(r.gallons), 0);
  const spend = fuelRows.reduce((s, r) => s + n(r.amount), 0);
  const fsum = [
    { l: `Gallons · ${rl}`, v: formatNumber(Math.round(gal)) },
    { l: "Fuel spend", v: fm2(spend) },
    { l: "Average price", v: gal ? `$${(spend / gal).toFixed(3)} a gal` : "—" },
    { l: "Paid by the owner", v: fm2(fuelRows.filter((r) => r.payer === "owner").reduce((s, r) => s + n(r.amount), 0)) },
    { l: `Paid by ${x.carrier}`, v: fm2(fuelRows.filter((r) => r.payer === "carrier").reduce((s, r) => s + n(r.amount), 0)) },
  ];
  const payer = (p: string) => {
    const [l, k] = PAYER(p, x.carrier);
    return cell.tags([{ v: l, k }]);
  };
  const ft = fuelRows.map((r) => ({
    key: r.id,
    open: () => undefined,
    cells: [
      cell.text(formatDate(r.incurred_on), "", "num t2"),
      cell.maybe(r.unit_number, "mono w5"),
      cell.maybe(r.driver_name),
      cell.maybe(r.vendor),
      cell.maybe(null),
      cell.maybe(r.jurisdiction, "mono fs12 t2"),
      cell.num(n(r.gallons).toFixed(1)),
      cell.money(n(r.gallons) ? `$${(n(r.amount) / n(r.gallons)).toFixed(3)}` : "—", "", "t2"),
      cell.money(fm2(r.amount)),
      cell.maybe(r.paid_with?.replace(/_/g, " ") ?? null, "fs12 t2"),
      payer(r.payer),
      cell.text(r.payer === "owner" ? "Deducted" : "Not on it", "", r.payer === "owner" ? "" : "mu"),
    ],
  }));
  const xt = [
    ...(f?.other ?? []).filter((r) => !pick || r.unit_number === pick.unit_number).map((r) => ({
      key: r.id,
      open: () => undefined,
      cells: [
        cell.text(formatDate(r.incurred_on), "", "num t2"),
        cell.maybe(r.unit_number, "mono w5"),
        cell.text(r.category.replace(/^./, (c) => c.toUpperCase())),
        cell.maybe(r.vendor, "t2"),
        cell.money(fm2(r.amount)),
        payer(r.payer),
        cell.text(r.payer === "owner" ? "Deducted" : "Not on it", "", r.payer === "owner" ? "t2" : "mu"),
        cell.maybe(null),
      ],
    })),
    ...(f?.chargebacks ?? []).filter((c) => !pick || c.unit_number === pick.unit_number).map((c, i) => ({
      key: `cb${i}`,
      open: () => undefined,
      cells: [cell.text("Weekly", "", "num t2"), cell.maybe(c.unit_number, "mono w5"), cell.text(c.label), cell.text(`Weekly share under the ${agreementKind(c.agreement_kind).toLowerCase()}`, "", "t2"), cell.money(fm2(c.weekly)), payer("owner"), cell.text("Deducted", "", "t2"), cell.maybe(null)],
    })),
  ];
  const fch = colStack(
    [
      { n: "Paid by the owner", vals: (f?.months ?? []).map((m) => n(m.owner)), k: "v1" },
      { n: `Paid by ${x.carrier}`, vals: (f?.months ?? []).map((m) => n(m.carrier)), k: "mu" },
    ].filter((s) => s.vals.some((v) => v > 0)),
    (f?.months ?? []).map((m, i, all) => (i === all.length - 1 ? `${MON[day(m.month).getUTCMonth()]} 1–${day(x.today).getUTCDate()}` : MON[day(m.month).getUTCMonth()]!)),
  );

  // ---------------------------------------------------------------- statements
  const per = (a?.by_unit ?? []).filter((u) => !pick || u.unit_id === pick.unit_id);
  const stt: Row[] = per.map((u) => {
    const unit = unitById.get(u.unit_id);
    const terms = unit ? agreementFor(unit) : undefined;
    const [al, as] = terms ? agreementLine(terms) : ["—", ""];
    return {
      key: u.unit_id,
      open: x.go.statements,
      cells: [
        linkUnit(u.unit_id, u.unit_number),
        cell.text(al, as, "", "t3"),
        unit?.driver ? cell.text(unit.co_driver ? `${unit.driver.name} & ${unit.co_driver.name.split(" ")[0]}` : unit.driver.name, employment(unit.driver, ownerShort, x.carrier)[0], "", "t3") : cell.maybe(null),
        cell.num(u.loads ? String(u.loads) : "—"),
        cell.num(u.miles ? formatNumber(u.miles) : "—"),
        cell.money(n(u.revenue) ? fm2(u.revenue) : "—", "", n(u.revenue) ? "" : "mu"),
        cell.money(n(u.carrier_share) ? fm2(u.carrier_share) : "—", "", "t2"),
        cell.money(fm2(u.owner_gross)),
        cell.money(n(u.fuel) ? fm2(-n(u.fuel)) : "—", "", n(u.fuel) ? "t2" : "mu"),
        cell.money(n(u.driver_pay) ? fm2(-n(u.driver_pay)) : "—", "", n(u.driver_pay) ? "t2" : "mu"),
        cell.money(n(u.other_costs) > 0.004 ? fm2(-n(u.other_costs)) : "—", "", n(u.other_costs) > 0.004 ? "t2" : "mu"),
        cell.money(fm2(u.owner_net), "", "w6"),
      ],
    };
  });
  if (per.length) {
    const sum = (k: "revenue" | "carrier_share" | "owner_gross" | "fuel" | "driver_pay" | "owner_costs" | "owner_net") => per.reduce((s2, u) => s2 + n(u[k]), 0);
    stt.push({
      cls: "tot",
      open: () => undefined,
      cells: [cell.text("Total", "", "w6"), cell.maybe(null), cell.maybe(null), cell.num(String(per.reduce((s2, u) => s2 + u.loads, 0))), cell.num(formatNumber(per.reduce((s2, u) => s2 + u.miles, 0))), cell.money(fm2(sum("revenue"))), cell.money(fm2(sum("carrier_share"))), cell.money(fm2(sum("owner_gross"))), cell.money(fm2(-sum("fuel"))), cell.money(sum("driver_pay") ? fm2(-sum("driver_pay")) : "—"), cell.money(fm2(-(sum("owner_costs") - sum("fuel") - sum("driver_pay")))), cell.money(fm2(sum("owner_net")), "", "w6")],
    });
  }
  const escrowBalance = n(o.escrow_balance);
  const esc = escrowBalance || n(o.escrow_target)
    ? { v: fm(escrowBalance), d: o.status === "ended" ? "Refund due with the final accounting" : n(o.escrow_target) && escrowBalance >= n(o.escrow_target) ? `Fully funded · target ${fm(o.escrow_target)}` : `Building to ${fm(o.escrow_target)} · ${fm(o.escrow_weekly)} a week per truck`, i: "Interest paid quarterly" }
    : { v: "None", d: "No escrow on this owner", i: "" };
  const wk = [
    { l: `Load revenue · ${rl}`, v: fm2(rev), s: "Customers paid", k: "v1" },
    { l: `${x.carrier}’s share`, v: fm2(-carrier), s: "Kept under the agreements", k: "mu" },
    { l: "Owner gross", v: fm2(gross), s: "Before costs", k: "v1" },
    { l: "Owner’s costs", v: fm2(-costs), s: drvRun ? `Includes ${fm2(drvRun)} driver pay` : "Fuel, insurance, repairs", k: "v2" },
    { l: "Net settlement", v: fm2(net), s: range === "wk" ? `Pays ${nextPay}` : "Across the range", k: "v3" },
    { l: "Escrow held", v: esc.v, s: esc.d, k: "v4" },
  ];
  const stSub = onb ? "No statements until the lease is signed" : `Week of ${ranges.wk!.label} · pays ${nextPay} · ${drvRun ? `driver pay ${x.carrier} ran for ${ownerShort} is charged back here` : `one settlement for every unit ${ownerShort} owns`}`;

  // ---------------------------------------------------------------- maintenance and documents
  const mt: Row[] = (x.maintenance?.work_orders ?? []).filter((w) => !pick || w.unit_number === pick.unit_number).map((w) => ({
    key: w.id,
    open: () => undefined,
    cells: [
      cell.text(w.number, "", "mono fs12 w5"),
      cell.maybe(w.unit_number, "mono w5"),
      cell.text(formatDate(w.completed_on ?? w.opened_on), "", "num t2"),
      cell.text(w.title),
      cell.maybe(w.vendor, "t2"),
      cell.badge(w.status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), w.status === "completed" ? "completed" : w.status === "cancelled" ? "mu" : "info"),
      cell.money(n(w.total_cost) ? fm2(w.total_cost) : "—", "", n(w.total_cost) ? "" : "mu"),
      cell.tags([{ v: w.payer === "owner" ? "Owner, under the lease" : `${x.carrier}, under the agreement`, k: w.payer === "owner" ? "brand" : "mu" }]),
      cell.text(w.payer === "owner" && n(w.total_cost) && w.status === "completed" ? "Deducted" : "—", "", w.payer === "owner" && n(w.total_cost) ? "t2" : "mu"),
    ],
  }));
  const upcoming = (x.maintenance?.upcoming ?? []).filter((u) => !pick || u.unit_number === pick.unit_number).map((u) => ({ u: u.unit_number, n: `${u.label} · ${formatDate(u.due_on)}`, s: u.days < 0 ? `${-u.days} days overdue` : u.days === 0 ? "Due today" : `In ${u.days} days`, k: u.days <= 14 ? "warn" : "mu" }));
  const dt: Row[] = x.documents.filter((d) => !pick || d.attached_to === pick.unit_number || d.attached_kind === "owner").map((d) => ({
    key: d.id,
    open: () => viewDocument(d.id),
    cells: [
      cell.text(d.filename, "", "w5"),
      cell.text(DOC_TYPES[d.type] ?? d.type, "", "t2"),
      cell.text(d.attached_kind === "owner" ? "All units" : d.attached_to, "", d.attached_kind === "owner" ? "t2" : "mono fs12"),
      cell.text(formatDate(d.uploaded_at.slice(0, 10)), "", "num t2"),
      cell.maybe(d.expires_on ? formatDate(d.expires_on) : null, d.expires_on && day(d.expires_on).getTime() - day(x.today).getTime() < 30 * DAY ? "sk-warn" : "t2"),
      cell.badge(d.review_status === "approved" ? "Reviewed" : d.review_status === "pending" ? "In review" : d.review_status === "rejected" ? "Rejected" : "On file", d.review_status === "approved" ? "ok" : d.review_status === "pending" ? "info" : d.review_status === "rejected" ? "bad" : "mu"),
      x.canManage ? cell.button(d.in_portal ? "Shown" : "Hidden", () => x.go.toggleDoc(d.id, !d.in_portal), d.in_portal ? "" : "ghost") : cell.text(d.in_portal ? "Shown" : "Hidden", "", d.in_portal ? "t2" : "mu"),
      cell.actions([["View", () => viewDocument(d.id)]]),
    ],
  }));

  // ---------------------------------------------------------------- access and permissions
  const perms = new Set(o.portal_permissions);
  const KEYS = Object.keys(PERMISSION_DETAIL);
  const presetLists: Record<string, string[]> = { full: KEYS, monitor: ["equipment", "locations", "loads", "completed", "maintenance", "performance"], bookkeeper: ["statements", "fuel", "expenses", "documents", "download"] };
  const labelOf: Record<string, string> = { equipment: "View owned equipment", locations: "View live truck locations", drivers: "View assigned drivers", loads: "View loads", completed: "View completed loads", fuel: "View fuel transactions", expenses: "View expenses", statements: "View financial statements", maintenance: "View maintenance records", documents: "View documents", download: "Download statements", performance: "View performance reports" };
  const toggle = (k: string) => () => x.go.setPermissions(perms.has(k) ? KEYS.filter((key) => perms.has(key) && key !== k) : KEYS.filter((key) => perms.has(key) || key === k));
  const acc = {
    portal: o.portal_enabled ? (o.portal_users_list.some((u) => u.signed_in) ? `Active · ${plural(o.portal_users_list.length, "user")}` : o.portal_users_list.length ? "Invited" : "On · no users yet") : "Off",
    pk: o.portal_enabled ? (o.portal_users_list.some((u) => u.signed_in) ? "ok" : "warn") : "mu",
    n: `${permN} of 12 on`,
    presets: [...PRESETS.map(([k, l]) => ({ l, on: o.portal_preset === k ? "on" : "", go: () => x.go.setPermissions(presetLists[k]!) })), { l: "Custom", on: o.portal_preset ? "" : "on", go: () => undefined }],
    perms: KEYS.map((k) => ({ k, l: labelOf[k]!, on: perms.has(k) ? "on" : "", chk: (perms.has(k) ? "true" : "false") as "true" | "false", go: toggle(k), d: PERMISSION_DETAIL[k]! })),
    users: o.portal_users_list.map((u) => ({ n: u.full_name, ini: initials(u.full_name), role: u.email, scope: o.portal_preset ? `${PRESETS.find(([k]) => k === o.portal_preset)?.[1]} preset` : "Custom permissions", last: u.signed_in ? "Has signed in" : `Invited ${formatDate(u.invited_at.slice(0, 10))} · not signed in yet`, k: u.signed_in ? "ok" : "warn" })),
    rules: [
      "Owner logins see only units this owner owns, today. A sold or transferred unit drops out of their portal the same day.",
      "Customer names and other loads’ rates are removed from everything they see.",
      "Every change here is in the audit log, and the API enforces it, not just the screen.",
    ],
  };

  const mailto = () => {
    const to = o.email ?? o.contacts[0]?.person.email ?? o.person?.email;
    if (to) window.location.href = `mailto:${to}`;
  };
  const actions = {
    message: mailto,
    banner: o.status === "onboarding" ? () => x.go.tab("ov") : o.status === "ended" ? x.go.statements : o.status === "suspended" ? x.go.edit : x.go.teamRules,
    finalAccounting: x.go.statements,
    transfer: () => x.go.dialog("transfer"),
    addEquipment: x.go.edit,
    exportLoads: () => x.go.csv(`${name} loads ${ranges[range]!.from} to ${ranges[range]!.to}.csv`, ["Load", "Truck", "Driver", "Customer", "Origin", "Destination", "Pickup", "Delivered", "Status", "Miles", ...(x.fin ? ["Line haul", "Fuel surcharge", "Accessorials", "Total", "Owner share"] : [])],
      lrows.filter(LF[li]![1]).map((r) => [r.load_number, r.unit_number, r.driver_name, r.customer_name, r.origin, r.destination, r.pickup_at, r.delivered_at, r.status, r.miles, ...(x.fin ? [r.line_haul, r.fuel_surcharge, r.accessorials, r.revenue, r.owner_gross] : [])])),
    exportYear: () => x.go.csv(`${name} by month.csv`, ["Month", "Load revenue", "Owner gross", "Net to owner"], months.map((m) => [m.month.slice(0, 7), m.revenue, m.owner_gross, m.net])),
    schedule: x.go.schedule,
    upload: () => x.go.dialog("upload"),
    invite: () => x.go.dialog("invite"),
  };

  return {
    ...view,
    actions,
    canManage: x.canManage,
    banner,
    cards,
    act5,
    onb,
    endc,
    showMoney: x.fin && act5,
    mm,
    ch1,
    ch2,
    ch3,
    ch4,
    people,
    hasWho: who.length > 0,
    who: { cols: "80px 150px 120px 190px 290px 220px", head: [heading("Truck"), heading("Driver"), heading("Co-driver"), heading("Employed by"), heading("How they’re paid"), heading("Agreement")], rows: who, fz: "fz1" },
    eq: {
      cols: "76px 72px 52px 112px 136px 172px 92px 52px 96px 88px 104px 220px 150px 120px 196px 120px 176px 196px 92px",
      fz: "fz1",
      head: [heading("Unit"), heading("Type"), heading("Year"), heading("Make"), heading("Model"), heading("VIN"), heading("Plate"), heading("State"), heading("Plate exp."), heading("Ownership", true), heading("Owned since"), heading("Agreement"), heading("Driver"), heading("Co-driver"), heading("Driver works for"), heading("Status"), heading("Location"), heading("Next service"), heading("Odometer", true)],
      rows: eqRows,
    },
    map: { water: "", states: "", minor: "", major: "", cities: [], shields: [], cx: "50%", cy: "50%", trucks: [] },
    live,
    liveN: String(live.length),
    liveSub: `${a?.trucks_on_loads ?? 0} of ${plural(trucks.length, "truck")} on loads · last reported place and how fresh it is`,
    lf: LF.map(([l, fn], i) => ({ l, n: String(lrows.filter(fn).length), on: i === li ? "on" : "", go: () => x.go.loads(i) })),
    lt: {
      cols: `88px 72px 170px 180px 130px 140px 140px 140px 120px 96px${x.fin ? " 104px 112px 104px 112px 120px" : ""}`,
      fz: "fz1",
      rows: loadRows,
      head: [heading("Load"), heading("Truck"), heading("Driver"), heading("Customer"), heading("Origin"), heading("Destination"), heading("Pickup"), heading("Delivery"), heading("Status"), heading("Loaded mi", true), ...(x.fin ? [heading("Line haul", true), heading("Fuel surcharge", true), heading("Accessorials", true), heading("Total", true), heading("Owner’s share", true)] : [])],
    },
    ot,
    otSub,
    fsum,
    ft: { cols: "96px 72px 150px 160px 110px 52px 80px 92px 104px 110px 120px 120px", fz: "fz1", head: [heading("Date"), heading("Truck"), heading("Driver"), heading("Truck stop"), heading("City"), heading("State"), heading("Gallons", true), heading("Price", true), heading("Amount", true), heading("Card"), heading("Paid by"), heading("On settlement")], rows: ft },
    xt: { cols: "96px 72px 250px 330px 104px 110px 150px 130px", fz: "fz1", head: [heading("Date"), heading("Truck"), heading("Expense"), heading("Detail"), heading("Amount", true), heading("Paid by"), heading("On settlement"), heading("Receipt")], rows: xt },
    fch,
    stt: { cols: "76px 230px 190px 60px 76px 112px 128px 112px 104px 120px 112px 120px", fz: "fz1", rows: stt, head: [heading("Unit"), heading("Agreement"), heading("Driver"), heading("Loads", true), heading("Miles", true), heading("Load revenue", true), heading(`${x.carrier}’s share`, true), heading("Owner gross", true), heading("Fuel", true), heading("Driver pay run", true), heading("Other costs", true), heading("Net", true)] },
    past: { cols: "150px 96px 112px 120px 112px 120px 96px 100px 72px", fz: "fz1", head: [heading("Week"), heading("Paid on"), heading("Load revenue", true), heading("Owner gross", true), heading("Costs", true), heading("Net paid", true), heading("Status"), heading("Escrow", true), heading("")], rows: [] },
    esc,
    wk,
    stSub,
    mt: { cols: "84px 76px 96px 250px 230px 112px 104px 200px 130px", fz: "fz1", head: [heading("Work order"), heading("Unit"), heading("Date"), heading("Work"), heading("Shop"), heading("Status"), heading("Cost", true), heading("Paid by"), heading("On settlement")], rows: mt },
    upcoming,
    dt: { cols: "300px 110px 92px 104px 120px 170px 100px 120px", fz: "fz1", head: [heading("Document"), heading("Type"), heading("Unit"), heading("Uploaded"), heading("Expires"), heading("Status"), heading("In portal"), heading("")], rows: dt },
    acc,
    fa,
    chk,
  };
}

/** Loads the owner's records for the record's current tab and range, and builds the view. */
export function useOwnerRecord(): { view: OwnerView | null; detail?: Detail; error: unknown; retry: () => void; dialog: string | null; closeDialog: () => void } {
  const { me, can, fin, state, set } = useConsole();
  const act = useAction();
  const [dialog, setDialog] = useState<string | null>(null);
  const org = me.organization;
  const id = typeof state.ownerId === "string" ? state.ownerId : "";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: org.timezone });
  const tab = typeof state.otab === "string" ? state.otab : "ov";
  const range = typeof state.orange === "string" ? state.orange : "wk";
  const unit = typeof state.otruck === "string" ? state.otruck : "";
  const loadFilter = typeof state.oload === "number" ? state.oload : 0;
  const r = ownerRanges(today)[range] ?? ownerRanges(today).wk!;
  const enabled = !!id;
  const detail = useQuery({ queryKey: [org.id, "owners", id], queryFn: () => unwrap(api.GET("/api/v1/owners/{owner_id}", { params: { path: { owner_id: id } } })), enabled });
  const activity = useQuery({ queryKey: [org.id, "owners", id, "activity", r.from, r.to, unit], queryFn: () => unwrap(api.GET("/api/v1/owners/{owner_id}/activity", { params: { path: { owner_id: id }, query: { date_from: r.from, date_to: r.to, unit_id: unit || undefined } } })), enabled, placeholderData: (previous) => previous });
  const fuel = useQuery({ queryKey: [org.id, "owners", id, "fuel", r.from, r.to], queryFn: () => unwrap(api.GET("/api/v1/owners/{owner_id}/fuel", { params: { path: { owner_id: id }, query: { date_from: r.from, date_to: r.to } } })), enabled: enabled && (tab === "fuel" || tab === "ov"), placeholderData: (previous) => previous });
  const maintenance = useQuery({ queryKey: [org.id, "owners", id, "maintenance"], queryFn: () => unwrap(api.GET("/api/v1/owners/{owner_id}/maintenance", { params: { path: { owner_id: id } } })), enabled });
  const documents = useQuery({ queryKey: [org.id, "owners", id, "documents"], queryFn: () => unwrap(api.GET("/api/v1/owners/{owner_id}/documents", { params: { path: { owner_id: id } } })), enabled });
  const live = useQuery({ queryKey: [org.id, "owners", id, "live"], queryFn: () => unwrap(api.GET("/api/v1/owners/{owner_id}/live", { params: { path: { owner_id: id } } })), enabled, refetchInterval: tab === "live" ? 60_000 : false });
  const d = detail.data;
  if (!d) return { view: null, error: detail.error, retry: () => void detail.refetch(), dialog: null, closeDialog: () => setDialog(null) };
  const view = buildOwnerView({
    detail: d,
    activity: activity.data,
    fuel: fuel.data,
    maintenance: maintenance.data,
    documents: documents.data ?? [],
    live: live.data ?? [],
    fin,
    today,
    zone: org.timezone,
    carrier: org.name,
    tab,
    range,
    unit,
    loadFilter,
    canManage: can("owners.manage"),
    go: {
      tab: (k) => set({ otab: k }),
      range: (k) => set({ orange: k }),
      unit: (u) => set({ otruck: u }),
      loads: (i) => set({ oload: i }),
      truck: (u) => set({ screen: "truck", unitId: u.id, unitKind: u.kind, drawer: null, overlay: "none", modal: "none" }),
      driver: (driverId) => set({ screen: "driver", driverId, drawer: null, overlay: "none", modal: "none" }),
      load: (loadId) => set({ screen: "loads", drawer: loadId, overlay: "none", modal: "none" }),
      edit: () => set({ screen: "ownerform", ownerForm: "edit", ownerId: id, overlay: "none", modal: "none" }),
      portal: () => set({ screen: "ownerportal", ownerId: id, overlay: "none", modal: "none" }),
      statements: () => set({ ...goTo("settlements"), ltab: 1 }),
      setPermissions: (keys) => void act(() => unwrap(api.PUT("/api/v1/owners/{owner_id}/portal-permissions", { params: { path: { owner_id: id } }, body: { permissions: keys } })), "Portal permissions saved · they apply on the owner’s next click"),
      dialog: (which) => setDialog(which),
      schedule: () => set(addOf("workorder")),
      teamRules: () => set(goTo("team")),
      toggleDoc: (docId, inPortal) => void act(() => unwrap(api.PATCH("/api/v1/documents/{document_id}", { params: { path: { document_id: docId } }, body: { in_portal: inPortal } })), inPortal ? "Shown in the owner’s portal" : "Hidden from the owner’s portal"),
      csv: downloadCsv,
    },
  });
  return { view, detail: d, error: null, retry: () => void detail.refetch(), dialog, closeDialog: () => setDialog(null) };
}
