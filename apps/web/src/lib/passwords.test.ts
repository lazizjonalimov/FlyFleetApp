import { describe, expect, it } from "vitest";
import { rules, strength } from "./passwords";

describe("password rules", () => {
  it("lists what a new password still needs", () => {
    const met = (pw: string, current?: string) => Object.fromEntries(rules(pw, current).map((r) => [r.key, r.met]));
    expect(met("short")).toEqual({ length: false, case: false, number: false, different: true });
    expect(met("Fresh-Password-2031")).toEqual({ length: true, case: true, number: true, different: true });
    expect(met("Fresh-Password-2031", "Fresh-Password-2031").different).toBe(false);
  });

  it("rates strength the way the API does", () => {
    expect(strength("")).toBe(0);
    expect(strength("abcdefgh")).toBe(1);
    expect(strength("Abcdefghijk1")).toBe(2);
    expect(strength("Correct-Horse-9")).toBe(3);
  });
});
