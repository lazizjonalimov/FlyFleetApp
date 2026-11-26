"use client";

import { useQuery } from "@tanstack/react-query";
import { useConsole } from "@/features/console/console-provider";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { todayIn } from "@/lib/format/dates";

/**
 * The command center's data. The dashboard's tabs and the reports behind them call these same hooks, so the same
 * query (and the same cached answer) gives both their numbers.
 */
export type TabKey = "overview" | "operations" | "financial" | "fleet" | "calendar";
export const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "operations", label: "Operations" },
  { key: "financial", label: "Financial" },
  { key: "fleet", label: "Fleet & drivers" },
  { key: "calendar", label: "Calendar" },
];
export type Day = Schema<"DayOut">;
export type Ops = Schema<"OperationsOut">;
export type Fin = Schema<"FinancialOut">;
export type FleetData = Schema<"FleetOut">;
export type Cal = Schema<"CalendarOut">;
export type CalEvent = Schema<"CalendarEvent">;

const FINANCE = ["loads.rates.read", "invoices.read", "expenses.read"];

/** Which tabs a role opens: Financial needs finance access; accounting doesn't get Operations or Fleet & drivers. */
export function tabsFor(can: (...p: string[]) => boolean, role: string): TabKey[] {
  return TABS.map((t) => t.key).filter((key) => {
    if (key === "financial") return FINANCE.every((p) => can(p));
    if (key === "operations") return role !== "accountant" && can("loads.read");
    if (key === "fleet") return role !== "accountant" && can("drivers.read") && can("equipment.read");
    return true;
  });
}

const MINUTE = 60_000;

export function useDay(enabled = true) {
  const { me, can } = useConsole();
  return useQuery({ queryKey: [me.organization.id, "dx", "day"], queryFn: () => unwrap(api.GET("/api/v1/dashboard/day")), enabled: enabled && can("loads.read") && can("dashboard.read"), refetchInterval: MINUTE });
}
export function useOps(enabled = true) {
  const { me, can } = useConsole();
  return useQuery({ queryKey: [me.organization.id, "dx", "operations"], queryFn: () => unwrap(api.GET("/api/v1/dashboard/operations")), enabled: enabled && can("loads.read"), refetchInterval: MINUTE });
}
export function useFinancial(weeks: 4 | 12 | 26, enabled = true) {
  const { me, can } = useConsole();
  return useQuery({ queryKey: [me.organization.id, "dx", "financial", weeks], queryFn: () => unwrap(api.GET("/api/v1/dashboard/financial", { params: { query: { weeks } } })), enabled: enabled && FINANCE.every((p) => can(p)), staleTime: MINUTE });
}
export function useFleet(enabled = true) {
  const { me, can } = useConsole();
  return useQuery({ queryKey: [me.organization.id, "dx", "fleet"], queryFn: () => unwrap(api.GET("/api/v1/dashboard/fleet")), enabled: enabled && can("drivers.read") && can("equipment.read"), staleTime: MINUTE });
}
export function useCalendar(from: string, to: string, enabled = true) {
  const { me } = useConsole();
  return useQuery({ queryKey: [me.organization.id, "dx", "calendar", from, to], queryFn: () => unwrap(api.GET("/api/v1/dashboard/calendar", { params: { query: { date_from: from, date_to: to } } })), enabled, staleTime: MINUTE });
}
export function useLive(enabled = true) {
  const { me, can } = useConsole();
  return useQuery({ queryKey: [me.organization.id, "fleet", "live"], queryFn: () => unwrap(api.GET("/api/v1/fleet/live")), enabled: enabled && can("tracking.read"), refetchInterval: 30_000 });
}
export function useToday() {
  const { me } = useConsole();
  return todayIn(me.organization.timezone);
}

// ---------------------------------------------------------------- formatting
export function money(value: string | number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (digits === 0 && abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (digits === 0 && abs >= 10_000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
export function tileValue(value: string | null | undefined, unit: string): string {
  if (value === null || value === undefined) return "—";
  if (unit === "money") return money(value);
  if (unit === "percent") return `${Number(value).toFixed(1)}%`;
  if (unit === "per_mile") return `$${Number(value).toFixed(2)}`;
  if (unit === "days") return `${Math.round(Number(value))} days`;
  return String(value);
}
export const hours = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ""}`.trim() : `${minutes} min`);

// ---------------------------------------------------------------- dates
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const monday = (day: string) => addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const weekday = (day: string) => WD[new Date(`${day}T12:00:00Z`).getUTCDay()]!;
export const shortDay = (day: string) => `${MO[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
export const longDay = (day: string) => `${weekday(day)} ${shortDay(day)}`;
export const monthTitle = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
export const monthFirst = (day: string) => `${day.slice(0, 8)}01`;
export function shiftMonth(day: string, by: number): string {
  const d = new Date(`${monthFirst(day)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 10);
}
/** A month laid out Monday first, in whole weeks. */
export function monthCells(day: string): string[] {
  const first = monthFirst(day);
  const start = monday(first);
  const next = shiftMonth(first, 1);
  const out: string[] = [];
  for (let d = start; d < next || out.length % 7; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Events grouped by day, from the one list the calendar endpoint gives. */
export function byDay(events: CalEvent[], shown: Set<string>): Map<string, CalEvent[]> {
  const out = new Map<string, CalEvent[]>();
  for (const e of events) {
    if (!shown.has(e.category)) continue;
    if (!out.has(e.date)) out.set(e.date, []);
    out.get(e.date)!.push(e);
  }
  return out;
}

/** What a day cell lists: pickups and deliveries as counts, other events by title; up to three, then "+n more". */
export function dayChips(events: CalEvent[]): { chips: { key: string; label: string; category: string }[]; more: number } {
  const all: { key: string; label: string; category: string }[] = [];
  const pick = events.filter((e) => e.category === "pickup").length;
  const drop = events.filter((e) => e.category === "delivery").length;
  if (pick) all.push({ key: "pickup", label: `${pick} ${pick === 1 ? "pickup" : "pickups"}`, category: "pickup" });
  if (drop) all.push({ key: "delivery", label: `${drop} ${drop === 1 ? "delivery" : "deliveries"}`, category: "delivery" });
  for (const e of events) if (e.category !== "pickup" && e.category !== "delivery") all.push({ key: e.id, label: e.title, category: e.category });
  return { chips: all.slice(0, 3), more: Math.max(0, all.length - 3) };
}

// ---------------------------------------------------------------- the map
export type Pin = { id: string; x: number; y: number };
/** Fit points (lat, lon) into a box, keeping the shape of the land (longitude shrinks with latitude). */
export type Projection = { pins: Pin[]; toXY: (lat: number, lon: number) => [number, number]; bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number } };
export function project(points: { id: string; lat: number; lon: number }[], width: number, height: number, pad = 40): Projection {
  // no truck yet: the lower 48, so the map still shows where things are
  if (!points.length) {
    const us: Projection = project([{ id: "nw", lat: 48.5, lon: -124 }, { id: "se", lat: 25.5, lon: -70 }], width, height, pad);
    return { pins: [] as Pin[], toXY: us.toXY, bounds: us.bounds };
  }
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  let [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  // at least a region's worth of map, so one truck doesn't fill the screen
  const span = 3;
  if (maxLat - minLat < span) [minLat, maxLat] = [(minLat + maxLat) / 2 - span / 2, (minLat + maxLat) / 2 + span / 2];
  if (maxLon - minLon < span * 1.4) [minLon, maxLon] = [(minLon + maxLon) / 2 - span * 0.7, (minLon + maxLon) / 2 + span * 0.7];
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const w = (maxLon - minLon) * k;
  const h = maxLat - minLat;
  const scale = Math.min((width - pad * 2) / w, (height - pad * 2) / h);
  const ox = (width - w * scale) / 2;
  const oy = (height - h * scale) / 2;
  const toXY = (lat: number, lon: number): [number, number] => [ox + (lon - minLon) * k * scale, oy + (maxLat - lat) * scale];
  return { pins: points.map((p) => ({ id: p.id, x: toXY(p.lat, p.lon)[0], y: toXY(p.lat, p.lon)[1] })), toXY, bounds: { minLat, maxLat, minLon, maxLon } };
}

/** Interstates as a few points each (real routes, simplified), drawn under the pins for orientation. */
export const HIGHWAYS: { name: string; path: [number, number][] }[] = [
  { name: "I-10", path: [[34.05, -118.24], [33.45, -112.07], [32.22, -110.97], [31.76, -106.49], [30.27, -97.74], [29.42, -98.49], [29.76, -95.37], [30.45, -91.15], [29.95, -90.07], [30.69, -88.04], [30.44, -84.28], [30.33, -81.66]] },
  { name: "I-20", path: [[31.99, -102.08], [32.45, -99.73], [32.76, -97.33], [32.78, -96.8], [32.52, -93.75], [32.3, -90.18], [33.52, -86.8], [33.75, -84.39], [33.47, -81.97], [34.0, -81.03]] },
  { name: "I-35", path: [[27.51, -99.51], [29.42, -98.49], [30.27, -97.74], [31.55, -97.15], [32.78, -96.8], [35.47, -97.52], [37.69, -97.34], [39.1, -94.58], [41.59, -93.62], [44.98, -93.27], [46.79, -92.1]] },
  { name: "I-40", path: [[35.08, -106.65], [35.22, -101.83], [35.47, -97.52], [35.39, -94.4], [34.75, -92.29], [35.15, -90.05], [36.16, -86.78], [35.96, -83.92], [35.6, -82.55], [36.07, -79.79], [35.78, -78.64]] },
  { name: "I-70", path: [[39.74, -104.99], [38.87, -99.33], [39.05, -95.69], [39.1, -94.58], [38.63, -90.2], [39.77, -86.16], [39.96, -83.0], [40.06, -80.72], [39.65, -77.72]] },
  { name: "I-80", path: [[40.76, -111.89], [41.14, -104.82], [40.81, -96.7], [41.26, -95.94], [41.59, -93.62], [41.52, -90.58], [41.53, -87.85], [41.66, -83.56], [41.5, -81.69], [41.24, -77.0], [40.74, -74.17]] },
  { name: "I-95", path: [[25.76, -80.19], [28.54, -81.38], [30.33, -81.66], [32.08, -81.09], [34.0, -78.9], [35.78, -78.64], [37.54, -77.44], [38.9, -77.04], [39.29, -76.61], [39.95, -75.17], [40.74, -74.17], [41.76, -72.69], [42.36, -71.06]] },
  { name: "I-75", path: [[26.14, -81.79], [27.95, -82.46], [29.65, -82.32], [31.58, -84.16], [33.75, -84.39], [35.05, -85.31], [35.96, -83.92], [38.04, -84.5], [39.1, -84.51], [41.66, -83.56], [42.33, -83.05]] },
  { name: "I-5", path: [[32.72, -117.16], [34.05, -118.24], [36.74, -119.79], [38.58, -121.49], [40.59, -122.39], [44.94, -123.04], [45.52, -122.68], [47.61, -122.33]] },
  { name: "I-25", path: [[32.31, -106.78], [35.08, -106.65], [38.83, -104.82], [39.74, -104.99], [41.14, -104.82]] },
];
