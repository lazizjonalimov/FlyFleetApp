"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { BasicCell } from "@/components/data-table/cells";
import { ChangeDetail } from "@/components/data-table/change-detail";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { tx } from "@/features/console/dom";

/** Reports: on-time delivery and Fuel & IFTA. */
export function ReportsScreen() {
  const { isReports, RP, I, goFuel } = useConsole();
  if (!isReports) return null;
  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px", borderBottom: "1px solid var(--bd)" }}>
        <div className="f1">
          <div className="crumb">
            <span>Analytics</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>Reports</b>
          </div>
          <h1 className="h1">Reports</h1>
          <p className="sub">Every number ships with its definition, source, timezone and filters</p>
        </div>
        <div className="r g8">
          <button className="btn">
            <Icon className="s14" d="M3 5h18v16H3zM16 3v4M8 3v4M3 10h18" />
            Schedule
          </button>
          <button className="btn pri">
            <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            Export CSV
          </button>
        </div>
      </div>
      <div className="rpg">
        <nav className="rcat" aria-label="Report catalog">
          {RP.cat.map((g, i) => (
            <div key={i} className="c g2" style={{ marginBottom: "14px" }}>
              <div className="over" style={{ padding: "0 8px 6px" }}><span>{g.l}</span></div>
              {g.items.map((it, i2) => (
                <button key={i2} className={clsx("rci", it.on)} onClick={it.go} aria-current={it.cur}>
                  <span className="f1 ell"><span>{it.l}</span></span>
                  {it.lock ? (
                    <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="c g16" style={{ padding: "20px 24px 24px", overflow: "auto", minHeight: "0" }}>
          {RP.isOnTime ? (
            <div className="c g16 vz">
              <div className="r g12 ast">
                <div className="f1">
                  <h2 style={{ fontSize: "18px", lineHeight: "24px", fontWeight: "600" }}>On-time delivery</h2>
                  <p className="fs13 mu">Share of delivery stops that arrived inside the appointment window</p>
                </div>
                <button className="chip">
                  Last 8 weeks
                  <Icon className="s12 b" d="M18 6L6 18M6 6l12 12" />
                </button>
                <button className="chip add">
                  <Icon className="s12 b" d="M12 5v14M5 12h14" />
                  Customer
                </button>
              </div>
              <div className="kpis" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
                {RP.kpis.map((k, i) => (
                  <div key={i} className="kpi">
                    <span className="kl"><span>{k.label}</span></span>
                    <span className="kv2">
                      <span>{k.value}</span>
                      <small><span>{k.suffix}</span></small>
                    </span>
                    <span className="ks" data-k={k.sk}><span>{k.sub}</span></span>
                  </div>
                ))}
              </div>
              <div className="rgrid">
                <section className="card oh">
                  <div className="ch">
                    <h2 className="h2">By week</h2>
                    <span className="fs12 mu">Target 95%</span>
                    <span className="sp"></span>
                    <div className="seg sm">
                      <button className="on">%</button>
                      <button>Count</button>
                    </div>
                  </div>
                  <div className="lnch" role="group" aria-label={RP.ot.aria}>
                    <div className="cy">
                      {RP.ot.ticks.map((tk, i) => (
                        <span key={i}><span>{tk}</span></span>
                      ))}
                    </div>
                    <div className="lnpl" style={{ backgroundSize: `100% ${RP.ot.grid}` }}>
                      <svg viewBox={RP.ot.vb} preserveAspectRatio="none" aria-hidden="true"><path d={RP.ot.path} /></svg>
                      {RP.ot.ref ? (
                        <span className="lnref" style={{ top: RP.ot.ref.y }}><b><span>{RP.ot.ref.l}</span></b></span>
                      ) : null}
                      {RP.ot.pts.map((pt, i) => (
                        <span key={i} className="lnpt" style={{ left: pt.x, width: RP.ot.w }} tabIndex={0} aria-label={pt.aria}>
                          <span className="lndot" style={{ top: pt.y }}></span>
                          {pt.lab ? (
                            <span className={clsx("lnval", pt.lp)} style={{ top: pt.y }}><span>{pt.v}</span></span>
                          ) : null}
                          <span className="lntip" style={{ top: pt.y }}>
                            <b><span>{pt.v}</span></b>
                            <span>{"Week of "}<span>{pt.l}</span></span>
                            {pt.tip ? (
                              <span>{tx(pt.tip)}</span>
                            ) : null}
                          </span>
                          <span className="lnx"><span>{pt.l}</span></span>
                        </span>
                      ))}
                    </div>
                  </div>
                </section>
                <section className="card oh">
                  <div className="ch">
                    <h2 className="h2">Definition</h2>
                    <Icon className="s14 mu" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
                  </div>
                  <div className="cb c g10 fs12 t2" style={{ lineHeight: "17px" }}>
                    <p>
                      <b>On time</b>
                      {" — arrival event at a delivery stop at or before the end of its appointment window, or within 15 minutes of a fixed appointment."}
                    </p>
                    <dl className="kv" style={{ fontSize: "12px" }}>
                      <dt>Sources</dt>
                      <dd className="mono">load_stops, load_status_events</dd>
                      <dt>Timezone</dt>
                      <dd>Each stop’s local time</dd>
                      <dt>Excludes</dt>
                      <dd>Cancelled, on-hold loads</dd>
                      <dt>Access</dt>
                      <dd className="mono">reports.read</dd>
                      <dt>Generated</dt>
                      <dd className="num">11:20 CT · cached 5 min</dd>
                    </dl>
                  </div>
                </section>
              </div>
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">By customer</h2>
                  <span className="fs12 mu">Worst first</span>
                </div>
                <div className="thead" style={{ gridTemplateColumns: RP.t.cols }}>
                  {RP.t.head.map((h, i) => (
                    <span key={i} className={h.al}><span>{h.l}</span></span>
                  ))}
                </div>
                {RP.t.rows.map((r, i) => (
                  <Fragment key={i}>
                    <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: RP.t.cols }} onClick={r.open}>
                      {r.cells.map((c, i2) => (
                        <BasicCell key={i2} c={c} />
                      ))}
                    </div>
                    <ChangeDetail r={r} />
                  </Fragment>
                ))}
              </section>
            </div>
          ) : null}
          {RP.isFuel ? (
            <div className="c g16 vz">
              <div className="r g12 ast">
                <div className="f1">
                  <h2 style={{ fontSize: "18px", lineHeight: "24px", fontWeight: "600" }}>{"Fuel & IFTA"}</h2>
                  <p className="fs13 mu">What fuel costs per mile, which trucks burn the most, and where the quarter’s tax return stands</p>
                </div>
                <button className="chip">
                  Last 8 weeks
                  <Icon className="s12 b" d="M18 6L6 18M6 6l12 12" />
                </button>
                <button className="chip add">
                  <Icon className="s12 b" d="M12 5v14M5 12h14" />
                  Truck
                </button>
              </div>
              <div className="kpis" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
                {RP.fk?.map((k, i) => (
                  <div key={i} className="kpi">
                    <span className="kl"><span>{k.label}</span></span>
                    <span className="kv2">
                      <span>{k.value}</span>
                      <small><span>{k.suffix}</span></small>
                    </span>
                    <span className="ks" data-k={k.sk}><span>{k.sub}</span></span>
                  </div>
                ))}
              </div>
              <div className="rgrid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
                <section className="card oh">
                  <div className="ch">
                    <div className="f1 c">
                      <h2 className="h2">Fuel cost per mile</h2>
                      <span className="fs12 mu">By week · diesel price ÷ MPG</span>
                    </div>
                    <div className="seg sm" role="group" aria-label="Show as">
                      <button className={RP.cpmView?.c} aria-pressed={RP.cpmView?.cp} onClick={RP.cpmView?.toChart}>Chart</button>
                      <button className={RP.cpmView?.t} aria-pressed={RP.cpmView?.tp} onClick={RP.cpmView?.toTable}>Table</button>
                    </div>
                  </div>
                  {RP.cpmView?.chart ? (
                    <>
                      <div className="lntall">
                        <div className="lnch" role="group" aria-label={RP.cpm?.aria}>
                          <div className="cy">
                            {RP.cpm?.ticks?.map((tk, i) => (
                              <span key={i}><span>{tk}</span></span>
                            ))}
                          </div>
                          <div className="lnpl" style={{ backgroundSize: `100% ${RP.cpm?.grid ?? ""}` }}>
                            <svg viewBox={RP.cpm?.vb} preserveAspectRatio="none" aria-hidden="true"><path d={RP.cpm?.path} /></svg>
                            {RP.cpm?.ref ? (
                              <span className="lnref" style={{ top: String(RP.cpm?.ref.y ?? "") }}><b>{tx(RP.cpm?.ref.l)}</b></span>
                            ) : null}
                            {RP.cpm?.pts?.map((pt, i) => (
                              <span key={i} className="lnpt" style={{ left: pt.x, width: RP.cpm?.w }} tabIndex={0} aria-label={pt.aria}>
                                <span className="lndot" style={{ top: pt.y }}></span>
                                {pt.lab ? (
                                  <span className={clsx("lnval", pt.lp)} style={{ top: pt.y }}><span>{pt.v}</span></span>
                                ) : null}
                                <span className="lntip" style={{ top: pt.y }}>
                                  <b><span>{pt.v}</span></b>
                                  <span>{"Week of "}<span>{pt.l}</span></span>
                                  {pt.tip ? (
                                    <span><span>{pt.tip}</span></span>
                                  ) : null}
                                </span>
                                <span className="lnx"><span>{pt.l}</span></span>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="lnsum">
                        <div>
                          <b className="mono">$0.571</b>
                          <em>Lowest · week of Nov 2</em>
                        </div>
                        <div>
                          <b className="mono">$3.84–$3.97</b>
                          <em>Diesel, per gallon</em>
                        </div>
                        <div>
                          <b className="mono">6.61–6.73</b>
                          <em>Weekly MPG range</em>
                        </div>
                      </div>
                    </>
                  ) : null}
                  {RP.cpmView?.table ? (
                    <>
                      <div className="wtab h">
                        <span>Week of</span>
                        <span className="tr">Diesel</span>
                        <span className="tr">MPG</span>
                        <span className="tr">Per mile</span>
                      </div>
                      {" "}
                      {RP.cpmView?.rows?.map((w, i) => (
                        <div key={i} className="wtab">
                          <span className="mono"><span>{w.l}</span></span>
                          <span className="mono tr"><span>{w.p}</span></span>
                          <span className="mono tr"><span>{w.m}</span></span>
                          <span className="mono tr w5"><span>{w.v}</span></span>
                        </div>
                      ))}
                    </>
                  ) : null}
                </section>
                <section className="card oh">
                  <div className="ch">
                    <div className="f1 c">
                      <h2 className="h2">MPG by truck</h2>
                      <span className="fs12 mu">Q4 so far · best first · 12 of 41 trucks</span>
                    </div>
                  </div>
                  <ol className="rk dplot" style={{ padding: "10px 10px 0" }} aria-label="Trucks by miles per gallon, best first">
                    {RP.mpg?.map((r, i) => (
                      <li key={i} className="rkr" title={r.aria} aria-label={r.aria}>
                        <span className="rkn ell"><span>{r.n}</span></span>
                        <span className="dpt">
                          <i className="dpa" style={{ left: RP.mpgRef }}></i>
                          <i className="dps" style={{ left: r.sl, width: r.sw }}></i>
                          <i className="dpd" style={{ left: r.x }}></i>
                        </span>
                        <span className="rkv mono tr"><span>{r.v}</span></span>
                      </li>
                    ))}
                  </ol>
                  <div className="dpax" aria-hidden="true">
                    <span></span>
                    <div className="axl">
                      {RP.mpgAx?.map((t, i) => (
                        <b key={i} className="axt" style={{ left: t.x }}><span>{t.l}</span></b>
                      ))}
                    </div>
                    <span></span>
                  </div>
                  <div className="rkey">
                    <i></i>
                    Fleet average 6.70 MPG · each line runs from the average to the truck
                  </div>
                </section>
              </div>
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">Definitions</h2>
                  <Icon className="s14 mu" d={I.info} />
                  <span className="sp"></span>
                  <button className="lnk" onClick={goFuel}>{"Open Fuel & IFTA"}</button>
                </div>
                <div className="cb c g8 fs12 t2" style={{ lineHeight: "17px" }}>
                  <p>
                    <b>MPG</b>
                    {" — miles driven (GPS, CSV imports and manual trips) divided by gallons bought on fuel cards and receipts in the same period. "}
                    <b>Fuel cost per mile</b>
                    {" — the week’s average diesel price divided by that week’s MPG."}
                  </p>
                  <dl className="kv" style={{ fontSize: "12px" }}>
                    <dt>Sources</dt>
                    <dd className="mono">fuel_purchases, ifta_trip_segments</dd>
                    <dt>Period</dt>
                    <dd>Weeks start Monday, carrier’s local time</dd>
                    <dt>Access</dt>
                    <dd className="mono">finance.fuel.read</dd>
                  </dl>
                </div>
              </section>
            </div>
          ) : null}
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Exports</h2>
              <span className="fs12 mu">Large exports run in the background and expire after 24 h</span>
            </div>
            {RP.jobs.map((j, i) => (
              <div key={i} className="wl">
                <span className="eqic"><Icon className="s14" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" /></span>
                <div className="f1">
                  <div className="fs13 w5"><span>{j.n}</span></div>
                  <div className="fs12 mu"><span>{j.d}</span></div>
                </div>
                <span className="badge" data-k={j.k}>
                  <i></i>
                  <span>{j.st}</span>
                </span>
                <button className="btn xs" disabled={j.dis}>Download</button>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
