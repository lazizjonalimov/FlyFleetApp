"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useId, useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { I } from "@/features/console/icons";
import { DOCUMENT_TYPES, REVIEW } from "@/features/documents/documents-screen";
import { useUpload, viewDocument } from "@/features/documents/use-upload";
import { DRIVER_TYPES, loadLabel, loadTone, monthYear, PAY_TYPES } from "@/features/fleet/labels";
import { useOpenConversation } from "@/features/messages/use-message";
import { InviteDrivers } from "./invite-drivers";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { formatDate, formatStamp, timeZoneLabel } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, humanize, initials, plural } from "@/lib/format/text";
import { useMinuteClock } from "@/lib/time/clock";
import type { DocumentType } from "@/lib/upload";

type Driver = Schema<"DriverRead">;
type FileRow = Schema<"FileRow">;
type Load = Schema<"LoadListItem">;
type Tab = "overview" | "qualifications" | "documents" | "loads" | "location" | "activity";
const LIVE = ["assigned", "dispatched", "at_pickup", "in_transit", "at_delivery", "on_hold"];
const FILE_COLS = "minmax(0,1.5fr) 132px 104px minmax(0,1.3fr) 84px";
const LOAD_COLS = "92px minmax(0,1.4fr) 110px 112px";
// The document that renews each item, for "Upload".
const DOC_FOR: Record<string, DocumentType> = { cdl: "license", medical: "medical", mvr: "mvr", clearinghouse: "clearinghouse", road_test: "road_test", drug_test: "drug_test" };
const RECORD_TYPES = ["mvr", "clearinghouse", "road_test", "drug_test", "employment_application", "annual_review", "hazmat", "twic", "training", "other"] as const;
const SEVERITY: Record<string, number> = { bad: 3, warn: 2, info: 1, ok: 0 };

/** How one item of the file stands: its tone and the words for it, in the table and in short. */
function standing(r: FileRow): { k: string; label: string; short: string } {
  const until = r.expires_on ? formatDate(r.expires_on).replace(/, \d{4}$/, "") : "";
  if (r.state === "missing") return { k: r.blocks ? "bad" : "warn", label: "Missing", short: "Missing" };
  if (r.state === "expired") return { k: r.blocks ? "bad" : "warn", label: `Expired ${until}`, short: `Expired ${until}` };
  if (r.in_review) return { k: "info", label: "In review", short: "In review" };
  if (r.state === "expiring") return { k: "warn", label: `Expires in ${plural(r.days_left ?? 0, "day")}`, short: plural(r.days_left ?? 0, "day") };
  return { k: "ok", label: r.expires_on ? "Valid" : "On file", short: "Valid" };
}

/** "ETA 12:10 · on time", "ETA 12:10 · +25m", "Pickup Nov 13 · 14:00". */
function nowLine(load: Load, zone: string): string {
  const clock = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  if (load.status === "assigned" || load.status === "dispatched") return load.pickup_at ? `Pickup ${formatStamp(load.pickup_at, zone)}` : "Pickup not set";
  if (load.eta) return `ETA ${clock(load.eta)} · ${load.late_by_minutes > 0 ? `+${load.late_by_minutes >= 60 ? `${Math.floor(load.late_by_minutes / 60)}h ${load.late_by_minutes % 60}m` : `${load.late_by_minutes}m`}` : "on time"}`;
  return load.delivery_at ? `Delivery ${formatStamp(load.delivery_at, zone)}` : "";
}

const ago = (iso: string, now: number | null) => {
  if (now === null) return "";
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  return minutes < 60 ? `${minutes} min ago` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} days ago`;
};

/** Driver profile with the qualification file. */
export function DriverScreen() {
  const { me, can, state, set, notify } = useConsole();
  const message = useOpenConversation();
  const upload = useUpload();
  const queryClient = useQueryClient();
  const org = me.organization;
  const zone = org.timezone;
  const now = useMinuteClock();
  const id = typeof state.driverId === "string" ? state.driverId : "";
  const tab: Tab = (["overview", "qualifications", "documents", "loads", "location", "activity"] as const).find((t) => t === state.dtab) ?? "overview";
  const driver = useQuery({ queryKey: [org.id, "drivers", "detail", id], queryFn: () => unwrap(api.GET("/api/v1/drivers/{item_id}", { params: { path: { item_id: id } } })), enabled: !!id });
  const file = useQuery({ queryKey: [org.id, "drivers", "file", id], queryFn: () => unwrap(api.GET("/api/v1/drivers/{driver_id}/file", { params: { path: { driver_id: id } } })), enabled: !!id });
  const overview = useQuery({ queryKey: [org.id, "drivers", "overview", id], queryFn: () => unwrap(api.GET("/api/v1/drivers/{driver_id}/overview", { params: { path: { driver_id: id } } })), enabled: !!id, refetchInterval: 60_000 });
  const documents = useQuery({ queryKey: [org.id, "documents", "driver", id], queryFn: () => unwrap(api.GET("/api/v1/documents", { params: { query: { entity_type: "driver", entity_id: id, limit: 100, count: true } } })), enabled: !!id && can("documents.read") });
  const loads = useQuery({ queryKey: [org.id, "loads", "driver", id], queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { driver_id: id, sort: "-pickup_at", limit: 25 } } })), enabled: !!id && can("loads.read") });
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

  const rows = file.data?.rows ?? [];
  // The item that most needs doing: the most severe, and of those the one that runs out first.
  const urgency = (r: FileRow) => SEVERITY[standing(r).k]! * 100_000 - (r.days_left ?? -1);
  const worst = rows.filter((r) => standing(r).k !== "ok").reduce<FileRow | null>((w, r) => (!w || urgency(r) > urgency(w) ? r : w), null);
  const worstK = worst ? standing(worst).k : "ok";
  const status = d.status !== "active" ? { st: humanize(d.status), k: "mu" } : d.current_load ? { st: "On load", k: loadTone(d.current_load.status) } : { st: "Available", k: "ok" };
  const docs = documents.data?.items ?? [];
  const first = d.first_name;
  const canRequest = can("safety.manage") || can("drivers.manage");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [org.id, "drivers"] });
    void queryClient.invalidateQueries({ queryKey: [org.id, "documents", "driver", id] });
  };
  const requestDocument = async (row: FileRow) => {
    try {
      const out = await unwrap(api.POST("/api/v1/drivers/{driver_id}/document-requests", { params: { path: { driver_id: d.id } }, body: { item: row.item } }));
      notify(out.sent ? `${first} was asked for the ${row.label.toLowerCase()} in the app` : `${d.full_name} isn’t on the driver app, so the request wasn’t sent — it’s waiting in their conversation`, !out.sent);
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  const uploadFor = async (row: FileRow) => {
    await upload({ type: DOC_FOR[row.item] ?? "other", entityType: "driver", entityId: d.id, label: row.label });
    refresh();
  };
  const editDriver = () => set({ modal: "add", kind: "driver", mstep: "manual", overlay: "none", dd: null, ddq: "", fv: { editId: d.id }, ferr: {} });
  const tabs: [Tab, string, number | null][] = [["overview", "Overview", null], ["qualifications", "Qualifications", rows.length || null], ["documents", "Documents", documents.data ? (documents.data.page.total_count ?? docs.length) : null], ["loads", "Loads", null], ["location", "Location & privacy", null], ["activity", "Activity", null]];
  const fileTable = (
    <FileTable rows={rows} pending={file.isPending} onView={(r) => (r.in_review && r.review_document_id ? set({ screen: "docreview", docId: r.review_document_id, overlay: "none", modal: "none" }) : r.document_id ? viewDocument(r.document_id) : undefined)}
      onRequest={canRequest ? (r) => void requestDocument(r) : undefined} onUpload={can("documents.upload") ? (r) => void uploadFor(r) : undefined} />
  );

  return (
    <div className="scr">
      <div className="ph" style={{ alignItems: "center", paddingBottom: "16px" }}>
        <span className="av lg" data-k={d.status !== "active" ? "mu" : worstK === "bad" ? "bad" : d.current_load ? "brand" : "ok"}>
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
            {file.data ? (
              <span className="badge sq" data-k={worstK}>
                <Icon className="s12 b" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
                <span>{worst ? `${worst.short} · ${standing(worst).short}` : "Qualified to dispatch"}</span>
              </span>
            ) : null}
          </div>
          <p className="sub"><span>{[d.employee_number ? `Employee ${d.employee_number}` : "", d.driver_type !== "company" ? (DRIVER_TYPES[d.driver_type] ?? humanize(d.driver_type)) : "", d.hire_date ? `hired ${monthYear(d.hire_date)}` : "", d.phone, d.email].filter(Boolean).join(" · ")}</span></p>
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
      <div className="tabs" role="tablist">
        {tabs.map(([key, label, n]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={clsx("tab", tab === key && "on")} onClick={() => set({ dtab: key })}>
            {label}
            {n !== null ? <span className="tcnt">{formatNumber(n)}</span> : null}
          </button>
        ))}
      </div>
      {tab === "overview" ? (
        <div className="lpg">
          <div className="c g16">
            {worst && (worstK === "bad" || worstK === "warn") ? (
              <div className="banner" data-k={worstK}>
                <Icon d={I.alert} />
                <div className="f1">
                  <div className="bt"><span>{worst.state === "expiring" ? `${worst.label} expires in ${plural(worst.days_left ?? 0, "day")}` : `${worst.label} — ${standing(worst).label.replace(/^\w/, (c) => c.toLowerCase())}`}</span></div>
                  <div><span>{worst.state === "expiring" ? `When it lapses FlyFleet stops new assignments for ${first} until a reviewed replacement is on file. Reminders alone don’t change eligibility.` : worst.blocks ? `FlyFleet won’t assign new loads to ${first} until a reviewed replacement is on file. Reminders alone don’t change eligibility.` : `Your rules let ${first} keep driving without it, but the file is incomplete.`}</span></div>
                </div>
                {canRequest ? <button className="btn sm" onClick={() => void requestDocument(worst)}><span>Request document</span></button> : null}
              </div>
            ) : null}
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Qualification file</h2>
                <span className="fs12 mu">Reviewed documents decide eligibility — reminders don’t</span>
                <span className="sp"></span>
                {can("documents.upload") ? (
                  <button className="btn sm" onClick={() => void upload({ type: "other", entityType: "driver", entityId: d.id, label: "Document" }).then(refresh)}>
                    <Icon className="s14" d={I.upload} />
                    Add document
                  </button>
                ) : null}
              </div>
              {file.isError ? <ErrorState error={file.error} retry={() => void file.refetch()} /> : fileTable}
            </section>
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Recent loads</h2>
                <span className="fs12 mu">Last 30 days</span>
                <span className="sp"></span>
                <button className="lnk" onClick={() => set({ dtab: "loads" })}>All loads</button>
              </div>
              <LoadTable loads={(loads.data?.items ?? []).filter((l) => !l.delivery_at || now === null || Date.parse(l.delivery_at) >= now - 30 * 86_400_000 || LIVE.includes(l.status)).slice(0, 6)} pending={loads.isPending} allowed={can("loads.read")} />
            </section>
          </div>
          <div className="c g16">
            <RightNow driver={d} loads={loads.data?.items ?? []} position={overview.data?.position ?? null} now={now} />
            <ChannelsCard driverId={d.id} name={d.full_name} email={d.email} phone={d.phone} linked={!!d.user_id} onEdit={can("drivers.manage") ? editDriver : undefined} />
            {can("drivers.sensitive.read") ? <Sensitive driver={d} /> : null}
            <section className="card oh">
              <div className="ch"><h2 className="h2">Last 30 days</h2></div>
              <div className="money" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
                {[
                  { k: "Loads", v: overview.data ? formatNumber(overview.data.loads) : "—" },
                  { k: "On-time delivery", v: overview.data?.on_time_pct !== null && overview.data?.on_time_pct !== undefined ? `${overview.data.on_time_pct}%` : "—" },
                  { k: "Miles", v: overview.data ? formatNumber(overview.data.miles) : "—" },
                  { k: "Speeding incidents", v: overview.data ? formatNumber(overview.data.speeding) : "—" },
                ].map((s) => (
                  <div key={s.k} className="c g2">
                    <span className="fs12 t3"><span>{s.k}</span></span>
                    <span className="fs20 w6 num"><span>{s.v}</span></span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : null}
      {tab === "qualifications" ? (
        <div className="c g16" style={{ padding: "16px 24px 24px" }}>
          <QualificationsTab driver={d} rows={rows} table={fileTable} onChanged={refresh} />
        </div>
      ) : null}
      {tab === "documents" ? (
        <div className="c g16" style={{ padding: "16px 24px 24px" }}>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Documents</h2>
              <span className="fs12 mu">Everything filed with {first}</span>
              <span className="sp"></span>
              {can("documents.upload") ? (
                <button className="btn sm" onClick={() => void upload({ type: "other", entityType: "driver", entityId: d.id, label: "Document" }).then(refresh)}>
                  <Icon className="s14" d={I.upload} />
                  Upload
                </button>
              ) : null}
            </div>
            {!can("documents.read") ? <div className="cb fs13 mu">Your role doesn’t include documents.</div> : null}
            <div className="thead" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr) 120px 160px 110px" }}>
              {["Document", "File", "Expires", "Added", "Status"].map((h) => <span key={h}><span>{h}</span></span>)}
            </div>
            {documents.isPending && can("documents.read") ? <Skeleton rows={3} /> : null}
            {documents.data && !docs.length ? <div className="cb fs13 mu">No documents yet.</div> : null}
            {docs.map((doc) => {
              const [label, tone] = REVIEW[doc.review_status] ?? ["Filed", "mu"];
              return (
                <div key={doc.id} className="trow" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr) 120px 160px 110px" }}
                  onClick={() => (doc.review_status === "pending" ? set({ screen: "docreview", docId: doc.id, overlay: "none", modal: "none" }) : viewDocument(doc.id))}>
                  <span className="w5 ell">{DOCUMENT_TYPES[doc.type] ?? humanize(doc.type)}</span>
                  <span className="ell t2">{doc.filename}</span>
                  <span className="num t2">{doc.expires_on ? formatDate(doc.expires_on) : "—"}</span>
                  <span className="t3 fs12">{`${formatStamp(doc.created_at, zone)}${doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ""}`}</span>
                  <span className="badge" data-k={tone}><i></i><span>{label}</span></span>
                </div>
              );
            })}
          </section>
        </div>
      ) : null}
      {tab === "loads" ? (
        <div className="c g16" style={{ padding: "16px 24px 24px" }}>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Loads</h2>
              <span className="fs12 mu">Newest first</span>
              <span className="sp"></span>
              <button className="lnk" onClick={() => set(goTo("loads"))}>All loads</button>
            </div>
            <LoadTable loads={loads.data?.items ?? []} pending={loads.isPending} allowed={can("loads.read")} />
          </section>
        </div>
      ) : null}
      {tab === "location" ? (
        <div className="c g16" style={{ padding: "16px 24px 24px", maxWidth: "860px" }}>
          <LocationTab driver={d} position={overview.data?.position ?? null} now={now} />
        </div>
      ) : null}
      {tab === "activity" ? (
        <div className="c g16" style={{ padding: "16px 24px 24px", maxWidth: "860px" }}>
          <ActivityTab driverId={d.id} />
        </div>
      ) : null}
    </div>
  );
}

/** The file, item by item: how each stands, when it runs out, where the date came from, and what can be done. */
function FileTable({ rows, pending, onView, onRequest, onUpload }: { rows: FileRow[]; pending: boolean; onView: (r: FileRow) => void; onRequest?: (r: FileRow) => void; onUpload?: (r: FileRow) => void }) {
  return (
    <>
      <div className="thead" style={{ gridTemplateColumns: FILE_COLS }}>
        {["Item", "Status", "Expires", "Source", ""].map((h, i) => <span key={i}><span>{h}</span></span>)}
      </div>
      {pending ? <Skeleton rows={4} /> : null}
      {rows.map((r) => {
        const s = standing(r);
        const act = r.state !== "valid" && !r.in_review && onRequest ? (["Request", () => onRequest(r), "pri"] as const)
          : r.in_review && r.review_document_id ? (["Review", () => onView(r), ""] as const)
          : r.document_id ? (["View", () => onView(r), ""] as const)
          : onUpload && r.item in DOC_FOR ? (["Upload", () => onUpload(r), ""] as const) : null;
        return (
          <div key={r.item} className="trow" style={{ gridTemplateColumns: FILE_COLS }} onClick={() => (r.document_id || r.review_document_id ? onView(r) : undefined)}>
            <div className="mw0">
              <div className="w5 ell">{r.label}</div>
              {r.sub ? <div className="fs12 mu ell">{r.sub}</div> : null}
            </div>
            <span className="badge" data-k={s.k} style={{ justifySelf: "start" }}><i></i><span>{s.label}</span></span>
            <span className="num t2">{!r.expires_on ? "—" : r.state === "valid" ? monthYear(r.expires_on) : formatDate(r.expires_on)}</span>
            <span className="t3 ell">{r.source}</span>
            {act ? <button className={clsx("btn xs", act[2])} style={{ justifySelf: "start" }} onClick={(e) => { e.stopPropagation(); act[1](); }}>{act[0]}</button> : <span></span>}
          </div>
        );
      })}
    </>
  );
}

/** The driver's loads: lane, delivery and status, each opening the load. */
function LoadTable({ loads, pending, allowed }: { loads: Load[]; pending: boolean; allowed: boolean }) {
  const { me, set } = useConsole();
  const zone = me.organization.timezone;
  const open = (load: Load) => set({ screen: "loads", drawer: load.id, overlay: "none", modal: "none" });
  return (
    <>
      <div className="thead" style={{ gridTemplateColumns: LOAD_COLS }}>
        {["Load", "Lane", "Delivery", "Status"].map((h) => <span key={h}><span>{h}</span></span>)}
      </div>
      {!allowed ? <div className="cb fs13 mu">Your role doesn’t include loads.</div> : null}
      {allowed && pending ? <Skeleton rows={3} /> : null}
      {allowed && !pending && !loads.length ? <div className="cb fs13 mu">No loads yet</div> : null}
      {loads.map((load) => (
        <div key={load.id} className="trow" style={{ gridTemplateColumns: LOAD_COLS }} onClick={() => open(load)}>
          <button className="idl" onClick={(e) => { e.stopPropagation(); open(load); }}>{load.load_number}</button>
          <div className="mw0">
            <div className="ell">{`${load.origin_city ?? "—"} → ${load.destination_city ?? "—"}`}</div>
            <div className="fs12 mu ell">{load.customer.name}</div>
          </div>
          <span className="num t3">{load.delivery_at ? formatStamp(load.delivery_at, zone) : "—"}</span>
          <span className="badge" data-k={loadTone(load.status)} style={{ justifySelf: "start" }}><i></i><span>{loadLabel(load.status)}</span></span>
        </div>
      ))}
    </>
  );
}

/** What the driver is on now, the truck and trailer, and where the truck was last seen. */
function RightNow({ driver, loads, position, now }: { driver: Driver; loads: Load[]; position: Schema<"Position"> | null; now: number | null }) {
  const { me, set } = useConsole();
  const zone = me.organization.timezone;
  const current = loads.filter((load) => LIVE.includes(load.status)).slice(0, 2);
  const onNow = current[0]?.assignment;
  const clock = now === null ? "" : `${new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(now))} ${timeZoneLabel(zone, new Date(now))}`;
  return (
    <section className="card oh">
      <div className="ch">
        <h2 className="h2">Right now</h2>
        <span className="sp"></span>
        <span className="fs12 mu">{clock}</span>
      </div>
      <div className="cb c g10">
        {current.length ? (
          current.map((load) => (
            <div key={load.id} className="r g10">
              <span className="badge" data-k={loadTone(load.status)}><i></i><span>{loadLabel(load.status)}</span></span>
              <div className="f1">
                <div className="r g6">
                  <button className="idl" onClick={() => set({ screen: "loads", drawer: load.id, overlay: "none", modal: "none" })}><span>{load.load_number}</span></button>
                  <span className="fs13 ell"><span>{`${load.origin_city ?? ""} → ${load.destination_city ?? ""}`}</span></span>
                </div>
                <div className="fs12 mu"><span>{nowLine(load, zone)}</span></div>
              </div>
            </div>
          ))
        ) : (
          <div className="r g10">
            <span className="badge" data-k={driver.status === "active" ? "ok" : "mu"}><i></i><span>{driver.status === "active" ? "Available" : humanize(driver.status)}</span></span>
            <div className="f1">
              <div className="fs13">No load right now</div>
              <div className="fs12 mu">{driver.status === "active" ? "Available for dispatch" : "Not offered for loads"}</div>
            </div>
          </div>
        )}
        <div className="hr"></div>
        <dl className="kv">
          <dt>Truck</dt>
          <dd><span className="mono">{onNow?.vehicle.name ?? driver.unit?.unit_number ?? "—"}</span></dd>
          <dt>Trailer</dt>
          <dd><span className="mono">{onNow?.trailer?.name ?? "—"}</span></dd>
          <dt>Last position</dt>
          <dd><span>{position ? `${position.place} · ${ago(position.recorded_at, now)}` : "No position yet"}</span></dd>
        </dl>
      </div>
    </section>
  );
}

/** The full licence number, date of birth and pay, shown on request. Each reveal is in the audit log. */
function Sensitive({ driver }: { driver: Driver }) {
  const { me, notify } = useConsole();
  const [shown, setShown] = useState<Schema<"Revealed"> | null>(null);
  const [pending, setPending] = useState(false);
  const reveal = async () => {
    if (shown) return setShown(null);
    setPending(true);
    try {
      setShown(await unwrap(api.POST("/api/v1/drivers/{driver_id}/reveal", { params: { path: { driver_id: driver.id } } })));
    } catch (e) {
      notify(errorMessage(e), true);
    }
    setPending(false);
  };
  const pay = shown?.pay_type ? `${PAY_TYPES[shown.pay_type] ?? humanize(shown.pay_type)}${Number(shown.pay_rate) ? ` · ${shown.pay_type === "percent" ? `${Number(shown.pay_rate)}%` : formatMoney(shown.pay_rate ?? "0", me.organization.base_currency)}` : ""}` : "—";
  return (
    <section className="card oh">
      <div className="ch">
        <h2 className="h2">Sensitive details</h2>
        <Icon className="s14 mu" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
      </div>
      <div className="cb c g10">
        <dl className="kv">
          <dt>License number</dt>
          <dd className="mono">{shown ? (shown.cdl_number ?? "—") : driver.cdl_number_masked ? driver.cdl_number_masked.replace(/^[*•]+\s*/, "•••• ") : "—"}</dd>
          <dt>Date of birth</dt>
          <dd className={shown ? "" : "mu"}>{shown ? (shown.date_of_birth ? formatDate(shown.date_of_birth) : "Not on file") : driver.has_date_of_birth ? "Hidden" : "Not on file"}</dd>
          <dt>Pay</dt>
          <dd className={shown ? "" : "mu"}>{shown ? pay : "Hidden"}</dd>
        </dl>
        <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => void reveal()} disabled={pending}>
          <Icon className="s14" d={I.eye} />
          {shown ? "Hide" : "Reveal · logged to audit"}
        </button>
      </div>
    </section>
  );
}

/** Every item of the file with what can be done about it, and the records kept by hand. */
function QualificationsTab({ driver, rows, table, onChanged }: { driver: Driver; rows: FileRow[]; table: React.ReactNode; onChanged: () => void }) {
  const { can, notify } = useConsole();
  const [editing, setEditing] = useState<FileRow | "new" | null>(null);
  const records = rows.filter((r) => r.record_id);
  const remove = async (r: FileRow) => {
    try {
      await unwrap(api.DELETE("/api/v1/drivers/{parent_id}/qualifications/{item_id}", { params: { path: { parent_id: driver.id, item_id: r.record_id! } } }));
      notify(`${r.label} removed`);
      onChanged();
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  return (
    <>
      <section className="card oh">
        <div className="ch">
          <h2 className="h2">Qualification file</h2>
          <span className="fs12 mu">The CDL, the medical card and your company’s file. Reviewed documents decide eligibility.</span>
        </div>
        {table}
      </section>
      <section className="card oh">
        <div className="ch">
          <h2 className="h2">Records kept by hand</h2>
          <span className="fs12 mu">Dates entered without a document</span>
          <span className="sp"></span>
          {can("drivers.manage") ? (
            <button className="btn sm" onClick={() => setEditing("new")}>
              <Icon className="s14" d={I.plus} />
              Add record
            </button>
          ) : null}
        </div>
        {!records.length ? <div className="cb fs13 mu">No records yet.</div> : null}
        {records.map((r) => (
          <div key={r.record_id} className="r g10" style={{ padding: "10px 16px", borderTop: "1px solid var(--bd2)" }}>
            <div className="f1 mw0">
              <div className="fs13 w5">{r.label}</div>
              <div className="fs12 mu">{[r.expires_on ? `Runs to ${formatDate(r.expires_on)}` : "No expiry", r.blocks ? "Required before dispatch" : ""].filter(Boolean).join(" · ")}</div>
            </div>
            {can("drivers.manage") ? (
              <>
                <button className="btn xs" onClick={() => setEditing(r)}>Change</button>
                <button className="btn xs ghost" onClick={() => void remove(r)} aria-label={`Remove ${r.label}`}><Icon className="s12" d={I.x} /></button>
              </>
            ) : null}
          </div>
        ))}
      </section>
      {editing ? <RecordDialog driverId={driver.id} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={onChanged} /> : null}
    </>
  );
}

/** Adds a qualification record, or changes the date of one. */
function RecordDialog({ driverId, row, onClose, onSaved }: { driverId: string; row: FileRow | null; onClose: () => void; onSaved: () => void }) {
  const { notify } = useConsole();
  const id = useId();
  const [type, setType] = useState<(typeof RECORD_TYPES)[number]>((row?.item as (typeof RECORD_TYPES)[number]) ?? "mvr");
  const [issued, setIssued] = useState("");
  const [expires, setExpires] = useState(row?.expires_on ?? "");
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const LABEL: Record<string, string> = { mvr: "MVR — annual review", clearinghouse: "Drug & alcohol clearinghouse query", road_test: "Road test certificate", drug_test: "Pre-employment drug test", employment_application: "Employment application", annual_review: "Annual review", hazmat: "Hazmat endorsement", twic: "TWIC card", training: "Training", other: "Other" };
  async function save() {
    setPending(true);
    setError(null);
    try {
      if (row?.record_id) {
        await unwrap(api.PATCH("/api/v1/drivers/{parent_id}/qualifications/{item_id}", { params: { path: { parent_id: driverId, item_id: row.record_id } }, body: { expires_on: expires || null, ...(reference ? { reference } : {}) } }));
      } else {
        await unwrap(api.POST("/api/v1/drivers/{parent_id}/qualifications", { params: { path: { parent_id: driverId } }, body: { type, issued_on: issued || null, expires_on: expires || null, reference: reference || null, required: false } }));
      }
      notify(row ? `${row.label} changed` : `${LABEL[type]} added`);
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }
  return (
    <Dialog title={row ? `Change ${row.label.toLowerCase()}` : "Add record"} sub="A date entered by hand. A scanned document, once approved, does this for you." icon={I.file} onClose={() => !pending && onClose()}
      footer={
        <>
          <span className="sp"></span>
          <button className="btn" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn pri" onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : row ? "Save" : "Add record"}</button>
        </>
      }>
      <Problem message={error} />
      {!row ? (
        <div className="fld">
          <label htmlFor={`${id}-type`}>Item</label>
          <select id={`${id}-type`} className="inp" value={type} onChange={(e) => setType(e.target.value as (typeof RECORD_TYPES)[number])}>
            {RECORD_TYPES.map((t) => <option key={t} value={t}>{LABEL[t]}</option>)}
          </select>
        </div>
      ) : null}
      <div className="r g12">
        {!row ? (
          <div className="fld f1">
            <label htmlFor={`${id}-issued`}>Issued</label>
            <input id={`${id}-issued`} className="inp" type="date" value={issued} onChange={(e) => setIssued(e.target.value)} />
          </div>
        ) : null}
        <div className="fld f1">
          <label htmlFor={`${id}-exp`}>Runs to</label>
          <input id={`${id}-exp`} className="inp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
      </div>
      <div className="fld">
        <label htmlFor={`${id}-ref`}>Reference</label>
        <input id={`${id}-ref`} className="inp" value={reference} maxLength={80} placeholder="Report or certificate number" onChange={(e) => setReference(e.target.value)} />
      </div>
    </Dialog>
  );
}

/** Where the driver's truck is seen from, who sees it, and when the driver app shares the phone's location. */
function LocationTab({ driver, position, now }: { driver: Driver; position: Schema<"Position"> | null; now: number | null }) {
  const { me } = useConsole();
  const channels = useQuery({ queryKey: [me.organization.id, "drivers", driver.id, "channels"], queryFn: () => unwrap(api.GET("/api/v1/drivers/{driver_id}/channels", { params: { path: { driver_id: driver.id } } })) });
  const onApp = !!channels.data?.channels.find((c) => c.key === "app")?.connected;
  return (
    <>
      <section className="card oh">
        <div className="ch"><h2 className="h2">Last position</h2></div>
        <div className="cb">
          <dl className="kv">
            <dt>Where</dt>
            <dd>{position ? position.place : "No position yet"}</dd>
            <dt>When</dt>
            <dd className="num">{position ? `${formatStamp(position.recorded_at, me.organization.timezone)} · ${ago(position.recorded_at, now)}` : "—"}</dd>
            <dt>From</dt>
            <dd>{position ? `${position.source === "driver_app" ? "The driver app" : "The truck’s telematics"} · truck ${position.unit_number}` : "—"}</dd>
          </dl>
        </div>
      </section>
      <section className="card oh">
        <div className="ch"><h2 className="h2">How location is shared</h2></div>
        <div className="cb c g10 fs13">
          <div className="r g10"><Icon className="s14 mu" d={I.truck} /><span className="f1">Positions come from the truck’s telematics when the company has connected a provider, otherwise from the driver app.</span></div>
          <div className="r g10"><Icon className="s14 mu" d={I.mobile} /><span className="f1">{onApp ? `The driver app shares ${driver.first_name}’s location only while a load is dispatched to them, and stops when it is delivered.` : `${driver.first_name} isn’t on the driver app, so no phone location is shared.`}</span></div>
          <div className="r g10"><Icon className="s14 mu" d={I.lock} /><span className="f1">Only people who can see the truck see where it is; a dispatch team sees its own trucks.</span></div>
        </div>
      </section>
    </>
  );
}

/** What happened to the driver's record, from the audit log. */
function ActivityTab({ driverId }: { driverId: string }) {
  const { me, can } = useConsole();
  const entries = useQuery({ queryKey: [me.organization.id, "audit", "driver", driverId], queryFn: async () => (await unwrap(api.GET("/api/v1/audit-logs", { params: { query: { entity_type: "driver", entity_id: driverId, limit: 50 } } }))) as { items: Schema<"AuditOut">[] }, enabled: can("audit.read") });
  return (
    <section className="card oh">
      <div className="ch">
        <h2 className="h2">Activity</h2>
        <span className="fs12 mu">From the audit log, newest first</span>
      </div>
      {!can("audit.read") ? <div className="cb fs13 mu">Your role doesn’t include the audit log.</div> : null}
      {entries.isPending && can("audit.read") ? <Skeleton rows={4} /> : null}
      {entries.data && !entries.data.items.length ? <div className="cb fs13 mu">Nothing recorded yet.</div> : null}
      {(entries.data?.items ?? []).map((e) => (
        <div key={e.id} className="r g10" style={{ padding: "9px 16px", borderTop: "1px solid var(--bd2)" }}>
          <span className="f1 fs13">{humanize(e.action.split(".").slice(1).join(" ") || e.action)}</span>
          <span className="fs12 mu nw">{`${e.actor_name ?? "FlyFleet"} · ${formatStamp(e.created_at, me.organization.timezone)}`}</span>
        </div>
      ))}
    </section>
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
      <p className="note" style={{ padding: "10px 16px 12px" }}><Icon className="s14" d={I.info} />FlyFleet keeps the message history. Telegram and SMS only deliver it.</p>
      {inviting ? <InviteDrivers drivers={[{ id: driverId, full_name: name, email, user_id: null }]} onClose={() => setInviting(false)} /> : null}
    </section>
  );
}
