"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { ACCEPT, checkFile, uploadDocument, type DocumentType, type EntityType } from "@/lib/upload";
import { DOCUMENT_TYPES } from "./documents-screen";

type Target = "none" | "load" | "driver" | "vehicle" | "trailer" | "customer" | "organization";
const TARGETS: [Target, string][] = [["load", "A load"], ["driver", "A driver"], ["vehicle", "A truck"], ["trailer", "A trailer"], ["customer", "A customer"], ["organization", "The company"], ["none", "Nothing yet"]];
// What each type of document is usually filed with.
const USUAL: Record<string, Target> = { bol: "load", pod: "load", rate_confirmation: "load", receipt: "load", license: "driver", medical: "driver", mvr: "driver", clearinghouse: "driver", road_test: "driver", drug_test: "driver", registration: "vehicle", inspection: "vehicle", cab_card: "vehicle", title: "vehicle", authority: "organization", ucr: "organization", ifta_license: "organization" };

type Option = { id: string; label: string; sub?: string };

/** Finds the record to file a document with: a load by its number, a driver by name, a unit by its number. */
function useRecords(target: Target, q: string) {
  const { me } = useConsole();
  const text = q.trim();
  return useQuery({
    queryKey: [me.organization.id, "upload-target", target, text],
    enabled: target !== "none" && target !== "organization",
    staleTime: 30_000,
    queryFn: async (): Promise<Option[]> => {
      const query = { q: text || undefined, limit: 8 };
      if (target === "load") return (await unwrap(api.GET("/api/v1/loads", { params: { query: { ...query, sort: "-pickup_at" } } }))).items.map((l) => ({ id: l.id, label: l.load_number, sub: `${l.origin_city ?? "—"} → ${l.destination_city ?? "—"} · ${l.customer.name}` }));
      if (target === "driver") return (await unwrap(api.GET("/api/v1/drivers", { params: { query } }))).items.map((d) => ({ id: d.id, label: d.full_name, sub: d.employee_number ?? undefined }));
      if (target === "vehicle") return (await unwrap(api.GET("/api/v1/vehicles", { params: { query } }))).items.map((v) => ({ id: v.id, label: v.unit_number }));
      if (target === "trailer") return (await unwrap(api.GET("/api/v1/trailers", { params: { query } }))).items.map((t) => ({ id: t.id, label: t.unit_number }));
      return (await unwrap(api.GET("/api/v1/customers", { params: { query } }))).items.map((c) => ({ id: c.id, label: c.name }));
    },
  });
}

/** Uploads a document from the inbox: the file, what it is, what it is filed with, and when it runs out. */
export function UploadDialog({ onClose }: { onClose: () => void }) {
  const { me, notify } = useConsole();
  const id = useId();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<DocumentType>("bol");
  const [target, setTarget] = useState<Target>("load");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Option | null>(null);
  const [expires, setExpires] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const records = useRecords(target, q);
  const chooseType = (next: DocumentType) => {
    setType(next);
    const usual = USUAL[next];
    if (usual && usual !== target) {
      setTarget(usual);
      setPicked(null);
      setQ("");
    }
  };

  async function go() {
    if (!file) return setError("Choose the file");
    const problem = checkFile(file);
    if (problem) return setError(problem);
    if (target !== "none" && target !== "organization" && !picked) return setError("Choose the record to file it with");
    setPending(true);
    setError(null);
    try {
      const entityType: EntityType | undefined = target === "none" ? undefined : target;
      const entityId = target === "organization" ? me.organization.id : picked?.id;
      const doc = await uploadDocument({ file, type, entityType, entityId, expiresOn: expires || null });
      await queryClient.invalidateQueries({ queryKey: [me.organization.id] });
      notify(doc.state === "needs_review" ? `${DOCUMENT_TYPES[type] ?? "Document"} uploaded · waiting for review` : `${DOCUMENT_TYPES[type] ?? "Document"} uploaded`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  return (
    <Dialog title="Upload a document" sub="Stored privately, read automatically when it can be, and reviewed before it counts" icon={I.upload} width={520} onClose={() => !pending && onClose()}
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
        <span className="fs12 mu">PDF, JPEG, PNG or WebP, up to 15 MB</span>
      </div>
      <div className="fld">
        <label htmlFor={`${id}-type`}>Type</label>
        <select id={`${id}-type`} className="inp" value={type} onChange={(e) => chooseType(e.target.value as DocumentType)}>
          {Object.entries(DOCUMENT_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="fld">
        <label htmlFor={`${id}-target`}>File it with</label>
        <select id={`${id}-target`} className="inp" value={target} onChange={(e) => { setTarget(e.target.value as Target); setPicked(null); setQ(""); }}>
          {TARGETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {target !== "none" && target !== "organization" ? (
        <div className="fld">
          <label htmlFor={`${id}-find`}>{TARGETS.find(([value]) => value === target)![1].replace(/^An? /, "").replace(/^\w/, (c) => c.toUpperCase())}</label>
          {picked ? (
            <div className="r g8">
              <span className="chip">{picked.label}</span>
              <button className="lnk" onClick={() => setPicked(null)}>Change</button>
            </div>
          ) : (
            <>
              <input id={`${id}-find`} className="inp" value={q} placeholder="Search" autoComplete="off" onChange={(e) => setQ(e.target.value)} />
              <div className="c" role="listbox" aria-label="Records" style={{ border: "1px solid var(--bd)", borderRadius: "6px", maxHeight: "180px", overflow: "auto" }}>
                {records.isPending ? <span className="fs12 mu" style={{ padding: "8px 10px" }}>Searching…</span> : null}
                {records.data && !records.data.length ? <span className="fs12 mu" style={{ padding: "8px 10px" }}>Nothing matches</span> : null}
                {(records.data ?? []).map((o) => (
                  <button key={o.id} role="option" aria-selected="false" className="ddi" style={{ height: "auto", padding: "6px 10px", justifyContent: "flex-start" }} onClick={() => setPicked(o)}>
                    <span className="fs13 w5">{o.label}</span>
                    {o.sub ? <span className="fs12 mu ell">{` · ${o.sub}`}</span> : null}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
      <div className="fld">
        <label htmlFor={`${id}-exp`}>Expires</label>
        <input id={`${id}-exp`} className="inp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        <span className="fs12 mu">For licences, medical cards, insurance and registrations. Leave it empty when the paper is read: the date read from it is used.</span>
      </div>
    </Dialog>
  );
}
