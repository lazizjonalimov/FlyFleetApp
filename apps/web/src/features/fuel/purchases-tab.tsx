"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { cell } from "@/components/data-table/cell";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { addOf } from "@/features/console/shell";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";
import { formatNumber, humanize, plural } from "@/lib/format/text";
import { short, Table, type TRow } from "./shared";

const PAID: Record<string, string> = { fuel_card: "Fuel card", company_card: "Company card", cash: "Cash", check: "Check", ach: "ACH", driver: "Driver paid" };
const SHOW = [["all", "All"], ["flagged", "Flagged"], ["receipts", "Receipts"]] as const;
const COLS = "74px minmax(0,0.9fr) minmax(0,1.25fr) 48px 80px 84px 164px";
const HEAD = [{ l: "Date", al: "" }, { l: "Truck · driver", al: "" }, { l: "Station · card", al: "" }, { l: "State", al: "" }, { l: "Gallons", al: "rt" }, { l: "Amount", al: "rt" }, { l: "Check", al: "" }];
/** Fuel card and telematics providers a company can connect in Integrations. */
const PROVIDERS = [
  ["WEX Fleet", "Fuel cards", "WX", "brand"],
  ["Samsara", "GPS miles, fuel level, odometer", "SA", "teal"],
  ["Comdata", "Fuel cards", "CD", "mu"],
  ["EFS", "Fuel cards and money codes", "EF", "mu"],
  ["AtoB", "Fuel cards with network discounts", "AB", "mu"],
  ["Mudflap", "Diesel discounts at truck stops", "MF", "mu"],
] as const;

/** Fuel bought this quarter, newest first, each with what FlyFleet checked about it; scanned receipts; and where
 * purchases come from. */
export function PurchasesTab({ quarter, today, onScan, onConnect }: { quarter: string; today: string; onScan: (() => void) | null; onConnect: () => void }) {
  const { me, set } = useConsole();
  const org = me.organization;
  const [show, setShow] = useState<"all" | "flagged" | "receipts">("all");
  const [all, setAll] = useState(false);
  const purchases = useQuery({ queryKey: [org.id, "ifta", "purchases", quarter, show, all], queryFn: () => unwrap(api.GET("/api/v1/ifta/purchases", { params: { query: { quarter, show, limit: all ? 200 : 10 } } })) });
  const receipts = useQuery({ queryKey: [org.id, "ifta", "receipts"], queryFn: () => unwrap(api.GET("/api/v1/ifta/receipts")) });
  const money = (v: string) => formatMoney(v, org.base_currency);
  const p = purchases.data;
  const start = `${quarter.slice(0, 4)}-${String((Number(quarter.slice(5)) - 1) * 3 + 1).padStart(2, "0")}-01`;
  const openDoc = (id: string) => set({ screen: "docreview", docId: id, drawer: null, overlay: "none", modal: "none" });
  const rows: TRow[] = (p?.items ?? []).map((x) => {
    const receipt = x.check.startsWith("Receipt");
    return {
      key: x.id,
      cls: receipt ? "sel" : "",
      open: x.load_id ? () => set({ screen: "loads", drawer: x.load_id, overlay: "none", modal: "none" }) : x.vehicle_id ? () => set({ screen: "truck", unitId: x.vehicle_id, unitKind: "truck", overlay: "none", modal: "none" }) : undefined,
      cells: [
        cell.text(short(x.incurred_on), "", "num", "num"),
        cell.text(x.unit_number ?? "No truck", x.driver ?? "", "mono fs12 w5"),
        cell.text(x.vendor ?? "—", [PAID[x.paid_with ?? ""], x.reference].filter(Boolean).join(" · ")),
        x.jurisdiction ? cell.tags([{ v: x.jurisdiction, k: "mu" }]) : cell.maybe(null),
        x.gallons ? cell.money(x.gallons, x.price_per_gallon ? `$${Number(x.price_per_gallon).toFixed(2)}/gal` : "") : { ...cell.text(humanize(x.category), "", "mu"), al: "rt" },
        cell.money(money(x.amount)),
        x.tone === "ok" ? cell.risk(x.check, "ok") : cell.risk(x.check, x.tone === "mu" ? "mu" : x.tone, x.tone === "info" ? I.file : x.tone === "mu" ? I.clock : I.alert),
      ],
    };
  });
  const toReview = (receipts.data ?? []).filter((r) => r.status === "Review").length;
  return (
    <div className="fugrid r3">
      <section className="card oh c">
        <div className="ch">
          <h2 className="h2">Purchases</h2>
          <span className="fs12 mu"><span>{p ? `${plural(p.total, "purchase")} ${short(start)} – ${short(today)} · ${p.flagged} flagged` : ""}</span></span>
          <span className="sp"></span>
          <div className="seg sm" role="group" aria-label="Show purchases">
            {SHOW.map(([v, l]) => (
              <button key={v} className={show === v ? "on" : ""} aria-pressed={show === v} onClick={() => setShow(v)}>
                {v === "all" || !p ? l : `${l} · ${v === "flagged" ? p.flagged : p.receipts}`}
              </button>
            ))}
          </div>
        </div>
        {purchases.isPending ? <Skeleton /> : null}
        {purchases.isError ? <ErrorState error={purchases.error} retry={() => void purchases.refetch()} /> : null}
        {p && !rows.length ? (
          <EmptyState icon={I.fuel} title={show === "all" ? "No fuel bought this quarter yet" : show === "flagged" ? "Nothing flagged" : "No purchases with a receipt to check"} text={show === "all" ? "Scan a receipt or type one in. Once a fuel card is connected, its purchases come in on their own." : undefined}>
            {show === "all" && onScan ? <button className="btn sm pri" onClick={onScan}>Scan a receipt</button> : null}
          </EmptyState>
        ) : null}
        {rows.length ? <Table label="Purchases" cols={COLS} head={HEAD} rows={rows} /> : null}
        {p && rows.length ? (
          <div className="tfoot">
            <span className="num"><span>{`Showing ${formatNumber(rows.length)} of ${formatNumber(show === "all" ? p.total : show === "flagged" ? p.flagged : p.receipts)} · newest first`}</span></span>
            <span className="sp"></span>
            {(show === "all" ? p.total : rows.length) > 10 || all ? <button className="lnk" onClick={() => setAll(!all)}>{all ? "Show the latest 10" : "View all purchases"}</button> : null}
          </div>
        ) : null}
      </section>
      <div className="c g16">
        <section className="card oh">
          <div className="ch">
            <h2 className="h2">Receipts</h2>
            {toReview ? <span className="tag" data-k="info">{`${toReview} to review`}</span> : null}
            <span className="sp"></span>
            {onScan ? <button className="lnk" onClick={onScan}>Scan a receipt</button> : null}
          </div>
          {receipts.data && !receipts.data.length ? <div className="cb fs13 mu">No receipts scanned yet. Receipts for cash or other cards are read here and saved as purchases.</div> : null}
          {(receipts.data ?? []).map((x) => (
            <button key={x.document_id} className="wl" style={{ width: "100%", border: "none", background: "none", textAlign: "left" }}
              onClick={() => (x.expense_id ? openDoc(x.document_id) : set({ ...addOf("fuel"), mstep: "scan", fv: { docId: x.document_id } }))}>
              <span className="plogo" data-k={x.tone}><Icon className="s14" d={I.file} /></span>
              <div className="f1 mw0">
                <div className="fs13 w5 ell"><span>{x.title}</span></div>
                <div className="fs12 mu ell"><span>{x.detail}</span></div>
              </div>
              <span className="badge" data-k={x.tone}>
                <i></i>
                <span>{x.status}</span>
              </span>
            </button>
          ))}
        </section>
        <section className="card oh">
          <div className="ch">
            <h2 className="h2">{"Fuel cards & data"}</h2>
            <span className="sp"></span>
            <button className="lnk" onClick={onConnect}>Integrations</button>
          </div>
          {PROVIDERS.map(([name, detail, ini, k]) => (
            <div key={name} className="wl">
              <span className="plogo" data-k={k}><span>{ini}</span></span>
              <div className="f1 mw0">
                <div className="fs13 w5"><span>{name}</span></div>
                <div className="fs12 mu ell"><span>{detail}</span></div>
              </div>
              <button className="btn xs" onClick={onConnect} aria-label={`Connect ${name}`}>Connect</button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
