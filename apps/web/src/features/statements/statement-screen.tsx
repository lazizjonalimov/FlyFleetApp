"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Fragment, useState } from "react";
import { cell } from "@/components/data-table/cell";
import { DataCell } from "@/components/data-table/cells";
import { Confirm } from "@/components/feedback/dialog";
import { ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { addOf, goTo } from "@/features/console/shell";
import { useAction, useSoon } from "@/features/console/use-action";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { humanize, initials } from "@/lib/format/text";

type Line = Schema<"SettlementLineOut">;

const STATUS: Record<string, [label: string, tone: string]> = { draft: ["Draft", "draft"], approved: ["Approved", "ok"], paid: ["Paid", "completed"], void: ["Void", "cancelled"] };
const GROUPS: { kind: Line["kind"][]; title: string; k: string; note: string }[] = [
  { kind: ["load_pay", "accessorial"], title: "Earnings", k: "brand", note: "Completed loads in the period, at the driver’s pay terms" },
  { kind: ["reimbursement"], title: "Reimbursements", k: "ok", note: "Expenses the driver paid that the company pays back" },
  { kind: ["deduction"], title: "Deductions", k: "warn", note: "Advances and charges taken from this pay" },
  { kind: ["adjustment"], title: "Adjustments", k: "info", note: "Added by hand, with a reason" },
];
const METHODS: Record<string, string> = { ach: "ACH", check: "Check", direct_deposit: "Direct deposit", cash: "Cash", other: "Other" };

/** One driver pay statement: what it is made of, from draft through approval to payment. */
export function StatementScreen() {
  const { me, can, I, state, set } = useConsole();
  const act = useAction();
  const soon = useSoon();
  const org = me.organization;
  const zone = org.timezone;
  const id = typeof state.statementId === "string" ? state.statementId : "";
  const [asking, setAsking] = useState<"approve" | "void" | "recalculate" | null>(null);
  const query = useQuery({ queryKey: [org.id, "settlements", "detail", id], queryFn: () => unwrap(api.GET("/api/v1/settlements/{settlement_id}", { params: { path: { settlement_id: id } } })), enabled: !!id });
  const toList = () => set(goTo("settlements"));
  const st = query.data;

  if (!st) {
    return (
      <div className="col">
        <div className="ph">
          <div className="f1">
            <div className="crumb">
              <span>Finance</span>
              <Icon className="s12" d="M9 6l6 6-6 6" />
              <button onClick={toList}>Statements</button>
            </div>
          </div>
        </div>
        {query.isError ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : <Skeleton rows={8} />}
      </div>
    );
  }

  const money = (value: string | number) => formatMoney(value, st.currency);
  const allowed = new Set(st.allowed_actions);
  const manage = can("settlements.manage");
  const [label, tone] = STATUS[st.status] ?? [humanize(st.status), "mu"];
  const period = `${formatDate(st.period_start)} – ${formatDate(st.period_end)}`;
  const pays = st.status === "paid" ? `Paid ${st.paid_on ? formatDate(st.paid_on) : ""}${st.paid_method ? ` by ${METHODS[st.paid_method] ?? st.paid_method}` : ""}` : st.status === "approved" ? "Approved · not yet paid" : st.status === "void" ? "Voided" : "Draft · not yet approved";
  const loadLines = st.lines.filter((line) => line.load);
  const trail = [
    { who: st.created_by_name ?? "System", what: "created the statement", when: formatDateTime(st.created_at, zone), k: "mu" },
    ...(st.calculated_at ? [{ who: "FlyFleet", what: "calculated the lines from loads and expenses", when: formatDateTime(st.calculated_at, zone), k: "info" }] : []),
    ...(st.approved_at ? [{ who: st.approved_by_name ?? "Someone", what: "approved it", when: formatDateTime(st.approved_at, zone), k: "ok" }] : []),
    ...(st.paid_on ? [{ who: "Payment", what: `recorded${st.paid_reference ? ` · ${st.paid_reference}` : ""}`, when: formatDate(st.paid_on), k: "ok" }] : []),
    ...(st.voided_at ? [{ who: "Voided", what: st.void_reason ?? "", when: formatDateTime(st.voided_at, zone), k: "bad" }] : []),
  ].reverse();
  const run = (action: "approve" | "recalculate") =>
    action === "approve"
      ? unwrap(api.POST("/api/v1/settlements/{settlement_id}/approve", { params: { path: { settlement_id: st.id } }, body: { version: st.version } }))
      : unwrap(api.POST("/api/v1/settlements/{settlement_id}/recalculate", { params: { path: { settlement_id: st.id } }, body: { version: st.version } }));

  return (
    <div className="col">
      <div className="ph" style={{ alignItems: "center", paddingBottom: "14px" }}>
        <span className="omk lg" data-k="teal"><span>{initials(st.driver.name)}</span></span>
        <div className="f1 mw0">
          <div className="crumb" style={{ marginBottom: "2px" }}>
            <span>Finance</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <button onClick={toList}>Statements</button>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b><span>{st.number ?? st.driver.name}</span></b>
          </div>
          <div className="r g10">
            <h1 className="h1">{"Driver pay · "}<span>{st.driver.name}</span></h1>
            <span className="badge" data-k={tone}>
              <i></i>
              <span>{label}</span>
            </span>
          </div>
          <p className="sub"><span>{period}</span>{" · "}<span>{pays}</span></p>
        </div>
        <div className="r g8">
          <button className="btn" onClick={() => set({ screen: "driver", driverId: st.driver.id, overlay: "none", modal: "none" })}>
            <Icon className="s14" d={I.user} />
            Driver record
          </button>
          <button className="btn" onClick={() => window.print()}>
            <Icon className="s14" d={I.download} />
            Print
          </button>
          <button className="btn" onClick={soon("Sending statements to drivers")}>
            <Icon className="s14" d={I.send} />
            Send to driver
          </button>
          {manage && allowed.has("recalculate") ? (
            <button className="btn" onClick={() => setAsking("recalculate")}>Recalculate</button>
          ) : null}
          {manage && allowed.has("approve") ? (
            <button className="btn pri" onClick={() => setAsking("approve")}>
              <Icon className="s14" d={I.check} />
              Approve
            </button>
          ) : null}
          {manage && allowed.has("pay") ? (
            <button className="btn pri" onClick={() => set({ ...addOf("payout"), fv: { "payout.statement": st.id } })}>
              <Icon className="s14" d={I.check} />
              Mark paid
            </button>
          ) : null}
        </div>
      </div>
      <div className="scr5">
        <div className="st5">
          <div className="c g16">
            <div className="mm5 vz big">
              {[
                { l: "Gross pay", v: money(st.earnings), s: `${loadLines.length} load ${loadLines.length === 1 ? "line" : "lines"}`, k: "v1" },
                { l: "Reimbursements", v: money(st.reimbursements), s: "Paid back to the driver", k: "v3" },
                { l: "Deductions", v: money(`-${st.deductions}`), s: "Taken from this pay", k: "v2" },
                { l: "Net pay", v: money(st.net_pay), s: pays, k: "v4" },
              ].map((s) => (
                <div key={s.l} className="mm5s">
                  <i className="mm5k" data-v={s.k}></i>
                  <span className="fs12 t3 ell"><span>{s.l}</span></span>
                  <span className="mm5v"><span>{s.v}</span></span>
                  <span className="fs11 mu ell"><span>{s.s}</span></span>
                </div>
              ))}
            </div>
            {st.status === "draft" ? (
              <div className="banner" data-k="info">
                <Icon d={I.info} />
                <div className="f1">
                  <div className="bt">A draft changes with the period’s loads and expenses</div>
                  <div>Recalculate after a late load or expense comes in. Approving fixes the lines; only then can it be paid.</div>
                </div>
              </div>
            ) : null}
            {st.status === "void" && st.void_reason ? (
              <div className="banner" data-k="bad">
                <Icon d={I.alert} />
                <div className="f1">
                  <div className="bt">Voided</div>
                  <div>{st.void_reason}</div>
                </div>
              </div>
            ) : null}
            {GROUPS.map((group) => {
              const lines = st.lines.filter((line) => group.kind.includes(line.kind));
              if (!lines.length) return null;
              const total = lines.reduce((sum, line) => sum + Number(line.amount), 0);
              return (
                <section key={group.title} className="card oh">
                  <div className="ch">
                    <span className="dot" data-k={group.k}></span>
                    <div className="f1 mw0 c">
                      <span className="fs13 w6 ell"><span>{group.title}</span></span>
                      <span className="fs12 mu ell"><span>{group.note}</span></span>
                    </div>
                  </div>
                  <div className="sl4">
                    {lines.map((line) => (
                      <div key={line.id} className="sln">
                        <div className="f1 mw0">
                          <div className="slt"><span>{line.description}</span></div>
                          {line.manual ? <div className="sls"><span>Added by hand</span></div> : null}
                        </div>
                        <div className={clsx("slv mono", Number(line.amount) < 0 && "t2")}><span>{money(line.amount)}</span></div>
                      </div>
                    ))}
                    <div className="sln sum">
                      <div className="f1 mw0"><div className="slt"><span>{`Total ${group.title.toLowerCase()}`}</span></div></div>
                      <div className="slv mono"><span>{money(total.toFixed(2))}</span></div>
                    </div>
                  </div>
                </section>
              );
            })}
            {!st.lines.length ? (
              <section className="card oh">
                <div className="cb fs13 mu">No lines yet. Recalculate to bring in the period’s completed loads and expenses.</div>
              </section>
            ) : null}
            <section className="card oh c">
              <div className="ch">
                <div className="f1 c">
                  <h2 className="h2">Loads on this statement</h2>
                  <span className="fs12 mu">Each opens the load</span>
                </div>
              </div>
              <div className="tscroll">
                <div className="tinner">
                  <div className="thead" style={{ gridTemplateColumns: "100px minmax(0,1fr) 110px 110px 120px" }}>
                    {[["Load"], ["Pay basis"], ["Quantity", true], ["Rate", true], ["Amount", true]].map(([h, right]) => (
                      <div key={String(h)} className={clsx("th", right && "rt")}><span>{h}</span></div>
                    ))}
                  </div>
                  <div className="tb2">
                    {loadLines.map((line) => (
                      <Fragment key={line.id}>
                        <div className="trow" style={{ gridTemplateColumns: "100px minmax(0,1fr) 110px 110px 120px" }} onClick={() => set({ screen: "load", loadId: line.load!.id, overlay: "none", modal: "none" })}>
                          {[cell.id(line.load!.name, () => set({ screen: "load", loadId: line.load!.id, overlay: "none", modal: "none" })), cell.text(line.description.replace(/^\S+\s/, ""), "", "t2"), cell.num(line.quantity), cell.money(money(line.rate), "", "t2"), cell.money(money(line.amount))].map((c, i2) => (
                            <DataCell key={i2} c={c} />
                          ))}
                        </div>
                      </Fragment>
                    ))}
                    {!loadLines.length ? <div className="cb fs12 mu">No loads on this statement.</div> : null}
                  </div>
                </div>
              </div>
            </section>
          </div>
          <aside className="c g16 stk5">
            <section className="card oh">
              <div className="ch"><h2 className="h2">Net pay</h2></div>
              <div className="cb c g4">
                <span className="mono" style={{ fontSize: "26px", lineHeight: "32px", fontWeight: "600" }}><span>{money(st.net_pay)}</span></span>
                <span className="fs12 t3"><span>{pays}</span></span>
              </div>
            </section>
            <section className="card oh">
              <div className="ch"><h2 className="h2">Payment</h2></div>
              <div className="cb">
                <dl className="kv kvw5">
                  <dt>Method</dt>
                  <dd>{st.paid_method ? (METHODS[st.paid_method] ?? st.paid_method) : "—"}</dd>
                  <dt>Paid on</dt>
                  <dd>{st.paid_on ? formatDate(st.paid_on) : "—"}</dd>
                  <dt>Reference</dt>
                  <dd className="mono">{st.paid_reference ?? "—"}</dd>
                </dl>
              </div>
            </section>
            <section className="card oh">
              <div className="ch"><h2 className="h2">Trail</h2></div>
              {trail.map((hh, i) => (
                <div key={i} className="wl ast">
                  <span className="dot" data-k={hh.k} style={{ marginTop: "6px" }}></span>
                  <div className="f1 mw0">
                    <div className="fs13 w5"><span>{hh.who}</span></div>
                    <div className="fs12 t3"><span>{hh.what}</span></div>
                  </div>
                  <span className="fs11 mu num nw"><span>{hh.when}</span></span>
                </div>
              ))}
            </section>
            {manage && allowed.has("void") ? (
              <section className="card oh">
                <div className="cb c g6">
                  <button className="btn sm bad" style={{ alignSelf: "flex-start" }} onClick={() => setAsking("void")}>Void statement</button>
                  <span className="fs12 mu">A voided statement stays on record; its loads and expenses can go on a new one.</span>
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
      {asking === "approve" || asking === "recalculate" ? (
        <Confirm
          title={asking === "approve" ? `Approve ${st.driver.name}’s pay?` : "Recalculate this statement?"}
          text={asking === "approve" ? `${money(st.net_pay)} for ${period}. The lines are fixed once approved.` : "Lines are rebuilt from the period’s completed loads and expenses. Lines added by hand are kept."}
          confirm={asking === "approve" ? "Approve" : "Recalculate"}
          onClose={() => setAsking(null)}
          run={() => act(() => run(asking), asking === "approve" ? `${st.driver.name}’s pay approved` : "Statement recalculated")}
        />
      ) : null}
      {asking === "void" ? (
        <Confirm
          title="Void this statement?"
          text="It stays on record as void. Its loads and expenses become available for a new statement."
          confirm="Void"
          destructive
          reason={{ label: "Reason", required: true }}
          onClose={() => setAsking(null)}
          run={({ reason }) => act(() => unwrap(api.POST("/api/v1/settlements/{settlement_id}/void", { params: { path: { settlement_id: st.id } }, body: { version: st.version, reason } })), "Statement voided")}
        />
      ) : null}
    </div>
  );
}
