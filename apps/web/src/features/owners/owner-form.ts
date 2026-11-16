"use client";

// Add or edit an owner: an individual (linked to a person already on file when there is one) or a business, the
// units they own with the share, start date, agreement and who drives, status, settlement and portal access.
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { combo, type ComboOption, type ComboState } from "@/components/forms/combo";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import { useDebounced } from "@/hooks/use-debounced";
import { api, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { formatDate } from "@/lib/format/dates";
import { initials } from "@/lib/format/text";
import { STATE_NAME, US_STATES } from "@/lib/reference/states";
import { AGREEMENT_KINDS, agreementLine, BUSINESS_TYPES, CATEGORY, PERMISSION_DETAIL } from "./labels";
import type { OwnerFormFieldData, OwnerFormView } from "./types";

type Detail = Schema<"OwnerDetail">;
type Match = Schema<"PersonMatch">;
type Row = { unit: string; pct: string; since: string; agreement: string; drives: string; terms: Record<string, string> };

const KEYS = Object.keys(PERMISSION_DETAIL);
const PRESETS: [key: string, label: string, keys: string[]][] = [
  ["full", "Full owner", KEYS],
  ["monitor", "Monitor only", ["equipment", "locations", "loads", "completed", "maintenance", "performance"]],
  ["bookkeeper", "Bookkeeper", ["statements", "fuel", "expenses", "documents", "download"]],
];
const LABEL: Record<string, string> = { equipment: "View owned equipment", locations: "View live truck locations", drivers: "View assigned drivers", loads: "View loads", completed: "View completed loads", fuel: "View fuel transactions", expenses: "View expenses", statements: "View financial statements", maintenance: "View maintenance records", documents: "View documents", download: "Download statements", performance: "View performance reports" };
const STATUSES: [key: string, label: string, detail: string][] = [
  ["active", "Active", "Units can be dispatched and settled every week."],
  ["onboarding", "Onboarding", "Units stay out of dispatch until the lease, insurance, title, W-9 and ACH authorization are in."],
  ["suspended", "Suspended", "Units can’t take new loads; open settlements still pay."],
  ["ended", "Ended", "Units leave the owner’s portal; escrow is returned with a final accounting within 45 days."],
];
const DRIVES: [key: string, label: string, short: string][] = [["owner", "The owner drives it", "The owner"], ["carrier", "A company driver", "Company driver"], ["owner_hire", "A driver the owner hires", "Owner’s hire"], ["none", "Nobody · trailer", "Nobody"]];
const blankRow = (since: string): Row => ({ unit: "", pct: "100", since, agreement: "", drives: "", terms: {} });
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 56]).join("");

function rowsFrom(d: Detail): Row[] {
  return d.units.map((u) => ({ unit: `${u.kind}:${u.unit_id}`, pct: String(Number(u.share_pct)), since: u.effective_from, agreement: u.agreement_id ?? "", drives: u.kind === "trailer" ? "none" : (u.who_drives ?? ""), terms: {} }));
}

function initial(d: Detail | null): Record<string, string> {
  if (!d) return { status: "onboarding", freq: "weekly", method: "ach" };
  const contact = d.contacts.find((c) => c.is_primary) ?? d.contacts[0];
  return {
    status: d.status, freq: d.pay_frequency, method: d.payment_method, dba: d.dba ?? "", email: d.email ?? "", ph: d.phone ?? "",
    addr: d.street ?? "", city: d.city ?? "", state: d.state ?? "", zip: d.postal_code ?? "", bank: d.bank_name ?? "",
    escrowTarget: Number(d.escrow_target) ? String(Number(d.escrow_target)) : "", escrowWeekly: Number(d.escrow_weekly) ? String(Number(d.escrow_weekly)) : "",
    first: d.person?.first_name ?? "", last: d.person?.last_name ?? "", legal: d.legal_name ?? "", btype: d.business_type ?? "llc",
    cfirst: contact?.person.first_name ?? "", clast: contact?.person.last_name ?? "", ctitle: contact?.title ?? "", login: d.portal_users_list[0]?.email ?? d.email ?? "",
  };
}

/** The form for a new owner (`d` null) or for editing `d`. Mount it once the owner has loaded. */
export function useOwnerForm(d: Detail | null): OwnerFormView {
  const { me, can, fin, set, notify } = useConsole();
  const act = useAction();
  const org = me.organization;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: org.timezone });
  const edit = d !== null;
  const id = d?.id ?? "";
  const trucks = useQuery({ queryKey: [org.id, "vehicles", "pick"], queryFn: () => unwrap(api.GET("/api/v1/vehicles", { params: { query: { limit: 100, sort: "unit_number" } } })) });
  const trailers = useQuery({ queryKey: [org.id, "trailers", "pick"], queryFn: () => unwrap(api.GET("/api/v1/trailers", { params: { query: { limit: 100, sort: "unit_number" } } })) });

  const [entity, setEntity] = useState<"individual" | "business">((d?.entity_type as "individual" | "business") ?? "individual");
  const [v, setV] = useState<Record<string, string>>(() => initial(d));
  const [rows, setRows] = useState<Row[]>(() => (d?.units.length ? rowsFrom(d) : [blankRow(today)]));
  const [linked, setLinked] = useState<Match | null>(null);
  const [notSame, setNotSame] = useState<string[]>([]);
  const [portal, setPortal] = useState(d ? d.portal_enabled : true);
  const [perms, setPerms] = useState<string[]>(d ? d.portal_permissions : KEYS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ email: string; password: string; ownerId: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const dd: ComboState = { open, q, setOpen, setQ };

  // Already in FlyFleet? Look for the person while their details are typed.
  const individual = entity === "individual";
  const probe = useDebounced(JSON.stringify({ first_name: v.first, last_name: v.last, phone: v.ph, email: v.email, tax_id: v.tin }), 350);
  const probeQuery = JSON.parse(probe) as Record<string, string | undefined>;
  const hasProbe = Object.values(probeQuery).some((x) => (x ?? "").trim().length >= 3);
  const matches = useQuery({
    queryKey: [org.id, "persons", "matches", probe],
    queryFn: () => unwrap(api.GET("/api/v1/persons/matches", { params: { query: Object.fromEntries(Object.entries(probeQuery).filter(([, x]) => x && x.trim())) as never } })),
    enabled: !edit && individual && !linked && hasProbe && can("owners.manage"),
  });

  const [find, setFind] = useState("");
  const findQ = useDebounced(find.trim(), 300);
  const searched = useQuery({
    queryKey: [org.id, "persons", "search", findQ],
    queryFn: () => unwrap(api.GET("/api/v1/persons", { params: { query: { q: findQ } } })),
    enabled: !edit && entity === "individual" && !linked && findQ.length >= 2 && can("owners.manage"),
  });

  const units: ComboOption[] = useMemo(() => {
    const out: ComboOption[] = [];
    for (const t of trucks.data?.items ?? []) out.push({ v: `truck:${t.id}`, l: `${t.unit_number} · ${[t.year, t.make, t.model].filter(Boolean).join(" ") || "Truck"}`, ab: t.owners.length ? t.owners.map((o) => o.name.split(" ")[0]).join(", ") : "Company" });
    for (const t of trailers.data?.items ?? []) out.push({ v: `trailer:${t.id}`, l: `${t.unit_number} · ${[t.year, t.make].filter(Boolean).join(" ")} ${t.type.replace("_", " ")}`.trim(), ab: t.owners.length ? t.owners.map((o) => o.name.split(" ")[0]).join(", ") : "Company" });
    return out;
  }, [trucks.data, trailers.data]);

  const put = (k: string) => (value: string) => {
    setV((prev) => ({ ...prev, [k]: value }));
    setErrors((prev) => ({ ...prev, [k]: "" }));
  };
  const field = (k: string, l: string, span: number, o: { ph?: string; req?: boolean; mono?: boolean; hint?: string; ro?: boolean; type?: string } = {}): OwnerFormFieldData => ({
    k, l, span: String(span), id: `of-${k}`, v: v[k] ?? "", ph: o.ph, req: o.req ? "1" : "", mono: o.mono ? "mono" : "", hint: o.hint ?? "", err: errors[k] || undefined,
    isInput: !o.ro, isRo: !!o.ro, isDd: false, isSeg: false, set: put(k), type: o.type,
  });
  const seg = (k: string, l: string, options: [string, string][], span: number): OwnerFormFieldData => ({
    k, l, span: String(span), hint: "", isInput: false, isRo: false, isDd: false, isSeg: true,
    opts: options.map(([val, label]) => ({ l: label, on: (v[k] ?? options[0]![0]) === val ? "on" : "", p: (v[k] ?? options[0]![0]) === val ? "true" : "false", go: () => put(k)(val) })),
  });
  const person = linked?.person;
  const from = person ? "From the linked record" : "";
  const stateField = { ...combo(dd, { k: "state", l: "State", value: v.state ?? "", options: US_STATES.map(([code, name]) => ({ v: code, l: name, ab: code })), onPick: put("state"), placeholder: "Choose a state", head: "States", search: true, qph: "Search states", span: "2", req: true }), err: errors.state || undefined };

  const ident: OwnerFormFieldData[] = individual
    ? [
        field("first", "First name", 2, { ph: "First name", req: true, ro: !!person, hint: from }),
        field("last", "Last name", 2, { ph: "Last name", req: true, ro: !!person }),
        field("dba", "DBA", 2, { ph: "Optional · e.g. a trading name" }),
        field("tin", "SSN or EIN", 3, { ph: edit && d?.tax_id_last4 ? `On file · ending ${d.tax_id_last4}` : "For the 1099", mono: true, hint: edit ? "Leave empty to keep the one on file · encrypted" : "Encrypted · only the last 4 show" }),
      ]
    : [
        field("legal", "Legal business name", 4, { ph: "As on the W-9", req: true }),
        seg("btype", "Business type", Object.entries(BUSINESS_TYPES) as [string, string][], 6),
        field("ein", "EIN", 2, { ph: edit && d?.ein_last4 ? `On file · ending ${d.ein_last4}` : "12-3456789", mono: true, req: !edit, hint: "Encrypted · only the last 4 show" }),
        field("dba", "DBA", 2, { ph: "Optional" }),
        field("cfirst", "Contact first name", 2, { ph: "First name", req: true }),
        field("clast", "Contact last name", 2, { ph: "Last name", req: true }),
        field("ctitle", "Contact title", 2, { ph: "Principal, president…" }),
      ];
  const contact: OwnerFormFieldData[] = [
    field("email", "Email", 3, { ph: "name@example.com", req: true, hint: person ? "Prefilled · you can change it" : "Statements and portal invites go here" }),
    field("ph", "Phone", 3, { ph: "(555) 555-0100", mono: true, req: true, ro: !!person && !!person.phone, hint: person?.phone ? from : "" }),
    field("addr", "Street address", 6, { ph: "Street and number", req: true }),
    field("city", "City", 2, { ph: "City", req: true }),
    stateField as OwnerFormFieldData,
    field("zip", "ZIP", 2, { ph: "ZIP", mono: true, req: true }),
  ];

  // ---------------------------------------------------------------- units
  const agreements = d?.agreements ?? [];
  const agreementOptions: ComboOption[] = [
    ...agreements.map((a) => {
      const [label, terms] = agreementLine(a);
      return { v: a.id, l: `${label} · ${terms}`, ab: "On file" };
    }),
    ...Object.entries(AGREEMENT_KINDS).map(([kind, [label, drives]]) => ({ v: `new:${kind}`, l: `New ${label.toLowerCase()} · ${drives}`, ab: "" })),
  ];
  const setRow = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const formRows = rows.map((r, i) => {
    const k = `u${i}`;
    const [kind] = r.unit.split(":");
    const isTruck = kind === "truck";
    const unitOpt = units.find((u) => u.v === r.unit);
    const newKind = r.agreement.startsWith("new:") ? r.agreement.slice(4) : "";
    const termsFields: OwnerFormFieldData[] = [];
    const term = (key: string, l: string, ph: string, hint = "") => ({ ...field(`${k}.${key}`, l, 2, { ph, mono: true, hint }), v: r.terms[key] ?? "", set: (value: string) => setRow(i, { terms: { ...r.terms, [key]: value } }), err: errors[`${k}.${key}`] || undefined });
    if (newKind === "rental") {
      termsFields.push(term("per_mile", "Per mile", "0.30", "Dollars a mile driven"), term("per_trailer_week", "Per trailer week", "425", "Dollars a trailer a week"));
    } else if (newKind) {
      termsFields.push(term("owner_pct", "Owner’s % of line haul", "72"), term("fsc_pct", "% of fuel surcharge", "100"));
    }
    const ownerHolds = unitOpt?.ab && unitOpt.ab !== "Company" ? unitOpt.ab : "";
    return {
      ufld: { ...combo(dd, { k: `${k}.unit`, l: "Unit", value: r.unit, options: units, onPick: (value) => setRow(i, { unit: value, drives: value.startsWith("trailer:") ? "none" : r.drives }), placeholder: "Choose a unit", head: "Trucks and trailers", search: true, qph: "Search units" }), span: "1", isRo: false },
      terms: { ...combo(dd, { k: `${k}.terms`, l: "Agreement", value: r.agreement, options: agreementOptions, onPick: (value) => setRow(i, { agreement: value, terms: {} }), placeholder: "Choose an agreement", head: "Agreements" }), span: "1", isRo: false },
      drives: { ...combo(dd, { k: `${k}.drives`, l: "Who drives", value: r.drives, options: DRIVES.filter(([key]) => (isTruck ? key !== "none" : key === "none")).map(([key, label]) => ({ v: key, l: label })), onPick: (value) => setRow(i, { drives: value }), placeholder: "Who drives it", head: "Who drives" }), span: "1", isRo: false },
      pct: r.pct,
      since: r.since,
      st: v.status === "onboarding" ? "Onboarding" : v.status === "active" ? (r.since > today ? `Starts ${formatDate(r.since)}` : "Active") : (STATUSES.find(([key]) => key === v.status)?.[1] ?? ""),
      sk: v.status === "active" && r.since <= today ? "ok" : "info",
      drv: r.drives,
      unit: unitOpt ? unitOpt.l.split(" · ")[0]! : "",
      note: r.unit ? (Number(r.pct) >= 100 ? `${unitOpt?.l.split(" · ")[0]} · 100%${ownerHolds ? ` · now with ${ownerHolds}` : ` · ${org.name} keeps no share of the title`}` : `The other ${100 - Number(r.pct || 0)}% stays with ${org.name}`) : "Pick a truck or trailer",
      rm: () => setRows((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : [blankRow(today)])),
      setPct: (value: string) => setRow(i, { pct: value.replace(/[^0-9.]/g, "") }),
      setSince: (value: string) => setRow(i, { since: value }),
      termsFields,
      err: errors[k] ?? "",
    };
  });
  const drivesOwn = rows.some((r) => r.drives === "owner");
  const cat = drivesOwn ? "owner_operator" : "non_operating";
  const [catLabel, catTone] = CATEGORY[cat]!;
  const ownUnit = formRows.find((r) => r.drv === "owner")?.unit;
  const firstName = person?.first_name ?? v.first ?? "the owner";

  const status = v.status ?? "onboarding";
  const preset = PRESETS.find(([, , keys]) => keys.length === perms.length && keys.every((key) => perms.includes(key)));
  const login = v.login ?? v.email ?? "";
  const name = individual ? (person ? `${person.first_name} ${person.last_name}` : [v.first, v.last].filter(Boolean).join(" ") || (edit ? d?.name ?? "" : "New owner")) : v.legal || (edit ? d?.name ?? "" : "New business owner");

  // ---------------------------------------------------------------- saving
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    const need = (k: string, message: string) => {
      if (!(v[k] ?? "").trim()) e[k] = message;
    };
    if (individual && !person) {
      need("first", "Enter a first name");
      need("last", "Enter a last name");
    }
    if (!individual) {
      need("legal", "Enter the legal business name");
      need("cfirst", "Enter the contact’s first name");
      need("clast", "Enter the contact’s last name");
      if (!edit) need("ein", "Enter the EIN");
    }
    need("email", "Enter an email for statements");
    if (!(person?.phone) || !individual) need("ph", "Enter a phone number");
    rows.forEach((r, i) => {
      if (!r.unit && rows.length === 1 && !edit) return; // an owner can be added before their units
      if (!r.unit) e[`u${i}`] = "Pick a truck or trailer, or remove the row";
      else if (!r.agreement) e[`u${i}`] = "Choose the agreement this unit runs under";
      else if (!(Number(r.pct) > 0 && Number(r.pct) <= 100)) e[`u${i}`] = "Ownership is between 1 and 100%";
      else if (!r.since) e[`u${i}`] = "Enter the date ownership starts";
      if (r.agreement.startsWith("new:rental") && !r.terms.per_mile && !r.terms.per_trailer_week) e[`u${i}.per_mile`] = "Enter a rate";
      else if (r.agreement.startsWith("new:") && !r.agreement.startsWith("new:rental") && !r.terms.owner_pct) e[`u${i}.owner_pct`] = "Enter the owner’s %";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const unitsBody = () =>
    rows.filter((r) => r.unit).map((r) => {
      const [kind, unitId] = r.unit.split(":");
      const newKind = r.agreement.startsWith("new:") ? r.agreement.slice(4) : "";
      const driverPay = newKind === "owner_operator_lease" ? "owner_drives" : newKind === "fleet_lease" ? "carrier_for_owner" : "carrier";
      return {
        ...(kind === "truck" ? { vehicle_id: unitId } : { trailer_id: unitId }),
        share_pct: r.pct || "100",
        effective_from: r.since,
        ...(newKind
          ? { agreement: { kind: newKind as "rental", owner_pct: r.terms.owner_pct || null, fsc_pct: r.terms.fsc_pct || null, per_mile: r.terms.per_mile || null, per_trailer_week: r.terms.per_trailer_week || null, driver_pay_by: driverPay as "carrier", fuel_paid_by: (newKind === "owner_operator_lease" || newKind === "fleet_lease" ? "owner" : "carrier") as "owner", maintenance_paid_by: (newKind === "rental" ? "carrier" : "owner") as "owner", accessorials_to_owner: false, insurance_weekly: "0", occupational_weekly: "0", eld_weekly: "0", plates_weekly: "0" } }
          : { agreement_id: r.agreement }),
        who_drives: kind === "truck" && r.drives && r.drives !== "none" ? (r.drives as "owner") : null,
      };
    });
  const blank = (x: string | undefined) => (x && x.trim() ? x.trim() : null);
  const common = () => ({
    dba: blank(v.dba), email: blank(v.email), phone: blank(v.ph), street: blank(v.addr), city: blank(v.city), state: blank(v.state), postal_code: blank(v.zip),
    ...(fin ? { pay_frequency: (v.freq ?? "weekly") as "weekly", payment_method: (v.method ?? "ach") as "ach", bank_name: blank(v.bank), ...(v.routing ? { routing_number: v.routing.replace(/\D/g, "") } : {}), ...(v.acct ? { account_number: v.acct.replace(/\D/g, "") } : {}), escrow_target: v.escrowTarget || "0", escrow_weekly: v.escrowWeekly || "0" } : {}),
    portal_enabled: portal,
    portal_permissions: perms,
  });
  const save = async () => {
    setProblem(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const contacts = individual ? undefined : [{ person: { first_name: v.cfirst!.trim(), last_name: v.clast!.trim(), email: blank(v.email), phone: blank(v.ph) }, title: blank(v.ctitle), is_primary: true, signs: true }];
      let ownerId = id;
      if (edit) {
        await unwrap(api.PATCH("/api/v1/owners/{owner_id}", { params: { path: { owner_id: id } }, body: {
          ...common(), status: status as "active", ...(individual ? (v.tin ? { person: { first_name: v.first!, last_name: v.last!, tax_id: v.tin } } : {}) : { legal_name: v.legal, business_type: (v.btype || "llc") as "llc", ...(v.ein ? { ein: v.ein } : {}), contacts }),
          units: unitsBody(),
        } as never }));
      } else {
        const created = await unwrap(api.POST("/api/v1/owners", { body: {
          entity_type: entity, status: status as "onboarding", ...common(),
          ...(individual
            ? person
              ? { person_id: person.id, person_updates: { first_name: person.first_name, last_name: person.last_name, email: blank(v.email), ...(v.tin ? { tax_id: v.tin } : {}), street: blank(v.addr), city: blank(v.city), state: blank(v.state), postal_code: blank(v.zip) } }
              : { person: { first_name: v.first!.trim(), last_name: v.last!.trim(), email: blank(v.email), phone: blank(v.ph), tax_id: blank(v.tin), street: blank(v.addr), city: blank(v.city), state: blank(v.state), postal_code: blank(v.zip) } }
            : { legal_name: v.legal!.trim(), business_type: (v.btype || "llc") as "llc", ein: v.ein, contacts }),
          not_duplicates: notSame.map((personId) => ({ person_id: personId, reason: "Checked when the owner was added: a different person" })),
          units: unitsBody(),
        } as never }));
        ownerId = created.id;
      }
      // Portal sign-in: created with a temporary password shown once, for the company to pass on.
      const existing = edit ? d?.portal_users_list.some((u) => u.email.toLowerCase() === login.toLowerCase()) : false;
      if (portal && login && !existing) {
        const password = random();
        const user = await unwrap(api.POST("/api/v1/owners/{owner_id}/portal-users", { params: { path: { owner_id: ownerId } }, body: { email: login, full_name: individual ? name : `${v.cfirst} ${v.clast}`, password } }));
        setInvite({ email: login, password: user.existing_account ? "" : password, ownerId });
        await act(async () => undefined);
        return;
      }
      await act(async () => undefined, edit ? "Owner saved" : `${name} added`);
      set({ screen: "owner", ownerId, otab: "ov", overlay: "none", modal: "none" });
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
        const mapped: Record<string, string> = {};
        for (const [path, message] of Object.entries(error.fieldErrors)) {
          const key = { first_name: "first", last_name: "last", legal_name: "legal", ein: "ein", email: "email", phone: "ph", tax_id: "tin", person_id: "first" }[path.split(".").pop() ?? ""] ?? (path.startsWith("units.") ? `u${path.split(".")[1]}` : "");
          if (key) mapped[key] = message;
        }
        setErrors(mapped);
        setProblem(Object.keys(mapped).length ? null : error.message);
      } else {
        setProblem(error instanceof Error ? error.message : "Couldn’t save the owner");
      }
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- what gets saved, in plain words
  const summary: OwnerFormView["summary"] = [
    { l: "Person", v: person ? `${name} · existing record` : individual ? (edit ? `${name} · existing record` : "A new person record") : `Business: ${name}`, s: person ? "Linked, not copied. One record, more roles." : "" },
    { l: "Roles after saving", v: [...(person ? person.roles.map((r) => `${r.label} (kept)`) : []), edit ? "Owner" : "Owner (new)", ...(portal ? ["Portal user"] : [])].join(" · "), s: "" },
    { l: "Category", v: catLabel, s: "From who drives each unit" },
    { l: "Units", v: formRows.filter((r) => r.unit).map((r) => `${r.unit} · ${r.pct}%`).join(", ") || "None yet", s: "" },
    { l: "Status", v: STATUSES.find(([key]) => key === status)?.[1] ?? status, s: "" },
    ...(portal ? [{ l: "Portal", v: `${preset ? preset[1] : "Custom"} · ${perms.length} of 12 permissions`, s: login ? `Sign-in for ${login}` : "Add a sign-in email" }] : []),
  ];
  const isDriver = person?.roles.some((r) => r.role === "driver");
  const isStaff = person?.roles.some((r) => r.role === "employee");
  const change = person
    ? {
        t: `What changes for ${person.first_name}`,
        keep: isStaff && !isDriver ? ["Their staff sign-in, role and payroll", "Their access to the screens their role opens"] : ["CDL, medical card, drug and alcohol program", "Hours of service and the driver app sign-in", "Safety record and driver file"],
        moveT: "From the start date",
        move: [
          ...(ownUnit ? [`Ownership of ${ownUnit} moves from ${org.name} to ${person.first_name}`] : []),
          ...(isDriver && drivesOwn ? ["Paid on a weekly owner settlement instead of a driver statement"] : []),
          ...(isStaff ? ["A separate owner sign-in that sees only their units", "They can’t approve their own settlement"] : []),
          "Fuel, insurance and repairs follow the agreement on each unit",
        ],
      }
    : null;
  const checks = (edit ? d?.checklist.map((c) => ({ t: c.label, d: c.done ? "On file" : "Still needed", k: c.done ? "ok" : "warn" })) : undefined) ?? [
    { t: "Signed lease or rental agreement", d: "Upload it on the owner’s Documents tab", k: "warn" },
    { t: "Certificate of insurance", d: "Physical damage and bobtail", k: "warn" },
    { t: "Title or bill of sale", d: "For each unit", k: "warn" },
    { t: "W-9", d: "Needed for a 1099", k: "warn" },
    { t: "ACH authorization", d: "For weekly settlements", k: "warn" },
  ];
  const back = () => (edit ? set({ screen: "owner", ownerId: id, overlay: "none", modal: "none" }) : set(goTo("owners")));
  const fromSearch: Match[] = (searched.data ?? []).map((person) => ({ person, reasons: ["search"] }));
  const seen = new Set<string>();
  const found = [...(matches.data ?? []), ...fromSearch].filter((m) => !notSame.includes(m.person.id) && !seen.has(m.person.id) && (seen.add(m.person.id), true));

  return {
    edit,
    title: edit ? "Edit owner" : "Add owner",
    crumb: edit ? (d?.name ?? "") : "Add owner",
    back,
    sub: edit ? "Changes are saved to the owner record and the audit log. Units you remove keep their history." : "An owner is a person or a business. If they already drive or work here, link them so nobody exists twice.",
    ent: ([["individual", "Individual", "A person · SSN or EIN"], ["business", "Business", "LLC, corporation or partnership · EIN"]] as const).map(([key, l, desc]) => ({ l, d: desc, on: key === entity ? "on" : "", p: key === entity ? "true" : "false", go: () => !edit && setEntity(key) })),
    showMatch: !edit && individual,
    linked: person
      ? {
          n: `${person.first_name} ${person.last_name}`,
          ini: initials(`${person.first_name} ${person.last_name}`),
          role: person.roles[0]?.label ?? "Person on file",
          d: [person.phone, person.email].filter(Boolean).join(" · "),
          unlink: () => setLinked(null),
        }
      : null,
    matches: !person
      ? found.map((m) => {
          const owner = m.person.roles.find((r) => r.role === "owner");
          return {
            n: `${m.person.first_name} ${m.person.last_name}`,
            ini: initials(`${m.person.first_name} ${m.person.last_name}`),
            role: owner ? "Already an owner" : m.person.roles.map((r) => r.label).join(" · ") || "On file",
            d: m.reasons.includes("search") ? [m.person.phone, m.person.email].filter(Boolean).join(" · ") || "On file" : `Same ${m.reasons.map((r) => ({ tax_id: "tax ID", phone: "phone", email: "email", cdl_number: "CDL number", name: "name" })[r] ?? r).join(", ")}`,
            dismiss: () => setNotSame((prev) => [...prev, m.person.id]),
            owner: !!owner,
            k: owner ? "mu" : "brand",
            b: owner ? "Open" : "Link",
            go: owner
              ? () => set({ screen: "owner", ownerId: owner.id, otab: "ov", overlay: "none", modal: "none" })
              : () => {
                  setLinked(m);
                  setV((prev) => ({ ...prev, first: m.person.first_name, last: m.person.last_name, ph: m.person.phone ?? prev.ph ?? "", email: m.person.email ?? prev.email ?? "", city: m.person.city ?? prev.city ?? "", state: m.person.state ?? prev.state ?? "" }));
                },
          };
        })
      : [],
    ident,
    contact,
    rows: formRows as OwnerFormView["rows"],
    addUnit: () => setRows((prev) => [...prev, blankRow(today)]),
    cat: { l: catLabel, k: catTone, d: drivesOwn ? `Because ${firstName} drives ${ownUnit || "a unit"}. Set from “Who drives”, so it can’t drift.` : rows.some((r) => r.drives) ? "Nobody on this record drives their own unit. Set from “Who drives”." : "Set automatically once you pick who drives each unit." },
    status: STATUSES.map(([key, l]) => ({ l, on: key === status ? "on" : "", p: key === status ? "true" : "false", go: () => (key === "ended" && !edit ? notify("A new owner can’t start as ended", true) : put("status")(key)) })),
    statusD: STATUSES.find(([key]) => key === status)?.[2] ?? "",
    fin,
    pay: fin
      ? [
          seg("freq", "Settlement", [["weekly", `Weekly · ${(d?.pay_day ?? "friday").replace(/^./, (c) => c.toUpperCase())}`], ["biweekly", "Every 2 weeks"]], 3),
          seg("method", "Payment", [["ach", "ACH"], ["check", "Check"]], 3),
          field("bank", "Bank", 2, { ph: "Bank name" }),
          field("routing", "Routing number", 2, { ph: edit && d?.has_routing ? "On file · encrypted" : "9 digits", mono: true }),
          field("acct", "Account number", 2, { ph: edit && d?.account_last4 ? `On file · ending ${d.account_last4}` : "Encrypted", mono: true, hint: "Only the last 4 show" }),
          field("escrowTarget", "Escrow per truck", 2, { ph: "0", mono: true, hint: "Interest paid quarterly" }),
          field("escrowWeekly", "Weekly escrow deposit", 2, { ph: "0", mono: true, hint: "Until the target is reached" }),
        ]
      : [],
    portal,
    portalTog: () => setPortal((p) => !p),
    portalChk: portal ? "true" : "false",
    portalOn: portal ? "on" : "",
    loginEmail: login,
    setLogin: put("login"),
    perms: KEYS.map((key) => ({ k: key, l: LABEL[key]!, on: perms.includes(key) ? "on" : "", chk: (perms.includes(key) ? "true" : "false") as "true" | "false", go: () => setPerms((p) => (p.includes(key) ? p.filter((x) => x !== key) : [...p, key])) })),
    permN: `${perms.length} of 12`,
    presets: [...PRESETS.map(([, l, keys]) => ({ l, on: preset?.[1] === l ? "on" : "", go: () => setPerms(keys) })), { l: "Custom", on: preset ? "" : "on", go: () => undefined }],
    cancel: back,
    save: () => void save(),
    saveL: busy ? "Saving…" : edit ? "Save changes" : portal && login ? "Save and create sign-in" : "Save owner",
    identT: individual ? "Person" : "Business",
    identS: individual ? (person ? "Read-only fields come from the linked record" : "The owner on record is this person") : "The owner on record is the business; the contact acts for it",
    hasMatches: !person,
    find,
    setFind,
    summary,
    change,
    checks,
    dupWarn: !edit && individual && !person,
    checksT: edit ? "Paperwork on file" : "Before the first load",
    problem,
    busy,
    invite: invite
      ? {
          email: invite.email,
          password: invite.password,
          open: () => set({ screen: "owner", ownerId: invite.ownerId, otab: "acc", overlay: "none", modal: "none" }),
          done: () => setInvite(null),
        }
      : null,
  };
}

export const stateName = (code: string | null | undefined) => (code ? STATE_NAME[code] ?? code : "");
