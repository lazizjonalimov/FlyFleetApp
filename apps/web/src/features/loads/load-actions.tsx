"use client";

import { clsx } from "clsx";
import { useState, type ReactNode } from "react";
import { Confirm } from "@/components/feedback/dialog";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { errorMessage } from "@/lib/api/errors";
import { timeZoneLabel } from "@/lib/format/dates";
import { place } from "@/lib/format/text";
import { ACTIONS, currentStop, useLoadChanges, type Action, type LoadDetail } from "./load-data";

export type LoadActionItem = { key: string; label: string; destructive?: boolean };

/**
 * What can happen to a load next, and the way to make it happen. The list comes from `allowed_actions`, which
 * the API works out from the load's state and the person's role, so nothing is offered that would be refused.
 * Actions that need a reason or a time ask for it first; `dialog` is that question.
 */
export function useLoadActions(load: LoadDetail | undefined): { items: LoadActionItem[]; has: (key: string) => boolean; start: (key: string) => void; dialog: ReactNode } {
  const { me, set, notify } = useConsole();
  const changes = useLoadChanges();
  const [asking, setAsking] = useState<string | null>(null);
  if (!load) return { items: [], has: () => false, start: () => {}, dialog: null };

  const allowed = new Set(load.allowed_actions);
  const stop = currentStop(load);
  const zone = me.organization.timezone;
  const said = (action: string) => (saved: LoadDetail) => notify(`${saved.load_number} ${ACTIONS[action]?.verb ?? "updated"}`);

  const labels: [key: string, label: string, destructive?: boolean][] = [
    ["mark_ready", "Mark ready"],
    ["assign", "Assign driver"],
    ["dispatch", "Dispatch"],
    ["arrive", stop ? `Arrived at stop ${stop.index + 1}` : "Arrived"],
    ["depart", stop ? `Departed stop ${stop.index + 1}` : "Departed"],
    ["approve_pod", "Approve POD"],
    ["reject_pod", "Reject POD", true],
    ["release", "Release hold"],
    ["reassign", "Change driver or equipment"],
    ["unassign", "Unassign"],
    ["hold", "Put on hold"],
    ["cancel", "Cancel load", true],
  ];
  const items = labels.filter(([key]) => allowed.has(key) && (stop || (key !== "arrive" && key !== "depart"))).map(([key, label, destructive]) => ({ key, label, destructive }));

  const start = (key: string) => {
    if (!allowed.has(key)) return;
    if (key === "assign" || key === "reassign") return set({ screen: "dispatch", panel: "assign", assignLoad: load.id, drawer: null, overlay: "none", modal: "none" });
    if (key === "mark_ready" || key === "release") return void changes.transition(load, key).then(said(key), (error) => notify(errorMessage(error), true));
    setAsking(key);
  };

  let dialog: ReactNode = null;
  if (asking === "unassign") {
    dialog = (
      <Confirm
        title={`Unassign ${load.load_number}?`}
        text={`${load.assignment?.driver.name ?? "The driver"} and the equipment are freed, and the load goes back to planned.`}
        confirm="Unassign"
        reason={{ label: "Reason (optional)" }}
        onClose={() => setAsking(null)}
        run={({ reason }) => changes.unassign(load, reason).then((saved) => notify(`${saved.load_number} is back to planned`))}
      />
    );
  } else if (asking === "arrive" || asking === "depart") {
    const where = stop ? [stop.stop.name, place(stop.stop.city, stop.stop.state)].filter(Boolean).join(", ") : "";
    dialog = (
      <Confirm
        title={`${asking === "arrive" ? "Arrived at" : "Departed from"} stop ${stop ? stop.index + 1 : ""}`}
        text={stop ? `${stop.stop.type === "pickup" ? "Pickup" : "Delivery"}: ${where}` : undefined}
        confirm={asking === "arrive" ? "Record arrival" : "Record departure"}
        when={{ label: `When (${timeZoneLabel(zone)})`, hint: "Leave empty for now. Fill it in when recording it later." }}
        reason={{ label: "Note (optional)" }}
        onClose={() => setAsking(null)}
        run={({ reason, when }) => changes.transition(load, asking, { reason, when }).then(said(asking))}
      />
    );
  } else if (asking && ACTIONS[asking]) {
    const info = ACTIONS[asking]!;
    dialog = (
      <Confirm
        title={`${info.label}: ${load.load_number}?`}
        text={info.text}
        confirm={info.label}
        destructive={info.destructive}
        reason={info.reason ? { label: "Reason", required: info.reason === "required", placeholder: asking === "reject_pod" ? "What is wrong with it, so it can be fixed" : undefined } : undefined}
        onClose={() => setAsking(null)}
        run={({ reason }) => changes.transition(load, asking as Action, { reason }).then(said(asking))}
      />
    );
  }

  return { items, has: (key) => allowed.has(key), start, dialog };
}

/** "Update status": the load's next steps in a menu. `up` opens it above the button, for the foot of a drawer. */
export function StatusMenu({ items, start, up }: { items: LoadActionItem[]; start: (key: string) => void; up?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mwrap">
      {open ? <div style={{ position: "fixed", inset: "0", zIndex: 42 }} onClick={() => setOpen(false)}></div> : null}
      <button className="btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} disabled={!items.length} title={items.length ? undefined : "Nothing can change on this load right now"}>
        Update status
        <Icon className="s12" d="M6 9l6 6 6-6" />
      </button>
      {open ? (
        <div className="menu" role="menu" aria-label="Update status" style={up ? { top: "auto", bottom: "calc(100% + 8px)", width: "260px" } : { width: "260px" }}>
          {items.map((item) => (
            <button
              key={item.key}
              className={clsx("menui")}
              role="menuitem"
              style={item.destructive ? { color: "#B42318" } : undefined}
              onClick={() => {
                setOpen(false);
                start(item.key);
              }}
            >
              <span className="f1">{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
