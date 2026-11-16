"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useSoon } from "@/features/console/use-action";
import { DOCUMENT_TYPES } from "@/features/documents/documents-screen";
import { monthYear } from "@/features/fleet/labels";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDateTime, todayIn } from "@/lib/format/dates";
import { formatNumber, initials, plural } from "@/lib/format/text";

type Compliance = Schema<"Compliance">;
const OK = "M5 12l5 5 9-10";
const CLOCK = "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2";
const BAD = "M18 6L6 18M6 6l12 12";
const DAY = 86_400_000;

/** One cell of the matrix: valid, expiring within 30 days, expired, or not on file. */
function dated(expires: string | null | undefined, today: string, missing = "Missing") {
  if (!expires) return { k: "bad", t: missing, ic: BAD };
  const days = Math.round((Date.parse(`${expires}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY);
  if (days < 0) return { k: "bad", t: "Expired", ic: BAD };
  if (days <= 30) return { k: "warn", t: plural(days, "day"), ic: CLOCK };
  return { k: "ok", t: monthYear(expires), ic: OK };
}
const verdict = (compliance: Compliance) => {
  const blocking = compliance.issues.some((issue) => issue.severity === "blocking");
  const warning = compliance.issues.some((issue) => issue.severity === "warning");
  return blocking ? { k: "bad", l: "Blocked" } : warning ? { k: "warn", l: "Expiring" } : { k: "ok", l: "Yes" };
};

/** Compliance: who and what may be dispatched, what is about to expire, and documents waiting for a review. */
export function SafetyScreen() {
  const { me, can, state, set } = useConsole();
  const soon = useSoon();
  const org = me.organization;
  const today = todayIn(org.timezone);
  const tab = state.sftab === "trucks" || state.sftab === "trailers" ? state.sftab : "drivers";
  const summary = useQuery({ queryKey: [org.id, "safety", "summary"], queryFn: () => unwrap(api.GET("/api/v1/safety/summary")), refetchInterval: 60_000 });
  const drivers = useQuery({ queryKey: [org.id, "drivers", "safety"], queryFn: () => unwrap(api.GET("/api/v1/drivers", { params: { query: { status: "active", sort: "name", limit: 100, count: true } } })), enabled: can("drivers.read") });
  const trucks = useQuery({ queryKey: [org.id, "vehicles", "safety"], queryFn: () => unwrap(api.GET("/api/v1/vehicles", { params: { query: { sort: "unit_number", limit: 100, count: true } } })), enabled: can("equipment.read") });
  const trailers = useQuery({ queryKey: [org.id, "trailers", "safety"], queryFn: () => unwrap(api.GET("/api/v1/trailers", { params: { query: { sort: "unit_number", limit: 100, count: true } } })), enabled: can("equipment.read") });
  const queue = useQuery({ queryKey: [org.id, "documents", "review-queue"], queryFn: () => unwrap(api.GET("/api/v1/documents", { params: { query: { review_status: "pending", sort: "created_at", limit: 6, count: true } } })), enabled: can("documents.read"), refetchInterval: 60_000 });
  const s = summary.data;
  const activeDrivers = drivers.data?.items ?? [];
  const qualified = activeDrivers.filter((driver) => driver.compliance.status === "ok").length;
  const waiting = queue.data?.page.total_count ?? queue.data?.items.length ?? 0;
  const kpis = [
    { label: "Expired", value: s ? formatNumber(s.expired) : "—", suffix: "", sub: s ? `${plural(s.drivers_blocked, "driver")} · ${plural(s.units_blocked, "unit")} blocked` : "", k: "bad", sk: s?.expired ? "bad" : "mu" },
    { label: "Expiring ≤ 30 days", value: s ? formatNumber(s.expiring) : "—", suffix: "", sub: "Renew before they block dispatch", k: "warn", sk: s?.expiring ? "warn" : "mu" },
    { label: "Missing", value: s ? formatNumber(s.missing) : "—", suffix: "", sub: "Required, not on file", k: "bad", sk: s?.missing ? "bad" : "mu" },
    { label: "Waiting for review", value: queue.data ? formatNumber(waiting) : "—", suffix: "", sub: queue.data?.items[0] ? `oldest ${formatDateTime(queue.data.items[0].created_at, org.timezone)}` : "Nothing to review", k: "info", sk: "mu" },
    { label: "Fully qualified", value: drivers.data ? formatNumber(qualified) : "—", suffix: drivers.data ? ` / ${formatNumber(activeDrivers.length)}` : "", sub: "active drivers", k: "ok", sk: "mu" },
  ];

  type Row = { id: string; n: string; ini: string; cells: { k: string; t: string; ic: string; title?: string }[]; ok: string; ol: string; open: () => void };
  const head = tab === "drivers" ? ["Driver", "CDL", "Medical card", "Qualifications", "Dispatchable"] : [tab === "trucks" ? "Truck" : "Trailer", "Registration", "Insurance", "Annual inspection", "Dispatchable"];
  const cols = "minmax(0,1.3fr) repeat(3,minmax(0,1fr)) 112px";
  const rows: Row[] =
    tab === "drivers"
      ? activeDrivers.map((driver) => {
          const other = driver.compliance.issues.find((issue) => !issue.code.startsWith("CDL") && !issue.code.startsWith("MEDICAL"));
          const v = verdict(driver.compliance);
          return {
            id: driver.id,
            n: driver.full_name,
            ini: initials(driver.full_name),
            cells: [dated(driver.cdl_expiry, today), dated(driver.medical_cert_expiry, today), other ? { ...(other.expires_on ? dated(other.expires_on, today) : { k: other.severity === "blocking" ? "bad" : "info", t: other.severity === "blocking" ? "Missing" : "Check", ic: other.severity === "blocking" ? BAD : CLOCK }), title: other.message } : { k: "ok", t: "On file", ic: OK }],
            ok: v.k,
            ol: v.l,
            open: () => set({ screen: "driver", driverId: driver.id, overlay: "none", modal: "none" }),
          };
        })
      : (tab === "trucks" ? (trucks.data?.items ?? []) : (trailers.data?.items ?? [])).map((unit) => {
          const v = unit.status === "active" ? verdict(unit.compliance) : { k: "mu", l: unit.status === "retired" ? "Retired" : "Off the road" };
          return {
            id: unit.id,
            n: unit.unit_number,
            ini: unit.unit_number.slice(0, 3),
            cells: [dated(unit.registration_expiry, today), dated(unit.insurance_expiry, today), dated(unit.inspection_expiry, today)],
            ok: v.k,
            ol: v.l,
            open: () => set({ screen: "truck", unitId: unit.id, unitKind: tab === "trucks" ? "truck" : "trailer", overlay: "none", modal: "none" }),
          };
        });
  const source = tab === "drivers" ? drivers : tab === "trucks" ? trucks : trailers;
  const count = (query: typeof drivers | typeof trucks | typeof trailers) => (query.data ? formatNumber(query.data.page.total_count ?? query.data.items.length) : "");

  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px" }}>
        <div className="f1">
          <div className="crumb">
            <span>{"Safety & fleet"}</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>Compliance</b>
          </div>
          <h1 className="h1">Compliance</h1>
          <p className="sub">Qualification files, expirations and document reviews</p>
        </div>
        <div className="r g8">
          <button className="btn" onClick={soon("Reminder rules")}>
            <Icon className="s14" d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
            Reminder rules
          </button>
          <button className="btn" onClick={soon("Exporting compliance")}>
            <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            Export
          </button>
        </div>
      </div>
      <div className="kpis" style={{ margin: "0 24px", gridTemplateColumns: "repeat(5,minmax(0,1fr))" }}>
        {kpis.map((k) => (
          <button key={k.label} className="kpi" onClick={() => k.label === "Waiting for review" && set(goTo("documents"))}>
            <span className="kl">
              <span className="dot" data-k={k.k}></span>
              <span>{k.label}</span>
            </span>
            <span className="kv2">
              <span>{k.value}</span>
              <small><span>{k.suffix}</span></small>
            </span>
            <span className="ks" data-k={k.sk}><span>{k.sub}</span></span>
          </button>
        ))}
      </div>
      <div className="tabs" style={{ marginTop: "12px" }}>
        {([["drivers", "Drivers", drivers], ["trucks", "Trucks", trucks], ["trailers", "Trailers", trailers]] as const).map(([key, label, query]) => (
          <button key={key} className={clsx("tab", tab === key && "on")} onClick={() => set({ sftab: key })}>
            {label}
            {count(query) ? <span className="tcnt">{count(query)}</span> : null}
          </button>
        ))}
      </div>
      <div className="sfg">
        <section className="card oh c" style={{ minHeight: "0" }}>
          <div className="thead" style={{ gridTemplateColumns: cols }}>
            {head.map((h) => (
              <span key={h}><span>{h}</span></span>
            ))}
          </div>
          <div className="tbody">
            {source.isPending ? <Skeleton /> : null}
            {source.isError ? <ErrorState error={source.error} retry={() => void source.refetch()} /> : null}
            {source.data && !rows.length ? <EmptyState icon={OK} title={`No ${tab} yet`} /> : null}
            {rows.map((r) => (
              <div key={r.id} className="trow" style={{ gridTemplateColumns: cols }} onClick={r.open}>
                <div className="r g8 mw0">
                  <span className="av sm"><span>{r.ini}</span></span>
                  <span className="ell w5"><span>{r.n}</span></span>
                </div>
                {r.cells.map((x, i2) => (
                  <span key={i2} className="qp" data-k={x.k} title={x.title ?? x.t} style={{ maxWidth: "100%", overflow: "hidden" }}>
                    <Icon className="s12 b" d={x.ic} />
                    <span className="ell">{x.t}</span>
                  </span>
                ))}
                <span className="badge" data-k={r.ok}>
                  <i></i>
                  <span>{r.ol}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="tfoot">
            <span className="r g12">
              <span className="r g6">
                <span className="qd" data-k="ok"></span>
                Valid
              </span>
              <span className="r g6">
                <span className="qd" data-k="warn"></span>
                Expires ≤ 30 days
              </span>
              <span className="r g6">
                <span className="qd" data-k="bad"></span>
                Expired or missing
              </span>
            </span>
            <span className="sp"></span>
            <span>Dates are calendar dates, not times</span>
          </div>
        </section>
        <div className="c g16" style={{ minHeight: "0", overflow: "auto" }}>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Review queue</h2>
              <span className="cnt" data-k="info">{formatNumber(waiting)}</span>
              <span className="sp"></span>
              <button className="lnk" onClick={() => set(goTo("documents"))}>Documents</button>
            </div>
            {queue.data && !queue.data.items.length ? <div className="cb fs13 mu">Nothing is waiting for a review.</div> : null}
            {(queue.data?.items ?? []).map((q) => (
              <div key={q.id} className="wl" style={{ alignItems: "flex-start" }}>
                <span className="eqic"><Icon className="s14" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" /></span>
                <div className="f1">
                  <div className="fs13 w5"><span>{DOCUMENT_TYPES[q.type] ?? q.type}</span></div>
                  <div className="fs12 mu"><span>{[q.links.map((link) => link.label).filter(Boolean).join(", "), q.expires_on ? `expires ${monthYear(q.expires_on)}` : ""].filter(Boolean).join(" · ")}</span></div>
                  <div className="r g6 fs11 mu" style={{ marginTop: "3px" }}>
                    <span>{`${q.uploaded_by_name ?? "Uploaded"} · ${formatDateTime(q.created_at, org.timezone)}`}</span>
                  </div>
                </div>
                <button className="btn xs" onClick={() => set({ screen: "docreview", docId: q.id, overlay: "none", modal: "none" })}>Review</button>
              </div>
            ))}
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Reminder schedule</h2>
              <span className="sp"></span>
              <span className="tag" data-k="mu">Off</span>
            </div>
            <div className="cb c g10">
              <p className="note">
                <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
                Automatic reminders aren’t sent yet. Everything expiring within 30 days is listed here and on the dashboard, and an expired item blocks dispatch on its own.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
