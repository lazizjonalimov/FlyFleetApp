import { describe, expect, it } from "vitest";
import { estimate, nextDates } from "./load-money";

const costs = { driver_pay_per_mile: "0.62", mpg: "6.8", fuel_price: "3.92", overhead_per_mile: "1.65" };

describe("margin estimate", () => {
  it("matches the server's rule: revenue less driver pay, fuel and overhead", () => {
    const m = estimate("2000.00", 12, [], 500, costs);
    expect(m.total).toBe(224_000);
    expect(m.pay).toBe(31_000);
    expect(m.fuelCost).toBe(28_824);
    expect(m.overhead).toBe(82_500);
    expect(m.margin).toBe(81_676);
    expect(m.pct).toBe(36);
    expect(m.warn).toBe(false);
  });
  it("warns below 25%", () => {
    expect(estimate("1000", 0, [], 500, costs).warn).toBe(true);
  });
});

describe("repeat dates", () => {
  it("lists the next weekdays up to the end date", () => {
    // 2031-03-10 is a Monday
    expect(nextDates([0, 2], "2031-03-10", null)).toEqual(["2031-03-12", "2031-03-17", "2031-03-19"]);
    expect(nextDates([0], "2031-03-10", "2031-03-20")).toEqual(["2031-03-17"]);
  });
});
