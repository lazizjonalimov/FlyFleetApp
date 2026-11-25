import { describe, expect, it } from "vitest";
import { ALERT_TYPES, flip } from "./notifications-screen";

const type = (key: string) => ALERT_TYPES.find((each) => each.key === key)!;

describe("a cell of the notifications grid", () => {
  it("turns a channel on and off for one alert type only", () => {
    const on = flip({}, [], type("loads_late"), "email");
    expect(on.choices).toEqual({ loads_late: ["in_app", "email"] });
    expect(flip(on.choices, [], type("loads_late"), "email").choices).toEqual({ loads_late: ["in_app"] });
  });

  it("makes In app decide what the bell shows", () => {
    const off = flip({}, ["INVOICES_OVERDUE"], type("documents"), "in_app");
    expect(off.muted).toEqual(["INVOICES_OVERDUE", "DOCUMENTS_TO_REVIEW", "POD_REVIEW"]);
    const back = flip(off.choices, off.muted, type("documents"), "in_app");
    expect(back.muted).toEqual(["INVOICES_OVERDUE"]);
    expect(back.choices.documents).toEqual(["in_app"]);
  });

  it("leaves the bell alone for other channels", () => {
    const muted = ["EXPIRING_SOON"];
    expect(flip({}, muted, type("compliance"), "push").muted).toBe(muted);
  });
});
