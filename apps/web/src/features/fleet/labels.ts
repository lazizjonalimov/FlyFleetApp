import { cell } from "@/components/data-table/cell";
import type { Cell } from "@/features/console/view";
import type { Schema } from "@/lib/api/types";
import { formatDate } from "@/lib/format/dates";
import { humanize } from "@/lib/format/text";

type Compliance = Schema<"Compliance">;
type LoadBrief = { id: string; load_number: string; status: string } | null | undefined;

/** A load's lifecycle state, as the design system names its tones. */
export const loadTone = (status: string): string => ({ at_pickup: "atpickup", in_transit: "transit", at_delivery: "atdelivery", pod_review: "podreview", on_hold: "hold" })[status] ?? status;
export const loadLabel = (status: string): string => (status === "pod_review" ? "POD review" : humanize(status));

const TONE = { ok: "ok", expiring: "warn", expired: "bad", incomplete: "info" } as const;

/** Whether a driver or unit may be dispatched, and the first thing in the way when it may not. */
export function complianceCell(compliance: Compliance | null | undefined, clear = "Qualified"): Cell {
  if (!compliance) return cell.maybe(null);
  const tone = TONE[compliance.status as keyof typeof TONE] ?? "mu";
  const dots = compliance.issues.length ? compliance.issues.map((issue) => (issue.severity === "blocking" ? "bad" : "warn")) : ["ok"];
  return cell.dots(compliance.issues[0]?.message ?? clear, dots, tone);
}

/** A driver's or unit's working state: on a load, free, or out of use. */
export function workCell(status: string, load: LoadBrief, labels: { free: string; busy: string }): Cell {
  if (status !== "active") return cell.badge(humanize(status), status === "in_maintenance" ? "warn" : status === "out_of_service" ? "bad" : "mu");
  return load ? cell.badge(labels.busy, loadTone(load.status)) : cell.badge(labels.free, "ok");
}

/** A month and year for an expiry, with nothing when there is none: "Mar 2027". */
export const monthYear = (date: string | null | undefined): string => (date ? formatDate(date).replace(/^(\w{3}) \d{1,2}, /, "$1 ") : "");

export const TRAILER_TYPES: Record<string, string> = { dry_van: "Dry van", reefer: "Reefer", flatbed: "Flatbed", step_deck: "Step deck", box_truck: "Box truck", tanker: "Tanker", other: "Other" };
export const OWNERSHIP: Record<string, string> = { owned: "Company-owned", leased: "Leased", owner_operator: "Owner-operator" };
export const DRIVER_TYPES: Record<string, string> = { company: "Company", owner_operator: "Owner-operator", contractor: "Contractor" };
export const PAY_TYPES: Record<string, string> = { per_mile: "Per mile", percent: "Percent of load", flat: "Flat per load" };
