import type { Me } from "@/lib/api/types";
import { humanize, initials } from "@/lib/format/text";
import { I } from "./icons";
import type { ConsoleState } from "./state";

type Can = (...anyOf: string[]) => boolean;

/**
 * The console's sections: what each is called, which icon it has, and the permission that opens it. The API
 * checks the same permissions on every request, so this only decides what is offered.
 */
const NAV: { label: string; items: [key: string, label: string, icon: keyof typeof I, anyOf: string[]][] }[] = [
  { label: "Overview", items: [["dashboard", "Dashboard", "dash", ["dashboard.read"]], ["tasks", "My tasks", "tasks", ["tasks.read"]]] },
  {
    label: "Operations",
    items: [
      ["dispatch", "Dispatch board", "dispatch", ["dispatch.read"]],
      ["loads", "Loads", "loads", ["loads.read"]],
      ["tracking", "Live fleet", "pin", ["tracking.read"]],
      ["alerts", "Fleet alerts", "alert", ["incidents.read"]],
      ["messages", "Messages", "msg", ["messages.read"]],
    ],
  },
  { label: "Directory", items: [["customers", "Customers", "building", ["customers.read"]], ["drivers", "Drivers", "user", ["drivers.read"]], ["owners", "Owners", "owner", ["owners.read"]]] },
  {
    label: "Safety & fleet",
    items: [
      ["safety", "Compliance", "shield", ["safety.read"]],
      ["inspections", "Inspections", "inspect", ["safety.read"]],
      ["documents", "Documents", "file", ["documents.read"]],
      ["trucks", "Trucks", "truck", ["equipment.read"]],
      ["trailers", "Trailers", "trailer", ["equipment.read"]],
      ["maintenance", "Maintenance", "wrench", ["maintenance.read"]],
    ],
  },
  { label: "Finance", items: [["invoices", "Invoices", "invoice", ["invoices.read"]], ["settlements", "Statements", "dollar", ["settlements.read"]], ["fuel", "Fuel & IFTA", "fuel", ["expenses.read"]]] },
  { label: "Analytics", items: [["reports", "Reports", "chart", ["reports.read"]]] },
  { label: "Administration", items: [["team", "Team & access", "team", ["users.manage"]], ["settings", "Settings", "sliders", ["organization.manage"]], ["audit", "Audit log", "history", ["audit.read"]]] },
];

/** The sections a person can choose to open on when they come to the company: the ones their role opens. */
export const startPages = (can: Can): { key: string; label: string }[] =>
  NAV.flatMap((group) => group.items).filter(([, , , anyOf]) => can(...anyOf)).map(([key, label]) => ({ key, label }));

/** The section a record's or sub-screen's address belongs to. */
const SECTION_OF: Record<string, string> = { load: "loads", newload: "loads", driver: "drivers", owner: "owners", ownerform: "owners", ownerportal: "owners", customerportal: "customers", stmt: "settlements", ostmt: "settlements", docreview: "documents", policy: "settings", teams: "team" };

/** The platform operator's area is not part of a company's workspace: no company role opens it. */
const SECTIONS: Record<string, { label: string; anyOf: string[] }> = { platform: { label: "Organizations", anyOf: ["platform.support"] } };
for (const group of NAV) for (const [key, label, , anyOf] of group.items) SECTIONS[key] = { label, anyOf };

/** What Create offers, and the permission each needs. */
const CREATE: [kind: string, title: string, sub: string, icon: keyof typeof I, anyOf: string[]][] = [
  ["load", "New load", "From a rate confirmation or by hand", "loads", ["loads.create"]],
  ["driver", "Add a driver", "Scan a CDL, type it in or import", "user", ["drivers.manage"]],
  ["truck", "Add a truck", "Scan the registration or type it in", "truck", ["equipment.manage"]],
  ["trailer", "Add a trailer", "Scan the registration or type it in", "trailer", ["equipment.manage"]],
  ["inspection", "Log an inspection", "Scan the roadside report or type it in", "inspect", ["safety.manage"]],
  ["invoice", "New invoice", "From a POD, or pick the loads yourself", "invoice", ["invoices.create"]],
  ["owner", "Add an owner", "Owner-operator, fleet owner or investor", "owner", ["owners.manage"]],
];
/** The permission needed to add each kind of record. */
export const ADD_PERMISSION: Record<string, string[]> = { ...Object.fromEntries(CREATE.map(([kind, , , , anyOf]) => [kind, anyOf])), fuel: ["expenses.manage"], mileage: ["expenses.manage"], customer: ["customers.manage"], payment: ["payments.record"], statement: ["settlements.manage"], payout: ["settlements.manage"], workorder: ["maintenance.manage"], member: ["users.manage"] };

/**
 * The account menu. Each is personal, so every role can open it: two Settings pages, the shortcuts dialog
 * (which opens over the current page rather than going anywhere), and the help center.
 */
const ACCOUNT: [title: string, icon: keyof typeof I, kbd: string, to: { screen: string } | { dialog: string }][] = [
  ["Profile & preferences", "user", "", { screen: "profile" }],
  ["Security & privacy", "shield", "", { screen: "security" }],
  ["Notification settings", "bell", "", { screen: "notify" }],
  ["Keyboard shortcuts", "kbd", "?", { dialog: "keys" }],
  ["Help & support", "help", "", { screen: "help" }],
];

/** A stable colour for a company's mark, from the design's palette. */
const MARKS = ["#E8A317", "#9B87F5", "#4FC08D", "#8DA9FB", "#F0795B", "#3FB7C4"];
export const markColor = (id: string): string => MARKS[[...id].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7) % MARKS.length]!;

/** The section of the console a screen belongs to. */
export const sectionOf = (screen: string, state: ConsoleState): string => (screen === "truck" ? (state.unitKind === "trailer" ? "trailers" : "trucks") : (SECTION_OF[screen] ?? screen));


/** What the shell draws, and the handlers its controls call. */
export type Shell = ReturnType<typeof buildShell>;

const LIST_SCREENS = ["tasks", "alerts", "customers", "drivers", "owners", "trucks", "trailers", "inspections", "documents", "invoices", "settlements", "audit"];

export type ShellInput = {
  me: Me;
  can: Can;
  state: ConsoleState;
  set: (patch: ConsoleState) => void;
  theme: "light" | "dark";
  density: "compact" | "comfortable";
  mini: boolean;
  setMini: (mini: boolean) => void;
  /** The line under the company's name in the sidebar. */
  orgSub: string;
  /** Sidebar badges, by section. */
  counts: Record<string, { n: number; hot?: boolean } | undefined>;
};

/** Moving to a section closes whatever was open on the way and starts its list afresh. */
export const goTo = (screen: string): ConsoleState => ({ screen, drawer: null, overlay: "none", panel: "none", modal: "none", lsel: [], lsort: null, dd: null, ltab: 0, lq: "", lpage: [], lf: {} });

/** Opening the add flow for a kind of record. */
/** Kinds that can be added from a document or a spreadsheet as well as by hand: they open on the choice. */
const FROM_DOCUMENT = new Set(["driver", "truck", "trailer", "load", "invoice", "inspection", "fuel"]);
export const addOf = (kind: string): ConsoleState => ({ modal: "add", kind, mstep: FROM_DOCUMENT.has(kind) ? "choose" : "manual", overlay: "none", dd: null, ddq: "", fv: {}, ferr: {} });

/** Everything the shell draws: navigation for the signed-in role, who and where, and what is open on top. */
export function buildShell({ me, can, state, set, theme, density, mini, setMini, orgSub, counts }: ShellInput) {
  const screen = typeof state.screen === "string" ? state.screen : "dashboard";
  const section = sectionOf(screen, state);
  // Alert policies sit in Settings but are read by whoever works the alerts, and changed by those allowed to.
  const required = screen === "policy" ? { label: "Fleet alert policies", anyOf: ["incidents.read", "alert_policies.manage"] } : SECTIONS[section];
  const forbidden = !!required && !can(...required.anyOf);
  const overlay = typeof state.overlay === "string" ? state.overlay : "none";
  const modal = typeof state.modal === "string" ? state.modal : "none";
  const kind = typeof state.kind === "string" ? state.kind : "driver";
  const fin = can("loads.rates.read");
  const go = (key: string) => () => set(goTo(key));
  const show = (key: string) => !forbidden && screen === key;

  const nav = NAV.map((group) => ({
    label: group.label,
    items: group.items.map(([key, label, icon, anyOf]) => {
      const locked = !can(...anyOf);
      const active = key === section;
      const count = locked ? undefined : counts[key];
      const shown = count && count.n > 0 ? String(count.n) : "";
      return {
        label,
        d: I[icon],
        count: shown,
        hot: count?.hot ? "hot" : "",
        locked,
        cls: active ? "on" : locked ? "lock" : "",
        cur: active ? ("page" as const) : undefined,
        go: go(key),
        aria: label + (shown ? `, ${shown}` : "") + (locked ? ", no access" : ""),
        tip: mini ? label : "",
      };
    }),
  }));

  const toast = state.toast as { text: string; bad?: boolean } | null | undefined;

  return {
    I,
    uid: "ff",
    screen,
    theme,
    density,
    fin,
    noFin: !fin,
    user: { ini: initials(me.user.full_name), name: me.user.full_name, role: me.organization.role_label || humanize(me.organization.role), email: me.user.email, photo: me.user.photo_url ?? null },
    org: { name: me.organization.name, sub: orgSub, ini: me.organization.code || initials(me.organization.name), c: me.organization.color || markColor(me.organization.id) },
    nav,
    sbCls: mini ? "mini" : "",
    sbLabel: mini ? "Expand sidebar" : "Collapse sidebar",
    sbIcon: mini ? I.panelR : I.panel,
    sbExp: mini ? ("false" as const) : ("true" as const),
    toggleSb: () => setMini(!mini),
    isCreate: overlay === "create",
    isAcct: overlay === "account",
    isMenu: overlay === "create" || overlay === "account",
    acctOn: overlay === "account" ? "on" : "",
    createExp: overlay === "create" ? ("true" as const) : ("false" as const),
    acctExp: overlay === "account" ? ("true" as const) : ("false" as const),
    toggleCreate: () => set({ overlay: overlay === "create" ? "none" : "create" }),
    toggleAcct: () => set({ overlay: overlay === "account" ? "none" : "account" }),
    CR: CREATE.filter(([, , , , anyOf]) => can(...anyOf)).map(([key, t, s, icon]) => ({ t, s, ic: I[icon], go: () => set(key === "owner" ? { ...goTo("ownerform"), ownerForm: "new", ownerId: null } : addOf(key)) })),
    // choosing one closes the menu: going to a screen closes every overlay, the dialog replaces the menu
    ACCT: ACCOUNT.map(([t, icon, kbd, to]) => ({ t, ic: I[icon], kbd, go: () => set("screen" in to ? goTo(to.screen) : { overlay: "none", acct: to.dialog }) })),
    openHelp: () => set(goTo("help")),
    hasModal: modal !== "none" && can(...(ADD_PERMISSION[kind] ?? [])),
    closeModal: () => set({ modal: "none" }),
    hasToast: !!toast,
    toast: toast?.text ?? "",
    toastBad: !!toast?.bad,
    closeToast: () => set({ toast: null }),
    isConsole: true,
    isForbidden: forbidden,
    FB: { mod: required?.label ?? section, perm: required?.anyOf[0] ?? "" },
    isDash: show("dashboard"),
    isDispatch: show("dispatch"),
    isLoads: show("loads"),
    isLoad: show("load"),
    isNew: show("newload"),
    isTracking: show("tracking"),
    isList: !forbidden && LIST_SCREENS.includes(screen),
    isDriver: show("driver"),
    isSafety: show("safety"),
    isDocReview: show("docreview"),
    isMaint: show("maintenance"),
    isReports: show("reports"),
    isTeam: show("team"),
    isTeams: show("teams"),
    isFuel: show("fuel"),
    isStmt: show("stmt"),
    isTruck: show("truck"),
    isSettings: show("settings") || show("policy"),
    isPolicy: show("policy"),
    isInteg: show("settings"),
    isMessages: show("messages"),
    isPalette: overlay === "palette",
    isNotif: overlay === "notifications",
    isAI: overlay === "ai",
    aiOn: overlay === "ai" ? "on" : "",
    notifOn: overlay === "notifications" ? "on" : "",
    alertCount: counts.alerts?.n ?? 0,
    goNew: () => set(goTo("newload")),
    goAlerts: go("alerts"),
    goLoads: go("loads"),
    goTracking: go("tracking"),
    goMessages: go("messages"),
    goDocs: go("documents"),
    goDrivers: go("drivers"),
    goDispatch: go("dispatch"),
    goDash: go("dashboard"),
    goAudit: go("audit"),
    goFuel: go("fuel"),
    goOwners: go("owners"),
    goReview: go("docreview"),
    goReports: go("reports"),
    openPalette: () => set({ overlay: "palette" }),
    toggleAI: () => set({ overlay: overlay === "ai" ? "none" : "ai" }),
    toggleNotif: () => set({ overlay: overlay === "notifications" ? "none" : "notifications" }),
    closeOverlay: () => set({ overlay: "none" }),
    closePanel: () => set({ panel: "none" }),
    closeDrawer: () => set({ drawer: null }),
  };
}
