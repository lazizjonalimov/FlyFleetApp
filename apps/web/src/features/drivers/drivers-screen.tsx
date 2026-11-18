"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { cell } from "@/components/data-table/cell";
import { Confirm } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { addOf } from "@/features/console/shell";
import { carrierName, monthYear, PAY_TYPES } from "@/features/fleet/labels";
import { ListScreen } from "@/features/lists/list-screen";
import { BulkMessage } from "@/features/messages/bulk-message";
import { InviteDrivers } from "./invite-drivers";
import { useList, type ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDate, todayIn } from "@/lib/format/dates";
import { initials, plural } from "@/lib/format/text";

type Driver = Schema<"DriverRead">;

const ENDORSEMENTS: [code: string, label: string][] = [["H", "H · Hazmat"], ["N", "N · Tank"], ["T", "T · Doubles and triples"], ["X", "X · Tank and hazmat"], ["P", "P · Passenger"], ["S", "S · School bus"]];
const rate = (d: Driver) => (d.pay_type === "percent" ? `${Number(d.pay_rate)}%` : `$${Number(d.pay_rate ?? 0).toFixed(2)}`);
const tone = (severity: string | undefined) => (severity === "blocking" ? "bad" : severity === "warning" ? "warn" : severity === "info" ? "mu" : "ok");
const short = (name: string) => name.replace(/,? (LLC|L\.L\.C\.|Inc\.?|Corp\.?|Co\.?)$/i, "");

/** Qualification at a glance: a square each for the CDL, the medical card and the rest of the file. */
function qualification(d: Driver) {
  const issues = d.compliance.issues;
  const worst = (match: (code: string) => boolean) => {
    const found = issues.filter((i) => match(i.code));
    return found.find((i) => i.severity === "blocking") ?? found.find((i) => i.severity === "warning") ?? found[0];
  };
  const cdl = worst((c) => c.startsWith("CDL"));
  const medical = worst((c) => c.startsWith("MEDICAL"));
  const other = worst((c) => !c.startsWith("CDL") && !c.startsWith("MEDICAL"));
  const first = issues.find((i) => i.severity === "blocking") ?? issues.find((i) => i.severity === "warning");
  const label = first ? first.message.replace(/ on [A-Z][a-z]{2} \d{1,2}, \d{4}$/, "").replace("Medical certificate", "Medical card") : issues.length ? "Dates missing" : "Qualified";
  return cell.dots(label, [tone(cdl?.severity), tone(medical?.severity), tone(other?.severity)], first ? tone(first.severity) : issues.length ? "mu" : "ok");
}

/** Drivers: who can be dispatched, who they work for, what each is on, and what is about to expire. */
export function DriversScreen() {
  const { me, can, I, set, notify } = useConsole();
  const [bulk, setBulk] = useState<Driver[] | null>(null);
  const [inviting, setInviting] = useState<Driver[] | null>(null);
  const [asking, setAsking] = useState<Driver[] | null>(null);
  const org = me.organization;
  const carrier = carrierName(org.name);
  const today = todayIn(org.timezone);
  const sensitive = can("drivers.sensitive.read");
  const summary = useQuery({ queryKey: [org.id, "drivers", "summary"], queryFn: () => unwrap(api.GET("/api/v1/drivers/summary")), staleTime: 30_000 });
  const owners = useQuery({ queryKey: [org.id, "owners", "filter"], queryFn: () => unwrap(api.GET("/api/v1/owners", { params: { query: { sort: "name", limit: 100 } } })), enabled: can("owners.read"), staleTime: 60_000 });
  const s = summary.data;
  const ownerTrucks = new Map((owners.data?.items ?? []).map((o) => [o.id, o.trucks]));
  const open = (driver: Driver) => set({ screen: "driver", driverId: driver.id, drawer: null, overlay: "none", modal: "none" });
  const openDriver = (id: string) => set({ screen: "driver", driverId: id, drawer: null, overlay: "none", modal: "none" });
  const openOwner = (id: string) => set({ screen: "owner", ownerId: id, otab: "ov", drawer: null, overlay: "none", modal: "none" });
  const openTruck = (id: string) => set({ screen: "truck", unitId: id, unitKind: "truck", drawer: null, overlay: "none", modal: "none" });
  const add = can("drivers.manage") ? () => set(addOf("driver")) : null;

  const status = (d: Driver) => {
    if (d.status !== "active") return cell.badge(d.status === "terminated" ? "Terminated" : "Inactive", "mu");
    if (d.hire_date && d.hire_date > today) return cell.badge(`Starts ${formatDate(d.hire_date).replace(/, \d{4}$/, "")}`, "info");
    if (d.current_load) {
      const load = d.current_load;
      // Not started yet: when it starts, on the company's clock.
      if ((load.status === "assigned" || load.status === "dispatched") && load.pickup_at) {
        const day = todayIn(org.timezone, new Date(load.pickup_at));
        const when = day === today ? new Intl.DateTimeFormat("en-US", { timeZone: org.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(load.pickup_at)) : formatDate(day).replace(/, \d{4}$/, "");
        return cell.badge(`Starts ${when}`, "assigned");
      }
      return cell.badge(load.status === "at_pickup" ? "At pickup" : load.status === "on_hold" ? "On hold load" : "On load", load.status === "on_hold" ? "hold" : "assigned");
    }
    if (d.compliance.status === "expired") return cell.badge("Not dispatchable", "bad");
    return cell.badge("Available", "ok");
  };
  const worksAs = (d: Driver) => (d.owner_id ? cell.tags([{ v: "Owner-operator", k: "brand" }]) : d.employer_owner_id ? cell.tags([{ v: "Owner’s driver", k: "teal" }]) : cell.tags([{ v: "Company", k: "mu" }]));
  const also = (d: Driver) => {
    if (d.owner_id) {
      const n = ownerTrucks.get(d.owner_id);
      return cell.name(n === undefined ? "Owner" : `Owner · ${plural(n, "truck")}`, () => openOwner(d.owner_id!));
    }
    if (d.employer_owner_id) return cell.name(`Hired by ${short(d.employer_owner_name ?? "an owner")}`, () => openOwner(d.employer_owner_id!));
    return cell.maybe(null);
  };
  const paidBy = (d: Driver) => {
    if (d.owner_id) return "Owner settlement · 1099";
    if (d.employer_owner_id) return d.pay_by === "owner" ? `${short(d.employer_owner_name ?? "The owner")}, outside FlyFleet` : `${carrier}, charged to ${short(d.employer_owner_name ?? "the owner")}`;
    return `${carrier} · ${d.driver_type === "contractor" ? "1099" : "W-2"}`;
  };
  const payType = (d: Driver) => {
    if (d.owner_id) return "Owner settlement";
    if (d.employer_owner_id && d.pay_by === "owner") return "Set by the owner · outside FlyFleet";
    if (!d.pay_type) return "";
    if (d.unit?.partner_id) return `Team · ${rate(d)} ${d.pay_type === "per_mile" ? "a mile" : PAY_TYPES[d.pay_type]?.toLowerCase() ?? ""} · ${d.unit.team_split === "miles" ? "by miles" : "50/50"}`;
    return `${PAY_TYPES[d.pay_type] ?? d.pay_type} · ${rate(d)}`;
  };

  const list = useList<Driver>({
    key: "drivers",
    noun: "drivers",
    group: "Directory",
    title: "Drivers",
    sub: () =>
      `${s ? `${plural(s.total, "driver")} · ${plural(s.owner_operators, "owner-operator")}, ${s.owners_drivers} hired by owners, ${plural(s.team_pairs, "team pair")} · ` : ""}one person, one record: an owner-operator is one driver and one owner, never two people`,
    placeholder: "Name, ID, phone, email or truck",
    fetch: (query: ListQuery) => unwrap(api.GET("/api/v1/drivers", { params: { query: query as never } })),
    defaultSort: "name",
    tabs: [
      { label: "All" },
      { label: "Available", params: { kind: "available" } },
      { label: "On a load", params: { kind: "on_load" } },
      { label: "Teams", params: { kind: "team" } },
      { label: "Owner-operators", params: { kind: "owner_operators" } },
      { label: "Hired by owners", params: { kind: "owners_drivers" } },
      { label: "Not dispatchable", params: { kind: "not_dispatchable" } },
      { label: "Inactive", params: { status: "inactive" } },
    ],
    kpis: [
      { label: "Dispatchable", value: s ? String(s.dispatchable) : "—", suffix: s ? ` of ${s.total}` : "", sub: s ? `${s.blocked} blocked by documents · ${s.inactive} inactive` : "", k: "ok", sk: "mu" },
      { label: "On a load", value: s ? String(s.on_load) : "—", suffix: "", sub: s ? `${s.available} available` : "", k: "brand", sk: "mu" },
      { label: "Teams", value: s ? String(s.team_pairs) : "—", suffix: s ? (s.team_pairs === 1 ? " pair" : " pairs") : "", sub: s ? s.teams.join(" · ") || "No two-driver trucks" : "", k: "violet", sk: "mu" },
      { label: "Tied to an owner", value: s ? String(s.owner_operators + s.owners_drivers) : "—", suffix: "", sub: s ? `${plural(s.owner_operators, "owner-operator")} · ${s.owners_drivers} hired by owners` : "", k: "teal", sk: "mu" },
      { label: "Expiring · 30 days", value: s ? String(s.expiring) : "—", suffix: "", sub: s ? s.expiring_detail.map((x) => `${x.count} ${x.count === 1 ? x.label.replace(/s$/, "") : x.label}`).join(" · ") || "Nothing expiring" : "", k: "warn", sk: s?.expiring ? "warn" : "mu" },
    ],
    filters: [
      { key: "works_as", label: "Works as", options: [{ value: "company", label: "Company driver" }, { value: "owner_operators", label: "Owner-operator" }, { value: "owners_drivers", label: "Owner’s driver" }], params: (v) => ({ kind: v }) },
      { key: "qualification", label: "Qualification", options: [{ value: "ok", label: "Qualified" }, { value: "expiring", label: "Expiring · 30 days" }, { value: "blocked", label: "Blocked by documents" }] },
      { key: "endorsement", label: "Endorsement", options: ENDORSEMENTS.map(([value, label]) => ({ value, label, count: s?.endorsements.find((e) => e.value === value)?.count })) },
      { key: "app", label: "Channel", options: [{ value: "true", label: "Driver app" }, { value: "false", label: "No app yet" }], params: (v) => ({ app: v === "true" }) },
    ],
    frozen: 2,
    bulk: [
      ...(can("messages.send") ? [{ label: "Message", go: (rows: Driver[]) => setBulk(rows) }] : []),
      ...(can("safety.manage") || can("drivers.manage") ? [{ label: "Request documents", go: (rows: Driver[]) => setAsking(rows) }] : []),
      ...(can("users.manage") ? [{ label: "Invite to app", go: (rows: Driver[]) => setInviting(rows) }] : []),
      "export" as const,
    ],
    open,
    rowClass: (d) => (d.status !== "active" ? "dim" : ""),
    columns: [
      { label: "Driver", width: "188px", sort: "name", cell: (d) => cell.person(d.full_name, initials(d.full_name), "", d.status !== "active" ? "mu" : d.current_load ? "brand" : "ok") },
      { label: "ID", width: "76px", sort: "employee_number", cell: (d) => cell.maybe(d.employee_number, "mono fs12") },
      { label: "Status", width: "140px", sort: "status", cell: status, csv: (d) => (d.status !== "active" ? d.status : d.current_load ? "On load" : "Available") },
      { label: "Works as", width: "124px", cell: worksAs },
      { label: "Also", width: "150px", cell: also },
      { label: "Team partner", width: "140px", cell: (d) => (d.unit?.partner_id ? cell.name(d.unit.partner_name ?? "", () => openDriver(d.unit!.partner_id!)) : cell.maybe(null)) },
      { label: "Truck", width: "76px", cell: (d) => (d.unit ? cell.name(d.unit.unit_number, () => openTruck(d.unit!.vehicle_id)) : cell.maybe(null)) },
      { label: "Load", width: "92px", cell: (d) => (d.current_load ? cell.id(d.current_load.load_number, () => set({ screen: "loads", drawer: d.current_load!.id, overlay: "none", modal: "none" })) : cell.maybe(null)) },
      { label: "Qualification", width: "196px", sort: "qualification", cell: qualification },
      { label: "Mobile", width: "120px", cell: (d) => cell.maybe(d.phone, "mono fs12") },
      { label: "Email", width: "236px", cell: (d) => cell.maybe(d.email, "fs12 t2") },
      { label: "CDL", width: "76px", cell: (d) => cell.maybe(d.cdl_class ? `Class ${d.cdl_class}` : "") },
      { label: "State", width: "56px", cell: (d) => cell.maybe(d.cdl_state, "mono fs12") },
      ...(sensitive ? [{ label: "CDL number", width: "112px", cell: (d: Driver) => cell.maybe(d.cdl_number_masked, "mono fs12"), hidden: true }] : []),
      { label: "Endorsements", width: "112px", cell: (d) => (d.endorsements ? cell.text(d.endorsements) : cell.text("None", "", "mu")) },
      { label: "CDL expires", width: "96px", sort: "cdl_expiry", cell: (d) => cell.maybe(monthYear(d.cdl_expiry), tone(d.compliance.issues.find((i) => i.code.startsWith("CDL"))?.severity) === "ok" ? "t2" : `sk-${tone(d.compliance.issues.find((i) => i.code.startsWith("CDL"))?.severity)}`) },
      { label: "Medical card", width: "112px", sort: "medical_cert_expiry", cell: (d) => cell.maybe(monthYear(d.medical_cert_expiry), tone(d.compliance.issues.find((i) => i.code.startsWith("MEDICAL"))?.severity) === "ok" ? "t2" : `sk-${tone(d.compliance.issues.find((i) => i.code.startsWith("MEDICAL"))?.severity)}`) },
      { label: "Truck owner", width: "176px", cell: (d) => (!d.unit ? cell.maybe(null) : d.unit.owner_id ? cell.name(d.unit.owner_name ?? "Owner", () => openOwner(d.unit!.owner_id!)) : cell.text("Company fleet", "", "mu")) },
      { label: "Paid by", width: "190px", cell: (d) => cell.text(paidBy(d), "", "t2") },
      ...(sensitive ? [{ label: "Pay type", width: "200px", cell: (d: Driver) => cell.maybe(payType(d), "t2") }] : []),
      { label: "Apps", width: "64px", cell: (d) => (d.user_id ? cell.channels([{ ic: I.mobile, k: "brand", t: "Driver app" }]) : cell.maybe(null)) },
      { label: "Hired", width: "84px", sort: "hire_date", cell: (d) => cell.maybe(monthYear(d.hire_date), "t2") },
      { label: "", width: "28px", cell: () => cell.more() },
    ],
    actions: [
      ...(add ? [{ l: "Import", cls: "", ic: I.sheet, go: () => set({ ...addOf("driver"), mstep: "import" }) }, ...(can("users.manage") ? [{ l: "Invite to app", cls: "", ic: I.mobile, go: () => setInviting([]) }] : [])] : []),
      ...(add ? [{ l: "Add driver", cls: "pri", ic: I.plus, go: add }] : []),
    ],
    empty: {
      icon: I.user,
      title: "No drivers yet",
      text: "A driver’s record holds the licence, medical card and pay settings that decide whether they can be dispatched, the truck they drive and who they work for.",
      action: add ? { label: "Add driver", go: add } : undefined,
    },
  });
  return (
    <>
      <ListScreen list={list} />
      {bulk ? <BulkMessage drivers={bulk} onClose={() => setBulk(null)} /> : null}
      {inviting ? <InviteDrivers drivers={inviting.length ? inviting : undefined} onClose={() => setInviting(null)} /> : null}
      {asking ? (
        <Confirm
          title={`Ask ${plural(asking.length, "driver")} for documents?`}
          text="Each is asked for what their file is missing, has run out or runs out within 30 days, in their conversation and in the app when they’re on it."
          confirm="Send requests"
          onClose={() => setAsking(null)}
          run={async () => {
            const out = await unwrap(api.POST("/api/v1/drivers/document-requests", { body: { driver_ids: asking.map((d) => d.id) } }));
            const parts = [out.asked ? `${plural(out.asked, "driver")} asked` : "", out.asked - out.reached ? `${out.asked - out.reached} not on the app (it’s in their conversation)` : "", out.nothing_due ? `${plural(out.nothing_due, "driver")} had nothing due` : ""].filter(Boolean);
            notify(parts.join(" · ") || "Nothing to ask for");
          }}
        />
      ) : null}
    </>
  );
}
