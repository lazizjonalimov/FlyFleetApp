"use client";

import { useQuery } from "@tanstack/react-query";
import { cell } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { ListScreen } from "@/features/lists/list-screen";
import { useList, type ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatNumber, plural } from "@/lib/format/text";
import { agreementKind, CATEGORY, ownerInitials, STATUS } from "./labels";

type Owner = Schema<"OwnerRow">;

/** Owners: individuals and businesses that own trucks and trailers the carrier runs. */
export function OwnersScreen() {
  const { me, can, fin, I, set } = useConsole();
  const org = me.organization;
  const open = (o: Owner) => set({ screen: "owner", ownerId: o.id, otab: "ov", otruck: "", oload: 0, drawer: null, overlay: "none", modal: "none" });
  const edit = (o: Owner) => set({ screen: "ownerform", ownerForm: "edit", ownerId: o.id, overlay: "none", modal: "none" });
  const add = () => set({ ...goTo("ownerform"), ownerForm: "new", ownerId: null });
  const summary = useQuery({ queryKey: [org.id, "owners", "summary"], queryFn: () => unwrap(api.GET("/api/v1/owners/summary")) });
  const s = summary.data;
  const manage = can("owners.manage");

  const list = useList<Owner>({
    key: "owners",
    group: "Directory",
    title: "Owners",
    sub: () => `Individuals and businesses that own trucks and trailers working for ${org.name}. Owning equipment is separate from driving it and from working here.`,
    placeholder: "Name, contact, email, phone or city",
    fetch: (query: ListQuery) => unwrap(api.GET("/api/v1/owners", { params: { query: query as never } })),
    defaultSort: "name",
    tabs: [
      { label: "All" },
      { label: "Owner-operators", params: { tab: "owner_operators" } },
      { label: "Non-operating", params: { tab: "non_operating" } },
      { label: "Individuals", params: { tab: "individuals" } },
      { label: "Businesses", params: { tab: "businesses" } },
      { label: "Onboarding", params: { tab: "onboarding" } },
      { label: "Ended", params: { tab: "ended" } },
    ],
    frozen: 2,
    bulk: ["Send statements", "Invite to portal", "Export"],
    open,
    rowClass: (o) => (o.status === "ended" ? "dim" : ""),
    kpis: [
      { label: "Total owners", value: s ? String(s.total) : "—", suffix: "", sub: s ? `${plural(s.individuals, "individual")} · ${plural(s.businesses, "business", "businesses")}` : "", k: "brand", sk: "mu" },
      { label: "Active owners", value: s ? String(s.active) : "—", suffix: "", sub: s ? `${s.onboarding} onboarding · ${s.ended} ended` : "", k: "ok", sk: "mu" },
      { label: "Owned trucks", value: s ? String(s.owned_trucks) : "—", suffix: s ? ` of ${s.fleet_trucks}` : "", sub: s ? [s.owned_trailers ? `Plus ${plural(s.owned_trailers, "trailer")}` : "", s.onboarding_trucks ? `${plural(s.onboarding_trucks, "truck")} onboarding` : ""].filter(Boolean).join(" · ") || "No trailers owned by others" : "", k: "teal", sk: "mu" },
      { label: "Owner-operators", value: s ? String(s.owner_operators) : "—", suffix: "", sub: "Drive at least one of their trucks", k: "info", sk: "mu" },
      { label: "Non-operating owners", value: s ? String(s.non_operating) : "—", suffix: "", sub: "Their trucks run with other drivers", k: "violet", sk: "mu" },
    ],
    adds: ["Category", "Entity", "Agreement", "Portal"],
    hidden: fin ? "" : "Pay and statements hidden for your role",
    pinned: s
      ? [
          {
            key: "carrier",
            open: () => set(goTo("trucks")),
            cells: [
              cell.person(org.name, ownerInitials({ name: org.name, entity_type: "business" }), ""),
              cell.text("Business", "", "t2"),
              cell.text("Company fleet", "", "mu"),
              cell.maybe(null),
              cell.maybe(null),
              cell.maybe(null),
              cell.maybe(null),
              cell.maybe(null),
              cell.maybe(null),
              cell.num(formatNumber(s.carrier_trucks)),
              cell.num(s.carrier_trailers ? formatNumber(s.carrier_trailers) : "—"),
              cell.maybe(null),
              cell.maybe(null),
              cell.text("Company drivers", "", "t2"),
              cell.text("Owned outright", "", "t2"),
              cell.maybe(null),
              ...(fin ? [{ ...cell.maybe(null), al: "rt" }] : []),
              cell.badge("Carrier", "mu"),
              cell.actions([["View", () => set(goTo("trucks"))]]),
            ],
          },
        ]
      : [],
    columns: [
      { label: "Owner", width: "220px", sort: "name", cell: (o) => cell.person(o.name, ownerInitials(o), "") },
      { label: "Entity", width: "96px", cell: (o) => cell.text(o.entity_type === "business" ? "Business" : "Individual", "", "t2") },
      { label: "Category", width: "168px", cell: (o) => cell.tags([{ v: CATEGORY[o.category]?.[0] ?? o.category, k: CATEGORY[o.category]?.[1] ?? "mu" }]) },
      { label: "DBA", width: "132px", cell: (o) => cell.maybe(o.dba) },
      { label: "Contact", width: "160px", cell: (o) => (o.entity_type === "business" ? (o.contact_name ? cell.text(o.contact_name, o.contact_title ?? "", "", "t3") : cell.maybe(null)) : cell.text("Self", "", "mu")) },
      { label: "Phone", width: "120px", cell: (o) => cell.maybe(o.phone, "mono fs12") },
      { label: "Email", width: "240px", cell: (o) => cell.maybe(o.email, "fs12 t2") },
      { label: "City", width: "100px", cell: (o) => cell.maybe(o.city, "t2") },
      { label: "State", width: "56px", cell: (o) => cell.maybe(o.state, "mono fs12 t2") },
      { label: "Trucks", width: "64px", right: true, cell: (o) => cell.num(String(o.trucks)) },
      { label: "Trailers", width: "72px", right: true, cell: (o) => cell.num(o.trailers ? String(o.trailers) : "—") },
      { label: "Drivers", width: "72px", right: true, cell: (o) => cell.num(o.category === "owner_operator" ? "Self" : "—") },
      { label: "Active loads", width: "80px", right: true, cell: (o) => cell.num(String(o.active_loads)) },
      { label: "Who drives", width: "200px", cell: (o) => cell.text(o.category === "owner_operator" ? "The owner" : o.trucks ? "Other drivers" : "—", "", o.trucks ? "t2" : "mu") },
      { label: "Agreements", width: "260px", cell: (o) => cell.text(o.agreement_kinds.map((k) => agreementKind(k)).join(" + ") || "—", "", o.agreement_kinds.length ? "t2" : "mu") },
      { label: "Portal", width: "150px", cell: (o) => cell.tags([{ v: o.portal_enabled ? (o.portal_users ? `Active · ${plural(o.portal_users, "user")}` : "On · no users") : "Off", k: o.portal_enabled ? (o.portal_users ? "ok" : "warn") : "mu" }]) },
      ...(fin ? [{ label: "Owner since", width: "120px", right: true, cell: (o: Owner) => cell.maybe(o.owner_since ? new Date(`${o.owner_since}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : null, "num t2") }] : []),
      { label: "Status", width: "108px", cell: (o) => cell.badge(STATUS[o.status]?.[0] ?? o.status, STATUS[o.status]?.[1] ?? "mu") },
      { label: "", width: "132px", cell: (o) => cell.actions([["View", () => open(o)], ...(manage ? ([["Edit", () => edit(o)]] as [string, () => void][]) : [])]) },
    ],
    actions: [
      ...(manage ? [{ l: "Owner portal settings", cls: "", ic: I.lock, go: () => set(goTo("team")) }] : []),
      ...(manage ? [{ l: "Add owner", cls: "pri", ic: I.plus, go: add }] : []),
    ],
    empty: {
      icon: I.owner,
      title: "No owners yet",
      text: `${org.name} owns every truck and trailer on file. Add an owner when an owner-operator, a fleet owner or an investor leases equipment to you.`,
      action: manage ? { label: "Add owner", go: add } : undefined,
    },
  });
  return <ListScreen list={list} />;
}
