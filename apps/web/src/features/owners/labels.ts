// How owner records read: agreements, categories, who drives and who pays.
import type { Schema } from "@/lib/api/types";

type Agreement = Schema<"AgreementOut">;

export const CATEGORY: Record<string, [label: string, tone: string]> = {
  owner_operator: ["Owner-operator", "brand"],
  non_operating: ["Non-operating owner", "teal"],
};

export const ENTITY: Record<string, [label: string, tone: string]> = {
  individual: ["Individual", "info"],
  business: ["Business", "violet"],
};

export const STATUS: Record<string, [label: string, tone: string]> = {
  onboarding: ["Onboarding", "info"],
  active: ["Active", "ok"],
  suspended: ["Suspended", "warn"],
  ended: ["Ended", "mu"],
};

export const BUSINESS_TYPES: Record<string, string> = { llc: "LLC", corporation: "Corporation", partnership: "Partnership", sole_proprietor: "Sole proprietor" };

/** The agreement kinds, as the design names them: what it is, and who drives under it. */
export const AGREEMENT_KINDS: Record<string, [label: string, drives: string]> = {
  owner_operator_lease: ["Owner-operator lease", "the owner drives"],
  equipment_lease: ["Equipment lease", "company driver"],
  fleet_lease: ["Fleet lease", "owner’s drivers"],
  rental: ["Equipment rental", "carrier drivers"],
};

const pct = (v: string | null | undefined) => `${Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
const dollars = (v: string | null | undefined, digits = 2) => `$${Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

/** "Owner-operator lease · 72% + fuel surcharge" and its terms underneath. */
export function agreementLine(a: Pick<Agreement, "kind" | "owner_pct" | "fsc_pct" | "per_mile" | "per_trailer_week" | "accessorials_to_owner">): [label: string, terms: string] {
  const [label] = AGREEMENT_KINDS[a.kind] ?? [a.kind];
  if (a.kind === "rental") {
    const parts = [a.per_mile ? `${dollars(a.per_mile)} a mile` : "", a.per_trailer_week ? `${dollars(a.per_trailer_week, 0)} a trailer a week` : ""].filter(Boolean);
    return [label, parts.join(" · ")];
  }
  const fsc = Number(a.fsc_pct ?? 0) ? ` + ${Number(a.fsc_pct) === 100 ? "fuel surcharge" : `${pct(a.fsc_pct)} of fuel surcharge`}` : "";
  return [label, `${pct(a.owner_pct)} of line haul${fsc}${a.accessorials_to_owner ? " + accessorials" : ""}`];
}

/** Agreement kind with who drives: "Fleet lease · owner’s drivers". */
export const agreementKind = (kind: string | null | undefined): string => {
  if (!kind) return "—";
  const [label, drives] = AGREEMENT_KINDS[kind] ?? [kind, ""];
  return kind === "owner_operator_lease" || kind === "rental" ? label : `${label} · ${drives}`;
};

/** Who employs a driver on an owner's truck, and how they are paid. */
export function employment(driver: { employer: string; pay_by: string } | null | undefined, ownerShort: string, carrier: string): [employedBy: string, paid: string] {
  if (!driver) return ["", ""];
  if (driver.employer === "self") return ["The owner", `Paid on the owner settlement, never a driver statement`];
  if (driver.employer === "owner") {
    return driver.pay_by === "owner"
      ? ["Hired by the owner", `${ownerShort} pays them outside FlyFleet`]
      : ["Hired by the owner", `${carrier} runs the pay and charges the owner`];
  }
  return [carrier, `${carrier} pays them on a driver statement`];
}

/** Who drives a unit, as chosen when adding it to an owner. */
export const WHO_DRIVES: Record<string, string> = { owner: "The owner drives it", carrier: "A company driver", owner_hire: "A driver the owner hires" };

export const PAYER = (payer: string, carrier: string): [label: string, tone: string] => (payer === "owner" ? ["Owner", "brand"] : [carrier, "mu"]);

/** What each portal permission lets an owner open. */
export const PERMISSION_DETAIL: Record<string, string> = {
  equipment: "Units, specs, status",
  locations: "Map and last position",
  drivers: "Names and phone of drivers on their units",
  loads: "Active loads, no customer rates",
  completed: "Delivered loads with rated freight bills",
  fuel: "Fuel card purchases on their units",
  expenses: "Deductions with receipts",
  statements: "Weekly settlements and escrow",
  maintenance: "Work orders and costs",
  documents: "Lease, insurance, titles",
  download: "PDF and CSV exports",
  performance: "Miles, on-time, revenue per mile",
};

export const DOC_TYPES: Record<string, string> = {
  lease: "Lease", w9: "W-9", title: "Title", cab_card: "Cab card", ach_authorization: "ACH authorization", insurance: "Insurance",
  registration: "Registration", inspection: "Inspection", maintenance: "Maintenance", other: "Other",
};

/** A short name for an owner in sentences: a business without its suffix, an individual's first name. */
export function shortName(owner: { name: string; entity_type: string; person?: { first_name: string } | null }): string {
  if (owner.entity_type === "business") return owner.name.replace(/,? (LLC|Inc\.?|Corp\.?|Corporation|Co\.?|L\.L\.C\.)$/i, "");
  return owner.person?.first_name ?? owner.name.split(" ")[0] ?? owner.name;
}

/** Initials for an owner's mark: two letters of a business's name, or first and last initials. */
export function ownerInitials(owner: { name: string; entity_type: string }): string {
  const words = owner.name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !/^(llc|inc|co|corp)$/i.test(w));
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}
