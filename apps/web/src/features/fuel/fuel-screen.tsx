"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Fragment } from "react";
import { cell } from "@/components/data-table/cell";
import { BasicCell } from "@/components/data-table/cells";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { addOf, goTo } from "@/features/console/shell";
import { useSoon } from "@/features/console/use-action";
import type { Cell } from "@/features/console/view";
import { api, unwrap } from "@/lib/api/client";
import { formatDate, todayIn } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, humanize, plural } from "@/lib/format/text";

const TABS = ["Purchases", "Mileage", "Quarterly returns", "Tax rates"] as const;
const PAID_WITH: Record<string, string> = { fuel_card: "Fuel card", company_card: "Company card", cash: "Cash", driver_personal: "Driver paid", other: "Other" };
const TREATMENT: Record<string, [label: string, tone: string]> = { none: ["Company paid", "ok"], reimburse: ["Reimburse driver", "info"], deduct: ["Deduct from pay", "warn"] };
const MAP = "M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3zM9 7v13M15 4v13";

/** The quarter a day is in, as dates on the company's calendar. */
function quarterOf(day: string) {
  const year = Number(day.slice(0, 4));
  const quarter = Math.floor((Number(day.slice(5, 7)) - 1) / 3);
  const start = `${year}-${String(quarter * 3 + 1).padStart(2, "0")}-01`;
  const endMonth = quarter * 3 + 3;
  const end = new Date(Date.UTC(year, endMonth, 0)).toISOString().slice(0, 10);
  return { label: `Q${quarter + 1} ${year}`, start, end };
}

/** Fuel & IFTA: fuel bought, by truck and by state, toward the quarterly return. */
export function FuelScreen() {
  const { me, can, state, set } = useConsole();
  const soon = useSoon();
  const org = me.organization;
  const today = todayIn(org.timezone);
  const quarter = quarterOf(today);
  const tab = typeof state.ftab === "number" ? state.ftab : 0;
  const money = (value: string | number | null | undefined) => formatMoney(value, org.base_currency);
  const summary = useQuery({ queryKey: [org.id, "expenses", "fuel-summary", quarter.start], queryFn: () => unwrap(api.GET("/api/v1/expenses/fuel-summary", { params: { query: { date_from: quarter.start, date_to: quarter.end } } })) });
  const purchases = useQuery({ queryKey: [org.id, "expenses", "fuel", quarter.start], queryFn: () => unwrap(api.GET("/api/v1/expenses", { params: { query: { category: "fuel", incurred_from: quarter.start, incurred_to: quarter.end, sort: "-incurred_on", limit: 50, count: true } } })) });
  const s = summary.data;
  const fleetMiles = (s?.by_truck ?? []).reduce((sum, row) => sum + (row.miles ?? 0), 0);
  const fleetGallons = (s?.by_truck ?? []).reduce((sum, row) => sum + Number(row.gallons ?? 0), 0);
  const record = can("expenses.manage") ? () => set(addOf("fuel")) : null;
  const kpis = [
    { label: `Gallons · ${quarter.label.slice(0, 2)}`, value: s ? formatNumber(Math.round(Number(s.gallons))) : "—", suffix: " gal", sub: s ? `${plural(s.purchases, "purchase")}` : "", k: "brand", sk: "mu" },
    { label: `Fuel spend · ${quarter.label.slice(0, 2)}`, value: s ? money(s.amount) : "—", suffix: "", sub: s ? `${plural(s.by_jurisdiction.length, "state")}` : "", k: "info", sk: "mu" },
    { label: "Average price", value: s && Number(s.purchases) ? `$${Number(s.price_per_gallon).toFixed(3)}` : "—", suffix: "/gal", sub: "Across every purchase", k: "mu", sk: "mu" },
    { label: "Fleet MPG", value: fleetGallons ? (fleetMiles / fleetGallons).toFixed(2) : "—", suffix: "", sub: fleetMiles ? `${formatNumber(fleetMiles)} loaded mi ÷ ${formatNumber(Math.round(fleetGallons))} gal` : "Needs miles and fuel by truck", k: "ok", sk: "mu" },
    { label: "Trucks fueled", value: s ? formatNumber(s.by_truck.length) : "—", suffix: "", sub: quarter.label, k: "mu", sk: "mu" },
  ];
  const rows = (purchases.data?.items ?? []).map((p) => ({
    key: p.id,
    open: () => {},
    cells: [
      cell.text(formatDate(p.incurred_on).replace(/, \d{4}$/, ""), "", "num t2"),
      cell.text(p.vehicle?.name ?? "—", p.driver?.name ?? "", "mono w5"),
      cell.text(p.vendor ?? "—", PAID_WITH[p.paid_with ?? ""] ?? humanize(p.paid_with ?? ""), ""),
      cell.maybe(p.jurisdiction, "mono"),
      cell.num(p.gallons ? Number(p.gallons).toFixed(1) : "—"),
      cell.money(money(p.amount)),
      cell.badge(...(TREATMENT[p.driver_treatment ?? "none"] ?? ["—", "mu"])),
    ] as Cell[],
  }));
  const trucks = (s?.by_truck ?? []).map((row) => ({
    key: row.vehicle?.id ?? "none",
    open: () => (row.vehicle ? set({ screen: "truck", unitId: row.vehicle.id, unitKind: "truck", overlay: "none", modal: "none" }) : undefined),
    cells: [cell.text(row.vehicle?.name ?? "No truck", "", "mono w5"), cell.num(row.miles ? formatNumber(row.miles) : "—"), cell.num(Number(row.gallons).toFixed(1)), cell.num(row.mpg ? Number(row.mpg).toFixed(2) : "—"), cell.money(money(row.amount))] as Cell[],
  }));
  const states = (s?.by_jurisdiction ?? []).map((row) => ({
    key: row.jurisdiction ?? "none",
    open: () => {},
    cells: [cell.text(row.jurisdiction ?? "Unknown", "", "mono w5"), cell.num(formatNumber(row.purchases)), cell.num(Number(row.gallons).toFixed(1)), cell.money(money(row.amount))] as Cell[],
  }));
  const table = (cols: string, head: [string, boolean?][], body: { key: string; open: () => void; cells: Cell[] }[]) => (
    <>
      <div className="thead" style={{ gridTemplateColumns: cols }}>
        {head.map(([h, right]) => (
          <span key={h} className={right ? "rt" : ""}><span>{h}</span></span>
        ))}
      </div>
      <div className="tbody">
        {body.map((r) => (
          <Fragment key={r.key}>
            <div className="trow" style={{ gridTemplateColumns: cols }} onClick={r.open}>
              {r.cells.map((c, i2) => (
                <BasicCell key={i2} c={c} />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </>
  );

  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px" }}>
        <div className="f1">
          <div className="crumb">
            <span>Finance</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>{"Fuel & IFTA"}</b>
          </div>
          <h1 className="h1">{"Fuel & IFTA"}</h1>
          <p className="sub"><span>{`Fuel purchases by truck and state · ${quarter.label}${org.timezone ? "" : ""}`}</span></p>
        </div>
        <div className="r g8">
          <button className="btn" onClick={soon("Importing mileage")}>
            <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            Import mileage
          </button>
          {record ? (
            <button className="btn" onClick={record}>
              <Icon className="s14" d="M12 5v14M5 12h14" />
              Record a purchase
            </button>
          ) : null}
          <button className="btn pri" onClick={() => set(goTo("settings"))}>
            <Icon className="s14" d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
            Connect a fuel card
          </button>
        </div>
      </div>
      <div className="kpis" style={{ margin: "0 24px 14px", gridTemplateColumns: "repeat(5,minmax(0,1fr))" }}>
        {kpis.map((k) => (
          <div key={k.label} className="kpi">
            <span className="kl">
              <span className="dot" data-k={k.k}></span>
              <span>{k.label}</span>
            </span>
            <span className="kv2">
              <span>{k.value}</span>
              <small><span>{k.suffix}</span></small>
            </span>
            <span className="ks" data-k={k.sk}><span>{k.sub}</span></span>
          </div>
        ))}
      </div>
      <div className="tabs">
        {TABS.map((label, i) => (
          <button key={label} className={clsx("tab", i === tab && "on")} aria-current={i === tab ? "page" : undefined} onClick={() => set({ ftab: i })}>
            <span>{label}</span>
            {i === 0 && purchases.data ? <span className="tcnt"><span>{formatNumber(purchases.data.page.total_count ?? purchases.data.items.length)}</span></span> : null}
          </button>
        ))}
        <span className="tright"><button className="lnk" onClick={() => set(goTo("reports"))}>{"Fuel & IFTA reports"}</button></span>
      </div>
      <div className="fubody">
        {tab === 0 ? (
          <div className="fugrid r3">
            <section className="card oh c">
              <div className="ch">
                <h2 className="h2">Purchases</h2>
                <span className="fs12 mu"><span>{purchases.data ? `${plural(purchases.data.page.total_count ?? purchases.data.items.length, "purchase")} in ${quarter.label}` : ""}</span></span>
              </div>
              {purchases.isPending ? <Skeleton /> : null}
              {purchases.isError ? <ErrorState error={purchases.error} retry={() => void purchases.refetch()} /> : null}
              {purchases.data && !rows.length ? (
                <EmptyState icon="M3 22h12V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2zM15 10h2a2 2 0 0 1 2 2v3a2 2 0 0 0 4 0V8l-3-3" title={`No fuel bought in ${quarter.label} yet`} text="Record a purchase from a receipt; a fuel card connection would bring them in on its own.">
                  {record ? <button className="btn sm pri" onClick={record}>Record a purchase</button> : null}
                </EmptyState>
              ) : null}
              {rows.length ? table("74px minmax(0,0.9fr) minmax(0,1.25fr) 48px 80px 96px 150px", [["Date"], ["Truck · driver"], ["Station · paid with"], ["State"], ["Gallons", true], ["Amount", true], ["Paid by"]], rows) : null}
              <div className="tfoot">
                <span className="num"><span>{rows.length ? `Showing ${rows.length} of ${formatNumber(purchases.data?.page.total_count ?? rows.length)} · newest first` : ""}</span></span>
              </div>
            </section>
            <div className="c g16">
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">Fuel by state</h2>
                  <span className="sp"></span>
                  <span className="fs12 mu">{quarter.label}</span>
                </div>
                {states.length ? (
                  states.map((r) => (
                    <div key={r.key} className="wl">
                      <span className="mono fs13 w6">{r.key}</span>
                      <div className="f1 fs12 mu">{(r.cells[1]?.v ?? "") + " purchases"}</div>
                      <span className="mono fs13">{r.cells[2]?.v} gal</span>
                    </div>
                  ))
                ) : (
                  <div className="cb fs13 mu">No purchases with a state yet.</div>
                )}
              </section>
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">{"Fuel cards & data"}</h2>
                  <span className="sp"></span>
                  <button className="lnk" onClick={() => set(goTo("settings"))}>Integrations</button>
                </div>
                <div className="cb fs13 mu">No fuel card provider is connected. Purchases are recorded by hand from receipts.</div>
              </section>
            </div>
          </div>
        ) : null}
        {tab === 1 ? (
          <div className="fugrid r3 vz">
            <section className="card oh c">
              <div className="ch">
                <div className="f1 c">
                  <h2 className="h2">Miles and fuel by truck</h2>
                  <span className="fs12 mu">Loaded miles from delivered loads · fuel from purchases</span>
                </div>
              </div>
              {summary.isPending ? <Skeleton /> : null}
              {s && !trucks.length ? <EmptyState icon={MAP} title={`No truck fueled in ${quarter.label} yet`} /> : null}
              {trucks.length ? table("minmax(0,1.1fr) 96px 96px 72px 110px", [["Truck"], ["Miles", true], ["Gallons", true], ["MPG", true], ["Fuel spend", true]], trucks) : null}
            </section>
            <div className="c g16">
              <section className="card oh">
                <div className="ch" style={{ minHeight: "58px" }}>
                  <div className="f1 c">
                    <h2 className="h2">State-line allocation</h2>
                    <span className="fs12 mu">Miles driven in each state</span>
                  </div>
                </div>
                <EmptyState icon={MAP} title="Not recorded yet" text="IFTA needs the miles driven in each state. They aren’t recorded yet, so only fuel is split by state for now." />
              </section>
            </div>
          </div>
        ) : null}
        {tab === 2 ? (
          <div className="fugrid r3">
            <section className="card oh c">
              <div className="ch">
                <div className="f1 c">
                  <h2 className="h2">{`${quarter.label} · fuel bought by state`}</h2>
                  <span className="fs12 mu">{`${formatDate(quarter.start)} – ${formatDate(quarter.end)}`}</span>
                </div>
              </div>
              {s && !states.length ? <EmptyState icon={MAP} title="No fuel bought this quarter yet" /> : null}
              {states.length ? table("minmax(0,1fr) 110px 110px 120px", [["State"], ["Purchases", true], ["Tax-paid gallons", true], ["Amount", true]], states) : null}
              <div className="tfoot">
                <span><span>Tax due by state needs miles driven in each state, which aren’t recorded yet. Tax-paid gallons above are ready for the return.</span></span>
              </div>
            </section>
            <div className="c g16">
              <section className="card oh">
                <div className="ch"><h2 className="h2">Filing status</h2></div>
                <div className="cb fs13 mu">Returns aren’t prepared in FlyFleet yet.</div>
              </section>
            </div>
          </div>
        ) : null}
        {tab === 3 ? <EmptyState icon="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" title="Tax rates aren’t loaded yet" text="Quarterly IFTA rates per jurisdiction will appear here once returns are prepared in FlyFleet." /> : null}
      </div>
    </div>
  );
}
