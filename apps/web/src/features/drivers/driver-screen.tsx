"use client";

import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { cell } from "@/components/data-table/cell";
import { BasicCell } from "@/components/data-table/cells";
import { ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { I } from "@/features/console/icons";
import type { Cell } from "@/features/console/view";
import { useUpload, viewDocument } from "@/features/documents/use-upload";
import { DRIVER_TYPES, loadLabel, loadTone, monthYear, PAY_TYPES } from "@/features/fleet/labels";
import { useOpenConversation } from "@/features/messages/use-message";
import { InviteDrivers } from "./invite-drivers";
import { api, unwrap } from "@/lib/api/client";
import { formatDate, formatDateTime, todayIn, toLocalInput } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, humanize, initials, place } from "@/lib/format/text";

const QUALIFICATIONS: Record<string, string> = { mvr: "Motor vehicle record", drug_test: "Drug test", road_test: "Road test", employment_application: "Employment application", annual_review: "Annual review", hazmat: "Hazmat endorsement", twic: "TWIC card", training: "Training", other: "Other" };
const DAY = 86_400_000;

/** Valid, expiring within 30 days, or expired, for a date on the company's calendar. */
function validity(expires: string | null | undefined, today: string): [label: string, tone: string] {
  if (!expires) return ["On file", "ok"];
  const days = Math.round((Date.parse(`${expires}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY);
  if (days < 0) return ["Expired", "bad"];
  if (days <= 30) return [`${days} days left`, "warn"];
  return ["Valid", "ok"];
}

/** Driver profile with the qualification file. */
export function DriverScreen() {
  const { me, can, fin, state, set } = useConsole();
  const message = useOpenConversation();
  const upload = useUpload();
  const org = me.organization;
  const zone = org.timezone;
  const today = todayIn(zone);
  const id = typeof state.driverId === "string" ? state.driverId : "";
  const [revealed, setRevealed] = useState(false);
  const driver = useQuery({ queryKey: [org.id, "drivers", "detail", id], queryFn: () => unwrap(api.GET("/api/v1/drivers/{item_id}", { params: { path: { item_id: id } } })), enabled: !!id });
  const qualifications = useQuery({ queryKey: [org.id, "drivers", "qualifications", id], queryFn: () => unwrap(api.GET("/api/v1/drivers/{parent_id}/qualifications", { params: { path: { parent_id: id } } })), enabled: !!id });
  const documents = useQuery({ queryKey: [org.id, "documents", "driver", id], queryFn: () => unwrap(api.GET("/api/v1/documents", { params: { query: { entity_type: "driver", entity_id: id, limit: 100 } } })), enabled: !!id && can("documents.read") });
  const loads = useQuery({ queryKey: [org.id, "loads", "driver", id], queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { driver_id: id, sort: "-pickup_at", limit: 8 } } })), enabled: !!id && can("loads.read") });
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - 30 * DAY).toISOString().slice(0, 10);
  const report = useQuery({ queryKey: [org.id, "reports", "drivers", since, today], queryFn: () => unwrap(api.GET("/api/v1/reports/drivers", { params: { query: { date_from: since, date_to: today } } })), enabled: !!id && can("reports.read"), staleTime: 60_000 });
  const goDrivers = () => set(goTo("drivers"));
  const d = driver.data;

  if (!d) {
    return (
      <div className="scr">
        <div className="ph">
          <div className="f1">
            <div className="crumb">
              <span>Directory</span>
              <Icon className="s12" d="M9 6l6 6-6 6" />
              <button onClick={goDrivers}>Drivers</button>
            </div>
          </div>
        </div>
        {driver.isError ? <ErrorState error={driver.error} retry={() => void driver.refetch()} /> : <Skeleton rows={8} />}
      </div>
    );
  }

  const blocking = d.compliance.issues.find((issue) => issue.severity === "blocking");
  const warning = d.compliance.issues.find((issue) => issue.severity === "warning");
  const status = d.status !== "active" ? { st: humanize(d.status), k: "mu" } : d.current_load ? { st: "On load", k: loadTone(d.current_load.status) } : { st: "Available", k: "ok" };
  const docs = documents.data?.items ?? [];
  const docOf = (type: string) => docs.find((doc) => doc.type === type);
  const row = (item: string, sub: string, expires: string | null | undefined, source: string, docId?: string): { key: string; open: () => void; cells: Cell[] } => {
    const [label, tone] = validity(expires, today);
    return {
      key: `${item}-${sub}`,
      open: () => {},
      cells: [cell.text(item, sub, "w5"), cell.badge(label, tone), cell.text(expires ? monthYear(expires) : "—", "", "num t2"), cell.text(source, "", "t3"), docId ? cell.button("View", () => viewDocument(docId)) : cell.text("")],
    };
  };
  const license = docOf("license");
  const medical = docOf("medical");
  const qualificationRows = [
    row(`CDL${d.cdl_class ? ` — Class ${d.cdl_class}` : ""}${d.cdl_state ? `/${d.cdl_state}` : ""}`, "", d.cdl_expiry, license ? `${license.filename} · ${humanize(license.review_status)}` : "Entered on the driver record", license?.id),
    row("Medical certificate", "", d.medical_cert_expiry, medical ? `${medical.filename} · ${humanize(medical.review_status)}` : "Entered on the driver record", medical?.id),
    ...(qualifications.data ?? []).map((q) => row(QUALIFICATIONS[q.type] ?? humanize(q.type), [q.required ? "Required" : "", q.reference].filter(Boolean).join(" · "), q.expires_on, q.issued_on ? `Issued ${formatDate(q.issued_on)}` : "Entered by hand")),
  ];
  const loadRows = (loads.data?.items ?? []).map((load) => ({
    key: load.id,
    open: () => set({ screen: "loads", drawer: load.id, overlay: "none", modal: "none" }),
    cells: [cell.id(load.load_number, () => set({ screen: "loads", drawer: load.id, overlay: "none", modal: "none" })), cell.text(`${load.origin_city ?? ""} → ${load.destination_city ?? ""}`, load.customer.name), cell.text(load.delivery_at ? formatDateTime(load.delivery_at, zone) : "—", "", "num t2"), cell.badge(loadLabel(load.status), loadTone(load.status))] as Cell[],
  }));
  const current = (loads.data?.items ?? []).filter((load) => ["assigned", "dispatched", "at_pickup", "in_transit", "at_delivery", "on_hold"].includes(load.status)).slice(0, 2);
  const onNow = current[0]?.assignment;
  const stats = report.data?.rows.find((r) => String(r.label) === d.full_name);
  const pay = d.pay_type ? `${PAY_TYPES[d.pay_type] ?? humanize(d.pay_type)}${Number(d.pay_rate) ? ` · ${d.pay_type === "percent" ? `${Number(d.pay_rate)}%` : formatMoney(d.pay_rate, org.base_currency)}` : ""}` : "—";
  const editDriver = () => set({ modal: "add", kind: "driver", mstep: "manual", overlay: "none", dd: null, ddq: "", fv: { editId: d.id }, ferr: {} });

  return (
    <div className="scr">
      <div className="ph" style={{ alignItems: "center", paddingBottom: "16px" }}>
        <span className="av lg" data-k={blocking ? "bad" : d.current_load ? "brand" : "ok"}>
          <span>{initials(d.full_name)}</span>
          <span className="pres" style={{ width: "14px", height: "14px", borderWidth: "3px" }}></span>
        </span>
        <div className="f1">
          <div className="crumb" style={{ marginBottom: "2px" }}>
            <span>Directory</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <button onClick={goDrivers}>Drivers</button>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b><span>{d.full_name}</span></b>
          </div>
          <div className="r g10">
            <h1 className="h1"><span>{d.full_name}</span></h1>
            <span className="badge" data-k={status.k}>
              <i></i>
              <span>{status.st}</span>
            </span>
            <span className="badge sq" data-k={blocking ? "bad" : warning ? "warn" : "ok"}>
              <Icon className="s12 b" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
              <span>{blocking ? "Not dispatchable" : warning ? "Expiring soon" : "Qualified"}</span>
            </span>
          </div>
          <p className="sub"><span>{[d.employee_number ? `Employee ${d.employee_number}` : "", DRIVER_TYPES[d.driver_type] ?? humanize(d.driver_type), d.hire_date ? `hired ${monthYear(d.hire_date)}` : "", d.phone, d.email].filter(Boolean).join(" · ")}</span></p>
        </div>
        <div className="r g8">
          {can("messages.send") ? (
            <button className="btn" onClick={() => void message({ driverId: d.id })}>
              <Icon className="s14" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              Message
            </button>
          ) : null}
          {can("drivers.manage") ? (
            <button className="btn" onClick={editDriver}>
              <Icon className="s14" d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
              Edit
            </button>
          ) : null}
          {can("dispatch.assign") ? <button className="btn pri" onClick={() => set(goTo("dispatch"))}>Assign load</button> : null}
        </div>
      </div>
      <div className="tabs">
        <button className="tab on">Overview</button>
        <button className="tab">
          Qualifications
          <span className="tcnt">{qualificationRows.length}</span>
        </button>
        <button className="tab">
          Documents
          <span className="tcnt">{docs.length}</span>
        </button>
        <button className="tab">Loads</button>
        <button className="tab">Activity</button>
      </div>
      <div className="lpg">
        <div className="c g16">
          {blocking || warning ? (
            <div className="banner" data-k={blocking ? "bad" : "warn"}>
              <Icon d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
              <div className="f1">
                <div className="bt"><span>{(blocking ?? warning)!.message}</span></div>
                <div><span>{blocking ? "The driver can’t be assigned until a renewed document is on file." : "Renew it before it stops the driver from being dispatched."}</span></div>
              </div>
              {can("documents.upload") ? <button className="btn sm" onClick={() => void upload({ type: (blocking ?? warning)!.code.startsWith("MEDICAL") ? "medical" : (blocking ?? warning)!.code.startsWith("CDL") ? "license" : "other", entityType: "driver", entityId: d.id, label: "Document" })}><span>Upload renewal</span></button> : null}
            </div>
          ) : null}
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Qualification file</h2>
              <span className="fs12 mu">Dates on file decide eligibility — reminders don’t</span>
              <span className="sp"></span>
              {can("documents.upload") ? (
                <button className="btn sm" onClick={() => void upload({ type: "other", entityType: "driver", entityId: d.id, label: "Document" })}>
                  <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  Add document
                </button>
              ) : null}
            </div>
            <div className="thead" style={{ gridTemplateColumns: "minmax(0,1.5fr) 132px 104px minmax(0,1.3fr) 84px" }}>
              {["Item", "Status", "Expires", "Source", ""].map((h, i) => (
                <span key={i}><span>{h}</span></span>
              ))}
            </div>
            {qualificationRows.map((r) => (
              <Fragment key={r.key}>
                <div className="trow" style={{ gridTemplateColumns: "minmax(0,1.5fr) 132px 104px minmax(0,1.3fr) 84px" }} onClick={r.open}>
                  {r.cells.map((c, i2) => (
                    <BasicCell key={i2} c={c} />
                  ))}
                </div>
              </Fragment>
            ))}
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Recent loads</h2>
              <span className="fs12 mu">Newest first</span>
              <span className="sp"></span>
              <button className="lnk" onClick={() => set(goTo("loads"))}>All loads</button>
            </div>
            <div className="thead" style={{ gridTemplateColumns: "92px minmax(0,1.4fr) 140px 112px" }}>
              {["Load", "Lane", "Delivery", "Status"].map((h, i) => (
                <span key={i}><span>{h}</span></span>
              ))}
            </div>
            {loads.data && !loadRows.length ? <div className="cb fs13 mu">No loads yet</div> : null}
            {loadRows.map((r) => (
              <Fragment key={r.key}>
                <div className="trow" style={{ gridTemplateColumns: "92px minmax(0,1.4fr) 140px 112px" }} onClick={r.open}>
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
              <h2 className="h2">Right now</h2>
              <span className="sp"></span>
              <span className="fs12 mu">{toLocalInput(new Date().toISOString(), zone).slice(11)}</span>
            </div>
            <div className="cb c g10">
              {current.length ? (
                current.map((load) => (
                  <div key={load.id} className="r g10">
                    <span className="badge" data-k={loadTone(load.status)}>
                      <i></i>
                      <span>{loadLabel(load.status)}</span>
                    </span>
                    <div className="f1">
                      <div className="r g6">
                        <button className="idl" onClick={() => set({ screen: "loads", drawer: load.id, overlay: "none", modal: "none" })}><span>{load.load_number}</span></button>
                        <span className="fs13 ell"><span>{`${load.origin_city ?? ""} → ${load.destination_city ?? ""}`}</span></span>
                      </div>
                      <div className="fs12 mu"><span>{load.status === "assigned" && load.pickup_at ? `Pickup ${formatDateTime(load.pickup_at, zone)}` : load.delivery_at ? `Delivery ${formatDateTime(load.delivery_at, zone)}` : ""}</span></div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="fs13 mu">{d.status === "active" ? "Not on a load" : `${humanize(d.status)} — not offered for loads`}</div>
              )}
              <div className="hr"></div>
              <dl className="kv">
                <dt>Truck</dt>
                <dd><span className="mono"><span>{onNow?.vehicle.name ?? "—"}</span></span></dd>
                <dt>Trailer</dt>
                <dd><span className="mono"><span>{onNow?.trailer?.name ?? "—"}</span></span></dd>
                <dt>Current route</dt>
                <dd><span>{current[0] ? `${place(current[0].origin_city, current[0].origin_state)} → ${place(current[0].destination_city, current[0].destination_state)}` : "—"}</span></dd>
              </dl>
            </div>
          </section>
          <ChannelsCard driverId={d.id} name={d.full_name} email={d.email} phone={d.phone} linked={!!d.user_id} onEdit={can("drivers.manage") ? editDriver : undefined} />
          {can("drivers.sensitive.read") ? (
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Sensitive details</h2>
                <Icon className="s14 mu" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
              </div>
              <div className="cb c g10">
                <dl className="kv">
                  <dt>License number</dt>
                  <dd className="mono">{revealed && d.cdl_number ? d.cdl_number : (d.cdl_number_masked ?? "—")}</dd>
                  <dt>Pay</dt>
                  <dd>{revealed ? pay : "Hidden"}</dd>
                </dl>
                <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setRevealed(!revealed)}>
                  <Icon className="s14" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                  {revealed ? "Hide" : "Reveal"}
                </button>
              </div>
            </section>
          ) : null}
          {can("reports.read") ? (
            <section className="card oh">
              <div className="ch"><h2 className="h2">Last 30 days</h2></div>
              <div className="money" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
                {[
                  { k: "Loads delivered", v: stats ? formatNumber(Number(stats.loads ?? 0)) : report.data ? "0" : "—" },
                  { k: "On-time delivery", v: stats && Number(stats.loads) ? `${Number(stats.on_time ?? 0)}%` : "—" },
                  { k: "Miles", v: stats ? formatNumber(Number(stats.miles ?? 0)) : report.data ? "0" : "—" },
                  ...(fin ? [{ k: "Revenue", v: stats ? formatMoney(String(stats.revenue ?? "0"), org.base_currency) : report.data ? formatMoney(0, org.base_currency) : "—" }] : []),
                ].map((s) => (
                  <div key={s.k} className="c g2">
                    <span className="fs12 t3"><span>{s.k}</span></span>
                    <span className="fs20 w6 num"><span>{s.v}</span></span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** How messages and alerts reach the driver: Telegram, the driver app, and SMS when the others fail. */
function ChannelsCard({ driverId, name, email, phone, linked, onEdit }: { driverId: string; name: string; email: string | null; phone: string | null; linked: boolean; onEdit?: () => void }) {
  const { me, can, set } = useConsole();
  const [inviting, setInviting] = useState(false);
  const channels = useQuery({ queryKey: [me.organization.id, "drivers", driverId, "channels"], queryFn: () => unwrap(api.GET("/api/v1/drivers/{driver_id}/channels", { params: { path: { driver_id: driverId } } })) });
  const of = (key: string) => channels.data?.channels.find((c) => c.key === key);
  const app = of("app");
  const rows: { n: string; d: string; ic: string; k: string; act?: [label: string, go: () => void, name: string] }[] = [
    { n: "Telegram", d: "Not linked · Telegram isn’t connected for the company yet", ic: I.send, k: "mu", act: can("organization.manage") ? ["Set up", () => set(goTo("settings")), "Set up Telegram in Integrations"] : undefined },
    app?.connected
      ? { n: "Driver app", d: "Signed in · messages, alerts and load updates arrive in the app", ic: I.mobile, k: "brand", act: can("messages.read") && channels.data?.conversation_id ? ["Open chat", () => set({ ...goTo("messages"), conv: channels.data!.conversation_id }), "Open the conversation"] : undefined }
      : { n: "Driver app", d: linked ? "Their sign-in is turned off" : "Not signed up yet", ic: I.mobile, k: "mu", act: can("users.manage") && !linked ? ["Invite", () => setInviting(true), "Invite to the driver app"] : undefined },
    { n: "SMS fallback", d: phone ? `${phone} · no SMS provider connected yet` : "No phone number on file", ic: I.phone, k: "mu", act: onEdit ? ["Edit", onEdit, "Edit the phone number"] : undefined },
  ];
  return (
    <section className="card oh">
      <div className="ch"><h2 className="h2">Connected channels</h2></div>
      {rows.map((h) => (
        <div key={h.n} className="r g10" style={{ padding: "10px 16px", borderBottom: "1px solid var(--bd2)" }}>
          <span className="chn" data-k={h.k} style={{ width: "30px", height: "30px" }}><Icon className="s14" d={h.ic} /></span>
          <div className="f1"><div className="fs13 w5">{h.n}</div><div className="fs12 mu">{h.d}</div></div>
          {h.act ? <button className="btn xs ghost" onClick={h.act[1]} aria-label={h.act[2]}>{h.act[0]}</button> : null}
        </div>
      ))}
      <p className="note" style={{ padding: "10px 16px 12px" }}><Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />FlyFleet keeps the message history. Telegram and SMS only deliver it.</p>
      {inviting ? <InviteDrivers drivers={[{ id: driverId, full_name: name, email, user_id: null }]} onClose={() => setInviting(false)} /> : null}
    </section>
  );
}
