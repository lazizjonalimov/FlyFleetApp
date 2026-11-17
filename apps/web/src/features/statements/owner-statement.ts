"use client";

// One owner settlement as the design lays it out: the week's sum, a section per unit with every line and what is
// not on it, the loads with their split, escrow and the trail. Built from /owner-settlements/{id}.
import { useQuery } from "@tanstack/react-query";
import { cell, heading } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import { agreementLine, ownerInitials, shortName } from "@/features/owners/labels";
import { rangeLabel } from "@/features/owners/owner-record";
import { api, unwrap } from "@/lib/api/client";
import { formatDate, formatDateTime } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber } from "@/lib/format/text";
import type { StatementView } from "./types";

const n = (v: string | number | null | undefined) => Number(v ?? 0);
const fm2 = (v: string | number | null | undefined) => (n(v) < 0 ? `−${formatMoney(Math.abs(n(v)))}` : formatMoney(n(v)));
const STATUS: Record<string, [string, string]> = { draft: ["Draft", "draft"], approved: ["Approved", "ok"], paid: ["Paid", "completed"], void: ["Void", "cancelled"] };

export function useOwnerStatement() {
  const { me, can, state, set } = useConsole();
  const act = useAction();
  const org = me.organization;
  const id = typeof state.statementId === "string" ? state.statementId : "";
  const detail = useQuery({ queryKey: [org.id, "owner-settlements", id], queryFn: () => unwrap(api.GET("/api/v1/owner-settlements/{settlement_id}", { params: { path: { settlement_id: id } } })), enabled: !!id });
  const loads = useQuery({ queryKey: [org.id, "owner-settlements", id, "loads"], queryFn: () => unwrap(api.GET("/api/v1/owner-settlements/{settlement_id}/loads", { params: { path: { settlement_id: id } } })), enabled: !!id });
  const owner = useQuery({ queryKey: [org.id, "owners", detail.data?.owner_id], queryFn: () => unwrap(api.GET("/api/v1/owners/{owner_id}", { params: { path: { owner_id: detail.data!.owner_id } } })), enabled: !!detail.data?.owner_id && can("owners.read") });
  const d = detail.data;
  const noop = () => undefined;
  if (!d) return { view: null, error: detail.error, retry: () => void detail.refetch(), approve: noop, pay: async () => undefined, send: noop };

  const o = owner.data;
  const short = shortName({ name: d.owner_name, entity_type: d.entity_type, person: o?.person ?? null });
  const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  let payAt = new Date(Date.parse(`${d.period_end}T12:00:00Z`) + 86_400_000);
  while (payAt.getUTCDay() !== Math.max(0, names.indexOf(d.pay_day))) payAt = new Date(payAt.getTime() + 86_400_000);
  const payDay = payAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const [st, sk] = STATUS[d.status] ?? [d.status, "mu"];
  const toOwner = () => set({ screen: "owner", ownerId: d.owner_id, otab: "stmt", overlay: "none", modal: "none" });
  const lineOut = (l: (typeof d.sections)[number]["lines"][number]) => ({
    t: l.description,
    s: [l.detail, l.kind === "load_share" && l.load_revenue ? `${fm2(l.load_revenue)} load revenue · ${fm2(l.carrier_share)} kept by ${org.name}` : "", l.kind === "driver_pay_run" ? `${formatNumber(Math.round(n(l.quantity)))} mi × $${n(l.rate).toFixed(2)}` : ""].filter(Boolean).join(" · "),
    v: fm2(l.amount),
    vc: n(l.amount) < 0 ? "t2" : "",
    cls: "",
  });
  const secs = d.sections.map((sc) => {
    const [terms, ts] = sc.agreement ? agreementLine({ kind: sc.agreement.kind, owner_pct: sc.agreement.owner_pct, fsc_pct: sc.agreement.fsc_pct, per_mile: sc.agreement.per_mile, per_trailer_week: sc.agreement.per_trailer_week, accessorials_to_owner: false }) : ["No agreement in force", ""];
    const lines = sc.lines.map(lineOut);
    lines.splice(lines.findIndex((_, i) => !["load_share", "rental_week"].includes(sc.lines[i]!.kind)) === -1 ? lines.length : lines.findIndex((_, i) => !["load_share", "rental_week"].includes(sc.lines[i]!.kind)), 0, { t: `Owner gross · ${sc.unit_number}`, s: "", v: fm2(sc.gross), vc: "", cls: "sum" });
    lines.push({ t: `Net · ${sc.unit_number}`, s: "", v: fm2(sc.net), vc: "", cls: "net" });
    return {
      u: sc.unit_number,
      kind: sc.kind === "truck" ? "Truck" : "Trailer",
      title: `${sc.unit_number} · ${sc.title}`,
      terms,
      ts,
      drv: sc.kind === "truck" ? (sc.driver ?? "No driver seated") : "Rented whether loaded or not",
      lines,
      not: sc.not_on_it.map((x) => ({ a: x.what, v: x.value, d: x.why })),
      hasNot: sc.not_on_it.length > 0,
      k: sc.kind === "truck" ? "brand" : "teal",
      go: () => set({ screen: "truck", unitId: sc.unit_id, unitKind: sc.kind, overlay: "none", modal: "none" }),
      net: fm2(sc.net),
    };
  });
  const general = d.general.map(lineOut);
  if (general.length) {
    secs.push({ u: "All units", kind: "", title: "Owner-level lines", terms: "Escrow and adjustments", ts: "", drv: "", lines: [...general, { t: "Net · owner-level", s: "", v: fm2(d.general.reduce((s2, l) => s2 + n(l.amount), 0)), vc: "", cls: "net" }], not: [], hasNot: false, k: "mu", go: () => undefined, net: fm2(d.general.reduce((s2, l) => s2 + n(l.amount), 0)) });
  }
  const view: StatementView = {
    o: { id: d.owner_id, entity: d.entity_type, name: d.owner_name, dba: o?.dba ?? "", cat: d.category, email: o?.email ?? "", ph: o?.phone ?? "", addr: o?.street ?? "", city: o?.city ?? "", state: o?.state ?? "", zip: o?.postal_code ?? "", tax: "", since: o?.owner_since ?? "", status: o?.status ?? "", sk: "", roles: [], drives: "", portal: "", pk: "" },
    n: d.owner_name,
    ini: ownerInitials({ name: d.owner_name, entity_type: d.entity_type }),
    short,
    period: `Week of ${rangeLabel(d.period_start, d.period_end)}, ${d.period_end.slice(0, 4)}${d.number ? ` · ${d.number}` : ""}`,
    pays: d.status === "paid" && d.paid_on ? `Paid ${formatDate(d.paid_on)}` : `Pays ${payDay}${d.payment_method === "ach" ? ` · ACH${d.account_last4 ? ` to ••${d.account_last4}` : ""}` : " · by check"}`,
    st,
    sk,
    back: toOwner,
    toOwner,
    toList: () => set({ ...goTo("settlements"), ltab: 1 }),
    canApprove: d.allowed_actions.includes("approve"),
    canPay: d.allowed_actions.includes("pay"),
    noFin: false,
    sum: [
      { l: "Load revenue", v: fm2(d.load_revenue), s: `${d.loads} loads · customers paid`, k: "v1" },
      { l: `${org.name}’s share`, v: fm2(-n(d.carrier_share)), s: "Kept under the agreements", k: "mu" },
      { l: "Owner gross", v: fm2(d.owner_gross), s: "Before costs", k: "v1" },
      { l: "Costs", v: fm2(-(n(d.fuel) + n(d.driver_pay_run) + n(d.other_costs) + n(d.escrow))), s: n(d.driver_pay_run) ? `Includes ${fm2(d.driver_pay_run)} driver pay` : "Fuel, insurance, repairs, escrow", k: "v2" },
      { l: "Net settlement", v: fm2(d.net), s: `Paid to ${short}`, k: "v3" },
    ],
    secs,
    many: secs.length > 1,
    callout: n(d.driver_pay_run)
      ? { t: `Driver pay ${org.name} ran for ${short}`, d: `${short} hires these drivers. ${org.name} runs their pay as a service (${fm2(d.driver_pay_run)} this week) and charges it back here, itemized per driver, so every chargeback has a line and a reason.` }
      : d.sections.some((sc) => sc.agreement?.kind === "rental")
        ? { t: "Rental, not a share of revenue", d: `${short} is paid by the mile for trucks and by the week for trailers, whether loaded or not. ${org.name} pays the drivers and the fuel, so neither appears here.` }
        : d.category === "owner_operator"
          ? { t: "One person, one settlement", d: `${short} drives their own truck and is paid only here, never on a driver statement too.` }
          : null,
    lt: {
      cols: "92px 72px 120px 140px 150px 80px 104px 104px 112px 120px",
      fz: "fz1",
      head: [heading("Load"), heading("Truck"), heading("Delivered"), heading("Origin"), heading("Destination"), heading("Miles", true), heading("Line haul", true), heading("Charges", true), heading("Total", true), heading("Owner’s share", true)],
      rows: (loads.data ?? []).map((l) => {
        const row = l as Record<string, string | number | null>;
        return {
          key: String(row.load_id),
          open: () => set({ screen: "loads", drawer: String(row.load_id), overlay: "none", modal: "none" }),
          cells: [
            cell.text(String(row.load_number), "", "mono fs12 w5"),
            cell.maybe(d.sections.find((sc) => sc.lines.some((x) => x.load_id === row.load_id))?.unit_number ?? null, "mono fs12"),
            cell.text(row.delivered_at ? formatDateTime(String(row.delivered_at), org.timezone) : "—", "", "num t2"),
            cell.maybe(row.origin ? String(row.origin) : null),
            cell.maybe(row.destination ? String(row.destination) : null),
            cell.num(row.miles ? formatNumber(Number(row.miles)) : "—"),
            cell.money(fm2(row.line_haul as string)),
            cell.money(n(row.charges as string) ? fm2(row.charges as string) : "—", "", n(row.charges as string) ? "" : "mu"),
            cell.money(fm2(row.total as string), "", "w6"),
            cell.money(fm2(row.owner_share as string)),
          ],
        };
      }),
    },
    ltNote: "The owner’s copy of each rated freight bill shows the rate and charges; shipper and consignee names are removed.",
    esc: n(d.escrow_target) || n(d.escrow_balance)
      ? [["Balance", fm2(d.escrow_balance)], ["Target", fm2(d.escrow_target)], ["Deposit this week", n(d.escrow) ? fm2(d.escrow) : "None · fully funded or not required"], ["Interest", "Paid quarterly"]].map(([k, v]) => ({ k: k!, v: v! }))
      : [{ k: "Escrow", v: "None on this owner" }],
    trail: [
      ...d.trail.map((t) => ({ who: t.who, what: t.what, when: formatDateTime(t.when, org.timezone), k: /Approved/.test(t.what) ? "ok" : /Void/.test(t.what) ? "bad" : "info" })),
      ...(d.status === "draft" ? [{ who: "Waiting on approval", what: "Main Admin or Accounting approves", when: "", k: "warn" }] : []),
    ],
    netV: fm2(d.net),
    rules: [
      "Every deduction is itemized with what it is for and how it was figured.",
      "Once approved, the settlement is fixed: later changes are dated adjustments on the next one.",
      "Escrow earns interest paid at least every quarter and comes back within 45 days of the lease ending.",
    ],
  };
  const approve = () => void act(() => unwrap(api.POST("/api/v1/owner-settlements/{settlement_id}/approve", { params: { path: { settlement_id: d.id } }, body: { version: d.version } })), (x) => `Settlement ${x.number ?? ""} approved`);
  const pay = async (when: string) => {
    const paidOn = when ? when.slice(0, 10) : new Date().toLocaleDateString("en-CA", { timeZone: org.timezone });
    await unwrap(api.POST("/api/v1/owner-settlements/{settlement_id}/pay", { params: { path: { settlement_id: d.id } }, body: { version: d.version, paid_on: paidOn, method: (d.payment_method === "check" ? "check" : "ach") as "ach" } }));
    await act(async () => undefined, "Marked paid");
  };
  const send = () => {
    const to = o?.email ?? o?.contacts[0]?.person.email;
    if (to) window.location.href = `mailto:${to}?subject=${encodeURIComponent(`Settlement ${d.number ?? ""} · ${view.period}`)}`;
  };
  return { view, error: null, retry: () => void detail.refetch(), approve, pay, send };
}
