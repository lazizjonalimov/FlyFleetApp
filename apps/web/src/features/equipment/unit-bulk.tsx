"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { useAction } from "@/features/console/use-action";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { plural } from "@/lib/format/text";

export type BulkMode = "service" | "status" | "yard";
type Unit = { id: string; unit_number: string; status: string; terminal_id?: string | null };

const STATUSES: [value: string, label: string][] = [["active", "In service"], ["in_maintenance", "In the shop"], ["out_of_service", "Out of service"], ["retired", "Retired"]];

/**
 * One change for several trucks or trailers at once: schedule the same service on each, change their status, or
 * move them to a yard. Each unit is changed on its own, so one that can't be changed (a truck on a load can't be
 * retired) is named and the rest go through.
 */
export function UnitBulkDialog({ kind, mode, units, onClose }: { kind: "truck" | "trailer"; mode: BulkMode; units: Unit[]; onClose: () => void }) {
  const { me, I } = useConsole();
  const act = useAction();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.organization.timezone });
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(today);
  const [vendor, setVendor] = useState("");
  const [status, setStatus] = useState("in_maintenance");
  const [terminal, setTerminal] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const terminals = useQuery({
    queryKey: [me.organization.id, "terminals", "options"],
    queryFn: () => unwrap(api.GET("/api/v1/terminals", { params: { query: { status: "active", sort: "name", limit: 100 } } })),
    enabled: mode === "yard",
    staleTime: 60_000,
  });
  const noun = kind === "truck" ? "truck" : "trailer";
  const names = units.map((u) => u.unit_number).join(", ");

  const run = async () => {
    setProblem(null);
    if (mode === "service" && title.trim().length < 2) return setProblem("Say what the service is, like PM-B or annual inspection");
    if (mode === "yard" && !terminal) return setProblem("Choose the yard");
    setPending(true);
    const failed: string[] = [];
    for (const u of units) {
      try {
        if (mode === "service") {
          await unwrap(api.POST("/api/v1/maintenance/work-orders", {
            params: { header: { "idempotency-key": crypto.randomUUID() } },
            body: { ...(kind === "truck" ? { vehicle_id: u.id } : { trailer_id: u.id }), title: title.trim(), scheduled_for: when || null, vendor: vendor.trim() || null, priority: "normal", out_of_service: false } as never,
          }));
        } else if (mode === "status") {
          const path = { params: { path: { item_id: u.id } }, body: { status } as never };
          await unwrap(kind === "truck" ? api.PATCH("/api/v1/vehicles/{item_id}", path) : api.PATCH("/api/v1/trailers/{item_id}", path));
        } else {
          const path = { params: { path: { item_id: u.id } }, body: { terminal_id: terminal } as never };
          await unwrap(kind === "truck" ? api.PATCH("/api/v1/vehicles/{item_id}", path) : api.PATCH("/api/v1/trailers/{item_id}", path));
        }
      } catch (error) {
        failed.push(`${u.unit_number}: ${errorMessage(error)}`);
      }
    }
    const done = units.length - failed.length;
    const what = mode === "service" ? "service scheduled" : mode === "status" ? "status changed" : "moved";
    await act(async () => undefined, done ? `${plural(done, noun)} · ${what}` : undefined);
    setPending(false);
    if (failed.length) setProblem(`${failed.length} not changed. ${failed.join(" · ")}`);
    else onClose();
  };

  const heading = mode === "service" ? `Schedule service for ${plural(units.length, noun)}` : mode === "status" ? `Change the status of ${plural(units.length, noun)}` : `Move ${plural(units.length, noun)} to a yard`;
  return (
    <Dialog
      title={heading}
      sub={names}
      icon={mode === "service" ? I.wrench : mode === "yard" ? I.pin : I.pencil}
      width={500}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" onClick={() => void run()} disabled={pending}>{pending ? "Saving…" : mode === "service" ? "Schedule" : mode === "status" ? "Change status" : "Move"}</button>
        </>
      }
    >
      <Problem message={problem} />
      {mode === "service" ? (
        <>
          <label className="fld"><span className="lbl">Service</span><input className="inp" value={title} placeholder="PM-B service, annual inspection, tires" onChange={(e) => setTitle(e.currentTarget.value)} /></label>
          <div className="r g12">
            <label className="fld f1"><span className="lbl">On</span><input className="inp mono" type="date" value={when} onChange={(e) => setWhen(e.currentTarget.value)} /></label>
            <label className="fld f1"><span className="lbl">Shop</span><input className="inp" value={vendor} placeholder="Your shop or a vendor" onChange={(e) => setVendor(e.currentTarget.value)} /></label>
          </div>
          <span className="hint">One work order is opened for each {noun}, so each keeps its own costs and history.</span>
        </>
      ) : null}
      {mode === "status" ? (
        <div className="fld">
          <span className="lbl">New status</span>
          <div className="seg" role="radiogroup" aria-label="New status">
            {STATUSES.map(([v, l]) => (
              <button key={v} className={status === v ? "on" : ""} role="radio" aria-checked={status === v} onClick={() => setStatus(v)}>{l}</button>
            ))}
          </div>
          <span className="hint">A {noun} in the shop, out of service or retired can’t be dispatched. One on a load can’t be retired until the load is reassigned.</span>
        </div>
      ) : null}
      {mode === "yard" ? (
        <label className="fld">
          <span className="lbl">Yard</span>
          <select className="inp" value={terminal} onChange={(e) => setTerminal(e.currentTarget.value)}>
            <option value="">Choose a yard</option>
            {(terminals.data?.items ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {terminals.data && !terminals.data.items.length ? <span className="hint">Add your yards and terminals under Settings first.</span> : null}
        </label>
      ) : null}
    </Dialog>
  );
}
