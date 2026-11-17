import { I } from "@/features/console/icons";
import type { ConsoleState } from "@/features/console/state";

export type Option = [value: string, label: string];
export type Field = {
  k: string;
  l: string;
  span: number;
  type?: "text" | "date" | "number" | "money" | "select" | "textarea" | "email" | "check" | "loads" | "password" | "combo" | "seg";
  /** Fixed choices, or the name of a list the modal loads from the API (or the product's reference lists). */
  options?: Option[] | "customers" | "drivers" | "vehicles" | "trailers" | "units" | "terminals" | "invoices" | "roles" | "states" | "truckMakes" | "trailerMakes" | "trailerTypes" | "owners";
  required?: boolean;
  mono?: boolean;
  hint?: string;
  /** Shown only when editing, or only when adding. */
  only?: "edit" | "add";
  placeholder?: string;
  /** The section heading the field sits under, as the design groups the form. */
  group?: string;
  /** A list that also takes a typed value: the entry's title and detail, and the box's label and placeholder. */
  other?: { title: string; detail: string; label: string; ph: string };
};
export type Values = Record<string, string | boolean | string[]>;
export type Kind = {
  title: (editing: boolean) => string;
  sub: string;
  icon: string;
  /** The permission needed. */
  permission: string;
  fields: Field[];
  defaults: Values;
};

const STATES_HINT = "Two letters, like IL";
const STATUS: Option[] = [["active", "Active"], ["in_maintenance", "In the shop"], ["out_of_service", "Out of service"], ["retired", "Retired"]];
export const papers: Field[] = [
  { k: "registration_expiry", l: "Registration expires", span: 2, type: "date" },
  { k: "insurance_expiry", l: "Insurance expires", span: 2, type: "date" },
  { k: "inspection_expiry", l: "Annual inspection expires", span: 2, type: "date" },
];

export const KINDS: Record<string, Kind> = {
  driver: {
    title: (editing) => (editing ? "Edit driver" : "Add a driver"),
    sub: "Enter manually",
    icon: I.user,
    permission: "drivers.manage",
    defaults: { driver_type: "company", pay_type: "per_mile", pay_rate: "0", status: "active", cdl_class: "A" },
    fields: [
      { k: "first_name", l: "First name", span: 3, required: true, group: "Driver" },
      { k: "last_name", l: "Last name", span: 3, required: true, group: "Driver" },
      { k: "phone", l: "Mobile phone", span: 3, mono: true, placeholder: "(555) 555-0100", group: "Driver" },
      { k: "email", l: "Email", span: 3, type: "email", placeholder: "name@example.com", group: "Driver" },
      { k: "cdl_number", l: "CDL number", span: 2, mono: true, group: "License" },
      { k: "cdl_state", l: "Issuing state", span: 2, type: "combo", options: "states", group: "License" },
      { k: "cdl_class", l: "Class", span: 2, type: "seg", options: [["A", "A"], ["B", "B"], ["C", "C"]], group: "License" },
      { k: "endorsements", l: "Endorsements", span: 2, placeholder: "e.g. N, H", group: "License" },
      { k: "cdl_expiry", l: "CDL expires", span: 2, type: "date", group: "License" },
      { k: "medical_cert_expiry", l: "Medical card expires", span: 2, type: "date", group: "License" },
      { k: "hire_date", l: "Hire date", span: 2, type: "date", group: "Employment" },
      { k: "driver_type", l: "Works as", span: 2, type: "select", options: [["company", "Company driver"], ["owner_operator", "Owner-operator"], ["contractor", "Contractor"]], required: true, group: "Employment" },
      { k: "employee_number", l: "Employee ID", span: 2, mono: true, group: "Employment" },
      { k: "status", l: "Status", span: 2, type: "select", options: [["active", "Active"], ["inactive", "Inactive"], ["terminated", "Terminated"]], only: "edit", group: "Employment" },
      { k: "terminal_id", l: "Terminal", span: 2, type: "select", options: "terminals", group: "Employment" },
      { k: "pay_type", l: "Pay basis", span: 4, type: "seg", options: [["per_mile", "Per mile"], ["percent", "% of load"], ["flat", "Flat per load"]], required: true, group: "Employment" },
      { k: "pay_rate", l: "Pay rate", span: 2, type: "money", required: true, hint: "Per mile, percent of the load, or per load", group: "Employment" },
    ],
  },
  truck: {
    title: (editing) => (editing ? "Edit truck" : "Add a truck"),
    sub: "Enter manually",
    icon: I.truck,
    permission: "equipment.manage",
    defaults: { ownership: "owned", status: "active", owner: "company" },
    fields: [
      { k: "unit_number", l: "Unit number", span: 2, required: true, mono: true, group: "Unit" },
      { k: "vin", l: "VIN", span: 4, mono: true, placeholder: "17 characters", group: "Unit" },
      { k: "year", l: "Year", span: 2, type: "number", placeholder: "2024", group: "Unit" },
      { k: "make", l: "Make", span: 2, type: "combo", options: "truckMakes", other: { title: "Other make", detail: "Type it in yourself", label: "Specify make", ph: "The make on the title" }, group: "Unit" },
      { k: "model", l: "Model", span: 2, placeholder: "e.g. Cascadia 126", group: "Unit" },
      { k: "owner", l: "Owner", span: 3, type: "combo", options: "owners", only: "add", group: "Ownership" },
      { k: "owned_since", l: "Owned since", span: 3, type: "date", only: "add", hint: "Who drives it is set in Dispatch, separately", group: "Ownership" },
      { k: "plate", l: "Plate", span: 2, mono: true, group: "Registration" },
      { k: "plate_state", l: "Plate state", span: 2, type: "combo", options: "states", group: "Registration" },
      { k: "registration_expiry", l: "Registration expires", span: 2, type: "date", group: "Registration" },
      { k: "insurance_expiry", l: "Insurance expires", span: 2, type: "date", group: "Registration" },
      { k: "registered_owner", l: "Registered owner", span: 4, hint: "As printed on the registration", group: "Registration" },
      { k: "odometer", l: "Odometer", span: 2, type: "number", placeholder: "Miles", group: "Service" },
      { k: "inspection_expiry", l: "Annual inspection due", span: 2, type: "date", group: "Service" },
      { k: "telematics_device", l: "Telematics device", span: 2, placeholder: "ELD or GPS ID", group: "Service" },
      { k: "terminal_id", l: "Terminal", span: 3, type: "select", options: "terminals", group: "Service" },
      { k: "status", l: "Status", span: 3, type: "select", options: STATUS, only: "edit", group: "Service" },
      { k: "engine", l: "Engine", span: 3, placeholder: "Make, model and horsepower", group: "Specifications" },
      { k: "transmission", l: "Transmission", span: 3, placeholder: "Automated manual, 12 speed", group: "Specifications" },
      { k: "body", l: "Body", span: 2, placeholder: "Tractor", group: "Specifications" },
      { k: "gvwr", l: "GVWR (lb)", span: 2, type: "number", group: "Specifications" },
      { k: "fuel_capacity_gal", l: "Fuel tanks (gal)", span: 2, type: "number", group: "Specifications" },
    ],
  },
  trailer: {
    title: (editing) => (editing ? "Edit trailer" : "Add a trailer"),
    sub: "Enter manually",
    icon: I.trailer,
    permission: "equipment.manage",
    defaults: { ownership: "owned", status: "active", type: "dry_van", owner: "company", length_ft: "53" },
    fields: [
      { k: "unit_number", l: "Unit number", span: 2, required: true, mono: true, group: "Unit" },
      { k: "type", l: "Type", span: 2, type: "combo", options: "trailerTypes", required: true, other: { title: "Other type", detail: "Type it in yourself", label: "Specify type", ph: "e.g. End dump" }, group: "Unit" },
      { k: "length_ft", l: "Length (ft)", span: 2, type: "number", group: "Unit" },
      { k: "vin", l: "VIN", span: 6, mono: true, placeholder: "17 characters", group: "Unit" },
      { k: "owner", l: "Owner", span: 3, type: "combo", options: "owners", only: "add", group: "Ownership" },
      { k: "owned_since", l: "Owned since", span: 3, type: "date", only: "add", hint: "Who pulls it is set in Dispatch, separately", group: "Ownership" },
      { k: "year", l: "Year", span: 2, type: "number", placeholder: "2024", group: "Registration" },
      { k: "make", l: "Make", span: 2, type: "combo", options: "trailerMakes", other: { title: "Other make", detail: "Type it in yourself", label: "Specify make", ph: "The make on the title" }, group: "Registration" },
      { k: "model", l: "Model", span: 2, group: "Registration" },
      { k: "plate", l: "Plate", span: 2, mono: true, group: "Registration" },
      { k: "plate_state", l: "Plate state", span: 2, type: "combo", options: "states", group: "Registration" },
      { k: "registration_expiry", l: "Registration expires", span: 2, type: "date", group: "Registration" },
      { k: "inspection_expiry", l: "Annual inspection due", span: 3, type: "date", group: "Service" },
      { k: "tracker", l: "Tracker", span: 3, placeholder: "GPS or asset tag", group: "Service" },
      { k: "insurance_expiry", l: "Insurance expires", span: 3, type: "date", group: "Service" },
      { k: "terminal_id", l: "Terminal", span: 3, type: "select", options: "terminals", group: "Service" },
      { k: "status", l: "Status", span: 3, type: "select", options: STATUS, only: "edit", group: "Service" },
    ],
  },
  customer: {
    title: (editing) => (editing ? "Edit customer" : "New customer"),
    sub: "Who you haul for, and where their invoices go",
    icon: I.building,
    permission: "customers.manage",
    defaults: { payment_terms_days: "30" },
    fields: [
      { k: "name", l: "Name", span: 4, required: true },
      { k: "code", l: "Code", span: 2, mono: true },
      { k: "legal_name", l: "Legal name", span: 4 },
      { k: "phone", l: "Phone", span: 2 },
      { k: "billing_email", l: "Billing email", span: 3, type: "email" },
      { k: "payment_terms_days", l: "Payment terms (days)", span: 3, type: "number", required: true },
      { k: "billing_address", l: "Billing address", span: 3 },
      { k: "billing_city", l: "City", span: 1 },
      { k: "billing_state", l: "State", span: 1, mono: true },
      { k: "billing_postal_code", l: "ZIP", span: 1, mono: true },
      { k: "credit_limit", l: "Credit limit", span: 2, type: "money" },
    ],
  },
  inspection: {
    title: () => "Log an inspection",
    sub: "A pre-trip, annual or roadside inspection and what it found",
    icon: I.inspect,
    permission: "safety.manage",
    defaults: { kind: "pre_trip", result: "pass", severity: "minor" },
    fields: [
      { k: "inspected_on", l: "Date", span: 2, type: "date", required: true },
      { k: "kind", l: "Kind", span: 2, type: "select", options: [["pre_trip", "Pre-trip"], ["post_trip", "Post-trip"], ["annual", "Annual"], ["roadside", "Roadside"], ["other", "Other"]], required: true },
      { k: "result", l: "Result", span: 2, type: "select", options: [["pass", "Clean"], ["defects", "Defects found"], ["out_of_service", "Out of service"]], required: true },
      { k: "unit", l: "Unit", span: 3, type: "select", options: "units", required: true },
      { k: "driver_id", l: "Driver", span: 3, type: "select", options: "drivers" },
      { k: "report_number", l: "Report number", span: 2, mono: true },
      { k: "location", l: "Location", span: 2 },
      { k: "inspector", l: "Inspector", span: 2 },
      { k: "defect", l: "Defect found", span: 4, hint: "Leave empty when the inspection was clean" },
      { k: "severity", l: "Severity", span: 2, type: "select", options: [["minor", "Minor"], ["major", "Major"], ["out_of_service", "Out of service"]] },
      { k: "notes", l: "Notes", span: 6, type: "textarea" },
    ],
  },
  invoice: {
    title: () => "New invoice",
    sub: "A draft from a customer’s completed loads. Issue it when it is right.",
    icon: I.invoice,
    permission: "invoices.create",
    defaults: {},
    fields: [
      { k: "customer_id", l: "Customer", span: 4, type: "select", options: "customers", required: true },
      { k: "due_date", l: "Due date", span: 2, type: "date", hint: "Empty: from the customer’s terms" },
      { k: "loads", l: "Loads ready to invoice", span: 6, type: "loads" },
      { k: "notes", l: "Notes on the invoice", span: 6, type: "textarea" },
    ],
  },
  payment: {
    title: () => "Record payment",
    sub: "Money received from a customer, applied to an invoice",
    icon: I.dollar,
    permission: "payments.record",
    defaults: { method: "ach" },
    fields: [
      { k: "customer_id", l: "Customer", span: 4, type: "select", options: "customers", required: true },
      { k: "received_on", l: "Received on", span: 2, type: "date", required: true },
      { k: "amount", l: "Amount", span: 2, type: "money", required: true },
      { k: "method", l: "Method", span: 2, type: "select", options: [["ach", "ACH"], ["wire", "Wire"], ["check", "Check"], ["card", "Card"], ["factoring", "Factoring"], ["cash", "Cash"], ["other", "Other"]] },
      { k: "reference", l: "Reference", span: 2, mono: true, placeholder: "Check or transfer number" },
      { k: "invoice_id", l: "Apply to invoice", span: 6, type: "select", options: "invoices", hint: "Leave empty to apply it later" },
      { k: "notes", l: "Notes", span: 6, type: "textarea" },
    ],
  },
  statement: {
    title: () => "Run a pay statement",
    sub: "A driver’s completed loads and expenses for a period, as a draft to review",
    icon: I.dollar,
    permission: "settlements.manage",
    defaults: {},
    fields: [
      { k: "driver_id", l: "Driver", span: 6, type: "select", options: "drivers", required: true },
      { k: "period_start", l: "Period from", span: 3, type: "date", required: true },
      { k: "period_end", l: "Period to", span: 3, type: "date", required: true },
      { k: "notes", l: "Notes", span: 6, type: "textarea" },
    ],
  },
  payout: {
    title: () => "Mark statement paid",
    sub: "How and when the driver was paid",
    icon: I.dollar,
    permission: "settlements.manage",
    defaults: { method: "direct_deposit" },
    fields: [
      { k: "paid_on", l: "Paid on", span: 3, type: "date", required: true },
      { k: "method", l: "Method", span: 3, type: "select", options: [["direct_deposit", "Direct deposit"], ["ach", "ACH"], ["check", "Check"], ["cash", "Cash"], ["other", "Other"]], required: true },
      { k: "reference", l: "Reference", span: 6, mono: true },
    ],
  },
  fuel: {
    title: () => "Record a fuel purchase",
    sub: "From a receipt or a fuel card statement",
    icon: I.fuel,
    permission: "expenses.manage",
    defaults: { fuel_type: "diesel", paid_with: "fuel_card", driver_treatment: "none" },
    fields: [
      { k: "incurred_on", l: "Date", span: 2, type: "date", required: true },
      { k: "amount", l: "Amount", span: 2, type: "money", required: true },
      { k: "gallons", l: "Gallons", span: 2, type: "money" },
      { k: "vendor", l: "Station", span: 3 },
      { k: "jurisdiction", l: "State", span: 1, mono: true, hint: STATES_HINT },
      { k: "fuel_type", l: "Fuel", span: 2, type: "select", options: [["diesel", "Diesel"], ["def", "DEF"], ["gasoline", "Gasoline"], ["reefer", "Reefer fuel"]] },
      { k: "vehicle_id", l: "Truck", span: 3, type: "select", options: "vehicles" },
      { k: "driver_id", l: "Driver", span: 3, type: "select", options: "drivers" },
      { k: "paid_with", l: "Paid with", span: 3, type: "select", options: [["fuel_card", "Fuel card"], ["company_card", "Company card"], ["cash", "Cash"], ["check", "Check"], ["ach", "ACH"], ["driver", "Driver paid"]] },
      { k: "driver_treatment", l: "On the driver’s pay", span: 3, type: "select", options: [["none", "Nothing — the company paid"], ["reimburse", "Pay it back to the driver"], ["deduct", "Deduct it from pay"]], required: true },
      { k: "reference", l: "Receipt number", span: 6, mono: true },
    ],
  },
  workorder: {
    title: () => "New work order",
    sub: "A repair or service for a truck or trailer",
    icon: I.wrench,
    permission: "maintenance.manage",
    defaults: { priority: "normal", out_of_service: false },
    fields: [
      { k: "title", l: "What needs doing", span: 6, required: true },
      { k: "unit", l: "Unit", span: 3, type: "select", options: "units", required: true },
      { k: "priority", l: "Priority", span: 3, type: "select", options: [["low", "Low"], ["normal", "Normal"], ["high", "High"], ["urgent", "Urgent"]], required: true },
      { k: "scheduled_for", l: "Scheduled for", span: 3, type: "date" },
      { k: "vendor", l: "Shop or vendor", span: 3 },
      { k: "out_of_service", l: "Take the unit out of service until it is done", span: 6, type: "check" },
      { k: "description", l: "Details", span: 6, type: "textarea" },
    ],
  },
  member: {
    title: () => "Add member",
    sub: "Someone who works in this company, with the role that decides what they can do",
    icon: I.users,
    permission: "users.manage",
    defaults: { role: "dispatcher" },
    fields: [
      { k: "full_name", l: "Name", span: 3, required: true },
      { k: "email", l: "Work email", span: 3, type: "email", required: true },
      { k: "role", l: "Role", span: 3, type: "select", options: "roles", required: true },
      { k: "password", l: "Temporary password", span: 3, type: "password", hint: "Needed if they don’t have a FlyFleet login yet. At least 10 characters." },
    ],
  },
};

/** Where to go after a record is created, when there is a page for it. */
export type Created = { message: string; go?: ConsoleState };
