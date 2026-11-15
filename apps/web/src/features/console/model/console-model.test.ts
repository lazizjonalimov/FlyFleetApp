import { describe, expect, it } from "vitest";
import { ConsoleLogic, DRIVERS, LOADS, OWN5, ROLES, type ConsoleProps, type ConsoleState, type ConsoleUpdate } from "@/features/console/model/console-model";

/** Renders the model for an address and state, and records what its handlers ask to change. */
function render(props: ConsoleProps, state: ConsoleState = {}) {
  const changes: ConsoleState[] = [];
  const logic = new ConsoleLogic();
  logic.props = props;
  logic.state = state;
  logic.onState = (update: ConsoleUpdate) => {
    changes.push(typeof update === "function" ? update(state) : update);
  };
  return { view: logic.renderVals(), changes };
}

const navItem = (view: ReturnType<typeof render>["view"], label: string) => view.nav.flatMap((group) => group.items).find((item) => item.label === label)!;

describe("what a role may open", () => {
  it("is everything but the platform for the operations manager, the default sign-in", () => {
    const { view } = render({ screen: "invoices" });
    expect(view.user).toMatchObject({ name: "Dana Kim", role: "Operations Manager" });
    expect(view.isForbidden).toBe(false);
    expect(view.isList).toBe(true);
    expect(render({ screen: "platform" }).view.isForbidden).toBe(true);
  });

  it("excludes money and administration for a dispatcher, and says which permission is missing", () => {
    const { view } = render({ screen: "invoices", role: "dispatcher" });
    expect(view.isForbidden).toBe(true);
    expect(view.isList).toBe(false);
    expect(view.FB).toEqual({ mod: "Invoices", perm: "finance.invoices.read" });
    // the section being refused stays marked as current; the others he can't open are shown locked
    expect(navItem(view, "Invoices")).toMatchObject({ locked: true, cls: "on" });
    expect(navItem(view, "Statements")).toMatchObject({ locked: true, cls: "lock", count: "" });
    expect(navItem(view, "Loads").locked).toBe(false);
  });

  it("follows the module for a record's screen: a load belongs to loads, a statement to statements", () => {
    expect(render({ screen: "stmt", role: "dispatcher" }).view.isForbidden).toBe(true);
    expect(render({ screen: "load", role: "dispatcher" }).view.isForbidden).toBe(false);
    expect(render({ screen: "truck", role: "accounting" }).view.isForbidden).toBe(false);
    expect(render({ screen: "dispatch", role: "accounting" }).view.isForbidden).toBe(true);
  });

  it("keeps rates from roles without finance access", () => {
    expect(render({ screen: "loads" }).view.fin).toBe(true);
    expect(render({ screen: "loads", role: "dispatcher" }).view).toMatchObject({ fin: false, noFin: true });
    expect(render({ screen: "loads", financeAccess: false }).view.user.role).toBe("Dispatcher");
  });

  it("gives the platform operator the platform's own navigation and organization", () => {
    const { view } = render({ screen: "platform", role: "platform" });
    expect(view.org.name).toBe("FlyFleet Platform");
    expect(view.nav.map((group) => group.label)).toEqual(["Platform"]);
    expect(view.isForbidden).toBe(false);
  });

  it("shows an equipment owner their portal whatever address they ask for", () => {
    for (const screen of ["dashboard", "loads", "invoices"]) {
      const { view } = render({ screen, role: "eqowner" });
      expect(view).toMatchObject({ isConsole: false, isOPortal: true, isForbidden: false });
    }
  });

  it("has a named person behind every role", () => {
    for (const role of Object.values(ROLES)) expect(role.who).not.toBe("");
  });
});

describe("a dispatch team's scope", () => {
  it("limits a dispatcher to the team's trucks and says so in the top bar", () => {
    const { view } = render({ screen: "dispatch", role: "dispatcher", team: "A" });
    expect(view.SC).toMatchObject({ on: true, label: "Team A · 14 trucks", preview: false });
    expect(render({ screen: "dispatch", role: "dispatcher" }).view.SC.on).toBe(false);
  });

  it("applies only to dispatchers", () => {
    expect(render({ screen: "dispatch", role: "owner", team: "A" }).view.SC.on).toBe(false);
  });

  it("can be previewed by an administrator, as the team's lead dispatcher", () => {
    const { view } = render({ screen: "dispatch", role: "owner" }, { preview: "A" });
    expect(view.SC).toMatchObject({ on: true, preview: true });
    expect(view.user.name).toBe("Jordan Lee");
  });
});

describe("navigation", () => {
  it("marks the current section, including from one of its records", () => {
    expect(navItem(render({ screen: "loads" }).view, "Loads")).toMatchObject({ cls: "on", cur: "page" });
    expect(navItem(render({ screen: "load" }).view, "Loads").cls).toBe("on");
    expect(navItem(render({ screen: "owner" }).view, "Owners").cls).toBe("on");
    expect(navItem(render({ screen: "teams" }).view, "Team & access").cls).toBe("on");
  });

  it("moves to a section and closes whatever was open on the way", () => {
    const { view, changes } = render({ screen: "dashboard" }, { overlay: "palette", drawer: "FF-24817" });
    navItem(view, "Dispatch board").go();
    expect(changes).toEqual([{ screen: "dispatch", drawer: null, overlay: "none", panel: "none", modal: "none", lsel: [], lsort: null, dd: null, ltab: 0, lq: "" }]);
  });

  it("opens a load in the drawer from anywhere, and as a page from the drawer", () => {
    const dashboard = render({ screen: "dashboard" });
    dashboard.view.D.attn[0]!.go();
    expect(dashboard.changes[0]).toMatchObject({ screen: "loads", drawer: "FF-24817" });

    const drawer = render({ screen: "loads" }, { drawer: "FF-24817" });
    expect(drawer.view.hasDrawer).toBe(true);
    drawer.view.DL.full!();
    expect(drawer.changes[0]).toMatchObject({ screen: "load", loadId: "FF-24817", drawer: null });
  });

  it("signs out to the sign-in form", () => {
    const { view, changes } = render({ screen: "dashboard" });
    view.goSignin();
    expect(changes[0]).toMatchObject({ screen: "signin", step: "signin" });
  });
});

describe("overlays", () => {
  it("are one at a time and toggle", () => {
    const closed = render({ screen: "dashboard" });
    expect(closed.view).toMatchObject({ isPalette: false, isNotif: false, isAI: false, isCreate: false, isAcct: false });
    closed.view.toggleNotif();
    expect(closed.changes[0]).toEqual({ overlay: "notifications" });

    const open = render({ screen: "dashboard" }, { overlay: "notifications" });
    expect(open.view).toMatchObject({ isNotif: true, isPalette: false });
    open.view.toggleNotif();
    expect(open.changes[0]).toEqual({ overlay: "none" });
  });

  it("offer in Create only what the role may add", () => {
    const all = render({ screen: "dashboard", role: "owner" }, { overlay: "create" }).view.CR.map((item) => item.t);
    const dispatcher = render({ screen: "dashboard", role: "dispatcher" }, { overlay: "create" }).view.CR.map((item) => item.t);
    expect(all).toContain("New invoice");
    expect(dispatcher).not.toContain("New invoice");
    expect(dispatcher).toContain("New load");
  });
});

describe("the workspace", () => {
  it("has the records the addresses name", () => {
    expect(LOADS.map((load) => load.id)).toContain("FF-24817");
    expect(DRIVERS.map((driver) => driver.n)).toContain("Marcus Bell");
    expect(OWN5.map((owner) => owner.id)).toEqual(["LSF", "TR", "LO", "JH", "CT", "PC", "AR", "MB", "KL"]);
  });

  it("renders every screen for every role without failing", () => {
    const screens = ["dashboard", "tasks", "dispatch", "loads", "load", "newload", "tracking", "alerts", "messages", "customers", "drivers", "driver", "trucks", "trailers", "safety", "documents", "docreview", "inspections", "maintenance", "invoices", "settlements", "fuel", "reports", "team", "teams", "settings", "policy", "audit", "platform", "signin", "portal", "states", "owners", "owner", "ownerportal", "ownerform", "stmt", "truck"];
    for (const role of Object.keys(ROLES)) for (const screen of screens) expect(() => render({ screen, role })).not.toThrow();
  });

  it("lets an individual owner be changed to a business while editing", () => {
    // the form reads the business contact, which an individual does not have
    const edit = render({ screen: "ownerform", ownerForm: "edit", ownerId: "TR", role: "owner" });
    edit.view.OF.ent[1]!.go();
    const [change] = edit.changes;
    expect(() => render({ screen: "ownerform", ownerForm: "edit", ownerId: "TR", role: "owner" }, change)).not.toThrow();
  });
});
