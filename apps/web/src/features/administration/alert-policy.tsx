"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState, type ReactNode } from "react";
import { Problem } from "@/components/feedback/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { api, unwrap } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";

type Policy = Schema<"PolicyOut">;
type Kind = "speeding" | "yard_speed" | "dwell" | "gps_stale";
type Recipient = { who: string; channels: string[]; when: string; after_minutes?: number };
type Draft = { id: string | null; kind: Kind; name: string; enabled: boolean; settings: Record<string, unknown>; recipients: Recipient[]; message: string; applies_to: Record<string, unknown>; version: number | null };

const WHO: Record<string, [label: string, initials: string]> = { driver: ["Driver", "DR"], dispatcher_on_duty: ["Dispatcher on duty", "DS"], safety_manager: ["Safety manager", "SF"], fleet_manager: ["Fleet manager", "FM"] };
const CHANNEL_ICON: Record<string, string> = { telegram: "M22 2L11 13M22 2l-7 20-4-9-9-4z", app_push: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01", push: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01", in_app: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0", email: "M4 4h16v16H4zM22 6l-10 7L2 6", sms: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" };
const NEW: Record<Kind, Omit<Draft, "id" | "version">> = {
  speeding: { kind: "speeding", name: "Sustained speeding", enabled: true, settings: { source: "telematics", threshold_mph: 70, tolerance_mph: 3, min_minutes: 2, cooldown_minutes: 20, max_accuracy_m: 50, max_age_minutes: 5, min_mph: 0, max_mph: 110 }, recipients: [{ who: "dispatcher_on_duty", channels: ["in_app"], when: "immediately" }], message: "", applies_to: { trucks: "all", hours: "all_day" } },
  yard_speed: { kind: "yard_speed", name: "Yard speed", enabled: true, settings: { source: "telematics", threshold_mph: 10, tolerance_mph: 0, min_minutes: 0.5, cooldown_minutes: 20, max_accuracy_m: 50, max_age_minutes: 5, min_mph: 0, max_mph: 110 }, recipients: [{ who: "fleet_manager", channels: ["in_app"], when: "immediately" }], message: "", applies_to: { trucks: "all", hours: "all_day" } },
  dwell: { kind: "dwell", name: "Dwell at a stop", enabled: true, settings: { hours: 2, watch_from_minutes: 30 }, recipients: [{ who: "dispatcher_on_duty", channels: ["in_app"], when: "immediately" }], message: "", applies_to: { trucks: "all", hours: "all_day" } },
  gps_stale: { kind: "gps_stale", name: "GPS stale", enabled: true, settings: { minutes: 15, only_on_loads: true }, recipients: [{ who: "dispatcher_on_duty", channels: ["in_app"], when: "immediately" }], message: "", applies_to: { trucks: "all", hours: "all_day" } },
};
const KIND_LABEL: Record<Kind, string> = { speeding: "Speeding", yard_speed: "Yard speed", dwell: "Dwell at a stop", gps_stale: "GPS stale" };

const draftOf = (p: Policy): Draft => ({ id: p.id, kind: p.kind as Kind, name: p.name, enabled: p.enabled, settings: { ...p.settings }, recipients: (p.recipients as Recipient[]).map((r) => ({ ...r, channels: [...r.channels] })), message: p.message ?? "", applies_to: { ...p.applies_to }, version: p.version });
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

/** Fleet alert policies: the rules that turn positions and records into incidents, who is told and how, and what
 * a rule would have done on the company's own recent positions. Saving makes a new version. */
export function useAlertPolicyPage(active: boolean): { actions: ReactNode; body: ReactNode } {
  const { me, can, state, set, notify } = useConsole();
  const client = useQueryClient();
  const org = me.organization;
  const manage = can("alert_policies.manage");
  const list = useQuery({ queryKey: [org.id, "alert-policies"], queryFn: () => unwrap(api.GET("/api/v1/alert-policies")), enabled: active });
  const policies = list.data?.policies ?? [];
  const channels = Object.fromEntries((list.data?.channels ?? []).map((c) => [c.key, c]));
  const chosenId = typeof state.policy === "string" ? state.policy : policies.find((p) => p.kind === "speeding")?.id ?? policies[0]?.id ?? null;
  const chosen = policies.find((p) => p.id === chosenId) ?? null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState(false);
  const [adding, setAdding] = useState(false);
  // The form edits a copy of the chosen policy; choosing another one starts a fresh copy.
  const key = chosen ? `${chosen.id}:${chosen.version}` : draft?.id === null ? "new" : null;
  if (chosen && key !== base && !(draft && draft.id === null)) {
    setBase(key);
    setDraft(draftOf(chosen));
    setProblem(null);
    setErrors({});
  }
  const d = draft;
  const dirty = !!d && (!chosen || d.id === null || JSON.stringify(draftOf(chosen)) !== JSON.stringify(d));
  const speed = d && (d.kind === "speeding" || d.kind === "yard_speed");
  const preview = useQuery({
    queryKey: [org.id, "alert-policies", "preview", d?.id, JSON.stringify(d?.settings ?? {})],
    queryFn: () => unwrap(api.POST("/api/v1/alert-policies/{policy_id}/preview", { params: { path: { policy_id: d!.id! } }, body: { settings: d!.settings, days: 7 } })),
    enabled: active && !!d?.id && !!speed,
    staleTime: 30_000,
  });
  const history = useQuery({ queryKey: [org.id, "alert-policies", "versions", chosen?.id], queryFn: () => unwrap(api.GET("/api/v1/alert-policies/{policy_id}/versions", { params: { path: { policy_id: chosen!.id } } })), enabled: active && versions && !!chosen });
  const put = (patch: Partial<Draft>) => setDraft((x) => (x ? { ...x, ...patch } : x));
  const setting = (k: string, v: unknown) => setDraft((x) => (x ? { ...x, settings: { ...x.settings, [k]: v } } : x));
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: org.timezone, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";
  const hm = new Intl.DateTimeFormat("en-US", { timeZone: org.timezone, hour: "2-digit", minute: "2-digit", hour12: false });
  const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: org.timezone, month: "short", day: "numeric" });

  const save = async () => {
    if (!d) return;
    setSaving(true);
    setProblem(null);
    setErrors({});
    try {
      const body = { kind: d.kind, name: d.name, enabled: d.enabled, settings: d.settings, recipients: d.recipients as never, message: d.message || null, applies_to: d.applies_to, version: d.version };
      const saved = d.id ? await unwrap(api.PUT("/api/v1/alert-policies/{policy_id}", { params: { path: { policy_id: d.id } }, body })) : await unwrap(api.POST("/api/v1/alert-policies", { body }));
      await client.invalidateQueries({ queryKey: [org.id, "alert-policies"] });
      set({ policy: saved.id });
      setDraft(null);
      setBase(null);
      notify(`${saved.name} saved as v${saved.version}`);
    } catch (error) {
      if (error instanceof ApiError) setErrors(Object.fromEntries(Object.entries(error.fieldErrors).map(([k, v]) => [k.replace(/^settings\./, ""), v])));
      setProblem(errorMessage(error));
    }
    setSaving(false);
  };

  const actions = active ? (
    <div className="r g8">
      <button className="btn" onClick={() => setVersions((v) => !v)} disabled={!chosen} aria-pressed={versions}>
        <Icon className="s14" d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
        Versions
      </button>
      {manage ? (
        <button className="btn pri" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? "Saving…" : d?.id ? `Save as v${(d.version ?? 0) + 1}` : "Save as v1"}
        </button>
      ) : null}
    </div>
  ) : null;

  if (!active) return { actions: null, body: null };
  if (list.isPending) return { actions, body: <Skeleton /> };
  if (list.isError) return { actions, body: <ErrorState error={list.error} retry={() => void list.refetch()} /> };

  const limit = d && speed ? num(d.settings.threshold_mph) + num(d.settings.tolerance_mph ?? 0) : 0;
  const field = (k: string, label: string, unit: string, hint: string, opts: { min?: number; step?: number; sign?: boolean } = {}) => (
    <div className="fld">
      <label htmlFor={`po-${k}`}>{label}</label>
      <div className="ufield">
        <input id={`po-${k}`} className={clsx("inp mono", errors[k] && "err")} inputMode="decimal" disabled={!manage}
          value={opts.sign && num(d!.settings[k]) >= 0 ? `+${String(d!.settings[k] ?? "")}` : String(d!.settings[k] ?? "")}
          onChange={(e) => setting(k, e.currentTarget.value.replace(/^\+/, "") === "" ? "" : Number(e.currentTarget.value.replace(/^\+/, "")))} />
        <span>{unit}</span>
      </div>
      <span className={errors[k] ? "errt" : "hint"}>{errors[k] ?? hint}</span>
    </div>
  );
  const message = (d?.message || "")
    .replace("{company}", org.name).replace("{unit}", "the truck").replace("{threshold}", String(d?.settings.threshold_mph ?? "")).replace("{minutes}", String(d?.settings.min_minutes ?? ""));
  const trucks = d?.applies_to.trucks;
  const p = preview.data;
  const trace = p?.trace;
  const chart = trace && trace.points.length > 1 && d && speed ? (() => {
    const t0 = new Date(trace.points[0]!.at).getTime();
    const t1 = new Date(trace.points.at(-1)!.at).getTime() || t0 + 60_000;
    const threshold = num(d.settings.threshold_mph);
    const lo = Math.min(threshold - 20, ...trace.points.map((x) => x.mph)) - 2;
    const hi = Math.max(limit + 8, ...trace.points.map((x) => x.mph)) + 2;
    const x = (ms: number) => ((ms - t0) / Math.max(1, t1 - t0)) * 312;
    const y = (mph: number) => 96 - ((mph - lo) / (hi - lo)) * 96;
    const firstAbove = trace.points.find((pt) => pt.mph > limit);
    return {
      d: trace.points.map((pt, i) => `${i ? "L" : "M"}${x(new Date(pt.at).getTime()).toFixed(1)},${y(pt.mph).toFixed(1)}`).join(""),
      zx: x(new Date(trace.start).getTime()), zw: Math.max(3, x(new Date(trace.end).getTime()) - x(new Date(trace.start).getTime())),
      yt: y(threshold), yl: y(limit),
      ticks: [hm.format(new Date(t0)), firstAbove ? `${hm.format(new Date(firstAbove.at))} above ${limit}` : "", `${hm.format(new Date(new Date(trace.start).getTime() + num(d.settings.min_minutes) * 60_000))} incident`, hm.format(new Date(t1))],
      label: `${trace.unit_number ?? "A truck"} · ${dayFmt.format(new Date(t0))} ${hm.format(new Date(t0))}–${hm.format(new Date(t1))}`,
    };
  })() : null;

  const body = (
    <div className="c g16">
      <div className="r g6 wrap">
        {policies.map((x) => (
          <button key={x.id} className={clsx("pol", x.id === d?.id && "on")} onClick={() => { setDraft(null); setBase(null); set({ policy: x.id }); }} aria-pressed={x.id === d?.id}>
            <span className="dot" data-k={x.enabled ? "ok" : "off"}></span>
            <span>{x.name}</span>
            <span className="mono fs11 mu"><span>{`v${x.version}`}</span></span>
          </button>
        ))}
        {manage ? (
          adding ? (
            <span className="r g4">
              {(Object.keys(NEW) as Kind[]).map((k) => (
                <button key={k} className="pol" style={{ borderStyle: "dashed" }} onClick={() => { setAdding(false); setBase("new"); setDraft({ ...NEW[k], id: null, version: null }); }}>{KIND_LABEL[k]}</button>
              ))}
              <button className="btn ghost xs" onClick={() => setAdding(false)}>Cancel</button>
            </span>
          ) : (
            <button className="pol" style={{ borderStyle: "dashed" }} onClick={() => setAdding(true)}>
              <Icon className="s12 b" d="M12 5v14M5 12h14" />
              New policy
            </button>
          )
        ) : null}
      </div>
      <Problem message={problem} />
      {!d ? <EmptyState icon={I.alert} title="No policy chosen" text="Choose a policy above." /> : (
        <>
          {versions && chosen ? (
            <section className="card oh">
              <div className="ch"><h2 className="h2">{`Versions · ${chosen.name}`}</h2><span className="sp"></span><button className="btn ghost icon sm" aria-label="Close versions" onClick={() => setVersions(false)}><Icon d="M18 6L6 18M6 6l12 12" /></button></div>
              {(history.data ?? []).map((v) => (
                <div key={v.version} className="wl">
                  <span className="mono fs12 w6" style={{ width: "34px" }}>{`v${v.version}`}</span>
                  <div className="f1 mw0">
                    <div className="fs13 w5 ell">{v.note || (v.version === 1 ? "First version" : "Saved")}</div>
                    <div className="fs12 mu ell">{`${v.saved_by_name ?? "FlyFleet"} · ${dayFmt.format(new Date(v.saved_at))} · ${v.enabled ? "enabled" : "off"}${"threshold_mph" in v.settings ? ` · ${String(v.settings.threshold_mph)} mph + ${String(v.settings.tolerance_mph ?? 0)}` : ""}`}</div>
                  </div>
                </div>
              ))}
            </section>
          ) : null}
          <div className="pgrid">
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Rule</h2>
                <span className="sp"></span>
                <span className="fs12 t3">Enabled</span>
                <button className={clsx("tog", d.enabled && "on")} aria-label="Policy enabled" aria-pressed={d.enabled} disabled={!manage} onClick={() => put({ enabled: !d.enabled })}></button>
              </div>
              <div className="cb c g14">
                <div className="fld">
                  <label htmlFor="po-n">Name</label>
                  <input id="po-n" className={clsx("inp", errors.name && "err")} value={d.name} disabled={!manage} onChange={(e) => put({ name: e.currentTarget.value })} />
                </div>
                {speed ? (
                  <>
                    <div className="fld">
                      <span className="lbl">Speed source</span>
                      {([["telematics", "Vehicle-reported speed (telematics)", "Preferred. Read from the truck’s own sensors."], ["driver_app", "Driver app GPS, as fallback only", "Phone GPS is noisy — used only when a truck has no telematics."]] as const).map(([v, t, s]) => (
                        <label key={v} className={clsx("opt", d.settings.source === v && "on")}>
                          <input type="radio" className="cbx" name="po-src" checked={d.settings.source === v} disabled={!manage} onChange={() => setting("source", v)} />
                          <span className="c">
                            <span className="fs13 w5">{t}</span>
                            <span className="fs12 mu">{s}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="pfields">
                      {field("threshold_mph", "Threshold", "mph", "Company limit — not the posted limit")}
                      {field("tolerance_mph", "Tolerance", "mph", `Alerts start above ${limit}`, { sign: true })}
                      {field("min_minutes", "Must last at least", "min", "One sample never alerts")}
                      {field("cooldown_minutes", "Cooldown", "min", "One incident per episode")}
                    </div>
                    <div className="fld">
                      <span className="lbl">Ignore samples that are</span>
                      <div className="r g6 wrap">
                        <span className="tag" data-k="mu">{`less accurate than ${String(d.settings.max_accuracy_m)} m`}</span>
                        <span className="tag" data-k="mu">{`older than ${String(d.settings.max_age_minutes)} min`}</span>
                        <span className="tag" data-k="mu">{`outside ${String(d.settings.min_mph)}–${String(d.settings.max_mph)} mph`}</span>
                      </div>
                    </div>
                    {d.kind === "yard_speed" && !list.data?.has_yard ? <p className="note"><Icon className="s14" d={I.info} /><span>Draw the yard as a geofence first: on Live fleet, choose a truck parked in the yard and use “Draw a geofence here”. This rule only counts speed inside one.</span></p> : null}
                  </>
                ) : d.kind === "dwell" ? (
                  <div className="pfields">
                    {field("hours", "Alert after", "h", "Detention usually starts at 2 h")}
                    {field("watch_from_minutes", "Watch from", "min", "Shown as watching until then")}
                  </div>
                ) : (
                  <>
                    <div className="pfields">{field("minutes", "No position for", "min", "Only trucks that have been reporting")}</div>
                    <label className="r g8 fs13">
                      <input type="checkbox" className="cbx" checked={d.settings.only_on_loads === true} disabled={!manage} onChange={(e) => setting("only_on_loads", e.currentTarget.checked)} />
                      <span>Only while the truck is on a load</span>
                    </label>
                  </>
                )}
                <div className="fld">
                  <span className="lbl">Applies to</span>
                  <div className="r g6 wrap">
                    <span className="chip on" style={{ height: "26px" }}>{trucks === "all" ? "All trucks" : `${Array.isArray(trucks) ? trucks.length : 0} trucks`}</span>
                    <span className="chip" style={{ height: "26px" }}>{`Active hours: all day · ${zone}`}</span>
                  </div>
                </div>
              </div>
            </section>
            <section className="card oh">
              <div className="ch"><h2 className="h2">Who gets told</h2></div>
              <div className="cb c g12">
                {d.recipients.map((r, i) => (
                  <div key={`${r.who}${i}`} className="whor">
                    <div className="r g8">
                      <span className="av sm"><span>{WHO[r.who]?.[1] ?? "?"}</span></span>
                      <span className="fs13 w5 f1"><span>{WHO[r.who]?.[0] ?? r.who}</span></span>
                      <span className="fs12 mu"><span>{r.when === "unacknowledged" ? `If not acknowledged in ${r.after_minutes ?? 10} min` : "Immediately"}</span></span>
                    </div>
                    <div className="r g6 wrap" style={{ paddingLeft: "32px" }}>
                      {r.channels.map((c) => {
                        const on = channels[c]?.connected;
                        return (
                          <span key={c} className="tag" data-k={on ? "info" : "mu"} title={on ? undefined : `${channels[c]?.label ?? c} isn’t connected yet. Connect messaging in Integrations; until then it is recorded as not sent.`}>
                            <Icon className="s12" d={CHANNEL_ICON[c] ?? I.bell} />
                            <span>{`${channels[c]?.label ?? c}${on ? "" : " · not connected"}`}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {speed && d.message ? (
                  <div className="c g6">
                    <span className="lbl">{"Driver message · Telegram & app"}</span>
                    <div className="bubble" style={{ whiteSpace: "pre-line" }}>{message}</div>
                    {manage ? (
                      <textarea className="inp" rows={3} aria-label="Driver message" value={d.message} onChange={(e) => put({ message: e.currentTarget.value })} />
                    ) : null}
                    <span className="hint">{"{company}, {threshold} and {minutes} are filled in · no location or load details in group chats"}</span>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
          {speed ? (
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Preview on real data</h2>
                <span className="fs12 mu">{`Last 7 days · ${trucks === "all" ? "all trucks" : "chosen trucks"}${dirty ? " · with your changes" : ""}`}</span>
                <span className="sp"></span>
                {chart ? <span className="mono fs12 t3">{chart.label}</span> : null}
              </div>
              {!d.id ? <div className="cb fs13 mu">Save the policy to preview it on the company’s positions.</div> : preview.isPending ? <Skeleton /> : (
                <div className="r g24" style={{ padding: "14px 16px 16px", alignItems: "stretch" }}>
                  <div className="c g12" style={{ width: "260px", flex: "none" }}>
                    {[[`Samples above ${String(d.settings.threshold_mph)} mph`, String(p?.above ?? 0), `last 7 days · ${p?.trucks ?? 0} ${p?.trucks === 1 ? "truck" : "trucks"}`], ["Incidents it would raise", String(p?.incidents ?? 0), "one per episode, not per sample"], ["Positions read", (p?.samples ?? 0).toLocaleString("en-US"), "from every source"]].map(([k, v, s]) => (
                      <div key={k} className="c g2">
                        <span className="fs12 t3"><span>{k}</span></span>
                        <span className="fs20 w6 num"><span>{v}</span></span>
                        <span className="fs12 mu"><span>{s}</span></span>
                      </div>
                    ))}
                  </div>
                  {chart ? (
                    <div className="spark f1">
                      <svg viewBox="0 0 312 96" preserveAspectRatio="none" role="img" aria-label="The worst episode in the last 7 days" style={{ height: "150px" }}>
                        <rect className="spz" x={chart.zx} y="0" width={chart.zw} height="96" />
                        <line className="spt" x1="0" x2="312" y1={chart.yt} y2={chart.yt} />
                        <line className="spt2" x1="0" x2="312" y1={chart.yl} y2={chart.yl} />
                        <path className="spl2" d={chart.d} />
                      </svg>
                      <span className="spk" style={{ top: `${(chart.yt / 96) * 150 - 8}px` }}>{`${String(d.settings.threshold_mph)} · threshold`}</span>
                      <span className="spk" style={{ top: `${(chart.yl / 96) * 150 - 22}px`, color: "#B42318" }}>{`${limit} · alert starts`}</span>
                      <div className="r jb fs11 mu mono" style={{ marginTop: "4px" }}>
                        {chart.ticks.filter(Boolean).map((t) => <span key={t}>{t}</span>)}
                      </div>
                    </div>
                  ) : (
                    <div className="f1 c" style={{ justifyContent: "center" }}>
                      <p className="fs13 mu">{p?.samples ? "No truck would have set this rule off in the last 7 days." : "No positions in the last 7 days. The preview fills in once trucks report."}</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : null}
          {chosen && d.id ? (
            <p className="note">
              <Icon className="s14" d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
              {`v${chosen.version} by ${chosen.updated_by_name ?? "FlyFleet"}, ${dayFmt.format(new Date(chosen.updated_at))}. Saving creates v${chosen.version + 1}; open incidents keep the version that created them${chosen.open_incidents ? ` (${chosen.open_incidents} open now)` : ""}.`}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
  return { actions, body };
}
