"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { loadLabel, loadTone } from "@/features/fleet/labels";
import { useLoad, useLoadChanges } from "@/features/loads/load-data";
import { equipmentLabel } from "@/features/loads/load-view";
import { api, idempotencyKey, unwrap } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, initials, place } from "@/lib/format/text";

type Candidate = Schema<"Candidate">;

const why = (k: "ok" | "warn" | "bad", t: string) => ({ k, t, ic: k === "ok" ? I.check : k === "bad" ? I.deny : I.clock });

/** Why a driver or unit can or can't take the load, as the API reasons it. */
function reasons(candidate: Candidate) {
  // What speaks for them first, then what stands against them.
  const out = [...(candidate.strengths ?? []).map((text) => why("ok", text)), ...candidate.reasons.map((reason) => why(reason.severity === "blocking" ? "bad" : "warn", reason.message))];
  if (candidate.eligible && !out.length) out.push(why("ok", "Qualified and free at these times"));
  if (candidate.current_load && candidate.eligible) out.push(why("ok", `Now on ${candidate.current_load.load_number} · ${loadLabel(candidate.current_load.status).toLowerCase()}`));
  return out;
}

function UnitPicker({ label, chosen, options, pick }: { label: string; chosen: Candidate | undefined; options: Candidate[]; pick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="r g10" style={{ padding: "10px 12px", borderBottom: "1px solid var(--bd2)" }}>
      <span className="eqic">
        <Icon className="s14" d={label === "Truck" ? "M1 5h14v11H1zM15 9h4l3 3v4h-7zM5.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" : I.trailer} />
      </span>
      <div className="f1">
        <div className="fs13 w5">
          <span className="mono"><span>{chosen?.name ?? "None"}</span></span>
          {chosen?.detail ? <>{" · "}<span>{chosen.detail}</span></> : null}
        </div>
        <div className="fs12 mu ell"><span>{chosen ? (chosen.current_load ? `Now on ${chosen.current_load.load_number}` : label) : `No ${label.toLowerCase()} can take this load`}</span></div>
      </div>
      {chosen ? (
        <span className="risk" data-k={chosen.eligible ? (chosen.reasons.length ? "warn" : "ok") : "bad"}>
          <Icon className="s12 b" d={chosen.eligible ? I.check : I.deny} />
          <span>{chosen.eligible ? (chosen.reasons[0]?.message ?? "Available") : (chosen.reasons[0]?.message ?? "Not available")}</span>
        </span>
      ) : null}
      <div className="mwrap">
        {open ? <div style={{ position: "fixed", inset: "0", zIndex: 42 }} onClick={() => setOpen(false)}></div> : null}
        <button className="btn xs ghost" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} disabled={!options.length}>Change</button>
        {open ? (
          <div className="menu" role="menu" aria-label={`Choose a ${label.toLowerCase()}`} style={{ width: "280px", maxHeight: "260px", overflow: "auto" }}>
            {options.map((option) => (
              <button
                key={option.id}
                className="menui"
                role="menuitemradio"
                aria-checked={option.id === chosen?.id}
                disabled={!option.eligible}
                style={option.eligible ? undefined : { opacity: 0.55 }}
                onClick={() => {
                  setOpen(false);
                  pick(option.id);
                }}
              >
                <span className="f1 c">
                  <span className="fs13 w5 mono">{option.name}</span>
                  <span className="fs12 mu ell">{option.eligible ? (option.detail ?? "") : (option.reasons[0]?.message ?? "Not available")}</span>
                </span>
                {option.id === chosen?.id ? <Icon className="s14 b" d={I.check} /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Assigning a driver and equipment to a load. The candidates and the reasons some can't take it come from the
 * API, which checks them all again when the assignment is saved; if someone else got there first, its answer
 * is shown here and nothing is lost.
 */
export function AssignPanel({ loadId, close }: { loadId: string; close: () => void }) {
  const { me, fin, notify, set, state } = useConsole();
  const org = me.organization;
  const zone = org.timezone;
  const load = useLoad(loadId);
  const changes = useLoadChanges();
  const eligible = useQuery({ queryKey: [org.id, "dispatch", "eligible", loadId], queryFn: () => unwrap(api.GET("/api/v1/dispatch/eligible-resources", { params: { query: { load_id: loadId } } })) });
  // The chosen driver is kept with the board, which previews the load on their row.
  const driverId = typeof state.assignDriver === "string" ? state.assignDriver : null;
  const setDriverId = (id: string) => set({ assignDriver: id });
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [trailerId, setTrailerId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState<{ title: string; text: string; loadId?: string | null; loadNumber?: string | null } | null>(null);
  const [key, setKey] = useState(idempotencyKey);

  const detail = load.data;
  const resources = eligible.data;
  // In the API's order: eligible first, nearest the pickup, fewest concerns.
  const drivers = resources?.drivers ?? [];
  const best = drivers.find((driver) => driver.eligible && !driver.reasons.length) ?? drivers.find((driver) => driver.eligible);
  const chosenDriver = drivers.find((driver) => driver.id === (driverId ?? detail?.assignment?.driver.id ?? best?.id));
  const firstFree = (list: Candidate[]) => list.find((each) => each.eligible && !each.reasons.length) ?? list.find((each) => each.eligible);
  const vehicles = resources?.vehicles ?? [];
  const trailers = resources?.trailers ?? [];
  const truck = vehicles.find((each) => each.id === (vehicleId ?? detail?.assignment?.vehicle.id)) ?? firstFree(vehicles);
  const trailer = trailers.find((each) => each.id === (trailerId ?? detail?.assignment?.trailer?.id)) ?? (resources?.needs_trailer ? firstFree(trailers) : undefined);
  const reassigning = !!detail?.assignment;
  const willDispatch = !reassigning && detail?.status === "planned";
  const blocked = !chosenDriver?.eligible || !truck?.eligible || (!!resources?.needs_trailer && !trailer?.eligible) || pending || !detail;
  const eligibleCount = drivers.filter((driver) => driver.eligible).length;

  async function save() {
    if (!detail || !chosenDriver || !truck) return;
    setPending(true);
    setConflict(null);
    try {
      let saved = reassigning
        ? await unwrap(
            api.PATCH("/api/v1/dispatch/assignments/{assignment_id}", {
              params: { path: { assignment_id: detail.assignment!.id } },
              body: { version: detail.version, driver_id: chosenDriver.id, vehicle_id: truck.id, trailer_id: trailer?.id ?? null, reason: note.trim() || null },
            }),
          )
        : await unwrap(
            api.POST("/api/v1/dispatch/assignments", {
              params: { header: { "idempotency-key": key } },
              body: { load_id: detail.id, version: detail.version, driver_id: chosenDriver.id, vehicle_id: truck.id, trailer_id: trailer?.id ?? null, reason: note.trim() || null },
            }),
          );
      if (willDispatch && saved.allowed_actions.includes("dispatch")) saved = await changes.transition(saved, "dispatch");
      else await changes.settle(saved);
      notify(`${saved.load_number} ${reassigning ? "reassigned" : willDispatch && saved.status === "dispatched" ? "assigned and dispatched" : "assigned"} to ${chosenDriver.name}`);
      close();
    } catch (error) {
      setPending(false);
      setKey(idempotencyKey());
      const api = error instanceof ApiError ? error : null;
      const other = api?.details as { load_id?: string; load_number?: string } | undefined;
      setConflict({ title: api?.status === 409 ? `${chosenDriver.name} can’t take this load now` : "The assignment wasn’t saved", text: `${errorMessage(error)} Nothing was saved — your other choices are kept.`, loadId: other?.load_id, loadNumber: other?.load_number });
      void eligible.refetch();
      void load.refetch();
    }
  }

  return (
    <aside className="card oh c apanel" aria-label="Assign load">
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--bd2)" }}>
        <div className="r g8">
          <span className="over">{reassigning ? "Reassign load" : "Assign load"}</span>
          <span className="mono fs12 w5 t2"><span>{detail?.load_number ?? ""}</span></span>
          {detail ? (
            <span className="badge" data-k={loadTone(detail.status)}>
              <i></i>
              {loadLabel(detail.status)}
            </span>
          ) : null}
          <span className="sp"></span>
          <button className="btn ghost icon sm" onClick={close} aria-label="Close assignment panel"><Icon d="M18 6L6 18M6 6l12 12" /></button>
        </div>
        {detail ? (
          <>
            <div className="fs15 w6" style={{ marginTop: "8px" }}><span>{`${place(detail.origin_city, detail.origin_state)} → ${place(detail.destination_city, detail.destination_state)}`}</span></div>
            <div className="fs12 mu num" style={{ marginTop: "2px" }}>
              <span>{[detail.pickup_at ? `Pickup ${formatDateTime(detail.pickup_at, zone)}` : "", detail.delivery_at ? `deliver ${formatDateTime(detail.delivery_at, zone)}` : "", detail.miles ? `${formatNumber(detail.miles)} mi` : "", fin && detail.revenue ? formatMoney(detail.revenue, detail.currency) : ""].filter(Boolean).join(" · ")}</span>
            </div>
            <div className="r g4 wrap" style={{ marginTop: "10px" }}>
              {[equipmentLabel(detail.equipment_type), detail.weight_lbs ? `${formatNumber(detail.weight_lbs)} lb` : "", detail.customer.name].filter(Boolean).map((t, i) => (
                <span key={i} className="tag" data-k="mu"><span>{t}</span></span>
              ))}
            </div>
          </>
        ) : null}
      </div>
      <div className="c g12" style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "12px 16px 16px" }}>
        {conflict ? (
          <div className="banner" data-k="bad" role="alert">
            <Icon d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
            <div className="f1">
              <div className="bt">{conflict.title}</div>
              <div>{conflict.text}</div>
              <div className="r g8" style={{ marginTop: "8px" }}>
                <button className="btn sm" onClick={() => void eligible.refetch()}>
                  <Icon className="s14" d="M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" />
                  Refresh availability
                </button>
                {conflict.loadId ? <button className="btn sm ghost" onClick={() => set({ screen: "loads", drawer: conflict.loadId, panel: "none" })}>{`View ${conflict.loadNumber ?? "that load"}`}</button> : null}
              </div>
            </div>
          </div>
        ) : null}
        <div className="r g8">
          <span className="h3">Drivers</span>
          <span className="fs12 mu">{resources ? `${eligibleCount} eligible · ${drivers.length - eligibleCount} not eligible` : "Checking who can take it…"}</span>
        </div>
        <div className="c g6">
          {drivers.map((driver) => {
            const on = driver.id === chosenDriver?.id;
            const list = reasons(driver);
            return (
              <button key={driver.id} className={clsx("cand", on && "on", !driver.eligible && "no")} aria-pressed={on} onClick={() => driver.eligible && setDriverId(driver.id)}>
                <span className={clsx("radio", on && "on")}></span>
                <span className="av" data-k={driver.eligible ? (driver.current_load ? "brand" : "ok") : "mu"}>
                  <span>{initials(driver.name)}</span>
                  <span className="pres"></span>
                </span>
                <span className="f1 c g2">
                  <span className="r g6">
                    <span className="fs13 w5 tx ell"><span>{driver.name}</span></span>
                    {driver.id === best?.id ? (
                      <span className="tag" data-k="brand">
                        <Icon className="s12 fill" d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1z" />
                        Best match
                      </span>
                    ) : null}
                  </span>
                  <span className="fs12 mu ell"><span>{driver.seat ? [driver.seat.unit_number, driver.seat.trailer_unit, driver.seat.place].filter(Boolean).join(" · ") : driver.detail ? driver.detail.charAt(0).toUpperCase() + driver.detail.slice(1) : ""}</span></span>
                  <span className="r g4 wrap" style={{ marginTop: "3px" }}>
                    {list.map((y, i2) => (
                      <span key={i2} className="why" data-k={y.k}>
                        <Icon className="s12 b" d={y.ic} />
                        <span>{y.t}</span>
                      </span>
                    ))}
                  </span>
                </span>
              </button>
            );
          })}
          {resources && !drivers.length ? <div className="fs13 mu">No active drivers. Add drivers under Directory.</div> : null}
        </div>
        <div className="r g8" style={{ marginTop: "4px" }}>
          <span className="h3">Equipment</span>
          <span className="fs12 mu">Checked for this load’s times</span>
        </div>
        <div className="card" style={{ boxShadow: "none" }}>
          <UnitPicker label="Truck" chosen={truck} options={vehicles} pick={setVehicleId} />
          {resources?.needs_trailer || trailers.length ? <UnitPicker label="Trailer" chosen={trailer} options={trailers} pick={setTrailerId} /> : null}
        </div>
        <textarea className="inp" rows={2} placeholder="Note for the record (optional)" aria-label="Note for the record" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500}></textarea>
      </div>
      <div className="dfoot" style={{ padding: "12px 16px" }}>
        <span className="note" style={{ maxWidth: "190px" }}>
          <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
          Availability and qualifications are re-checked when you assign.
        </span>
        <span className="sp"></span>
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn pri" disabled={blocked} onClick={() => void save()}>
          <span>{pending ? "Saving…" : reassigning ? "Save changes" : willDispatch ? "Assign & dispatch" : "Assign"}</span>
        </button>
      </div>
    </aside>
  );
}
