"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { useAction } from "@/features/console/use-action";
import { useUpload } from "@/features/documents/use-upload";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import type { DocumentType } from "@/lib/upload";

type Detail = Schema<"OwnerDetail">;

/** Saves rows as a CSV file the browser downloads. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Change who owns one of this owner's units from a date: to another owner, or back to the carrier. */
export function TransferDialog({ owner, onClose }: { owner: Detail; onClose: () => void }) {
  const { me } = useConsole();
  const act = useAction();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.organization.timezone });
  const [unit, setUnit] = useState(owner.units[0] ? `${owner.units[0].kind}:${owner.units[0].unit_id}` : "");
  const [to, setTo] = useState("");
  const [pct, setPct] = useState("100");
  const [agreement, setAgreement] = useState("");
  const [from, setFrom] = useState(today);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const owners = useQuery({ queryKey: [me.organization.id, "owners", "pick"], queryFn: () => unwrap(api.GET("/api/v1/owners", { params: { query: { limit: 100 } } })) });
  const target = useQuery({ queryKey: [me.organization.id, "owners", to], queryFn: () => unwrap(api.GET("/api/v1/owners/{owner_id}", { params: { path: { owner_id: to } } })), enabled: !!to });
  const [kind, unitId] = unit.split(":");
  const save = async () => {
    setProblem(null);
    if (!unit) return setProblem("Pick a unit");
    if (reason.trim().length < 3) return setProblem("Say why ownership changes: a sale, a return, a correction");
    const share = Number(pct);
    if (!(share > 0 && share <= 100)) return setProblem("The new owner’s share is between 1 and 100%");
    if (to && !agreement) return setProblem("Choose the agreement the unit runs under with the new owner");
    const rows = to ? [{ owner_id: to, share_pct: String(share), agreement_id: agreement }, ...(share < 100 ? [{ owner_id: null, share_pct: String(100 - share), agreement_id: null }] : [])] : [{ owner_id: null, share_pct: "100", agreement_id: null }];
    try {
      await unwrap(api.POST("/api/v1/equipment/ownership-transfers", { body: { ...(kind === "truck" ? { vehicle_id: unitId } : { trailer_id: unitId }), effective_from: from, reason: reason.trim(), rows } }));
      await act(async () => undefined, "Ownership changed · the history is kept");
      onClose();
    } catch (error) {
      setProblem(errorMessage(error));
    }
  };
  return (
    <Dialog title="Transfer ownership" sub="Closes the current ownership on the day before and opens the new one, with the reason" onClose={onClose} width={520}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" onClick={() => void save()}>Transfer</button></>}>
      <Problem message={problem} />
      <label className="fld"><span className="lbl">Unit</span>
        <select className="inp" value={unit} onChange={(e) => setUnit(e.currentTarget.value)}>
          {owner.units.map((u) => <option key={u.unit_id} value={`${u.kind}:${u.unit_id}`}>{u.unit_number} · {Number(u.share_pct)}% today</option>)}
        </select>
      </label>
      <label className="fld"><span className="lbl">New owner</span>
        <select className="inp" value={to} onChange={(e) => { setTo(e.currentTarget.value); setAgreement(""); }}>
          <option value="">{me.organization.name} (the carrier)</option>
          {(owners.data?.items ?? []).filter((o) => o.id !== owner.id && o.status !== "ended").map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      {to ? (
        <div className="r g12">
          <label className="fld f1"><span className="lbl">Their share</span><input className="inp mono" value={pct} inputMode="decimal" onChange={(e) => setPct(e.currentTarget.value.replace(/[^0-9.]/g, ""))} /></label>
          <label className="fld f1"><span className="lbl">Agreement</span>
            <select className="inp" value={agreement} onChange={(e) => setAgreement(e.currentTarget.value)}>
              <option value="">Choose an agreement</option>
              {(target.data?.agreements ?? []).map((a) => <option key={a.id} value={a.id}>{a.kind.replace(/_/g, " ")}{a.owner_pct ? ` · ${Number(a.owner_pct)}%` : ""}</option>)}
            </select>
            {target.data && !target.data.agreements.length ? <span className="hint">Add an agreement on their record first</span> : null}
          </label>
        </div>
      ) : null}
      <label className="fld"><span className="lbl">From</span><input className="inp mono" type="date" value={from} onChange={(e) => setFrom(e.currentTarget.value)} /></label>
      <label className="fld"><span className="lbl">Reason</span><input className="inp" value={reason} placeholder="Sold to …, returned at lease end, correction" onChange={(e) => setReason(e.currentTarget.value)} /></label>
    </Dialog>
  );
}

const random = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 56]).join("");

/** Give someone a portal sign-in for this owner. The temporary password is shown once. */
export function InviteDialog({ owner, onClose }: { owner: Detail; onClose: () => void }) {
  const { notify } = useConsole();
  const act = useAction();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const save = async () => {
    setProblem(null);
    const password = random();
    try {
      const user = await unwrap(api.POST("/api/v1/owners/{owner_id}/portal-users", { params: { path: { owner_id: owner.id } }, body: { email: email.trim(), full_name: name.trim(), password } }));
      await act(async () => undefined);
      setMade(user.existing_account ? "" : password);
    } catch (error) {
      setProblem(errorMessage(error));
    }
  };
  if (made === "") {
    return (
      <Dialog title="Portal access added" sub={`For ${email}`} onClose={onClose} footer={<button className="btn pri" onClick={onClose}>Done</button>}>
        <p className="fs13">They already have a FlyFleet sign-in, so they keep their own password. They’ll see this owner’s portal the next time they sign in.</p>
      </Dialog>
    );
  }
  if (made) {
    return (
      <Dialog title="Portal sign-in created" sub={`For ${email}`} onClose={onClose}
        footer={<><button className="btn" onClick={() => { void navigator.clipboard?.writeText(made); notify("Temporary password copied"); }}>Copy password</button><button className="btn pri" onClick={onClose}>Done</button></>}>
        <p className="fs13">Give them this temporary password. It is shown only now. If they already had a FlyFleet sign-in, they keep their own password instead.</p>
        <div className="ro5"><span className="mono fs14 w6">{made}</span></div>
      </Dialog>
    );
  }
  return (
    <Dialog title="Invite someone to the portal" sub={`They see only what ${owner.name} owns, with the permissions set on this tab`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" onClick={() => void save()} disabled={!email.trim() || !name.trim()}>Create sign-in</button></>}>
      <Problem message={problem} />
      <label className="fld"><span className="lbl">Name</span><input className="inp" value={name} onChange={(e) => setName(e.currentTarget.value)} /></label>
      <label className="fld"><span className="lbl">Email</span><input className="inp" type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} placeholder="name@example.com" /></label>
    </Dialog>
  );
}

const OWNER_DOCS: [DocumentType, string][] = [["lease", "Signed lease or rental agreement"], ["w9", "W-9"], ["title", "Title or bill of sale"], ["insurance", "Certificate of insurance"], ["ach_authorization", "ACH authorization"], ["other", "Something else"]];

/** Upload a document to the owner's file: pick what it is, then the file. */
export function UploadDialog({ owner, onClose }: { owner: Detail; onClose: () => void }) {
  const upload = useUpload();
  return (
    <Dialog title="Add a document" sub={`To ${owner.name}’s file`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Cancel</button>}>
      <div className="c g6">
        {OWNER_DOCS.map(([type, label]) => (
          <button key={type} className="btn" style={{ justifyContent: "flex-start" }} onClick={() => { onClose(); void upload({ type, entityType: "owner", entityId: owner.id, label }); }}>{label}</button>
        ))}
      </div>
    </Dialog>
  );
}
