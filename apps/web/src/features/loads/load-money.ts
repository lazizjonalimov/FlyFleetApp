import { toCents } from "@/lib/format/money";

/** The company's cost rates for a margin estimate (Settings › Loads, or the server's defaults). */
export type Costs = { driver_pay_per_mile: string; mpg: string; fuel_price: string; overhead_per_mile: string };
export const FUEL_CHOICES = [10, 12, 14, 15] as const;
export const MARGIN_WARNING = 25;

const round = (n: number) => Math.round(n);

/**
 * The same estimate the server makes (backend rules.money), in cents, while a load is being typed in: line haul,
 * fuel surcharge and billed charges, less driver pay, fuel and overhead for the miles. Detention isn't known yet.
 */
export function estimate(lineHaul: string, fuelPct: number, charges: string[], miles: number, costs: Costs) {
  const haul = toCents(lineHaul) ?? 0;
  const fuel = round((haul * fuelPct) / 100);
  const extra = charges.reduce((n, c) => n + (toCents(c) ?? 0), 0);
  const total = haul + fuel + extra;
  const pay = round(miles * Number(costs.driver_pay_per_mile) * 100);
  const mpg = Number(costs.mpg);
  const fuelCost = mpg ? round((miles / mpg) * Number(costs.fuel_price) * 100) : 0;
  const overhead = round(miles * Number(costs.overhead_per_mile) * 100);
  const margin = total - pay - fuelCost - overhead;
  const pct = total ? Math.round((margin / total) * 100) : null;
  return { haul, fuel, extra, total, pay, fuelCost, overhead, margin, pct, perMile: miles ? total / miles / 100 : null, warn: pct !== null && pct < MARGIN_WARNING };
}

/** The next dates a weekly repeat makes, after `from` (YYYY-MM-DD). Days: 0 is Monday. */
export function nextDates(days: number[], from: string, until: string | null, n = 3): string[] {
  const out: string[] = [];
  let at = Date.parse(`${from}T12:00:00Z`);
  for (let i = 0; i < 400 && out.length < n; i++) {
    at += 86_400_000;
    const day = new Date(at).toISOString().slice(0, 10);
    if (until && day > until) break;
    if (days.includes((new Date(at).getUTCDay() + 6) % 7)) out.push(day);
  }
  return out;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
