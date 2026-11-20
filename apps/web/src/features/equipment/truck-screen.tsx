"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Dialog } from "@/components/feedback/dialog";
import { ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { addDays, weekStart } from "@/features/dashboard/dashboard-data";
import { useUpload, viewDocument } from "@/features/documents/use-upload";
import { MoveUnitDialog } from "@/features/equipment/move-unit-dialog";
import { SeatDialog } from "@/features/equipment/seat-dialog";
import { carrierName, freshness, loadLabel, loadTone, monthYear, TRAILER_TYPES, weekRange } from "@/features/fleet/labels";
import { AGREEMENT_KINDS, agreementKind, agreementLine, CATEGORY } from "@/features/owners/labels";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDate, todayIn } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, humanize, initials, place } from "@/lib/format/text";
import type { DocumentType } from "@/lib/upload";

type Seat = Schema<"SeatOut">;
type Ownership = Schema<"OwnershipOut">;
type Agreement = Schema<"AgreementOut">;

const WORK_ORDER: Record<string, [label: string, tone: string]> = { open: ["Scheduled", "info"], in_progress: ["In the shop", "warn"], completed: ["Done", "ok"], cancelled: ["Cancelled", "mu"] };
const DOCUMENT_LABEL: Record<string, string> = {
  cab_card: "Registration cab card", registration: "Registration", inspection: "DOT annual inspection", insurance: "Insurance certificate",
  title: "Title", lease: "Lease", maintenance: "Maintenance record", other: "Document",
};
const UNIT_DOCS: [DocumentType, string][] = [
  ["cab_card", "Registration cab card"], ["registration", "Registration"], ["inspection", "DOT annual inspection"], ["insurance", "Insurance certificate"],
  ["title", "Title or bill of sale"], ["maintenance", "Maintenance record"], ["other", "Something else"],
];
const mmyy = (date: string | null | undefined) => (date ? `${date.slice(5, 7)}/${date.slice(2, 4)}` : "—");

/** Who drives, as the design says it: the owner, the carrier's company driver, or a driver the owner hired. */
function driverRole(d: Seat["driver"], carrier: string): [role: string, paid: string] {
  if (d.employer === "self") return ["The owner", "Paid on the owner settlement"];
  if (d.employer === "owner") return d.pay_by === "owner" ? ["Hired by the owner", "Paid by the owner, outside FlyFleet"] : ["Hired by the owner", `${carrier} runs the pay and charges the owner`];
  return [`${carrier} company driver`, `Paid by ${carrier} on a driver statement`];
}

/** Who pays the drivers under an agreement. */
function driverPaidBy(a: Agreement | undefined, seat: Seat | undefined, carrier: string): string {
  if (seat) return driverRole(seat.driver, carrier)[1];
  switch (a?.driver_pay_by) {
    case "owner_drives": return "Paid on the owner settlement";
    case "owner": return "Paid by the owner, outside FlyFleet";
    case "carrier_for_owner": return `${carrier} runs the pay and charges the owner`;
    default: return `Paid by ${carrier} on a driver statement`;
  }
}

/** "30% of line haul; Acme Freight pays the driver and fuel". */
function terms(a: Agreement, carrier: string): string {
  const [, line] = agreementLine(a);
  const pays = [a.driver_pay_by === "carrier" ? "the driver" : "", a.fuel_paid_by === "carrier" && a.kind !== "owner_operator_lease" ? "fuel" : ""].filter(Boolean);
  return pays.length ? `${line}; ${carrier} pays ${pays.join(" and ")}` : line;
}

/** What one ownership row says in the history: how it came to be, and the agreement it runs under. */
function ownershipLine(row: Ownership, current: boolean): string {
  const share = Number(row.share_pct) < 100 ? `${Number(row.share_pct)}% share` : "";
  const label = row.agreement_kind ? (AGREEMENT_KINDS[row.agreement_kind]?.[0] ?? humanize(row.agreement_kind)).toLowerCase() : "";
  const agreement = label ? `${current ? "now on" : "on"} ${/^[aeiou]/.test(label) ? "an" : "a"} ${label}` : row.owner_id ? "" : "owned outright";
  return [row.reason, share, agreement].filter(Boolean).join(" · ") || (current ? "Owns it today" : "Owned it");
}

/** Truck or trailer record: where it is, who drives it, who owns it and on what terms, its money, papers and upkeep. */
export function TruckScreen() {
  const { me, can, fin, I, state, set } = useConsole();
  const upload = useUpload();
  const org = me.organization;
  const carrier = carrierName(org.name);
  const today = todayIn(org.timezone);
  const id = typeof state.unitId === "string" ? state.unitId : "";
  const trailer = state.unitKind === "trailer";
  const kind = trailer ? "trailer" : "vehicle";
  const [dialog, setDialog] = useState<"seat" | "upload" | "move" | null>(null);
  const truckQuery = useQuery({ queryKey: [org.id, "vehicles", "detail", id], queryFn: () => unwrap(api.GET("/api/v1/vehicles/{item_id}", { params: { path: { item_id: id } } })), enabled: !!id && !trailer });
  const trailerQuery = useQuery({ queryKey: [org.id, "trailers", "detail", id], queryFn: () => unwrap(api.GET("/api/v1/trailers/{item_id}", { params: { path: { item_id: id } } })), enabled: !!id && trailer });
  const unit = trailer ? trailerQuery : truckQuery;
  const u = unit.data;
  // A unit that moved to another company stays here to read only, with all its history.
  const moved = u?.status === "transferred";
  const seats = useQuery({ queryKey: [org.id, "vehicles", "seats", id], queryFn: () => unwrap(api.GET("/api/v1/vehicles/{vehicle_id}/seats", { params: { path: { vehicle_id: id } } })), enabled: !!id && !trailer });
  const ownerships = useQuery({ queryKey: [org.id, "ownerships", kind, id], queryFn: () => unwrap(api.GET("/api/v1/equipment/ownerships", { params: { query: trailer ? { trailer_id: id } : { vehicle_id: id } } })), enabled: !!id });
  const primary = [...(u?.owners ?? [])].sort((a, b) => Number(b.share_pct) - Number(a.share_pct))[0];
  const owner = useQuery({ queryKey: [org.id, "owners", primary?.owner_id], queryFn: () => unwrap(api.GET("/api/v1/owners/{owner_id}", { params: { path: { owner_id: primary!.owner_id } } })), enabled: !!primary && can("owners.read") });
  const loads = useQuery({ queryKey: [org.id, "loads", kind, id, "current"], queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { ...(trailer ? { trailer_id: id } : { vehicle_id: id }), sort: "-pickup_at", limit: 10 } } })), enabled: !!id && can("loads.read") });
  const work = useQuery({ queryKey: [org.id, "maintenance", "unit", kind, id], queryFn: () => unwrap(api.GET("/api/v1/maintenance/work-orders", { params: { query: { ...(trailer ? { trailer_id: id } : { vehicle_id: id }), sort: "-created_at", limit: 6 } } })), enabled: !!id && can("maintenance.read") });
  const documents = useQuery({ queryKey: [org.id, "documents", kind, id], queryFn: () => unwrap(api.GET("/api/v1/documents", { params: { query: { entity_type: kind, entity_id: id, limit: 50 } } })), enabled: !!id && can("documents.read") });
  const terminals = useQuery({ queryKey: [org.id, "terminals", "options"], queryFn: () => unwrap(api.GET("/api/v1/terminals", { params: { query: { status: "active", sort: "name", limit: 100 } } })), staleTime: 60_000 });
  const week = weekStart(today);
  const weekEnd = addDays(week, 6);
  const range = { date_from: week, date_to: weekEnd };
  const money = useQuery({
    queryKey: [org.id, "unit-money", kind, id, week],
    queryFn: () => (trailer ? unwrap(api.GET("/api/v1/trailers/{trailer_id}/money", { params: { path: { trailer_id: id }, query: range } })) : unwrap(api.GET("/api/v1/vehicles/{vehicle_id}/money", { params: { path: { vehicle_id: id }, query: range } }))),
    enabled: !!id && fin,
  });
  const back = () => set(goTo(trailer ? "trailers" : "trucks"));

  if (!u) {
    return (
      <div className="col">
        <div className="ph">
          <div className="f1">
            <div className="crumb">
              <span>Equipment</span>
              <Icon className="s12" d="M9 6l6 6-6 6" />
              <button onClick={back}>{trailer ? "Trailers" : "Trucks"}</button>
            </div>
          </div>
        </div>
        {unit.isError ? <ErrorState error={unit.error} retry={() => void unit.refetch()} /> : <Skeleton rows={8} />}
      </div>
    );
  }

  const v = "telematics_device" in u ? u : null;
  const model = "model" in u ? u.model : null;
  const odometer = v?.odometer ?? null;
  const title = trailer
    ? [u.year, u.make, "type" in u ? TRAILER_TYPES[u.type] : "", "length_ft" in u && u.length_ft ? `${u.length_ft}’` : ""].filter(Boolean).join(" ")
    : [u.year, u.make, model].filter(Boolean).join(" ");
  const current = u.current_load;
  const status = u.status !== "active"
    ? { st: u.status === "in_maintenance" ? "In the shop" : humanize(u.status), k: u.status === "in_maintenance" ? "warn" : u.status === "out_of_service" ? "bad" : "mu" }
    : current ? { st: loadLabel(current.status), k: loadTone(current.status) } : { st: trailer ? "Empty" : "Available", k: "ok" };
  const terminal = terminals.data?.items.find((each) => each.id === u.terminal_id);
  const nowLoad = (loads.data?.items ?? []).find((load) => load.id === current?.id);
  const [fresh, freshTone] = freshness(u.location?.seen_at);
  const where = u.location?.place ?? terminal?.name ?? "—";
  const nextService = (work.data?.items ?? []).filter((o) => (o.status === "open" || o.status === "in_progress")).sort((a, b) => (a.scheduled_for ?? "9999").localeCompare(b.scheduled_for ?? "9999"))[0];
  const serviceIn = nextService?.odometer && odometer ? nextService.odometer - odometer : null;
  const blocking = u.compliance.issues.find((issue) => issue.severity === "blocking");
  const warning = u.compliance.issues.find((issue) => issue.severity === "warning");

  // Who drives it: the seat set in Dispatch, separate from who owns it.
  const seatHistory = seats.data ?? [];
  const seat = seatHistory.find((s) => !s.effective_to);
  const team = seat?.co_driver ? seat : undefined;
  const splitLabel = team?.team_split === "miles" ? "by miles" : "50/50";
  const openDriver = (driverId: string) => () => set({ screen: "driver", driverId, drawer: null, overlay: "none", modal: "none" });
  const driverRows = seat
    ? [
        { id: seat.driver.id, n: seat.driver.name, r: team ? `Team driver · ${splitLabel}` : driverRole(seat.driver, carrier)[0] },
        ...(seat.co_driver ? [{ id: seat.co_driver.id, n: seat.co_driver.name, r: `Team driver · ${splitLabel}` }] : []),
      ]
    : [];

  // Who owns it, and the agreement it runs under with them.
  const o = owner.data;
  const ownerUnit = o?.units.find((x) => x.unit_id === u.id);
  const agreement = o?.agreements.find((a) => a.id === ownerUnit?.agreement_id);
  const others = (u.owners ?? []).filter((x) => x.owner_id !== primary?.owner_id);
  const [catLabel, catTone] = primary ? (o ? (CATEGORY[o.category ?? ""] ?? ["Owner", "teal"]) : ["Owner", "teal"]) : ["Company fleet", "mu"];
  const ownTag = primary ? `Owned by ${[primary.name, ...others.map((x) => x.name)].join(" and ")}` : "Company fleet";
  const portalUsers = o?.portal_users_list ?? [];
  const firstName = o?.person?.first_name ?? portalUsers[0]?.full_name.split(" ")[0] ?? o?.name ?? "";
  const ownerKv: [string, string][] = primary
    ? [
        ["Ownership", `${Number(primary.share_pct)}% · since ${monthYear(primary.since)}`],
        ...(others.length ? ([["Also owned by", others.map((x) => `${x.name} · ${Number(x.share_pct)}%`).join(", ")]] as [string, string][]) : []),
        ["Agreement", agreement ? agreementKind(agreement.kind) : primary.agreement_kind ? agreementKind(primary.agreement_kind) : "—"],
        ["Terms", agreement ? terms(agreement, carrier) : "—"],
        ["Fuel paid by", agreement ? (agreement.fuel_paid_by === "owner" ? "The owner, on the settlement" : carrier) : "—"],
        ["Driver paid by", driverPaidBy(agreement, seat, carrier)],
        ["Owner portal", !o ? "—" : !o.portal_enabled ? "Not shown · the portal is off" : !o.portal_permissions.includes("equipment") ? "Portal on · equipment not shared" : portalUsers.length ? `Shown to ${firstName} today` : "Shown · nobody invited yet"],
      ]
    : [
        ["Ownership", "100% · owned outright"],
        ["Agreement", "None · company equipment"],
        ["Terms", `${carrier} keeps all revenue`],
        ["Fuel paid by", carrier],
        ["Driver paid by", seat ? driverRole(seat.driver, carrier)[1] : `${carrier}, on a driver statement`],
        ["Owner portal", "—"],
      ];

  // Ownership history, newest first; the carrier when nobody else held it.
  const history = (ownerships.data ?? []).map((row) => ({
    id: row.id,
    who: row.owner_name ?? org.name,
    d: monthYear(row.effective_from),
    what: ownershipLine(row, !row.effective_to),
    k: row.effective_to ? "mu" : row.owner_id ? (o && row.owner_id === o.id ? (catTone === "brand" ? "brand" : "teal") : "teal") : "mu",
  }));
  if (ownerships.data && !history.length) history.push({ id: "carrier", who: org.name, d: monthYear(u.created_at.slice(0, 10)), what: `Owned outright · in FlyFleet since ${formatDate(u.created_at.slice(0, 10))}`, k: "mu" });

  // Assignment history: each seat, and who owned the truck then when that differs from today.
  const ownerOn = (day: string) => (ownerships.data ?? []).find((row) => row.effective_from <= day && (!row.effective_to || row.effective_to >= day));
  const asg = seatHistory.map((s) => {
    const then = ownerOn(s.effective_to ?? today);
    const thenName = then ? (then.owner_name ?? org.name) : org.name;
    const nowName = primary?.name ?? org.name;
    const how = s.co_driver ? `Team with ${s.co_driver.name} · ${s.team_split === "miles" ? "by miles" : "50/50"}` : driverRole(s.driver, carrier)[0];
    return { id: s.id, n: s.driver.name, how: thenName !== nowName ? `${how}, while ${carrierName(thenName) === carrier ? carrier : thenName} owned it` : how, from: monthYear(s.effective_from), to: s.effective_to ? monthYear(s.effective_to) : "Now" };
  });

  const m = money.data;
  const wk: [string, string][] | null = m && m.owner_gross !== null && m.owner_gross !== undefined
    ? [
        ["Load revenue", formatMoney(m.revenue, org.base_currency)],
        [`${carrier}’s share`, formatMoney(m.carrier_share, org.base_currency)],
        ["Owner gross", formatMoney(m.owner_gross, org.base_currency)],
        ["Owner’s costs", formatMoney(`-${m.owner_costs ?? "0"}`.replace("--", ""), org.base_currency)],
        ["Net to owner", formatMoney(m.net ?? "0", org.base_currency)],
        ...(m.driver_pay !== null && m.driver_pay !== undefined && !trailer
          ? ([["Driver pay", m.driver_pay_by === "owner_drives" ? "On the owner settlement" : `${formatMoney(m.driver_pay, org.base_currency)} · ${m.driver_pay_by === "owner" ? "the owner" : carrier}`]] as [string, string][])
          : []),
      ]
    : null;

  const specs: [string, string][] = trailer
    ? [
        ["VIN", u.vin ?? "—"], ["Year", u.year ? String(u.year) : "—"], ["Make", u.make ?? "—"], ["Model", model ?? "—"],
        ["Type", "type" in u ? (TRAILER_TYPES[u.type] ?? humanize(u.type)) : "—"], ["Length", "length_ft" in u && u.length_ft ? `${u.length_ft} ft` : "—"],
        ["Plate", u.plate ?? "—"], ["Plate state", u.plate_state ?? "—"], ["Plate expires", mmyy(u.registration_expiry)],
        ["Tracker", "tracker" in u && u.tracker ? u.tracker : "None"], ["Annual inspection", u.inspection_expiry ? `Valid to ${formatDate(u.inspection_expiry)}` : "—"], ["Insurance", u.insurance_expiry ? `Expires ${formatDate(u.insurance_expiry)}` : "—"],
      ]
    : [
        ["VIN", u.vin ?? "—"], ["Year", u.year ? String(u.year) : "—"], ["Make", u.make ?? "—"], ["Model", model ?? "—"],
        ["Plate", u.plate ?? "—"], ["Plate state", u.plate_state ?? "—"], ["Plate expires", mmyy(u.registration_expiry)], ["Odometer", odometer !== null ? `${formatNumber(odometer)} mi` : "—"],
        ["Engine", v?.engine ?? "—"], ["Transmission", v?.transmission ?? "—"], ["ELD", v?.telematics_device ?? "None"], ["GVWR", v?.gvwr ? `${formatNumber(v.gvwr)} lb` : "—"],
      ];
  const edit = () => set({ modal: "add", kind: trailer ? "trailer" : "truck", mstep: "manual", overlay: "none", dd: null, ddq: "", fv: { editId: u.id }, ferr: {} });
  const service = () => set({ modal: "add", kind: "workorder", mstep: "manual", overlay: "none", dd: null, ddq: "", fv: { "workorder.unit": `${kind}:${u.id}` }, ferr: {} });
  const docs = (documents.data?.items ?? []).map((d) => ({
    id: d.id,
    t: DOCUMENT_LABEL[d.type] ?? humanize(d.type),
    d: d.review_status === "rejected" ? "Rejected · upload a new copy" : d.review_status === "pending" ? "Waiting for review" : d.expires_on ? (d.type === "inspection" ? `Valid to ${formatDate(d.expires_on)}` : `Expires ${mmyy(d.expires_on)}`) : "On file",
    k: d.review_status === "rejected" || (d.expires_on && d.expires_on < today) ? "bad" : d.review_status === "pending" ? "info" : "ok",
  }));

  return (
    <div className="col">
      <div className="ph" style={{ alignItems: "center", paddingBottom: "14px" }}>
        <span className="omk lg" data-k={blocking ? "bad" : "brand"}><Icon d={trailer ? I.trailer : I.truck} style={{ width: "26px", height: "26px" }} /></span>
        <div className="f1 mw0">
          <div className="crumb" style={{ marginBottom: "2px" }}>
            <span>Equipment</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <button onClick={back}>{trailer ? "Trailers" : "Trucks"}</button>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b><span>{u.unit_number}</span></b>
          </div>
          <div className="r g10">
            <h1 className="h1"><span>{u.unit_number}</span></h1>
            {title ? <span className="fs14 t3"><span>{title}</span></span> : null}
            <span className="badge" data-k={status.k}>
              <i></i>
              <span>{status.st}</span>
            </span>
            <span className="tag" data-k={catTone}><span>{ownTag}</span></span>
          </div>
          <p className="sub"><span>{[where, fresh, odometer !== null ? `${formatNumber(odometer)} mi` : ""].filter(Boolean).join(" · ")}</span></p>
        </div>
        <div className="r g8">
          {!trailer && !moved && can("dispatch.assign") ? (
            <button className="btn" onClick={() => setDialog("seat")}>
              <Icon className="s14" d={I.user} />
              Assign driver
            </button>
          ) : null}
          {can("maintenance.manage") && !moved ? (
            <button className="btn" onClick={service}>
              <Icon className="s14" d={I.wrench} />
              Schedule service
            </button>
          ) : null}
          {can("equipment.manage") && !moved && me.organization.slug !== "all" && (me.account.is_owner || me.organization.role === "owner") && me.memberships.filter((m) => m.status === "active").length > 1 ? (
            <button className="btn" onClick={() => setDialog("move")}>
              <Icon className="s14" d={I.building} />
              Move to another company
            </button>
          ) : null}
          {can("equipment.manage") && !moved ? (
            <button className="btn" onClick={edit}>
              <Icon className="s14" d={I.pencil} />
              Edit
            </button>
          ) : null}
        </div>
      </div>
      <div className="scr5">
        <div className="lpg">
          <div className="c g16">
            <div className="kpis" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
              <div className="kpi">
                <span className="kl">Location</span>
                <span className="fs14 w6 ell"><span>{where}</span></span>
                <span className={clsx("ks", `sk-${freshTone}`)}><span>{u.location ? fresh : terminal ? "Home terminal · no position yet" : "No position yet"}</span></span>
              </div>
              <div className="kpi">
                <span className="kl">Load</span>
                <span className="fs14 w6 ell"><span>{current ? (nowLoad ? `${current.load_number} · ${place(nowLoad.origin_city, nowLoad.origin_state).split(",")[0]} → ${place(nowLoad.destination_city, nowLoad.destination_state).split(",")[0]}` : current.load_number) : "No load"}</span></span>
                <span className="ks">Right now</span>
              </div>
              <div className="kpi">
                <span className="kl">{trailer ? "Papers" : "Odometer"}</span>
                <span className={clsx("fs14 w6", !trailer && "mono")}><span>{trailer ? (blocking ? "Blocked" : warning ? "Expiring soon" : "In order") : odometer !== null ? `${formatNumber(odometer)} mi` : "—"}</span></span>
                <span className="ks">{trailer ? (blocking ?? warning)?.message ?? "Papers are current" : v?.telematics_device ? "From the ELD" : "Last entered"}</span>
              </div>
              <div className="kpi">
                <span className="kl">Next service</span>
                <span className="fs14 w6 ell"><span>{nextService ? (serviceIn !== null && serviceIn > 0 ? `${nextService.title} in ${formatNumber(serviceIn)} mi` : nextService.scheduled_for ? `${nextService.title} · ${formatDate(nextService.scheduled_for).replace(/, \d{4}$/, "")}` : nextService.title) : "None planned"}</span></span>
                <span className="ks">{nextService ? (nextService.status === "in_progress" ? "In the shop now" : "Planned") : "No open work orders"}</span>
              </div>
            </div>
            {team ? (
              <div className="banner" data-k="violet">
                <Icon d={I.users} />
                <div className="f1">
                  <div className="bt">Team truck</div>
                  <div><span>{`${team.driver.name.split(" ")[0]} and ${team.co_driver!.name.split(" ")[0]} run it together and split pay ${team.team_split === "miles" ? "by the miles each one drove" : "50/50 on team miles"}. Hours are logged per driver on the ELD; dispatch sees one truck, two drivers.`}</span></div>
                </div>
              </div>
            ) : null}
            {blocking || warning ? (
              <div className="banner" data-k={blocking ? "bad" : "warn"}>
                <Icon d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
                <div className="f1">
                  <div className="bt"><span>{(blocking ?? warning)!.message}</span></div>
                  <div><span>{blocking ? "The unit can’t be dispatched until the renewed paper is on file." : "Renew it before it takes the unit off the road."}</span></div>
                </div>
              </div>
            ) : null}
            {!trailer ? (
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">Drivers</h2>
                  <span className="fs12 mu">Set in Dispatch · separate from ownership</span>
                </div>
                {driverRows.map((d) => (
                  <button key={d.id} className="wl wlb" onClick={openDriver(d.id)}>
                    <span className="av md"><span>{initials(d.n)}</span></span>
                    <div className="f1 mw0">
                      <div className="fs13 w5"><span>{d.n}</span></div>
                      <div className="fs12 mu"><span>{d.r}</span></div>
                    </div>
                    <Icon className="s14 mu" d="M9 6l6 6-6 6" />
                  </button>
                ))}
                {seats.data && !seat ? (
                  <div className="cb fs12 mu">
                    Nobody is assigned to this truck.{" "}
                    {can("dispatch.assign") ? <button className="lnk" onClick={() => setDialog("seat")}>Assign a driver</button> : null}
                  </div>
                ) : null}
              </section>
            ) : null}
            <section className="card oh">
              <div className="ch"><h2 className="h2">Specifications</h2></div>
              <div className="cb">
                <div className="spec5">
                  {specs.map(([k, value]) => (
                    <div key={k} className="c g2 mw0">
                      <span className="fs12 mu"><span>{k}</span></span>
                      <span className="fs13 w5 ell"><span>{value}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            {!trailer ? (
              <section className="card oh">
                <div className="ch"><h2 className="h2">Assignment history</h2></div>
                {asg.map((a) => (
                  <div key={a.id} className="wl">
                    <div className="f1 mw0">
                      <div className="fs13 w5"><span>{a.n}</span></div>
                      <div className="fs12 mu"><span>{a.how}</span></div>
                    </div>
                    <span className="fs12 t3 num nw"><span>{a.from}</span>{" – "}<span>{a.to}</span></span>
                  </div>
                ))}
                {seats.data && !asg.length ? <div className="cb fs12 mu">No driver has been assigned to this truck yet.</div> : null}
              </section>
            ) : null}
            {can("maintenance.read") ? (
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">Maintenance</h2>
                  <span className="sp"></span>
                  <button className="lnk" onClick={() => set(goTo("maintenance"))}>All work orders</button>
                </div>
                {(work.data?.items ?? []).map((w) => {
                  const [label, tone] = WORK_ORDER[w.status] ?? [humanize(w.status), "mu"];
                  return (
                    <div key={w.id} className="wl">
                      <span className="mono fs12 w5"><span>{w.number}</span></span>
                      <div className="f1 mw0">
                        <div className="fs13 ell"><span>{w.title}</span></div>
                        <div className="fs12 mu ell"><span>{[w.vendor ?? `${carrier} shop`, w.scheduled_for ? formatDate(w.scheduled_for).replace(/, \d{4}$/, "") : w.completed_at ? formatDate(w.completed_at.slice(0, 10)).replace(/, \d{4}$/, "") : ""].filter(Boolean).join(" · ")}</span></div>
                      </div>
                      <span className="badge" data-k={tone}>
                        <i></i>
                        <span>{label}</span>
                      </span>
                      <span className="mono fs13 nw"><span>{Number(w.total_cost) ? formatMoney(w.total_cost, w.currency) : "–"}</span></span>
                    </div>
                  );
                })}
                {work.data && !work.data.items.length ? <div className="cb fs12 mu">No work orders yet.</div> : null}
              </section>
            ) : null}
          </div>
          <div className="c g16">
            <section className="card oh">
              <div className="ch">
                <div className="f1 c">
                  <h2 className="h2">Owner and agreement</h2>
                  <span className="fs12 mu">Who owns it never changes who drives it</span>
                </div>
                {primary && can("owners.read") ? <button className="lnk" onClick={() => set({ screen: "owner", ownerId: primary.owner_id, otab: "ov", overlay: "none", modal: "none", drawer: null })}>Open owner</button> : null}
              </div>
              <div className="cb c g10">
                <div className="r g8">
                  <span className="fs14 w6"><span>{primary ? primary.name : org.name}</span></span>
                  <span className="tag" data-k={catTone}><span>{catLabel}</span></span>
                </div>
                <dl className="kv kvw5">
                  {ownerKv.map(([k, value]) => (
                    <div key={k} style={{ display: "contents" }}>
                      <dt>{k}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </section>
            {fin && wk ? (
              <section className="card oh">
                <div className="ch"><h2 className="h2">{`This week’s money · ${weekRange(week, weekEnd)}`}</h2></div>
                <div className="cb">
                  <dl className="kv">
                    {wk.map(([k, value]) => (
                      <div key={k} style={{ display: "contents" }}>
                        <dt>{k}</dt>
                        <dd className={clsx(/^-?\$/.test(value) && "mono")}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </section>
            ) : null}
            <section className="card oh">
              <div className="ch"><h2 className="h2">Ownership history</h2></div>
              <div className="tl5">
                {history.map((h) => (
                  <div key={h.id} className="tl5i">
                    <span className="dot" data-k={h.k}></span>
                    <div className="f1 mw0">
                      <div className="r g8">
                        <span className="fs13 w6"><span>{h.who}</span></span>
                        <span className="sp"></span>
                        <span className="fs12 mu num"><span>{h.d}</span></span>
                      </div>
                      <div className="fs12 t3"><span>{h.what}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            {can("documents.read") ? (
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">Documents</h2>
                  <span className="sp"></span>
                  {can("documents.upload") ? <button className="lnk" onClick={() => setDialog("upload")}>Upload</button> : null}
                </div>
                {docs.map((d) => (
                  <button key={d.id} className="wl wlb" onClick={() => viewDocument(d.id)}>
                    <span className="plogo" data-k={d.k}><Icon className="s14" d={I.file} /></span>
                    <div className="f1 mw0">
                      <div className="fs13 w5 ell"><span>{d.t}</span></div>
                      <div className="fs12 mu ell"><span>{d.d}</span></div>
                    </div>
                  </button>
                ))}
                {documents.data && !docs.length ? <div className="cb fs12 mu">No documents yet. Upload the cab card, the annual inspection and the title.</div> : null}
              </section>
            ) : null}
          </div>
        </div>
      </div>
      {dialog === "move" && u ? <MoveUnitDialog kind={kind} unitId={u.id} unitNumber={u.unit_number} onClose={() => setDialog(null)} /> : null}
      {dialog === "seat" && !trailer ? <SeatDialog vehicleId={u.id} unitNumber={u.unit_number} seat={seat ?? null} onClose={() => setDialog(null)} /> : null}
      {dialog === "upload" ? (
        <Dialog title="Add a document" sub={`To ${u.unit_number}’s file`} onClose={() => setDialog(null)} footer={<button className="btn" onClick={() => setDialog(null)}>Cancel</button>}>
          <div className="c g6">
            {UNIT_DOCS.map(([type, label]) => (
              <button key={type} className="btn" style={{ justifyContent: "flex-start" }} onClick={() => { setDialog(null); void upload({ type, entityType: kind, entityId: u.id, label }); }}>{label}</button>
            ))}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
