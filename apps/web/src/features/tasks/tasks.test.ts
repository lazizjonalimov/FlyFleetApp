import { describe, expect, it } from "vitest";
import {
  at, DEFAULT_FILTERS, dueForSection, dueLabel, dueTone, duration, inTab, matches, monthGrid, sameFilters, sectionOf, shiftDay,
  shortcut, slaOf, snoozeChoices, sorted, viewFilters, viewParams, type Task,
} from "./model";

const Z = "America/Chicago";
// Thursday 26 November 2026, 10:00 in Chicago.
const NOW = at("2026-11-26", "10:00", Z);
const iso = (day: string, hhmm: string) => new Date(at(day, hhmm, Z)).toISOString();

function task(over: Partial<Task> = {}): Task {
  return {
    id: over.id ?? "t1", title: "Call the shipper", detail: null, status: "open", priority: "medium", due_at: null, all_day: false,
    assignee: { id: "me", name: "Me" }, created_by: { id: "me", name: "Me" }, source: "manual", incident_id: null, entity_type: null,
    entity_id: null, entity_label: null, action: null, done_at: null, outcome: null, created_at: iso("2026-11-25", "09:00"), version: 1,
    snoozed_until: null, why: null, auto_close: null, recurrence: "none", blocked_by: null, blocker: null, sla_at: null, sla_label: null,
    escalated: false, subtasks: [], ...over,
  } as Task;
}

describe("sections and due labels", () => {
  it("puts tasks in overdue, now (30 min), today and later", () => {
    expect(sectionOf(task({ due_at: iso("2026-11-26", "09:59") }), NOW, Z)).toBe("overdue");
    expect(sectionOf(task({ due_at: iso("2026-11-26", "10:30") }), NOW, Z)).toBe("now");
    expect(sectionOf(task({ due_at: iso("2026-11-26", "10:31") }), NOW, Z)).toBe("today");
    expect(sectionOf(task({ due_at: iso("2026-11-27", "08:00") }), NOW, Z)).toBe("later");
    expect(sectionOf(task(), NOW, Z)).toBe("later");
  });
  it("reads the due time as the list shows it, and colours late and soon", () => {
    expect(dueLabel(task({ due_at: iso("2026-11-26", "14:30") }), NOW, Z)).toBe("14:30");
    expect(dueLabel(task({ due_at: iso("2026-11-27", "09:00") }), NOW, Z)).toBe("Tomorrow 09:00");
    expect(dueLabel(task({ due_at: iso("2026-11-30", "09:00") }), NOW, Z)).toBe("Mon 09:00");
    expect(dueLabel(task({ due_at: iso("2026-12-10", "09:00"), all_day: true }), NOW, Z)).toBe("Dec 10");
    expect(dueLabel(task(), NOW, Z)).toBe("No date");
    expect(dueLabel(task({ status: "done", done_at: iso("2026-11-26", "08:15") }), NOW, Z)).toBe("08:15");
    expect(dueTone(task({ due_at: iso("2026-11-26", "09:00") }), NOW)).toBe("bad");
    expect(dueTone(task({ due_at: iso("2026-11-26", "10:20") }), NOW)).toBe("warn");
    expect(dueTone(task({ due_at: iso("2026-11-26", "12:00") }), NOW)).toBeNull();
  });
});

describe("the promise's clock", () => {
  it("counts down, turns amber within two hours and red when late", () => {
    expect(duration(80)).toBe("1 h 20 min");
    expect(duration(120)).toBe("2 h");
    expect(slaOf(task({ sla_at: iso("2026-11-26", "11:20"), sla_label: "Customer update" }), NOW)).toEqual({ text: "Customer update in 1 h 20 min", k: "warn" });
    expect(slaOf(task({ sla_at: iso("2026-11-26", "09:48"), sla_label: "Customer update" }), NOW)).toEqual({ text: "Customer update · 12 min late", k: "bad" });
    expect(slaOf(task({ sla_at: iso("2026-11-26", "15:00"), sla_label: "Pickup" }), NOW)?.k).toBe("mu");
    expect(slaOf(task({ sla_at: iso("2026-11-26", "15:00"), sla_label: "Pickup", status: "done" }), NOW)).toBeNull();
  });
});

describe("tabs, filters, sorting and saved views", () => {
  const mine = task({ id: "a", priority: "low", due_at: iso("2026-11-26", "11:00") });
  const high = task({ id: "b", priority: "high", due_at: iso("2026-11-28", "11:00"), entity_type: "load", entity_label: "LD-1" });
  const given = task({ id: "c", assignee: { id: "dee", name: "Dee" } });
  const snoozed = task({ id: "d", status: "snoozed", snoozed_until: iso("2026-11-26", "15:00") });
  const done = task({ id: "e", status: "done", done_at: iso("2026-11-26", "08:00") });
  const tab = (key: Parameters<typeof inTab>[1], team = false) => [mine, high, given, snoozed, done].filter((t) => inTab(t, key, "me", team, NOW, Z)).map((t) => t.id);

  it("sorts tasks into the five tabs, and the team's view shows everyone's", () => {
    expect(tab("open")).toEqual(["a", "b"]);
    expect(tab("today")).toEqual(["a"]);
    expect(tab("by_me")).toEqual(["c"]);
    expect(tab("snoozed")).toEqual(["d"]);
    expect(tab("done")).toEqual(["e"]);
    expect(tab("open", true)).toEqual(["a", "b", "c"]);
  });
  it("filters by priority, linked item and search, and sorts by priority then due", () => {
    expect(matches(high, { ...DEFAULT_FILTERS, linked: "load", q: "ld-1" })).toBe(true);
    expect(matches(mine, { ...DEFAULT_FILTERS, linked: "load" })).toBe(false);
    expect(matches(mine, { ...DEFAULT_FILTERS, linked: "none", priority: "low" })).toBe(true);
    expect(sorted([mine, high], "smart").map((t) => t.id)).toEqual(["b", "a"]);
    expect(sorted([mine, high], "due").map((t) => t.id)).toEqual(["a", "b"]);
  });
  it("keeps only what differs in a saved view, and knows when the screen matches one", () => {
    const f = { ...DEFAULT_FILTERS, priority: "high" as const };
    expect(viewParams(f)).toEqual({ priority: "high" });
    expect(sameFilters(viewFilters({ tab: "open", priority: "high" }), f)).toBe(true);
    expect(sameFilters(viewFilters({ tab: "by_me" }), f)).toBe(false);
  });
});

describe("snoozing, moving and the month", () => {
  it("offers the snooze times still ahead", () => {
    expect(snoozeChoices(NOW, Z).map((c) => `${c.label} · ${c.when}`)).toEqual(["In 1 hour · Today 11:00", "This afternoon · Today 15:00", "End of day · Today 17:00", "Tomorrow morning · Tomorrow 08:00"]);
    expect(snoozeChoices(at("2026-11-26", "16:30", Z), Z).map((c) => c.label)).toEqual(["In 1 hour", "Tomorrow morning"]);
  });
  it("moves a card by setting a due time in its new column", () => {
    for (const key of ["overdue", "now", "today", "later"] as const) expect(sectionOf({ due_at: new Date(dueForSection(key, NOW, Z)).toISOString() }, NOW, Z)).toBe(key);
    expect(new Date(shiftDay(task({ due_at: iso("2026-11-26", "14:30") }), 1, NOW, Z)).toISOString()).toBe(iso("2026-11-27", "14:30"));
    expect(new Date(shiftDay(task(), 1, NOW, Z)).toISOString()).toBe(iso("2026-11-26", "17:00"));
  });
  it("lays a month out Monday first, in whole weeks", () => {
    const grid = monthGrid("2026-11-26");
    expect(grid[0]).toBe("2026-10-26");
    expect(grid.length % 7).toBe(0);
    expect(grid.at(-1)).toBe("2026-12-06");
  });
});

describe("keyboard", () => {
  const key = (k: string, target: Partial<HTMLElement> | null = null, mods = {}) => shortcut({ key: k, ctrlKey: false, metaKey: false, altKey: false, target: target as EventTarget | null, ...mods });
  it("ignores typing and modifier keys, but Escape always closes", () => {
    expect(key("J")).toBe("j");
    expect(key("j", { tagName: "INPUT" })).toBeNull();
    expect(key("j", null, { ctrlKey: true })).toBeNull();
    expect(key("Escape", { tagName: "TEXTAREA" })).toBe("Escape");
    expect(key("q")).toBeNull();
  });
});
