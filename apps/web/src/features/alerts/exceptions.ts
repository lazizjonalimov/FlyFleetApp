import { goTo } from "@/features/console/shell";
import type { ConsoleState } from "@/features/console/state";
import { DOCUMENT_TABS, EXPIRATION_TABS, INVOICE_TABS, LOAD_TABS, STATEMENT_TABS, tabFor, WORK_ORDER_TABS } from "@/features/lists/tabs";
import type { Tab } from "@/features/lists/use-list";
import type { Schema } from "@/lib/api/types";

/** Something that needs someone now, worked out by the API for the signed-in role: a kind and how many. */
export type Exception = Schema<"Exception_">;

const PLACES: Record<string, { screen: string; area: string; tabs: Tab[] }> = {
  loads: { screen: "loads", area: "Loads", tabs: LOAD_TABS },
  safety: { screen: "safety", area: "Compliance", tabs: EXPIRATION_TABS },
  maintenance: { screen: "maintenance", area: "Maintenance", tabs: WORK_ORDER_TABS },
  settlements: { screen: "settlements", area: "Statements", tabs: STATEMENT_TABS },
  documents: { screen: "documents", area: "Documents", tabs: DOCUMENT_TABS },
  invoices: { screen: "invoices", area: "Invoices", tabs: INVOICE_TABS },
};

/** The part of the console an exception is about. */
export const areaOf = (exception: Exception): string => PLACES[exception.resource]?.area ?? "Operations";

/** Where the records behind an exception are listed: the screen, on the tab that filters to them. */
export function placeOf(exception: Exception): ConsoleState | null {
  const place = PLACES[exception.resource];
  return place ? { ...goTo(place.screen), ltab: tabFor(place.tabs, exception.params ?? {}) } : null;
}

export const SEVERITY_TONE: Record<string, string> = { high: "bad", medium: "warn", low: "mu" };
export const SEVERITY_LABEL: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };
