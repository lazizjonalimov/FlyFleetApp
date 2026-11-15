import { describe, expect, it } from "vitest";
import { driverSlug, hrefOf, parseLocation, propsFromQuery, sameScreenHref, touchesLocation } from "@/features/console/routes";

const query = (text = "") => new URLSearchParams(text);
const DRIVERS = ["Marcus Bell", "Ana Ruiz", "Ken Ito"];

describe("the address of a screen", () => {
  it("is fixed for screens that are lists or boards", () => {
    expect(hrefOf({ screen: "dashboard" }, {}, query())).toBe("/lone-star-freight/dashboard");
    expect(hrefOf({ screen: "trucks" }, {}, query())).toBe("/lone-star-freight/equipment/trucks");
    expect(hrefOf({ screen: "settlements" }, {}, query())).toBe("/lone-star-freight/finance/statements");
    expect(hrefOf({ screen: "teams" }, {}, query())).toBe("/lone-star-freight/settings/dispatch-teams");
    expect(hrefOf({ screen: "policy" }, {}, query())).toBe("/lone-star-freight/settings/alert-policy");
  });

  it("names the record for a screen about one record", () => {
    expect(hrefOf({ screen: "load", loadId: "FF-24790" }, {}, query())).toBe("/lone-star-freight/loads/FF-24790");
    expect(hrefOf({ screen: "driver", driverName: "Ana Ruiz" }, {}, query())).toBe("/lone-star-freight/drivers/ana-ruiz");
    expect(hrefOf({ screen: "owner", ownerId: "TR" }, {}, query())).toBe("/lone-star-freight/owners/TR");
    expect(hrefOf({ screen: "truck", truckId: "T-1129" }, {}, query())).toBe("/lone-star-freight/equipment/trucks/T-1129");
    expect(hrefOf({ screen: "stmt", stmtId: "PC" }, {}, query())).toBe("/lone-star-freight/finance/statements/PC");
  });

  it("tells adding an owner from editing one, and a preview of their portal from their record", () => {
    expect(hrefOf({ screen: "ownerform", ofMode: "new", ofId: null }, {}, query())).toBe("/lone-star-freight/owners/new");
    expect(hrefOf({ screen: "ownerform", ofMode: "edit", ofId: "CT" }, {}, query())).toBe("/lone-star-freight/owners/CT/edit");
    expect(hrefOf({ screen: "ownerportal", previewOwner: "PC" }, {}, query())).toBe("/lone-star-freight/owners/PC/portal");
  });

  it("carries the open load drawer, and only on the loads list", () => {
    expect(hrefOf({ screen: "loads", drawer: "FF-24817" }, {}, query())).toBe("/lone-star-freight/loads?drawer=FF-24817");
    expect(hrefOf({ screen: "loads", drawer: null }, {}, query("drawer=FF-24817"))).toBe("/lone-star-freight/loads");
    expect(hrefOf({ screen: "dispatch", drawer: "FF-24817" }, {}, query())).toBe("/lone-star-freight/dispatch");
  });

  it("keeps who is signed in and how the console looks, and nothing else, from the address being left", () => {
    const from = query("role=dispatcher&team=A&theme=dark&density=comfortable&overlay=palette&modal=add&ownerTab=eq");
    expect(hrefOf({ screen: "loads" }, {}, from)).toBe("/lone-star-freight/loads?role=dispatcher&team=A&theme=dark&density=comfortable");
  });

  it("leaves the workspace for sign-in, the customer portal and the states reference", () => {
    expect(hrefOf({ screen: "signin" }, {}, query("role=owner"))).toBe("/login");
    expect(hrefOf({ screen: "portal" }, {}, query())).toBe("/portal");
    expect(hrefOf({ screen: "states" }, {}, query())).toBe("/states");
  });

  it("treats every platform section as the organizations list, and equipment as trucks", () => {
    expect(hrefOf({ screen: "platform3" }, {}, query())).toBe("/lone-star-freight/platform");
    expect(hrefOf({ screen: "equipment" }, {}, query())).toBe("/lone-star-freight/equipment/trucks");
  });
});

describe("a change that stays on the screen", () => {
  const at = "/lone-star-freight/loads";

  it("keeps everything the address asked for and brings the drawer up to date", () => {
    expect(sameScreenHref(at, query("role=dispatcher&preselect=true"), { screen: "loads", drawer: "FF-24855" })).toBe(`${at}?role=dispatcher&preselect=true&drawer=FF-24855`);
    expect(sameScreenHref(at, query("preselect=true&drawer=FF-24855"), { screen: "loads", drawer: "FF-24790" })).toBe(`${at}?preselect=true&drawer=FF-24790`);
    expect(sameScreenHref(at, query("preselect=true&drawer=FF-24855"), { screen: "loads", drawer: null })).toBe(`${at}?preselect=true`);
  });

  it("has no drawer on a screen without one", () => {
    expect(sameScreenHref("/lone-star-freight/owners/CT", query("ownerTab=eq&drawer=FF-1"), { screen: "owner", drawer: "FF-1" })).toBe("/lone-star-freight/owners/CT?ownerTab=eq");
  });
});

describe("reading an address", () => {
  it("recovers the screen", () => {
    expect(parseLocation("/lone-star-freight/dashboard", query()).state.screen).toBe("dashboard");
    expect(parseLocation("/lone-star-freight/finance/fuel", query()).state.screen).toBe("fuel");
    expect(parseLocation("/lone-star-freight/loads/new", query()).state.screen).toBe("newload");
    expect(parseLocation("/lone-star-freight/documents/review", query()).state.screen).toBe("docreview");
    expect(parseLocation("/login", query()).state.screen).toBe("signin");
    expect(parseLocation("/portal", query()).state.screen).toBe("portal");
  });

  it("recovers the record", () => {
    expect(parseLocation("/lone-star-freight/loads/FF-24790", query()).state).toMatchObject({ screen: "load", loadId: "FF-24790" });
    expect(parseLocation("/lone-star-freight/drivers/ana-ruiz", query(), DRIVERS).state).toMatchObject({ screen: "driver", driverName: "Ana Ruiz" });
    expect(parseLocation("/lone-star-freight/owners/TR", query()).state).toMatchObject({ screen: "owner", ownerId: "TR" });
    expect(parseLocation("/lone-star-freight/equipment/trucks/T-1129", query()).state).toMatchObject({ screen: "truck", truckId: "T-1129" });
    expect(parseLocation("/lone-star-freight/finance/statements/PC", query()).state).toMatchObject({ screen: "stmt", stmtId: "PC" });
    expect(parseLocation("/lone-star-freight/owners/PC/portal", query()).state).toMatchObject({ screen: "ownerportal", previewOwner: "PC" });
  });

  it("opens the owner form the way the address says, leaving its preset to the query", () => {
    expect(parseLocation("/lone-star-freight/owners/new", query())).toMatchObject({ state: { screen: "ownerform" }, props: { ownerForm: "new" } });
    expect(parseLocation("/lone-star-freight/owners/CT/edit", query())).toMatchObject({ state: { screen: "ownerform" }, props: { ownerForm: "edit", ownerId: "CT" } });
  });

  it("settles the drawer and the portal preview on every address, so neither is left over from the last one", () => {
    expect(parseLocation("/lone-star-freight/loads", query("drawer=FF-24817")).state.drawer).toBe("FF-24817");
    expect(parseLocation("/lone-star-freight/loads", query()).state.drawer).toBeNull();
    expect(parseLocation("/lone-star-freight/dispatch", query("drawer=FF-24817")).state.drawer).toBeNull();
    expect(parseLocation("/lone-star-freight/owners/TR", query()).state.previewOwner).toBeNull();
  });

  it("starts sign-in on the form, and an equipment owner in their portal", () => {
    expect(parseLocation("/login", query()).props.step).toBe("signin");
    expect(parseLocation("/login", query("step=org")).props.step).toBe("org");
    expect(parseLocation("/owner-portal", query())).toMatchObject({ state: { screen: "ownerportal" }, props: { role: "eqowner" } });
  });

  it("round-trips every address it can produce", () => {
    const states = [
      { screen: "dashboard" }, { screen: "tasks" }, { screen: "dispatch" }, { screen: "loads" }, { screen: "newload" }, { screen: "tracking" }, { screen: "alerts" },
      { screen: "messages" }, { screen: "customers" }, { screen: "drivers" }, { screen: "owners" }, { screen: "safety" }, { screen: "inspections" }, { screen: "documents" },
      { screen: "docreview" }, { screen: "trucks" }, { screen: "trailers" }, { screen: "maintenance" }, { screen: "invoices" }, { screen: "settlements" }, { screen: "fuel" },
      { screen: "reports" }, { screen: "team" }, { screen: "teams" }, { screen: "settings" }, { screen: "policy" }, { screen: "audit" }, { screen: "platform" },
      { screen: "load", loadId: "FF-24817" }, { screen: "driver", driverName: "Ken Ito" }, { screen: "owner", ownerId: "CT" }, { screen: "truck", truckId: "T-1102" }, { screen: "stmt", stmtId: "TR" },
    ];
    for (const state of states) {
      const [path, search = ""] = hrefOf(state, {}, query()).split("?");
      expect(parseLocation(path!, query(search), DRIVERS).state).toMatchObject(state);
    }
  });

  it("says when an address is not the console's", () => {
    expect(parseLocation("/lone-star-freight/nowhere", query()).known).toBe(false);
    expect(parseLocation("/lone-star-freight/loads/FF-1/extra", query()).known).toBe(false);
  });
});

describe("what a link may ask for", () => {
  it("is a role, a look, or a state of the screen", () => {
    expect(propsFromQuery(query("role=accounting&fuelTab=mileage&theme=dark"))).toEqual({ role: "accounting", fuelTab: "mileage", theme: "dark" });
    expect(propsFromQuery(query("financeAccess=false&preselect=true"))).toEqual({ financeAccess: false, preselect: true });
  });

  it("is nothing else", () => {
    expect(propsFromQuery(query("screen=platform&loadId=FF-1&anything=1"))).toEqual({});
  });
});

describe("a change of state", () => {
  it("is a navigation when it moves you, and not when it only changes what is open on the screen", () => {
    expect(touchesLocation({ screen: "loads", drawer: null, overlay: "none" })).toBe(true);
    expect(touchesLocation({ drawer: "FF-24817" })).toBe(true);
    expect(touchesLocation({ overlay: "palette" })).toBe(false);
    expect(touchesLocation({ ltab: 2, lsel: [] })).toBe(false);
  });
});

describe("a driver's address", () => {
  it("is their name in lower case with hyphens", () => {
    expect(driverSlug("Marcus Bell")).toBe("marcus-bell");
    expect(driverSlug("Ken Ito & Katie Walsh")).toBe("ken-ito-katie-walsh");
  });
});
