import { describe, expect, it } from "vitest";
import type { Me } from "@/lib/api/types";
import { buildShell, goTo } from "./shell";

const me = (role: string): Me => ({
  user: { id: "u1", email: "olive@example.com", full_name: "Olive Owner" },
  organization: { id: "o1", name: "Acme Trucking", slug: "acme", role, role_label: role === "owner" ? "Main Admin" : role, status: "active", timezone: "America/Chicago", base_currency: "USD" },
  account: { id: "a1", name: "Acme Trucking", is_owner: true, max_companies: 10 },
  memberships: [],
  permissions: [],
}) as unknown as Me;

function shell(role: string, permissions: string[], state: Record<string, unknown> = { screen: "dashboard" }) {
  const changes: Record<string, unknown>[] = [];
  const view = buildShell({ me: me(role), can: (...anyOf) => anyOf.some((p) => permissions.includes(p)), state, set: (patch) => changes.push(patch), theme: "light", density: "compact", mini: false, setMini: () => {}, orgSub: "", counts: {} });
  return { view, changes };
}
const item = (view: ReturnType<typeof shell>["view"], label: string) => view.nav.flatMap((group) => group.items).find((each) => each.label === label)!;

describe("navigation for a role", () => {
  it("locks the sections the role's permissions don't open", () => {
    const { view } = shell("safety_manager", ["dashboard.read", "safety.read", "drivers.read"]);
    expect(item(view, "Compliance").locked).toBe(false);
    expect(item(view, "Invoices")).toMatchObject({ locked: true, cls: "lock", aria: "Invoices, no access" });
  });

  it("marks the current section, including from one of its records", () => {
    expect(item(shell("owner", ["loads.read"], { screen: "load" }).view, "Loads")).toMatchObject({ cls: "on", cur: "page" });
    expect(item(shell("owner", ["equipment.read"], { screen: "truck", unitKind: "trailer" }).view, "Trailers").cls).toBe("on");
  });

  it("shows the forbidden screen, naming the permission, for a section the role can't open", () => {
    const { view } = shell("dispatcher", ["loads.read"], { screen: "invoices" });
    expect(view.isForbidden).toBe(true);
    expect(view.FB).toEqual({ mod: "Invoices", perm: "invoices.read" });
    expect(view.isList).toBe(false);
  });

  it("moves to a section and closes whatever was open on the way", () => {
    const { view, changes } = shell("owner", ["dispatch.read"], { screen: "dashboard", overlay: "palette" });
    item(view, "Dispatch board").go();
    expect(changes).toEqual([goTo("dispatch")]);
  });

  it("offers in Create only what the role may add", () => {
    expect(shell("safety_manager", ["safety.manage", "drivers.manage"]).view.CR.map((entry) => entry.t)).toEqual(["Add a driver", "Log an inspection"]);
  });

  it("names who is signed in from the session", () => {
    expect(shell("owner", []).view.user).toEqual({ ini: "OO", name: "Olive Owner", role: "Main Admin", email: "olive@example.com" });
  });
});

describe("the account menu", () => {
  const entry = (view: ReturnType<typeof shell>["view"], title: string) => view.ACCT.find((each) => each.t === title)!;

  it("opens personal pages for every role, even one with no Settings access", () => {
    for (const [title, screen] of [["Profile & preferences", "profile"], ["Security & privacy", "security"], ["Notification settings", "notify"], ["Help & support", "help"]]) {
      const { view, changes } = shell("dispatcher", ["dispatch.read"], { screen: "dispatch", overlay: "account" });
      entry(view, title).go();
      expect(changes).toEqual([goTo(screen)]);
      expect(changes[0]!.overlay).toBe("none");
      expect(shell("dispatcher", ["dispatch.read"], { screen }).view.isForbidden).toBe(false);
    }
  });

  it("lists Security & privacy right after Profile & preferences", () => {
    expect(shell("viewer", []).view.ACCT.map((each) => each.t)).toEqual(["Profile & preferences", "Security & privacy", "Notification settings", "Keyboard shortcuts", "Help & support"]);
  });

  it("opens keyboard shortcuts as a dialog over the current page, closing the menu", () => {
    const { view, changes } = shell("accountant", ["invoices.read"], { screen: "invoices", overlay: "account" });
    entry(view, "Keyboard shortcuts").go();
    expect(changes).toEqual([{ overlay: "none", acct: "keys" }]);
  });

  it("sends the top bar's help button to the help center", () => {
    const { view, changes } = shell("viewer", []);
    view.openHelp();
    expect(changes).toEqual([goTo("help")]);
  });
});
