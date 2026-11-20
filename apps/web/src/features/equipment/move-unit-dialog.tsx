"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { formatDate } from "@/lib/format/dates";

type Preview = Schema<"TransferPreview">;

/**
 * Move a truck or trailer to another company of the account: choose where and from when, read what the move
 * changes, then confirm. Nothing happens until the confirm, and the confirm checks everything again.
 */
export function MoveUnitDialog({ kind, unitId, unitNumber, onClose }: { kind: "vehicle" | "trailer"; unitId: string; unitNumber: string; onClose: () => void }) {
  const { me, I, notify } = useConsole();
  const router = useRouter();
  const label = kind === "vehicle" ? "truck" : "trailer";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.organization.timezone });
  // The account owner, or a Main Admin in both companies: the API decides, and says so when it isn't allowed.
  const targets = me.memberships.filter((m) => m.status === "active" && m.id !== me.organization.id && (me.account.is_owner || m.role === "owner"));
  const [destination, setDestination] = useState(targets[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [number, setNumber] = useState("");
  const [team, setTeam] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const company = targets.find((t) => t.id === destination);

  const body = () => ({ destination_organization_id: destination, effective_on: date, unit_number: number.trim() || null, destination_team_id: team || null });
  const look = async () => {
    setPending(true);
    setProblem(null);
    try {
      const result = kind === "vehicle"
        ? await unwrap(api.POST("/api/v1/vehicles/{unit_id}/transfer-preview", { params: { path: { unit_id: unitId } }, body: body() }))
        : await unwrap(api.POST("/api/v1/trailers/{unit_id}/transfer-preview", { params: { path: { unit_id: unitId } }, body: body() }));
      setPreview(result);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  const confirm = async () => {
    setPending(true);
    setProblem(null);
    try {
      const done = kind === "vehicle"
        ? await unwrap(api.POST("/api/v1/vehicles/{unit_id}/transfer", { params: { path: { unit_id: unitId } }, body: body() }))
        : await unwrap(api.POST("/api/v1/trailers/{unit_id}/transfer", { params: { path: { unit_id: unitId } }, body: body() }));
      notify(`${unitNumber} moved to ${company?.name ?? "the other company"} · kept here as transferred`);
      onClose();
      router.push(`/${company!.slug}/equipment/${kind === "vehicle" ? "trucks" : "trailers"}/${done.destination_unit_id}`);
    } catch (error) {
      setProblem(errorMessage(error));
      setPending(false);
    }
  };

  return (
    <Dialog onClose={onClose} title={`Move ${unitNumber} to another company`} icon={I.truck} width={600}
      sub={preview ? `Review what changes. Nothing has moved yet.` : `The ${label} stays here as “transferred”, read-only with all its history, and the other company gets a new record of it.`}
      footer={preview ? (
        <>
          <button className="btn" onClick={() => setPreview(null)} disabled={pending}>Back</button>
          <span className="sp"></span>
          <button className="btn" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn pri" disabled={pending || !preview.can_confirm} onClick={() => void confirm()}>{pending ? "Moving…" : `Move ${label} to ${preview.destination.name}`}</button>
        </>
      ) : (
        <>
          <span className="sp"></span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={pending || !destination} onClick={() => void look()}>{pending ? "Checking…" : "Preview the move"}</button>
        </>
      )}>
      <Problem message={problem} />
      {!preview ? (
        targets.length ? (
          <div className="c g12">
            <div className="fld">
              <label htmlFor="mv-dest">Move to</label>
              <select id="mv-dest" className="inp" value={destination} onChange={(e) => setDestination(e.target.value)}>
                {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="r g12">
              <div className="fld f1"><label htmlFor="mv-date">From</label><input id="mv-date" type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="fld f1"><label htmlFor="mv-num">Number there</label><input id="mv-num" className="inp" value={number} placeholder={unitNumber} onChange={(e) => setNumber(e.target.value)} /></div>
            </div>
            <p className="fs12 mu">A VIN is active in only one company of an account at a time. Nothing financial moves: statements, invoices and payments stay where they were made.</p>
          </div>
        ) : (
          <p className="fs13 mu">There is no other company you can move it to. Moving a unit takes the account owner, or a Main Admin in both companies.</p>
        )
      ) : (
        <div className="c g12">
          {preview.blockers.length ? (
            <div className="banner" data-k="bad" role="alert">
              <div className="f1 c g4">
                <b>It can’t move yet</b>
                {preview.blockers.map((b) => <span key={b.message}>{b.message}</span>)}
              </div>
            </div>
          ) : null}
          <div className="fs13"><b>{preview.unit_number}</b> from <b>{preview.source.name}</b> to <b>{preview.destination.name}</b>, from {formatDate(preview.effective_on)}{preview.destination_unit_number !== preview.unit_number ? ` as ${preview.destination_unit_number}` : ""}.</div>
          {preview.team ? (
            <section className="c g4">
              <b className="fs13">Dispatch team</b>
              <span className="fs13">It leaves <b>{preview.team.name}</b> and its dispatchers’ lists.</span>
              {preview.team.dispatchers.filter((d) => !d.has_access_in_destination).map((d) => (
                <span key={d.user_id} className="fs12 mu">{d.name} has no access to {preview.destination.name}, so they will not see it there.</span>
              ))}
            </section>
          ) : null}
          {preview.driver_assignment ? (
            <section className="c g4"><b className="fs13">Driver</b><span className="fs13">{`${preview.driver_assignment.driver}${preview.driver_assignment.co_driver ? ` and ${preview.driver_assignment.co_driver}` : ""} no longer drive it. The seat assignment ends ${formatDate(preview.effective_on)}.`}</span></section>
          ) : null}
          {preview.ownership.length ? (
            <section className="c g4"><b className="fs13">Ownership</b>{preview.ownership.map((o) => <span key={o.owner} className="fs13">{`${o.owner} (${o.share_pct}%${o.agreement ? ` · ${o.agreement}` : ""}): the agreement ends. It is owned outright there until set up again.`}</span>)}</section>
          ) : null}
          {preview.open_work_orders.length ? (
            <section className="c g4"><b className="fs13">Open work orders</b>{preview.open_work_orders.map((w) => <span key={w.id} className="fs13">{`${w.number} · ${w.title} · stays with ${preview.source.name}`}</span>)}</section>
          ) : null}
          <section className="c g4">
            <b className="fs13">Documents copied</b>
            {preview.documents.length ? preview.documents.map((d) => <span key={d.id} className="fs13">{`${d.type.replace(/_/g, " ")} · ${d.filename}${d.expires_on ? ` · expires ${formatDate(d.expires_on)}` : ""}`}</span>) : <span className="fs13 mu">No current documents.</span>}
          </section>
          {kind === "vehicle" ? (
            <div className="fld">
              <label htmlFor="mv-team">Dispatch team in {preview.destination.name}</label>
              <select id="mv-team" className="inp" value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="">No team</option>
                {preview.destination_teams.map((t) => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}
              </select>
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
