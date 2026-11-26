import type { LoadListItem } from "@/features/loads/load-data";
import { fromLocalInput, toLocalInput } from "@/lib/format/dates";

/** The board's working day on the clock: 06:00 to 22:00, and a driver's daily driving limit. */
export const FIRST_HOUR = 6;
export const LAST_HOUR = 22;
export const SPAN = LAST_HOUR - FIRST_HOUR;
export const DRIVING_HOURS = 11;

export type Status = "unassigned" | "assigned" | "transit" | "bad" | "delivered";
export const STATUSES: { key: Status; label: string; k: string }[] = [
  { key: "unassigned", label: "Unassigned", k: "warn" },
  { key: "assigned", label: "Assigned", k: "assigned" },
  { key: "transit", label: "In transit", k: "transit" },
  { key: "bad", label: "At risk", k: "bad" },
  { key: "delivered", label: "Delivered", k: "ok" },
];
const ROLLING = ["dispatched", "at_pickup", "in_transit", "at_delivery"];
const DONE = ["delivered", "pod_review", "completed"];

/** Which summary chip a load counts under. At risk is a load with a risk, whatever its status. */
export function bucketOf(load: Pick<LoadListItem, "status" | "risks" | "assignment">): Status[] {
  const out: Status[] = [];
  if (!load.assignment && (load.status === "planned" || load.status === "draft")) out.push("unassigned");
  if (load.status === "assigned") out.push("assigned");
  if (ROLLING.includes(load.status)) out.push("transit");
  if (DONE.includes(load.status)) out.push("delivered");
  if (load.risks.some((r) => r.code !== "MISSING_POD")) out.push("bad");
  return out;
}

// ---------------------------------------------------------------- days and hours
export const shift = (day: string, by: number) => new Date(Date.parse(`${day}T12:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);
export const dayOf = (iso: string, zone: string) => toLocalInput(iso, zone).slice(0, 10);
export const hm = (iso: string, zone: string) => toLocalInput(iso, zone).slice(11, 16);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
export const dayLabel = (day: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));
export const monday = (day: string) => shift(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
/** Hours from midnight of `day` on the company's clock. */
export const hoursInto = (iso: string, day: string, zone: string) => (Date.parse(iso) - Date.parse(fromLocalInput(`${day}T00:00`, zone) ?? `${day}T00:00:00Z`)) / 3_600_000;

/** Where a load sits on the day's track: from pickup to delivery (two hours if it has no delivery time), clipped. */
export function span(load: Pick<LoadListItem, "pickup_at" | "delivery_at">, day: string, zone: string): { start: number; end: number } | null {
  if (!load.pickup_at) return null;
  const start = hoursInto(load.pickup_at, day, zone);
  const end = load.delivery_at ? hoursInto(load.delivery_at, day, zone) : start + 2;
  const from = Math.max(start, FIRST_HOUR);
  const to = Math.min(end, LAST_HOUR);
  return to > from ? { start: from, end: to } : null;
}
export const pct = (hours: number) => `${(((hours - FIRST_HOUR) / SPAN) * 100).toFixed(3)}%`;
export const width = (a: number, b: number) => `${(((b - a) / SPAN) * 100).toFixed(3)}%`;

/** Driving hours booked for a driver on the day, and what's left of the daily limit. */
export function hoursBooked(spans: { start: number; end: number }[]): { booked: number; left: number } {
  const booked = spans.reduce((n, s) => n + (s.end - s.start), 0);
  return { booked, left: Math.max(0, DRIVING_HOURS - booked) };
}
/** Share of the drivers' daily driving hours that is booked. */
export function utilization(booked: number[]): number {
  if (!booked.length) return 0;
  return Math.round((booked.reduce((n, b) => n + Math.min(DRIVING_HOURS, b), 0) / (booked.length * DRIVING_HOURS)) * 100);
}

// ---------------------------------------------------------------- the alerts strip
export type Alert = { id: string; k: "bad" | "warn"; title: string; detail: string; button: "Place" | "Open"; loadId: string };

/** Today only: loads with no driver picking up within 4 hours (red within 3), and loads late or at risk. At most three. */
export function alertsFor(queue: LoadListItem[], active: LoadListItem[], now: number, zone: string, dismissed: string[], driverOf: (l: LoadListItem) => string | undefined): Alert[] {
  const out: Alert[] = [];
  const lane = (l: LoadListItem) => `${l.origin_city ?? "—"} → ${l.destination_city ?? "—"}`;
  for (const l of [...queue].filter((x) => x.pickup_at).sort((a, b) => a.pickup_at!.localeCompare(b.pickup_at!))) {
    const minutes = Math.round((Date.parse(l.pickup_at!) - now) / 60_000);
    if (minutes > 240) continue;
    out.push({ id: `p:${l.id}`, k: minutes <= 180 ? "bad" : "warn", title: `${l.load_number} has no driver`, loadId: l.id, button: "Place",
      detail: `${lane(l)} · pickup ${hm(l.pickup_at!, zone)} · ${minutes > 0 ? `in ${Math.floor(minutes / 60)} h ${minutes % 60} min` : "overdue"}` });
  }
  for (const l of active) {
    const late = l.late_by_minutes > 0 || l.risks.some((r) => r.code === "LATE_DELIVERY" || r.code === "LATE_PICKUP");
    const risky = l.risks.some((r) => r.code !== "MISSING_POD" && r.code !== "UNASSIGNED_SOON");
    if (!late && !risky) continue;
    out.push({ id: `l:${l.id}`, k: late ? "warn" : "bad", title: `${l.load_number} ${late ? "is running late" : "is at risk"}`, loadId: l.id, button: "Open",
      detail: [driverOf(l), lane(l)].filter(Boolean).join(" · ") });
  }
  return out.filter((a) => !dismissed.includes(a.id)).slice(0, 3);
}

// ---------------------------------------------------------------- exports
export type PlanRow = { driver: string; items: string[] };
export function planText(dayL: string, zoneL: string, rows: PlanRow[], waiting: string[]): string {
  return [`FlyFleet dispatch plan · ${dayL} · times in ${zoneL}`, "", ...rows.flatMap((r) => [r.driver, ...(r.items.length ? r.items.map((x) => `  ${x}`) : ["  Available"]), ""]), "Unassigned", ...(waiting.length ? waiting.map((x) => `  ${x}`) : ["  None"])].join("\n");
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export function planHtml(company: string, dayL: string, zoneL: string, rows: PlanRow[], waiting: string[]): string {
  const list = (items: string[], none: string) => `<ul>${(items.length ? items : [none]).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  return `<!doctype html><meta charset="utf-8"><title>Dispatch plan ${esc(dayL)}</title><style>body{font:14px system-ui;margin:32px;color:#111}h1{font-size:20px}h2{font-size:15px;margin:18px 0 6px}li{margin:2px 0;font-family:ui-monospace,monospace;font-size:13px}</style><h1>${esc(company)} · dispatch plan · ${esc(dayL)}</h1><p>Times in ${esc(zoneL)}. Print, then Save as PDF.</p>${rows.map((r) => `<h2>${esc(r.driver)}</h2>${list(r.items, "Available")}`).join("")}<h2>Unassigned</h2>${list(waiting, "None")}`;
}
export function csv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}
export function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- keyboard
/** A board shortcut, unless someone is typing or holding a modifier. */
export function boardKey(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey"> & { target: EventTarget | null }): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const el = e.target as HTMLElement | null;
  const typing = !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
  if (e.key === "Escape") return typing ? null : "Escape";
  if (typing) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return ["t", "b", "c", "n", "/", "ArrowLeft", "ArrowRight"].includes(k) ? k : null;
}
