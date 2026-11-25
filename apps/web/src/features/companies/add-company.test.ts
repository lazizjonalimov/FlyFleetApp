import { describe, expect, it } from "vitest";
import { emailsIn, initialsOf, SWATCHES } from "./add-company";

describe("adding a company", () => {
  it("makes the mark from the name's initials, as the API does", () => {
    expect(initialsOf("Bravo Freight Lines")).toBe("BFL");
    expect(initialsOf("The Acme Trucking Co LLC")).toBe("AT");
    expect(initialsOf("Northwind")).toBe("NOR");
    expect(initialsOf("One Two Three Four Five")).toBe("OTTF");
  });

  it("reads teammates' emails and points out the ones that aren't", () => {
    expect(emailsIn("a@x.com, B@x.com\nnope a@x.com")).toEqual({ valid: ["a@x.com", "b@x.com"], invalid: ["nope"] });
    expect(emailsIn("  ")).toEqual({ valid: [], invalid: [] });
  });

  it("offers eight named colours", () => {
    expect(SWATCHES).toHaveLength(8);
    expect(new Set(SWATCHES.map(([, name]) => name)).size).toBe(8);
  });
});
