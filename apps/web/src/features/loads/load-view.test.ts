import { describe, expect, it } from "vitest";
import type { LoadDetail } from "./load-data";
import { activity, alertOf, lifecycle, paperwork, riskOf } from "./load-view";

const load = (patch: Partial<LoadDetail> = {}): LoadDetail =>
  ({
    id: "l1", load_number: "L-1", status: "planned", version: 1, customer: { id: "c1", name: "Acme" }, currency: "USD", risks: [], assignment: null, allowed_actions: [], events: [], tracking: [], notes: [], stops: [], charges: [], assignments: [], held_from_status: null, miles: 100, revenue: "1000.00", customer_rate: "1000.00",
    ...patch,
  }) as unknown as LoadDetail;

describe("a load's lifecycle strip", () => {
  it("marks the states passed, with when, and where it is now", () => {
    const steps = lifecycle(load({ status: "assigned", events: [{ action: "created", to_status: "planned", created_at: "2026-11-10T12:00:00Z" }, { action: "assign", to_status: "assigned", created_at: "2026-11-11T12:00:00Z" }] as never }), "UTC");
    expect(steps.map((step) => step.st).slice(0, 4)).toEqual(["done", "done", "cur", ""]);
    expect(steps[1]!.t).toMatch(/Nov 10/);
    expect(steps[2]!.t).toBe("now");
  });

  it("shows a held load where it was held", () => {
    const steps = lifecycle(load({ status: "on_hold", held_from_status: "assigned" }), "UTC");
    expect(steps.find((step) => step.st === "cur")).toMatchObject({ l: "Assigned", t: "on hold" });
  });
});

describe("what to act on", () => {
  it("is the API's risk, labelled", () => {
    expect(riskOf(load({ risks: [{ code: "LATE_PICKUP", message: "Pickup was due at 08:00" }] as never }))).toEqual({ label: "Late pickup", tone: "bad", message: "Pickup was due at 08:00" });
    expect(riskOf(load())).toBeNull();
  });

  it("offers the action that resolves it, only when the API allows it", () => {
    expect(alertOf(load({ status: "pod_review", allowed_actions: ["approve_pod"] }))).toMatchObject({ title: "Proof of delivery to review", act: "pod" });
    expect(alertOf(load({ status: "pod_review", allowed_actions: [] }))).toMatchObject({ act: "" });
    expect(alertOf(load({ status: "in_transit" }))).toBeNull();
  });
});

describe("paperwork", () => {
  it("counts the three documents a load needs, and which are due", () => {
    const docs = [{ id: "d1", type: "rate_confirmation", review_status: "approved", filename: "rc.pdf" }] as never;
    const result = paperwork({ status: "delivered" }, docs);
    expect([result.have, result.need, result.tone]).toEqual([1, 3, "bad"]);
    expect(result.papers.map((paper) => paper.state)).toEqual(["Approved", "Missing", "Missing"]);
    expect(paperwork({ status: "planned" }, []).papers.map((paper) => paper.state)).toEqual(["Missing", "Due later", "Due later"]);
  });
});

describe("activity", () => {
  it("merges state changes, check calls and notes, newest first", () => {
    const entries = activity(
      load({
        events: [{ action: "dispatch", to_status: "dispatched", actor_name: "Ann", created_at: "2026-11-10T10:00:00Z", note: null }] as never,
        tracking: [{ kind: "check_call", occurred_at: "2026-11-10T12:00:00Z", city: "Joliet", state: "IL", note: null, source: "dispatcher", actor_name: "Ann" }] as never,
        notes: [{ body: "Call ahead", author_name: "Bo", created_at: "2026-11-10T11:00:00Z" }] as never,
      }),
      "UTC",
    );
    expect(entries.map((entry) => entry.what)).toEqual(["logged a check call at Joliet, IL", "added a note: “Call ahead”", "dispatched the load"]);
  });
});
