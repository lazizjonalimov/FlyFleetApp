import { describe, expect, it } from "vitest";
import { byDay, dayChips, monthCells, project, shiftMonth, tabsFor, tileValue, type CalEvent } from "./dx-data";
import { briefItems } from "./dx-overview";
import { matchesTruck, pinStatus } from "./dx-operations";
import { rankDrivers } from "./dx-fleet";

const ev = (id: string, category: string, date = "2026-11-26", title = id): CalEvent =>
  ({ id, category, date, title, time: null, type: "x", who: null, lane: null, reference: null, past: false, target: { screen: "load" } }) as CalEvent;

describe("tabs by role", () => {
  const can = (held: string[]) => (...p: string[]) => p.some((x) => held.includes(x));
  it("shows Financial only with finance access and hides Operations and Fleet from accounting", () => {
    const all = ["loads.read", "drivers.read", "equipment.read", "loads.rates.read", "invoices.read", "expenses.read"];
    expect(tabsFor(can(all), "owner")).toEqual(["overview", "operations", "financial", "fleet", "calendar"]);
    expect(tabsFor(can(all), "accountant")).toEqual(["overview", "financial", "calendar"]);
    expect(tabsFor(can(["loads.read", "drivers.read", "equipment.read"]), "dispatcher")).toEqual(["overview", "operations", "fleet", "calendar"]);
  });
});

describe("calendar", () => {
  it("lays out months Monday first and crosses year ends", () => {
    const cells = monthCells("2026-11-13");
    expect(cells[0]).toBe("2026-10-26");
    expect(cells.length % 7).toBe(0);
    expect(shiftMonth("2026-12-15", 1)).toBe("2027-01-01");
  });
  it("counts pickups and deliveries, names other events, then +n more", () => {
    const list = [ev("a", "pickup"), ev("b", "pickup"), ev("c", "delivery"), ev("d", "maintenance", undefined, "Oil change"), ev("e", "billing", undefined, "Invoice due")];
    const { chips, more } = dayChips(list);
    expect(chips.map((c) => c.label)).toEqual(["2 pickups", "1 delivery", "Oil change"]);
    expect(more).toBe(1);
    expect(byDay(list, new Set(["pickup"])).get("2026-11-26")?.length).toBe(2);
  });
});

describe("map and trucks", () => {
  it("fits trucks into the box", () => {
    const { pins } = project([{ id: "a", lat: 32.78, lon: -96.8 }, { id: "b", lat: 30.27, lon: -97.74 }], 720, 360);
    for (const p of pins) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(720);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(360);
    }
    expect(pins[0]!.y).toBeLessThan(pins[1]!.y); // north is up
  });
  it("colours by status and searches by unit, driver, load or route", () => {
    const load = { status: "in_transit", late_by_minutes: 0, delivery_late_by_minutes: 0, load_number: "L-1", lane: "Dallas, TX → Austin, TX" };
    expect(pinStatus({ load: null } as never)).toBe("available");
    expect(pinStatus({ load } as never)).toBe("transit");
    expect(pinStatus({ load: { ...load, late_by_minutes: 5 } } as never)).toBe("late");
    expect(pinStatus({ load: { ...load, status: "at_pickup" } } as never)).toBe("pickup");
    const v = { unit_number: "T-12", driver: { name: "Dana Driver" }, load, place: null } as never;
    expect(matchesTruck(v, "austin")).toBe(true);
    expect(matchesTruck(v, "dana")).toBe(true);
    expect(matchesTruck(v, "nope")).toBe(false);
  });
});

describe("figures", () => {
  it("formats money tiles by unit", () => {
    expect(tileValue("184200", "money")).toBe("$184.2k");
    expect(tileValue("92.5", "percent")).toBe("92.5%");
    expect(tileValue("2.4", "per_mile")).toBe("$2.40");
    expect(tileValue(null, "days")).toBe("—");
  });
  it("ranks drivers by the chosen measure", () => {
    const d = (name: string, score: number | null, miles: number, on: number | null) => ({ driver_id: name, name, score, miles, on_time_pct: on, loads: 1, incidents: 0, weeks: [], recent: [] });
    const list = [d("A", 80, 900, 100), d("B", 95, 400, 90), d("C", null, 1200, null)];
    expect(rankDrivers(list, "score").map((x) => x.name)).toEqual(["B", "A", "C"]);
    expect(rankDrivers(list, "miles").map((x) => x.name)).toEqual(["C", "A", "B"]);
    expect(rankDrivers(list, "on_time").map((x) => x.name)).toEqual(["A", "B", "C"]);
  });
  it("builds today's brief from attention items, at most five, with revenue when ahead", () => {
    const a = (kind: string, key: string) => ({ key, kind, title: `${kind} title`, detail: "d", action_label: "Go", tone: "warn", ref: "L-1" }) as never;
    const items = briefItems([a("unassigned", "1"), a("late", "2"), a("dwell", "3"), a("documents", "4"), a("speeding", "5"), a("gps_stale", "6")], undefined, { now: 2000, last: 1000 });
    expect(items).toHaveLength(5);
    expect(items[0]!.head).toBe("Assign a driver to L-1");
    expect(items.some((i) => i.head === "Revenue is ahead of last month")).toBe(true);
  });
});
