"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { BasicCell } from "@/components/data-table/cells";
import { ChangeDetail } from "@/components/data-table/change-detail";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { tx } from "@/features/console/dom";

/** Role-aware dashboard: KPIs, financials, exceptions, today’s work and fleet availability. */
export function DashboardScreen() {
  const { isDash, D, goNew, goReports, BZ, goAlerts } = useConsole();
  if (!isDash) return null;
  return (
    <div className="scr">
      <div className="ph">
        <div className="f1">
          <div className="crumb">
            <span>Overview</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>Dashboard</b>
          </div>
          <h1 className="h1"><span>{D.title}</span></h1>
          <p className="sub"><span>{D.sub}</span></p>
        </div>
        <div className="r g8">
          <div className="seg" role="group" aria-label="Period">
            <button className="on">Today</button>
            <button>This week</button>
            <button>This month</button>
          </div>
          {D.canCreate ? (
            <button className="btn pri" onClick={goNew}>
              <Icon className="s14 b" d="M12 5v14M5 12h14" />
              New load
            </button>
          ) : null}
        </div>
      </div>
      <div className="kpis" style={{ margin: "0 24px", gridTemplateColumns: "repeat(6,minmax(0,1fr))" }}>
        {D.kpis.map((k, i) => (
          <button key={i} className="kpi" onClick={k.go}>
            <span className="kl">
              <span className="dot" data-k={k.k}></span>
              <span className="ell"><span>{k.label}</span></span>
            </span>
            <span className="kv2">
              <span>{k.value}</span>
              <small><span>{k.suffix}</span></small>
            </span>
            <span className="ks" data-k={k.sk}><span>{k.sub}</span></span>
          </button>
        ))}
      </div>
      {D.biz ? (
        <>
          <div className="r g8" style={{ padding: "20px 24px 0" }}>
            <span className="over">Financials</span>
            <span className="fs12 mu">Nov 1–13 · revenue, customers and costs</span>
            <span className="sp"></span>
            <span className="r g4 fs12 mu">
              <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
              Shown to roles with finance access
            </span>
            <button className="lnk" style={{ marginLeft: "10px" }} onClick={goReports}>Open reports</button>
          </div>
          <div className="biz vz">
            <section className="card c" aria-label="Invoiced revenue by week">
              <div className="ch" style={{ minHeight: "58px" }}>
                <div className="f1 c">
                  <h2 className="h2">Invoiced revenue by week</h2>
                  <span className="fs12 mu">Last 12 weeks</span>
                </div>
                <div className="seg sm" role="group" aria-label="Show revenue by week as">
                  <button className={BZ.w.c} onClick={BZ.w.chart} aria-pressed={BZ.w.cp}>Chart</button>
                  <button className={BZ.w.t} onClick={BZ.w.table} aria-pressed={BZ.w.tp}>Table</button>
                </div>
              </div>
              <div className="cb c g12">
                <div className="bzh">
                  <span className="bzv">$184.2k</span>
                  <span className="fs12 t3">invoiced Nov 1–13</span>
                  <span className="dlt">▲ 9% vs Oct 1–13</span>
                </div>
                {BZ.w.showChart ? (
                  <div className="wk" role="group" aria-label="Columns, one per week">
                    <div className="wky" aria-hidden="true">
                      <span>$120K</span>
                      <span>$80K</span>
                      <span>$40K</span>
                      <span>$0</span>
                    </div>
                    <div className="wkp">
                      {BZ.w.bars.map((b, i) => (
                        <button key={i} className="wkc" aria-label={b.aria} onMouseEnter={b.on} onFocus={b.on} onMouseLeave={BZ.off} onBlur={BZ.off}>
                          <span className={clsx("wkb", b.cls)} style={{ height: b.h }}></span>
                          {b.tip ? (
                            <span className={clsx("vtip", b.tcls)} style={{ bottom: b.h }}>
                              <b><span>{b.tv}</span></b>
                              <span><span>{b.tl}</span></span>
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                    <div className="wkx" aria-hidden="true">
                      {BZ.w.xl.map((x, i) => (
                        <span key={i}><span>{x.l}</span></span>
                      ))}
                    </div>
                    <div className="wkn">
                      <i></i>
                      Lighter column: this week so far ($61.5k)
                    </div>
                  </div>
                ) : null}
                {BZ.w.showTable ? (
                  <div className="vt" role="table" aria-label="Invoiced revenue by week">
                    {" "}
                    <div className="vtr vth" role="row">
                      <span role="columnheader">Week of</span>
                      <span role="columnheader" className="r2">Invoiced</span>
                    </div>
                    {" "}
                    {BZ.w.rows.map((r, i) => (
                      <div key={i} className="vtr" role="row">
                        <span role="cell"><span>{r.l}</span></span>
                        <span role="cell" className="r2"><span>{r.v}</span></span>
                      </div>
                    ))}
                    {" "}
                  </div>
                ) : null}
              </div>
            </section>
            <section className="card c" aria-label="Revenue by customer">
              <div className="ch" style={{ minHeight: "58px" }}>
                <div className="f1 c">
                  <h2 className="h2">Revenue by customer</h2>
                  <span className="fs12 mu">Nov 1–13</span>
                </div>
                <div className="seg sm" role="group" aria-label="Show revenue by customer as">
                  <button className={BZ.c.c} onClick={BZ.c.chart} aria-pressed={BZ.c.cp}>Chart</button>
                  <button className={BZ.c.t} onClick={BZ.c.table} aria-pressed={BZ.c.tp}>Table</button>
                </div>
              </div>
              <div className="cb">
                {BZ.c.showChart ? (
                  <>
                    <ol className="rk" aria-label="Largest customers first">
                      {BZ.c.rows.map((r, i) => (
                        <li key={i} className="rkr">
                          <span className="rkn ell"><span>{r.n}</span></span>
                          <span className="rkt">
                            <span className={clsx("rkb", r.cls)} style={{ width: r.w }}></span>
                            <span className="rkv"><span>{r.v}</span></span>
                          </span>
                          <span className="rks"><span>{r.pct}</span></span>
                        </li>
                      ))}
                    </ol>
                    <p className="note" style={{ marginTop: "10px" }}>
                      <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
                      <span>Walmart is 26% of November so far. Shares over 30% get flagged as concentration risk.</span>
                    </p>
                  </>
                ) : null}
                {BZ.c.showTable ? (
                  <div className="vt" role="table" aria-label="Revenue by customer">
                    {" "}
                    <div className="vtr vth" role="row">
                      <span role="columnheader">Customer</span>
                      <span role="columnheader" className="r2">Invoiced</span>
                      <span role="columnheader" className="r2">Share</span>
                    </div>
                    {" "}
                    {BZ.c.rows.map((r, i) => (
                      <div key={i} className="vtr" role="row">
                        <span role="cell"><span>{r.n}</span></span>
                        <span role="cell" className="r2"><span>{r.v}</span></span>
                        <span role="cell" className="r2"><span>{r.pct}</span></span>
                      </div>
                    ))}
                    {" "}
                  </div>
                ) : null}
              </div>
            </section>
            <section className="card c" aria-label="Where each dollar went">
              <div className="ch" style={{ minHeight: "58px" }}>
                <div className="f1 c">
                  <h2 className="h2">Where each dollar went</h2>
                  <span className="fs12 mu">October · $412.6k revenue</span>
                </div>
                <div className="seg sm" role="group" aria-label="Show the cost split as">
                  <button className={BZ.s.c} onClick={BZ.s.chart} aria-pressed={BZ.s.cp}>Chart</button>
                  <button className={BZ.s.t} onClick={BZ.s.table} aria-pressed={BZ.s.tp}>Table</button>
                </div>
              </div>
              <div className="cb c g14">
                {BZ.s.showChart ? (
                  <>
                    <div className="sgb" role="group" aria-label="October revenue split into costs and margin">
                      {BZ.s.parts.map((p, i) => (
                        <button key={i} className={clsx("sgs", p.cls)} style={{ flex: `${p.f} 1 0px`, background: `var(--${p.v})` }} aria-label={p.aria} onMouseEnter={p.on} onFocus={p.on} onMouseLeave={BZ.off} onBlur={BZ.off}>
                          {p.showPct ? (
                            <span><span>{p.pct}</span></span>
                          ) : null}
                          {p.tip ? (
                            <span className={clsx("vtip", p.tcls)} style={{ bottom: "100%" }}>
                              <b><span>{p.amt}</span></b>
                              <span><span>{p.n}</span>{" · "}<span>{p.pct}</span></span>
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                    <div className="lgd" aria-hidden="true">
                      {BZ.s.parts.map((p, i) => (
                        <span key={i}>
                          <i style={{ background: `var(--${p.v})` }}></i>
                          <span>{p.n}</span>
                        </span>
                      ))}
                    </div>
                    <div className="bzs">
                      <div>
                        <span className="fs12 t3">Operating ratio</span>
                        <span className="fs16 w6 tx">86%</span>
                      </div>
                      <div>
                        <span className="fs12 t3">Revenue per mile</span>
                        <span className="fs16 w6 tx">$2.61</span>
                      </div>
                      <div>
                        <span className="fs12 t3">Cost per mile</span>
                        <span className="fs16 w6 tx">$2.24</span>
                      </div>
                    </div>
                  </>
                ) : null}
                {BZ.s.showTable ? (
                  <div className="vt" role="table" aria-label="October revenue split">
                    {" "}
                    <div className="vtr vth" role="row">
                      <span role="columnheader">Part</span>
                      <span role="columnheader" className="r2">Amount</span>
                      <span role="columnheader" className="r2">Share</span>
                    </div>
                    {" "}
                    {BZ.s.rows.map((r, i) => (
                      <div key={i} className="vtr" role="row">
                        <span role="cell"><span>{r.n}</span></span>
                        <span role="cell" className="r2"><span>{r.v}</span></span>
                        <span role="cell" className="r2"><span>{r.pct}</span></span>
                      </div>
                    ))}
                    {" "}
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </>
      ) : null}
      <div className="dgrid">
        <div className="c g16">
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Needs attention</h2>
              <span className="cnt" data-k="bad"><span>{D.attnN}</span></span>
              <span className="sp"></span>
              <button className="lnk" onClick={goAlerts}>View all exceptions</button>
            </div>
            {D.attn.map((a, i) => (
              <div key={i} className="attn">
                <span className="badge" data-k={a.k}>
                  <i></i>
                  <span>{a.tag}</span>
                </span>
                <div className="mw0">
                  <div className="r g8">
                    <span className="fs13 w5 ell"><span>{a.title}</span></span>
                    <span className={clsx("fs12 t3 w5 nw", a.rc)}><span>{a.ref}</span></span>
                  </div>
                  <div className="fs12 mu ell"><span>{a.meta}</span></div>
                </div>
                <span className="fs12 mu num rt"><span>{a.time}</span></span>
                <button className="btn sm" onClick={a.go}><span>{a.action}</span></button>
              </div>
            ))}
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2"><span>{D.t.title}</span></h2>
              <span className="fs12 mu"><span>{D.t.sub}</span></span>
              <span className="sp"></span>
              <button className="lnk" onClick={D.t.go}><span>{D.t.link}</span></button>
            </div>
            <div className="thead" style={{ gridTemplateColumns: D.t.cols }}>
              {D.t.head.map((h, i) => (
                <span key={i} className={h.al}><span>{h.l}</span></span>
              ))}
            </div>
            {D.t.rows.map((r, i) => (
              <Fragment key={i}>
                <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: D.t.cols }} onClick={r.open}>
                  {r.cells.map((c, i2) => (
                    <BasicCell key={i2} c={c} />
                  ))}
                </div>
                <ChangeDetail r={r} />
              </Fragment>
            ))}
          </section>
        </div>
        <div className="c g16">
          {D.side.map((w, i) => (
            <section key={i} className="card oh">
              <div className="ch">
                <h2 className="h2"><span>{w.title}</span></h2>
                <span className="sp"></span>
                {w.link ? (
                  <button className="lnk" onClick={w.go}><span>{w.link}</span></button>
                ) : null}
                {w.note ? (
                  <span className="fs12 mu"><span>{w.note}</span></span>
                ) : null}
              </div>
              {w.isAvail ? (
                <div className="cb c g16">
                  {w.rows?.map((f, i2) => (
                    <div key={i2} className="c g6">
                      <div className="r jb fs13">
                        <span className="w5"><span>{f.label}</span></span>
                        <span className="fs12 mu num"><span>{f.total}</span>{" total"}</span>
                      </div>
                      <div className="segbar">
                        {f.segs.map((sg, i3) => (
                          <span key={i3} data-k={sg.k} style={{ width: sg.w }}></span>
                        ))}
                      </div>
                      <div className="r wrap" style={{ columnGap: "12px", rowGap: "2px" }}>
                        {f.segs.map((sg, i3) => (
                          <span key={i3} className="r g4 fs12 t3">
                            <span className="qd" data-k={sg.k} style={{ width: "7px", height: "7px", borderRadius: "2px" }}></span>
                            <span>{sg.l}</span>
                            <span className="w6 tx num"><span>{sg.n}</span></span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {w.isList ? (
                w.items?.map((x, i2) => (
                  <div key={i2} className="wl">
                    <div className="f1">
                      <div className="fs13 w5 ell">{tx(x.a)}</div>
                      <div className="fs12 mu ell">{tx(x.b)}</div>
                    </div>
                    <span className="tag mono" data-k={x.k}>{tx(x.chip)}</span>
                  </div>
                ))
              ) : null}
              {w.isMoney ? (
                <>
                  <div className="money">
                    {w.items?.map((m, i2) => (
                      <div key={i2} className="c g2">
                        <span className="r g6 fs12 t3 w5">
                          <span className="dot" data-k={m.k}></span>
                          {tx(m.label)}
                        </span>
                        <span className="fs20 w6 num mono">{tx(m.v)}</span>
                        <span className="fs12 mu">{tx(m.s)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="note" style={{ padding: "0 16px 14px" }}>
                    <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
                    <span>{tx(w.foot)}</span>
                  </p>
                </>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
