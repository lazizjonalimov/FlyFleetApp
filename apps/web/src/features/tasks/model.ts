import type { Schema } from "@/lib/api/types";
import { fromLocalInput, toLocalInput } from "@/lib/format/dates";

/** A task as the screen holds it: in All companies, with the company it belongs to. */
export type Task = Schema<"TaskOut"> & { organization?: { id: string; slug: string; name: string; code: string; color: string; logo_url?: string | null } };
export type Priority = Task["priority"];
export type Linked = NonNullable<Schema<"TaskIn">["entity_type"]>;

export type TabKey = "open" | "today" | "by_me" | "snoozed" | "done";
export const TABS: { key: TabKey; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "today", label: "Due today" },
  { key: "by_me", label: "Assigned by me" },
  { key: "snoozed", label: "Snoozed" },
  { key: "done", label: "Done" },
];

export type SectionKey = "overdue" | "now" | "today" | "later";
export const SECTIONS: { key: SectionKey; label: string; k: string }[] = [
  { key: "overdue", label: "Overdue", k: "bad" },
  { key: "now", label: "Now · within 30 min", k: "warn" },
  { key: "today", label: "Today", k: "brand" },
  { key: "later", label: "Later", k: "mu" },
];
export const BOARD: { key: SectionKey; label: string; k: string }[] = [
  { key: "overdue", label: "Overdue", k: "bad" },
  { key: "now", label: "Now", k: "warn" },
  { key: "today", label: "Today", k: "brand" },
  { key: "later", label: "Later", k: "mu" },
];

export const PRIORITY: Record<Priority, { label: string; k: string; rank: number }> = {
  high: { label: "High", k: "bad", rank: 0 },
  medium: { label: "Medium", k: "warn", rank: 1 },
  low: { label: "Low", k: "mu", rank: 2 },
};

export const LINKED: { key: Linked; label: string }[] = [
  { key: "load", label: "Load" },
  { key: "driver", label: "Driver" },
  { key: "vehicle", label: "Truck" },
  { key: "trailer", label: "Trailer" },
  { key: "invoice", label: "Invoice" },
  { key: "statement", label: "Statement" },
  { key: "customer", label: "Customer" },
];
export const linkedLabel = (kind: string | null | undefined) => LINKED.find((x) => x.key === kind)?.label ?? "";

export const SOURCE: Record<Task["source"], { label: string; k: string }> = {
  incident: { label: "From an alert", k: "bad" },
  reminder: { label: "From an exception", k: "warn" },
  manual: { label: "From a person", k: "mu" },
  recurring: { label: "Recurring", k: "brand" },
};

export const REPEAT: Record<Task["recurrence"], string> = { none: "Doesn’t repeat", daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

const MIN = 60_000;

// ---------------------------------------------------------------- the company's clock
export const dayOf = (at: number | string, zone: string) => toLocalInput(new Date(at).toISOString(), zone).slice(0, 10);
export const clockOf = (at: number | string, zone: string) => toLocalInput(new Date(at).toISOString(), zone).slice(11, 16);
/** A day N days from another ("2026-11-26" + 1). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** A time on the company's clock, as an instant. */
export const at = (day: string, hhmm: string, zone: string) => new Date(fromLocalInput(`${day}T${hhmm}`, zone)!).getTime();
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const weekdayOf = (day: string) => WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()]!;
export const shortDate = (day: string) => `${MONTH[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
export const monthName = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** "Today", "Tomorrow", a weekday this week, or the date. */
export function dayLabel(day: string, today: string): string {
  const diff = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return weekdayOf(day);
  return shortDate(day);
}

const dueMs = (t: Pick<Task, "due_at">) => (t.due_at ? Date.parse(t.due_at) : null);

/** Where an open task sits: overdue, due within 30 minutes, later today, or later (or no date). */
export function sectionOf(t: Pick<Task, "due_at">, now: number, zone: string): SectionKey {
  const due = dueMs(t);
  if (due === null) return "later";
  if (due < now) return "overdue";
  if (due <= now + 30 * MIN) return "now";
  return dayOf(due, zone) === dayOf(now, zone) ? "today" : "later";
}

/** When it's due, as the list reads it; for a closed task, when it was done. */
export function dueLabel(t: Pick<Task, "due_at" | "all_day" | "status" | "done_at">, now: number, zone: string): string {
  const today = dayOf(now, zone);
  if (t.status === "done" || t.status === "cancelled") {
    if (!t.done_at) return "—";
    const day = dayOf(t.done_at, zone);
    return day === today ? clockOf(t.done_at, zone) : dayLabel(day, today);
  }
  if (!t.due_at) return "No date";
  const day = dayOf(t.due_at, zone);
  const label = dayLabel(day, today);
  if (t.all_day) return label;
  return label === "Today" ? clockOf(t.due_at, zone) : `${label} ${clockOf(t.due_at, zone)}`;
}

/** Red once it's late, amber within the next 30 minutes. */
export function dueTone(t: Pick<Task, "due_at" | "status">, now: number): "bad" | "warn" | null {
  const due = dueMs(t);
  if (due === null || (t.status !== "open" && t.status !== "snoozed")) return null;
  return due < now ? "bad" : due <= now + 30 * MIN ? "warn" : null;
}

/** "1 h 20 min", "12 min", "2 h". */
export function duration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h >= 48) return `${Math.round(h / 24)} days`;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** The promise's clock: "Customer update in 1 h 20 min", or "Customer update · 12 min late". */
export function slaOf(t: Pick<Task, "sla_at" | "sla_label" | "status">, now: number): { text: string; k: "bad" | "warn" | "mu" } | null {
  if (!t.sla_at || !t.sla_label || t.status === "done" || t.status === "cancelled") return null;
  const left = (Date.parse(t.sla_at) - now) / MIN;
  if (left < 0) return { text: `${t.sla_label} · ${duration(-left)} late`, k: "bad" };
  return { text: `${t.sla_label} in ${duration(left)}`, k: left <= 120 ? "warn" : "mu" };
}

export const stepsDone = (t: Pick<Task, "subtasks">) => t.subtasks.filter((s) => s.done).length;

// ---------------------------------------------------------------- tabs, filters, sorting and saved views
export type Filters = { tab: TabKey; priority: "all" | Priority; linked: "all" | "none" | Linked; company: string; q: string; sort: "smart" | "due" | "new" };
export const DEFAULT_FILTERS: Filters = { tab: "open", priority: "all", linked: "all", company: "all", q: "", sort: "smart" };

/** Which tab a task belongs on, for the person looking (or for anyone, in the team's view). */
export function inTab(t: Task, tab: TabKey, me: string, team: boolean, now: number, zone: string): boolean {
  const mine = team || t.assignee?.id === me;
  const open = t.status === "open";
  if (tab === "by_me") return (open || t.status === "snoozed") && t.created_by?.id === me && t.assignee?.id !== me;
  if (tab === "snoozed") return mine && t.status === "snoozed";
  if (tab === "done") return mine && (t.status === "done" || t.status === "cancelled");
  if (tab === "today") return mine && open && !!t.due_at && dayOf(t.due_at, zone) <= dayOf(now, zone);
  return mine && open;
}

export function matches(t: Task, f: Filters): boolean {
  if (f.priority !== "all" && t.priority !== f.priority) return false;
  if (f.linked === "none" ? !!t.entity_type : f.linked !== "all" && t.entity_type !== f.linked) return false;
  if (f.company !== "all" && t.organization?.slug !== f.company) return false;
  const q = f.q.trim().toLowerCase();
  if (q && ![t.title, t.detail, t.entity_label, t.assignee?.name].some((x) => x?.toLowerCase().includes(q))) return false;
  return true;
}

export function sorted(tasks: Task[], sort: Filters["sort"]): Task[] {
  const due = (t: Task) => (t.due_at ? Date.parse(t.due_at) : Number.MAX_SAFE_INTEGER);
  const by: Record<Filters["sort"], (a: Task, b: Task) => number> = {
    smart: (a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || due(a) - due(b),
    due: (a, b) => due(a) - due(b) || PRIORITY[a.priority].rank - PRIORITY[b.priority].rank,
    new: (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  };
  return [...tasks].sort(by[sort]);
}

/** A saved view's settings, filled in with the defaults for what it leaves out. */
export function viewFilters(params: Record<string, unknown>): Filters {
  const pick = <K extends keyof Filters>(key: K) => (typeof params[key] === "string" ? (params[key] as Filters[K]) : DEFAULT_FILTERS[key]);
  return { tab: pick("tab"), priority: pick("priority"), linked: pick("linked"), company: pick("company"), q: pick("q"), sort: pick("sort") };
}
/** Only what differs from the defaults is kept. */
export function viewParams(f: Filters): Record<string, string> {
  return Object.fromEntries(Object.entries(f).filter(([k, v]) => DEFAULT_FILTERS[k as keyof Filters] !== v));
}
export const sameFilters = (a: Filters, b: Filters) => (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).every((k) => a[k] === b[k]);

// ---------------------------------------------------------------- snoozing and moving
export type Choice = { label: string; when: string; at: number };

/** In 1 hour, this afternoon, end of day, tomorrow morning: the ones still ahead. */
export function snoozeChoices(now: number, zone: string): Choice[] {
  const today = dayOf(now, zone);
  const tomorrow = addDays(today, 1);
  const hour = now + 60 * MIN;
  const list: Choice[] = [
    { label: "In 1 hour", when: `${dayLabel(dayOf(hour, zone), today)} ${clockOf(hour, zone)}`, at: hour },
    { label: "This afternoon", when: "Today 15:00", at: at(today, "15:00", zone) },
    { label: "End of day", when: "Today 17:00", at: at(today, "17:00", zone) },
    { label: "Tomorrow morning", when: "Tomorrow 08:00", at: at(tomorrow, "08:00", zone) },
  ];
  return list.filter((c, i) => i === 0 || c.at > hour);
}

/** The due time that puts a task in a board column. */
export function dueForSection(section: SectionKey, now: number, zone: string): number {
  const today = dayOf(now, zone);
  const round = (ms: number) => Math.round(ms / (5 * MIN)) * 5 * MIN;
  if (section === "overdue") return round(now - 15 * MIN);
  if (section === "now") return round(now + 15 * MIN);
  if (section === "today") {
    const five = at(today, "17:00", zone);
    return five > now + 45 * MIN ? five : Math.min(at(today, "23:30", zone), round(now + 60 * MIN));
  }
  return at(addDays(today, 1), "09:00", zone);
}

/** A day earlier or later, at the same time; an undated task goes to today at 17:00. */
export function shiftDay(t: Pick<Task, "due_at">, by: number, now: number, zone: string): number {
  if (!t.due_at) return at(dayOf(now, zone), "17:00", zone);
  return at(addDays(dayOf(t.due_at, zone), by), clockOf(t.due_at, zone), zone);
}

/** The weeks of a month, Monday first, as days ("2026-11-30"), with the days of the months around it. */
export function monthGrid(today: string): string[] {
  const first = `${today.slice(0, 8)}01`;
  const lead = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(first, -lead);
  const next = addDays(`${today.slice(0, 8)}28`, 4).slice(0, 8) + "01";
  const out: string[] = [];
  for (let day = start; day < next || out.length % 7; day = addDays(day, 1)) out.push(day);
  return out;
}

// ---------------------------------------------------------------- keyboard
/** A shortcut, unless someone is typing or holding a modifier. */
export function shortcut(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey"> & { target: EventTarget | null }): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "Escape") return "Escape";
  const el = e.target as HTMLElement | null;
  const tag = el?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return ["j", "k", "o", "e", "s", "x", "c", "1", "2", "3", "Escape"].includes(key) ? key : null;
}
