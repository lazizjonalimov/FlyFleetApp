import { describe, expect, it } from "vitest";
import { hrefOf, parseLocation, sameScreenHref, staticPaths, touchesLocation } from "./routes";

const query = (text = "") => new URLSearchParams(text);

describe("reading an address", () => {
  it("names the screen of a fixed address inside the workspace", () => {
    expect(parseLocation("/acme/dashboard", query()).state.screen).toBe("dashboard");
    expect(parseLocation("/acme/finance/statements", query()).state.screen).toBe("settlements");
    expect(parseLocation("/acme/settings/alert-policy", query()).state.screen).toBe("policy");
    expect(parseLocation("/acme/settings/profile", query()).state.screen).toBe("profile");
    expect(parseLocation("/acme/settings/notifications", query()).state.screen).toBe("notify");
    expect(parseLocation("/acme/help", query()).state.screen).toBe("help");
    expect(hrefOf({ screen: "profile" }, "acme")).toBe("/acme/settings/profile");
    expect(hrefOf({ screen: "help" }, "acme")).toBe("/acme/help");
  });

  it("names the record of a record's address", () => {
    expect(parseLocation("/acme/loads/abc", query()).state).toMatchObject({ screen: "load", loadId: "abc" });
    expect(parseLocation("/acme/drivers/d1", query()).state).toMatchObject({ screen: "driver", driverId: "d1" });
    expect(parseLocation("/acme/equipment/trailers/t1", query()).state).toMatchObject({ screen: "truck", unitId: "t1", unitKind: "trailer" });
    expect(parseLocation("/acme/finance/statements/s1", query()).state).toMatchObject({ screen: "stmt", statementId: "s1" });
  });

  it("carries the open drawer and the document under review", () => {
    expect(parseLocation("/acme/loads", query("drawer=x")).state).toMatchObject({ screen: "loads", drawer: "x" });
    expect(parseLocation("/acme/documents/review", query("doc=d")).state).toMatchObject({ screen: "docreview", docId: "d" });
    expect(parseLocation("/acme/messages", query("c=m1")).state).toMatchObject({ screen: "messages", conv: "m1" });
    expect(hrefOf({ screen: "messages", conv: "m1" }, "acme")).toBe("/acme/messages?c=m1");
  });

  it("settles what another address left behind", () => {
    expect(parseLocation("/acme/customers", query()).state).toMatchObject({ drawer: null, loadId: null, driverId: null });
  });

  it("knows an address that is not the console's", () => {
    expect(parseLocation("/acme/nowhere", query()).known).toBe(false);
  });
});

describe("writing an address", () => {
  it("is the reverse of reading one", () => {
    for (const path of ["/acme/dashboard", "/acme/loads/abc", "/acme/drivers/d1", "/acme/equipment/trucks/u1", "/acme/equipment/trailers/t1", "/acme/finance/statements/s1"]) {
      expect(hrefOf(parseLocation(path, query()).state, "acme")).toBe(path);
    }
    expect(hrefOf({ screen: "loads", drawer: "x" }, "acme")).toBe("/acme/loads?drawer=x");
  });

  it("keeps the rest of the address when only the drawer changes", () => {
    expect(sameScreenHref("/acme/loads", query("q=1"), { screen: "loads", drawer: "x" })).toBe("/acme/loads?q=1&drawer=x");
    expect(sameScreenHref("/acme/loads", query("drawer=x"), { screen: "loads", drawer: null })).toBe("/acme/loads");
  });

  it("treats a change of screen or record as a move", () => {
    expect(touchesLocation({ overlay: "palette" })).toBe(false);
    expect(touchesLocation({ screen: "loads" })).toBe(true);
    expect(touchesLocation({ drawer: null })).toBe(true);
  });

  it("lists every fixed address for prefetching", () => {
    expect(staticPaths("acme")).toContain("/acme/finance/invoices");
  });
});
