"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { BasicCell } from "@/components/data-table/cells";
import { ChangeDetail } from "@/components/data-table/change-detail";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Fuel & IFTA: purchases, mileage, quarterly return and tax rates. */
export function FuelScreen() {
  const { isFuel, FU, I, goAudit } = useConsole();
  if (!isFuel) return null;
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
          <p className="sub"><span>{FU.sub}</span></p>
        </div>
        <div className="r g8">
          <button className="btn" onClick={FU.importMi}>
            <Icon className="s14" d={I.sheet} />
            Import mileage
          </button>
          <button className="btn" onClick={FU.scan}>
            <Icon className="s14" d={I.camera} />
            Scan a receipt
          </button>
          <button className="btn pri" onClick={FU.connect}>
            <Icon className="s14 b" d="M12 5v14M5 12h14" />
            Connect a fuel card
          </button>
        </div>
      </div>
      <div className="kpis" style={{ margin: "0 24px 14px", gridTemplateColumns: "repeat(5,minmax(0,1fr))" }}>
        {FU.kpis.map((k, i) => (
          <div key={i} className="kpi">
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
        {FU.tabs.map((t, i) => (
          <button key={i} className={clsx("tab", t.on)} onClick={t.go} aria-current={t.cur}>
            <span>{t.l}</span>
            {t.n ? (
              <span className="tcnt"><span>{t.n}</span></span>
            ) : null}
            {t.dot ? (
              <span className="dot" data-k={t.dot}></span>
            ) : null}
          </button>
        ))}
        <span className="tright"><button className="lnk" onClick={FU.reports}>{"Fuel & IFTA reports"}</button></span>
      </div>
      <div className="fubody">
        {FU.isP ? (
          <div className="fugrid r3">
            <section className="card oh c">
              <div className="ch">
                <h2 className="h2">Purchases</h2>
                <span className="fs12 mu"><span>{FU.count}</span></span>
                <span className="sp"></span>
                <div className="seg sm" role="group" aria-label="Show purchases">
                  <button className="on" aria-pressed="true">All</button>
                  <button aria-pressed="false">Flagged · 3</button>
                  <button aria-pressed="false">Receipts · 3</button>
                </div>
              </div>
              <div className="thead" style={{ gridTemplateColumns: FU.t.cols }}>
                {FU.t.head.map((h, i) => (
                  <span key={i} className={h.al}><span>{h.l}</span></span>
                ))}
              </div>
              <div className="tbody">
                {FU.t.rows.map((r, i) => (
                  <Fragment key={i}>
                    <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: FU.t.cols }} onClick={r.open}>
                      {r.cells.map((c, i2) => (
                        <BasicCell key={i2} c={c} />
                      ))}
                    </div>
                    <ChangeDetail r={r} />
                  </Fragment>
                ))}
              </div>
              <div className="tfoot">
                <span className="num"><span>{FU.foot}</span></span>
                <span className="sp"></span>
                <button className="lnk">View all purchases</button>
              </div>
            </section>
            <div className="c g16">
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">Receipts</h2>
                  <span className="tag" data-k="info">1 to review</span>
                  <span className="sp"></span>
                  <button className="lnk" onClick={FU.scan}>Scan a receipt</button>
                </div>
                {FU.rcpts.map((x, i) => (
                  <button key={i} className="wl" style={{ width: "100%", border: "none", background: "none", textAlign: "left" }} onClick={x.go}>
                    <span className="plogo" data-k={x.k}><Icon className="s14" d={I.file} /></span>
                    <div className="f1">
                      <div className="fs13 w5 ell"><span>{x.t}</span></div>
                      <div className="fs12 mu ell"><span>{x.d}</span></div>
                    </div>
                    <span className="badge" data-k={x.k}>
                      <i></i>
                      <span>{x.st}</span>
                    </span>
                  </button>
                ))}
              </section>
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">{"Fuel cards & data"}</h2>
                  <span className="sp"></span>
                  <button className="lnk" onClick={FU.connect}>Integrations</button>
                </div>
                {FU.prov.map((pv, i) => (
                  <div key={i} className="wl">
                    <span className="plogo" data-k={pv.k}><span>{pv.ini}</span></span>
                    <div className="f1">
                      <div className="fs13 w5"><span>{pv.n}</span></div>
                      <div className="fs12 mu ell"><span>{pv.d}</span></div>
                    </div>
                    {pv.on ? (
                      <span className="badge" data-k="ok">
                        <i></i>
                        Connected
                      </span>
                    ) : null}
                    {pv.off ? (
                      <button className="btn xs">Connect</button>
                    ) : null}
                  </div>
                ))}
              </section>
            </div>
          </div>
        ) : null}
        {FU.isM ? (
          <div className="fugrid r3 vz">
            <section className="card oh c">
              <div className="ch">
                <div className="f1 c">
                  <h2 className="h2">Miles by truck and state</h2>
                  <span className="fs12 mu">Q4 so far · Oct 1 – Nov 13 · MPG = miles ÷ gallons bought</span>
                </div>
                <button className="btn sm" onClick={FU.importMi}>
                  <Icon className="s14" d={I.sheet} />
                  Import CSV
                </button>
                <button className="btn sm" onClick={FU.addTrip}>
                  <Icon className="s14 b" d="M12 5v14M5 12h14" />
                  Add a trip
                </button>
              </div>
              <div className="thead" style={{ gridTemplateColumns: FU.mi.cols }}>
                {FU.mi.head.map((h, i) => (
                  <span key={i} className={h.al}><span>{h.l}</span></span>
                ))}
              </div>
              <div className="tbody">
                {FU.mi.rows.map((r, i) => (
                  <Fragment key={i}>
                    <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: FU.mi.cols }} onClick={r.open}>
                      {r.cells.map((c, i2) => (
                        <BasicCell key={i2} c={c} />
                      ))}
                    </div>
                    <ChangeDetail r={r} />
                  </Fragment>
                ))}
              </div>
              <div className="tfoot">
                <span className="num">Showing 12 of 41 trucks · the total row is the whole fleet</span>
                <span className="sp"></span>
                <button className="lnk">Export CSV</button>
              </div>
            </section>
            <div className="c g16">
              <section className="card oh">
                <div className="ch" style={{ minHeight: "58px" }}>
                  <div className="f1 c">
                    <h2 className="h2">GPS state-line allocation</h2>
                    <span className="fs12 mu">FF-24817 · Fort Worth → Oklahoma City · in transit</span>
                  </div>
                </div>
                <div className="mmap" role="img" aria-label={FU.map.aria}>
                  <svg viewBox={FU.map.vb} aria-hidden="true">
                    <path className="st" d={FU.map.border} />
                    <path className="rdc" d={FU.map.roads} />
                    <path className="rd" d={FU.map.roads} />
                    <path className="plan" d={FU.map.plan} />
                    <path className="p1" d={FU.map.tx} />
                    <path className="p2" d={FU.map.okp} />
                  </svg>
                  {FU.map.labels.map((lb, i) => (
                    <span key={i} className="lb" style={{ left: lb.x, top: lb.y }}><span>{lb.t}</span></span>
                  ))}
                  {FU.map.cities.map((cty, i) => (
                    <span key={i} className="cty" style={{ left: cty.x, top: cty.y }}><span>{cty.n}</span></span>
                  ))}
                  <span className="xing" style={{ left: FU.map.xing.x, top: FU.map.xing.y }}></span>
                  <span className="trk" style={{ left: FU.map.truck.x, top: FU.map.truck.y }}></span>
                </div>
                <div className="c g6" style={{ padding: "8px 16px 14px" }}>
                  <div className="r g8 fs13">
                    <i style={{ width: "16px", height: "4px", borderRadius: "2px", background: "var(--v1)", flex: "none" }}></i>
                    <span className="f1">Texas</span>
                    <span className="mono w6">98.4 mi</span>
                  </div>
                  <div className="r g8 fs13">
                    <i style={{ width: "16px", height: "4px", borderRadius: "2px", background: "var(--v2)", flex: "none" }}></i>
                    <span className="f1">Oklahoma, so far</span>
                    <span className="mono w6">29.6 mi</span>
                  </div>
                  <p className="fs12 mu" style={{ marginTop: "4px" }}>
                    Samsara positions every minute. Each mile goes to the state it was driven in, split where the truck crossed the Red River at 08:41.
                  </p>
                </div>
              </section>
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">Gaps to review</h2>
                  <span className="tag" data-k="warn">1 open</span>
                </div>
                <div className="cb c g8">
                  <div className="r g8 ast">
                    <span className="plogo" data-k="warn"><Icon className="s14" d={I.wifioff} /></span>
                    <div className="f1">
                      <div className="fs13 w5">T-1149 · Nov 12 · 22:10–22:57</div>
                      <div className="fs12 mu">No GPS for 47 min. 38 mi filled along the routed path on I-35E, all in Texas.</div>
                    </div>
                  </div>
                  <div className="r g8" style={{ paddingLeft: "38px" }}>
                    <button className="btn sm pri">Accept 38 mi</button>
                    <button className="btn sm">Edit</button>
                  </div>
                </div>
              </section>
              <section className="card oh">
                <div className="ch"><h2 className="h2">{"Imports & manual trips"}</h2></div>
                {FU.imps.map((x, i) => (
                  <div key={i} className="wl">
                    <span className="xls" style={{ width: "30px", height: "34px" }}><span>{x.ext}</span></span>
                    <div className="f1">
                      <div className="fs13 w5 ell"><span>{x.t}</span></div>
                      <div className="fs12 mu ell"><span>{x.d}</span></div>
                    </div>
                    <span className="badge" data-k={x.k}>
                      <i></i>
                      <span>{x.st}</span>
                    </span>
                  </div>
                ))}
              </section>
            </div>
          </div>
        ) : null}
        {FU.isR ? (
          <div className="fugrid r3">
            <div className="c g16">
              <section className="card oh c">
                <div className="ch">
                  <h2 className="h2">Q4 2026 return</h2>
                  <span className="tag" data-k="info">Estimate · still collecting</span>
                  <span className="sp"></span>
                  <div className="seg sm" role="group" aria-label="Quarter">
                    <button className="on" aria-pressed="true">Q4 2026</button>
                    <button aria-pressed="false">Q3 2026</button>
                    <button aria-pressed="false">Q2 2026</button>
                  </div>
                </div>
                <div className="thead" style={{ gridTemplateColumns: FU.rt.cols }}>
                  {FU.rt.head.map((h, i) => (
                    <span key={i} className={h.al}><span>{h.l}</span></span>
                  ))}
                </div>
                <div className="tbody">
                  {FU.rt.rows.map((r, i) => (
                    <Fragment key={i}>
                      <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: FU.rt.cols }} onClick={r.open}>
                        {r.cells.map((c, i2) => (
                          <BasicCell key={i2} c={c} />
                        ))}
                      </div>
                      <ChangeDetail r={r} />
                    </Fragment>
                  ))}
                </div>
                <div className="rtnote">
                  <Icon className="s14" d={I.info} style={{ marginTop: "1px" }} />
                  <span><span>{FU.rnote}</span></span>
                </div>
              </section>
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">Exports</h2>
                  <span className="fs12 mu">Q4 2026 estimate, as of today</span>
                  <span className="sp"></span>
                  <button className="btn sm">
                    <Icon className="s14" d={I.download} />
                    CSV
                  </button>
                  <button className="btn sm">
                    <Icon className="s14" d={I.download} />
                    PDF
                  </button>
                </div>
                <div className="cb fs12 t2">
                  The PDF follows the jurisdiction schedule your base state asks for. The CSV has one row per truck, state and trip, so every number on the return traces back to GPS, an import or a manual trip.
                </div>
              </section>
            </div>
            <div className="c g16">
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">Filing status</h2>
                  <span className="fs12 mu">Q4 2026 · due Jan 31, 2027</span>
                </div>
                <ol className="stl">
                  {FU.steps.map((s, i) => (
                    <li key={i} className={s.cls}>
                      <span className="n"><span>{s.n}</span></span>
                      <span>
                        <b><span>{s.t}</span></b>
                        <br />
                        <span>{s.d}</span>
                      </span>
                      <span className="fs11 mu nw"><span>{s.w}</span></span>
                    </li>
                  ))}
                </ol>
              </section>
              <section className="card oh">
                <div className="ch"><h2 className="h2">Past returns</h2></div>
                {FU.past.map((x, i) => (
                  <div key={i} className="wl">
                    <div className="f1">
                      <div className="fs13 w5"><span>{x.q}</span></div>
                      <div className="fs12 mu"><span>{x.d}</span></div>
                    </div>
                    <span className="mono fs13 w6"><span>{x.amt}</span></span>
                    <span className="badge" data-k="ok">
                      <i></i>
                      <span>{x.st}</span>
                    </span>
                    <button className="btn xs ghost">PDF</button>
                  </div>
                ))}
              </section>
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">{"Review & approval · Q3 2026"}</h2>
                  <button className="lnk" style={{ marginLeft: "auto" }} onClick={goAudit}>Audit log</button>
                </div>
                {FU.hist.map((hh, i) => (
                  <div key={i} className="wl" style={{ alignItems: "flex-start" }}>
                    <span className="dot" data-k={hh.k} style={{ marginTop: "6px" }}></span>
                    <div className="f1 fs12 t2">
                      <b className="tx"><span>{hh.who}</span></b>
                      {" "}<span>{hh.what}</span>
                    </div>
                    <span className="fs11 mu num nw"><span>{hh.when}</span></span>
                  </div>
                ))}
              </section>
            </div>
          </div>
        ) : null}
        {FU.isT ? (
          <div className="c g16" style={{ padding: "16px 24px 24px" }}>
            <div className="banner" data-k="info">
              <Icon d={I.info} />
              <div className="f1">
                <div className="bt">Rates come from the IFTA, Inc. tax matrix each quarter</div>
                <div>
                  The Q4 2026 matrix was updated Nov 10 and becomes final Dec 4. Each return keeps the rates it was calculated with, and a change shows up here and in the audit log before it touches a return.
                </div>
              </div>
            </div>
            <section className="card oh c">
              <div className="ch">
                <h2 className="h2">Diesel rates · Q4 2026</h2>
                <span className="fs12 mu">Jurisdictions your trucks ran in, then neighbors</span>
                <span className="sp"></span>
                <label className="search" style={{ width: "220px", height: "28px" }}>
                  <Icon className="s14" d={I.search} />
                  <input placeholder="Find a state" aria-label="Find a state" />
                </label>
              </div>
              <div className="thead" style={{ gridTemplateColumns: FU.rates.cols }}>
                {FU.rates.head.map((h, i) => (
                  <span key={i} className={h.al}><span>{h.l}</span></span>
                ))}
              </div>
              <div className="tbody">
                {FU.rates.rows.map((r, i) => (
                  <Fragment key={i}>
                    <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: FU.rates.cols }} onClick={r.open}>
                      {r.cells.map((c, i2) => (
                        <BasicCell key={i2} c={c} />
                      ))}
                    </div>
                    <ChangeDetail r={r} />
                  </Fragment>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
