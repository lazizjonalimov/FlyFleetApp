"use client";

import { useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { loadLabel } from "@/features/fleet/labels";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { plural } from "@/lib/format/text";
import type { LoadListItem } from "./load-data";

type Change = { action: "mark_ready" | "hold" | "release" | "cancel"; label: string; done: string; from: readonly string[]; permission: string; reason: boolean; text: string };
// The changes that make sense for several loads at once, each from the states the lifecycle allows it.
const CHANGES: Change[] = [
  { action: "mark_ready", label: "Mark ready", done: "marked ready", from: ["draft"], permission: "loads.update", reason: false, text: "Drafts become planned and are offered for dispatch" },
  { action: "hold", label: "Put on hold", done: "put on hold", from: ["planned", "assigned", "dispatched"], permission: "loads.cancel", reason: true, text: "Held loads keep their driver and equipment" },
  { action: "release", label: "Release hold", done: "released", from: ["on_hold"], permission: "loads.cancel", reason: false, text: "Each goes back to where it was before it was held" },
  { action: "cancel", label: "Cancel", done: "cancelled", from: ["draft", "planned", "assigned", "dispatched", "on_hold"], permission: "loads.cancel", reason: true, text: "Cancelled loads let go of their driver and equipment" },
];
type Result = { number: string; ok: boolean; why?: string };

/**
 * Changes the status of the selected loads in one go. Each load goes through the same lifecycle rules as on its
 * own; a load the change doesn't apply to is left as it is, and the result says which and why.
 */
export function BulkStatus({ loads, onClose }: { loads: LoadListItem[]; onClose: () => void }) {
  const { me, can, notify } = useConsole();
  const client = useQueryClient();
  const options = CHANGES.filter((change) => can(change.permission));
  const [choice, setChoice] = useState(options.find((change) => loads.some((l) => change.from.includes(l.status)))?.action ?? options[0]?.action ?? null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const change = options.find((each) => each.action === choice) ?? null;
  const fits = change ? loads.filter((l) => change.from.includes(l.status)) : [];

  const apply = async () => {
    if (!change || !fits.length) return;
    if (change.reason && !reason.trim()) return setProblem("Say why. It goes on each load’s history.");
    setPending(true);
    setProblem(null);
    const out: Result[] = [];
    for (const load of loads) {
      if (!change.from.includes(load.status)) {
        out.push({ number: load.load_number, ok: false, why: `is ${loadLabel(load.status).toLowerCase()}` });
        continue;
      }
      try {
        await unwrap(api.POST("/api/v1/loads/{load_id}/transitions", { params: { path: { load_id: load.id } }, body: { action: change.action, version: load.version, ...(change.reason ? { reason: reason.trim() } : {}) } }));
        out.push({ number: load.load_number, ok: true });
      } catch (error) {
        out.push({ number: load.load_number, ok: false, why: errorMessage(error) });
      }
    }
    await client.invalidateQueries({ queryKey: [me.organization.id] });
    const done = out.filter((r) => r.ok).length;
    if (done) notify(`${plural(done, "load")} ${change.done}`);
    setResults(out);
    setPending(false);
  };

  if (results && change) {
    const done = results.filter((r) => r.ok);
    const left = results.filter((r) => !r.ok);
    return (
      <Dialog title={done.length ? `${plural(done.length, "load")} ${change.done}` : "Nothing changed"} sub={left.length ? `${plural(left.length, "load")} left as they were` : "Every selected load"} icon={I.loads} width={520} onClose={onClose} footer={<><span className="sp"></span><button className="btn pri" onClick={onClose}>Done</button></>}>
        <div className="c g4" aria-label="What happened to each load">
          {results.map((r) => (
            <div key={r.number} className="r g8 fs13">
              <Icon className={clsx("s14", r.ok ? "ok" : "mu")} d={r.ok ? "M5 12l5 5 9-10" : "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2"} />
              <span className="mono w5">{r.number}</span>
              <span className={r.ok ? "" : "mu"}>{r.ok ? change.done : `not changed: ${r.why}`}</span>
            </div>
          ))}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Change status"
      sub={`${plural(loads.length, "load")} selected · each follows the same rules as on its own`}
      icon={I.loads}
      width={520}
      onClose={() => !pending && onClose()}
      footer={
        <>
          <span className="fs12 mu">{change ? `Applies to ${fits.length} of ${loads.length}` : ""}</span>
          <span className="sp"></span>
          <button className="btn" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn pri" onClick={() => void apply()} disabled={pending || !fits.length}>{pending ? "Changing…" : change ? `${change.label} · ${plural(fits.length, "load")}` : "Change"}</button>
        </>
      }
    >
      <Problem message={problem} />
      {!options.length ? <p className="fs13 mu">Your role can’t change the status of loads.</p> : null}
      <div className="c g6" role="radiogroup" aria-label="New status">
        {options.map((each) => {
          const n = loads.filter((l) => each.from.includes(l.status)).length;
          return (
            <button key={each.action} className="opt" style={{ width: "100%", textAlign: "left", background: "var(--sf)", cursor: n ? "pointer" : "default", opacity: n ? 1 : 0.55, borderColor: choice === each.action ? "var(--pri)" : undefined }} role="radio" aria-checked={choice === each.action} onClick={() => setChoice(each.action)} disabled={!n}>
              <span className={clsx("radio", choice === each.action && "on")} style={{ marginTop: "2px" }}></span>
              <span className="f1 c" style={{ alignItems: "flex-start" }}>
                <span className="fs13 w5">{each.label}</span>
                <span className="fs12 mu">{each.text}</span>
              </span>
              <span className="fs12 mu nw">{n ? `${n} of ${loads.length}` : "None of these"}</span>
            </button>
          );
        })}
      </div>
      {change?.reason ? (
        <label className="c g4">
          <span className="fs12 w5">Why</span>
          <input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={change.action === "hold" ? "Customer hold, waiting on a reschedule…" : "Customer cancelled…"} aria-label="Why" maxLength={500} />
        </label>
      ) : null}
    </Dialog>
  );
}
