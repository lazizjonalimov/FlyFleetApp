import { describe, expect, it } from "vitest";
import { alertsFor, boardKey, bucketOf, csv, hoursBooked, planText, span, utilization } from "./board-model";

const Z = "America/Chicago";
const at = (hhmm: string) => new Date(`2026-11-26T${hhmm}:00-06:00`).toISOString();
const load = (over: Record<string, unknown> = {}) => ({
  id: "a", load_number: "L-1", status: "planned", risks: [], assignment: null, pickup_at: at("10:00"), delivery_at: at("16:00"),
  origin_city: "Dallas", destination_city: "Austin", late_by_minutes: 0, ...over,
}) as never;

describe("where loads sit", () => {
  it("places a load from pickup to delivery and clips it to 06:00–22:00", () => {
    expect(span(load(), "2026-11-26", Z)).toEqual({ start: 10, end: 16 });
    expect(span(load({ pickup_at: at("04:00"), delivery_at: at("23:30") }), "2026-11-26", Z)).toEqual({ start: 6, end: 22 });
    expect(span(load({ delivery_at: null }), "2026-11-26", Z)).toEqual({ start: 10, end: 12 });
    expect(span(load(), "2026-11-27", Z)).toBeNull();
  });
  it("counts driving hours left and the share booked", () => {
    expect(hoursBooked([{ start: 8, end: 12 }, { start: 14, end: 17 }])).toEqual({ booked: 7, left: 4 });
    expect(utilization([11, 0])).toBe(50);
    expect(utilization([20])).toBe(100);
  });
  it("sorts loads into the summary chips", () => {
    expect(bucketOf(load())).toEqual(["unassigned"]);
    expect(bucketOf(load({ status: "in_transit", assignment: {}, risks: [{ code: "LATE_DELIVERY" }] }))).toEqual(["transit", "bad"]);
    expect(bucketOf(load({ status: "delivered", assignment: {}, risks: [{ code: "MISSING_POD" }] }))).toEqual(["delivered"]);
  });
});

describe("alerts", () => {
  it("warns about loads without a driver picking up soon, red within 3 h, and late loads, at most three", () => {
    const now = Date.parse(at("08:00"));
    const queue = [load({ id: "q1", load_number: "L-1", pickup_at: at("10:30") }), load({ id: "q2", load_number: "L-2", pickup_at: at("11:30") }), load({ id: "q3", load_number: "L-3", pickup_at: at("13:00") })];
    const late = [load({ id: "x", load_number: "L-9", status: "in_transit", assignment: {}, late_by_minutes: 20 })];
    const out = alertsFor(queue, late, now, Z, [], () => "Dana Driver");
    expect(out.map((a) => [a.title, a.k])).toEqual([["L-1 has no driver", "bad"], ["L-2 has no driver", "warn"], ["L-9 is running late", "warn"]]);
    expect(out[0]!.detail).toBe("Dallas → Austin · pickup 10:30 · in 2 h 30 min");
    expect(alertsFor(queue, late, now, Z, ["p:q1"], () => undefined).map((a) => a.id)).toEqual(["p:q2", "l:x"]);
  });
});

describe("exports and keys", () => {
  it("writes the plan as text and quotes CSV", () => {
    expect(planText("Thu, Nov 26", "CT", [{ driver: "Dana", items: [] }], [])).toContain("Dana\n  Available");
    expect(csv([["a", 'b "c"']])).toBe('"a","b ""c"""');
  });
  it("ignores typing and modifiers", () => {
    const k = (key: string, tag = "BODY", mods = {}) => boardKey({ key, ctrlKey: false, metaKey: false, altKey: false, target: { tagName: tag } as never, ...mods });
    expect(k("T")).toBe("t");
    expect(k("ArrowLeft")).toBe("ArrowLeft");
    expect(k("t", "INPUT")).toBeNull();
    expect(k("b", "BODY", { ctrlKey: true })).toBeNull();
    expect(k("/")).toBe("/");
  });
});
