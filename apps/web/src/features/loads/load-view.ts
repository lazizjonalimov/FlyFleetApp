import { loadLabel, loadTone, TRAILER_TYPES } from "@/features/fleet/labels";
import type { Schema } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format/dates";
import { formatMoney, toCents } from "@/lib/format/money";
import { formatNumber, humanize, place } from "@/lib/format/text";
import type { LoadDetail, LoadListItem, Stop } from "./load-data";

type Document = Schema<"DocumentOut">;
type Summary = Pick<LoadListItem, "status" | "risks" | "assignment" | "pickup_at">;

export const equipmentLabel = (type: string): string => TRAILER_TYPES[type] ?? humanize(type);
export const CHARGES: Record<string, string> = { detention: "Detention", layover: "Layover", lumper: "Lumper", fuel_surcharge: "Fuel surcharge", tarp: "Tarp", extra_stop: "Extra stop", tonu: "Truck ordered, not used", other: "Other" };

const RISKS: Record<string, [label: string, tone: string]> = { LATE_PICKUP: ["Late pickup", "bad"], LATE_DELIVERY: ["Late delivery", "bad"], UNASSIGNED_SOON: ["No driver yet", "warn"], MISSING_POD: ["Needs POD", "bad"] };

/** The first thing putting a load at risk, as the API reports it. */
export function riskOf(load: Summary): { label: string; tone: string; message: string } | null {
  const risk = load.risks[0];
  if (!risk) return null;
  const [label, tone] = RISKS[risk.code] ?? [humanize(risk.code.toLowerCase()), "warn"];
  return { label, tone, message: risk.message };
}

export type LoadAlert = { tone: string; title: string; text: string; button: string; act: "assign" | "release" | "ready" | "pod" | "" };

/** The one thing about a load that someone should act on now, if there is one. */
export function alertOf(load: LoadDetail): LoadAlert | null {
  const allowed = new Set(load.allowed_actions);
  const risk = riskOf(load);
  if (load.status === "on_hold") return { tone: "warn", title: "On hold", text: "The load keeps its driver and equipment while it is held.", button: allowed.has("release") ? "Release hold" : "", act: allowed.has("release") ? "release" : "" };
  if (load.status === "draft") return { tone: "warn", title: "Draft", text: "A draft isn’t offered for dispatch until it is marked ready.", button: allowed.has("mark_ready") ? "Mark ready" : "", act: allowed.has("mark_ready") ? "ready" : "" };
  if (risk && !load.assignment && allowed.has("assign")) return { tone: risk.tone, title: "No driver assigned", text: risk.message, button: "Assign", act: "assign" };
  if (load.status === "delivered") return { tone: "bad", title: "Proof of delivery missing", text: "Invoicing stays blocked until the signed paperwork is uploaded and reviewed.", button: "", act: "" };
  if (load.status === "pod_review") return { tone: "info", title: "Proof of delivery to review", text: "Approve it to complete the load, or send it back.", button: allowed.has("approve_pod") ? "Approve POD" : "", act: allowed.has("approve_pod") ? "pod" : "" };
  if (risk) return { tone: risk.tone, title: risk.label, text: risk.message, button: "", act: "" };
  return null;
}

const FLOW = ["draft", "planned", "assigned", "dispatched", "at_pickup", "in_transit", "at_delivery", "delivered", "pod_review", "completed"];

/** The lifecycle as a strip: each state the load has passed with when it got there, and where it is now. */
export function lifecycle(load: LoadDetail, zone: string): { l: string; t: string; st: string; done: number }[] {
  const reached = new Map<string, string>();
  for (const event of load.events) if (!reached.has(event.to_status)) reached.set(event.to_status, event.created_at);
  // a held load stands where it was held; a cancelled one where it had got to
  const standing = load.status === "on_hold" ? (load.held_from_status ?? "planned") : load.status === "cancelled" ? ([...FLOW].reverse().find((state) => reached.has(state)) ?? "draft") : load.status;
  const current = Math.max(0, FLOW.indexOf(standing));
  return FLOW.map((state, index) => ({
    l: loadLabel(state),
    t: index < current ? (reached.has(state) ? formatDateTime(reached.get(state), zone) : "") : index === current ? (load.status === "on_hold" ? "on hold" : load.status === "cancelled" ? "cancelled" : "now") : "",
    st: index < current ? "done" : index === current ? "cur" : "",
    done: index < current ? 1 : 0,
  }));
}

const minutes = (from: string, to: string | number) => Math.max(0, Math.round(((typeof to === "number" ? to : Date.parse(to)) - Date.parse(from)) / 60_000));
const span = (total: number) => (total >= 60 ? `${Math.floor(total / 60)}h ${total % 60}m` : `${total}m`);

/** A stop's appointment: a time, or a window. */
export function appointment(stop: Stop, zone: string): string {
  if (!stop.appt_start) return "No appointment";
  const start = formatDateTime(stop.appt_start, zone);
  if (!stop.appt_end || stop.appt_end === stop.appt_start) return start;
  const end = formatDateTime(stop.appt_end, zone);
  // the same day: show the date once
  const [day, time] = [end.slice(0, end.lastIndexOf(", ")), end.slice(end.lastIndexOf(", ") + 2)];
  return start.startsWith(day) ? `${start} – ${time}` : `${start} – ${end}`;
}

export type StopState = { stop: Stop; index: number; where: string; kind: "Pickup" | "Delivery"; done: boolean; here: boolean; label: string; tone: string; dwell: string };

/** Each stop with how far the truck has got with it. */
export function stopStates(load: LoadDetail, now: number = Date.now()): StopState[] {
  return load.stops.map((stop, index) => {
    const done = !!stop.departed_at;
    const here = !!stop.arrived_at && !done;
    const pickup = stop.type === "pickup";
    return {
      stop,
      index,
      where: place(stop.city, stop.state),
      kind: pickup ? "Pickup" : "Delivery",
      done,
      here,
      label: done ? (pickup ? "Departed" : "Delivered") : here ? (pickup ? "Loading" : "Unloading") : "Scheduled",
      tone: done ? "ok" : here ? (pickup ? "atpickup" : "atdelivery") : "mu",
      dwell: stop.arrived_at ? (stop.departed_at ? span(minutes(stop.arrived_at, stop.departed_at)) : `${span(minutes(stop.arrived_at, now))} · clock running`) : "—",
    };
  });
}

/** What the customer is charged: the line haul, each billable charge, and what it comes to. */
export function financials(load: LoadDetail): { rows: { k: string; v: string }[]; total: string; perMile: string } {
  const money = (value: string | number) => formatMoney(value, load.currency);
  const rows = [{ k: "Line haul", v: money(load.customer_rate ?? load.revenue ?? 0) }, ...load.charges.filter((charge) => charge.billable).map((charge) => ({ k: charge.description || CHARGES[charge.type] || humanize(charge.type), v: money(charge.amount) }))];
  const cents = toCents(load.revenue ?? load.customer_rate) ?? 0;
  return { rows, total: money(load.revenue ?? load.customer_rate ?? 0), perMile: load.miles ? `$${(cents / 100 / load.miles).toFixed(2)}` : "—" };
}

const REQUIRED: [type: string, label: string][] = [["rate_confirmation", "Rate confirmation"], ["bol", "Bill of lading"], ["pod", "Proof of delivery"]];
const REVIEW: Record<string, [label: string, tone: string]> = { pending: ["Needs review", "info"], approved: ["Approved", "ok"], rejected: ["Rejected", "bad"], not_required: ["Uploaded", "ok"] };

export type Paper = { type: string; label: string; document: Document | null; state: string; tone: string };

/** A load's paperwork: the three documents every load needs, then anything else attached. */
export function paperwork(load: Pick<LoadDetail, "status">, documents: Document[]): { papers: Paper[]; have: number; need: number; tone: string } {
  const delivered = ["delivered", "pod_review", "completed"].includes(load.status);
  const picked = delivered || ["in_transit", "at_delivery"].includes(load.status);
  const due: Record<string, boolean> = { rate_confirmation: true, bol: picked, pod: delivered };
  const state = (document: Document) => REVIEW[document.review_status] ?? [humanize(document.review_status), "mu"];
  const required: Paper[] = REQUIRED.map(([type, label]) => {
    const document = documents.find((each) => each.type === type) ?? null;
    if (document) return { type, label, document, state: state(document)[0], tone: state(document)[1] };
    return { type, label, document: null, state: due[type] ? "Missing" : "Due later", tone: due[type] ? "bad" : "mu" };
  });
  const others: Paper[] = documents.filter((document) => !REQUIRED.some(([type]) => type === document.type)).map((document) => ({ type: document.type, label: document.filename, document, state: state(document)[0], tone: state(document)[1] }));
  const have = required.filter((paper) => paper.document).length;
  return { papers: [...required, ...others], have, need: REQUIRED.length, tone: have === REQUIRED.length ? "ok" : load.status === "delivered" ? "bad" : "mu" };
}

const EVENTS: Record<string, [text: string, tone: string]> = {
  created: ["created the load", "mu"],
  mark_ready: ["marked the load ready", "info"],
  assign: ["assigned a driver and equipment", "brand"],
  reassign: ["changed the driver or equipment", "brand"],
  unassign: ["unassigned the load", "warn"],
  dispatch: ["dispatched the load", "info"],
  arrive: ["recorded an arrival", "ok"],
  depart: ["recorded a departure", "ok"],
  pod_uploaded: ["uploaded the proof of delivery", "ok"],
  approve_pod: ["approved the proof of delivery", "ok"],
  reject_pod: ["sent the proof of delivery back", "bad"],
  hold: ["put the load on hold", "warn"],
  release: ["released the hold", "info"],
  cancel: ["cancelled the load", "bad"],
};

/** Everything that happened to a load, newest first: state changes, check calls and notes. */
export function activity(load: LoadDetail, zone: string): { who: string; what: string; when: string; k: string; src: string }[] {
  const entries = [
    ...load.events.map((event) => {
      const [text, tone] = EVENTS[event.action] ?? [`${humanize(event.action).toLowerCase()} → ${loadLabel(event.to_status).toLowerCase()}`, "mu"];
      return { at: event.created_at, who: event.actor_name ?? "System", what: text + (event.note ? `: “${event.note}”` : ""), k: tone, src: "" };
    }),
    ...load.tracking.map((point) => ({
      at: point.occurred_at,
      who: point.actor_name ?? "System",
      what: `${point.kind === "exception" ? "reported a problem" : "logged a check call"}${point.city ? ` at ${place(point.city, point.state)}` : ""}${point.note ? `: “${point.note}”` : ""}`,
      k: point.kind === "exception" ? "bad" : "info",
      src: humanize(point.source).toLowerCase(),
    })),
    ...load.notes.map((note) => ({ at: note.created_at, who: note.author_name ?? "System", what: `added a note: “${note.body}”`, k: "mu", src: "" })),
  ];
  return entries.sort((a, b) => b.at.localeCompare(a.at)).map(({ at, ...entry }) => ({ ...entry, when: formatDateTime(at, zone) }));
}

/** The line under a load's title: customer, reference, miles, equipment. */
export function describe(load: LoadListItem | LoadDetail): string {
  return [load.customer.name, load.reference, load.miles ? `${formatNumber(load.miles)} mi` : "", equipmentLabel(load.equipment_type)].filter(Boolean).join(" · ");
}

export const statusOf = (load: Pick<LoadListItem, "status">): { label: string; tone: string } => ({ label: loadLabel(load.status), tone: loadTone(load.status) });
