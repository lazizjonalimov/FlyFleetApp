"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useUpload, viewDocument } from "@/features/documents/use-upload";
import { loadLabel, loadTone, monthYear, OWNERSHIP, TRAILER_TYPES } from "@/features/fleet/labels";
import { api, unwrap } from "@/lib/api/client";
import { formatDate, formatDateTime, todayIn } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, humanize, initials, place } from "@/lib/format/text";
import { addDays, weekStart } from "@/features/dashboard/dashboard-data";

const WORK_ORDER_TONE: Record<string, string> = { open: "info", in_progress: "warn", completed: "ok", cancelled: "mu" };
const DOCUMENT_TYPES: Record<string, string> = { registration: "Registration", insurance: "Insurance", inspection: "Inspection report", maintenance: "Maintenance record", other: "Document" };

/** Truck or trailer record: what it is doing, who drives it, its papers, upkeep and history. */
export function TruckScreen() {
  const { me, can, fin, I, state, set } = useConsole();
  const upload = useUpload();
  const org = me.organization;
  const zone = org.timezone;
  const today = todayIn(zone);
  const id = typeof state.unitId === "string" ? state.unitId : "";
  const trailer = state.unitKind === "trailer";
  const kind = trailer ? "trailer" : "vehicle";
  const truckQuery = useQuery({ queryKey: [org.id, "vehicles", "detail", id], queryFn: () => unwrap(api.GET("/api/v1/vehicles/{item_id}", { params: { path: { item_id: id } } })), enabled: !!id && !trailer });
  const trailerQuery = useQuery({ queryKey: [org.id, "trailers", "detail", id], queryFn: () => unwrap(api.GET("/api/v1/trailers/{item_id}", { params: { path: { item_id: id } } })), enabled: !!id && trailer });
  const unit = trailer ? trailerQuery : truckQuery;
  const loads = useQuery({ queryKey: [org.id, "loads", kind, id], queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { ...(trailer ? { trailer_id: id } : { vehicle_id: id }), sort: "-pickup_at", limit: 25 } } })), enabled: !!id && can("loads.read") });
  const work = useQuery({ queryKey: [org.id, "maintenance", "unit", kind, id], queryFn: () => unwrap(api.GET("/api/v1/maintenance/work-orders", { params: { query: { ...(trailer ? { trailer_id: id } : { vehicle_id: id }), sort: "-created_at", limit: 6 } } })), enabled: !!id && can("maintenance.read") });
  const documents = useQuery({ queryKey: [org.id, "documents", kind, id], queryFn: () => unwrap(api.GET("/api/v1/documents", { params: { query: { entity_type: kind, entity_id: id, limit: 50 } } })), enabled: !!id && can("documents.read") });
  const history = useQuery({ queryKey: [org.id, "audit", kind, id], queryFn: () => unwrap(api.GET("/api/v1/audit-logs", { params: { query: { entity_type: kind, entity_id: id, limit: 8 } } })), enabled: !!id && can("audit.read") });
  const terminals = useQuery({ queryKey: [org.id, "terminals", "options"], queryFn: () => unwrap(api.GET("/api/v1/terminals", { params: { query: { status: "active", sort: "name", limit: 100 } } })), staleTime: 60_000 });
  const week = weekStart(today);
  const report = useQuery({ queryKey: [org.id, "reports", "trucks", week, today], queryFn: () => unwrap(api.GET("/api/v1/reports/trucks", { params: { query: { date_from: week, date_to: today } } })), enabled: !trailer && fin && can("reports.read"), staleTime: 60_000 });
  const back = () => set(goTo(trailer ? "trailers" : "trucks"));
  const u = unit.data;

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

  const model = "model" in u ? u.model : null;
  const odometer = "odometer" in u ? u.odometer : null;
  const title = trailer ? [u.year, u.make, "type" in u ? TRAILER_TYPES[u.type] : "", "length_ft" in u && u.length_ft ? `${u.length_ft}’` : ""].filter(Boolean).join(" ") : [u.year, u.make, model].filter(Boolean).join(" ");
  const current = u.current_load;
  const status = u.status !== "active" ? { st: humanize(u.status), k: u.status === "in_maintenance" ? "warn" : u.status === "out_of_service" ? "bad" : "mu" } : current ? { st: loadLabel(current.status), k: loadTone(current.status) } : { st: trailer ? "Empty" : "Available", k: "ok" };
  const terminal = terminals.data?.items.find((each) => each.id === u.terminal_id);
  const items = loads.data?.items ?? [];
  const nowLoad = items.find((load) => load.id === current?.id);
  const nextService = (work.data?.items ?? []).filter((order) => (order.status === "open" || order.status === "in_progress") && order.scheduled_for).sort((a, b) => (a.scheduled_for ?? "").localeCompare(b.scheduled_for ?? ""))[0];
  const drivers = [...new Map(items.filter((load) => load.assignment).map((load) => [load.assignment!.driver.id, { load, driver: load.assignment!.driver }])).values()].slice(0, 4);
  const stats = report.data?.rows.find((row) => String(row.label) === u.unit_number);
  const blocking = u.compliance.issues.find((issue) => issue.severity === "blocking");
  const warning = u.compliance.issues.find((issue) => issue.severity === "warning");
  const specs = [
    { k: "VIN", v: u.vin ?? "—" },
    { k: "Year", v: u.year ? String(u.year) : "—" },
    { k: "Make", v: u.make ?? "—" },
    ...(trailer ? [{ k: "Type", v: "type" in u ? (TRAILER_TYPES[u.type] ?? humanize(u.type)) : "—" }, { k: "Length", v: "length_ft" in u && u.length_ft ? `${u.length_ft} ft` : "—" }] : [{ k: "Model", v: model ?? "—" }, { k: "Odometer", v: odometer ? `${formatNumber(odometer)} mi` : "—" }]),
    { k: "Plate", v: [u.plate, u.plate_state].filter(Boolean).join(" · ") || "—" },
    { k: "Registration", v: u.registration_expiry ? `Expires ${formatDate(u.registration_expiry)}` : "—" },
    { k: "Insurance", v: u.insurance_expiry ? `Expires ${formatDate(u.insurance_expiry)}` : "—" },
    { k: "Annual inspection", v: u.inspection_expiry ? `Valid to ${formatDate(u.inspection_expiry)}` : "—" },
  ];
  const edit = () => set({ modal: "add", kind: trailer ? "trailer" : "truck", mstep: "manual", overlay: "none", dd: null, ddq: "", fv: { editId: u.id }, ferr: {} });
  const service = () => set({ modal: "add", kind: "workorder", mstep: "manual", overlay: "none", dd: null, ddq: "", fv: { "workorder.unit": `${kind}:${u.id}` }, ferr: {} });

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
            <span className="tag" data-k={u.ownership === "owned" ? "mu" : "brand"}><span>{OWNERSHIP[u.ownership] ?? humanize(u.ownership)}</span></span>
          </div>
          <p className="sub"><span>{[terminal ? terminal.name : "", current ? `On ${current.load_number}` : "Not on a load", odometer ? `${formatNumber(odometer)} mi` : ""].filter(Boolean).join(" · ")}</span></p>
        </div>
        <div className="r g8">
          {can("dispatch.assign") ? (
            <button className="btn" onClick={() => set(goTo("dispatch"))}>
              <Icon className="s14" d={I.user} />
              Assign driver
            </button>
          ) : null}
          {can("maintenance.manage") ? (
            <button className="btn" onClick={service}>
              <Icon className="s14" d={I.wrench} />
              Schedule service
            </button>
          ) : null}
          {can("equipment.manage") ? (
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
                <span className="kl">Where</span>
                <span className="fs14 w6 ell"><span>{nowLoad ? `${place(nowLoad.origin_city, nowLoad.origin_state)} → ${place(nowLoad.destination_city, nowLoad.destination_state)}` : (terminal?.name ?? "—")}</span></span>
                <span className="ks"><span>{nowLoad ? "Current route" : terminal ? "Home terminal" : "No terminal set"}</span></span>
              </div>
              <div className="kpi">
                <span className="kl">Load</span>
                <span className="fs14 w6 ell"><span>{current ? current.load_number : "None"}</span></span>
                <span className="ks">Right now</span>
              </div>
              <div className="kpi">
                <span className="kl">{trailer ? "Compliance" : "Odometer"}</span>
                <span className={clsx("fs14 w6", !trailer && "mono")}><span>{trailer ? (blocking ? "Blocked" : warning ? "Expiring soon" : "In order") : odometer ? formatNumber(odometer) : "—"}</span></span>
                <span className="ks">{trailer ? (blocking ?? warning)?.message ?? "Papers are current" : "Last entered"}</span>
              </div>
              <div className="kpi">
                <span className="kl">Next service</span>
                <span className="fs14 w6 ell"><span>{nextService ? nextService.title : "None scheduled"}</span></span>
                <span className="ks">{nextService?.scheduled_for ? formatDate(nextService.scheduled_for) : "Planned work orders"}</span>
              </div>
            </div>
            {blocking || warning ? (
              <div className="banner" data-k={blocking ? "bad" : "warn"}>
                <Icon d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
                <div className="f1">
                  <div className="bt"><span>{(blocking ?? warning)!.message}</span></div>
                  <div><span>{blocking ? "The unit can’t be dispatched until the renewed paper is on file." : "Renew it before it takes the unit off the road."}</span></div>
                </div>
              </div>
            ) : null}
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Drivers</h2>
                <span className="fs12 mu">From its recent loads · set in Dispatch</span>
              </div>
              {drivers.length ? (
                drivers.map(({ driver, load }) => (
                  <button key={driver.id} className="wl wlb" onClick={() => set({ screen: "driver", driverId: driver.id, drawer: null, overlay: "none", modal: "none" })}>
                    <span className="av md"><span>{initials(driver.name)}</span></span>
                    <div className="f1 mw0">
                      <div className="fs13 w5"><span>{driver.name}</span></div>
                      <div className="fs12 mu"><span>{load.id === current?.id ? `Driving it now on ${load.load_number}` : `Last on ${load.load_number}`}</span></div>
                    </div>
                    <Icon className="s14 mu" d="M9 6l6 6-6 6" />
                  </button>
                ))
              ) : (
                <div className="cb fs12 mu">{loads.data ? "No loads with this unit yet." : "…"}</div>
              )}
            </section>
            <section className="card oh">
              <div className="ch"><h2 className="h2">Specifications</h2></div>
              <div className="cb">
                <div className="spec5">
                  {specs.map((x) => (
                    <div key={x.k} className="c g2 mw0">
                      <span className="fs12 mu"><span>{x.k}</span></span>
                      <span className="fs13 w5 ell"><span>{x.v}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <section className="card oh">
              <div className="ch"><h2 className="h2">Assignment history</h2></div>
              {items.filter((load) => load.assignment).slice(0, 6).map((load) => (
                <div key={load.id} className="wl">
                  <div className="f1 mw0">
                    <div className="fs13 w5"><span>{load.assignment!.driver.name}</span></div>
                    <div className="fs12 mu"><span>{`${load.load_number} · ${load.origin_city ?? ""} → ${load.destination_city ?? ""}`}</span></div>
                  </div>
                  <span className="fs12 t3 num nw"><span>{load.pickup_at ? formatDate(load.pickup_at.slice(0, 10)) : "—"}</span>{" – "}<span>{load.delivered_at ? formatDate(load.delivered_at.slice(0, 10)) : load.status === "cancelled" ? "Cancelled" : "Now"}</span></span>
                </div>
              ))}
              {loads.data && !items.some((load) => load.assignment) ? <div className="cb fs12 mu">Not assigned to a load yet.</div> : null}
            </section>
            {can("maintenance.read") ? (
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">Maintenance</h2>
                  <span className="sp"></span>
                  <button className="lnk" onClick={() => set(goTo("maintenance"))}>All work orders</button>
                </div>
                {(work.data?.items ?? []).map((m) => (
                  <div key={m.id} className="wl">
                    <span className="mono fs12 w5"><span>{m.number}</span></span>
                    <div className="f1 mw0">
                      <div className="fs13 ell"><span>{m.title}</span></div>
                      <div className="fs12 mu ell"><span>{[m.vendor, m.scheduled_for ? formatDate(m.scheduled_for) : m.completed_at ? `Done ${formatDateTime(m.completed_at, zone)}` : ""].filter(Boolean).join(" · ")}</span></div>
                    </div>
                    <span className="badge" data-k={WORK_ORDER_TONE[m.status] ?? "mu"}>
                      <i></i>
                      <span>{humanize(m.status)}</span>
                    </span>
                    <span className="mono fs13 nw"><span>{Number(m.total_cost) ? formatMoney(m.total_cost, m.currency) : "—"}</span></span>
                  </div>
                ))}
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
              </div>
              <div className="cb c g10">
                <div className="r g8">
                  <span className="fs14 w6"><span>{u.ownership === "owned" ? org.name : OWNERSHIP[u.ownership]}</span></span>
                  <span className="tag" data-k={u.ownership === "owned" ? "mu" : "brand"}><span>{OWNERSHIP[u.ownership] ?? humanize(u.ownership)}</span></span>
                </div>
                <dl className="kv kvw5">
                  <dt>Terminal</dt>
                  <dd>{terminal?.name ?? "—"}</dd>
                  <dt>Status</dt>
                  <dd>{humanize(u.status)}</dd>
                  <dt>In FlyFleet since</dt>
                  <dd>{formatDate(u.created_at.slice(0, 10))}</dd>
                </dl>
              </div>
            </section>
            {!trailer && fin && can("reports.read") ? (
              <section className="card oh">
                <div className="ch"><h2 className="h2">{`This week’s money · ${formatDate(week).replace(/, \d{4}$/, "")}–${new Date(`${addDays(week, 6)}T12:00:00Z`).getUTCDate()}`}</h2></div>
                <div className="cb">
                  <dl className="kv">
                    <dt>Loads delivered</dt>
                    <dd className="mono">{stats ? formatNumber(Number(stats.loads ?? 0)) : "0"}</dd>
                    <dt>Miles</dt>
                    <dd className="mono">{stats ? formatNumber(Number(stats.miles ?? 0)) : "0"}</dd>
                    <dt>Load revenue</dt>
                    <dd className="mono">{formatMoney(String(stats?.revenue ?? "0"), org.base_currency)}</dd>
                    <dt>Revenue per mile</dt>
                    <dd className="mono">{stats && Number(stats.miles) ? formatMoney(String(stats.revenue_per_mile ?? "0"), org.base_currency) : "—"}</dd>
                  </dl>
                </div>
              </section>
            ) : null}
            <section className="card oh">
              <div className="ch"><h2 className="h2">History</h2></div>
              <div className="tl5">
                {(history.data?.items ?? []).map((h) => (
                  <div key={h.id} className="tl5i">
                    <span className="dot" data-k={h.action.endsWith("created") ? "mu" : "brand"}></span>
                    <div className="f1 mw0">
                      <div className="r g8">
                        <span className="fs13 w6"><span>{h.actor_name ?? "System"}</span></span>
                        <span className="sp"></span>
                        <span className="fs12 mu num"><span>{formatDateTime(h.created_at, zone)}</span></span>
                      </div>
                      <div className="fs12 t3"><span>{humanize(h.action.split(".").pop() ?? h.action).toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span></div>
                    </div>
                  </div>
                ))}
                {!history.data?.items.length ? (
                  <div className="tl5i">
                    <span className="dot" data-k="mu"></span>
                    <div className="f1 mw0">
                      <div className="r g8">
                        <span className="fs13 w6">Added to FlyFleet</span>
                        <span className="sp"></span>
                        <span className="fs12 mu num"><span>{formatDate(u.created_at.slice(0, 10))}</span></span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Documents</h2>
                <span className="sp"></span>
                {can("documents.upload") ? <button className="lnk" onClick={() => void upload({ type: "registration", entityType: kind, entityId: u.id, label: "Document" })}>Upload</button> : null}
              </div>
              {(documents.data?.items ?? []).map((d) => (
                <button key={d.id} className="wl wlb" onClick={() => viewDocument(d.id)}>
                  <span className="plogo" data-k={d.review_status === "rejected" ? "bad" : d.review_status === "pending" ? "info" : "ok"}><Icon className="s14" d={I.file} /></span>
                  <div className="f1 mw0">
                    <div className="fs13 w5 ell"><span>{DOCUMENT_TYPES[d.type] ?? humanize(d.type)}</span></div>
                    <div className="fs12 mu ell"><span>{[d.filename, d.expires_on ? `Expires ${monthYear(d.expires_on)}` : ""].filter(Boolean).join(" · ")}</span></div>
                  </div>
                </button>
              ))}
              {documents.data && !documents.data.items.length ? <div className="cb fs12 mu">No documents yet.</div> : null}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

