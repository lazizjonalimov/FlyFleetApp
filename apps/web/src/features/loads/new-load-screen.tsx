"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { Problem } from "@/components/feedback/dialog";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { TRAILER_TYPES } from "@/features/fleet/labels";
import { api, idempotencyKey, unwrap } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fromLocalInput, timeZoneLabel } from "@/lib/format/dates";
import { formatMoney, multiplyMoney, sumMoney, toCents } from "@/lib/format/money";
import { formatNumber } from "@/lib/format/text";
import { ACCEPT, checkFile, uploadDocument } from "@/lib/upload";
import { CHARGES } from "./load-view";

type Kind = "pickup" | "delivery";
type Timing = "window" | "appointment" | "fcfs";
type StopForm = { type: Kind; name: string; address: string; city: string; state: string; postal: string; timing: Timing; date: string; from: string; to: string; reference: string; instructions: string };
type ChargeForm = { type: string; description: string; quantity: string; rate: string; billable: boolean; driverPayable: boolean };
type Values = {
  customer: string;
  reference: string;
  bol: string;
  equipment: string;
  commodity: string;
  weight: string;
  miles: string;
  terminal: string;
  stops: StopForm[];
  rate: string;
  charges: ChargeForm[];
  instructions: string;
};

const blankStop = (type: Kind): StopForm => ({ type, name: "", address: "", city: "", state: "", postal: "", timing: "window", date: "", from: "", to: "", reference: "", instructions: "" });
const EMPTY: Values = { customer: "", reference: "", bol: "", equipment: "dry_van", commodity: "", weight: "", miles: "", terminal: "", stops: [blankStop("pickup"), blankStop("delivery")], rate: "", charges: [], instructions: "" };

const STEPS = ["Customer & references", "Load basics", "Stops & appointments", "Rate & charges", "Documents & notes", "Review"];
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const SIGNED = /^-?\d{1,10}(\.\d{1,2})?$/;
const WHOLE = /^\d{1,7}$/;

type Errors = Record<string, string>;

/** What is wrong with the values, field by field. `planned` asks for everything a bookable load needs. */
function check(values: Values, planned: boolean): Errors {
  const errors: Errors = {};
  if (!values.customer) errors.customer = "Choose the customer";
  if (values.weight && !WHOLE.test(values.weight)) errors.weight = "Enter a whole number of pounds";
  if (values.miles && !WHOLE.test(values.miles)) errors.miles = "Enter a whole number of miles";
  values.stops.forEach((stop, i) => {
    const used = planned || stop.city || stop.name || stop.date;
    if (used && !stop.city.trim()) errors[`stops.${i}.city`] = "Enter the city";
    if (stop.state && !/^[A-Za-z]{2}$/.test(stop.state)) errors[`stops.${i}.state`] = "Use the two-letter code, like IL";
    if ((stop.from || stop.to) && !stop.date) errors[`stops.${i}.date`] = "Choose the date";
    if (stop.timing === "window" && stop.from && stop.to && stop.to <= stop.from) errors[`stops.${i}.to`] = `The window ends before it starts. Choose an end time after ${stop.from}.`;
  });
  if (planned) {
    const kinds = values.stops.map((stop) => stop.type);
    if (kinds.length < 2 || kinds[0] !== "pickup" || kinds[kinds.length - 1] !== "delivery") errors.route = "A load needs at least one pickup, and must end with a delivery.";
    if (!MONEY.test(values.rate)) errors.rate = "Enter the line haul, like 2500 or 2500.00";
  } else if (values.rate && !MONEY.test(values.rate)) errors.rate = "Enter an amount like 2500 or 2500.00";
  values.charges.forEach((charge, i) => {
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(charge.quantity) || Number(charge.quantity) <= 0) errors[`charges.${i}.quantity`] = "Enter a quantity above zero";
    if (!SIGNED.test(charge.rate)) errors[`charges.${i}.rate`] = "Enter an amount like 75.00";
  });
  return errors;
}

/** The step each error belongs to, so the form can take the person there. */
const stepOf = (field: string): number => (["customer", "reference", "bol"].includes(field) ? 0 : ["equipment", "commodity", "weight", "miles", "terminal"].includes(field) ? 1 : field.startsWith("stops") || field === "route" ? 2 : field === "rate" || field.startsWith("charges") ? 3 : 4);

/** Guided new-load form: six steps, a running summary, and the checks a load must pass before it is saved. */
export function NewLoadScreen() {
  const { me, can, fin, noFin, set, notify } = useConsole();
  const client = useQueryClient();
  const org = me.organization;
  const zone = org.timezone;
  const [values, setValues] = useState<Values>(EMPTY);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<"draft" | "planned" | null>(null);
  const [rateConfirmation, setRateConfirmation] = useState<File | null>(null);
  // one key for this booking: a retry after a lost answer is recognised by the API and not booked twice
  const [key] = useState(idempotencyKey);
  const dirty = JSON.stringify(values) !== JSON.stringify(EMPTY) || !!rateConfirmation;

  const customers = useQuery({ queryKey: [org.id, "customers", "options"], queryFn: () => unwrap(api.GET("/api/v1/customers", { params: { query: { status: "active", sort: "name", limit: 100 } } })), staleTime: 60_000 });
  const terminals = useQuery({ queryKey: [org.id, "terminals", "options"], queryFn: () => unwrap(api.GET("/api/v1/terminals", { params: { query: { status: "active", sort: "name", limit: 100 } } })), staleTime: 60_000 });
  const customer = customers.data?.items.find((each) => each.id === values.customer);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const put = <K extends keyof Values>(field: K, value: Values[K]) => setValues((previous) => ({ ...previous, [field]: value }));
  const putStop = (index: number, patch: Partial<StopForm>) => put("stops", values.stops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)));
  const putCharge = (index: number, patch: Partial<ChargeForm>) => put("charges", values.charges.map((charge, i) => (i === index ? { ...charge, ...patch } : charge)));
  const moveStop = (index: number, by: number) => {
    const stops = [...values.stops];
    const [moved] = stops.splice(index, 1);
    stops.splice(index + by, 0, moved!);
    put("stops", stops);
  };
  const go = (to: number) => {
    setStep(to);
    setReached((most) => Math.max(most, to));
  };

  // the step in front of the person is checked when they move on; the rest when they save
  const stepErrors = (index: number) => Object.fromEntries(Object.entries(check(values, true)).filter(([field]) => stepOf(field) === index && (index !== 3 || field !== "rate" || fin)));
  function next() {
    const found = stepErrors(step);
    setErrors(found);
    setProblem(found.route ?? null);
    if (!Object.keys(found).length) go(Math.min(step + 1, STEPS.length - 1));
  }

  const stopToApi = (stop: StopForm) => {
    const start = stop.date ? fromLocalInput(`${stop.date}T${stop.from || "00:00"}`, zone) : null;
    const end = stop.date && stop.timing === "window" && stop.to ? fromLocalInput(`${stop.date}T${stop.to}`, zone) : null;
    const blank = (text: string) => text.trim() || null;
    return { type: stop.type, name: blank(stop.name), address: blank(stop.address), city: stop.city.trim(), state: blank(stop.state.toUpperCase()), postal_code: blank(stop.postal), appt_start: start, appt_end: end, reference: blank(stop.reference), instructions: blank(stop.instructions) };
  };

  async function save(status: "draft" | "planned") {
    const found = check(values, status === "planned");
    if (!fin) delete found.rate;
    setErrors(found);
    if (Object.keys(found).length) {
      setProblem(found.route ?? "Some fields need attention");
      return go(Math.min(...Object.keys(found).map(stepOf)));
    }
    setProblem(null);
    setPending(status);
    try {
      const whole = (text: string) => (text.trim() ? Number(text) : null);
      // a draft keeps only the stops that have something in them
      const stops = values.stops.filter((stop) => status === "planned" || stop.city.trim());
      const load = await unwrap(
        api.POST("/api/v1/loads", {
          params: { header: { "idempotency-key": key } },
          body: {
            customer_id: values.customer,
            status,
            terminal_id: values.terminal || null,
            reference: values.reference.trim() || null,
            bol_number: values.bol.trim() || null,
            commodity: values.commodity.trim() || null,
            equipment_type: values.equipment as "dry_van",
            weight_lbs: whole(values.weight),
            miles: whole(values.miles),
            instructions: values.instructions.trim() || null,
            customer_rate: values.rate || "0",
            stops: stops.map(stopToApi),
            charges: values.charges.map((charge) => ({ type: charge.type as "other", description: charge.description.trim() || null, quantity: charge.quantity, rate: charge.rate, billable: charge.billable, driver_payable: charge.driverPayable })),
          },
        }),
      );
      let attached = "";
      if (rateConfirmation) {
        try {
          await uploadDocument({ file: rateConfirmation, type: "rate_confirmation", entityType: "load", entityId: load.id });
          attached = " with its rate confirmation";
        } catch (error) {
          attached = ` — the rate confirmation wasn’t attached (${errorMessage(error)}); add it from the load`;
        }
      }
      await client.invalidateQueries({ queryKey: [org.id] });
      setValues(EMPTY);
      setRateConfirmation(null);
      notify(`${status === "draft" ? `Draft ${load.load_number} saved` : `Load ${load.load_number} booked`}${attached}`, attached.startsWith(" —"));
      set({ screen: "load", loadId: load.id, overlay: "none", modal: "none" });
    } catch (error) {
      const fields = error instanceof ApiError ? error.fieldErrors : {};
      const mapped: Errors = {};
      for (const [path, message] of Object.entries(fields)) mapped[path.replace("customer_id", "customer").replace("customer_rate", "rate").replace("bol_number", "bol").replace("equipment_type", "equipment").replace("weight_lbs", "weight").replace("terminal_id", "terminal").replace(".postal_code", ".postal")] = message;
      setErrors(mapped);
      setProblem(errorMessage(error));
      if (Object.keys(mapped).length) go(Math.min(...Object.keys(mapped).map(stepOf)));
      setPending(null);
    }
  }

  const err = (field: string) => errors[field];
  const field = (id: string, label: string, input: React.ReactNode, span: number, problem?: string, hint?: string) => (
    <div className="fld" style={{ gridColumn: `span ${span}` }}>
      <label htmlFor={id}>{label}</label>
      {input}
      {problem ? (
        <p className="errt" id={`${id}-e`}>
          <Icon className="s14" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
          {problem}
        </p>
      ) : hint ? (
        <span className="hint">{hint}</span>
      ) : null}
    </div>
  );
  const text = (id: string, value: string, change: (value: string) => void, problem?: string, { className, ...extra }: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input id={id} {...extra} className={clsx("inp", className, problem && "err")} value={value} onChange={(event) => change(event.target.value)} aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${id}-e` : undefined} />
  );

  const charges = values.charges.filter((charge) => charge.billable).map((charge) => multiplyMoney(charge.quantity, charge.rate) ?? "0");
  const total = sumMoney([values.rate || "0", ...charges]);
  const miles = Number(values.miles) || 0;
  const perMile = miles && toCents(total) ? `$${((toCents(total) ?? 0) / 100 / miles).toFixed(2)}` : "—";
  const stopsDone = values.stops.filter((stop) => stop.city.trim()).length;
  const summaries = [
    customer ? [customer.name, values.reference].filter(Boolean).join(" · ") : "Who it is for",
    [TRAILER_TYPES[values.equipment], values.weight ? `${formatNumber(Number(values.weight))} lb` : ""].filter(Boolean).join(" · "),
    stopsDone ? `${values.stops.length} stops` : "Where and when",
    values.rate && fin ? formatMoney(total, org.base_currency) : "Line haul, fuel, accessorials",
    rateConfirmation ? "Rate confirmation attached" : "Rate confirmation, instructions",
    "Check and save",
  ];
  const allErrors = check(values, true);
  if (!fin) delete allErrors.rate;
  const checks = [
    { ok: !allErrors.route, text: allErrors.route ? "The route must start with a pickup and end with a delivery" : "Stops are in a valid order" },
    ...values.stops.flatMap((stop, i) => (errors[`stops.${i}.to`] || allErrors[`stops.${i}.to`] ? [{ ok: false, text: `Stop ${i + 1} ${stop.type} window is invalid` }] : [])),
    { ok: !!customer, text: customer ? "Customer chosen" : "Choose the customer" },
    ...(fin ? [{ ok: MONEY.test(values.rate), text: MONEY.test(values.rate) ? "Line haul entered" : "Enter the line haul" }] : []),
    { ok: !!rateConfirmation, warn: true, text: rateConfirmation ? "Rate confirmation will be attached" : "Rate confirmation not attached yet — it can be added after saving" },
  ];
  const blocking = checks.filter((each) => !each.ok && !each.warn).length;
  const cancel = () => set(goTo("loads"));

  if (!can("loads.create")) return null;

  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "14px", borderBottom: "1px solid var(--bd)" }}>
        <div className="f1">
          <div className="crumb">
            <span>Operations</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <button onClick={cancel}>Loads</button>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>New load</b>
          </div>
          <div className="r g10">
            <h1 className="h1">New load</h1>
            <span className="badge" data-k="draft">
              <i></i>
              Draft · not saved
            </span>
          </div>
        </div>
        <div className="r g8">
          <button className="btn ghost" onClick={cancel} disabled={pending !== null}>Cancel</button>
          <button className="btn" onClick={() => void save("draft")} disabled={pending !== null}>{pending === "draft" ? "Saving…" : "Save draft"}</button>
        </div>
      </div>
      <div className="nlg">
        <nav className="nlsteps" aria-label="Steps">
          {STEPS.map((label, i) => {
            const state = i === step ? "cur" : i <= reached && Object.keys(stepErrors(i)).length === 0 && i < reached ? "done" : "";
            return (
              <button key={label} className={clsx("nls", state)} onClick={() => i <= reached && go(i)} disabled={i > reached} aria-current={i === step ? "step" : undefined} style={{ border: state === "cur" ? undefined : "1px solid transparent", background: state === "cur" ? undefined : "transparent", textAlign: "left", width: "100%" }}>
                <span className="nln">
                  {state === "done" ? (
                    <Icon className="s12 b" d="M5 12l5 5 9-10" />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </span>
                <span className="c">
                  <span className="fs13 w5"><span>{label}</span></span>
                  <span className="fs12 mu"><span>{summaries[i]}</span></span>
                </span>
              </button>
            );
          })}
          <p className="note" style={{ marginTop: "auto" }}>
            <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
            Everything here is validated again by the server when you save — the form only gives faster feedback.
          </p>
        </nav>
        <div className="nlmain">
          <div className="r g8" style={{ marginBottom: "4px" }}><span className="over">{`Step ${step + 1} of ${STEPS.length}`}</span></div>
          <h2 style={{ fontSize: "18px", lineHeight: "24px", fontWeight: "600" }}>{STEPS[step]}</h2>
          <p className="fs13 mu" style={{ margin: "2px 0 16px" }}>
            {["Who the load is for, and the numbers they use for it.", "What is moving and what it needs.", `Stops run in order. Times are in ${timeZoneLabel(zone)}, the company’s time zone.`, "What the customer pays for the haul, and anything billed on top.", "Paperwork and what the driver needs to know.", "Check everything before saving."][step]}
          </p>
          {problem ? <div style={{ marginBottom: "12px" }}><Problem message={problem} /></div> : null}

          {step === 0 ? (
            <section className="card stopc">
              <div className="sgrid">
                {field(
                  "nl-c",
                  "Customer",
                  <select id="nl-c" className={clsx("inp", err("customer") && "err")} value={values.customer} onChange={(event) => put("customer", event.target.value)} aria-invalid={err("customer") ? true : undefined}>
                    <option value="">{customers.isPending ? "Loading customers…" : customers.data?.items.length ? "Choose a customer" : "No active customers — add one under Customers"}</option>
                    {customers.data?.items.map((each) => (
                      <option key={each.id} value={each.id}>{each.name}</option>
                    ))}
                  </select>,
                  6,
                  err("customer"),
                  customer ? `${customer.payment_terms_days ? `Net ${customer.payment_terms_days}` : "Due on receipt"}${customer.billing_email ? ` · bills go to ${customer.billing_email}` : ""}` : undefined,
                )}
                {field("nl-ref", "Customer’s reference", text("nl-ref", values.reference, (v) => put("reference", v), err("reference"), { className: "mono", placeholder: "PO or order number" }), 3, err("reference"))}
                {field("nl-bol", "BOL number", text("nl-bol", values.bol, (v) => put("bol", v), err("bol"), { className: "mono" }), 3, err("bol"))}
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="card stopc">
              <div className="sgrid">
                {field(
                  "nl-eq",
                  "Equipment",
                  <select id="nl-eq" className="inp" value={values.equipment} onChange={(event) => put("equipment", event.target.value)}>
                    {Object.entries(TRAILER_TYPES).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>,
                  2,
                )}
                {field("nl-co", "Commodity", text("nl-co", values.commodity, (v) => put("commodity", v), err("commodity")), 4, err("commodity"))}
                {field("nl-w", "Weight (lb)", text("nl-w", values.weight, (v) => put("weight", v), err("weight"), { className: "mono", inputMode: "numeric" }), 2, err("weight"))}
                {field("nl-mi", "Miles", text("nl-mi", values.miles, (v) => put("miles", v), err("miles"), { className: "mono", inputMode: "numeric" }), 2, err("miles"))}
                {terminals.data?.items.length
                  ? field(
                      "nl-t",
                      "Terminal",
                      <select id="nl-t" className="inp" value={values.terminal} onChange={(event) => put("terminal", event.target.value)}>
                        <option value="">None</option>
                        {terminals.data.items.map((each) => (
                          <option key={each.id} value={each.id}>{each.code ? `${each.name} (${each.code})` : each.name}</option>
                        ))}
                      </select>,
                      2,
                    )
                  : null}
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <div className="c g12">
              {values.stops.map((stop, i) => {
                const prefix = `stops.${i}`;
                const count = Object.keys(errors).filter((key) => key.startsWith(`${prefix}.`)).length;
                return (
                  <section key={i} className="card stopc">
                    <div className="r g8 stoph">
                      <span className="smk" data-k="brand">{i + 1}</span>
                      <div className="seg sm">
                        {(["pickup", "delivery"] as const).map((kind) => (
                          <button key={kind} className={clsx(stop.type === kind && "on")} onClick={() => putStop(i, { type: kind })}>{kind === "pickup" ? "Pickup" : "Delivery"}</button>
                        ))}
                      </div>
                      {count ? <span className="tag" data-k="bad" style={{ marginLeft: "4px" }}>{count === 1 ? "1 error" : `${count} errors`}</span> : null}
                      <span className="sp"></span>
                      {i > 0 ? <button className="btn ghost xs icon" aria-label="Move stop up" onClick={() => moveStop(i, -1)}><Icon className="s14" d="M18 15l-6-6-6 6" /></button> : null}
                      {i < values.stops.length - 1 ? <button className="btn ghost xs icon" aria-label="Move stop down" onClick={() => moveStop(i, 1)}><Icon className="s14" d="M6 9l6 6 6-6" /></button> : null}
                      {values.stops.length > 1 ? <button className="btn ghost xs icon" aria-label="Remove stop" onClick={() => put("stops", values.stops.filter((_, j) => j !== i))}><Icon className="s14" d="M18 6L6 18M6 6l12 12" /></button> : null}
                    </div>
                    <div className="sgrid">
                      {field(`nl-f${i}`, "Facility", text(`nl-f${i}`, stop.name, (v) => putStop(i, { name: v }), err(`${prefix}.name`), { placeholder: "Name of the shipper or receiver" }), 3, err(`${prefix}.name`))}
                      {field(`nl-ad${i}`, "Address", text(`nl-ad${i}`, stop.address, (v) => putStop(i, { address: v }), err(`${prefix}.address`)), 3, err(`${prefix}.address`))}
                      {field(`nl-ci${i}`, "City", text(`nl-ci${i}`, stop.city, (v) => putStop(i, { city: v }), err(`${prefix}.city`)), 3, err(`${prefix}.city`))}
                      {field(`nl-st${i}`, "State", text(`nl-st${i}`, stop.state, (v) => putStop(i, { state: v.toUpperCase() }), err(`${prefix}.state`), { maxLength: 2, className: "mono" }), 1, err(`${prefix}.state`))}
                      {field(`nl-zip${i}`, "ZIP", text(`nl-zip${i}`, stop.postal, (v) => putStop(i, { postal: v }), err(`${prefix}.postal`), { className: "mono" }), 2, err(`${prefix}.postal`))}
                      <div className="fld" style={{ gridColumn: "span 2" }}>
                        <span className="lbl">Appointment type</span>
                        <div className="seg">
                          {([["window", "Window"], ["appointment", "Appointment"], ["fcfs", "FCFS"]] as const).map(([value, label]) => (
                            <button key={value} className={clsx(stop.timing === value && "on")} onClick={() => putStop(i, { timing: value, ...(value === "window" ? {} : { to: "" }) })}>{label}</button>
                          ))}
                        </div>
                      </div>
                      {field(`nl-d${i}`, "Date", text(`nl-d${i}`, stop.date, (v) => putStop(i, { date: v }), err(`${prefix}.date`), { type: "date" }), 2, err(`${prefix}.date`))}
                      {field(`nl-a${i}`, stop.timing === "fcfs" ? "Open from" : stop.timing === "appointment" ? "At" : "From", text(`nl-a${i}`, stop.from, (v) => putStop(i, { from: v }), err(`${prefix}.from`), { type: "time", className: "mono" }), 1, err(`${prefix}.from`))}
                      {stop.timing === "window" ? field(`nl-b${i}`, "To", text(`nl-b${i}`, stop.to, (v) => putStop(i, { to: v }), err(`${prefix}.to`), { type: "time", className: "mono" }), 1) : <div style={{ gridColumn: "span 1" }}></div>}
                      {err(`${prefix}.to`) ? (
                        <div className="fld" style={{ gridColumn: "span 6" }}>
                          <p className="errt" id={`nl-b${i}-e`}>
                            <Icon className="s14" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
                            {err(`${prefix}.to`)}
                          </p>
                        </div>
                      ) : null}
                      {field(`nl-r${i}`, stop.type === "pickup" ? "Pickup number" : "Delivery number", text(`nl-r${i}`, stop.reference, (v) => putStop(i, { reference: v }), err(`${prefix}.reference`), { className: "mono" }), 2, err(`${prefix}.reference`))}
                      {field(`nl-i${i}`, "Driver instructions", text(`nl-i${i}`, stop.instructions, (v) => putStop(i, { instructions: v }), err(`${prefix}.instructions`), { placeholder: "Dock, lumper, contact on arrival…" }), 4, err(`${prefix}.instructions`))}
                    </div>
                  </section>
                );
              })}
              <button className="addstop" onClick={() => put("stops", [...values.stops, blankStop("delivery")])}>
                <Icon className="s14 b" d="M12 5v14M5 12h14" />
                Add stop
                <span className="fs12 mu" style={{ fontWeight: "400" }}>Pickup or delivery</span>
              </button>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="c g12">
              {fin ? (
                <section className="card stopc">
                  <div className="sgrid">{field("nl-rate", `Line haul (${org.base_currency})`, text("nl-rate", values.rate, (v) => put("rate", v), err("rate"), { className: "mono", inputMode: "decimal", placeholder: "2500.00" }), 2, err("rate"))}</div>
                </section>
              ) : (
                <div className="note">
                  <Icon className="s14" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
                  Rate entry needs the “See customer rates and charges” permission. Someone with it can complete the rate later.
                </div>
              )}
              {values.charges.map((charge, i) => (
                <section key={i} className="card stopc">
                  <div className="r g8 stoph">
                    <span className="h3">{`Charge ${i + 1}`}</span>
                    <span className="sp"></span>
                    <button className="btn ghost xs icon" aria-label="Remove charge" onClick={() => put("charges", values.charges.filter((_, j) => j !== i))}><Icon className="s14" d="M18 6L6 18M6 6l12 12" /></button>
                  </div>
                  <div className="sgrid">
                    {field(
                      `nl-ct${i}`,
                      "Type",
                      <select id={`nl-ct${i}`} className="inp" value={charge.type} onChange={(event) => putCharge(i, { type: event.target.value })}>
                        {Object.entries(CHARGES).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>,
                      2,
                    )}
                    {field(`nl-cd${i}`, "Description", text(`nl-cd${i}`, charge.description, (v) => putCharge(i, { description: v })), 4)}
                    {field(`nl-cq${i}`, "Quantity", text(`nl-cq${i}`, charge.quantity, (v) => putCharge(i, { quantity: v }), err(`charges.${i}.quantity`), { className: "mono", inputMode: "decimal" }), 1, err(`charges.${i}.quantity`))}
                    {field(`nl-cr${i}`, "Rate", text(`nl-cr${i}`, charge.rate, (v) => putCharge(i, { rate: v }), err(`charges.${i}.rate`), { className: "mono", inputMode: "decimal" }), 1, err(`charges.${i}.rate`))}
                    <div className="fld" style={{ gridColumn: "span 4", justifyContent: "flex-end" }}>
                      <div className="r g16 fs13" style={{ height: "36px" }}>
                        <label className="r g6"><input type="checkbox" checked={charge.billable} onChange={(event) => putCharge(i, { billable: event.target.checked })} /> Billed to the customer</label>
                        <label className="r g6"><input type="checkbox" checked={charge.driverPayable} onChange={(event) => putCharge(i, { driverPayable: event.target.checked })} /> Paid to the driver</label>
                      </div>
                    </div>
                  </div>
                </section>
              ))}
              {fin ? (
                <button className="addstop" onClick={() => put("charges", [...values.charges, { type: "fuel_surcharge", description: "", quantity: "1", rate: "", billable: true, driverPayable: false }])}>
                  <Icon className="s14 b" d="M12 5v14M5 12h14" />
                  Add charge
                  <span className="fs12 mu" style={{ fontWeight: "400" }}>Fuel surcharge, detention, lumper…</span>
                </button>
              ) : null}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="c g12">
              <section className="card stopc">
                <div className="sgrid">
                  <div className="fld" style={{ gridColumn: "span 6" }}>
                    <span className="lbl">Rate confirmation</span>
                    <div className="r g8">
                      <label className="btn sm" style={{ cursor: "pointer" }}>
                        <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                        {rateConfirmation ? "Choose another file" : "Choose a file"}
                        <input
                          type="file"
                          accept={ACCEPT}
                          hidden
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            const why = file ? checkFile(file) : null;
                            setErrors((previous) => ({ ...previous, file: why ?? "" }));
                            setRateConfirmation(why ? null : file);
                          }}
                        />
                      </label>
                      <span className="fs13 mu ell">{rateConfirmation ? rateConfirmation.name : "Optional. PDF or a photo, up to 15 MB."}</span>
                      {rateConfirmation ? <button className="lnk" onClick={() => setRateConfirmation(null)}>Remove</button> : null}
                    </div>
                    {err("file") ? <p className="errt">{err("file")}</p> : <span className="hint">Attached to the load when it is saved. Other paperwork can be added from the load.</span>}
                  </div>
                  <div className="fld" style={{ gridColumn: "span 6" }}>
                    <label htmlFor="nl-ins">Instructions for the driver</label>
                    <textarea id="nl-ins" className="inp" rows={4} maxLength={4000} value={values.instructions} onChange={(event) => put("instructions", event.target.value)} />
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {step === 5 ? (
            <section className="card oh">
              <div className="cb c g12">
                <dl className="kv">
                  <dt>Customer</dt>
                  <dd>{customer?.name ?? "—"}</dd>
                  <dt>Reference</dt>
                  <dd className="mono">{values.reference || "—"}</dd>
                  <dt>BOL number</dt>
                  <dd className="mono">{values.bol || "—"}</dd>
                  <dt>Equipment</dt>
                  <dd>{TRAILER_TYPES[values.equipment]}</dd>
                  <dt>Commodity</dt>
                  <dd>{values.commodity || "—"}</dd>
                  <dt>Weight</dt>
                  <dd className="num">{values.weight ? `${formatNumber(Number(values.weight))} lb` : "—"}</dd>
                  <dt>Miles</dt>
                  <dd className="num">{values.miles ? formatNumber(Number(values.miles)) : "—"}</dd>
                </dl>
                <div className="hr"></div>
                {values.stops.map((stop, i) => (
                  <div key={i} className="r g10 ast">
                    <span className="smk" data-k="brand">{i + 1}</span>
                    <div className="f1">
                      <div className="fs13 w5">{`${stop.type === "pickup" ? "Pickup" : "Delivery"} · ${[stop.name, [stop.city, stop.state].filter(Boolean).join(", ")].filter(Boolean).join(" — ") || "No place yet"}`}</div>
                      <div className="fs12 mu num">{stop.date ? `${stop.date}${stop.from ? ` · ${stop.from}${stop.to ? `–${stop.to}` : ""}` : ""}` : "No appointment"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <aside className="nlside">
          <section className="card oh">
            <div className="ch"><h2 className="h2">Summary</h2></div>
            <div className="cb c g12">
              <dl className="kv">
                <dt>Customer</dt>
                <dd>{customer?.name ?? "—"}</dd>
                <dt>Reference</dt>
                <dd className="mono">{values.reference || "—"}</dd>
                <dt>Equipment</dt>
                <dd>{TRAILER_TYPES[values.equipment]}</dd>
                <dt>Commodity</dt>
                <dd>{values.commodity || "—"}</dd>
                <dt>Weight</dt>
                <dd className="num">{values.weight ? `${formatNumber(Number(values.weight))} lb` : "—"}</dd>
                <dt>Distance</dt>
                <dd className="num">{values.miles ? `${formatNumber(Number(values.miles))} mi` : "—"}</dd>
              </dl>
              {fin ? (
                <>
                  <div className="hr"></div>
                  <dl className="kv">
                    <dt>Line haul</dt>
                    <dd className="mono">{MONEY.test(values.rate) ? formatMoney(values.rate, org.base_currency) : "—"}</dd>
                    <dt>Charges</dt>
                    <dd className="mono">{charges.length ? formatMoney(sumMoney(charges), org.base_currency) : "—"}</dd>
                    <dt>Rate / mile</dt>
                    <dd className="mono">{perMile}</dd>
                  </dl>
                </>
              ) : null}
              {noFin ? (
                <div className="note">
                  <Icon className="s14" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
                  Rate entry needs the “See customer rates and charges” permission.
                </div>
              ) : null}
            </div>
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Check before saving</h2>
              <span className="cnt" data-k={blocking ? "bad" : "ok"}>{blocking}</span>
            </div>
            <div className="cb c g10 fs13">
              {checks.map((each, i) => (
                <div key={i} className="r g8 ast">
                  <span className="tc" data-k={each.ok ? "ok" : each.warn ? "warn" : "bad"}>
                    <Icon className={clsx("s14", each.ok && "b")} d={each.ok ? "M5 12l5 5 9-10" : each.warn ? "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" : "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"} />
                  </span>
                  <span className={each.ok ? "t3" : ""}>{each.text}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
      <div className="nlfoot">
        <span className="fs12 mu">Saving creates the load. A draft isn’t offered for dispatch, and nothing is sent to drivers until you dispatch.</span>
        <span className="sp"></span>
        <button className="btn" onClick={() => go(Math.max(0, step - 1))} disabled={step === 0 || pending !== null}>
          <Icon className="s14" d="M15 6l-6 6 6 6" />
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button className="btn pri" onClick={next}>
            {`Continue to ${STEPS[step + 1]!.toLowerCase()}`}
            <Icon className="s14" d="M9 6l6 6-6 6" />
          </button>
        ) : (
          <button className="btn pri" onClick={() => void save("planned")} disabled={pending !== null}>{pending === "planned" ? "Booking…" : "Book load"}</button>
        )}
      </div>
    </div>
  );
}
