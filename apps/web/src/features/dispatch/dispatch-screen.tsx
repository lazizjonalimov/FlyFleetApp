"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Fragment } from "react";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useSoon } from "@/features/console/use-action";
import { loadLabel, loadTone } from "@/features/fleet/labels";
import type { LoadListItem } from "@/features/loads/load-data";
import { equipmentLabel, riskOf } from "@/features/loads/load-view";
import { api, unwrap } from "@/lib/api/client";
import { formatDateTime, fromLocalInput, timeZoneLabel, todayIn, toLocalInput } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, initials, plural } from "@/lib/format/text";
import { useMinuteClock } from "@/lib/time/clock";
import { AssignPanel } from "./assign-panel";

const FIRST_HOUR = 6;
const HOURS = 16;

/** A calendar date some days from another: "2026-11-15" + 1 → "2026-11-16". */
const shift = (day: string, by: number) => new Date(Date.parse(`${day}T12:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);
/** Hours from the start of `day`, on the company's clock. */
const hoursInto = (iso: string, day: string, zone: string) => (Date.parse(iso) - Date.parse(fromLocalInput(`${day}T00:00`, zone) ?? `${day}T00:00:00Z`)) / 3_600_000;
const dayLabel = (day: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));
const longDay = (day: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));

/** Dispatch board: loads waiting for a driver, each driver's day, and the assignment panel. */
export function DispatchScreen() {
  const { me, can, fin, state, set } = useConsole();
  const soon = useSoon();
  const org = me.organization;
  const zone = org.timezone;
  const today = todayIn(zone);
  const day = typeof state.bday === "string" ? state.bday : today;
  // Now, to the minute, once the board is in the browser (the server draws it without a now-line).
  const clock = useMinuteClock();
  const now = clock ?? Date.parse(`${day}T12:00:00Z`);
  const q = typeof state.bq === "string" ? state.bq.trim().toLowerCase() : "";
  const panelLoad = state.panel === "assign" && typeof state.assignLoad === "string" ? state.assignLoad : null;

  const queue = useQuery({ queryKey: [org.id, "dispatch", "queue"], queryFn: () => unwrap(api.GET("/api/v1/dispatch/board", { params: { query: { view: "unassigned", sort: "pickup_at", limit: 100 } } })), refetchInterval: 30_000 });
  const active = useQuery({ queryKey: [org.id, "dispatch", "active"], queryFn: () => unwrap(api.GET("/api/v1/dispatch/board", { params: { query: { view: "active", sort: "pickup_at", limit: 100 } } })), refetchInterval: 30_000 });
  const drivers = useQuery({ queryKey: [org.id, "drivers", "board"], queryFn: () => unwrap(api.GET("/api/v1/drivers", { params: { query: { status: "active", sort: "name", limit: 100 } } })), enabled: can("drivers.read"), refetchInterval: 60_000 });
  const summary = useQuery({ queryKey: [org.id, "dispatch", "summary"], queryFn: () => unwrap(api.GET("/api/v1/dispatch/summary")), refetchInterval: 30_000 });
  const [assigned, delivered] = useQueries({
    queries: (["assigned", "delivered"] as const).map((status) => ({
      queryKey: [org.id, "loads", "count", status],
      queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { status: [status], limit: 1, count: true } } })),
      refetchInterval: 30_000,
    })),
  });

  const matches = (load: LoadListItem) => !q || [load.load_number, load.reference, load.customer.name, load.origin_city, load.destination_city, load.assignment?.driver.name].some((text) => text?.toLowerCase().includes(q));
  const waiting = (queue.data?.items ?? []).filter(matches);
  const onBoard = active.data?.items ?? [];
  const assign = (load: { id: string }) => set({ screen: "dispatch", panel: "assign", assignLoad: load.id, assignDriver: null, drawer: null, overlay: "none", modal: "none" });
  // The load being assigned, previewed on the row of the driver chosen for it (the panel's best match until then).
  const eligible = useQuery({ queryKey: [org.id, "dispatch", "eligible", panelLoad], queryFn: () => unwrap(api.GET("/api/v1/dispatch/eligible-resources", { params: { query: { load_id: panelLoad! } } })), enabled: !!panelLoad });
  const candidates = eligible.data?.drivers ?? [];
  const previewDriver = typeof state.assignDriver === "string" ? state.assignDriver : (candidates.find((d) => d.eligible && !d.reasons.length) ?? candidates.find((d) => d.eligible))?.id ?? null;
  const previewLoad = panelLoad ? [...(queue.data?.items ?? []), ...onBoard].find((load) => load.id === panelLoad) ?? null : null;
  const updated = Math.max(queue.dataUpdatedAt, active.dataUpdatedAt);

  // where a load sits on the day: from pickup to delivery, cut to the hours shown
  const place = (load: LoadListItem) => {
    if (!load.pickup_at) return null;
    const start = hoursInto(load.pickup_at, day, zone);
    const end = load.delivery_at ? hoursInto(load.delivery_at, day, zone) : start + 2;
    const from = Math.max(start, FIRST_HOUR);
    const to = Math.min(end, FIRST_HOUR + HOURS);
    if (to <= from) return null;
    return { l: `${(((from - FIRST_HOUR) / HOURS) * 100).toFixed(3)}%`, w: `${(((to - from) / HOURS) * 100).toFixed(3)}%` };
  };
  const rows = (drivers.data?.items ?? []).map((driver) => {
    const loads = onBoard.filter((load) => load.assignment?.driver.id === driver.id);
    const units = loads[0]?.assignment ? [loads[0].assignment.vehicle.name, loads[0].assignment.trailer?.name].filter(Boolean).join(" · ") : "";
    const blocks = loads.flatMap((load) => {
      const spot = place(load);
      const risk = riskOf(load);
      return spot ? [{ id: load.id, number: load.load_number, lane: `${load.origin_city ?? ""} → ${load.destination_city ?? ""}`, k: loadTone(load.status), cls: risk?.tone === "bad" ? "rk" : risk ? "rkl" : "", alert: risk?.tone === "bad", title: `${load.load_number} · ${loadLabel(load.status)}`, ...spot }] : [];
    });
    const busy = driver.current_load;
    const blocked = driver.compliance.issues.some((issue) => issue.severity === "blocking");
    const chip = blocked ? "Not dispatchable" : busy ? loadLabel(busy.status) : "Available";
    const ck = blocked ? "bad" : busy ? "mu" : "ok";
    const spot = previewLoad && driver.id === previewDriver && previewLoad.assignment?.driver.id !== driver.id ? place(previewLoad) : null;
    if (spot && previewLoad) blocks.push({ id: `preview-${previewLoad.id}`, number: previewLoad.load_number, lane: `Preview · ${previewLoad.origin_city ?? ""} → ${previewLoad.destination_city ?? ""}`, k: "", cls: "ghost", alert: false, title: `${previewLoad.load_number} would go to ${driver.full_name}`, ...spot });
    return { id: driver.id, n: driver.full_name, ini: initials(driver.full_name), units: units || (driver.employee_number ?? ""), chip, ck, pk: blocked ? "bad" : busy ? "brand" : "ok", blocks, empty: !blocks.length, sel: spot ? "sel" : "" };
  }).filter((row) => !q || row.n.toLowerCase().includes(q) || row.blocks.some((block) => block.number.toLowerCase().includes(q)));
  const nowF = day === today && clock !== null ? (hoursInto(new Date(now).toISOString(), day, zone) - FIRST_HOUR) / HOURS : -1;
  const showNow = nowF >= 0 && nowF <= 1;
  const hours = Array.from({ length: HOURS }, (_, i) => (i % 2 === 0 ? `${String(FIRST_HOUR + i).padStart(2, "0")}:00` : ""));
  const sum: [string, number | undefined, string][] = [
    ["Unassigned", summary.data?.unassigned, "warn"],
    ["Assigned", assigned?.data?.page.total_count ?? undefined, "assigned"],
    ["In transit", summary.data?.in_transit, "transit"],
    ["At risk", summary.data?.at_risk, "bad"],
    ["Delivered", delivered?.data?.page.total_count ?? undefined, "ok"],
  ];
  const nowLabel = toLocalInput(new Date(now).toISOString(), zone).slice(11);

  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px" }}>
        <div className="f1">
          <div className="crumb">
            <span>Operations</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>Dispatch board</b>
          </div>
          <h1 className="h1">Dispatch board</h1>
          <p className="sub"><span>{[longDay(day), drivers.data ? `${plural(drivers.data.items.length, "driver")} on this board` : "", queue.data ? `${plural(queue.data.items.length, "unassigned load")}` : "", `times in ${timeZoneLabel(zone)}`].filter(Boolean).join(" · ")}</span></p>
        </div>
        <div className="r g8">
          <button className="btn" onClick={() => set({ bday: today })} disabled={day === today}>
            <Icon className="s14" d="M12 2l10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5" />
            View: Today
          </button>
          <div className="r" style={{ border: "1px solid var(--bd3)", borderRadius: "6px", background: "var(--sf)", height: "32px", overflow: "hidden", boxShadow: "var(--sh1)" }}>
            <button className="btn ghost icon" style={{ height: "30px", borderRadius: "0" }} aria-label="Previous day" onClick={() => set({ bday: shift(day, -1) })}><Icon className="s14" d="M15 6l-6 6 6 6" /></button>
            <span className="fs13 w5" style={{ padding: "0 10px", borderLeft: "1px solid var(--bd)", borderRight: "1px solid var(--bd)", lineHeight: "30px" }}>{dayLabel(day)}</span>
            <button className="btn ghost icon" style={{ height: "30px", borderRadius: "0" }} aria-label="Next day" onClick={() => set({ bday: shift(day, 1) })}><Icon className="s14" d="M9 6l6 6-6 6" /></button>
          </div>
          <div className="seg" role="group" aria-label="Board layout">
            <button className="on">Timeline</button>
            <button onClick={() => set(goTo("loads"))}>Table</button>
            <button onClick={() => set(goTo("tracking"))}>Map</button>
          </div>
          {can("loads.create") ? (
            <button className="btn pri" onClick={() => set(goTo("newload"))}>
              <Icon className="s14 b" d="M12 5v14M5 12h14" />
              New load
            </button>
          ) : null}
        </div>
      </div>
      <div className="r g8" style={{ padding: "0 24px 12px", flex: "none" }}>
        <div className="sumbar">
          {sum.map(([label, n, k]) => (
            <button key={label} className="sumi" data-k={k}>
              <span className="dot"></span>
              <span>{label}</span>
              <span className="mono w6 tx"><span>{n === undefined ? "—" : formatNumber(n)}</span></span>
            </button>
          ))}
        </div>
        <span className="sp"></span>
        <label className="search" style={{ width: "176px" }}>
          <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
          <input placeholder="Find driver or load" aria-label="Find driver or load" value={typeof state.bq === "string" ? state.bq : ""} onChange={(event) => set({ bq: event.target.value })} />
        </label>
        <button className="chip add" onClick={soon("Filtering by equipment")}>
          <Icon className="s12 b" d="M12 5v14M5 12h14" />
          Equipment
        </button>
        <button className="chip add" onClick={soon("Driver groups")}>
          <Icon className="s12 b" d="M12 5v14M5 12h14" />
          Driver group
        </button>
        <span className="fs12 mu nw r g6">
          <span className="dot" data-k={queue.isError || active.isError ? "bad" : "ok"}></span>
          {updated ? `Auto-refresh · ${toLocalInput(new Date(updated).toISOString(), zone).slice(11)}` : "Loading…"}
        </span>
      </div>
      <div className={clsx("dboard", panelLoad && "wp")}>
        {!panelLoad ? (
          <section className="card oh c" style={{ minHeight: "0" }}>
            <div className="ch" style={{ minHeight: "46px", padding: "0 14px" }}>
              <h2 className="h2">Unassigned</h2>
              <span className="cnt" data-k="warn"><span>{queue.data ? waiting.length : "…"}</span></span>
              <span className="sp"></span>
              <span className="fs12 mu">By pickup time</span>
            </div>
            <div className="queue">
              {queue.isError ? <ErrorState error={queue.error} retry={() => void queue.refetch()} /> : null}
              {queue.data && !waiting.length ? <EmptyState icon="M5 12l5 5 9-10" title={q ? "No unassigned loads match" : "Every load has a driver"} text={q ? undefined : "Loads waiting for a driver show up here, the most urgent first."} /> : null}
              {waiting.map((load) => {
                const risk = riskOf(load);
                const hoursAway = load.pickup_at ? (Date.parse(load.pickup_at) - now) / 3_600_000 : null;
                const urgency = risk ? { t: risk.label, k: risk.tone } : hoursAway !== null && hoursAway < 24 ? { t: "Picks up within a day", k: "warn" } : { t: load.status === "draft" ? "Draft" : "Planned", k: "mu" };
                return (
                  <div key={load.id} className={clsx("qcard", risk && "hot")}>
                    <div className="r g8">
                      <span className="mono fs12 w5 t2"><span>{load.load_number}</span></span>
                      <span className="sp"></span>
                      <span className="tag" data-k={urgency.k}><span>{urgency.t}</span></span>
                    </div>
                    <div className="r g6 fs13 w5">
                      <span className="ell"><span>{[load.origin_city, load.origin_state].filter(Boolean).join(", ")}</span></span>
                      <Icon className="s12 mu" d="M5 12h14M13 6l6 6-6 6" />
                      <span className="ell"><span>{[load.destination_city, load.destination_state].filter(Boolean).join(", ")}</span></span>
                    </div>
                    <div className="fs12 mu num">{[load.pickup_at ? formatDateTime(load.pickup_at, zone) : "No pickup time", load.miles ? `${formatNumber(load.miles)} mi` : "", equipmentLabel(load.equipment_type)].filter(Boolean).join(" · ")}</div>
                    <div className="r jb fs12" style={{ marginTop: "3px", paddingTop: "7px", borderTop: "1px solid var(--bd2)" }}>
                      <span className="t3 ell"><span>{load.customer.name}</span></span>
                      {fin && load.revenue ? <span className="mono w5 tx"><span>{formatMoney(load.revenue, load.currency)}</span></span> : null}
                      {can("dispatch.assign") && load.status === "planned" ? <button className="btn xs" onClick={() => assign(load)}>Assign</button> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
        <section className="card oh c" style={{ minHeight: "0" }}>
          <div className="tlh">
            <div className="tlh0">Driver · equipment</div>
            <div className="tlhours">
              {hours.map((h, i) => (
                <span key={i}><span>{h}</span></span>
              ))}
              {showNow ? <span className="nowtag" style={{ left: `${(nowF * 100).toFixed(3)}%` }}>{nowLabel}</span> : null}
            </div>
          </div>
          <div className="tlbody">
            {drivers.isError ? <ErrorState error={drivers.error} retry={() => void drivers.refetch()} /> : null}
            {drivers.data && !rows.length ? <EmptyState icon="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" title={q ? "No drivers match" : "No active drivers yet"} text={q ? undefined : "Add drivers under Directory to plan their days here."} /> : null}
            {rows.map((d) => (
              <div key={d.id} className={clsx("tlrow", d.sel)}>
                <div className="tld">
                  <span className="av" data-k={d.pk}>
                    <span>{d.ini}</span>
                    <span className="pres"></span>
                  </span>
                  <div className="f1">
                    <div className="fs13 w5 ell"><span>{d.n}</span></div>
                    <div className="mono fs11 mu"><span>{d.units}</span></div>
                  </div>
                  <span className="fs11 w5 tc nw" data-k={d.ck}><span>{d.chip}</span></span>
                </div>
                <div className="tltrack">
                  {d.blocks.map((b) => (
                    <Fragment key={b.id}>
                      {" "}
                      <button className={clsx("blk2", b.cls)} data-k={b.k} style={{ left: b.l, width: b.w, textAlign: "left" }} title={b.title} onClick={() => (b.id.startsWith("preview-") ? undefined : set({ screen: "loads", drawer: b.id, overlay: "none", modal: "none" }))}>
                        <div className="r g4">
                          <span className="mono fs11 w6 nw"><span>{b.number}</span></span>
                          {b.alert ? (
                            <Icon className="s12 b" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
                          ) : null}
                        </div>
                        <div className="fs11 ell"><span>{b.lane}</span></div>
                      </button>
                      {" "}
                    </Fragment>
                  ))}
                  {d.empty ? <div className="tlempty">{d.ck === "ok" ? "Free this day · use Assign on a load" : "Nothing scheduled this day"}</div> : null}
                </div>
              </div>
            ))}
            {showNow ? <div className="nowline" style={{ left: `calc(208px + (100% - 208px) * ${nowF.toFixed(5)})` }}></div> : null}
          </div>
        </section>
        {panelLoad ? <AssignPanel key={panelLoad} loadId={panelLoad} close={() => set({ panel: "none", assignLoad: null, assignDriver: null })} /> : null}
      </div>
    </div>
  );
}
