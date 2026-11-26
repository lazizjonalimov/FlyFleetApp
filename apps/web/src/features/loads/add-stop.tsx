"use client";

import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { useAction } from "@/features/console/use-action";
import { api, unwrap } from "@/lib/api/client";
import { fromLocalInput, timeZoneLabel } from "@/lib/format/dates";
import { place } from "@/lib/format/text";
import { US_STATES } from "@/lib/reference/states";
import type { LoadDetail, Stop } from "./load-data";

const LABEL = { pickup: "Pickup", delivery: "Delivery", fuel_scale: "Fuel / scale" } as const;
const keep = (stop: Stop) => ({
  type: stop.type, name: stop.name, address: stop.address, city: stop.city, state: stop.state, postal_code: stop.postal_code,
  contact_name: stop.contact_name, contact_phone: stop.contact_phone, reference: stop.reference, instructions: stop.instructions,
  appt_start: stop.appt_start, appt_end: stop.appt_end, handling: stop.handling,
});

/**
 * Adds a stop to a load's route before it is dispatched: where it goes in the order, what it is and its
 * appointment. The whole route is saved through the same rules as the new-load form.
 */
export function AddStop({ load, onClose }: { load: LoadDetail; onClose: () => void }) {
  const { me } = useConsole();
  const act = useAction();
  const zone = me.organization.timezone;
  const last = load.stops.length;
  const [type, setType] = useState<"pickup" | "delivery" | "fuel_scale">("delivery");
  const [at, setAt] = useState(Math.max(0, last - 1));
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const save = async () => {
    if (!city.trim()) return setProblem("Where is the stop? A city is needed.");
    const appt = start ? fromLocalInput(start, zone) : null;
    const until = end ? fromLocalInput(end, zone) : null;
    if (until && appt && until < appt) return setProblem("The appointment can’t end before it starts.");
    setPending(true);
    setProblem(null);
    const stops = load.stops.map(keep);
    stops.splice(at, 0, { type, name: name.trim() || null, address: address.trim() || null, city: city.trim(), state: state || null, postal_code: null, contact_name: null, contact_phone: null, reference: null, instructions: null, appt_start: appt, appt_end: until, handling: "live" });
    const done = await act(() => unwrap(api.PUT("/api/v1/loads/{load_id}/stops", { params: { path: { load_id: load.id } }, body: { version: load.version, stops } })), `${LABEL[type]} added to ${load.load_number}${load.miles && load.stops.length >= 2 ? " · about 35 mi more" : ""}`);
    setPending(false);
    if (done) onClose();
  };

  return (
    <Dialog
      title="Add stop"
      sub={`${load.load_number} · ${place(load.origin_city, load.origin_state)} → ${place(load.destination_city, load.destination_state)} · times in ${timeZoneLabel(zone)}`}
      icon={I.pin}
      width={540}
      onClose={() => !pending && onClose()}
      footer={<><span className="sp"></span><button className="btn" onClick={onClose} disabled={pending}>Cancel</button><button className="btn pri" onClick={() => void save()} disabled={pending}>{pending ? "Adding…" : "Add stop"}</button></>}
    >
      <Problem message={problem} />
      <div className="r g8">
        <div className="seg" role="radiogroup" aria-label="Kind of stop">
          {(["pickup", "delivery", "fuel_scale"] as const).map((each) => (
            <button key={each} role="radio" aria-checked={type === each} className={type === each ? "on" : ""} onClick={() => setType(each)}>{LABEL[each]}</button>
          ))}
        </div>
        <label className="c g4 f1">
          <span className="fs12 w5">Position</span>
          <select className="inp" value={at} onChange={(e) => setAt(Number(e.target.value))} aria-label="Position">
            {load.stops.map((stop, i) => (
              <option key={stop.id} value={i}>{`Before ${i + 1}. ${stop.name || place(stop.city, stop.state)}`}</option>
            ))}
            <option value={last}>At the end</option>
          </select>
        </label>
      </div>
      <label className="c g4">
        <span className="fs12 w5">Name</span>
        <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="Facility or company" aria-label="Name" maxLength={160} />
      </label>
      <label className="c g4">
        <span className="fs12 w5">Address</span>
        <input className="inp" value={address} onChange={(e) => setAddress(e.target.value)} aria-label="Address" maxLength={300} />
      </label>
      <div className="r g8">
        <label className="c g4 f1">
          <span className="fs12 w5">City</span>
          <input className="inp" value={city} onChange={(e) => setCity(e.target.value)} aria-label="City" maxLength={80} />
        </label>
        <label className="c g4" style={{ width: "180px" }}>
          <span className="fs12 w5">State</span>
          <select className="inp" value={state} onChange={(e) => setState(e.target.value)} aria-label="State">
            <option value="">—</option>
            {US_STATES.map(([code, label]) => <option key={code} value={code}>{`${code} · ${label}`}</option>)}
          </select>
        </label>
      </div>
      <div className="r g8">
        <label className="c g4 f1">
          <span className="fs12 w5">Appointment</span>
          <input className="inp" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Appointment" />
        </label>
        <label className="c g4 f1">
          <span className="fs12 w5">Until (a window)</span>
          <input className="inp" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Until" />
        </label>
      </div>
    </Dialog>
  );
}
