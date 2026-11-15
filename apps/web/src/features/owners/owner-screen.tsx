"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { DataCell } from "@/components/data-table/cells";
import { ChangeDetail } from "@/components/data-table/change-detail";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { tx } from "@/features/console/dom";

/** Equipment owner record with its nine tabs. */
export function OwnerScreen() {
  const { isOwner, OW, goOwners, I } = useConsole();
  if (!isOwner) return null;
  return (
    <div className="col">
      <div className="ph" style={{ alignItems: "center", paddingBottom: "14px" }}>
        <span className="omk lg" data-k={OW.ek}><span>{OW.ini}</span></span>
        <div className="f1 mw0">
          <div className="crumb" style={{ marginBottom: "2px" }}>
            <span>Directory</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <button onClick={goOwners}>Owners</button>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b><span>{OW.n}</span></b>
          </div>
          <div className="r g10 wrap">
            <h1 className="h1 nw"><span>{OW.n}</span></h1>
            <span className="tag" data-k={OW.ek}><span>{OW.el}</span></span>
            <span className="tag" data-k={OW.ck}><span>{OW.cl}</span></span>
            <span className="badge" data-k={OW.sk}>
              <i></i>
              <span>{OW.st}</span>
            </span>
          </div>
          <p className="sub ell"><span>{OW.sub}</span></p>
        </div>
        <div className="r g8">
          <button className="btn icon" aria-label="Message"><Icon className="s14" d={I.msg} /></button>
          <button className="btn" onClick={OW.edit}>
            <Icon className="s14" d={I.pencil} />
            Edit
          </button>
          {OW.hasPortal ? (
            <button className="btn" onClick={OW.portalPreview}>
              <Icon className="s14" d={I.eye} />
              Their portal
            </button>
          ) : null}
          {OW.hasStmt ? (
            <button className="btn pri" onClick={OW.openStmt}>
              <Icon className="s14" d={I.file} />
              Settlement
            </button>
          ) : null}
        </div>
      </div>
      <div className="tabs">
        {OW.tabs.map((t, i) => (
          <button key={i} className={clsx("tab", t.on)} onClick={t.go}>
            <span>{t.l}</span>
            {t.n ? (
              <span className="tcnt"><span>{t.n}</span></span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="opg5">
        {OW.banner ? (
          <div className="banner" data-k={OW.banner.k}>
            <Icon d={I.alert} />
            <div className="f1">
              <div className="bt"><span>{OW.banner.t}</span></div>
              <div><span>{OW.banner.d}</span></div>
            </div>
            <button className="btn sm"><span>{OW.banner.b}</span></button>
          </div>
        ) : null}
        {OW.t.ov ? (
          <>
            {OW.act5 ? (
              <div className="tb5">
                <div className="seg" role="group" aria-label="Date range">
                  {OW.ranges.map((rg, i) => (
                    <button key={i} className={rg.on} onClick={rg.go}><span>{rg.l}</span></button>
                  ))}
                </div>
                <span className="tb5d"></span>
                <div className="r g6 wrap" role="group" aria-label="Units">
                  {OW.units.map((un, i) => (
                    <button key={i} className={clsx("chip5", un.on)} onClick={un.go}><span>{un.l}</span></button>
                  ))}
                </div>
                <span className="sp"></span>
                <span className="fs12 mu"><span>{OW.filt}</span></span>
              </div>
            ) : null}
            <div className="kpis" style={{ gridTemplateColumns: "repeat(6,minmax(0,1fr))" }}>
              {OW.cards.map((k, i) => (
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
            <div className="g21-5">
              {OW.onb ? (
                <section className="card oh">
                  <div className="ch">
                    <div className="f1 c">
                      <h2 className="h2">Onboarding checklist</h2>
                      <span className="fs12 mu">T-1195 stays out of dispatch until every line is green</span>
                    </div>
                    <span className="mono fs13 w6">{tx(OW.chk?.done)}</span>
                  </div>
                  <div className="cb" style={{ paddingBottom: "6px" }}>
                    <div className="mm5bar" style={{ margin: "0" }}><i data-v="v3" style={{ width: OW.chk?.pct }}></i></div>
                  </div>
                  {OW.chk?.items?.map((ck, i) => (
                    <div key={i} className="wl">
                      <span className="dot" data-k={ck.k}></span>
                      <div className="f1 mw0">
                        <div className="fs13 w5"><span>{ck.t}</span></div>
                        <div className="fs12 mu"><span>{ck.d}</span></div>
                      </div>
                    </div>
                  ))}
                </section>
              ) : null}
              {OW.endc ? (
                <section className="card oh">
                  <div className="ch">
                    <div className="f1 c">
                      <h2 className="h2">Final accounting</h2>
                      <span className="fs12 mu">What closes out the lease, in order</span>
                    </div>
                    <button className="btn sm pri">Run final accounting</button>
                  </div>
                  <div className="cb">
                    <dl className="kv kvw5">
                      {OW.fa?.kv?.map((x, i) => (
                        <Fragment key={i}>
                          <dt><span>{x.k}</span></dt>
                          <dd><span>{x.v}</span></dd>
                        </Fragment>
                      ))}
                    </dl>
                  </div>
                  <div className="tl5" style={{ borderTop: "1px solid var(--bd2)" }}>
                    {OW.fa?.steps?.map((h, i) => (
                      <div key={i} className="tl5i">
                        <span className="dot" data-k={h.k}></span>
                        <div className="f1 mw0 r g8">
                          <span className="fs13 w5"><span>{h.t}</span></span>
                          <span className="sp"></span>
                          <span className="fs12 mu num"><span>{h.d}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              {OW.showMoney ? (
                <section className="card oh">
                  <div className="ch">
                    <div className="f1 c">
                      <h2 className="h2"><span>{OW.mm.title}</span></h2>
                      <span className="fs12 mu">Load revenue, Lone Star’s share, driver pay and the owner’s settlement are never mixed</span>
                    </div>
                  </div>
                  <div className="cb vz">
                    <div className="mm5">
                      {OW.mm.steps.map((s, i) => (
                        <div key={i} className="mm5s">
                          <i className="mm5k" data-v={s.k}></i>
                          <span className="fs12 t3"><span>{s.l}</span></span>
                          <span className="mm5v"><span>{s.v}</span></span>
                          <span className="fs11 mu"><span>{s.s}</span></span>
                        </div>
                      ))}
                    </div>
                    <div className="mm5bar">
                      {OW.mm.bar.map((b, i) => (
                        <i key={i} data-v={b.k} style={{ width: b.w }}></i>
                      ))}
                    </div>
                    <div className="c5lg">
                      {OW.mm.bar.map((b, i) => (
                        <span key={i} className="c5li">
                          <i data-v={b.k}></i>
                          <span>{b.l}</span>
                        </span>
                      ))}
                    </div>
                    {OW.mm.hasOut ? (
                      <div className="mm5out">
                        <div className="over" style={{ marginBottom: "6px" }}>Not on the owner’s settlement</div>
                        {OW.mm.outside.map((ot, i) => (
                          <div key={i} className="mm5o">
                            <div className="f1 mw0">
                              <div className="fs13 t2"><span>{ot.t}</span></div>
                              <div className="fs12 mu"><span>{ot.s}</span></div>
                            </div>
                            <span className="mono fs13 w5 nw"><span>{ot.v}</span></span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}
              <section className="card oh">
                <div className="ch">
                  <div className="f1 c">
                    <h2 className="h2">People and roles</h2>
                    <span className="fs12 mu">One record per person · roles are added, never duplicated</span>
                  </div>
                </div>
                {OW.people.map((pp, i) => (
                  <div key={i} className="wl ast">
                    <span className="av md"><span>{pp.ini}</span></span>
                    <div className="f1 mw0 c g2">
                      <div className="r g6 wrap">
                        <span className="fs13 w6"><span>{pp.n}</span></span>
                        {pp.roles.map((rl, i2) => (
                          <span key={i2} className="tag" data-k={rl.k}><span>{rl.l}</span></span>
                        ))}
                      </div>
                      <div className="fs12 t3"><span>{pp.d}</span></div>
                      {pp.note ? (
                        <div className="fs12 mu pre"><span>{pp.note}</span></div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </section>
            </div>
            {OW.hasWho ? (
              <section className="card oh">
                <div className="ch">
                  <div className="f1 c">
                    <h2 className="h2">Who drives each truck, and who pays them</h2>
                    <span className="fs12 mu">Owning a truck, driving it and being paid for driving are three separate records</span>
                  </div>
                </div>
                <div className={clsx("tscroll on", OW.who.fz)}>
                  <div className="tinner">
                    <div className="thead" style={{ gridTemplateColumns: OW.who.cols }}>
                      {OW.who.head.map((h, i) => (
                        <div key={i} className={clsx("th", h.al)}><span>{h.l}</span></div>
                      ))}
                    </div>
                    <div className="tb2">
                      {OW.who.rows.map((r, i) => (
                        <Fragment key={i}>
                          <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: OW.who.cols }} onClick={r.open}>
                            {r.cells.map((c, i2) => (
                              <DataCell key={i2} c={c} />
                            ))}
                          </div>
                          <ChangeDetail r={r} />
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
            {OW.showMoney ? (
              <div className="g2-5">
                <section className="card oh">
                  <div className="ch">
                    <h2 className="h2">Load revenue by truck</h2>
                    <span className="sp"></span>
                    <span className="fs12 mu">By month · November is to date</span>
                  </div>
                  <div className="cb">
                    <div className="vz">
                      <div className="c5lg">
                        {OW.ch1.legend.map((lg, i) => (
                          <span key={i} className="c5li">
                            <i data-v={lg.k}></i>
                            <span>{lg.n}</span>
                          </span>
                        ))}
                      </div>
                      <div className="c5cg">
                        <div className="c5y">
                          {OW.ch1.ticks.map((tk, i) => (
                            <span key={i}><span>{tk}</span></span>
                          ))}
                        </div>
                        <div className="c5p">
                          {OW.ch1.cols.map((cl, i) => (
                            <div key={i} className="c5cc" title={cl.title}>
                              <div className="c5st" style={{ height: cl.b }}>
                                {cl.segs.map((sg, i2) => (
                                  <i key={i2} data-v={sg.k} style={{ height: sg.h }}></i>
                                ))}
                              </div>
                              <span className="c5tot" style={{ bottom: cl.b }}><span>{cl.tot}</span></span>
                              <span className="c5x"><span>{cl.l}</span></span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
                <section className="card oh">
                  <div className="ch">
                    <h2 className="h2">Revenue, owner gross and net</h2>
                    <span className="sp"></span>
                    <span className="fs12 mu">By month</span>
                  </div>
                  <div className="cb" style={{ paddingBottom: "4px" }}>
                    <div className="vz">
                      <div className="c5lg">
                        {OW.ch2.legend.map((lg, i) => (
                          <span key={i} className="c5li">
                            <i data-v={lg.k}></i>
                            <span>{lg.n}</span>
                          </span>
                        ))}
                      </div>
                      <div className="lnch" role="group" aria-label={OW.ch2.aria}>
                        <div className="cy">
                          {OW.ch2.ticks.map((tk, i) => (
                            <span key={i}><span>{tk}</span></span>
                          ))}
                        </div>
                        <div className="lnpl" style={{ backgroundSize: "100% 25%" }}>
                          <svg viewBox={OW.ch2.vb} preserveAspectRatio="none" aria-hidden="true">
                            <path className="k-v1" d={OW.ch2.p[0]} />
                            <path className="k-v4" d={OW.ch2.p[1]} />
                            <path className="k-v3" d={OW.ch2.p[2]} />
                          </svg>
                          {OW.ch2.pts.map((pt, i) => (
                            <span key={i} className="lnpt" style={{ left: pt.x, width: OW.ch2.w }} tabIndex={0} aria-label={pt.aria}>
                              {pt.dots.map((dt, i2) => (
                                <span key={i2} className={`lndot k-${dt.k}`} style={{ top: dt.y }}></span>
                              ))}
                              <span className="lntip c5tip">
                                <b><span>{pt.l}</span></b>
                                {pt.tip.map((tp, i2) => (
                                  <span key={i2} className="c5tr">
                                    <i data-v={tp.k}></i>
                                    <span>{tp.n}</span>
                                    <b><span>{tp.v}</span></b>
                                  </span>
                                ))}
                              </span>
                              <span className="lnx"><span>{pt.l}</span></span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
                <section className="card oh">
                  <div className="ch">
                    <h2 className="h2">Miles by truck</h2>
                    <span className="sp"></span>
                    <span className="fs12 mu"><span>{OW.filt}</span></span>
                  </div>
                  <div className="cb">
                    <div className="c5hb vz">
                      {OW.ch3.map((hb, i) => (
                        <div key={i} className="c5hr">
                          <span className="c5hn"><span>{hb.n}</span></span>
                          <span className="c5hbar">
                            <i data-v={hb.k} style={{ width: hb.w }}></i>
                            <b><span>{hb.v}</span></b>
                            <em><span>{hb.s}</span></em>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
                <section className="card oh">
                  <div className="ch">
                    <h2 className="h2">Where each mile’s revenue goes</h2>
                    <span className="sp"></span>
                    <span className="fs12 mu">Nov 2–8 · revenue per mile driven</span>
                  </div>
                  <div className="cb">
                    <div className="vz">
                      <div className="c5lg">
                        <span className="c5li">
                          <i data-v="mu"></i>
                          Lone Star’s share
                        </span>
                        <span className="c5li">
                          <i data-v="v2"></i>
                          Owner’s costs
                        </span>
                        <span className="c5li">
                          <i data-v="v3"></i>
                          Owner net
                        </span>
                      </div>
                      <div className="c5hb">
                        {OW.ch4.map((hb, i) => (
                          <div key={i} className="c5hr">
                            <span className="c5hn"><span>{hb.n}</span></span>
                            <span className="c5hbar">
                              {hb.segs.map((sg, i2) => (
                                <i key={i2} data-v={sg.k} style={{ width: sg.w }} title={sg.t}></i>
                              ))}
                              <b><span>{hb.v}</span>{" "}a mile</b>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
          </>
        ) : null}
        {OW.t.eq ? (
          <section className="card oh c">
            <div className="ch">
              <h2 className="h2">Equipment</h2>
              <span className="fs12 mu">Rows open the truck · who drives is set in Dispatch, never here</span>
              <span className="sp"></span>
              <button className="btn sm">
                <Icon className="s14" d={I.rotate} />
                Transfer ownership
              </button>
              <button className="btn sm">
                <Icon className="s14 b" d="M12 5v14M5 12h14" />
                Add equipment
              </button>
            </div>
            <div className={clsx("tscroll on", OW.eq.fz)}>
              <div className="tinner">
                <div className="thead" style={{ gridTemplateColumns: OW.eq.cols }}>
                  {OW.eq.head.map((h, i) => (
                    <div key={i} className={clsx("th", h.al)}><span>{h.l}</span></div>
                  ))}
                </div>
                <div className="tb2">
                  {OW.eq.rows.map((r, i) => (
                    <Fragment key={i}>
                      <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: OW.eq.cols }} onClick={r.open}>
                        {r.cells.map((c, i2) => (
                          <DataCell key={i2} c={c} />
                        ))}
                      </div>
                      <ChangeDetail r={r} />
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}
        {OW.t.live ? (
          <div className="lv5">
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Live tracking</h2>
                <span className="badge" data-k="ok">
                  <i></i>
                  Live · 11:20 CT
                </span>
                <span className="sp"></span>
                <span className="fs12 mu"><span>{OW.liveSub}</span></span>
              </div>
              <div className="omapw">
                <div className="omapin" style={{ left: `calc(50% - ${OW.map.cx}px)`, top: `calc(50% - ${OW.map.cy}px)` }}>
                  <svg className="msvg" viewBox="0 0 1208 788" preserveAspectRatio="none" aria-hidden="true">
                    <path className="mwater" d={OW.map.water} />
                    <path className="mstate" d={OW.map.states} />
                    <path className="mminor" d={OW.map.minor} />
                    <path className="mcase" d={OW.map.major} />
                    <path className="mmajor" d={OW.map.major} />
                  </svg>
                  {OW.map.cities.map((cty, i) => (
                    <span key={i} className={clsx("city", cty.cls)} style={{ left: `${cty.x}px`, top: `${cty.y}px` }}><span>{cty.n}</span></span>
                  ))}
                  {OW.map.shields.map((sh, i) => (
                    <span key={i} className="shield" style={{ left: `${sh.x}px`, top: `${sh.y}px` }}><span>{sh.n}</span></span>
                  ))}
                  {OW.map.trucks.map((v, i) => (
                    <button key={i} className={clsx("vm", v.cls)} data-k={v.k} style={{ left: `${v.x}px`, top: `${v.y}px` }} aria-label={v.aria}>
                      <span className="vmh"><span className="r" style={{ transform: `rotate(${v.h}deg)` }}><Icon className="s12 fill" d="M12 2l7 19-7-4-7 4z" /></span></span>
                      <span className="vml"><span>{v.unit}</span></span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Units</h2>
                <span className="cnt" data-k="mu"><span>{OW.liveN}</span></span>
              </div>
              {OW.live.map((lv, i) => (
                <button key={i} className="lvi5" onClick={lv.go}>
                  <div className="r g8">
                    <span className="mono fs13 w6"><span>{lv.u}</span></span>
                    <span className="badge" data-k={lv.sk}>
                      <i></i>
                      <span>{lv.s}</span>
                    </span>
                  </div>
                  <div className="fs12 t2 ell"><span>{lv.d}</span></div>
                  <div className="fs13 w5 ell"><span>{lv.loc}</span></div>
                  <div className={clsx("fs12 ell", lv.fk)}><span>{lv.fresh}</span></div>
                  <div className="fs12 mu ell"><span>{lv.lane}</span></div>
                </button>
              ))}
            </section>
          </div>
        ) : null}
        {OW.t.loads ? (
          <>
            <section className="card oh">
              <div className="ch">
                <div className="f1 c">
                  <h2 className="h2">On time, week by week</h2>
                  <span className="fs12 mu"><span>{OW.otSub}</span></span>
                </div>
              </div>
              <div className="cb">
                <div className="vz">
                  <div className="c5lg">
                    {OW.ot.legend.map((lg, i) => (
                      <span key={i} className="c5li">
                        <i data-v={lg.k}></i>
                        <span>{lg.n}</span>
                      </span>
                    ))}
                  </div>
                  <div className="c5cg">
                    <div className="c5y">
                      {OW.ot.ticks.map((tk, i) => (
                        <span key={i}><span>{tk}</span></span>
                      ))}
                    </div>
                    <div className="c5p">
                      {OW.ot.cols.map((cl, i) => (
                        <div key={i} className="c5cc" title={cl.title}>
                          <div className="c5st" style={{ height: cl.b }}>
                            {cl.segs.map((sg, i2) => (
                              <i key={i2} data-v={sg.k} style={{ height: sg.h }}></i>
                            ))}
                          </div>
                          <span className="c5tot" style={{ bottom: cl.b }}><span>{cl.tot}</span></span>
                          <span className="c5x"><span>{cl.l}</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <section className="card oh c">
              <div className="ch">
                <h2 className="h2">Loads on this owner’s trucks</h2>
                <div className="seg" role="group" aria-label="Load status" style={{ marginLeft: "8px" }}>
                  {OW.lf.map((f, i) => (
                    <button key={i} className={f.on} onClick={f.go}>
                      <span>{f.l}</span>
                      <span className="tcnt"><span>{f.n}</span></span>
                    </button>
                  ))}
                </div>
                <span className="sp"></span>
                <span className="fs12 mu">Customer names are hidden in the owner’s portal</span>
              </div>
              <div className={clsx("tscroll on", OW.lt.fz)}>
                <div className="tinner">
                  <div className="thead" style={{ gridTemplateColumns: OW.lt.cols }}>
                    {OW.lt.head.map((h, i) => (
                      <div key={i} className={clsx("th", h.al)}><span>{h.l}</span></div>
                    ))}
                  </div>
                  <div className="tb2">
                    {OW.lt.rows.map((r, i) => (
                      <Fragment key={i}>
                        <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: OW.lt.cols }} onClick={r.open}>
                          {r.cells.map((c, i2) => (
                            <DataCell key={i2} c={c} />
                          ))}
                        </div>
                        <ChangeDetail r={r} />
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}
        {OW.t.fuel ? (
          <>
            <div className="kpis" style={{ gridTemplateColumns: "repeat(5,minmax(0,1fr))" }}>
              {OW.fsum.map((k, i) => (
                <div key={i} className="kpi">
                  <span className="kl"><span>{k.l}</span></span>
                  <span className="kv2"><span>{k.v}</span></span>
                </div>
              ))}
            </div>
            <section className="card oh">
              <div className="ch">
                <div className="f1 c">
                  <h2 className="h2">Fuel spend by month, by who pays</h2>
                  <span className="fs12 mu">Owner-operator and fleet leases: the owner pays · equipment leases and rentals: Lone Star pays</span>
                </div>
              </div>
              <div className="cb">
                <div className="vz">
                  <div className="c5lg">
                    {OW.fch.legend.map((lg, i) => (
                      <span key={i} className="c5li">
                        <i data-v={lg.k}></i>
                        <span>{lg.n}</span>
                      </span>
                    ))}
                  </div>
                  <div className="c5cg">
                    <div className="c5y">
                      {OW.fch.ticks.map((tk, i) => (
                        <span key={i}><span>{tk}</span></span>
                      ))}
                    </div>
                    <div className="c5p">
                      {OW.fch.cols.map((cl, i) => (
                        <div key={i} className="c5cc" title={cl.title}>
                          <div className="c5st" style={{ height: cl.b }}>
                            {cl.segs.map((sg, i2) => (
                              <i key={i2} data-v={sg.k} style={{ height: sg.h }}></i>
                            ))}
                          </div>
                          <span className="c5tot" style={{ bottom: cl.b }}><span>{cl.tot}</span></span>
                          <span className="c5x"><span>{cl.l}</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <section className="card oh c">
              <div className="ch">
                <h2 className="h2">Fuel card purchases · Nov 2–8</h2>
                <span className="sp"></span>
                <button className="btn sm">
                  <Icon className="s14" d={I.download} />
                  Export
                </button>
              </div>
              <div className={clsx("tscroll on", OW.ft.fz)}>
                <div className="tinner">
                  <div className="thead" style={{ gridTemplateColumns: OW.ft.cols }}>
                    {OW.ft.head.map((h, i) => (
                      <div key={i} className={clsx("th", h.al)}><span>{h.l}</span></div>
                    ))}
                  </div>
                  <div className="tb2">
                    {OW.ft.rows.map((r, i) => (
                      <Fragment key={i}>
                        <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: OW.ft.cols }} onClick={r.open}>
                          {r.cells.map((c, i2) => (
                            <DataCell key={i2} c={c} />
                          ))}
                        </div>
                        <ChangeDetail r={r} />
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            <section className="card oh c">
              <div className="ch">
                <h2 className="h2">Other expenses · Nov 2–8</h2>
                <span className="fs12 mu">Every deduction has a line, a reason and, for repairs and driver pay, a receipt</span>
              </div>
              <div className={clsx("tscroll on", OW.xt.fz)}>
                <div className="tinner">
                  <div className="thead" style={{ gridTemplateColumns: OW.xt.cols }}>
                    {OW.xt.head.map((h, i) => (
                      <div key={i} className={clsx("th", h.al)}><span>{h.l}</span></div>
                    ))}
                  </div>
                  <div className="tb2">
                    {OW.xt.rows.map((r, i) => (
                      <Fragment key={i}>
                        <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: OW.xt.cols }} onClick={r.open}>
                          {r.cells.map((c, i2) => (
                            <DataCell key={i2} c={c} />
                          ))}
                        </div>
                        <ChangeDetail r={r} />
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}
        {OW.t.stmt ? (
          <>
            <div className="mm5 vz big">
              {OW.wk.map((s, i) => (
                <div key={i} className="mm5s">
                  <i className="mm5k" data-v={s.k}></i>
                  <span className="fs12 t3 ell"><span>{s.l}</span></span>
                  <span className="mm5v"><span>{s.v}</span></span>
                  <span className="fs11 mu"><span>{s.s}</span></span>
                </div>
              ))}
            </div>
            <section className="card oh c">
              <div className="ch">
                <div className="f1 c">
                  <h2 className="h2">This week’s settlement, by unit</h2>
                  <span className="fs12 mu"><span>{OW.stSub}</span></span>
                </div>
                {OW.hasStmt ? (
                  <button className="btn sm pri" onClick={OW.openStmt}>Open settlement</button>
                ) : null}
              </div>
              <div className={clsx("tscroll on", OW.stt.fz)}>
                <div className="tinner">
                  <div className="thead" style={{ gridTemplateColumns: OW.stt.cols }}>
                    {OW.stt.head.map((h, i) => (
                      <div key={i} className={clsx("th", h.al)}><span>{h.l}</span></div>
                    ))}
                  </div>
                  <div className="tb2">
                    {OW.stt.rows.map((r, i) => (
                      <Fragment key={i}>
                        <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: OW.stt.cols }} onClick={r.open}>
                          {r.cells.map((c, i2) => (
                            <DataCell key={i2} c={c} />
                          ))}
                        </div>
                        <ChangeDetail r={r} />
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            <section className="card oh c">
              <div className="ch">
                <h2 className="h2">Past settlements</h2>
                <span className="fs12 mu"><span>{OW.esc.i}</span></span>
                <span className="sp"></span>
                <button className="btn sm">
                  <Icon className="s14" d={I.download} />
                  Year to date · CSV
                </button>
              </div>
              <div className={clsx("tscroll on", OW.past.fz)}>
                <div className="tinner">
                  <div className="thead" style={{ gridTemplateColumns: OW.past.cols }}>
                    {OW.past.head.map((h, i) => (
                      <div key={i} className={clsx("th", h.al)}><span>{h.l}</span></div>
                    ))}
                  </div>
                  <div className="tb2">
                    {OW.past.rows.map((r, i) => (
                      <Fragment key={i}>
                        <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: OW.past.cols }} onClick={r.open}>
                          {r.cells.map((c, i2) => (
                            <DataCell key={i2} c={c} />
                          ))}
                        </div>
                        <ChangeDetail r={r} />
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}
        {OW.t.mt ? (
          <>
            <section className="card oh">
              <div className="ch"><h2 className="h2">Coming up</h2></div>
              <div className="up5">
                {OW.upcoming.map((up, i) => (
                  <div key={i} className="up5i">
                    <span className="mono fs13 w6"><span>{up.u}</span></span>
                    <span className="fs13 tc" data-k={up.k}><span>{up.n}</span></span>
                    <span className="fs12 mu ell"><span>{up.s}</span></span>
                  </div>
                ))}
              </div>
            </section>
            <section className="card oh c">
              <div className="ch">
                <h2 className="h2">Work orders</h2>
                <span className="fs12 mu">Who pays follows the agreement on each unit</span>
                <span className="sp"></span>
                <button className="btn sm">
                  <Icon className="s14" d={I.wrench} />
                  Schedule service
                </button>
              </div>
              <div className={clsx("tscroll on", OW.mt.fz)}>
                <div className="tinner">
                  <div className="thead" style={{ gridTemplateColumns: OW.mt.cols }}>
                    {OW.mt.head.map((h, i) => (
                      <div key={i} className={clsx("th", h.al)}><span>{h.l}</span></div>
                    ))}
                  </div>
                  <div className="tb2">
                    {OW.mt.rows.map((r, i) => (
                      <Fragment key={i}>
                        <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: OW.mt.cols }} onClick={r.open}>
                          {r.cells.map((c, i2) => (
                            <DataCell key={i2} c={c} />
                          ))}
                        </div>
                        <ChangeDetail r={r} />
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}
        {OW.t.docs ? (
          <section className="card oh c">
            <div className="ch">
              <h2 className="h2">Documents</h2>
              <span className="fs12 mu">“In portal” controls what the owner can open</span>
              <span className="sp"></span>
              <button className="btn sm">
                <Icon className="s14" d={I.upload} />
                Upload
              </button>
            </div>
            <div className={clsx("tscroll on", OW.dt.fz)}>
              <div className="tinner">
                <div className="thead" style={{ gridTemplateColumns: OW.dt.cols }}>
                  {OW.dt.head.map((h, i) => (
                    <div key={i} className={clsx("th", h.al)}><span>{h.l}</span></div>
                  ))}
                </div>
                <div className="tb2">
                  {OW.dt.rows.map((r, i) => (
                    <Fragment key={i}>
                      <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: OW.dt.cols }} onClick={r.open}>
                        {r.cells.map((c, i2) => (
                          <DataCell key={i2} c={c} />
                        ))}
                      </div>
                      <ChangeDetail r={r} />
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}
        {OW.t.acc ? (
          <div className="g21-5">
            <section className="card oh">
              <div className="ch">
                <div className="f1 c">
                  <h2 className="h2">What this owner can see</h2>
                  <span className="fs12 mu"><span>{OW.acc.n}</span>{" "}· changes apply on their next click</span>
                </div>
                <div className="seg" role="group" aria-label="Presets">
                  {OW.acc.presets.map((pr, i) => (
                    <button key={i} className={pr.on} onClick={pr.go}><span>{pr.l}</span></button>
                  ))}
                </div>
              </div>
              <div className="pm5g">
                {OW.acc.perms.map((pm, i) => (
                  <div key={i} className="pm5">
                    <div className="f1 mw0">
                      <div className="fs13 w5"><span>{pm.l}</span></div>
                      <div className="fs12 mu ell"><span>{pm.d}</span></div>
                    </div>
                    <button className={clsx("sw5", pm.on)} role="switch" aria-checked={pm.chk} aria-label={pm.l} onClick={pm.go}><i></i></button>
                  </div>
                ))}
              </div>
            </section>
            <div className="c g16">
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">Portal users</h2>
                  <span className="tag" data-k={OW.acc.pk}><span>{OW.acc.portal}</span></span>
                  <span className="sp"></span>
                  <button className="lnk">Invite someone</button>
                </div>
                {OW.acc.users.map((pu, i) => (
                  <div key={i} className="wl ast">
                    <span className="av md"><span>{pu.ini}</span></span>
                    <div className="f1 mw0">
                      <div className="r g6">
                        <span className="fs13 w5"><span>{pu.n}</span></span>
                        <span className="tag" data-k="mu"><span>{pu.role}</span></span>
                      </div>
                      <div className="fs12 t3"><span>{pu.scope}</span></div>
                      <div className="fs11 tc" data-k={pu.k}><span>{pu.last}</span></div>
                    </div>
                  </div>
                ))}
                <div className="cb">
                  <button className="btn sm" onClick={OW.portalPreview} style={{ width: "100%", justifyContent: "center" }}>
                    <Icon className="s14" d={I.eye} />
                    Preview exactly what they see
                  </button>
                </div>
              </section>
              <section className="card oh">
                <div className="ch"><h2 className="h2">Rules</h2></div>
                <div className="cb c g8">
                  {OW.acc.rules.map((ru, i) => (
                    <div key={i} className="seenl ok"><span>{ru}</span></div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
