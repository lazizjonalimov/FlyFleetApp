"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Confirm } from "@/components/feedback/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { formatDateTime, formatStamp, timeZoneLabel } from "@/lib/format/dates";
import { humanize } from "@/lib/format/text";
import { DOCUMENT_TYPES, REVIEW } from "./documents-screen";
import { viewDocument } from "./use-upload";

type Read = Schema<"ReadOut">;
type Field = Schema<"FieldOut">;
type Kind = Schema<"ReadAgainIn">["kind"];
const SCAN: Record<string, string> = { clean: "Malware scan passed", passed: "Malware scan passed", infected: "Blocked by the malware scan", failed: "Blocked by the malware scan", not_scanned: "Not scanned yet", pending: "Malware scan running" };
// What each type of document is read as.
const READ_AS: Record<string, Kind> = { license: "cdl", registration: "registration", rate_confirmation: "rate_confirmation", pod: "pod", inspection: "inspection_report", receipt: "fuel_receipt" };
const KINDS: [Kind, string][] = [["pod", "Proof of delivery"], ["cdl", "Commercial driver’s license"], ["registration", "Vehicle registration"], ["rate_confirmation", "Rate confirmation"], ["inspection_report", "Roadside inspection report"], ["fuel_receipt", "Fuel receipt"]];
const READER: Record<string, string> = { text: "Text reader", vision: "Photo reader", none: "Not read" };
// Short names for the page thumbnails.
const SHORT: Record<string, string> = { pod: "POD", bol: "BOL", rate_confirmation: "Rate con", registration: "Reg.", license: "CDL", medical: "Medical", insurance: "COI", inspection: "Inspection", receipt: "Receipt", mvr: "MVR", clearinghouse: "Query", road_test: "Road test", drug_test: "Drug test", authority: "Authority", ucr: "UCR", ifta_license: "IFTA" };
/** A date as the paper writes it: "2027-11-30" -> "11/30/2027". */
const onPaper = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : iso);
const MONO = new Set(["vin", "date", "int", "money", "price", "decimal"]);

/** A field's status: as read, worth a look, or what the reviewer decided. */
function statusOf(f: Field, matched?: string): { k: string; ic: string; label: string } {
  if (f.state === "confirmed") return { k: "ok", ic: I.check, label: "Confirmed" };
  if (f.state === "corrected") return { k: "info", ic: I.pencil, label: "Corrected" };
  if (f.state === "unreadable") return { k: "mu", ic: I.x, label: "Unreadable" };
  if (f.state === "check") return { k: "warn", ic: I.alert, label: "Check" };
  return { k: "ok", ic: I.check, label: matched ?? "Read" };
}

/** Document review: the paper, what was read from it and how sure, the reviewer's decisions, and approve & attach. */
export function DocReviewScreen() {
  const { me, can, state, set, notify } = useConsole();
  const act = useAction();
  const queryClient = useQueryClient();
  const org = me.organization;
  const zone = org.timezone;
  const [zoom, setZoom] = useState(100);
  const [turn, setTurn] = useState(0);
  const [page, setPage] = useState(1);
  const [boxes, setBoxes] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [asking, setAsking] = useState<"approved" | "rejected" | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  const queue = useQuery({ queryKey: [org.id, "documents", "review-queue", "all"], queryFn: () => unwrap(api.GET("/api/v1/documents", { params: { query: { state: "needs_review", sort: "created_at", limit: 100 } } })), enabled: can("documents.read") });
  const pending = queue.data?.items ?? [];
  const id = typeof state.docId === "string" && state.docId ? state.docId : (pending[0]?.id ?? "");
  const query = useQuery({ queryKey: [org.id, "documents", "detail", id], queryFn: () => unwrap(api.GET("/api/v1/documents/{document_id}", { params: { path: { document_id: id } } })), enabled: !!id });
  const reviewer = can("safety.manage") || can("loads.close");
  const reading = useQuery({ queryKey: [org.id, "documents", "read", id], queryFn: () => unwrap(api.GET("/api/v1/intake/documents/{document_id}/read", { params: { path: { document_id: id } } })), enabled: !!id && (reviewer || can("documents.upload")) });
  const doc = query.data;
  const loadLink = doc?.links.find((link) => link.entity_type === "load");
  const load = useQuery({ queryKey: [org.id, "loads", "detail", loadLink?.entity_id], queryFn: () => unwrap(api.GET("/api/v1/loads/{load_id}", { params: { path: { load_id: loadLink!.entity_id } } })), enabled: !!loadLink && can("loads.read") });
  const goDocs = () => set(goTo("documents"));
  const position = pending.findIndex((each) => each.id === id);
  const go = (by: number) => {
    const next = pending[position + by];
    if (next) {
      setPage(1);
      setSelected(null);
      set({ docId: next.id });
    }
  };
  const crumb = (
    <div className="crumb">
      <span>{"Safety & fleet"}</span>
      <Icon className="s12" d="M9 6l6 6-6 6" />
      <button onClick={goDocs}>Documents</button>
      {doc ? (
        <>
          <Icon className="s12" d="M9 6l6 6-6 6" />
          <b className="mono">{doc.filename}</b>
        </>
      ) : null}
    </div>
  );

  if (!id) {
    return (
      <div className="col">
        <div className="ph" style={{ paddingBottom: "12px", borderBottom: "1px solid var(--bd)" }}>
          <div className="f1">
            {crumb}
            <h1 className="h1">Document review</h1>
          </div>
        </div>
        {queue.isPending ? <Skeleton /> : <EmptyState icon={I.check} title="Nothing waiting for review" text="Proofs of delivery and compliance documents that need a decision show up here." />}
      </div>
    );
  }
  if (!doc) {
    return (
      <div className="col">
        <div className="ph" style={{ paddingBottom: "12px", borderBottom: "1px solid var(--bd)" }}>
          <div className="f1">{crumb}</div>
        </div>
        {query.isError ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : <Skeleton rows={8} />}
      </div>
    );
  }

  const [label, tone] = REVIEW[doc.review_status] ?? [humanize(doc.review_status), "mu"];
  const type = DOCUMENT_TYPES[doc.type] ?? humanize(doc.type);
  const linked = doc.links.map((link) => link.label).filter(Boolean).join(", ");
  const image = doc.content_type.startsWith("image/");
  const pages = Math.max(1, doc.pages ?? reading.data?.pages ?? 1);
  const read = reading.data ?? null;
  const decidable = reviewer && doc.review_status === "pending";
  const first = load.data?.stops[0];
  const last = load.data?.stops[load.data.stops.length - 1];
  const lane = load.data ? `${load.data.customer.name}${first && last ? ` · ${first.name || first.city || "—"} → ${last.name || last.city || "—"}` : ""}` : "";
  const uploader = doc.uploaded_by_name ?? "someone";
  const sub = [doc.source === "driver app" ? `Scanned by ${uploader} in the driver app` : doc.source === "system" ? "Added by FlyFleet" : `Uploaded by ${uploader}`, `${formatDateTime(doc.created_at, zone)} ${timeZoneLabel(zone, new Date(doc.created_at))}`, `${pages} ${pages === 1 ? "page" : "pages"}`, lane].filter(Boolean).join(" · ");
  const unchecked = (read?.fields ?? []).filter((f) => f.state === "check" && f.value);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [org.id, "documents"] });
    void queryClient.invalidateQueries({ queryKey: [org.id, "safety"] });
    void queryClient.invalidateQueries({ queryKey: [org.id, "loads"] });
  };
  const decide = (decision: "approved" | "rejected", note: string) =>
    unwrap(api.POST("/api/v1/documents/{document_id}/review", { params: { path: { document_id: doc.id } }, body: { decision, note: note || null } })).then(() => {
      notify(decision === "approved" ? `${type} approved and attached${linked ? ` to ${linked}` : ""}` : `${type} sent back`);
      refresh();
      const next = pending[position + 1] ?? pending[position - 1];
      setPage(1);
      setSelected(null);
      set(next && next.id !== doc.id ? { docId: next.id } : goTo("documents"));
    });
  const saveExpiry = () =>
    act(() => unwrap(api.PATCH("/api/v1/documents/{document_id}", { params: { path: { document_id: doc.id } }, body: { expires_on: expires || null } })), "Expiry date saved").then(() => setExpires(null));
  const fieldBoxes = (read?.fields ?? []).filter((f) => f.page === page && f.box.length === 4);

  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px", borderBottom: "1px solid var(--bd)" }}>
        <div className="f1">
          {crumb}
          <div className="r g10">
            <h1 className="h1">{`${type}${linked ? ` · ${linked}` : ""}`}</h1>
            <span className="badge" data-k={tone}><i></i>{label}</span>
          </div>
          <p className="sub">{sub}</p>
        </div>
        <div className="r g8">
          {position >= 0 ? <span className="fs12 mu nw">{`${position + 1} of ${pending.length} in queue`}</span> : null}
          <div className="r">
            <button className="btn icon sm" aria-label="Previous document" style={{ borderRadius: "6px 0 0 6px" }} disabled={position <= 0} onClick={() => go(-1)}><Icon className="s14" d="M15 6l-6 6 6 6" /></button>
            <button className="btn icon sm" aria-label="Next document" style={{ borderRadius: "0 6px 6px 0", marginLeft: "-1px" }} disabled={position < 0 || position >= pending.length - 1} onClick={() => go(1)}>
              <Icon className="s14" d="M9 6l6 6-6 6" />
            </button>
          </div>
          {decidable ? (
            <>
              <button className="btn bad" onClick={() => setAsking("rejected")}>Reject…</button>
              <button className="btn pri" onClick={() => setAsking("approved")} title={unchecked.length ? "Settle the fields marked Check first" : undefined}>
                <Icon className="s14 b" d={I.check} />
                Approve &amp; attach
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="drg">
        <div className="thumbs">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button key={n} className={clsx("thumb", page === n && "on")} aria-label={`Page ${n}`} aria-pressed={page === n} onClick={() => setPage(n)}>
              <span className="tpaper">
                <i style={{ width: "70%" }}></i>
                <i></i>
                <i style={{ width: n % 2 ? "55%" : "85%" }}></i>
                <i></i>
              </span>
              <span className="fs11 mu">{n === 1 ? `1 · ${SHORT[doc.type] ?? type.split(" ")[0]}` : String(n)}</span>
            </button>
          ))}
        </div>
        <div className="viewer">
          <div className="vtool">
            <button className="btn ghost icon sm" aria-label="Zoom out" onClick={() => setZoom(Math.max(50, zoom - 25))}><Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M8 11h6" /></button>
            <span className="mono fs12 t3">{`${zoom}%`}</span>
            <button className="btn ghost icon sm" aria-label="Zoom in" onClick={() => setZoom(Math.min(250, zoom + 25))}><Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M11 8v6M8 11h6" /></button>
            <button className="btn ghost icon sm" aria-label="Rotate" onClick={() => setTurn((turn + 90) % 360)}><Icon className="s14" d="M1 4v6h6M3.5 15a9 9 0 1 0 2.1-9.4L1 10" /></button>
            <span className="sp"></span>
            {read && read.fields.some((f) => f.box.length === 4) ? (
              <label className="r g6 fs12 t3"><input type="checkbox" className="cbx" checked={boxes} onChange={(e) => setBoxes(e.target.checked)} />Show OCR boxes</label>
            ) : null}
            <button className="btn ghost sm" onClick={() => viewDocument(doc.id)}>
              <Icon className="s14" d={I.ext} />
              Open in a new tab
            </button>
          </div>
          <div className="vstage">
            {doc.scan_status === "infected" || doc.scan_status === "failed" ? (
              <EmptyState icon={I.shield} title="This file was blocked" text="The malware scan flagged it, so it isn’t shown. Ask for a new copy." />
            ) : (
              <div style={{ position: "relative", width: `${(560 * zoom) / 100}px`, transform: `rotate(${turn}deg)`, flex: "none", boxShadow: "0 2px 10px rgba(11,18,32,.18)", background: "#fff", borderRadius: "2px" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image ? `/api/v1/documents/${doc.id}/download?disposition=inline` : `/api/v1/documents/${doc.id}/pages/${page}`} alt={`${type}, page ${page}`} style={{ display: "block", width: "100%" }} />
                {boxes
                  ? fieldBoxes.map((f) => (
                      <button key={f.key} className={clsx("ocr", f.state === "check" && "lo", selected === f.key && "sel")} aria-label={`${f.label}: ${f.value ?? ""}`} onClick={() => setSelected(f.key)}
                        style={{ left: `${f.box[0]! * 100}%`, top: `${f.box[1]! * 100}%`, width: `${Math.max(1, (f.box[2]! - f.box[0]!) * 100)}%`, height: `${Math.max(1.2, (f.box[3]! - f.box[1]!) * 100)}%`, padding: 0, cursor: "pointer" }}></button>
                    ))
                  : null}
              </div>
            )}
          </div>
        </div>
        <aside className="fpanel">
          {read ? (
            <ReadPanel read={read} doc={doc} selected={selected} onSelect={(key, p) => { setSelected(key); if (p) setPage(p); }} decidable={decidable} kind={READ_AS[doc.type]} onChanged={() => void reading.refetch()} />
          ) : (
            <NoReadPanel docId={doc.id} type={doc.type} canRead={reviewer || can("documents.upload")} pending={reading.isPending} onRead={() => void reading.refetch()} />
          )}
          <div className="c g10" style={{ padding: "12px 16px", borderTop: "1px solid var(--bd2)" }}>
            {doc.review_status === "rejected" && doc.review_note ? (
              <div className="banner" data-k="bad"><Icon className="s14" d={I.x} /><div><b>Sent back.</b>{` ${doc.review_note}`}</div></div>
            ) : null}
            {doc.review_status === "approved" ? (
              <div className="banner" data-k="ok"><Icon className="s14 b" d={I.check} /><div><b>Approved</b>{doc.reviewed_by_name ? ` by ${doc.reviewed_by_name}` : ""}{doc.reviewed_at ? ` · ${formatDateTime(doc.reviewed_at, zone)}` : ""}</div></div>
            ) : null}
            <div className="r g8 fs12">
              <span className="t3">Attached to</span>
              <span className="f1 ell">
                {doc.links.length ? doc.links.map((link, i) => (
                  <button key={link.id} className="lnk" onClick={() => (link.entity_type === "load" ? set({ screen: "load", loadId: link.entity_id, overlay: "none", modal: "none" }) : link.entity_type === "driver" ? set({ screen: "driver", driverId: link.entity_id, overlay: "none", modal: "none" }) : link.entity_type === "vehicle" || link.entity_type === "trailer" ? set({ screen: "truck", unitId: link.entity_id, unitKind: link.entity_type === "trailer" ? "trailer" : "truck", overlay: "none", modal: "none" }) : link.entity_type === "organization" ? set({ ...goTo("safety"), sftab: "organization" }) : undefined)}>
                    {`${i ? ", " : ""}${link.label ?? humanize(link.entity_type)}`}
                  </button>
                )) : <span className="mu">Nothing yet</span>}
              </span>
            </div>
            {doc.type !== "pod" && doc.type !== "bol" ? (
              <div className="r g6">
                <label className="fs12 t3 nw" htmlFor="dr-exp">Expires</label>
                <input id="dr-exp" className="inp" type="date" value={expires ?? doc.expires_on ?? ""} onChange={(event) => setExpires(event.target.value)} style={{ height: "30px" }} disabled={!can("documents.upload")} />
                {expires !== null && expires !== (doc.expires_on ?? "") ? <button className="btn xs pri" onClick={() => void saveExpiry()}>Save</button> : null}
              </div>
            ) : null}
          </div>
          <div className="dfoot" style={{ padding: "10px 16px", flexDirection: "column", alignItems: "stretch", gap: "6px" }}>
            <div className="r g6 fs12 mu">
              <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
              {`${SCAN[doc.scan_status] ?? humanize(doc.scan_status)} · checksum verified · private storage`}
            </div>
            <div className="r g6 fs12 mu">
              <Icon className="s14" d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
              Raw OCR and your corrections are stored separately
            </div>
          </div>
        </aside>
      </div>
      {asking ? (
        <Confirm
          title={asking === "approved" ? `Approve and attach this ${type.toLowerCase()}?` : `Send this ${type.toLowerCase()} back?`}
          text={asking === "approved" ? (doc.type === "pod" ? `The proof of delivery is accepted${loadLink?.label ? ` and ${loadLink.label} is completed, ready to invoice` : ""}.` : "It counts from now on, and the record it is filed with takes its date.") : "The uploader is asked for a new copy. Say what is wrong so it can be fixed."}
          confirm={asking === "approved" ? "Approve & attach" : "Send back"}
          destructive={asking === "rejected"}
          reason={asking === "rejected" ? { label: "What is wrong with it", required: true } : { label: "Note (optional)" }}
          onClose={() => setAsking(null)}
          run={({ reason }) => decide(asking, reason)}
        />
      ) : null}
    </div>
  );
}

/** What was read from the paper: each field with how sure the reading was, the checks against FlyFleet's records,
 * and the reviewer's decisions, kept beside what was read. */
function ReadPanel({ read, doc, selected, onSelect, decidable, kind, onChanged }: { read: Read; doc: Schema<"DocumentOut">; selected: string | null; onSelect: (key: string, page?: number | null) => void; decidable: boolean; kind?: Kind; onChanged: () => void }) {
  const { me, notify } = useConsole();
  const [changing, setChanging] = useState(false);
  const sure = read.fields.filter((f) => f.confidence !== null && f.confidence !== undefined);
  const average = sure.length ? Math.round((100 * sure.reduce((t, f) => t + (f.confidence ?? 0), 0)) / sure.length) : null;
  const found = read.fields.filter((f) => f.state !== "missing");
  const missing = read.fields.filter((f) => f.state === "missing");
  const matched = new Map(read.checks.filter((c) => c.field && c.tone === "ok").map((c) => [c.field!, c.title]));
  const readAgain = async (next: Kind) => {
    try {
      await unwrap(api.POST("/api/v1/intake/documents/{document_id}/read", { params: { path: { document_id: doc.id } }, body: { kind: next } }));
      setChanging(false);
      onChanged();
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  return (
    <>
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--bd2)" }}>
        <div className="r g8">
          <span className="h2">Extracted fields</span>
          <span className="sp"></span>
          <span className="fs12 mu">{`${READER[read.reader] ?? read.reader} · ${formatStamp(read.created_at, me.organization.timezone).split(" · ")[1]}`}</span>
        </div>
        <div className="r g8" style={{ marginTop: "8px" }}>
          <span className="fs12 t3">Document type</span>
          {changing ? (
            <select className="inp" aria-label="Read as" style={{ height: "28px", width: "200px" }} defaultValue={read.kind} onChange={(e) => void readAgain(e.target.value as Kind)}>
              {KINDS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          ) : (
            <>
              <span className="tag" data-k="brand">{read.kind_label}</span>
              {average !== null ? <span className="fs12 mu num">{`${average}%`}</span> : null}
              {decidable ? <button className="lnk" onClick={() => setChanging(true)}>Change</button> : null}
            </>
          )}
        </div>
      </div>
      <div className="c g10" style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "12px 16px" }}>
        {read.status !== "done" ? (
          <div className="banner" data-k={read.status === "failed" ? "bad" : "info"}>
            <Icon className="s14" d={read.status === "failed" ? I.alert : I.info} />
            <div><b>{read.status === "failed" ? "Couldn’t be read." : "Not read."}</b>{` ${read.error ?? ""} Check it by eye before deciding.`}</div>
          </div>
        ) : null}
        {read.checks.map((c, i) => (
          <div key={i} className="banner" data-k={c.tone}>
            <Icon className={clsx("s14", c.tone === "ok" && "b")} d={c.tone === "ok" ? I.check : c.tone === "info" ? I.info : I.alert} />
            <div><b>{`${c.title}.`}</b>{c.detail ? ` ${c.detail}` : ""}</div>
          </div>
        ))}
        {found.map((f) => <FieldCard key={f.key} f={f} readId={read.id} matched={matched.get(f.key)} selected={selected === f.key} onSelect={() => onSelect(f.key, f.page)} decidable={decidable} onChanged={onChanged} />)}
        {missing.length ? <p className="fs12 mu">{`Not found on the paper: ${missing.map((f) => f.label.toLowerCase()).join(", ")}.`}</p> : null}
        {!kind ? null : read.kind !== kind ? <p className="fs12 mu">{`Read as a ${read.kind_label.toLowerCase()}; filed as ${(DOCUMENT_TYPES[doc.type] ?? doc.type).toLowerCase()}.`}</p> : null}
      </div>
    </>
  );
}

/** One field read from the paper: its value, how sure the reading was, and what the reviewer decided. */
function FieldCard({ f, readId, matched, selected, onSelect, decidable, onChanged }: { f: Field; readId: string; matched?: string; selected: boolean; onSelect: () => void; decidable: boolean; onChanged: () => void }) {
  const { notify } = useConsole();
  const shown = f.value ? (f.type === "date" ? onPaper(f.value) : f.value) : "";
  const [value, setValue] = useState(shown);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const s = statusOf(f, matched);
  const pct = f.confidence !== null && f.confidence !== undefined ? Math.round(f.confidence * 100) : null;
  const edited = value !== shown;
  const send = async (decision: "confirmed" | "corrected" | "unreadable") => {
    setBusy(true);
    try {
      await unwrap(api.PUT("/api/v1/intake/reads/{read_id}/fields/{key}", { params: { path: { read_id: readId, key: f.key } }, body: { decision, value: decision === "corrected" ? value : null, reason: reason || null } }));
      setReason("");
      onChanged();
    } catch (e) {
      notify(errorMessage(e), true);
    }
    setBusy(false);
  };
  const open = decidable && (f.state === "check" || edited);
  return (
    <div className={clsx("ofld", f.state === "check" && "lo", selected && "sel")} onClick={onSelect}>
      <div className="r g6">
        <span className="fs12 w5 t2 f1">{f.label}</span>
        <span className="risk" data-k={s.k}><Icon className="s12 b" d={s.ic} />{s.label}</span>
      </div>
      <input className={clsx("inp", MONO.has(f.type) && "mono")} value={value} aria-label={f.label} style={{ height: "32px" }} readOnly={!decidable} onChange={(e) => setValue(e.target.value)} />
      {pct !== null ? (
        <div className="r g8">
          <span className="bar" data-k={pct >= 80 ? "ok" : pct >= 60 ? "warn" : "bad"} style={{ height: "4px" }}><span style={{ width: `${pct}%` }}></span></span>
          <span className="fs11 mu num nw">{`${pct}% confidence`}</span>
        </div>
      ) : null}
      {f.state === "corrected" ? <p className="fs12 t3">{`Read as ${f.read_value ? (f.type === "date" ? onPaper(f.read_value) : f.read_value) : "—"}${f.reason ? ` · ${f.reason}` : ""}`}</p> : null}
      {f.state === "unreadable" ? <p className="fs12 t3">{`Marked unreadable${f.read_value ? `; read as ${f.read_value}` : ""}.`}</p> : null}
      {f.note && f.state !== "corrected" ? <p className="fs12 t3">{f.note}</p> : null}
      {open ? (
        <div className="c g6" onClick={(e) => e.stopPropagation()}>
          {f.state === "check" && !f.note ? <p className="fs12 t3">Read with low confidence. Leave it as read or mark it unreadable — never guess.</p> : null}
          <input className="inp" placeholder="Correction reason (required if you change the value)" aria-label={`Correction reason for ${f.label.toLowerCase()}`} style={{ height: "32px" }} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="r g6">
            {edited ? <button className="btn xs pri" disabled={busy} onClick={() => void send("corrected")}>Save correction</button> : <button className="btn xs" disabled={busy} onClick={() => void send("confirmed")}>Confirm as read</button>}
            <button className="btn xs ghost" disabled={busy} onClick={() => void send("unreadable")}>Mark unreadable</button>
            {edited ? <button className="btn xs ghost" disabled={busy} onClick={() => setValue(shown)}>Undo</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A document not read yet: read it now, as the kind it is; or check it by eye. */
function NoReadPanel({ docId, type, canRead, pending, onRead }: { docId: string; type: string; canRead: boolean; pending: boolean; onRead: () => void }) {
  const { notify } = useConsole();
  const kind = READ_AS[type];
  const [busy, setBusy] = useState(false);
  const readNow = async () => {
    if (!kind) return;
    setBusy(true);
    try {
      await unwrap(api.POST("/api/v1/intake/documents/{document_id}/read", { params: { path: { document_id: docId } }, body: { kind } }));
      onRead();
    } catch (e) {
      notify(errorMessage(e), true);
    }
    setBusy(false);
  };
  return (
    <>
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--bd2)" }}>
        <div className="r g8"><span className="h2">Extracted fields</span></div>
        <div className="r g8" style={{ marginTop: "8px" }}>
          <span className="fs12 t3">Document type</span>
          <span className="tag" data-k="brand">{DOCUMENT_TYPES[type] ?? humanize(type)}</span>
        </div>
      </div>
      <div className="c g10" style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "12px 16px" }}>
        {pending ? <Skeleton rows={3} /> : kind ? (
          <>
            <p className="fs13 t2">Not read yet. Reading fills in the fields from the paper so you can check them one by one.</p>
            {canRead ? <button className="btn sm" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => void readNow()}><Icon className="s14" d={I.scan} />{busy ? "Reading…" : "Read the document"}</button> : null}
          </>
        ) : (
          <p className="fs13 t2">{`FlyFleet doesn’t read ${(DOCUMENT_TYPES[type] ?? type).toLowerCase()} documents yet. Check it by eye, enter the date it runs to below, and approve it.`}</p>
        )}
      </div>
    </>
  );
}
