import type { ConsoleView } from "../view";

/**
 * What the address and the signed-in role decide. Nothing is required: the model has a default for each.
 * These are also the states a link can open directly (see ../routes.ts).
 */
export type ConsoleProps = {
  screen?: string;
  /** owner, ops, dispatcher, safety, accounting, fleet, platform or eqowner. */
  role?: string;
  financeAccess?: boolean;
  /** A dispatch team (A or B): the dispatcher sees only that team's trucks and loads. */
  team?: string;
  theme?: string;
  density?: string;
  sidebar?: string;
  overlay?: string;
  panel?: string;
  drawer?: string;
  loadId?: string;
  step?: string;
  preselect?: boolean;
  modal?: string;
  kind?: string;
  modalStep?: string;
  preset?: string;
  ddOpen?: string;
  listSel?: string;
  listTab?: string;
  fuelTab?: string;
  report?: string;
  ownerId?: string;
  ownerTab?: string;
  ownerRange?: string;
  ownerUnit?: string;
  portalTab?: string;
  ownerForm?: string;
  ownerFormPreset?: string;
  truckId?: string;
  stmtId?: string;
};

/** Interface state: which drawer, overlay, modal, tab, selection, sort and form values are current. */
export type ConsoleState = Record<string, unknown>;
export type ConsoleUpdate = ConsoleState | ((previous: ConsoleState) => ConsoleState);

export class ConsoleLogic {
  props: ConsoleProps;
  state: ConsoleState;
  onState: ((update: ConsoleUpdate) => void) | null;
  /** Everything the current screen renders, with the handlers bound to this instance's props and state. */
  renderVals(): ConsoleView;
}

export function stopTimers(): void;

export const ROLES: Record<string, { label: string; who: string; ini: string; email: string; fin: boolean; deny: string[] }>;
export const TEAMS: Record<string, { key: string; name: string; lead: string; trucks: string[]; tags: string[] }>;
export const LOADS: { id: string }[];
export const DRIVERS: { n: string }[];
/** Trucks as rows: the unit number first. */
export const TRUCKS: [unit: string, ...rest: string[]][];
export const OWN5: { id: string; name: string; cat: string; entity: string; status: string }[];
export const U5: Record<string, { u: string; owner: string }>;
export const PERM: Record<string, string>;
export const MODULE_OF: Record<string, string>;
export const LIST_SCREENS: string[];
