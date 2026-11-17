// The review step's fields for each kind of document, filled from what was read, and how the record is saved
// from them. Every value stays editable; what a person changes is kept next to what was read.
import { CDL_CLASSES, TRAILER_MAKES, TRUCK_MAKES } from "@/lib/reference/makes";
import { US_STATES } from "@/lib/reference/states";
import type { Schema } from "@/lib/api/types";
import { TRAILER_TYPES } from "@/features/fleet/labels";

export type Read = Schema<"ReadOut">;
type ReadField = Schema<"FieldOut">;

export type Input = "text" | "date" | "money" | "int" | "combo" | "seg" | "time";
export type Opt = { v: string; l: string; ab?: string };

export type RField = {
  key: string;
  label: string;
  input: Input;
  value: string;
  /** What was read for this field, and from which read. */
  read?: ReadField & { readId: string };
  options?: Opt[];
  /** A combo that also takes a typed value ("Other make"). */
  other?: { title: string; detail: string; label: string; ph: string };
  mono?: boolean;
  half?: boolean;
  placeholder?: string;
  note?: string;
  /** The badge when it isn't simply Read or Check: Suggested, Add, Encrypted, Matches VIN. */
  badge?: [label: string, tone: string];
  required?: boolean;
  /** Read key to log a correction against, when it differs from the field key. */
  readKey?: string;
};

export type Lists = {
  customers: Opt[];
  loads: Opt[];
  drivers: Opt[];
  trucks: Opt[];
  trailers: Opt[];
};

const STATES: Opt[] = US_STATES.map(([code, name]) => ({ v: code, l: name, ab: code }));
const TYPES: Opt[] = Object.entries(TRAILER_TYPES).filter(([v]) => v !== "other").map(([v, l]) => ({ v, l }));
const EQUIPMENT: Opt[] = Object.entries(TRAILER_TYPES).map(([v, l]) => ({ v, l }));

/** The read value for a key, across the reads (the first that has one). */
export function readOf(reads: Read[], key: string): (ReadField & { readId: string }) | undefined {
  for (const r of reads) {
    const f = r.fields.find((x) => x.key === key && x.value);
    if (f) return { ...f, readId: r.id };
  }
  return undefined;
}

const recordOf = (reads: Read[], type: string) => {
  for (const r of reads) {
    const c = r.checks.find((x) => x.record_type === type && x.record_id && x.tone === "ok");
    if (c) return c.record_id!;
  }
  return "";
};

function field(reads: Read[], key: string, label: string, input: Input, extra: Partial<RField> = {}): RField {
  const read = readOf(reads, extra.readKey ?? key);
  return { key, label, input, value: read?.value ?? "", read, ...extra };
}

const makeOption = (list: string[], value: string): Opt[] => {
  const opts = list.map((m) => ({ v: m, l: m }));
  return value && !list.includes(value) ? [{ v: value, l: value }, ...opts] : opts;
};

/** The fields the review step shows for a document, in the design's order. */
export function reviewFields(kind: string, reads: Read[], lists: Lists): RField[] {
  const suggest = Object.assign({}, ...reads.map((r) => r.suggestions)) as Record<string, string>;
  if (kind === "driver") {
    return [
      field(reads, "first_name", "First name", "text", { half: true, required: true }),
      field(reads, "last_name", "Last name", "text", { half: true, required: true }),
      field(reads, "cdl_number", "CDL number", "text", { mono: true }),
      field(reads, "cdl_state", "CDL state", "combo", { half: true, options: STATES }),
      field(reads, "cdl_class", "Class", "seg", { half: true, options: CDL_CLASSES.map(([v]) => ({ v, l: v })) }),
      field(reads, "endorsements", "Endorsements", "text", { placeholder: "e.g. N, H" }),
      field(reads, "restrictions", "Restrictions", "text", { placeholder: "None" }),
      field(reads, "cdl_expiry", "CDL expires", "date", { half: true }),
      field(reads, "date_of_birth", "Date of birth", "date", { half: true, badge: ["Encrypted", "ok"], note: "Stored encrypted and hidden after saving." }),
      { key: "phone", label: "Mobile phone", input: "text", value: "", mono: true, placeholder: "(555) 555-0100", badge: ["Add", "mu"], note: "Not on the CDL. Add it so dispatch can reach them and the app invite can be texted." },
    ];
  }
  if (kind === "truck" || kind === "trailer") {
    const truck = kind === "truck";
    const make = readOf(reads, "make")?.value ?? suggest.make ?? "";
    const unit = truck ? suggest.unit_number : suggest.trailer_unit_number;
    const fields: RField[] = [
      { key: "unit_number", label: "Unit number", input: "text", value: unit ?? "", mono: true, required: true, badge: unit ? ["Suggested", "mu"] : ["Add", "mu"], note: unit ? "The next free number. Change it if your units are numbered differently." : "Your number for this unit." },
      field(reads, "vin", "VIN", "text", { mono: true }),
    ];
    if (!truck) {
      fields.push({ key: "type", label: "Type", input: "combo", value: "", half: true, options: TYPES, other: { title: "Other type", detail: "Type it in yourself", label: "Specify type", ph: "e.g. End dump" } });
      fields.push({ key: "length_ft", label: "Length (ft)", input: "int", value: "53", half: true });
    }
    fields.push(
      { ...field(reads, "year", "Year", "int", { half: true }), value: readOf(reads, "year")?.value ?? suggest.year ?? "" },
      { key: "make", label: "Make", input: "combo", value: make, read: readOf(reads, "make"), half: true, options: makeOption(truck ? TRUCK_MAKES : TRAILER_MAKES, make), other: { title: "Other make", detail: "Type it in yourself", label: "Specify make", ph: "The make on the title" } },
      field(reads, "model", "Model", "text", { placeholder: truck ? "e.g. Cascadia 126" : "" }),
      field(reads, "plate", "Plate", "text", { mono: true, half: true }),
      field(reads, "plate_state", "Plate state", "combo", { half: true, options: STATES }),
      field(reads, "registered_owner", "Registered owner", "text"),
      ...(truck ? [field(reads, "gvwr", "GVWR (lb)", "int", { half: true, mono: true })] : []),
      field(reads, "registration_expiry", "Registration expires", "date", { half: !!truck }),
    );
    return fields;
  }
  if (kind === "load") {
    const customer = recordOf(reads, "customer");
    const lineHaul = readOf(reads, "line_haul")?.value;
    const total = readOf(reads, "rate_total")?.value;
    const fsc = readOf(reads, "fuel_surcharge")?.value;
    const derived = !lineHaul && total ? (Number(total) - Number(fsc ?? 0)).toFixed(2) : "";
    return [
      { key: "customer_id", label: "Customer", input: "combo", value: customer, read: readOf(reads, "customer_name"), readKey: "customer_name", options: lists.customers, required: true, note: customer ? undefined : readOf(reads, "customer_name") ? `Read as “${readOf(reads, "customer_name")!.value}”. Pick the customer, or add them first.` : "Pick the customer this load is for." },
      field(reads, "reference", "Reference", "text", { mono: true }),
      field(reads, "pickup_name", "Pickup", "text"),
      field(reads, "pickup_city", "Pickup city", "text", { half: true, required: true }),
      field(reads, "pickup_state", "Pickup state", "combo", { half: true, options: STATES }),
      field(reads, "pickup_date", "Pickup date", "date", { half: true }),
      { key: "pickup_time", label: "Pickup time", input: "time", value: "", half: true, placeholder: "08:00" },
      field(reads, "delivery_name", "Delivery", "text"),
      field(reads, "delivery_city", "Delivery city", "text", { half: true, required: true }),
      field(reads, "delivery_state", "Delivery state", "combo", { half: true, options: STATES }),
      field(reads, "delivery_date", "Delivery date", "date", { half: true }),
      { key: "delivery_time", label: "Delivery time", input: "time", value: "", half: true, placeholder: "17:00" },
      field(reads, "equipment_type", "Equipment", "combo", { half: true, options: EQUIPMENT }),
      field(reads, "weight_lbs", "Weight (lb)", "int", { half: true, mono: true }),
      { ...field(reads, "line_haul", "Line haul", "money", { half: true, mono: true }), value: lineHaul ?? derived, note: derived ? "Worked out as the total less the fuel surcharge." : undefined },
      field(reads, "fuel_surcharge", "Fuel surcharge", "money", { half: true, mono: true }),
      field(reads, "miles", "Miles", "int", { half: true, mono: true }),
      field(reads, "commodity", "Commodity", "text", { half: true }),
    ];
  }
  if (kind === "invoice") {
    const load = recordOf(reads, "load");
    return [
      { key: "load_id", label: "Load", input: "combo", value: load, read: readOf(reads, "reference"), readKey: "reference", options: lists.loads, required: true, note: load ? undefined : "Pick the load this proof of delivery belongs to." },
      field(reads, "delivered_on", "Delivered", "date", { half: true }),
      field(reads, "signed_by", "Signed by", "text", { half: true, note: "Handwritten names: keep it as read or leave it blank; never guess a name." }),
      field(reads, "exceptions", "Exceptions", "text", { placeholder: "None" }),
      field(reads, "detention", "Detention", "money", { half: true, mono: true }),
      field(reads, "lumper", "Lumper", "money", { half: true, mono: true }),
    ];
  }
  if (kind === "inspection") {
    return [
      field(reads, "report_number", "Report number", "text", { half: true, mono: true }),
      field(reads, "inspected_on", "Inspected", "date", { half: true, required: true }),
      field(reads, "level", "Level", "text", { half: true }),
      field(reads, "state", "State", "combo", { half: true, options: STATES }),
      field(reads, "location", "Location", "text"),
      { key: "driver_id", label: "Driver", input: "combo", value: recordOf(reads, "driver"), read: readOf(reads, "driver_name"), readKey: "driver_name", options: lists.drivers },
      { key: "vehicle_id", label: "Truck", input: "combo", value: recordOf(reads, "vehicle"), read: readOf(reads, "truck_plate"), readKey: "truck_plate", options: lists.trucks, half: true },
      { key: "trailer_id", label: "Trailer", input: "combo", value: "", read: readOf(reads, "trailer_plate"), readKey: "trailer_plate", options: lists.trailers, half: true },
      field(reads, "inspector", "Inspector", "text"),
    ];
  }
  return [];
}

/** The value as the API takes it: empty means not given. */
export const given = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
