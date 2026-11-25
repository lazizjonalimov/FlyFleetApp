import { describe, expect, it } from "vitest";
import { changeOf, sumKpis, type CompanyKpis, type Kpi } from "./kpi-cards";
import { quickActionsFor } from "./quick-actions";
import { stack } from "./schedule";

const kpi = (over: Partial<Kpi>): Kpi => ({
  key: "unassigned", label: "Unassigned loads", tone: "warn", good: "down", value: 0, total: null, sub: "", definition: "d",
  change: { delta: null, tone: "neutral", text: "" }, series: [null, null, null, null, null, null, 0],
  target: { screen: "loads", resource: "loads", params: { view: "unassigned_soon" }, label: "Unassigned loads" }, ...over,
});
const company = (name: string, kpis: Kpi[]): CompanyKpis => ({
  organization: { id: name, code: name.slice(0, 2), name, slug: name.toLowerCase(), color: "#1F4FE0" },
  data: { period: "today", today: "2026-11-25", since: "yesterday", kpis },
});

describe("dashboard figures", () => {
  it("say how they changed, in words, judged by which way is better", () => {
    expect(changeOf({ good: "down" }, 3, 5, "today")).toEqual({ delta: -2, tone: "good", text: "▼ 2 vs yesterday" });
    expect(changeOf({ good: "up" }, 3, 5, "week")).toEqual({ delta: -2, tone: "bad", text: "▼ 2 vs last week" });
    expect(changeOf({ good: "neutral" }, 7, 5, "month").tone).toBe("neutral");
    expect(changeOf({ good: "up" }, 4, 4, "today").text).toBe("No change vs yesterday");
    expect(changeOf({ good: "up" }, 4, null, "month").text).toBe("No figure for last month yet");
  });

  it("add up across companies, point by point", () => {
    const sum = sumKpis([
      company("Acme", [kpi({ value: 2, series: [1, null, 3, null, null, 4, 2] }), kpi({ key: "drivers_available", good: "up", value: 1, total: 4 })]),
      company("Bravo", [kpi({ value: 5, series: [null, null, 1, null, null, 1, 5] }), kpi({ key: "drivers_available", good: "up", value: 2, total: 3 })]),
    ], "today");
    expect(sum[0]).toMatchObject({ value: 7, sub: "across 2 companies", series: [1, null, 4, null, null, 5, 7] });
    expect(sum[0]!.change).toEqual({ delta: 2, tone: "bad", text: "▲ 2 vs yesterday" });
    expect(sum[1]).toMatchObject({ value: 3, total: 7 });
  });
});

describe("today's schedule", () => {
  it("moves a chip that would overlap the one before it to another row", () => {
    expect(stack([0, 5, 30, 32, 33], 10)).toEqual([0, 1, 0, 1, 2]);
    expect(stack([0, 10, 20], 10)).toEqual([0, 0, 0]);
  });
});

describe("quick actions", () => {
  const as = (perms: string[]) => quickActionsFor((...any) => any.some((p) => perms.includes(p))).map((a) => a.label);
  it("are only the ones the role can do", () => {
    expect(as(["invoices.create", "invoices.read"])).toEqual(["Create an invoice"]);
    expect(as(["dispatch.assign"])).toEqual(["Assign a driver"]);
    expect(as(["dispatch.assign", "invoices.create", "drivers.manage", "equipment.manage"])).toHaveLength(4);
    expect(as([])).toEqual([]);
  });
});
