"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Problem } from "@/components/feedback/dialog";
import { combo } from "@/components/forms/combo";
import { Combobox } from "@/components/forms/combobox";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import { api, unwrap } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { todayIn } from "@/lib/format/dates";
import { formatNumber } from "@/lib/format/text";
import { US_STATES } from "@/lib/reference/states";

const STATES = US_STATES.map(([code, name]) => ({ v: code, l: name, ab: code }));
const nameOf = (code: string) => US_STATES.find(([c]) => c === code)?.[1] ?? code;
type Row = { s: string; m: string };

/** A trip entered by hand: a truck without GPS, its miles in each state, checked against the odometer. It is marked
 * manual on the return, so every number on it can be traced to who entered it. */
export function TripModal({ onClose }: { onClose: () => void }) {
  const { me, notify, set } = useConsole();
  const client = useQueryClient();
  const org = me.organization;
  const today = todayIn(org.timezone);
  const trucks = useQuery({ queryKey: [org.id, "vehicles", "pick"], queryFn: () => unwrap(api.GET("/api/v1/vehicles", { params: { query: { sort: "unit_number", limit: 100 } } })), staleTime: 60_000 });
  const loads = useQuery({ queryKey: [org.id, "loads", "pick-trip"], queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { sort: "-pickup_at", limit: 100 } } })), staleTime: 30_000 });
  const overview = useQuery({ queryKey: [org.id, "ifta", "overview", ""], queryFn: () => unwrap(api.GET("/api/v1/ifta/overview")), staleTime: 60_000 });
  const [truck, setTruck] = useState("");
  const [date, setDate] = useState(today);
  const [load, setLoad] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // The first state starts as the company's base jurisdiction, where most trips begin.
  const list: Row[] = rows ?? [{ s: overview.data?.base ?? "", m: "" }, { s: "", m: "" }];
  const put = (i: number, patch: Partial<Row>) => setRows(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const total = list.reduce((sum, r) => sum + (Number(r.m) || 0), 0);
  const state = { open, q, setOpen, setQ };
  const truckOptions = (trucks.data?.items ?? []).filter((u) => u.status !== "retired").map((u) => ({ v: u.id, l: u.unit_number, ab: [u.make, u.telematics_device ? "GPS" : ""].filter(Boolean).join(" · ") }));
  const loadOptions = (loads.data?.items ?? []).filter((l) => !truck || !l.assignment || l.assignment.vehicle?.id === truck).map((l) => ({ v: l.id, l: l.load_number, ab: `${l.origin_city ?? ""} → ${l.destination_city ?? ""}` }));

  const save = async () => {
    const found: Record<string, string> = {};
    if (!truck) found.truck = "Choose the truck";
    if (!date) found.date = "Enter the date";
    else if (date > today) found.date = "A trip can’t be in the future";
    const miles = new Map<string, number>();
    list.forEach((r, i) => {
      const n = r.m.trim() ? Number(r.m.replace(/,/g, "")) : 0;
      if (r.m.trim() && !(n >= 0 && n <= 100000)) found[`m${i}`] = "Enter the miles as a number";
      else if (n > 0 && !r.s) found[`s${i}`] = "Choose the state";
      else if (n > 0) miles.set(r.s, (miles.get(r.s) ?? 0) + n);
    });
    if (!miles.size && !Object.keys(found).some((k) => k.startsWith("m"))) found.m0 = "Enter the miles in at least one state";
    const sum = [...miles.values()].reduce((a, b) => a + b, 0);
    if (start.trim() || end.trim()) {
      const a = Number(start.replace(/,/g, ""));
      const b = Number(end.replace(/,/g, ""));
      if (!start.trim() || !Number.isInteger(a) || a < 0) found.start = "Enter the start reading";
      else if (!end.trim() || !Number.isInteger(b) || b < 0) found.end = "Enter the end reading";
      else if (b < a) found.end = "The end reading is below the start";
      else if (Math.abs(b - a - sum) > Math.max(2, (b - a) * 0.02)) found.end = `The odometer shows ${formatNumber(b - a)} mi; the states add up to ${formatNumber(sum)}`;
    }
    setErrors(found);
    if (Object.keys(found).length) return setProblem("Some fields need attention");
    setPending(true);
    setProblem(null);
    try {
      await unwrap(api.POST("/api/v1/ifta/trips", { body: {
        vehicle_id: truck, trip_date: date, load_id: load || null,
        miles: [...miles.entries()].map(([jurisdiction, m]) => ({ jurisdiction, miles: String(m) })),
        odometer_start: start.trim() ? Number(start.replace(/,/g, "")) : null, odometer_end: end.trim() ? Number(end.replace(/,/g, "")) : null,
      } }));
      await client.invalidateQueries({ queryKey: [org.id] });
      const unit = truckOptions.find((t) => t.v === truck)?.l ?? "the truck";
      const names = [...miles.keys()].map(nameOf);
      onClose();
      notify(`Trip saved · miles added to ${unit} for ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]}`);
      set({ ...goTo("fuel"), ftab: 1, overlay: "none", modal: "none" });
    } catch (error) {
      if (error instanceof ApiError) setErrors(Object.fromEntries(Object.entries(error.fieldErrors).map(([path, message]) => [path === "odometer_end" ? "end" : path === "vehicle_id" ? "truck" : path === "trip_date" ? "date" : path, message])));
      setProblem(errorMessage(error));
      setPending(false);
    }
  };

  const truckField = combo(state, { k: "truck", l: "Truck", value: truck, options: truckOptions, onPick: setTruck, placeholder: "Choose a truck", head: "Trucks", search: truckOptions.length > 8, qph: "Search trucks" });
  const loadField = combo(state, { k: "load", l: "Load", value: load, options: loadOptions, onPick: setLoad, placeholder: "Optional", head: truck ? "Loads on this truck" : "Recent loads", search: true, qph: "Search loads" });
  const err = (k: string) => (errors[k] ? <span className="errt">{errors[k]}</span> : null);
  return (
    <>
      <div className="scrim" style={{ zIndex: "50" }} onClick={() => !pending && onClose()}></div>
      <div className="modal mid" role="dialog" aria-modal="true" aria-label="Add a trip">
        <div className="mh">
          <span className="mhic"><Icon className="s18" d={I.pin} /></span>
          <div className="f1">
            <h2 className="fs16 w6 tx">Add a trip</h2>
            <p className="fs13 mu" style={{ marginTop: "2px" }}>Enter manually</p>
          </div>
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close" disabled={pending}><Icon d="M18 6L6 18M6 6l12 12" /></button>
        </div>
        <div className="mbody c g12">
          <Problem message={problem} />
          <div>
            <div className="over" style={{ marginBottom: "10px" }}><span>Trip</span></div>
            <div className="mgrid">
              <div className="fld" style={{ gridColumn: "span 2" }}>
                <span className="lbl"><span>Truck</span></span>
                <Combobox f={truckField} />
                {err("truck")}
              </div>
              <div className="fld" style={{ gridColumn: "span 2" }}>
                <label htmlFor="trip-date">Date</label>
                <input id="trip-date" className={clsx("inp mono", errors.date && "err")} type="date" max={today} value={date} onChange={(e) => setDate(e.currentTarget.value)} />
                {err("date")}
              </div>
              <div className="fld" style={{ gridColumn: "span 2" }}>
                <span className="lbl"><span>Load</span></span>
                <Combobox f={loadField} />
              </div>
            </div>
          </div>
          <div>
            <div className="over" style={{ marginBottom: "10px" }}><span>Miles by state</span></div>
            <div className="mgrid">
              {list.map((r, i) => {
                const f = combo(state, { k: `s${i}`, l: "State", value: r.s, options: STATES, onPick: (v) => put(i, { s: v }), placeholder: "Choose a state", head: "50 states and DC", search: true, qph: "Search states" });
                return [
                  <div key={`s${i}`} className="fld" style={{ gridColumn: "span 3" }}>
                    <span className="lbl"><span>State</span></span>
                    <Combobox f={f} />
                    {err(`s${i}`)}
                  </div>,
                  <div key={`m${i}`} className="fld" style={{ gridColumn: "span 3" }}>
                    <label htmlFor={`trip-m${i}`}>Miles</label>
                    <span className="r g6">
                      <input id={`trip-m${i}`} className={clsx("inp mono f1", errors[`m${i}`] && "err")} inputMode="decimal" placeholder="0" value={r.m} onChange={(e) => put(i, { m: e.currentTarget.value })} />
                      {i > 1 ? <button className="btn ghost icon sm" aria-label="Remove this state" onClick={() => setRows(list.filter((_, j) => j !== i))}><Icon className="s14" d="M18 6L6 18M6 6l12 12" /></button> : null}
                    </span>
                    {err(`m${i}`)}
                  </div>,
                ];
              })}
            </div>
            {list.length < 8 ? (
              <button className="lnk fs12" style={{ marginTop: "8px" }} onClick={() => setRows([...list, { s: "", m: "" }])}>
                Add a state
              </button>
            ) : null}
          </div>
          <div>
            <div className="over" style={{ marginBottom: "10px" }}><span>Odometer</span></div>
            <div className="mgrid">
              <div className="fld" style={{ gridColumn: "span 3" }}>
                <label htmlFor="trip-start">Start</label>
                <input id="trip-start" className={clsx("inp mono", errors.start && "err")} inputMode="numeric" value={start} onChange={(e) => setStart(e.currentTarget.value)} />
                {err("start")}
              </div>
              <div className="fld" style={{ gridColumn: "span 3" }}>
                <label htmlFor="trip-end">End</label>
                <input id="trip-end" className={clsx("inp mono", errors.end && "err")} inputMode="numeric" value={end} onChange={(e) => setEnd(e.currentTarget.value)} />
                {errors.end ? <span className="errt">{errors.end}</span> : <span className="hint">{total ? `Must match the total miles above, ${formatNumber(total)}` : "Must match the total miles above"}</span>}
              </div>
            </div>
          </div>
          <label className="r g8 fs13" title="Trips entered by hand are always marked manual on the return">
            <input type="checkbox" className="cbx" checked readOnly disabled />
            <span>Flag this trip as manual on the IFTA return</span>
          </label>
        </div>
        <div className="mfoot">
          <span className="sp"></span>
          <button className="btn" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn pri" onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save trip"}</button>
        </div>
      </div>
    </>
  );
}
