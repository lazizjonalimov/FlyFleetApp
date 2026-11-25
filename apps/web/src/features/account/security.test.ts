import { describe, expect, it } from "vitest";
import { SETTINGS_NAV } from "@/features/administration/settings-frame";
import { ago } from "./security-screen";

describe("Security & privacy", () => {
  it("sits under You, directly below Profile & preferences, open to every role", () => {
    const you = SETTINGS_NAV.find((group) => group.label === "You")!;
    expect(you.items.map((item) => item.label)).toEqual(["Profile & preferences", "Security & privacy", "Notifications"]);
    expect(you.items.every((item) => !item.anyOf)).toBe(true);
  });

  it("says how long ago the password was changed", () => {
    const now = new Date("2026-02-14T12:00:00Z");
    expect(ago("2025-09-12T12:00:00Z", now)).toBe("5 months ago");
    expect(ago("2026-02-11T12:00:00Z", now)).toBe("3 days ago");
    expect(ago("2026-02-14T08:00:00Z", now)).toBe("today");
  });
});
