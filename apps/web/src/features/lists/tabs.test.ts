import { describe, expect, it } from "vitest";
import { unseen } from "@/features/shell/notifications-panel";
import { LOAD_TABS, tabFor, WORK_ORDER_TABS } from "./tabs";

describe("linking into a list with a filter", () => {
  it("opens the tab whose filter it is", () => {
    expect(LOAD_TABS[tabFor(LOAD_TABS, { view: "at_risk" })]!.label).toBe("At risk");
    expect(WORK_ORDER_TABS[tabFor(WORK_ORDER_TABS, { priority: "urgent", open: "true" })]!.label).toBe("Urgent");
  });

  it("falls back to the first tab when no tab is that filter", () => {
    expect(tabFor(LOAD_TABS, { status: "pod_review" })).toBe(0);
  });
});

describe("the bell", () => {
  it("counts kinds never seen, and kinds whose count has grown, as new", () => {
    const alerts = [{ code: "A", count: 2 }, { code: "B", count: 1 }, { code: "C", count: 4 }];
    expect([...unseen(alerts, { A: 2, B: 3, C: 3 })]).toEqual(["C"]);
    expect([...unseen(alerts, {})]).toEqual(["A", "B", "C"]);
  });
});
