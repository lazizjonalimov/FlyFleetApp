"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { addOf, goTo } from "@/features/console/shell";
import { api, unwrap } from "@/lib/api/client";
import { formatDate, todayIn } from "@/lib/format/dates";
import { formatNumber, plural } from "@/lib/format/text";
import { MileageTab } from "./mileage-tab";
import { PurchasesTab } from "./purchases-tab";
import { RatesTab } from "./rates-tab";
import { ReturnsTab } from "./returns-tab";
import { credit, quarterOf, stateName } from "./shared";

const STATUS: Record<string, string> = { collecting: "Collecting", in_review: "In review", approved: "Approved", filed: "Filed", paid: "Paid" };
/** Where the quarter's miles came from, in a few words. */
function fromWhere(sources: string[]) {
  const parts = [sources.includes("gps") ? "GPS" : "", sources.includes("import") ? "imports" : ""].filter(Boolean);
  const hand = sources.includes("manual");
  return parts.length ? `from ${parts.join(" and ")}${hand ? " + by hand" : ""}` : hand ? "entered by hand" : "";
}

/** Fuel & IFTA: what was bought and where, the miles each truck ran in each state, and the quarterly return worked
 * out from them, through review, approval and filing. Everything is the company's own records. */
export function FuelScreen() {
  const { me, can, state, set } = useConsole();
  const org = me.organization;
  const today = todayIn(org.timezone);
  const quarter = quarterOf(today);
  const q = quarter.slice(4);
  const tab = typeof state.ftab === "number" ? state.ftab : 0;
  const manage = can("expenses.manage");
  const overview = useQuery({ queryKey: [org.id, "ifta", "overview", quarter], queryFn: () => unwrap(api.GET("/api/v1/ifta/overview", { params: { query: { quarter } } })) });
  const o = overview.data;
  const base = o?.base ? stateName(o.base) : null;
  const sources = fromWhere(o?.sources ?? []);
  const due = o ? `Due ${formatDate(o.due_on)} · ${o.days_left >= 0 ? plural(o.days_left, "day") : `${plural(-o.days_left, "day")} late`}` : "";
  const rateGap = o?.missing_rates.length ? `No ${q} rate for ${o.missing_rates.slice(0, 3).join(", ")}${o.missing_rates.length > 3 ? "…" : ""}` : null;
  const kpis = [
    { label: `IFTA miles · ${q}`, value: o ? formatNumber(Math.round(Number(o.miles))) : "—", suffix: " mi", sub: o ? (Number(o.miles) ? `${plural(o.states, "state")} · ${plural(o.trucks, "truck")}${sources ? ` · ${sources}` : ""}` : "No miles recorded yet") : "", k: "brand" },
    { label: `Fuel bought · ${q}`, value: o ? formatNumber(Math.round(Number(o.gallons))) : "—", suffix: " gal", sub: o ? `${credit(o.amount, org.base_currency)} · ${plural(o.purchases, "purchase")}` : "", k: "mu" },
    { label: "Fleet MPG", value: o?.mpg ?? "—", suffix: "", sub: o?.mpg ? "Calculated · miles ÷ gallons" : "Needs miles and fuel", k: "info" },
    { label: `${o && o.status !== "collecting" && o.status !== "in_review" ? "Net tax" : "Estimated net tax"} · ${q}`, value: o ? credit(o.net_tax, org.base_currency) : "—", suffix: "", sub: rateGap ?? (o ? `Due in ${plural(o.states_due, "state")}${o.base_net !== null && Number(o.base_net) < 0 ? ` · ${base} credit` : ""}` : ""), k: "warn" },
    { label: "Return status", value: o ? STATUS[o.status] ?? o.status : "—", suffix: "", sub: due, k: "info" },
  ];
  const tabs = [
    { l: "Purchases", n: o ? formatNumber(o.purchases) : "" },
    { l: "Mileage", n: o ? formatNumber(o.mileage_trucks) : "" },
    { l: "Quarterly returns", dot: o && (o.held_trips || o.missing_rates.length || ["collecting", "in_review", "approved"].includes(o.status)) ? "warn" : "" },
    { l: "Tax rates", n: o ? formatNumber(o.rates) : "" },
  ];
  const actions = {
    scan: () => set(addOf("fuel")),
    importMiles: () => set({ ...addOf("mileage"), mstep: "import" }),
    addTrip: () => set(addOf("mileage")),
    connect: () => set({ ...goTo("settings"), setpage: "integrations" }),
    reports: () => set({ ...goTo("reports"), rpt: "fuel" }),
  };
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
          <p className="sub">
            <span>{`Fuel purchases, IFTA miles by state and the quarterly return · ${base ? `base jurisdiction ${base}` : "set the company’s state in Settings for the base jurisdiction"}`}</span>
          </p>
        </div>
        <div className="r g8">
          {manage ? (
            <>
              <button className="btn" onClick={actions.importMiles}>
                <Icon className="s14" d={I.sheet} />
                Import mileage
              </button>
              <button className="btn" onClick={actions.scan}>
                <Icon className="s14" d={I.camera} />
                Scan a receipt
              </button>
            </>
          ) : null}
          <button className="btn pri" onClick={actions.connect}>
            <Icon className="s14 b" d="M12 5v14M5 12h14" />
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
            <span className="ks" data-k={rateGap && k.k === "warn" ? "warn" : "mu"}><span>{k.sub}</span></span>
          </div>
        ))}
      </div>
      <div className="tabs">
        {tabs.map((t, i) => (
          <button key={t.l} className={clsx("tab", i === tab && "on")} aria-current={i === tab ? "page" : undefined} onClick={() => set({ ftab: i })}>
            <span>{t.l}</span>
            {t.n ? <span className="tcnt"><span>{t.n}</span></span> : null}
            {t.dot ? <span className="dot" data-k={t.dot}></span> : null}
          </button>
        ))}
        {can("reports.read") ? <span className="tright"><button className="lnk" onClick={actions.reports}>{"Fuel & IFTA reports"}</button></span> : null}
      </div>
      <div className="fubody">
        {tab === 0 ? <PurchasesTab quarter={quarter} today={today} onScan={manage ? actions.scan : null} onConnect={actions.connect} /> : null}
        {tab === 1 ? <MileageTab quarter={quarter} today={today} onImport={manage ? actions.importMiles : null} onAddTrip={manage ? actions.addTrip : null} onConnect={actions.connect} /> : null}
        {tab === 2 ? <ReturnsTab current={quarter} today={today} /> : null}
        {tab === 3 ? <RatesTab quarter={quarter} /> : null}
      </div>
    </div>
  );
}
