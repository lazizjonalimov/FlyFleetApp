"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Confirm } from "@/components/feedback/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import { api, unwrap } from "@/lib/api/client";
import { formatDate, formatDateTime } from "@/lib/format/dates";
import { formatBytes, humanize } from "@/lib/format/text";
import { DOCUMENT_TYPES, REVIEW } from "./documents-screen";
import { viewDocument } from "./use-upload";

const SCAN: Record<string, string> = { clean: "Malware scan passed", infected: "Blocked by the malware scan", not_scanned: "Not scanned yet", pending: "Malware scan running" };

/** Document review: the file itself, what it is attached to, and approving or sending it back. */
export function DocReviewScreen() {
  const { me, can, state, set } = useConsole();
  const act = useAction();
  const org = me.organization;
  const zone = org.timezone;
  const [zoom, setZoom] = useState(100);
  const [turn, setTurn] = useState(0);
  const [asking, setAsking] = useState<"approved" | "rejected" | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  const queue = useQuery({ queryKey: [org.id, "documents", "review-queue", "all"], queryFn: () => unwrap(api.GET("/api/v1/documents", { params: { query: { review_status: "pending", sort: "created_at", limit: 100 } } })), enabled: can("documents.read") });
  const pending = queue.data?.items ?? [];
  const id = typeof state.docId === "string" && state.docId ? state.docId : (pending[0]?.id ?? "");
  const query = useQuery({ queryKey: [org.id, "documents", "detail", id], queryFn: () => unwrap(api.GET("/api/v1/documents/{document_id}", { params: { path: { document_id: id } } })), enabled: !!id });
  const goDocs = () => set(goTo("documents"));
  const doc = query.data;
  const position = pending.findIndex((each) => each.id === id);
  const go = (by: number) => {
    const next = pending[position + by];
    if (next) set({ docId: next.id });
  };
  const review = can("safety.manage") || can("loads.close") || can("documents.upload");
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
        {queue.isPending ? <Skeleton /> : <EmptyState icon="M5 12l5 5 9-10" title="Nothing waiting for review" text="Proofs of delivery and compliance documents that need a decision show up here." />}
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
  const src = `/api/v1/documents/${doc.id}/download?disposition=inline`;
  const image = doc.content_type.startsWith("image/");
  const decide = (decision: "approved" | "rejected", note: string) =>
    act(() => unwrap(api.POST("/api/v1/documents/{document_id}/review", { params: { path: { document_id: doc.id } }, body: { decision, note: note || null } })), decision === "approved" ? `${type} approved` : `${type} sent back`).then((saved) => {
      if (saved) {
        const next = pending[position + 1] ?? pending[position - 1];
        set(next && next.id !== doc.id ? { docId: next.id } : goTo("documents"));
      }
    });
  const saveExpiry = () =>
    act(() => unwrap(api.PATCH("/api/v1/documents/{document_id}", { params: { path: { document_id: doc.id } }, body: { expires_on: expires || null } })), "Expiry date saved").then(() => setExpires(null));

  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px", borderBottom: "1px solid var(--bd)" }}>
        <div className="f1">
          {crumb}
          <div className="r g10">
            <h1 className="h1">{`${type}${linked ? ` · ${linked}` : ""}`}</h1>
            <span className="badge" data-k={tone}>
              <i></i>
              {label}
            </span>
          </div>
          <p className="sub">{[doc.uploaded_by_name ? `Uploaded by ${doc.uploaded_by_name}` : "Uploaded", formatDateTime(doc.created_at, zone), formatBytes(doc.size_bytes)].join(" · ")}</p>
        </div>
        <div className="r g8">
          {position >= 0 ? <span className="fs12 mu nw">{`${position + 1} of ${pending.length} in queue`}</span> : null}
          <div className="r">
            <button className="btn icon sm" aria-label="Previous document" style={{ borderRadius: "6px 0 0 6px" }} disabled={position <= 0} onClick={() => go(-1)}><Icon className="s14" d="M15 6l-6 6 6 6" /></button>
            <button className="btn icon sm" aria-label="Next document" style={{ borderRadius: "0 6px 6px 0", marginLeft: "-1px" }} disabled={position < 0 || position >= pending.length - 1} onClick={() => go(1)}>
              <Icon className="s14" d="M9 6l6 6-6 6" />
            </button>
          </div>
          {review && doc.review_status === "pending" ? (
            <>
              <button className="btn bad" onClick={() => setAsking("rejected")}>Reject…</button>
              <button className="btn pri" onClick={() => setAsking("approved")}>
                <Icon className="s14 b" d="M5 12l5 5 9-10" />
                Approve
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="drg">
        <div className="thumbs">
          <button className="thumb on" aria-label="The document">
            <span className="tpaper">
              <i style={{ width: "70%" }}></i>
              <i></i>
              <i style={{ width: "55%" }}></i>
              <i></i>
              <i style={{ width: "80%" }}></i>
            </span>
            <span className="fs11 mu">{type}</span>
          </button>
        </div>
        <div className="viewer">
          <div className="vtool">
            <button className="btn ghost icon sm" aria-label="Zoom out" onClick={() => setZoom(Math.max(25, zoom - 25))} disabled={!image}><Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M8 11h6" /></button>
            <span className="mono fs12 t3">{`${zoom}%`}</span>
            <button className="btn ghost icon sm" aria-label="Zoom in" onClick={() => setZoom(Math.min(300, zoom + 25))} disabled={!image}>
              <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M11 8v6M8 11h6" />
            </button>
            <button className="btn ghost icon sm" aria-label="Rotate" onClick={() => setTurn((turn + 90) % 360)} disabled={!image}><Icon className="s14" d="M1 4v6h6M3.5 15a9 9 0 1 0 2.1-9.4L1 10" /></button>
            <span className="sp"></span>
            <button className="btn ghost sm" onClick={() => viewDocument(doc.id)}>
              <Icon className="s14" d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              Open in a new tab
            </button>
          </div>
          <div className="vstage">
            {doc.scan_status === "infected" ? (
              <EmptyState icon="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" title="This file was blocked" text="The malware scan flagged it, so it isn’t shown. Ask for a new copy." />
            ) : image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={`${type} ${doc.filename}`} style={{ width: `${(540 * zoom) / 100}px`, transform: `rotate(${turn}deg)`, boxShadow: "0 2px 10px rgba(11,18,32,.18)", background: "#fff", flex: "none" }} />
            ) : (
              <iframe src={src} title={doc.filename} style={{ width: "100%", height: "100%", minHeight: "560px", border: "none", background: "#fff", borderRadius: "2px", boxShadow: "0 2px 10px rgba(11,18,32,.18)" }} />
            )}
          </div>
        </div>
        <aside className="fpanel">
          <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--bd2)" }}>
            <div className="r g8">
              <span className="h2">Details</span>
              <span className="sp"></span>
              <span className="fs12 mu">{doc.content_type}</span>
            </div>
            <div className="r g8" style={{ marginTop: "8px" }}>
              <span className="fs12 t3">Document type</span>
              <span className="tag" data-k="brand">{type}</span>
            </div>
          </div>
          <div className="c g10" style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "12px 16px" }}>
            {doc.review_status === "rejected" && doc.review_note ? (
              <div className="banner" data-k="bad">
                <Icon className="s14" d="M18 6L6 18M6 6l12 12" />
                <div>
                  <b>Sent back.</b>
                  {` ${doc.review_note}`}
                </div>
              </div>
            ) : null}
            {doc.review_status === "approved" ? (
              <div className="banner" data-k="ok">
                <Icon className="s14 b" d="M5 12l5 5 9-10" />
                <div>
                  <b>Approved</b>
                  {doc.reviewed_by_name ? ` by ${doc.reviewed_by_name}` : ""}
                  {doc.reviewed_at ? ` · ${formatDateTime(doc.reviewed_at, zone)}` : ""}
                </div>
              </div>
            ) : null}
            <div className="ofld">
              <span className="fs12 w5 t2">Attached to</span>
              <div className="c g4">
                {doc.links.length ? (
                  doc.links.map((link) => (
                    <button
                      key={link.id}
                      className="lnk"
                      style={{ textAlign: "left" }}
                      onClick={() =>
                        link.entity_type === "load"
                          ? set({ screen: "load", loadId: link.entity_id, overlay: "none", modal: "none" })
                          : link.entity_type === "driver"
                            ? set({ screen: "driver", driverId: link.entity_id, overlay: "none", modal: "none" })
                            : link.entity_type === "vehicle" || link.entity_type === "trailer"
                              ? set({ screen: "truck", unitId: link.entity_id, unitKind: link.entity_type === "trailer" ? "trailer" : "truck", overlay: "none", modal: "none" })
                              : undefined
                      }
                    >
                      {`${humanize(link.entity_type)} · ${link.label ?? link.entity_id.slice(0, 8)}`}
                    </button>
                  ))
                ) : (
                  <span className="fs13 mu">Nothing yet</span>
                )}
              </div>
            </div>
            <div className="ofld">
              <label className="fs12 w5 t2" htmlFor="dr-exp">Expires</label>
              <div className="r g6">
                <input id="dr-exp" className="inp" type="date" value={expires ?? doc.expires_on ?? ""} onChange={(event) => setExpires(event.target.value)} style={{ height: "32px" }} disabled={!can("documents.upload")} />
                {expires !== null && expires !== (doc.expires_on ?? "") ? <button className="btn xs pri" onClick={() => void saveExpiry()}>Save</button> : null}
              </div>
              <span className="fs11 mu">{doc.expires_on ? `On file: ${formatDate(doc.expires_on)}` : "For licences, medical cards, insurance and registrations"}</span>
            </div>
            <div className="ofld">
              <span className="fs12 w5 t2">File</span>
              <span className="fs13 mono ell">{doc.filename}</span>
              <span className="fs11 mu">{`${formatBytes(doc.size_bytes)} · ${humanize(doc.upload_status)}`}</span>
            </div>
          </div>
          <div className="dfoot" style={{ padding: "10px 16px", flexDirection: "column", alignItems: "stretch", gap: "6px" }}>
            <div className="r g6 fs12 mu">
              <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
              {`${SCAN[doc.scan_status] ?? humanize(doc.scan_status)} · private storage`}
            </div>
            <div className="r g6 fs12 mu">
              <Icon className="s14" d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
              Every decision is kept in the audit log
            </div>
          </div>
        </aside>
      </div>
      {asking ? (
        <Confirm
          title={asking === "approved" ? `Approve this ${type.toLowerCase()}?` : `Send this ${type.toLowerCase()} back?`}
          text={asking === "approved" ? (doc.type === "pod" ? "The load’s proof of delivery is accepted, and the load can be completed and invoiced." : "It counts toward the record’s compliance from now on.") : "The uploader is asked for a new copy. Say what is wrong so it can be fixed."}
          confirm={asking === "approved" ? "Approve" : "Send back"}
          destructive={asking === "rejected"}
          reason={asking === "rejected" ? { label: "What is wrong with it", required: true } : { label: "Note (optional)" }}
          onClose={() => setAsking(null)}
          run={({ reason }) => decide(asking, reason)}
        />
      ) : null}
    </div>
  );
}
