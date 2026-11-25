"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { toLocalInput } from "@/lib/format/dates";
import { LOAD_TABS, tabFor } from "@/features/lists/tabs";

type Stop = Schema<"ScheduleStop"> & { slug?: string };
const START = 6;
const END = 20;
const CHIP_PX = 168;
const STATE: Record<Stop["state"], { label: string; k: string }> = {
  on_time: { label: "On time", k: "ok" },
  no_driver: { label: "No driver", k: "warn" },
  late: { label: "Will be late", k: "bad" },
  done: { label: "Done", k: "mu" },
};

/** Minutes from 06:00, for a time on the company's clock ("14:30"). */
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h! - START) * 60 + m!;
};
const SPAN = (END - START) * 60;

/** Chips in one lane, each in the first row where it doesn't overlap the one before it. */
export function stack(positions: number[], chipWidth: number): number[] {
  const rowEnds: number[] = [];
  return positions.map((x) => {
    let row = rowEnds.findIndex((end) => x >= end);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(0);
    }
    rowEnds[row] = x + chipWidth;
    return row;
  });
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Today's schedule: every pickup and delivery with an appointment today, placed on a 06:00–20:00 timeline, in two
 * lanes. A chip that would overlap the one before it moves to a row of its own; done stops are faded; choosing a
 * chip opens the load. For roles that dispatch; a dispatch team's dispatcher sees the team's loads only.
 */
export function TodaysSchedule() {
  const { me, can, set } = useConsole();
  const router = useRouter();
  const zone = me.organization.timezone;
  const all = me.organization.slug === "all";
  const query = useQuery({
    queryKey: [me.organization.id, "dashboard", "schedule"],
    queryFn: async () => {
      const out = await unwrap(api.GET("/api/v1/dashboard/schedule"));
      if (!all) return { stops: out.stops as Stop[], updated: Date.now() };
      const combined = out as unknown as { by_company: { organization: { slug: string }; data: Schema<"ScheduleOut"> }[] };
      return { stops: combined.by_company.flatMap((c) => c.data.stops.map((s) => ({ ...s, slug: c.organization.slug }))), updated: Date.now() };
    },
    refetchInterval: 60_000,
  });
  const [ref, width] = useWidth();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const hm = (iso: string) => toLocalInput(iso, zone).slice(11, 16);
  const stops = [...(query.data?.stops ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  const left = stops.filter((s) => s.state !== "done");
  const late = left.filter((s) => s.state === "late").length;
  const noDriver = left.filter((s) => s.state === "no_driver").length;
  const chipPct = (CHIP_PX / Math.max(width, 1)) * 100;
  const pct = (iso: string) => Math.min(100, Math.max(0, (minutesOf(hm(iso)) / SPAN) * 100));
  const nowPct = (minutesOf(hm(new Date(now).toISOString())) / SPAN) * 100;
  const open = (s: Stop) => (s.slug ? router.push(`/${s.slug}/loads/${s.load_id}`) : set({ screen: "load", loadId: s.load_id, drawer: null, overlay: "none" }));

  const lane = (kind: "pickup" | "delivery") => {
    const items = stops.filter((s) => s.kind === kind);
    const positions = items.map((s) => Math.min(pct(s.at), 100 - chipPct));
    const rows = stack(positions, chipPct);
    const height = Math.max(1, ...rows.map((r) => r + 1));
    return (
      <div className="tl-lane" role="group" aria-label={kind === "pickup" ? "Pickups" : "Deliveries"}>
        <span className="tl-name">{kind === "pickup" ? "Pickups" : "Deliveries"}</span>
        <div className="tl-track" style={{ height: `${height * 34 + 8}px` }}>
          {items.map((s, i) => {
            const state = STATE[s.state];
            const time = hm(s.at);
            const outside = minutesOf(time) < 0 ? " (before 06:00)" : minutesOf(time) > SPAN ? " (after 20:00)" : "";
            return (
              <button key={`${s.load_id}-${s.kind}-${s.at}`} type="button" className={clsx("tl-chip", s.state === "done" && "done")}
                style={{ left: `${positions[i]}%`, top: `${rows[i]! * 34 + 4}px` }} onClick={() => open(s)}
                aria-label={`${kind === "pickup" ? "Pickup" : "Delivery"} ${s.load_number} at ${time}${outside}, ${state.label}. Open load.`}>
                <span className="dot" data-k={state.k}></span>
                <span className="mono w6">{s.load_number}</span>
                <span className="num t3">{time}</span>
                <span className="t3 ell">{state.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section className="card oh" style={{ margin: "16px 24px 0" }} aria-labelledby="ff-sched">
      <div className="ch" style={{ flexWrap: "wrap", rowGap: "6px" }}>
        <h2 id="ff-sched" className="h2">Today’s schedule <span className="fs12 mu w4">— Pickups and deliveries by hour</span></h2>
        <span className="sp"></span>
        <span className="r g10 fs12 t3" aria-hidden="true">
          {(["on_time", "no_driver", "late"] as const).map((k) => <span key={k} className="r g4"><span className="dot" data-k={STATE[k].k}></span>{STATE[k].label}</span>)}
        </span>
        <span className="fs12 mu">{query.data ? `Updated ${hm(new Date(query.data.updated).toISOString())}` : ""}</span>
        <button type="button" className="lnk" onClick={() => set({ ...goTo("loads"), ltab: tabFor(LOAD_TABS, { view: "deliveries_today" }) })}>Open in Loads</button>
      </div>
      <p className="sr-only" aria-live="polite">{`${left.length} pickups and deliveries still to go today. ${late} at risk, ${noDriver} with no driver.`}</p>
      {query.isSuccess && !stops.length ? (
        <EmptyState icon={I.cal} title="No pickups or deliveries today">
          {can("loads.create") ? <button type="button" className="btn sm" onClick={() => set(goTo("newload"))}><Icon className="s14" d={I.plus} />Create a load</button> : null}
        </EmptyState>
      ) : (
        <div className="tl" ref={ref}>
          <div className="tl-hours" aria-hidden="true">
            {Array.from({ length: END - START + 1 }, (_, i) => (
              <span key={i} style={{ left: `${(i / (END - START)) * 100}%` }}>{`${String(START + i).padStart(2, "0")}:00`}</span>
            ))}
          </div>
          <div className="tl-body">
            <div className="tl-grid" aria-hidden="true">
              {Array.from({ length: END - START + 1 }, (_, i) => <span key={i} style={{ left: `${(i / (END - START)) * 100}%` }}></span>)}
              {nowPct >= 0 && nowPct <= 100 ? <span className="tl-now" style={{ left: `${nowPct}%` }}><b>Now</b></span> : null}
            </div>
            {lane("pickup")}
            {lane("delivery")}
          </div>
        </div>
      )}
    </section>
  );
}
