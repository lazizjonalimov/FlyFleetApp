"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useId, useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import { DOCUMENT_TYPES } from "@/features/documents/documents-screen";
import { monthYear } from "@/features/fleet/labels";
import { leadLine, ReminderRulesDialog } from "@/features/safety/reminder-rules";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { formatDate, formatStamp, timeZoneLabel, todayIn } from "@/lib/format/dates";
import { formatNumber, initials, plural } from "@/lib/format/text";
import { useMinuteClock } from "@/lib/time/clock";
import { ACCEPT, checkFile, uploadDocument, type DocumentType } from "@/lib/upload";

type Entity = Schema<"ComplianceMatrix">["entity"];
type Row = Schema<"ComplianceRow">;
type Cell = Schema<"ComplianceCell">;
type Doc = Schema<"DocumentOut">;
type Filter = "expired" | "expiring" | "missing" | "qualified" | null;
const TABS: [Entity, string][] = [["driver", "Drivers"], ["vehicle", "Trucks"], ["trailer", "Trailers"], ["organization", "Organization"]];
const DAY = 86_400_000;
const VERDICT: Record<string, [label: string, tone: string]> = {
  qualified: ["Qualified", "ok"], expiring: ["Expiring", "warn"], review: ["In review", "info"], expired: ["Expired", "bad"],
  missing: ["Missing", "bad"], lapsed: ["Expired", "warn"], incomplete: ["Incomplete", "warn"], inactive: ["Off the road", "mu"],
};
const ORG_VERDICT: Record<string, [label: string, tone: string]> = {
  qualified: ["Valid", "ok"], expiring: ["Expiring", "warn"], review: ["In review", "info"], lapsed: ["Expired", "bad"], incomplete: ["Missing", "bad"],
};
const SOURCE: Record<string, string> = { "driver app": "Driver app scan", web: "Upload", system: "Added by FlyFleet" };

/** "Aug 2028", "6 days", "Expired Nov 2", "Missing", "On file", "In review": one item of a record's file. */
function show(c: Cell, label: string): { k: string; t: string; ic: string; title: string } {
  const until = c.expires_on ? formatDate(c.expires_on) : "";
  if (c.in_review) {
    const now = c.state === "valid" ? (c.expires_on ? `good to ${until}` : "on file") : c.state === "missing" ? "not on file" : c.state === "expired" ? `expired ${until}` : `expires ${until}`;
    return { k: "info", t: "In review", ic: I.eye, title: `${label}: a replacement is waiting for review (${now})` };
  }
  if (c.state === "missing") return { k: "bad", t: "Missing", ic: I.alert, title: `${label}: not on file` };
  if (c.state === "expired") return { k: "bad", t: `Expired ${until.replace(/, \d{4}$/, "")}`, ic: I.alert, title: `${label}: expired ${until}` };
  if (c.state === "expiring") return { k: "warn", t: plural(c.days_left ?? 0, "day"), ic: I.clock, title: `${label}: expires ${until}` };
  return { k: "ok", t: c.expires_on ? monthYear(c.expires_on) : "On file", ic: I.check, title: c.expires_on ? `${label}: good to ${until}` : `${label}: on file` };
}

/** What a row is filtered by when a figure at the top is chosen. */
function matches(row: Row, filter: Filter): boolean {
  if (!filter) return true;
  if (filter === "qualified") return row.verdict === "qualified";
  return row.cells.some((c) => c.state === filter);
}

const ago = (iso: string, now: number | null) => {
  if (now === null) return "";
  const days = Math.floor((now - Date.parse(iso)) / DAY);
  return days >= 1 ? `oldest ${plural(days, "day")}` : "oldest today";
};

/** "Tonight · 02:00 CST": when the next reminders go out, on the company's clock. */
function nextRun(iso: string | null | undefined, zone: string, now: number | null): string {
  if (!iso) return "Off";
  const at = new Date(iso);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  const label = timeZoneLabel(zone, at);
  if (now === null) return `${time} ${label}`;
  const today = todayIn(zone, new Date(now));
  const day = todayIn(zone, at);
  const tomorrow = todayIn(zone, new Date(now + DAY));
  const hour = Number(time.slice(0, 2));
  const when = day === today ? (hour >= 18 ? "Tonight" : "Today") : day === tomorrow ? (hour < 6 ? "Tonight" : "Tomorrow") : formatDate(day);
  return `${when} · ${time} ${label}`;
}

/** Compliance: who and what may be dispatched, what is about to expire, and documents waiting for a review. */
export function SafetyScreen() {
  const { me, can, state, set, notify } = useConsole();
  const org = me.organization;
  const now = useMinuteClock();
  const tab: Entity = TABS.some(([key]) => key === state.sftab) ? (state.sftab as Entity) : "driver";
  const filter = (["expired", "expiring", "missing", "qualified"] as const).find((f) => f === state.sff) ?? null;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [filing, setFiling] = useState<Row | null>(null);
  const summary = useQuery({ queryKey: [org.id, "safety", "summary"], queryFn: () => unwrap(api.GET("/api/v1/safety/summary")), refetchInterval: 60_000 });
  const matrix = useQuery({ queryKey: [org.id, "safety", "matrix", tab], queryFn: () => unwrap(api.GET("/api/v1/safety/matrix", { params: { query: { entity: tab } } })) });
  const queue = useQuery({ queryKey: [org.id, "safety", "review-queue"], queryFn: () => unwrap(api.GET("/api/v1/documents", { params: { query: { review_status: "pending", group: "compliance", sort: "created_at", limit: 6, count: true } } })), enabled: can("documents.read"), refetchInterval: 60_000 });
  const rules = useQuery({ queryKey: [org.id, "safety", "reminders"], queryFn: () => unwrap(api.GET("/api/v1/safety/reminders")) });
  const s = summary.data;
  const r = rules.data;
  const waiting = queue.data?.page.total_count ?? queue.data?.items.length ?? 0;
  const oldest = queue.data?.items[0]?.created_at;
  const expiringSub = s ? [plural(s.expiring_drivers, "driver"), plural(s.expiring_trucks, "truck"), plural(s.expiring_trailers, "trailer"), s.expiring_company ? plural(s.expiring_company, "company document") : ""].filter((x, i) => x && (i === 0 || !x.startsWith("0 "))).join(" · ") : "";
  const kpis: { key: Filter | "review"; label: string; value: string; suffix: string; sub: string; k: string; sk: string }[] = [
    { key: "expired", label: "Expired", value: s ? formatNumber(s.expired) : "—", suffix: "", sub: s ? (s.expired_first ?? "Nothing has run out") : "", k: "bad", sk: s?.expired ? "bad" : "mu" },
    { key: "expiring", label: "Expiring ≤ 30 days", value: s ? formatNumber(s.expiring) : "—", suffix: "", sub: s ? (s.expiring ? expiringSub : "Nothing due this month") : "", k: "warn", sk: s?.expiring ? "warn" : "mu" },
    { key: "missing", label: "Missing", value: s ? formatNumber(s.missing) : "—", suffix: "", sub: s ? (s.missing_items.length ? s.missing_items.slice(0, 2).join(" · ") + (s.missing_items.length > 2 ? ` +${s.missing_items.length - 2}` : "") : "Every file complete") : "", k: "bad", sk: "mu" },
    { key: "review", label: "Waiting for review", value: queue.data ? formatNumber(waiting) : "—", suffix: "", sub: queue.data ? (oldest ? ago(oldest, now) : "Nothing to review") : "", k: "info", sk: "mu" },
    { key: "qualified", label: "Fully qualified", value: s ? formatNumber(s.drivers_qualified) : "—", suffix: s ? ` / ${formatNumber(s.drivers_active)}` : "", sub: "active drivers", k: "ok", sk: "mu" },
  ];
  const pick = (key: Filter | "review") => {
    if (key === "review") return set(goTo("documents"));
    const next = filter === key ? null : key;
    set({ sff: next, ...(next === "qualified" ? { sftab: "driver" } : {}) });
  };

  const columns = matrix.data?.columns ?? [];
  const rows = (matrix.data?.rows ?? []).filter((row) => matches(row, filter));
  const isOrg = tab === "organization";
  const head = isOrg ? ["Document", "File", "Expires", "Reviewed", "Status"] : [{ driver: "Driver", vehicle: "Truck", trailer: "Trailer", organization: "" }[tab], ...columns.map((c) => c.label), "Dispatchable"];
  const cols = isOrg ? "minmax(0,1.2fr) minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.2fr) 112px" : `minmax(0,1.3fr) repeat(${columns.length},minmax(0,1fr)) 112px`;
  const open = (row: Row) => {
    if (tab === "driver") return set({ screen: "driver", driverId: row.id, overlay: "none", modal: "none" });
    if (tab === "vehicle" || tab === "trailer") return set({ screen: "truck", unitId: row.id, unitKind: tab === "vehicle" ? "truck" : "trailer", overlay: "none", modal: "none" });
    if (row.document) return set({ screen: "docreview", docId: row.document.id, overlay: "none", modal: "none" });
    if (can("documents.upload")) setFiling(row);
  };
  const count = (key: Entity) => (s?.tabs[key] !== undefined ? formatNumber(s.tabs[key]!) : "");

  const exportMatrix = async () => {
    const response = await window.fetch(`/api/v1/safety/matrix.csv?entity=${tab}`);
    if (!response.ok) return notify("The export couldn’t be made", true);
    const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "compliance.csv";
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

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
          <button className="btn" onClick={() => setRulesOpen(true)} disabled={!r}>
            <Icon className="s14" d={I.bell} />
            Reminder rules
          </button>
          <button className="btn" onClick={() => void exportMatrix()}>
            <Icon className="s14" d={I.download} />
            Export
          </button>
        </div>
      </div>
      <div className="kpis" style={{ margin: "0 24px", gridTemplateColumns: "repeat(5,minmax(0,1fr))" }}>
        {kpis.map((k) => (
          <button key={k.label} className="kpi" aria-pressed={k.key !== "review" ? filter === k.key : undefined} onClick={() => pick(k.key)}
            style={k.key !== "review" && filter === k.key ? { boxShadow: "inset 0 -2px 0 var(--pri)" } : undefined}>
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
        {TABS.map(([key, label]) => (
          <button key={key} className={clsx("tab", tab === key && "on")} onClick={() => set({ sftab: key, ...(filter === "qualified" && key !== "driver" ? { sff: null } : {}) })}>
            {label}
            {count(key) ? <span className="tcnt">{count(key)}</span> : null}
          </button>
        ))}
        {filter ? (
          <button className="chip" style={{ marginLeft: "auto", alignSelf: "center" }} onClick={() => set({ sff: null })} aria-label="Show every row">
            {`${kpis.find((k) => k.key === filter)?.label ?? ""} only`}
            <Icon className="s12" d={I.x} />
          </button>
        ) : null}
      </div>
      <div className="sfg">
        <section className="card oh c" style={{ minHeight: "0" }}>
          <div className="thead" style={{ gridTemplateColumns: cols }}>
            {head.map((h) => (
              <span key={h}><span>{h}</span></span>
            ))}
          </div>
          <div className="tbody">
            {matrix.isPending ? <Skeleton /> : null}
            {matrix.isError ? <ErrorState error={matrix.error} retry={() => void matrix.refetch()} /> : null}
            {matrix.data && !matrix.data.rows.length ? <EmptyState icon={I.check} title={{ driver: "No active drivers yet", vehicle: "No trucks yet", trailer: "No trailers yet", organization: "" }[tab]} /> : null}
            {matrix.data && matrix.data.rows.length && !rows.length ? <EmptyState icon={I.check} title="Nothing matches" text="No row on this tab has that state." /> : null}
            {rows.map((row) =>
              isOrg ? (
                <OrganizationRow key={row.id} row={row} cols={cols} onOpen={() => open(row)} canFile={can("documents.upload")} />
              ) : (
                <div key={row.id} className="trow" style={{ gridTemplateColumns: cols }} onClick={() => open(row)}>
                  <div className="r g8 mw0">
                    <span className="av sm"><span>{tab === "driver" ? initials(row.name) : row.name.slice(0, 3)}</span></span>
                    <span className="ell w5"><span>{row.name}</span></span>
                  </div>
                  {row.cells.map((c, i) => {
                    const x = show(c, columns[i]?.label ?? c.item);
                    return (
                      <span key={c.item} className="qp" data-k={x.k} title={x.title}>
                        <Icon className="s12 b" d={x.ic} />
                        <span>{x.t}</span>
                      </span>
                    );
                  })}
                  <span className="badge" data-k={(VERDICT[row.verdict] ?? VERDICT.qualified!)[1]}>
                    <i></i>
                    <span>{row.verdict === "inactive" && row.status === "retired" ? "Retired" : (VERDICT[row.verdict] ?? VERDICT.qualified!)[0]}</span>
                  </span>
                </div>
              ),
            )}
          </div>
          <div className="tfoot">
            <span className="r g12">
              <span className="r g6"><span className="qd" data-k="ok"></span>Valid</span>
              <span className="r g6"><span className="qd" data-k="warn"></span>Expires ≤ 30 days</span>
              <span className="r g6"><span className="qd" data-k="bad"></span>Expired or missing</span>
              <span className="r g6"><span className="qd" data-k="info"></span>Awaiting review</span>
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
            {!can("documents.read") ? <div className="cb fs13 mu">Your role doesn’t include documents.</div> : null}
            {queue.data && !queue.data.items.length ? <div className="cb fs13 mu">Nothing is waiting for a review.</div> : null}
            {(queue.data?.items ?? []).map((q) => <QueueRow key={q.id} doc={q} zone={org.timezone} now={now} onReview={() => set({ screen: "docreview", docId: q.id, overlay: "none", modal: "none" })} />)}
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Reminder schedule</h2>
              <span className="sp"></span>
              {r ? <span className="tag" data-k={r.enabled ? "ok" : "mu"}>{r.enabled ? "On" : "Off"}</span> : null}
            </div>
            <div className="cb c g10">
              {rules.isError ? <ErrorState error={rules.error} retry={() => void rules.refetch()} /> : null}
              {r ? (
                <dl className="kv">
                  <dt>Lead times</dt>
                  <dd>{leadLine(r.lead_days)}</dd>
                  <dt>Channels</dt>
                  <dd>{r.channels.map((c) => r.channel_options.find((o) => o.key === c)?.label ?? c).join(", ")}</dd>
                  <dt>Copies to</dt>
                  <dd>{r.copy_to.length ? r.copy_to.map((c) => r.copy_options.find((o) => o.key === c)?.label ?? c).join(", ") : "Nobody"}</dd>
                  <dt>Next run</dt>
                  <dd className="num">{r.enabled ? nextRun(r.next_run_at, org.timezone, now) : "Off"}</dd>
                  <dt>Sent this week</dt>
                  <dd className="num">{`${formatNumber(r.sent_week)} · ${formatNumber(r.failed_week)} failed`}</dd>
                </dl>
              ) : null}
              <p className="note">
                <Icon className="s14" d={I.info} />
                Each reminder is sent once per document and window. A reminder never marks anything compliant — a reviewer approves the replacement.
              </p>
            </div>
          </section>
        </div>
      </div>
      {rulesOpen && r ? <ReminderRulesDialog rules={r} onClose={() => setRulesOpen(false)} /> : null}
      {filing ? <CompanyFileDialog row={filing} onClose={() => setFiling(null)} /> : null}
    </div>
  );
}

/** One of the company's own documents: the file on record, when it runs out, who approved it. */
function OrganizationRow({ row, cols, onOpen, canFile }: { row: Row; cols: string; onOpen: () => void; canFile: boolean }) {
  const { me } = useConsole();
  const c = row.cells[0]!;
  const x = show(c, row.name);
  const doc = row.document;
  const [label, tone] = ORG_VERDICT[row.verdict] ?? ["Missing", "bad"];
  return (
    <div className="trow" style={{ gridTemplateColumns: cols }} onClick={onOpen}>
      <div className="r g8 mw0">
        <span className="eqic"><Icon className="s14" d={I.file} /></span>
        <span className="ell w5"><span>{row.name}</span></span>
      </div>
      <span className={clsx("ell fs13", !doc && "mu")}>{doc ? doc.filename : canFile ? "Not on file · upload" : "Not on file"}</span>
      {doc && doc.review_status !== "pending" ? (
        <span className="qp" data-k={x.k} title={x.title} style={{ maxWidth: "100%", overflow: "hidden" }}>
          <Icon className="s12 b" d={x.ic} />
          <span className="ell">{c.expires_on ? x.t : "No expiry"}</span>
        </span>
      ) : (
        <span className="fs13 mu">—</span>
      )}
      <span className="ell fs12 t3">{doc ? (doc.review_status === "pending" ? "Waiting for review" : doc.reviewed_by_name ? `${doc.reviewed_by_name} · ${formatStamp(doc.reviewed_at, me.organization.timezone)}` : "Filed") : "—"}</span>
      <span className="badge" data-k={tone}>
        <i></i>
        <span>{label}</span>
      </span>
    </div>
  );
}

/** A document waiting for safety: what it is, whose, how sure the reading is, where it came from. */
function QueueRow({ doc, zone, now, onReview }: { doc: Doc; zone: string; now: number | null; onReview: () => void }) {
  const who = doc.links.map((link) => link.label).filter(Boolean).join(", ");
  const expires = doc.expires_on ? `expires ${monthYear(doc.expires_on)}${doc.read_confidence !== null && doc.read_confidence !== undefined ? " (read)" : ""}` : "";
  const today = now !== null && todayIn(zone, new Date(now)) === todayIn(zone, new Date(doc.created_at));
  const when = today ? new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(doc.created_at)) : formatStamp(doc.created_at, zone).split(" · ")[0];
  return (
    <div className="wl" style={{ alignItems: "flex-start" }}>
      <span className="eqic"><Icon className="s14" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" /></span>
      <div className="f1">
        <div className="fs13 w5"><span>{DOCUMENT_TYPES[doc.type] ?? doc.type}</span></div>
        <div className="fs12 mu"><span>{[who, expires].filter(Boolean).join(" · ")}</span></div>
        <div className="r g6 fs11 mu" style={{ marginTop: "3px" }}>
          {doc.read_confidence !== null && doc.read_confidence !== undefined ? <span className="tag" data-k={doc.read_confidence >= 90 ? "ok" : "warn"}>{`OCR ${doc.read_confidence}%`}</span> : null}
          <span>{`${SOURCE[doc.source] ?? "Upload"} · ${when}`}</span>
        </div>
      </div>
      <button className="btn xs" onClick={onReview}>Review</button>
    </div>
  );
}

/** Files one of the company's own documents: the file and the date it runs to. It waits for a review like any other. */
function CompanyFileDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const { me, notify } = useConsole();
  const id = useId();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [expires, setExpires] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const type = row.cells[0]!.item as DocumentType;

  async function go() {
    if (!file) return setError("Choose the file");
    const problem = checkFile(file);
    if (problem) return setError(problem);
    setPending(true);
    setError(null);
    try {
      await uploadDocument({ file, type, entityType: "organization", entityId: me.organization.id, expiresOn: expires || null });
      await queryClient.invalidateQueries({ queryKey: [me.organization.id, "safety"] });
      notify(`${row.name} filed · waiting for review`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  return (
    <Dialog title={`File ${row.name.toLowerCase().replace(/^(ucr|ifta)/i, (m) => m.toUpperCase())}`} sub="It counts once a safety manager approves it" icon={I.upload} onClose={() => !pending && onClose()}
      footer={
        <>
          <span className="sp"></span>
          <button className="btn" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn pri" onClick={() => void go()} disabled={pending}>{pending ? "Uploading…" : "Upload"}</button>
        </>
      }>
      <Problem message={error} />
      <div className="fld">
        <label htmlFor={`${id}-file`}>File</label>
        <input id={`${id}-file`} className="inp" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="fld">
        <label htmlFor={`${id}-exp`}>Expires</label>
        <input id={`${id}-exp`} className="inp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        <span className="fs12 mu">Leave empty if it doesn’t run out, like operating authority.</span>
      </div>
    </Dialog>
  );
}
