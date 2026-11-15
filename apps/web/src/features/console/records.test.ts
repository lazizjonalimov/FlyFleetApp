import { afterAll, describe, expect, it } from "vitest";
import { ConsoleLogic, DRIVERS, stopTimers, type ConsoleProps, type ConsoleState, type ConsoleUpdate } from "./model/console-model";
import { LOAD_IDS, OUTSIDE_OWNER_IDS, OWNER_IDS, RECORD_PATHS, STATEMENT_IDS, UNIT_IDS } from "./records";
import { hrefOf, ORG_SLUG, STATIC_PATHS, touchesLocation } from "./routes";

afterAll(stopTimers);

/** Every address the application serves. */
const ADDRESSES = new Set([...STATIC_PATHS, ...RECORD_PATHS, `/${ORG_SLUG}/owners/new`, "/login", "/portal", "/states"]);

const event = { target: { value: "te", checked: true }, currentTarget: { value: "te", checked: true }, key: "Enter", stopPropagation() {}, preventDefault() {} };

/** Every handler in a view, by where it is. Icons are skipped: they are path data, not controls. */
function handlers(view: unknown): [path: string, handler: (event: unknown) => void][] {
  const found: [string, (event: unknown) => void][] = [];
  const seen = new Set<object>();
  const walk = (value: unknown, path: string) => {
    if (typeof value === "function") found.push([path, value as (event: unknown) => void]);
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) if (key !== "I") walk(child, path ? `${path}.${key}` : key);
  };
  walk(view, "");
  return found;
}

/** Where each control of a state leads, when it leads somewhere that is not served. */
function deadEnds(props: ConsoleProps, state: ConsoleState = {}): string[] {
  const changes: ConsoleState[] = [];
  const logic = new ConsoleLogic();
  logic.props = props;
  logic.state = state;
  logic.onState = (update: ConsoleUpdate) => {
    changes.push(typeof update === "function" ? update(state) : update);
  };
  const view = logic.renderVals();
  const missing: string[] = [];
  for (const [path, handler] of handlers(view)) {
    // an owner with no settlement yet has no button for it
    if (path === "OW.openStmt" && !view.OW.hasStmt) continue;
    const before = changes.length;
    try {
      handler(event);
    } catch {
      continue; // wants a real event; nothing to follow
    }
    for (const change of changes.slice(before)) {
      if (!touchesLocation(change)) continue;
      const address = hrefOf({ ...state, ...change }, props, new URLSearchParams()).split("?")[0]!;
      if (!ADDRESSES.has(address)) missing.push(`${JSON.stringify(props)} ${path} → ${address}`);
    }
  }
  return missing;
}

const SCREENS = ["dashboard", "tasks", "dispatch", "loads", "newload", "tracking", "alerts", "messages", "customers", "drivers", "trucks", "trailers", "safety", "documents", "docreview", "inspections", "maintenance", "invoices", "settlements", "fuel", "reports", "team", "teams", "settings", "policy", "audit", "owners", "ownerform", "signin", "portal", "states"];

describe("every control leads to a page that exists", () => {
  it("from each section, for each role that sees different records", () => {
    const missing = SCREENS.flatMap((screen) => [...deadEnds({ screen, role: "owner" }), ...deadEnds({ screen, role: "dispatcher", team: "A" })]);
    expect([...missing, ...deadEnds({ screen: "platform", role: "platform" })]).toEqual([]);
  });

  it("from the tabs of each list", () => {
    const lists = ["tasks", "alerts", "customers", "drivers", "owners", "trucks", "trailers", "inspections", "documents", "invoices", "settlements", "audit"];
    const tabs = ["1", "2", "3", "4", "5", "6", "7"];
    expect(lists.flatMap((screen) => tabs.flatMap((listTab) => deadEnds({ screen, listTab, role: "owner" })))).toEqual([]);
  });

  it("from each load, in the drawer and on its page", () => {
    expect(LOAD_IDS.flatMap((id) => [...deadEnds({ screen: "loads", drawer: id }), ...deadEnds({ screen: "load", loadId: id })])).toEqual([]);
  });

  it("from each driver's profile", () => {
    expect(DRIVERS.flatMap((driver) => deadEnds({ screen: "driver", role: "owner" }, { driverName: driver.n }))).toEqual([]);
  });

  it("from each owner's record, tab by tab, and from their form", () => {
    const tabs = ["ov", "eq", "live", "loads", "fuel", "stmt", "mt", "docs", "acc"];
    expect(OWNER_IDS.flatMap((ownerId) => tabs.flatMap((ownerTab) => deadEnds({ screen: "owner", ownerId, ownerTab, role: "owner" })))).toEqual([]);
    expect(OUTSIDE_OWNER_IDS.flatMap((ownerId) => deadEnds({ screen: "ownerform", ownerForm: "edit", ownerId, role: "owner" }))).toEqual([]);
  });

  it("from each owner's portal, as they see it and as a preview", () => {
    const tabs = ["ov", "eq", "loads", "stmt", "exp", "mt", "docs"];
    expect(OUTSIDE_OWNER_IDS.flatMap((ownerId) => tabs.flatMap((portalTab) => deadEnds({ role: "eqowner", ownerId, portalTab })))).toEqual([]);
    expect(OUTSIDE_OWNER_IDS.flatMap((id) => deadEnds({ screen: "ownerportal", role: "owner" }, { previewOwner: id }))).toEqual([]);
  });

  it("from each settlement, where trailers are listed with the trucks", () => {
    expect(STATEMENT_IDS.flatMap((stmtId) => deadEnds({ screen: "stmt", stmtId, role: "owner" }))).toEqual([]);
  });

  it("from each unit's record, trailers included", () => {
    expect(UNIT_IDS).toEqual(expect.arrayContaining(["T-1102", "TR-5341"]));
    expect(UNIT_IDS.flatMap((truckId) => deadEnds({ screen: "truck", truckId, role: "owner" }))).toEqual([]);
  });
});
