"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { combo, type ComboOption } from "@/components/forms/combo";
import { Combobox } from "@/components/forms/combobox";
import { useConsole } from "@/features/console/console-provider";
import { useAction } from "@/features/console/use-action";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";

type Seat = Schema<"SeatOut">;

/**
 * Who drives a truck from a date: a driver and, for a team, a co-driver and how they split pay. Separate from who
 * owns it. A driver sits in one truck at a time, so picking someone already in another truck moves them here.
 */
export function SeatDialog({ vehicleId, unitNumber, seat, onClose }: { vehicleId: string; unitNumber: string; seat: Seat | null; onClose: () => void }) {
  const { me, I } = useConsole();
  const act = useAction();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.organization.timezone });
  const [driver, setDriver] = useState(seat?.driver.id ?? "");
  const [team, setTeam] = useState(!!seat?.co_driver);
  const [co, setCo] = useState(seat?.co_driver?.id ?? "");
  const [split, setSplit] = useState(seat?.team_split === "miles" ? "miles" : "equal");
  const [from, setFrom] = useState(today);
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const drivers = useQuery({
    queryKey: [me.organization.id, "drivers", "seat-options"],
    queryFn: () => unwrap(api.GET("/api/v1/drivers", { params: { query: { status: "active", sort: "name", limit: 100 } } })),
  });
  const options: ComboOption[] = (drivers.data?.items ?? []).map((d) => ({
    v: d.id,
    l: `${d.first_name} ${d.last_name}`,
    ab: d.unit && d.unit.vehicle_id !== vehicleId ? `In ${d.unit.unit_number}` : "",
  }));
  const state = { open, q, setOpen, setQ };
  const moving = [driver, team ? co : ""].map((id) => drivers.data?.items.find((d) => d.id === id)).filter((d) => d?.unit && d.unit.vehicle_id !== vehicleId);
  const driverField = combo(state, { k: "driver", l: "Driver", value: driver, options: options.filter((o) => o.v !== co), onPick: setDriver, placeholder: "Choose a driver", head: "Active drivers", search: true, qph: "Search drivers" });
  const coField = combo(state, { k: "co", l: "Co-driver", value: co, options: options.filter((o) => o.v !== driver), onPick: setCo, placeholder: "Choose the second driver", head: "Active drivers", search: true, qph: "Search drivers" });

  const save = async () => {
    setProblem(null);
    if (!driver) return setProblem("Choose who drives it");
    if (team && !co) return setProblem("Choose the second driver, or turn off Team");
    setPending(true);
    try {
      await unwrap(api.PUT("/api/v1/vehicles/{vehicle_id}/seat", {
        params: { path: { vehicle_id: vehicleId } },
        body: { driver_id: driver, co_driver_id: team ? co : null, team_split: split as "equal" | "miles", effective_from: from || null, reason: reason.trim() || null },
      }));
      await act(async () => undefined, `${unitNumber}: drivers set · the history is kept`);
      onClose();
    } catch (error) {
      setProblem(errorMessage(error));
      setPending(false);
    }
  };
  const clear = async () => {
    setProblem(null);
    setPending(true);
    try {
      await unwrap(api.DELETE("/api/v1/vehicles/{vehicle_id}/seat", { params: { path: { vehicle_id: vehicleId } } }));
      await act(async () => undefined, `Nobody drives ${unitNumber} from today`);
      onClose();
    } catch (error) {
      setProblem(errorMessage(error));
      setPending(false);
    }
  };

  return (
    <Dialog
      title={`Assign a driver to ${unitNumber}`}
      sub="Who drives it is set here and in Dispatch, separately from who owns it"
      icon={I.user}
      width={520}
      onClose={onClose}
      footer={
        <>
          {seat ? <button className="btn ghost" onClick={() => void clear()} disabled={pending}>Take drivers off</button> : null}
          <span className="sp"></span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </>
      }
    >
      <Problem message={problem} />
      <div className="fld">
        <span className="lbl">Driver</span>
        <Combobox f={driverField} />
      </div>
      <label className="r g8 fs13" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={team} onChange={(e) => setTeam(e.currentTarget.checked)} />
        <span>Team truck · two drivers, one truck</span>
      </label>
      {team ? (
        <>
          <div className="fld">
            <span className="lbl">Co-driver</span>
            <Combobox f={coField} />
          </div>
          <div className="fld">
            <span className="lbl">How they split pay</span>
            <div className="seg" role="radiogroup" aria-label="How they split pay">
              {[["equal", "50/50 on team miles"], ["miles", "By the miles each one drove"]].map(([v, l]) => (
                <button key={v} className={split === v ? "on" : ""} role="radio" aria-checked={split === v} onClick={() => setSplit(v!)}>{l}</button>
              ))}
            </div>
            <span className="hint">Each driver logs their own hours; dispatch sees one truck, two drivers.</span>
          </div>
        </>
      ) : null}
      {moving.length ? (
        <div className="banner" data-k="info">
          <span className="f1 fs12">{moving.map((d) => `${d!.first_name} ${d!.last_name} moves from ${d!.unit!.unit_number}`).join(" · ")}. A driver sits in one truck at a time.</span>
        </div>
      ) : null}
      <div className="r g12">
        <label className="fld f1"><span className="lbl">From</span><input className="inp mono" type="date" value={from} onChange={(e) => setFrom(e.currentTarget.value)} /></label>
        <label className="fld f1"><span className="lbl">Reason</span><input className="inp" value={reason} placeholder="New hire, swap, back from leave" onChange={(e) => setReason(e.currentTarget.value)} /></label>
      </div>
    </Dialog>
  );
}
