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
import { US_STATES } from "@/lib/reference/states";
import { ACCEPT, checkFile, uploadDocument } from "@/lib/upload";
import { FacilityField } from "./facility-field";
import { CHARGES } from "./load-view";
import { estimate, FUEL_CHOICES, nextDates, WEEKDAYS, type Costs } from "./load-money";

type Kind = "pickup" | "delivery" | "fuel_scale";
type Handling = "live" | "drop" | "hook";
type Timing = "window" | "appointment" | "fcfs";
type StopForm = { type: Kind; name: string; address: string; city: string; state: string; postal: string; timing: Timing; date: string; from: string; to: string; reference: string; instructions: string; facility: "" | "saved" | "recent"; handling: Handling };
type ChargeForm = { type: string; description: string; quantity: string; rate: string; billable: boolean; driverPayable: boolean };
type Values = {
  customer: string;
  reference: string;
  bol: string;
  seal: string;
  equipment: string;
  commodity: string;
  weight: string;
  miles: string;
  terminal: string;
  stops: StopForm[];
  rate: string;
  charges: ChargeForm[];
  instructions: string;
  fuel: number;
  freeHours: string;
  detentionRate: string;
  repeat: number[];
  repeatUntil: "dec31" | "jan31" | "none";
};

const blankStop = (type: Kind): StopForm => ({ type, name: "", address: "", city: "", state: "", postal: "", timing: "window", date: "", from: "", to: "", reference: "", instructions: "", facility: "", handling: "live" });
/** A state's two-letter code from a code or a name. */
const stateCode = (text: string | null | undefined): string => {
  const value = (text ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  return US_STATES.find(([, name]) => name.toLowerCase() === value.toLowerCase())?.[0] ?? "";
};
const EMPTY: Values = { customer: "", reference: "", bol: "", seal: "", equipment: "dry_van", commodity: "", weight: "", miles: "", terminal: "", stops: [blankStop("pickup"), blankStop("delivery")], rate: "", charges: [], instructions: "", fuel: 12, freeHours: "2", detentionRate: "75", repeat: [], repeatUntil: "dec31" };
const KIND_LABEL: Record<Kind, string> = { pickup: "Pickup", delivery: "Delivery", fuel_scale: "Fuel / scale" };
/** The last day a repeat runs: the end of this year, the end of next January, or no end. */
const untilOf = (choice: Values["repeatUntil"], today: string): string | null => {
  const year = Number(today.slice(0, 4));
  if (choice === "none") return null;
  if (choice === "dec31") return `${year}-12-31`;
  return `${today.slice(5) > "01-31" ? year + 1 : year}-01-31`;
};

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
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(values.freeHours)) errors.freeHours = "Enter the free hours, like 2";
  if (!MONEY.test(values.detentionRate)) errors.detentionRate = "Enter the hourly rate, like 75";
  values.stops.forEach((stop, i) => {
    const used = planned || stop.city || stop.name || stop.date;
    if (used && !stop.city.trim()) errors[`stops.${i}.city`] = "Enter the city";
    if (stop.state && !/^[A-Za-z]{2}$/.test(stop.state)) errors[`stops.${i}.state`] = "Use the two-letter code, like IL";
    if ((stop.from || stop.to) && !stop.date) errors[`stops.${i}.date`] = "Choose the date";
    if (stop.timing === "window" && stop.from && stop.to && stop.to <= stop.from) errors[`stops.${i}.to`] = `The window ends before it starts. Choose an end time after ${stop.from}.`;
  });
  if (planned) {
    const kinds = values.stops.map((stop) => stop.type);
    if (kinds.length < 2 || kinds[0] !== "pickup" || kinds[kinds.length - 1] !== "delivery") errors.route = "Start with a pickup and end with a delivery.";
    if (!MONEY.test(values.rate)) errors.rate = "Enter the line haul, like 2500 or 2500.00";
  } else if (values.rate && !MONEY.test(values.rate)) errors.rate = "Enter an amount like 2500 or 2500.00";
  values.charges.forEach((charge, i) => {
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(charge.quantity) || Number(charge.quantity) <= 0) errors[`charges.${i}.quantity`] = "Enter a quantity above zero";
    if (!SIGNED.test(charge.rate)) errors[`charges.${i}.rate`] = "Enter an amount like 75.00";
  });
  return errors;
}

/** The step each error belongs to, so the form can take the person there. */
const stepOf = (field: string): number => (["customer", "reference", "bol", "seal"].includes(field) ? 0 : ["equipment", "commodity", "weight", "miles", "terminal"].includes(field) ? 1 : field.startsWith("stops") || field === "route" ? 2 : ["rate", "freeHours", "detentionRate"].includes(field) || field.startsWith("charges") ? 3 : 4);

/** Guided new-load form: six steps, a running summary, and the checks a load must pass before it is saved. */
export function NewLoadScreen() {
  const { me, can, fin, noFin, set, notify } = useConsole();
  const client = useQueryClient();
  const org = me.organization;
  const zone = org.timezone;
  const [values, setValues] = useState<Values>(EMPTY);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const [folded, setFolded] = useState<number[]>([]);
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
  const costs = useQuery({ queryKey: [org.id, "load-costs"], queryFn: () => unwrap(api.GET("/api/v1/load-costs")), enabled: fin, staleTime: 300_000 });
  // Loads to start from: the customer's latest, or the company's when no customer is chosen yet.
  const recent = useQuery({
    queryKey: [org.id, "loads", "copy-from", values.customer],
    queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { ...(values.customer ? { customer_ids: [values.customer] } : {}), sort: "-created_at", limit: 10 } } })),
    staleTime: 60_000,
  });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: zone });
  // The route's miles, estimated from the stops' cities as they are typed.
  const points = values.stops.map((stop) => ({ city: stop.city.trim(), state: stop.state.trim() || null }));
  const routed = points.filter((point) => point.city).length >= 1;
  const route = useQuery({
    queryKey: [org.id, "route-estimate", JSON.stringify(points)],
    queryFn: () => unwrap(api.POST("/api/v1/route-estimate", { body: { stops: points } })),
    enabled: routed,
    staleTime: 60_000,
  });
  // Is the reference already on another of this customer's loads?
  const reference = values.reference.trim();
  const sameReference = useQuery({
    queryKey: [org.id, "loads", "reference", values.customer, reference],
    queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { customer_id: values.customer, q: reference, limit: 10 } } })),
    enabled: !!values.customer && reference.length >= 2,
    staleTime: 30_000,
  });
  const duplicate = sameReference.data?.items.find((load) => (load.reference ?? "").trim().toLowerCase() === reference.toLowerCase() && load.status !== "cancelled");
  const account = useQuery({ queryKey: [org.id, "customers", "detail", values.customer], queryFn: () => unwrap(api.GET("/api/v1/customers/{customer_id}", { params: { path: { customer_id: values.customer } } })), enabled: !!values.customer, staleTime: 60_000 });
  /** The line under a stop's facility: a saved facility, how far it is from the stop before, or that it isn't on the map. */
  const stopNote = (i: number): string | undefined => {
    const stop = values.stops[i]!;
    const parts: string[] = [];
    if (stop.facility === "saved") parts.push("Saved facility");
    else if (stop.facility === "recent") parts.push("Used on an earlier load");
    const located = route.data?.located[i];
    if (stop.city.trim() && located === false) parts.push("not on FlyFleet’s map, so miles to it can’t be estimated");
    else if (i > 0 && route.data?.legs[i - 1] !== null && route.data?.legs[i - 1] !== undefined) parts.push(`${formatNumber(route.data.legs[i - 1]!)} mi from stop ${i} (estimate)`);
    else if (located && stop.city.trim()) parts.push(`on the map · ${[stop.city.trim(), stop.state.trim()].filter(Boolean).join(", ")}`);
    if (!parts.length) return undefined;
    const text = parts.join(" · ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Fill the form from an earlier load: the route, freight and terms, without its dates. */
  async function copyFrom(id: string) {
    if (!id) return;
    try {
      const src = await unwrap(api.GET("/api/v1/loads/{load_id}", { params: { path: { load_id: id } } }));
      setValues({
        ...EMPTY,
        customer: src.customer.id,
        equipment: src.equipment_type,
        commodity: src.commodity ?? "",
        weight: src.weight_lbs ? String(src.weight_lbs) : "",
        miles: src.miles ? String(src.miles) : "",
        terminal: src.terminal_id ?? "",
        instructions: src.instructions ?? "",
        rate: fin && src.customer_rate ? src.customer_rate : "",
        fuel: fin && src.fuel_surcharge_pct !== null && src.fuel_surcharge_pct !== undefined ? Number(src.fuel_surcharge_pct) : 12,
        freeHours: String(Number(src.detention_free_hours ?? 2)),
        detentionRate: fin && src.detention_rate ? String(Number(src.detention_rate)) : "75",
        stops: src.stops.map((s) => ({ ...blankStop(s.type as Kind), name: s.name ?? "", address: s.address ?? "", city: s.city, state: s.state ?? "", postal: s.postal_code ?? "", instructions: s.instructions ?? "", handling: (s.handling ?? "live") as Handling })),
      });
      notify(`Copied from ${src.load_number} · set the dates for each stop`);
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }

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
    return { type: stop.type, handling: stop.handling, name: blank(stop.name), address: blank(stop.address), city: stop.city.trim(), state: blank(stop.state.toUpperCase()), postal_code: blank(stop.postal), appt_start: start, appt_end: end, reference: blank(stop.reference), instructions: blank(stop.instructions) };
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
            // Saved as a draft; it is marked ready once its rate confirmation is attached.
            status: "draft",
            terminal_id: values.terminal || null,
            reference: values.reference.trim() || null,
            bol_number: values.bol.trim() || null,
            seal_number: values.seal.trim() || null,
            pickup_number: values.stops.find((s) => s.type === "pickup")?.reference.trim() || null,
            delivery_number: [...values.stops].reverse().find((s) => s.type === "delivery")?.reference.trim() || null,
            // Without rates, the money terms go as the API's defaults and someone with rates sets them.
            ...(fin ? { fuel_surcharge_pct: String(values.fuel), detention_free_hours: values.freeHours, detention_rate: values.detentionRate } : { fuel_surcharge_pct: "0", detention_free_hours: "2", detention_rate: "75" }),
            ...(values.repeat.length ? { recurrence: { days: values.repeat, until: untilOf(values.repeatUntil, today) } } : {}),
            commodity: values.commodity.trim() || null,
            equipment_type: values.equipment as "dry_van",
            weight_lbs: whole(values.weight),
            miles: whole(values.miles),
            instructions: values.instructions.trim() || null,
            customer_rate: values.rate || "0",
            stops: stops.map(stopToApi),
            charges: values.charges.map((charge) => ({ type: charge.type as "other", description: charge.description.trim() || null, quantity: charge.quantity, rate: charge.rate, billable: charge.billable, driver_payable: charge.driverPayable, status: "approved" as const })),
          },
        }),
      );
      let said = `Draft ${load.load_number} saved`;
      let bad = false;
      if (rateConfirmation) {
        try {
          await uploadDocument({ file: rateConfirmation, type: "rate_confirmation", entityType: "load", entityId: load.id });
          if (status === "planned") {
            await unwrap(api.POST("/api/v1/loads/{load_id}/transitions", { params: { path: { load_id: load.id } }, body: { action: "mark_ready", version: load.version } }));
            said = `Load ${load.load_number} booked with its rate confirmation`;
          } else said += " with its rate confirmation";
        } catch (error) {
          said += ` — the rate confirmation wasn’t attached (${errorMessage(error)}); add it from the load`;
          bad = true;
        }
      } else if (status === "planned") said += " · it stays a draft until a rate confirmation is attached";
      await client.invalidateQueries({ queryKey: [org.id] });
      setValues(EMPTY);
      setRateConfirmation(null);
      notify(said, bad);
      set({ screen: "loads", drawer: load.id, overlay: "none", modal: "none" });
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
  const fuelLine = fin && MONEY.test(values.rate) ? (((toCents(values.rate) ?? 0) * values.fuel) / 10000).toFixed(2) : "0";
  const total = sumMoney([values.rate || "0", fuelLine, ...charges]);
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
    ...(customer && account.data
      ? (() => {
          const limit = toCents(account.data.credit_limit);
          const owed = toCents(account.data.stats.open_balance);
          if (limit !== null && owed !== null && owed > limit) return [{ ok: false, warn: true, text: `${customer.name} owes ${formatMoney(account.data.stats.open_balance, org.base_currency)}, over its ${formatMoney(account.data.credit_limit, org.base_currency)} credit limit` }];
          return [{ ok: true, text: owed === null ? "Customer is active" : "Customer is active · credit OK" }];
        })()
      : []),
    ...(customer && reference.length >= 2 && sameReference.data
      ? [duplicate ? { ok: false, warn: true, text: `Reference ${reference} is already on ${duplicate.load_number}` } : { ok: true, text: `Reference ${reference} is unique for ${customer.name}` }]
      : []),
    ...(fin ? [{ ok: MONEY.test(values.rate), text: MONEY.test(values.rate) ? "Line haul entered" : "Enter the line haul" }] : []),
    { ok: !!rateConfirmation, warn: true, text: rateConfirmation ? "Rate confirmation will be attached, so the load is booked ready to dispatch" : "No rate confirmation yet — the load stays a draft until one is attached" },
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
                {field("nl-bol", "BOL number", text("nl-bol", values.bol, (v) => put("bol", v), err("bol"), { className: "mono" }), 2, err("bol"))}
                {field("nl-seal", "Seal number", text("nl-seal", values.seal, (v) => put("seal", v), err("seal"), { className: "mono" }), 1, err("seal"))}
              </div>
            </section>
          ) : null}
          {step === 0 ? (
            <section className="card stopc" style={{ marginTop: "12px" }}>
              <div className="sgrid">
                {field(
                  "nl-copy",
                  "Start from an earlier load",
                  <select id="nl-copy" className="inp" value="" onChange={(event) => void copyFrom(event.target.value)}>
                    <option value="">{recent.isPending ? "Loading loads…" : recent.data?.items.length ? "Blank load · or choose one to copy" : "No loads to copy yet"}</option>
                    {recent.data?.items.map((each) => (
                      <option key={each.id} value={each.id}>{`${each.load_number} · ${each.customer.name} · ${[each.origin_city, each.destination_city].filter(Boolean).join(" → ") || "no route yet"}`}</option>
                    ))}
                  </select>,
                  6,
                  undefined,
                  "Copies the customer, route, freight and terms. Dates and references are left for you.",
                )}
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
                const shut = folded.includes(i);
                return (
                  <section key={i} className="card stopc" style={{ opacity: dragging === i ? 0.5 : 1 }}
                    onDragOver={(e) => { if (dragging !== null) e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); if (dragging !== null && dragging !== i) { moveStop(dragging, i - dragging); setFolded([]); } setDragging(null); }}>
                    <div className="r g8 stoph">
                      <button className="btn ghost xs icon" draggable style={{ cursor: "grab" }} aria-label={`Move stop ${i + 1}: drag it, or use the up and down arrow keys`}
                        onDragStart={(e) => { setDragging(i); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragging(null)}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); moveStop(i, -1); setFolded([]); }
                          if (e.key === "ArrowDown" && i < values.stops.length - 1) { e.preventDefault(); moveStop(i, 1); setFolded([]); }
                        }}>
                        <Icon className="s14" d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" />
                      </button>
                      <span className="smk" data-k="brand">{i + 1}</span>
                      <div className="seg sm" role="group" aria-label={`Stop ${i + 1} type`}>
                        {(["pickup", "delivery", "fuel_scale"] as const).map((kind) => (
                          <button key={kind} className={clsx(stop.type === kind && "on")} onClick={() => putStop(i, { type: kind })} aria-pressed={stop.type === kind}>{KIND_LABEL[kind]}</button>
                        ))}
                      </div>
                      {stop.type !== "fuel_scale" ? (
                        <div className="seg sm" role="group" aria-label={`Stop ${i + 1} handling`}>
                          {(["live", "drop", "hook"] as const).map((h) => (
                            <button key={h} className={clsx(stop.handling === h && "on")} onClick={() => putStop(i, { handling: h })} aria-pressed={stop.handling === h} title={{ live: "Live load or unload: the driver waits", drop: "Drop the trailer and leave", hook: "Hook a loaded trailer" }[h]}>{{ live: "Live", drop: "Drop", hook: "Hook" }[h]}</button>
                          ))}
                        </div>
                      ) : null}
                      {count ? <span className="tag" data-k="bad" style={{ marginLeft: "4px" }}>{count === 1 ? "1 error" : `${count} errors`}</span> : null}
                      <span className="sp"></span>
                      <button className="btn ghost xs icon" aria-expanded={!shut} aria-label={shut ? `Show stop ${i + 1}` : `Fold stop ${i + 1}`} onClick={() => setFolded(shut ? folded.filter((j) => j !== i) : [...folded, i])}>
                        <Icon className="s14" d={shut ? "M6 9l6 6 6-6" : "M18 15l-6-6-6 6"} />
                      </button>
                      {values.stops.length > 1 ? <button className="btn ghost xs icon" aria-label="Remove stop" onClick={() => { put("stops", values.stops.filter((_, j) => j !== i)); setFolded([]); }}><Icon className="s14" d="M18 6L6 18M6 6l12 12" /></button> : null}
                    </div>
                    {shut ? (
                      <div className="fs13 t2" style={{ padding: "10px 16px 12px" }}>
                        {[stop.name || "No facility yet", [stop.city, stop.state].filter(Boolean).join(", "), stop.date ? `${stop.date}${stop.from ? ` ${stop.from}` : ""}${stop.to ? `–${stop.to}` : ""}` : "no date yet"].filter(Boolean).join(" · ")}
                      </div>
                    ) : null}
                    <div className="sgrid" hidden={shut}>
                      {field(`nl-f${i}`, "Facility", (
                        <FacilityField id={`nl-f${i}`} value={stop.name} invalid={!!err(`${prefix}.name`)} onChange={(v) => putStop(i, { name: v, facility: "" })}
                          onPick={(o) => putStop(i, { name: o.label, address: o.address ?? "", city: o.city, state: stateCode(o.state), postal: o.postal_code ?? "", facility: o.source })} />
                      ), 3, err(`${prefix}.name`), stopNote(i))}
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
                      {field(`nl-r${i}`, stop.type === "pickup" ? "Pickup number" : stop.type === "delivery" ? "Delivery number" : "Reference", text(`nl-r${i}`, stop.reference, (v) => putStop(i, { reference: v }), err(`${prefix}.reference`), { className: "mono" }), 2, err(`${prefix}.reference`))}
                      {field(`nl-i${i}`, "Driver instructions", text(`nl-i${i}`, stop.instructions, (v) => putStop(i, { instructions: v }), err(`${prefix}.instructions`), { placeholder: "Dock, lumper, contact on arrival…" }), 4, err(`${prefix}.instructions`))}
                    </div>
                  </section>
                );
              })}
              <button className="addstop" onClick={() => put("stops", [...values.stops, blankStop("delivery")])}>
                <Icon className="s14 b" d="M12 5v14M5 12h14" />
                Add stop
                <span className="fs12 mu" style={{ fontWeight: "400" }}>Pickup, delivery or fuel / scale</span>
              </button>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="c g12">
              {fin ? (
                <section className="card stopc">
                  <div className="sgrid">
                    {field("nl-rate", `Line haul (${org.base_currency})`, text("nl-rate", values.rate, (v) => put("rate", v), err("rate"), { className: "mono", inputMode: "decimal", placeholder: "2500.00" }), 2, err("rate"))}
                    <div className="fld" style={{ gridColumn: "span 2" }}>
                      <span className="lbl">Fuel surcharge</span>
                      <div className="seg" role="group" aria-label="Fuel surcharge percent">
                        {FUEL_CHOICES.map((pct) => (
                          <button key={pct} className={clsx(values.fuel === pct && "on")} aria-pressed={values.fuel === pct} onClick={() => put("fuel", pct)}>{`${pct}%`}</button>
                        ))}
                      </div>
                    </div>
                    {field("nl-free", "Detention free hours", text("nl-free", values.freeHours, (v) => put("freeHours", v), err("freeHours"), { className: "mono", inputMode: "decimal" }), 1, err("freeHours"))}
                    {field("nl-det", "Detention $/h", text("nl-det", values.detentionRate, (v) => put("detentionRate", v), err("detentionRate"), { className: "mono", inputMode: "decimal" }), 1, err("detentionRate"))}
                  </div>
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

          {step === 3 && fin && costs.data ? <MarginPreview values={values} costs={costs.data} currency={org.base_currency} /> : null}

          {step === 4 ? (
            <div className="c g12">
              <section className="card stopc">
                <div className="r g8 stoph"><span className="h3">Repeat weekly</span><span className="fs12 mu">Optional</span></div>
                <div className="sgrid">
                  <div className="fld" style={{ gridColumn: "span 4" }}>
                    <span className="lbl">Pickup days</span>
                    <div className="seg" role="group" aria-label="Repeat on">
                      {WEEKDAYS.map((label, d) => (
                        <button key={label} className={clsx(values.repeat.includes(d) && "on")} aria-pressed={values.repeat.includes(d)} onClick={() => put("repeat", values.repeat.includes(d) ? values.repeat.filter((x) => x !== d) : [...values.repeat, d].sort())}>{label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="fld" style={{ gridColumn: "span 2" }}>
                    <span className="lbl">Until</span>
                    <div className="seg" role="group" aria-label="Repeat until">
                      {([["dec31", "Dec 31"], ["jan31", "Jan 31"], ["none", "No end"]] as const).map(([v, l]) => (
                        <button key={v} className={clsx(values.repeatUntil === v && "on")} aria-pressed={values.repeatUntil === v} onClick={() => put("repeatUntil", v)} disabled={!values.repeat.length}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <p className="fs12 mu" style={{ gridColumn: "span 6" }}>
                    {values.repeat.length
                      ? (() => {
                          const first = values.stops[0]?.date || today;
                          const next = nextDates(values.repeat, first, untilOf(values.repeatUntil, today));
                          return next.length ? `Next: ${next.map((d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })).join(" · ")}. Each is made as a draft two weeks ahead, without a driver or a rate.` : "No dates left before the end.";
                        })()
                      : "Choose days to book this load again every week. Each repeat is a draft to confirm."}
                  </p>
                </div>
              </section>
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
                <dt>{values.miles ? "Distance" : "Est. distance"}</dt>
                <dd className="num">{values.miles ? `${formatNumber(Number(values.miles))} mi` : route.data?.miles ? `${formatNumber(route.data.miles)} mi` : "—"}</dd>
              </dl>
              {fin ? (
                <>
                  <div className="hr"></div>
                  <dl className="kv">
                    <dt>Line haul</dt>
                    <dd className="mono">{MONEY.test(values.rate) ? formatMoney(values.rate, org.base_currency) : "—"}</dd>
                    <dt>{`Fuel ${values.fuel}%`}</dt>
                    <dd className="mono">{fuelLine !== "0" ? formatMoney(fuelLine, org.base_currency) : "—"}</dd>
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

/** What the load earns and an estimate of what it costs, as it is typed: the same sums the load page shows. */
function MarginPreview({ values, costs, currency }: { values: Values; costs: Costs; currency: string }) {
  const charges = values.charges.filter((c) => c.billable).map((c) => multiplyMoney(c.quantity, c.rate) ?? "0");
  const miles = Number(values.miles) || 0;
  const m = estimate(values.rate || "0", values.fuel, charges, miles, costs);
  const money = (cents: number) => formatMoney(cents / 100, currency);
  const line = (label: string, value: string, strong = false) => (
    <div className="r g8 fs13" style={{ padding: "3px 0" }}>
      <span className={strong ? "w6" : "t2"}>{label}</span>
      <span className="sp"></span>
      <span className={clsx("num", strong && "w6")}>{value}</span>
    </div>
  );
  return (
    <section className="card stopc" aria-label="Margin estimate" style={{ marginTop: "12px" }}>
      <div className="r g8 stoph">
        <span className="h3">Margin estimate</span>
        <span className="sp"></span>
        {m.pct !== null ? <span className="tag" data-k={m.warn ? "warn" : "ok"}>{`${m.pct}% margin`}</span> : null}
      </div>
      <div style={{ padding: "0 16px 12px" }}>
        {line("Line haul", money(m.haul))}
        {line(`Fuel surcharge ${values.fuel}%`, money(m.fuel))}
        {m.extra ? line("Charges billed", money(m.extra)) : null}
        {line("Total", money(m.total), true)}
        {line(`Driver pay · $${Number(costs.driver_pay_per_mile).toFixed(2)}/mi`, `−${money(m.pay)}`)}
        {line(`Fuel · ${Number(costs.mpg)} mpg at $${Number(costs.fuel_price).toFixed(2)}`, `−${money(m.fuelCost)}`)}
        {line(`Overhead · $${Number(costs.overhead_per_mile).toFixed(2)}/mi`, `−${money(m.overhead)}`)}
        {line("Margin", money(m.margin), true)}
        <p className="fs12 mu" style={{ marginTop: "6px" }}>
          {!miles ? "Add the miles on Load basics to estimate costs. " : ""}
          {m.warn ? "Below 25%: check the rate before booking. " : ""}
          {m.perMile ? `$${m.perMile.toFixed(2)}/mi. ` : ""}Detention is added from the stop times once the truck is there. Cost rates are set under Settings.
        </p>
      </div>
    </section>
  );
}
