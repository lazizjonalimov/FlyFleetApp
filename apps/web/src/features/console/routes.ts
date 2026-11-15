import type { ConsoleProps, ConsoleState } from "./model/console-model";

/** The workspace every console address is in. */
export const ORG_SLUG = "lone-star-freight";

/** Screens that live at a fixed address inside the workspace. */
const PATHS: Record<string, string> = {
  dashboard: "dashboard",
  tasks: "tasks",
  dispatch: "dispatch",
  loads: "loads",
  newload: "loads/new",
  tracking: "tracking",
  alerts: "alerts",
  messages: "messages",
  customers: "customers",
  drivers: "drivers",
  owners: "owners",
  safety: "safety",
  inspections: "inspections",
  documents: "documents",
  docreview: "documents/review",
  trucks: "equipment/trucks",
  trailers: "equipment/trailers",
  maintenance: "maintenance",
  invoices: "finance/invoices",
  settlements: "finance/statements",
  fuel: "finance/fuel",
  reports: "reports",
  team: "settings/team",
  teams: "settings/dispatch-teams",
  settings: "settings/integrations",
  policy: "settings/alert-policy",
  audit: "settings/audit-log",
  platform: "platform",
};
const SCREENS: Record<string, string> = Object.fromEntries(Object.entries(PATHS).map(([screen, path]) => [path, screen]));

/** Surfaces outside the workspace. */
const SURFACES: Record<string, string> = { signin: "/login", portal: "/portal", states: "/states" };

/** Who is signed in and how the console looks: carried along from address to address. */
const STICKY = ["role", "team", "financeAccess", "theme", "density", "sidebar"] as const;

/** States a link may open directly, by the name the model knows them under. */
const QUERY_PROPS = [
  "role", "team", "theme", "density", "sidebar", "overlay", "panel", "step", "modal", "kind", "modalStep", "preset", "ddOpen", "listSel", "listTab",
  "fuelTab", "report", "ownerId", "ownerTab", "ownerRange", "ownerUnit", "portalTab", "ownerFormPreset",
] as const;

export const driverSlug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Query = { get(name: string): string | null };

export function propsFromQuery(query: Query): ConsoleProps {
  const props: Record<string, string | boolean> = {};
  for (const name of QUERY_PROPS) {
    const value = query.get(name);
    if (value !== null && value !== "") props[name] = value;
  }
  const finance = query.get("financeAccess");
  if (finance !== null) props.financeAccess = finance !== "false";
  if (query.get("preselect") === "true") props.preselect = true;
  return props;
}

export type Location = {
  /** False when the address is not one of the console's. */
  known: boolean;
  /** What the address says the state is. It wins over anything remembered from before. */
  state: ConsoleState;
  props: ConsoleProps;
};

/**
 * Reads an address. `drivers` is the list of driver names, to turn a driver's address back into the name the
 * model keys drivers by.
 */
export function parseLocation(pathname: string, query: Query, drivers: readonly string[] = []): Location {
  const parts = pathname.split("/").filter(Boolean);
  // every address settles these, so nothing remembered from another screen leaks in
  const base = { drawer: null, previewOwner: null, ofMode: undefined, ofId: undefined };
  const at = (screen: string, state: ConsoleState = {}, props: ConsoleProps = {}): Location => ({ known: true, state: { ...base, screen, ...state }, props });

  if (parts.length === 1) {
    if (parts[0] === "login") return at("signin", {}, { step: query.get("step") ?? "signin" });
    if (parts[0] === "portal") return at("portal");
    if (parts[0] === "states") return at("states");
    // an equipment owner's own sign-in: the portal, and only for the equipment they own
    if (parts[0] === "owner-portal") return at("ownerportal", {}, { role: "eqowner" });
  }

  const path = parts.slice(1).join("/");
  const screen = SCREENS[path];
  if (screen === "loads") return at("loads", { drawer: query.get("drawer") || null });
  if (screen) return at(screen);

  const [a, b, c, d] = parts.slice(1);
  if (a === "loads" && b && !c) return at("load", { loadId: b });
  if (a === "drivers" && b && !c) return at("driver", { driverName: drivers.find((name) => driverSlug(name) === b) ?? b });
  if (a === "owners" && b === "new" && !c) return at("ownerform", {}, { ownerForm: "new" });
  if (a === "owners" && b && !c) return at("owner", { ownerId: b });
  if (a === "owners" && b && c === "edit" && !d) return at("ownerform", {}, { ownerForm: "edit", ownerId: b });
  if (a === "owners" && b && c === "portal" && !d) return at("ownerportal", { previewOwner: b });
  if (a === "equipment" && b === "trucks" && c && !d) return at("truck", { truckId: c });
  if (a === "finance" && b === "statements" && c && !d) return at("stmt", { stmtId: c });
  return { known: false, state: { ...base, screen: "dashboard" }, props: {} };
}

/** State that the address carries. A change to any of these is a navigation. */
const LOCATION_KEYS = ["screen", "drawer", "loadId", "driverName", "ownerId", "truckId", "stmtId", "ofMode", "ofId", "previewOwner"];
export const touchesLocation = (patch: ConsoleState): boolean => LOCATION_KEYS.some((key) => key in patch);

const text = (value: unknown, fallback: string): string => (typeof value === "string" && value ? value : fallback);

/** The address of a state. `current` is the query of the address being left, for what is carried along. */
export function hrefOf(state: ConsoleState, props: ConsoleProps, current: Query): string {
  let screen = text(state.screen, props.screen ?? "dashboard");
  if (screen.startsWith("platform")) screen = "platform";
  if (screen === "equipment") screen = "trucks";

  if (screen in SURFACES) return SURFACES[screen]!;

  const query = new URLSearchParams();
  for (const name of STICKY) {
    const value = current.get(name);
    if (value !== null && value !== "") query.set(name, value);
  }

  let path: string;
  switch (screen) {
    case "load":
      path = `loads/${encodeURIComponent(text(state.loadId, props.loadId ?? "FF-24817"))}`;
      break;
    case "driver":
      path = `drivers/${driverSlug(text(state.driverName, "Marcus Bell"))}`;
      break;
    case "owner":
      path = `owners/${encodeURIComponent(text(state.ownerId, props.ownerId ?? "CT"))}`;
      break;
    case "ownerform": {
      const mode = text(state.ofMode, props.ownerForm ?? "new");
      const id = text(state.ofId, mode === "edit" ? (props.ownerId ?? "CT") : "");
      path = mode === "edit" && id ? `owners/${encodeURIComponent(id)}/edit` : "owners/new";
      break;
    }
    case "ownerportal":
      path = `owners/${encodeURIComponent(text(state.previewOwner, text(state.ownerId, props.ownerId ?? "CT")))}/portal`;
      break;
    case "truck":
      path = `equipment/trucks/${encodeURIComponent(text(state.truckId, props.truckId ?? "T-1102"))}`;
      break;
    case "stmt":
      path = `finance/statements/${encodeURIComponent(text(state.stmtId, props.stmtId ?? "TR"))}`;
      break;
    default:
      path = PATHS[screen] ?? "dashboard";
  }
  if (screen === "loads" && typeof state.drawer === "string" && state.drawer) query.set("drawer", state.drawer);

  const search = query.toString();
  return `/${ORG_SLUG}/${path}${search ? `?${search}` : ""}`;
}

/**
 * The address after a change that stays on the same screen. Unlike a move to another screen, everything the
 * current address asks for is kept; only the open drawer is brought up to date.
 */
export function sameScreenHref(pathname: string, current: URLSearchParams, state: ConsoleState): string {
  const query = new URLSearchParams(current);
  if (state.screen === "loads" && typeof state.drawer === "string" && state.drawer) query.set("drawer", state.drawer);
  else query.delete("drawer");
  const search = query.toString();
  return `${pathname}${search ? `?${search}` : ""}`;
}

/** Fixed addresses, for prefetching what the sidebar leads to. */
export const STATIC_PATHS: string[] = Object.values(PATHS).map((path) => `/${ORG_SLUG}/${path}`);
