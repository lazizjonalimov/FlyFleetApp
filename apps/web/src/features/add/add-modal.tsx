"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Problem } from "@/components/feedback/dialog";
import { EmptyState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import type { ConsoleState } from "@/features/console/state";
import { api, idempotencyKey, unwrap } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { formatDate, todayIn } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { combo, type ComboOption } from "@/components/forms/combo";
import { Combobox } from "@/components/forms/combobox";
import { TRAILER_TYPES } from "@/features/fleet/labels";
import { TRAILER_MAKES, TRUCK_MAKES } from "@/lib/reference/makes";
import { US_STATES } from "@/lib/reference/states";
import { FLOWS } from "./flows";
import { KINDS, type Field, type Option, type Values } from "./forms";
import { ChooseStep } from "./frame";
import { ImportFlow } from "./import-flow";
import { ScanFlow } from "./scan";

const MONEY = /^-?\d{1,10}(\.\d{1,4})?$/;
const blank = (value: unknown): string | null => (typeof value === "string" ? value.trim() || null : null);
const whole = (value: unknown) => (typeof value === "string" && value.trim() ? Number(value) : null);
const text = (value: unknown) => (typeof value === "string" ? value : "");

/** The record being edited, as form values. */
function useEditing(kind: string, id: string | null) {
  const { me } = useConsole();
  const org = me.organization.id;
  return useQuery({
    queryKey: [org, "edit", kind, id ?? ""],
    enabled: !!id && ["driver", "truck", "trailer", "customer"].includes(kind),
    staleTime: 0,
    queryFn: async (): Promise<Values> => {
      const path = { item_id: id! };
      const record: Record<string, unknown> =
        kind === "driver"
          ? await unwrap(api.GET("/api/v1/drivers/{item_id}", { params: { path } }))
          : kind === "truck"
            ? await unwrap(api.GET("/api/v1/vehicles/{item_id}", { params: { path } }))
            : kind === "trailer"
              ? await unwrap(api.GET("/api/v1/trailers/{item_id}", { params: { path } }))
              : await unwrap(api.GET("/api/v1/customers/{customer_id}", { params: { path: { customer_id: id! } } }));
      return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, value === null || value === undefined ? "" : typeof value === "boolean" ? value : String(value)]));
    },
  });
}

/** A unit added for an outside owner: ownership from the date given, under that owner's agreement. */
async function giveToOwner(owner: string, since: string, unit: { vehicle_id: string } | { trailer_id: string }): Promise<string> {
  if (!owner || owner === "company") return "";
  const detail = await unwrap(api.GET("/api/v1/owners/{owner_id}", { params: { path: { owner_id: owner } } }));
  const agreement = detail.agreements.find((a) => !a.effective_to);
  if (!agreement) return ` · add an agreement on ${detail.name}’s record, then transfer it to them`;
  const today = new Date().toISOString().slice(0, 10);
  await unwrap(api.POST("/api/v1/equipment/ownership-transfers", { body: { ...unit, effective_from: since || today, reason: "Added with the unit", rows: [{ owner_id: owner, share_pct: "100", agreement_id: agreement.id }] } as never }));
  return ` · owned by ${detail.name}`;
}

/** Saves the form to the API. Returns what to say, and where to go if there is a page for the new record. */
async function save(kind: string, values: Values, editId: string | null, key: string): Promise<{ message: string; go?: ConsoleState }> {
  const v = values;
  const unitOf = (value: unknown) => {
    const [type, unit] = text(value).split(":");
    return type === "trailer" ? { trailer_id: unit } : { vehicle_id: unit };
  };
  const header = { "idempotency-key": key };
  switch (kind) {
    case "driver": {
      const body = { first_name: text(v.first_name).trim(), last_name: text(v.last_name).trim(), driver_type: text(v.driver_type) as "company", status: (text(v.status) || "active") as "active", employee_number: blank(v.employee_number), phone: blank(v.phone), email: blank(v.email), hire_date: blank(v.hire_date), terminal_id: blank(v.terminal_id), cdl_number: blank(v.cdl_number), cdl_state: blank(text(v.cdl_state).toUpperCase()), cdl_class: (blank(v.cdl_class) as "A" | null), cdl_expiry: blank(v.cdl_expiry), medical_cert_expiry: blank(v.medical_cert_expiry), pay_type: text(v.pay_type) as "per_mile", pay_rate: text(v.pay_rate) || "0", pay_by: "carrier" as const };
      const saved = editId ? await unwrap(api.PATCH("/api/v1/drivers/{item_id}", { params: { path: { item_id: editId } }, body })) : await unwrap(api.POST("/api/v1/drivers", { body }));
      return { message: `${saved.full_name} ${editId ? "saved" : "added"}`, go: { screen: "driver", driverId: saved.id } };
    }
    case "truck": {
      const owner = text(v.owner);
      const body = { unit_number: text(v.unit_number).trim(), ownership: (owner && owner !== "company" ? "leased" : text(v.ownership) || "owned") as "owned", status: (text(v.status) || "active") as "active", year: whole(v.year), make: blank(v.make), model: blank(v.model), vin: blank(v.vin), plate: blank(v.plate), plate_state: blank(text(v.plate_state).toUpperCase()), odometer: whole(v.odometer), terminal_id: blank(v.terminal_id), body: blank(v.body), engine: blank(v.engine), transmission: blank(v.transmission), telematics_device: blank(v.telematics_device), gvwr: whole(v.gvwr), fuel_capacity_gal: whole(v.fuel_capacity_gal), registered_owner: blank(v.registered_owner), registration_expiry: blank(v.registration_expiry), insurance_expiry: blank(v.insurance_expiry), inspection_expiry: blank(v.inspection_expiry) };
      const saved = editId ? await unwrap(api.PATCH("/api/v1/vehicles/{item_id}", { params: { path: { item_id: editId } }, body })) : await unwrap(api.POST("/api/v1/vehicles", { body }));
      const ownerNote = editId ? "" : await giveToOwner(owner, text(v.owned_since), { vehicle_id: saved.id });
      return { message: `Truck ${saved.unit_number} ${editId ? "saved" : "added"}${ownerNote}`, go: { screen: "truck", unitId: saved.id, unitKind: "truck" } };
    }
    case "trailer": {
      const owner = text(v.owner);
      const known = ["dry_van", "reefer", "flatbed", "step_deck", "box_truck", "tanker"].includes(text(v.type));
      const body = { unit_number: text(v.unit_number).trim(), type: (known ? text(v.type) : "other") as "dry_van", type_other: known ? null : blank(v.type), ownership: (owner && owner !== "company" ? "leased" : text(v.ownership) || "owned") as "owned", status: (text(v.status) || "active") as "active", length_ft: whole(v.length_ft), year: whole(v.year), make: blank(v.make), model: blank(v.model), vin: blank(v.vin), plate: blank(v.plate), plate_state: blank(text(v.plate_state).toUpperCase()), terminal_id: blank(v.terminal_id), tracker: blank(v.tracker), registration_expiry: blank(v.registration_expiry), insurance_expiry: blank(v.insurance_expiry), inspection_expiry: blank(v.inspection_expiry) };
      const saved = editId ? await unwrap(api.PATCH("/api/v1/trailers/{item_id}", { params: { path: { item_id: editId } }, body })) : await unwrap(api.POST("/api/v1/trailers", { body }));
      const ownerNote = editId ? "" : await giveToOwner(owner, text(v.owned_since), { trailer_id: saved.id });
      return { message: `Trailer ${saved.unit_number} ${editId ? "saved" : "added"}${ownerNote}`, go: { screen: "truck", unitId: saved.id, unitKind: "trailer" } };
    }
    case "customer": {
      const body = { name: text(v.name).trim(), code: blank(v.code), legal_name: blank(v.legal_name), phone: blank(v.phone), billing_email: blank(v.billing_email), payment_terms_days: Number(text(v.payment_terms_days) || "30"), billing_address: blank(v.billing_address), billing_city: blank(v.billing_city), billing_state: blank(text(v.billing_state).toUpperCase()), billing_postal_code: blank(v.billing_postal_code), credit_limit: blank(v.credit_limit) };
      const saved = editId ? await unwrap(api.PATCH("/api/v1/customers/{item_id}", { params: { path: { item_id: editId } }, body })) : await unwrap(api.POST("/api/v1/customers", { body }));
      return { message: `${saved.name} ${editId ? "saved" : "added"}`, go: goTo("customers") };
    }
    case "inspection": {
      const defect = text(v.defect).trim();
      await unwrap(api.POST("/api/v1/maintenance/inspections", { params: { header }, body: { inspected_on: text(v.inspected_on), kind: text(v.kind) as "pre_trip", result: text(v.result) as "pass", ...unitOf(v.unit), driver_id: blank(v.driver_id), report_number: blank(v.report_number), location: blank(v.location), inspector: blank(v.inspector), notes: blank(v.notes), defects: defect ? [{ item: defect, severity: text(v.severity) as "minor" }] : [] } }));
      return { message: "Inspection recorded", go: goTo("inspections") };
    }
    case "invoice": {
      const saved = await unwrap(api.POST("/api/v1/invoices", { params: { header }, body: { customer_id: text(v.customer_id), load_ids: Array.isArray(v.loads) ? v.loads : [], due_date: blank(v.due_date), notes: blank(v.notes) } }));
      return { message: `Draft invoice for ${saved.customer.name} created · ${formatMoney(saved.total, saved.currency)}`, go: { ...goTo("invoices"), ltab: 1 } };
    }
    case "payment": {
      const amount = text(v.amount);
      const invoice = blank(v.invoice_id);
      const saved = await unwrap(api.POST("/api/v1/payments", { params: { header }, body: { customer_id: text(v.customer_id), amount, received_on: text(v.received_on), method: (blank(v.method) as "ach" | null), reference: blank(v.reference), notes: blank(v.notes), allocations: invoice ? [{ invoice_id: String(invoice), amount: text(v.apply) || amount }] : [] } }));
      return { message: `${formatMoney(saved.amount, saved.currency)} recorded from ${saved.customer.name}` };
    }
    case "statement": {
      const saved = await unwrap(api.POST("/api/v1/settlements", { params: { header }, body: { driver_id: text(v.driver_id), period_start: text(v.period_start), period_end: text(v.period_end), notes: blank(v.notes) } }));
      return { message: `Draft statement for ${saved.driver.name} created`, go: { screen: "stmt", statementId: saved.id } };
    }
    case "payout": {
      const statement = await unwrap(api.GET("/api/v1/settlements/{settlement_id}", { params: { path: { settlement_id: text(v["payout.statement"]) } } }));
      const saved = await unwrap(api.POST("/api/v1/settlements/{settlement_id}/pay", { params: { path: { settlement_id: statement.id } }, body: { version: statement.version, paid_on: text(v.paid_on), method: text(v.method) as "ach", reference: blank(v.reference) } }));
      return { message: `${formatMoney(saved.net_pay, saved.currency)} marked paid to ${saved.driver.name}` };
    }
    case "fuel": {
      const gallons = blank(v.gallons);
      await unwrap(api.POST("/api/v1/expenses", { params: { header }, body: { category: "fuel", incurred_on: text(v.incurred_on), amount: text(v.amount), gallons, vendor: blank(v.vendor), jurisdiction: blank(text(v.jurisdiction).toUpperCase()), fuel_type: (blank(v.fuel_type) as "diesel" | null), vehicle_id: blank(v.vehicle_id), driver_id: blank(v.driver_id), paid_with: (blank(v.paid_with) as "fuel_card" | null), driver_treatment: text(v.driver_treatment) as "none", reference: blank(v.reference) } }));
      return { message: "Fuel purchase recorded", go: { ...goTo("fuel"), ftab: 0 } };
    }
    case "workorder": {
      const saved = await unwrap(api.POST("/api/v1/maintenance/work-orders", { params: { header }, body: { title: text(v.title).trim(), ...unitOf(v.unit), priority: text(v.priority) as "normal", scheduled_for: blank(v.scheduled_for), vendor: blank(v.vendor), out_of_service: v.out_of_service === true, description: blank(v.description) } }));
      return { message: `${saved.number} opened`, go: goTo("maintenance") };
    }
    case "member": {
      const saved = await unwrap(api.POST("/api/v1/members", { body: { full_name: text(v.full_name).trim(), email: text(v.email).trim(), role: text(v.role) as "dispatcher", password: blank(v.password) } }));
      return { message: `${saved.full_name} added as ${saved.role.replace(/_/g, " ")}` };
    }
  }
  throw new Error("This can’t be added here yet.");
}

/** Adding or editing a record, in a dialog over the screen. Saved to the API; nothing changes until it answers. */
export function AddModal() {
  const { me, hasModal, closeModal, state, set, notify } = useConsole();
  const client = useQueryClient();
  const org = me.organization;
  const kind = typeof state.kind === "string" ? state.kind : "driver";
  const spec = KINDS[kind];
  const preset = (state.fv ?? {}) as Values;
  const editId = typeof preset.editId === "string" ? preset.editId : null;
  const editing = useEditing(kind, editId);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [key, setKey] = useState(idempotencyKey);
  const [dd, setDd] = useState<string | null>(null);
  const [ddq, setDdq] = useState("");
  const [others, setOthers] = useState<Record<string, boolean>>({});
  const today = todayIn(org.timezone);
  const all: Values = { ...(spec?.defaults ?? {}), ...Object.fromEntries((spec?.fields ?? []).filter((field) => field.type === "date" && field.required && !preset.editId).map((field) => [field.k, field.k === "period_start" ? "" : today])), ...(editing.data ?? {}), ...preset, ...values };
  const wants = (list: string) => !!spec?.fields.some((field) => field.options === list);
  const options = {
    customers: useQuery({ queryKey: [org.id, "customers", "options"], queryFn: () => unwrap(api.GET("/api/v1/customers", { params: { query: { status: "active", sort: "name", limit: 100 } } })), enabled: hasModal && wants("customers"), staleTime: 60_000 }),
    drivers: useQuery({ queryKey: [org.id, "drivers", "options"], queryFn: () => unwrap(api.GET("/api/v1/drivers", { params: { query: { status: "active", sort: "name", limit: 100 } } })), enabled: hasModal && wants("drivers"), staleTime: 60_000 }),
    vehicles: useQuery({ queryKey: [org.id, "vehicles", "options"], queryFn: () => unwrap(api.GET("/api/v1/vehicles", { params: { query: { sort: "unit_number", limit: 100 } } })), enabled: hasModal && (wants("vehicles") || wants("units")), staleTime: 60_000 }),
    trailers: useQuery({ queryKey: [org.id, "trailers", "options"], queryFn: () => unwrap(api.GET("/api/v1/trailers", { params: { query: { sort: "unit_number", limit: 100 } } })), enabled: hasModal && wants("units"), staleTime: 60_000 }),
    terminals: useQuery({ queryKey: [org.id, "terminals", "options"], queryFn: () => unwrap(api.GET("/api/v1/terminals", { params: { query: { status: "active", sort: "name", limit: 100 } } })), enabled: hasModal && wants("terminals"), staleTime: 60_000 }),
    roles: useQuery({ queryKey: [org.id, "roles"], queryFn: () => unwrap(api.GET("/api/v1/roles")), enabled: hasModal && wants("roles"), staleTime: 300_000 }),
  };
  const truckSummary = useQuery({ queryKey: [org.id, "vehicles", "summary"], queryFn: () => unwrap(api.GET("/api/v1/vehicles/summary")), enabled: hasModal && !editId && kind === "truck", staleTime: 30_000 });
  const trailerSummary = useQuery({ queryKey: [org.id, "trailers", "summary"], queryFn: () => unwrap(api.GET("/api/v1/trailers/summary")), enabled: hasModal && !editId && kind === "trailer", staleTime: 30_000 });
  const owners = useQuery({ queryKey: [org.id, "owners", "filter"], queryFn: () => unwrap(api.GET("/api/v1/owners", { params: { query: { sort: "name", limit: 100 } } })), enabled: hasModal && wants("owners") && !editId, staleTime: 60_000 });
  const comboOptions = (field: Field): ComboOption[] => {
    switch (field.options) {
      case "states": return US_STATES.map(([code, name]) => ({ v: code, l: name, ab: code }));
      case "truckMakes": return TRUCK_MAKES.map((m) => ({ v: m, l: m }));
      case "trailerMakes": return TRAILER_MAKES.map((m) => ({ v: m, l: m }));
      case "trailerTypes": return Object.entries(TRAILER_TYPES).filter(([v]) => v !== "other").map(([v, l]) => ({ v, l }));
      case "owners": return [{ v: "company", l: org.name, ab: "Company" }, ...(owners.data?.items ?? []).filter((o) => o.status !== "ended").map((o) => ({ v: o.id, l: o.name, ab: o.status === "onboarding" ? "Onboarding" : "" }))];
      default: return Array.isArray(field.options) ? field.options.map(([v, l]) => ({ v, l })) : [];
    }
  };
  const customer = text(all.customer_id);
  const ready = useQuery({ queryKey: [org.id, "loads", "ready", customer], queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { view: "ready_to_invoice", customer_id: customer, limit: 100 } } })), enabled: hasModal && kind === "invoice" && !!customer });
  const open = useQuery({ queryKey: [org.id, "invoices", "open", customer], queryFn: () => unwrap(api.GET("/api/v1/invoices", { params: { query: { status: "issued", customer_id: customer, limit: 100 } } })), enabled: hasModal && kind === "payment" && !!customer });
  const flow = FLOWS[kind];
  const step = typeof state.mstep === "string" ? state.mstep : "manual";
  const reader = useQuery({ queryKey: [org.id, "intake", "reader"], queryFn: () => unwrap(api.GET("/api/v1/intake/reader")), enabled: hasModal && !!flow && step === "choose", staleTime: 300_000 });
  if (!hasModal) return null;

  const close = () => {
    setValues({});
    setErrors({});
    setProblem(null);
    setKey(idempotencyKey());
    closeModal();
  };
  // From a document or a spreadsheet: the choice, then the scan or the import, each with its own steps.
  if (flow && !editId && step !== "manual") {
    const toChoose = () => set({ mstep: "choose" });
    if (step === "scan") return <ScanFlow kind={kind} flow={flow} onBack={toChoose} onClose={close} />;
    if (step === "import" && flow.importKind) return <ImportFlow kind={flow.importKind} flow={flow} onBack={toChoose} onClose={close} />;
    return (
      <ChooseStep
        flow={flow}
        photos={!!reader.data?.photos}
        onScan={() => set({ mstep: "scan" })}
        onManual={() => (flow.manualScreen ? (close(), set(goTo(flow.manualScreen))) : set({ mstep: "manual" }))}
        onImport={flow.importKind ? () => set({ mstep: "import" }) : null}
        onClose={close}
      />
    );
  }
  if (!spec) {
    return (
      <>
        <div className="scrim" style={{ zIndex: "50" }} onClick={close}></div>
        <div className="modal" role="dialog" aria-modal="true" aria-label="Not available yet">
          <div className="mh">
            <div className="f1"><h2 className="fs16 w6 tx">Not available yet</h2></div>
            <button className="btn ghost icon sm" onClick={close} aria-label="Close"><Icon d="M18 6L6 18M6 6l12 12" /></button>
          </div>
          <div className="mbody"><EmptyState icon="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" title="This can’t be added here yet" /></div>
          <div className="mfoot"><span className="sp"></span><button className="btn" onClick={close}>Close</button></div>
        </div>
      </>
    );
  }

  const choicesOf = (field: Field): Option[] => {
    if (Array.isArray(field.options)) return field.options;
    switch (field.options) {
      case "customers": return (options.customers.data?.items ?? []).map((c) => [c.id, c.name]);
      case "drivers": return (options.drivers.data?.items ?? []).map((d) => [d.id, d.full_name]);
      case "vehicles": return (options.vehicles.data?.items ?? []).map((u) => [u.id, `Truck ${u.unit_number}`]);
      case "units": return [...(options.vehicles.data?.items ?? []).map((u): Option => [`vehicle:${u.id}`, `Truck ${u.unit_number}`]), ...(options.trailers.data?.items ?? []).map((u): Option => [`trailer:${u.id}`, `Trailer ${u.unit_number}`])];
      case "terminals": return (options.terminals.data?.items ?? []).map((t) => [t.id, t.code ? `${t.name} (${t.code})` : t.name]);
      case "invoices": return (open.data?.items ?? []).map((i) => [i.id, `${i.invoice_number ?? "Invoice"} · ${formatMoney(i.balance, i.currency)} open${i.due_date ? ` · due ${formatDate(i.due_date)}` : ""}`]);
      case "roles": return (options.roles.data?.roles ?? []).filter((role) => role.assignable && role.key !== "owner").map((role) => [role.key, role.label]);
      default: return [];
    }
  };
  const fields = spec.fields.filter((field) => !field.only || field.only === (editId ? "edit" : "add")).filter((field) => !(field.options === "terminals" && !options.terminals.data?.items.length));
  const put = (k: string, value: string | boolean | string[]) => setValues((previous) => ({ ...previous, [k]: value }));

  const suggestion = editId ? null : kind === "truck" ? truckSummary.data?.next_unit_number ?? null : kind === "trailer" ? trailerSummary.data?.next_unit_number ?? null : null;
  const filled: Values = suggestion && !text(all.unit_number) ? { ...all, unit_number: suggestion } : all;

  async function submit() {
    const found: Record<string, string> = {};
    for (const field of fields) {
      const value = filled[field.k];
      const empty = value === undefined || value === "" || (Array.isArray(value) && !value.length);
      if (field.required && empty) found[field.k] = `Enter ${field.l.toLowerCase()}`;
      if (!empty && field.type === "money" && !MONEY.test(text(value))) found[field.k] = "Enter a number like 2500 or 2500.00";
      if (!empty && field.type === "number" && !/^\d{1,9}$/.test(text(value))) found[field.k] = "Enter a whole number";
    }
    if (kind === "statement" && text(all.period_start) && text(all.period_end) && text(all.period_end) < text(all.period_start)) found.period_end = "The period ends before it starts";
    if (kind === "invoice" && !(Array.isArray(all.loads) && all.loads.length)) found.loads = "Choose at least one completed load";
    setErrors(found);
    if (Object.keys(found).length) return setProblem("Some fields need attention");
    setPending(true);
    setProblem(null);
    try {
      const done = await save(kind, filled, editId, key);
      await client.invalidateQueries({ queryKey: [org.id] });
      close();
      notify(done.message);
      if (done.go) set({ ...done.go, overlay: "none", modal: "none" });
    } catch (error) {
      setErrors(error instanceof ApiError ? Object.fromEntries(Object.entries(error.fieldErrors).map(([path, message]) => [path.replace(/^(vehicle_id|trailer_id)$/, "unit").split(".").pop()!, message])) : {});
      setProblem(errorMessage(error));
      setKey(idempotencyKey());
    }
    setPending(false);
  }

  const loading = editId && editing.isPending;
  const groups: { l: string; fields: Field[] }[] = [];
  for (const f of fields) {
    const g = f.group ?? "";
    const last = groups.at(-1);
    if (last && last.l === g) last.fields.push(f);
    else groups.push({ l: g, fields: [f] });
  }
  const comboState = { open: dd, q: ddq, setOpen: setDd, setQ: setDdq };
  const renderField = (field: Field) => {
    const id = `md-${field.k}`;
    const value = field.k === "unit_number" && !text(all[field.k]) && suggestion ? suggestion : all[field.k];
    const problem = errors[field.k];
    const label = `${field.l}${field.required ? " *" : ""}`;
    const hint = field.k === "unit_number" && suggestion ? "The next free number" : field.hint;
    if (field.type === "check") {
      return (
        <label key={field.k} className="r g8 fs13" style={{ gridColumn: `span ${field.span}` }}>
          <input type="checkbox" checked={value === true} onChange={(event) => put(field.k, event.target.checked)} />
          {field.l}
        </label>
      );
    }
    if (field.type === "loads") {
      const picked = Array.isArray(value) ? value : [];
      const loads = ready.data?.items ?? [];
      return (
        <div key={field.k} className="fld" style={{ gridColumn: `span ${field.span}` }}>
          <span className="lbl">{field.l}</span>
          <div className="card oh" style={{ boxShadow: "none", maxHeight: "220px", overflow: "auto" }}>
            {!customer ? <div className="cb fs13 mu">Choose the customer first.</div> : ready.isPending ? <div className="cb fs13 mu">Loading…</div> : !loads.length ? <div className="cb fs13 mu">This customer has no completed loads waiting to be invoiced.</div> : null}
            {loads.map((load) => (
              <label key={load.id} className="r g10 fs13" style={{ padding: "8px 12px", borderBottom: "1px solid var(--bd2)" }}>
                <input type="checkbox" checked={picked.includes(load.id)} onChange={(event) => put(field.k, event.target.checked ? [...picked, load.id] : picked.filter((id2) => id2 !== load.id))} />
                <span className="mono w5">{load.load_number}</span>
                <span className="f1 ell t2">{`${load.origin_city ?? ""} → ${load.destination_city ?? ""}`}</span>
                <span className="mono">{formatMoney(load.revenue, load.currency)}</span>
              </label>
            ))}
          </div>
          {problem ? <span className="errt">{problem}</span> : null}
        </div>
      );
    }
    if (field.type === "combo") {
      const opts = comboOptions(field);
      const current = text(value);
      const otherOn = !!field.other && (others[field.k] || (!!current && !opts.some((o) => o.v === current)));
      const f = combo(comboState, {
        k: field.k, l: field.l, value: current, options: opts, onPick: (picked) => { put(field.k, picked); setOthers((o) => ({ ...o, [field.k]: false })); },
        placeholder: `Choose ${field.l.toLowerCase().startsWith("plate state") || field.l.toLowerCase().startsWith("issuing") ? "a state" : `a ${field.l.toLowerCase()}`}`,
        head: field.options === "states" ? "50 states and DC" : field.options === "truckMakes" ? "Most common in North America" : field.options === "owners" ? "Who owns it" : field.l,
        search: field.options === "states" || opts.length > 10, qph: field.options === "states" ? "Search states" : undefined,
        ...(field.other ? { other: { ...field.other, value: otherOn ? current : "", set: (typed: string) => put(field.k, typed) }, otherOn, onOther: () => { setOthers((o) => ({ ...o, [field.k]: true })); put(field.k, ""); } } : {}),
      });
      return (
        <div key={field.k} className="fld" style={{ gridColumn: `span ${field.span}` }}>
          <span className="lbl"><span>{label}</span></span>
          <Combobox f={f} />
          {f.showOther ? (
            <>
              <label className="othl" htmlFor={`${id}-other`}>{field.other!.label}</label>
              <input id={`${id}-other`} className="inp othr" value={current} placeholder={field.other!.ph} onChange={(event) => put(field.k, event.target.value)} />
            </>
          ) : null}
          {problem ? <span className="errt">{problem}</span> : hint ? <span className="hint">{hint}</span> : null}
        </div>
      );
    }
    if (field.type === "seg") {
      return (
        <div key={field.k} className="fld" style={{ gridColumn: `span ${field.span}` }}>
          <span className="lbl"><span>{label}</span></span>
          <div className="seg" role="group" aria-label={field.l} style={{ alignSelf: "flex-start" }}>
            {choicesOf(field).map(([optionValue, optionLabel]) => (
              <button key={optionValue} className={text(value) === optionValue ? "on" : ""} aria-pressed={text(value) === optionValue} onClick={() => put(field.k, optionValue)}><span>{optionLabel}</span></button>
            ))}
          </div>
          {problem ? <span className="errt">{problem}</span> : hint ? <span className="hint">{hint}</span> : null}
        </div>
      );
    }
    return (
      <div key={field.k} className="fld" style={{ gridColumn: `span ${field.span}` }}>
        <label htmlFor={id}>{label}</label>
        {field.type === "select" ? (
          <select id={id} className={clsx("inp", problem && "err")} value={text(value)} onChange={(event) => put(field.k, event.target.value)}>
            {!field.required || !text(value) ? <option value="">{field.required ? "Choose…" : "—"}</option> : null}
            {choicesOf(field).map(([optionValue, optionLabel]) => (
              <option key={optionValue} value={optionValue}>{optionLabel}</option>
            ))}
          </select>
        ) : field.type === "textarea" ? (
          <textarea id={id} className={clsx("inp", problem && "err")} rows={3} value={text(value)} onChange={(event) => put(field.k, event.target.value)} />
        ) : (
          <input
            id={id}
            className={clsx("inp", (field.mono || field.type === "money" || field.type === "number") && "mono", problem && "err")}
            type={field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "password" ? "password" : "text"}
            inputMode={field.type === "money" ? "decimal" : field.type === "number" ? "numeric" : undefined}
            placeholder={field.placeholder}
            value={text(value)}
            onChange={(event) => put(field.k, event.target.value)}
          />
        )}
        {problem ? <span className="errt">{problem}</span> : hint ? <span className="hint">{hint}</span> : null}
      </div>
    );
  };
  const grouped = groups.some((g) => g.l);
  return (
    <>
      <div className="scrim" style={{ zIndex: "50" }} onClick={() => !pending && close()}></div>
      <div className={clsx("modal", (fields.length > 8 || grouped) && "mid")} role="dialog" aria-modal="true" aria-label={spec.title(!!editId)}>
        <div className="mh">
          <span className="mhic"><Icon className="s18" d={spec.icon} /></span>
          <div className="f1">
            <h2 className="fs16 w6 tx"><span>{spec.title(!!editId)}</span></h2>
            <p className="fs13 mu" style={{ marginTop: "2px" }}><span>{editId && spec.sub === "Enter manually" ? "Changes are checked by the server when you save" : spec.sub}</span></p>
          </div>
          <button className="btn ghost icon sm" onClick={close} aria-label="Close" disabled={pending}><Icon d="M18 6L6 18M6 6l12 12" /></button>
        </div>
        <div className="mbody c g12">
          <Problem message={problem} />
          {loading ? (
            <Skeleton />
          ) : grouped ? (
            groups.map((g) => (
              <div key={g.l}>
                <div className="over" style={{ marginBottom: "10px" }}><span>{g.l}</span></div>
                <div className="mgrid">{g.fields.map(renderField)}</div>
              </div>
            ))
          ) : (
            <div className="sgrid" style={{ padding: "0" }}>{fields.map(renderField)}</div>
          )}
        </div>
        <div className="mfoot">
          {flow && !editId ? <button className="btn ghost" onClick={() => set({ mstep: "choose" })} disabled={pending}>Back</button> : <span className="fs12 mu">Checked again by the server when you save</span>}
          <span className="sp"></span>
          <button className="btn" onClick={close} disabled={pending}>Cancel</button>
          <button className="btn pri" onClick={() => void submit()} disabled={pending || !!loading}>{pending ? "Saving…" : editId ? "Save changes" : flow ? flow.cta : spec.title(false).replace(/^Add an? /, "Add ").replace(/^Log an /, "Log ")}</button>
        </div>
      </div>
    </>
  );
}
