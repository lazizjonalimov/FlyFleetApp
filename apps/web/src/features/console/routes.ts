import type { ConsoleState } from "./state";

/** Screens that live at a fixed address inside a company's workspace. */
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

type Query = { get(name: string): string | null };

export type Location = {
  /** False when the address is not one of the console's. */
  known: boolean;
  /** What the address says the state is. It wins over anything remembered from before. */
  state: ConsoleState;
};

/** Reads an address inside a workspace: which screen, which record, which drawer. */
export function parseLocation(pathname: string, query: Query): Location {
  const parts = pathname.split("/").filter(Boolean);
  // every address settles these, so nothing remembered from another screen leaks in
  const base = { drawer: null, loadId: null, driverId: null, unitId: null, statementId: null, docId: null };
  const at = (screen: string, state: ConsoleState = {}): Location => ({ known: true, state: { ...base, screen, ...state } });

  const path = parts.slice(1).join("/");
  const screen = SCREENS[path];
  if (screen === "loads") return at("loads", { drawer: query.get("drawer") || null });
  if (screen === "docreview") return at("docreview", { docId: query.get("doc") || null });
  if (screen) return at(screen);

  const [a, b, c, d] = parts.slice(1);
  if (a === "loads" && b && !c) return at("load", { loadId: b });
  if (a === "drivers" && b && !c) return at("driver", { driverId: b });
  if (a === "equipment" && (b === "trucks" || b === "trailers") && c && !d) return at("truck", { unitId: c, unitKind: b === "trucks" ? "truck" : "trailer" });
  if (a === "finance" && b === "statements" && c && !d) return at("stmt", { statementId: c });
  return { known: false, state: { ...base, screen: "dashboard" } };
}

/** State that the address carries. A change to any of these is a navigation. */
const LOCATION_KEYS = ["screen", "drawer", "loadId", "driverId", "unitId", "statementId", "docId"];
export const touchesLocation = (patch: ConsoleState): boolean => LOCATION_KEYS.some((key) => key in patch);

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** The address of a state inside the workspace `slug`. */
export function hrefOf(state: ConsoleState, slug: string): string {
  const screen = text(state.screen) || "dashboard";
  let path = PATHS[screen] ?? "dashboard";
  if (screen === "load" && text(state.loadId)) path = `loads/${encodeURIComponent(text(state.loadId))}`;
  if (screen === "driver" && text(state.driverId)) path = `drivers/${encodeURIComponent(text(state.driverId))}`;
  if (screen === "truck" && text(state.unitId)) path = `equipment/${state.unitKind === "trailer" ? "trailers" : "trucks"}/${encodeURIComponent(text(state.unitId))}`;
  if (screen === "stmt" && text(state.statementId)) path = `finance/statements/${encodeURIComponent(text(state.statementId))}`;
  const query = screen === "loads" && text(state.drawer) ? `?drawer=${encodeURIComponent(text(state.drawer))}` : screen === "docreview" && text(state.docId) ? `?doc=${encodeURIComponent(text(state.docId))}` : "";
  return `/${slug}/${path}${query}`;
}

/**
 * The address after a change that stays on the same screen. Everything the current address asks for is kept;
 * only the open drawer is brought up to date.
 */
export function sameScreenHref(pathname: string, current: URLSearchParams, state: ConsoleState): string {
  const query = new URLSearchParams(current);
  if (state.screen === "loads" && typeof state.drawer === "string" && state.drawer) query.set("drawer", state.drawer);
  else query.delete("drawer");
  if (state.screen === "docreview" && typeof state.docId === "string" && state.docId) query.set("doc", state.docId);
  else query.delete("doc");
  const search = query.toString();
  return `${pathname}${search ? `?${search}` : ""}`;
}

/** Fixed addresses inside a workspace, for prefetching what the sidebar leads to. */
export const staticPaths = (slug: string): string[] => Object.values(PATHS).map((path) => `/${slug}/${path}`);
