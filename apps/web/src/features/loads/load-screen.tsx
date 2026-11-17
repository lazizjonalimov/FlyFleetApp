"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Fragment } from "react";
import { cell } from "@/components/data-table/cell";
import { BasicCell } from "@/components/data-table/cells";
import { ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useSoon } from "@/features/console/use-action";
import { useOpenConversation } from "@/features/messages/use-message";
import { useUpload, viewDocument } from "@/features/documents/use-upload";
import { api, unwrap } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format/dates";
import { formatNumber, initials, place } from "@/lib/format/text";
import type { DocumentType } from "@/lib/upload";
import { StatusMenu, useLoadActions } from "./load-actions";
import { useLoad, useLoadDocuments } from "./load-data";
import { activity, alertOf, describe, equipmentLabel, financials, lifecycle, paperwork, riskOf, statusOf, stopStates, type LoadAlert } from "./load-view";

const head = (labels: [string, boolean?][]) => labels.map(([l, right]) => ({ l, al: right ? "rt" : "" }));
const noop = () => {};

/** Load detail page: lifecycle, route and tracking, stops, documents, financials, activity. */
export function LoadScreen() {
  const { me, state, can, fin, noFin, set, notify } = useConsole();
  const soon = useSoon();
  const message = useOpenConversation();
  const upload = useUpload();
  const id = typeof state.loadId === "string" ? state.loadId : null;
  const query = useLoad(id);
  const documents = useLoadDocuments(id);
  const load = query.data;
  const actions = useLoadActions(load);
  const org = me.organization.id;
  const driverId = load?.assignment?.driver.id;
  const driver = useQuery({ queryKey: [org, "drivers", "detail", driverId ?? ""], queryFn: () => unwrap(api.GET("/api/v1/drivers/{item_id}", { params: { path: { item_id: driverId! } } })), enabled: !!driverId && can("drivers.read") });
  const customerId = load?.customer.id;
  const customer = useQuery({ queryKey: [org, "customers", "detail", customerId ?? ""], queryFn: () => unwrap(api.GET("/api/v1/customers/{customer_id}", { params: { path: { customer_id: customerId! } } })), enabled: !!customerId && can("customers.read") });
  const goLoads = () => set(goTo("loads"));

  if (!load) {
    return (
      <div className="scr">
        <div className="ph" style={{ paddingBottom: "10px" }}>
          <div className="f1">
            <div className="crumb">
              <span>Operations</span>
              <Icon className="s12" d="M9 6l6 6-6 6" />
              <button onClick={goLoads}>Loads</button>
            </div>
          </div>
        </div>
        {query.isError ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : <Skeleton rows={8} />}
      </div>
    );
  }

  const zone = me.organization.timezone;
  const status = statusOf(load);
  const risk = riskOf(load);
  const alert = alertOf(load);
  const stops = stopStates(load);
  const money = financials(load);
  const papers = paperwork(load, documents.data?.items ?? []);
  const moving = ["dispatched", "at_pickup", "in_transit", "at_delivery"].includes(load.status);
  const delivered = ["delivered", "pod_review", "completed"].includes(load.status);
  const lastCall = [...load.tracking].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];
  const assignment = load.assignment;
  const assigned = load.assignments.find((each) => each.id === assignment?.id);
  const dispatched = load.events.find((event) => event.action === "dispatch");
  const history = activity(load, zone);
  const first = stops[0];
  const last = stops[stops.length - 1];
  const operations = customer.data?.contacts.find((contact) => contact.kind === "operations") ?? customer.data?.contacts.find((contact) => contact.is_primary);
  const billing = customer.data?.contacts.find((contact) => contact.kind === "billing");
  const act = (alert: LoadAlert) => () => (alert.act === "assign" ? actions.start("assign") : alert.act === "release" ? actions.start("release") : alert.act === "ready" ? actions.start("mark_ready") : alert.act === "pod" ? actions.start("approve_pod") : undefined);

  const stats = moving
    ? [
        { k: "Last check call", v: lastCall ? formatDateTime(lastCall.occurred_at, zone) : "None yet", tk: "" },
        { k: "Last known place", v: lastCall?.city ? place(lastCall.city, lastCall.state) : "—", tk: "" },
        { k: "Distance", v: load.miles ? `${formatNumber(load.miles)} mi` : "—", tk: "" },
        { k: "Delivery appointment", v: last?.stop.appt_start ? formatDateTime(last.stop.appt_start, zone) : "—", tk: risk?.tone === "bad" ? "bad" : "" },
        { k: "Reported by", v: lastCall ? (lastCall.source === "driver" ? "Driver" : "Dispatcher") : "—", tk: "" },
      ]
    : [
        { k: "Progress", v: delivered ? (load.miles ? `${formatNumber(load.miles)} of ${formatNumber(load.miles)} mi` : "Delivered") : "Not started", tk: "" },
        { k: "Distance", v: load.miles ? `${formatNumber(load.miles)} mi` : "—", tk: "" },
        { k: "Pickup", v: first?.stop.appt_start ? formatDateTime(first.stop.appt_start, zone) : "—", tk: "" },
        { k: "Delivery", v: last?.stop.appt_start ? formatDateTime(last.stop.appt_start, zone) : "—", tk: "" },
        { k: "Tracking", v: delivered ? "Ended at delivery" : load.status === "cancelled" ? "Cancelled" : "Starts at dispatch", tk: "" },
      ];

  const stopTable = {
    cols: "minmax(0,1.5fr) 128px 112px 112px 80px 112px",
    head: head([["Stop"], ["Appointment"], ["Arrived"], ["Departed"], ["Dwell"], ["Status"]]),
    rows: stops.map((s) => ({
      key: s.stop.id,
      open: noop,
      cells: [
        cell.text(s.stop.name || s.where, `${s.kind} · ${s.where}`, "w5"),
        cell.text(s.stop.appt_start ? formatDateTime(s.stop.appt_start, zone) : "—", "", "num t2"),
        cell.text(s.stop.arrived_at ? formatDateTime(s.stop.arrived_at, zone) : "—", "", "num t2"),
        cell.text(s.stop.departed_at ? formatDateTime(s.stop.departed_at, zone) : "—", "", "num t2"),
        cell.text(s.dwell, "", "num t3"),
        cell.badge(s.label, s.tone),
      ],
    })),
  };
  const docTable = {
    cols: "minmax(0,1fr) 160px 132px 140px 76px",
    head: head([["Document"], ["Uploaded by"], ["Review"], ["Uploaded"], [""]]),
    rows: papers.papers.map((paper, i) => ({
      key: paper.document?.id ?? `${paper.type}-${i}`,
      open: noop,
      cells: [
        cell.text(paper.label, paper.document && paper.document.filename !== paper.label ? paper.document.filename : "", "w5"),
        cell.text(paper.document?.uploaded_by_name ?? "—", "", "t3"),
        cell.badge(paper.state, paper.tone),
        cell.text(paper.document ? formatDateTime(paper.document.created_at, zone) : "—", "", "num t3"),
        paper.document
          ? cell.button("View", () => viewDocument(paper.document!.id))
          : can("documents.upload")
            ? cell.button("Upload", () => void upload({ type: paper.type as DocumentType, entityType: "load", entityId: load.id, label: paper.label }))
            : cell.text(""),
      ],
    })),
  };
  const asg = [
    { k: "Truck", v: assignment?.vehicle.name ?? "—" },
    { k: "Trailer", v: assignment?.trailer ? `${assignment.trailer.name} · ${equipmentLabel(load.equipment_type)}` : "—" },
    { k: "Assigned", v: assigned ? `${formatDateTime(assigned.assigned_at, zone)}${assigned.assigned_by_name ? ` by ${assigned.assigned_by_name}` : ""}` : "—" },
    { k: "Dispatched", v: dispatched ? formatDateTime(dispatched.created_at, zone) : "—" },
  ];
  const created = load.events.find((event) => event.action === "created");

  return (
    <div className="scr">
      <div className="ph" style={{ paddingBottom: "10px" }}>
        <div className="f1">
          <div className="crumb">
            <span>Operations</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <button onClick={goLoads}>Loads</button>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b className="mono"><span>{load.load_number}</span></b>
          </div>
          <div className="r g10">
            <h1 className="h1"><span>{`${place(load.origin_city, load.origin_state)} → ${place(load.destination_city, load.destination_state)}`}</span></h1>
            <span className="badge lg" data-k={status.tone}>
              <i></i>
              <span>{status.label}</span>
            </span>
            {risk ? (
              <span className="badge lg sq" data-k={risk.tone}>
                <Icon className="s14" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
                <span>{risk.label}</span>
              </span>
            ) : null}
          </div>
          <p className="sub"><span>{[describe(load), created ? `created ${formatDateTime(created.created_at, zone)}${created.actor_name ? ` by ${created.actor_name}` : ""}` : ""].filter(Boolean).join(" · ")}</span></p>
        </div>
        <div className="r g8">
          {can("messages.send") ? (
            <button className="btn" onClick={() => (assignment ? void message({ driverId: assignment.driver.id }) : notify("No driver is on this load yet", true))} disabled={!assignment} title={assignment ? undefined : "No driver is on this load yet"}>
              <Icon className="s14" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              Message driver
            </button>
          ) : null}
          <StatusMenu items={actions.items} start={actions.start} />
          <button className="btn pri" onClick={() => (can("messages.send") ? void message({ customerId: load.customer.id }) : soon("Notifying customers")())}>
            <Icon className="s14" d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
            Notify customer
          </button>
        </div>
      </div>
      <div className="lc">
        {lifecycle(load, zone).map((s, i) => (
          <div key={i} className={clsx("lcs", s.st)}>
            <span className="lcd">
              {s.done ? (
                <Icon className="s12 b" d="M5 12l5 5 9-10" />
              ) : null}
            </span>
            <span className="lcl"><span>{s.l}</span></span>
            <span className="lct"><span>{s.t}</span></span>
          </div>
        ))}
        {actions.has("hold") || actions.has("cancel") ? (
          <div className="lcx">
            <span className="fs11 mu">Other transitions</span>
            {actions.has("hold") ? <button className="lnk" onClick={() => actions.start("hold")}>Put on hold</button> : null}
            {actions.has("cancel") ? <button className="lnk" style={{ color: "#B42318" }} onClick={() => actions.start("cancel")}>Cancel load</button> : null}
          </div>
        ) : null}
      </div>
      <div className="tabs" style={{ marginTop: "4px" }}>
        <button className="tab on">Overview</button>
        <button className="tab">
          Stops
          <span className="tcnt">{load.stops.length}</span>
        </button>
        <button className="tab">Tracking</button>
        <button className="tab">
          Documents
          <span className="tcnt">{`${papers.have}/${papers.need}`}</span>
        </button>
        <button className="tab">
          Financials
          {noFin ? (
            <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
          ) : null}
        </button>
        <button className="tab">Messages</button>
        <button className="tab">
          Activity
          <span className="tcnt">{history.length}</span>
        </button>
      </div>
      <div className="lpg">
        <div className="c g16">
          {alert ? (
            <div className="banner" data-k={alert.tone}>
              <Icon d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
              <div className="f1">
                <div className="bt"><span>{alert.title}</span></div>
                <div><span>{alert.text}</span></div>
              </div>
              {alert.button ? (
                <div className="r g8">
                  <button className="btn sm pri" onClick={act(alert)}><span>{alert.button}</span></button>
                </div>
              ) : null}
            </div>
          ) : null}
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">{"Route & tracking"}</h2>
              <span className="badge" data-k={moving ? "ok" : "mu"}>
                <i></i>
                <span>{moving ? (lastCall ? `Last check call ${formatDateTime(lastCall.occurred_at, zone)}` : "On the road") : delivered ? "Trip complete" : "Not started"}</span>
              </span>
              <span className="sp"></span>
              <button className="lnk" onClick={() => set(goTo("tracking"))}>Open in Live fleet</button>
            </div>
            <div className="lpmap">
              <svg viewBox="0 0 760 200" preserveAspectRatio="none" aria-hidden="true" className="lpsvg">
                <path className="mroad" d="M0 168 C 140 150, 210 120, 300 128 S 520 60, 760 40" />
                <path className="mroad" d="M90 0 C 120 60, 160 120, 140 200" />
                <path className="mroad" d="M560 0 C 540 70, 600 140, 640 200" />
                {delivered ? <path className="mdone" d="M70 160 C 180 150, 260 118, 360 110 S 450 96, 492 84 C 560 66, 630 52, 690 42" /> : null}
                {moving ? (
                  <>
                    <path className="mdone" d="M70 160 C 180 150, 260 118, 360 110 S 450 96, 492 84" />
                    <path className="mrest" d="M492 84 C 560 66, 630 52, 690 42" />
                  </>
                ) : null}
                {!moving && !delivered ? <path className="mrest" d="M70 160 C 180 150, 260 118, 360 110 S 450 96, 492 84 C 560 66, 630 52, 690 42" /> : null}
              </svg>
              <span className="mpin" style={{ left: "calc(70 / 770 * 100%)", top: "160px" }} data-k="ok"></span>
              <span className="mlab" style={{ left: "calc(58 / 770 * 100%)", top: "172px" }}>
                <span>{`${load.origin_city ?? ""}${first?.stop.departed_at ? ` · departed ${formatDateTime(first.stop.departed_at, zone)}` : first?.stop.appt_start ? ` · pickup ${formatDateTime(first.stop.appt_start, zone)}` : ""}`}</span>
              </span>
              <span className="mpin" style={{ left: "calc(690 / 770 * 100%)", top: "42px" }} data-k={risk?.tone === "bad" ? "bad" : "brand"}></span>
              <span className="mlab" style={{ left: "calc(560 / 770 * 100%)", top: "16px" }}>
                <span>{`${last?.stop.name || load.destination_city || ""}${last?.stop.appt_start ? ` · appt ${formatDateTime(last.stop.appt_start, zone)}` : ""}`}</span>
              </span>
              {moving && assignment ? (
                <>
                  <span className="mtruck" style={{ left: "calc(492 / 770 * 100%)", top: "84px" }}><Icon className="s12 fill" d="M12 2l7 19-7-4-7 4z" /></span>
                  <span className="mlab" style={{ left: "calc(440 / 770 * 100%)", top: "104px" }}>
                    <span>{`${assignment.vehicle.name}${lastCall?.city ? ` · ${place(lastCall.city, lastCall.state)}` : ""}`}</span>
                  </span>
                </>
              ) : null}
            </div>
            <div className="lpstats">
              {stats.map((s, i) => (
                <div key={i}>
                  <div className="fs12 mu"><span>{s.k}</span></div>
                  <div className="fs14 w6 num tc" data-k={s.tk}><span>{s.v}</span></div>
                </div>
              ))}
            </div>
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Stops</h2>
              <span className="fs12 mu">Times in the company’s time zone</span>
              <span className="sp"></span>
              {load.editable.stops && can("loads.update") ? (
                <button className="btn sm" onClick={soon("Changing stops here")}>
                  <Icon className="s12 b" d="M12 5v14M5 12h14" />
                  Add stop
                </button>
              ) : null}
            </div>
            <div className="thead" style={{ gridTemplateColumns: stopTable.cols }}>
              {stopTable.head.map((h, i) => (
                <span key={i} className={h.al}><span>{h.l}</span></span>
              ))}
            </div>
            {stopTable.rows.map((r) => (
              <Fragment key={r.key}>
                <div className="trow" style={{ gridTemplateColumns: stopTable.cols }} onClick={r.open}>
                  {r.cells.map((c, i2) => (
                    <BasicCell key={i2} c={c} />
                  ))}
                </div>
              </Fragment>
            ))}
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Documents</h2>
              <span className="cnt" data-k={papers.tone === "ok" ? "ok" : "warn"}>{`${papers.have} of ${papers.need}`}</span>
              <span className="sp"></span>
              {can("documents.upload") ? (
                <button className="btn sm" onClick={() => void upload({ type: "other", entityType: "load", entityId: load.id, label: "Document" })}>
                  <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  Upload
                </button>
              ) : null}
            </div>
            <div className="thead" style={{ gridTemplateColumns: docTable.cols }}>
              {docTable.head.map((h, i) => (
                <span key={i} className={h.al}><span>{h.l}</span></span>
              ))}
            </div>
            {docTable.rows.map((r) => (
              <Fragment key={r.key}>
                <div className="trow" style={{ gridTemplateColumns: docTable.cols }} onClick={r.open}>
                  {r.cells.map((c, i2) => (
                    <BasicCell key={i2} c={c} />
                  ))}
                </div>
              </Fragment>
            ))}
          </section>
        </div>
        <div className="c g16">
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Assignment</h2>
              <span className="sp"></span>
              {actions.has("assign") || actions.has("reassign") ? (
                <button className="btn xs" onClick={() => actions.start(actions.has("assign") ? "assign" : "reassign")}>{assignment ? "Reassign" : "Assign"}</button>
              ) : null}
            </div>
            <div className="cb c g12">
              <div className="r g10">
                <span className="av md" data-k={assignment ? "brand" : "mu"}>
                  <span>{assignment ? initials(assignment.driver.name) : "—"}</span>
                  {assignment ? <span className="pres"></span> : null}
                </span>
                <div className="f1">
                  <div className="fs13 w5"><span>{assignment?.driver.name ?? "Unassigned"}</span></div>
                  <div className="fs12 mu">
                    <span>{assignment ? [driver.data?.phone, driver.data?.cdl_class ? `CDL ${driver.data.cdl_class}${driver.data.cdl_state ? ` · ${driver.data.cdl_state}` : ""}` : ""].filter(Boolean).join(" · ") : "Assign from the dispatch board"}</span>
                  </div>
                </div>
                {driver.data?.user_id ? (
                  <span className="chn" data-k="brand" title="Uses the driver app">
                    <Icon className="s12" d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01" />
                  </span>
                ) : null}
              </div>
              <div className="hr"></div>
              <dl className="kv">
                {asg.map((x, i) => (
                  <Fragment key={i}>
                    <dt><span>{x.k}</span></dt>
                    <dd className="num"><span>{x.v}</span></dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Financials</h2>
              {noFin ? (
                <Icon className="s14 mu" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
              ) : null}
              <span className="sp"></span>
              {fin ? (
                <span className="tag" data-k={load.invoice ? "ok" : "mu"}>{load.invoice ? "Invoiced" : "Not yet invoiced"}</span>
              ) : null}
            </div>
            {fin ? (
              <div className="cb c g8">
                {money.rows.map((f, i) => (
                  <div key={i} className="r jb fs13">
                    <span className="t3"><span>{f.k}</span></span>
                    <span className="mono num"><span>{f.v}</span></span>
                  </div>
                ))}
                <div className="r jb fs13">
                  <span className="t3">Rate per mile</span>
                  <span className="mono num">{money.perMile}</span>
                </div>
                <div className="hr"></div>
                <div className="r jb fs14 w6">
                  <span>Total</span>
                  <span className="mono num"><span>{money.total}</span></span>
                </div>
                <p className="note">
                  <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
                  Revenue is recognized on the invoice, after POD review — not here.
                </p>
              </div>
            ) : null}
            {noFin ? (
              <div className="cb fs13 mu">Rates, pay and margins aren’t available to your role.</div>
            ) : null}
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Customer</h2>
            </div>
            <div className="cb c g10">
              <div className="fs13 w5"><span>{load.customer.name}</span></div>
              {[operations, billing].filter((contact): contact is NonNullable<typeof contact> => !!contact).map((contact) => (
                <div key={contact.id} className="r g10">
                  <span className="av sm"><span>{initials(contact.name)}</span></span>
                  <div className="f1">
                    <div className="fs13"><span>{contact.name}</span></div>
                    <div className="fs12 mu">{[contact.kind === "billing" ? "Billing contact" : contact.title || "Operations", contact.phone || contact.email].filter(Boolean).join(" · ")}</div>
                  </div>
                  {contact.email ? (
                    <a href={`mailto:${contact.email}`} aria-label={`Email ${contact.name}`}>
                      <Icon className="s14 mu" d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6" />
                    </a>
                  ) : null}
                </div>
              ))}
              {customer.data && !operations && !billing ? <div className="fs12 mu">No contacts on file</div> : null}
            </div>
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Activity</h2>
              <span className="fs12 mu">Immutable · newest first</span>
            </div>
            <div className="cb" style={{ paddingTop: "8px" }}>
              {history.map((ac, i) => (
                <div key={i} className="act">
                  <span className="dot" data-k={ac.k} style={{ marginTop: "6px" }}></span>
                  <div className="fs13 t2">
                    <span className="w5 tx"><span>{ac.who}</span></span>
                    {" "}<span>{ac.what}</span>
                    {ac.src ? <span className="src"><span>{ac.src}</span></span> : null}
                  </div>
                  <span className="fs12 mu num nw"><span>{ac.when}</span></span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      {actions.dialog}
    </div>
  );
}
