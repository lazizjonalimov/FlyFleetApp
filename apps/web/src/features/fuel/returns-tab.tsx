"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { cell } from "@/components/data-table/cell";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDay } from "@/lib/format/dates";
import { plural } from "@/lib/format/text";
import { credit, previousQuarter, quarterLabel, short, signed, stateName, Table, type TRow, whole } from "./shared";

type Return = Schema<"ReturnOut">;
const COLS = "minmax(0,1fr) 84px 88px 80px 84px 64px 64px 100px";
const HEAD = [{ l: "State", al: "" }, { l: "Total miles", al: "rt" }, { l: "Taxable miles", al: "rt" }, { l: "Taxable gal", al: "rt" }, { l: "Tax-paid gal", al: "rt" }, { l: "Net gal", al: "rt" }, { l: "Rate", al: "rt" }, { l: "Tax · (credit)", al: "rt" }];
const TAG: Record<string, [string, string]> = { collecting: ["Estimate · still collecting", "info"], in_review: ["Estimate · in review", "warn"], approved: ["Approved · figures fixed", "ok"], filed: ["Filed", "brand"], paid: ["Paid", "ok"] };
const ACTION: Record<string, [string, string]> = { review: ["Start the review", "pri"], approve: ["Approve the return", "pri"], reopen: ["Reopen", ""], file: ["Mark filed", "pri"], pay: ["Record the payment", "pri"] };
const BADGE: Record<string, [string, string]> = { in_review: ["In review", "warn"], approved: ["Approved", "info"], filed: ["Filed", "info"], paid: ["Paid", "ok"], collecting: ["Collecting", "mu"] };

/** The quarter's return: tax and credit by state, how it is filed, past returns and who reviewed and approved it. */
export function ReturnsTab({ current, today }: { current: string; today: string }) {
  const { me, can, state, set } = useConsole();
  const act = useAction();
  const org = me.organization;
  const quarter = typeof state.fq === "string" ? state.fq : current;
  const ret = useQuery({ queryKey: [org.id, "ifta", "return", quarter], queryFn: () => unwrap(api.GET("/api/v1/ifta/returns/{quarter}", { params: { path: { quarter } } })) });
  const past = useQuery({ queryKey: [org.id, "ifta", "returns"], queryFn: () => unwrap(api.GET("/api/v1/ifta/returns")) });
  const [reference, setReference] = useState("");
  const r = ret.data;
  const quarters = [current, previousQuarter(current), previousQuarter(previousQuarter(current))];
  const money = (v: string | null | undefined) => credit(v, org.base_currency);
  const rows: TRow[] = (r?.lines ?? []).map((x) => ({
    key: x.jurisdiction,
    cells: [
      cell.text(x.name, x.jurisdiction, "w5"),
      cell.num(whole(x.total_miles)),
      cell.num(whole(x.taxable_miles)),
      cell.num(whole(x.taxable_gallons)),
      cell.num(whole(x.tax_paid_gallons)),
      cell.num(signed(x.net_gallons)),
      x.rate ? cell.num(`$${Number(x.rate).toFixed(4)}`) : { ...cell.text("No rate", "", "sk-warn"), al: "rt" },
      x.tax === null ? { ...cell.text("—", "", "mu"), al: "rt" } : cell.money(money(x.tax), "", Number(x.tax) < 0 ? "sk-ok" : ""),
    ],
  }));
  if (r && rows.length) {
    const taxable = r.lines.reduce((sum, x) => sum + Number(x.taxable_gallons), 0);
    rows.push({ key: "total", cls: "tot", cells: [
      cell.text("Total", plural(r.lines.length, "state"), "w6"), cell.num(whole(r.total_miles)), cell.num(whole(r.total_miles)), cell.num(whole(taxable)),
      cell.num(whole(r.total_gallons)), cell.num("—"), cell.text("", ""), cell.money(`${money(r.net_tax)} ${Number(r.net_tax) < 0 ? "credit" : "due"}`, "", "w6"),
    ] });
  }
  const run = (action: string) => {
    if (!r) return;
    const body = { action: action as "review", version: r.version, ...(action === "file" ? { reference: reference.trim() || null } : {}) };
    void act(() => unwrap(api.POST("/api/v1/ifta/returns/{quarter}/actions", { params: { path: { quarter } }, body })), action === "approve" ? `${r.label} return approved · figures fixed` : action === "file" ? `${r.label} return marked filed` : action === "pay" ? `${r.label} return ${Number(r.net_tax) < 0 ? "credit recorded" : "payment recorded"}` : action === "review" ? `${r.label} review started` : `${r.label} return reopened`);
  };
  const open = (path: string) => window.open(`/api/v1/ifta/returns/${quarter}/${path}`, "_blank", "noopener");
  const steps = r ? stepsOf(r, today, org.timezone) : [];
  return (
    <div className="fugrid r3">
      <div className="c g16">
        <section className="card oh c">
          <div className="ch">
            <h2 className="h2">{`${quarterLabel(quarter)} return`}</h2>
            {r ? <span className="tag" data-k={TAG[r.status]?.[1] ?? "info"}>{TAG[r.status]?.[0] ?? r.status}</span> : null}
            <span className="sp"></span>
            <div className="seg sm" role="group" aria-label="Quarter">
              {quarters.map((q) => (
                <button key={q} className={q === quarter ? "on" : ""} aria-pressed={q === quarter} onClick={() => set({ fq: q })}>{quarterLabel(q)}</button>
              ))}
            </div>
          </div>
          {ret.isPending ? <Skeleton /> : null}
          {ret.isError ? <ErrorState error={ret.error} retry={() => void ret.refetch()} /> : null}
          {r && (r.missing_rates.length || r.held_trips) ? (
            <div className="banner" data-k="warn" style={{ margin: "12px 16px 0" }}>
              <Icon className="s14 b" d={I.alert} />
              <div className="f1">
                {r.missing_rates.length ? <div>{`No ${quarterLabel(quarter)} rate for ${r.missing_rates.map(stateName).join(", ")} yet, so their tax isn’t worked out.`}</div> : null}
                {r.held_trips ? <div>{`${plural(r.held_trips, "imported trip")} held for review. Count or remove them before the return is approved.`}</div> : null}
              </div>
              {r.missing_rates.length ? <button className="btn sm" onClick={() => set({ ftab: 3 })}>Tax rates</button> : <button className="btn sm" onClick={() => set({ ftab: 1 })}>Mileage</button>}
            </div>
          ) : null}
          {r && !rows.length ? <EmptyState icon={I.fuel} title={`Nothing collected for ${quarterLabel(quarter)}`} text="The return is worked out from the quarter’s miles by state and the fuel bought in each state." /> : null}
          {rows.length ? <Table label={`${quarterLabel(quarter)} return`} cols={COLS} head={HEAD} rows={rows} /> : null}
          {r && rows.length ? (
            <div className="rtnote">
              <Icon className="s14" d={I.info} style={{ marginTop: "1px" }} />
              <span><span>{`Fleet MPG ${r.mpg ?? "—"} = ${whole(r.total_miles)} mi ÷ ${whole(r.total_gallons)} gal. Taxable gallons = taxable miles ÷ MPG; net = taxable − tax-paid gallons; a negative net is a credit, which offsets what’s due in other states on the same return.`}</span></span>
            </div>
          ) : null}
        </section>
        <section className="card oh">
          <div className="ch">
            <h2 className="h2">Exports</h2>
            <span className="fs12 mu">{r ? `${r.label} ${r.estimate ? "estimate, as of today" : TAG[r.status]?.[0].toLowerCase() ?? ""}` : ""}</span>
            <span className="sp"></span>
            <button className="btn sm" onClick={() => open("export")}>
              <Icon className="s14" d={I.download} />
              CSV
            </button>
            <button className="btn sm" onClick={() => open("pdf")}>
              <Icon className="s14" d={I.download} />
              PDF
            </button>
          </div>
          <div className="cb fs12 t2">
            The PDF is the jurisdiction schedule your base state asks for. The CSV has one row per truck, state and trip, so every number on the return traces back to GPS, an import or a manual trip.
          </div>
        </section>
      </div>
      <div className="c g16">
        <section className="card oh">
          <div className="ch">
            <h2 className="h2">Filing status</h2>
            <span className="fs12 mu">{r ? `${r.label} · due ${formatDay(`${r.due_on}T12:00:00Z`, "UTC")}` : ""}</span>
          </div>
          <ol className="stl">
            {steps.map((s, i) => (
              <li key={s.t} className={s.cls}>
                <span className="n">{s.cls === "done" ? <Icon className="s12 b" d="M5 12l5 5 9-10" /> : <span>{i + 1}</span>}</span>
                <span>
                  <b><span>{s.t}</span></b>
                  <br />
                  <span>{s.d}</span>
                </span>
                <span className="fs11 mu nw"><span>{s.w}</span></span>
              </li>
            ))}
          </ol>
          {r && r.allowed_actions.length ? (
            <div className="c g8" style={{ padding: "0 16px 14px" }}>
              {r.allowed_actions.includes("file") ? (
                <input className="inp mono" style={{ height: "32px" }} placeholder="Confirmation number from the state (optional)" aria-label="Confirmation number" value={reference} onChange={(e) => setReference(e.currentTarget.value)} />
              ) : null}
              <div className="r g8">
                {r.allowed_actions.map((a) => {
                  const [l, cls] = a === "pay" && Number(r.net_tax) < 0 ? ["Record the credit", "pri"] : ACTION[a] ?? [a, ""];
                  return <button key={a} className={clsx("btn sm", cls)} onClick={() => run(a)}>{l}</button>;
                })}
              </div>
            </div>
          ) : r && r.status === "collecting" && quarter === current ? (
            <p className="fs12 mu" style={{ padding: "0 16px 14px" }}>{`The review starts once the quarter is over, on ${short(nextDay(r.period_end))}.`}</p>
          ) : null}
        </section>
        <section className="card oh">
          <div className="ch"><h2 className="h2">Past returns</h2></div>
          {past.data && !past.data.filter((x) => x.quarter !== current).length ? <div className="cb fs13 mu">No earlier returns in FlyFleet yet.</div> : null}
          {(past.data ?? []).filter((x) => x.quarter !== current).map((x) => {
            const net = x.net_tax === null ? null : Number(x.net_tax);
            const [label, tone] = (x.status === "paid" || x.status === "filed") && net !== null && net < 0 ? ["Credit", "ok"] : BADGE[x.status] ?? [x.status, "mu"];
            return (
              <div key={x.quarter} className="wl">
                <button className="f1 mw0" style={{ border: "none", background: "none", textAlign: "left", padding: 0 }} onClick={() => set({ fq: x.quarter })}>
                  <div className="fs13 w5"><span>{x.label}</span></div>
                  <div className="fs12 mu"><span>{x.filed_on ? `Filed ${short(x.filed_on)}` : BADGE[x.status]?.[0] ?? x.status}</span></div>
                </button>
                <span className="mono fs13 w6"><span>{money(x.net_tax)}</span></span>
                <span className="badge" data-k={tone}>
                  <i></i>
                  <span>{label}</span>
                </span>
                <button className="btn xs ghost" onClick={() => window.open(`/api/v1/ifta/returns/${x.quarter}/pdf`, "_blank", "noopener")}>PDF</button>
              </div>
            );
          })}
        </section>
        <section className="card oh">
          <div className="ch">
            <h2 className="h2">{`Review & approval · ${quarterLabel(quarter)}`}</h2>
            {can("audit.read") ? <button className="lnk" style={{ marginLeft: "auto" }} onClick={() => set(goTo("audit"))}>Audit log</button> : null}
          </div>
          {r && !r.history.length ? <div className="cb fs13 mu">Not reviewed yet. Each step is recorded here and in the audit log.</div> : null}
          {(r?.history ?? []).map((h) => (
            <div key={`${h.when}${h.what}`} className="wl" style={{ alignItems: "flex-start" }}>
              <span className="dot" data-k={h.tone} style={{ marginTop: "6px" }}></span>
              <div className="f1 fs12 t2">
                <b className="tx"><span>{h.who}</span></b>
                {" "}<span>{h.what}</span>
              </div>
              <span className="fs11 mu num nw"><span>{formatDay(h.when, org.timezone).replace(/, \d{4}$/, "")}</span></span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

const nextDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** The five steps of a return, with who did each and when, and where it stands. */
function stepsOf(r: Return, today: string, zone: string) {
  // The step the return is at: approving finishes step 3, so an approved return is at filing.
  const at = ({ collecting: 0, in_review: 1, approved: 3, filed: 4, paid: 5 } as Record<string, number>)[r.status] ?? 0;
  const when = (iso: string | null | undefined) => (iso ? formatDay(iso, zone).replace(/, \d{4}$/, "") : "");
  const due = short(r.due_on);
  const credit = Number(r.net_tax) < 0;
  const steps = [
    { t: "Collect miles and fuel", d: "GPS, fuel cards, receipts and imports", w: at === 0 && today <= r.period_end ? "Now" : `Until ${short(r.period_end)}` },
    { t: "Review", d: r.reviewed_by_name ? `${r.reviewed_by_name} cleared gaps, imports and flagged purchases` : "Clear gaps, imports and flagged purchases", w: when(r.reviewed_at) || `From ${short(nextDay(r.period_end))}` },
    { t: "Approve", d: r.approved_by_name ? `${r.approved_by_name} approved the numbers` : "Fixes the figures with the rates used", w: when(r.approved_at) || `Before ${due}` },
    { t: "File", d: `With ${stateName(r.base) || "the base jurisdiction"}${r.base ? ", the base jurisdiction" : ""}${r.filed_reference ? ` · ${r.filed_reference}` : ""}`, w: r.filed_on ? short(r.filed_on) : `By ${due}` },
    { t: credit ? "Carry the credit" : "Pay or carry the credit", d: credit ? "The credit carries to the next return" : "Net due paid with the filing", w: r.paid_on ? short(r.paid_on) : "With filing" },
  ];
  return steps.map((s, i) => ({ ...s, cls: i < at ? "done" : i === at ? "cur" : "" }));
}
