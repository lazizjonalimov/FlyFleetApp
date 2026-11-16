"use client";

import { cell } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { addOf } from "@/features/console/shell";
import { complianceCell, DRIVER_TYPES, monthYear, PAY_TYPES, workCell } from "@/features/fleet/labels";
import { ListScreen } from "@/features/lists/list-screen";
import { useList, type ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDate } from "@/lib/format/dates";
import { initials, plural } from "@/lib/format/text";

type Driver = Schema<"DriverRead">;

const pay = (driver: Driver) => (driver.pay_type ? `${PAY_TYPES[driver.pay_type] ?? driver.pay_type}${Number(driver.pay_rate) ? ` · ${driver.pay_type === "percent" ? `${Number(driver.pay_rate)}%` : `$${Number(driver.pay_rate).toFixed(2)}`}` : ""}` : "");

/** Drivers: who can be dispatched, what each is on, and what is about to expire. */
export function DriversScreen() {
  const { can, I, set } = useConsole();
  const sensitive = can("drivers.sensitive.read");
  const open = (driver: Driver) => set({ screen: "driver", driverId: driver.id, drawer: null, overlay: "none", modal: "none" });

  const list = useList<Driver>({
    key: "drivers",
    group: "Directory",
    title: "Drivers",
    sub: (total) => (total === null ? "One person, one record" : `${plural(total, "driver")} · one person, one record`),
    placeholder: "Name, ID, phone or email",
    fetch: (query: ListQuery) => unwrap(api.GET("/api/v1/drivers", { params: { query: query as never } })),
    defaultSort: "name",
    tabs: [
      { label: "Active", params: { status: "active" } },
      { label: "Owner-operators", params: { status: "active", driver_type: "owner_operator" } },
      { label: "Contractors", params: { status: "active", driver_type: "contractor" } },
      { label: "Inactive", params: { status: "inactive" } },
      { label: "Terminated", params: { status: "terminated" } },
      { label: "All" },
    ],
    frozen: 2,
    bulk: [],
    open,
    columns: [
      { label: "Driver", width: "188px", sort: "name", cell: (d) => cell.person(d.full_name, initials(d.full_name), "", d.current_load ? "brand" : "") },
      { label: "ID", width: "84px", cell: (d) => cell.maybe(d.employee_number, "mono fs12") },
      { label: "Status", width: "140px", cell: (d) => workCell(d.status, d.current_load, { free: "Available", busy: "On load" }) },
      { label: "Works as", width: "140px", cell: (d) => cell.tags([{ v: DRIVER_TYPES[d.driver_type] ?? d.driver_type, k: d.driver_type === "company" ? "mu" : "brand" }]) },
      { label: "Load", width: "96px", cell: (d) => (d.current_load ? cell.id(d.current_load.load_number, () => set({ screen: "loads", drawer: d.current_load!.id, overlay: "none", modal: "none" })) : cell.maybe(null)) },
      { label: "Qualification", width: "236px", cell: (d) => complianceCell(d.compliance) },
      { label: "Mobile", width: "128px", cell: (d) => cell.maybe(d.phone, "num") },
      { label: "Email", width: "220px", cell: (d) => cell.maybe(d.email) },
      { label: "CDL", width: "84px", cell: (d) => cell.maybe(d.cdl_class ? `Class ${d.cdl_class}` : "") },
      { label: "State", width: "56px", cell: (d) => cell.maybe(d.cdl_state) },
      ...(sensitive ? [{ label: "CDL number", width: "124px", cell: (d: Driver) => cell.maybe(d.cdl_number_masked, "mono fs12") }] : []),
      { label: "CDL expires", width: "112px", cell: (d) => cell.maybe(monthYear(d.cdl_expiry)) },
      { label: "Medical card", width: "112px", cell: (d) => cell.maybe(monthYear(d.medical_cert_expiry)) },
      ...(sensitive ? [{ label: "Pay type", width: "176px", cell: (d: Driver) => cell.maybe(pay(d)) }] : []),
      { label: "Apps", width: "64px", cell: (d) => (d.user_id ? cell.channels([{ ic: I.mobile, k: "brand", t: "Driver app" }]) : cell.maybe(null)) },
      { label: "Hired", width: "112px", cell: (d) => cell.maybe(d.hire_date ? formatDate(d.hire_date) : "") },
    ],
    actions: can("drivers.manage") ? [{ l: "Add driver", cls: "pri", ic: I.plus, go: () => set(addOf("driver")) }] : [],
    empty: {
      icon: I.user,
      title: "No drivers yet",
      text: "A driver’s record holds the licence, medical card and pay settings that decide whether they can be dispatched.",
      action: can("drivers.manage") ? { label: "Add driver", go: () => set(addOf("driver")) } : undefined,
    },
  });
  return <ListScreen list={list} />;
}
