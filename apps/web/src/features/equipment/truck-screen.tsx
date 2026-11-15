"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Truck record: owner and agreement, drivers, specifications and history. */
export function TruckScreen() {
  const { isTruck, I, TK } = useConsole();
  if (!isTruck) return null;
  return (
    <div className="col">
      <div className="ph" style={{ alignItems: "center", paddingBottom: "14px" }}>
        <span className="omk lg" data-k="brand"><Icon d={I.truck} style={{ width: "26px", height: "26px" }} /></span>
        <div className="f1 mw0">
          <div className="crumb" style={{ marginBottom: "2px" }}>
            <span>Equipment</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <button onClick={TK.back}>Trucks</button>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b><span>{TK.u}</span></b>
          </div>
          <div className="r g10">
            <h1 className="h1"><span>{TK.u}</span></h1>
            <span className="fs14 t3"><span>{TK.title}</span></span>
            <span className="badge" data-k={TK.sk}>
              <i></i>
              <span>{TK.st}</span>
            </span>
            <span className="tag" data-k={TK.owner.k}><span>{TK.ownTag}</span></span>
          </div>
          <p className="sub"><span>{TK.now.loc}</span>{" "}·{" "}<span>{TK.now.fresh}</span>{" "}·{" "}<span>{TK.now.odo}</span></p>
        </div>
        <div className="r g8">
          <button className="btn" onClick={TK.assign}>
            <Icon className="s14" d={I.user} />
            Assign driver
          </button>
          <button className="btn">
            <Icon className="s14" d={I.wrench} />
            Schedule service
          </button>
          <button className="btn">
            <Icon className="s14" d={I.pencil} />
            Edit
          </button>
        </div>
      </div>
      <div className="scr5">
        <div className="lpg">
          <div className="c g16">
            <div className="kpis" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
              <div className="kpi">
                <span className="kl">Location</span>
                <span className="fs14 w6 ell"><span>{TK.now.loc}</span></span>
                <span className={clsx("ks", TK.now.fk)}><span>{TK.now.fresh}</span></span>
              </div>
              <div className="kpi">
                <span className="kl">Load</span>
                <span className="fs14 w6 ell"><span>{TK.now.load}</span></span>
                <span className="ks">Right now</span>
              </div>
              <div className="kpi">
                <span className="kl">Odometer</span>
                <span className="fs14 w6 mono"><span>{TK.now.odo}</span></span>
                <span className="ks">From the ELD</span>
              </div>
              <div className="kpi">
                <span className="kl">Next service</span>
                <span className="fs14 w6 ell"><span>{TK.now.next}</span></span>
                <span className="ks">Planned</span>
              </div>
            </div>
            {TK.team ? (
              <div className="banner" data-k="violet">
                <Icon d={I.users} />
                <div className="f1">
                  <div className="bt"><span>{TK.team.t}</span></div>
                  <div><span>{TK.team.d}</span></div>
                </div>
              </div>
            ) : null}
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Drivers</h2>
                <span className="fs12 mu">Set in Dispatch · separate from ownership</span>
              </div>
              {TK.drivers.map((dv, i) => (
                <button key={i} className="wl wlb" onClick={dv.go}>
                  <span className="av md"><span>{dv.ini}</span></span>
                  <div className="f1 mw0">
                    <div className="fs13 w5"><span>{dv.n}</span></div>
                    <div className="fs12 mu"><span>{dv.r}</span></div>
                  </div>
                  <Icon className="s14 mu" d="M9 6l6 6-6 6" />
                </button>
              ))}
            </section>
            <section className="card oh">
              <div className="ch"><h2 className="h2">Specifications</h2></div>
              <div className="cb">
                <div className="spec5">
                  {TK.specs.map((x, i) => (
                    <div key={i} className="c g2 mw0">
                      <span className="fs12 mu"><span>{x.k}</span></span>
                      <span className="fs13 w5 ell"><span>{x.v}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <section className="card oh">
              <div className="ch"><h2 className="h2">Assignment history</h2></div>
              {TK.asg.map((a, i) => (
                <div key={i} className="wl">
                  <div className="f1 mw0">
                    <div className="fs13 w5"><span>{a.n}</span></div>
                    <div className="fs12 mu"><span>{a.how}</span></div>
                  </div>
                  <span className="fs12 t3 num nw"><span>{a.from}</span>{" "}–{" "}<span>{a.to}</span></span>
                </div>
              ))}
            </section>
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Maintenance</h2>
                <span className="sp"></span>
                <button className="lnk">All work orders</button>
              </div>
              {TK.maint.map((m, i) => (
                <div key={i} className="wl">
                  <span className="mono fs12 w5"><span>{m.wo}</span></span>
                  <div className="f1 mw0">
                    <div className="fs13 ell"><span>{m.w}</span></div>
                    <div className="fs12 mu ell"><span>{m.shop}</span>{" "}·{" "}<span>{m.d}</span></div>
                  </div>
                  <span className="badge" data-k={m.k}>
                    <i></i>
                    <span>{m.s}</span>
                  </span>
                  <span className="mono fs13 nw"><span>{m.cost}</span></span>
                </div>
              ))}
              {TK.noMaint ? (
                <div className="cb fs12 mu">No work orders in the last 90 days.</div>
              ) : null}
            </section>
          </div>
          <div className="c g16">
            <section className="card oh">
              <div className="ch">
                <div className="f1 c">
                  <h2 className="h2">Owner and agreement</h2>
                  <span className="fs12 mu">Who owns it never changes who drives it</span>
                </div>
                {TK.owner.link ? (
                  <button className="lnk" onClick={TK.owner.go}>Open owner</button>
                ) : null}
              </div>
              <div className="cb c g10">
                <div className="r g8">
                  <span className="fs14 w6"><span>{TK.owner.n}</span></span>
                  <span className="tag" data-k={TK.owner.k}><span>{TK.owner.cat}</span></span>
                </div>
                <dl className="kv kvw5">
                  {TK.owner.kv.map((x, i) => (
                    <Fragment key={i}>
                      <dt><span>{x.k}</span></dt>
                      <dd><span>{x.v}</span></dd>
                    </Fragment>
                  ))}
                </dl>
              </div>
            </section>
            {TK.wk ? (
              <section className="card oh">
                <div className="ch"><h2 className="h2">This week’s money · Nov 2–8</h2></div>
                <div className="cb">
                  <dl className="kv">
                    {TK.wk.map((x, i) => (
                      <Fragment key={i}>
                        <dt><span>{x.k}</span></dt>
                        <dd className="mono"><span>{x.v}</span></dd>
                      </Fragment>
                    ))}
                  </dl>
                </div>
              </section>
            ) : null}
            <section className="card oh">
              <div className="ch"><h2 className="h2">Ownership history</h2></div>
              <div className="tl5">
                {TK.hist.map((h, i) => (
                  <div key={i} className="tl5i">
                    <span className="dot" data-k={h.k}></span>
                    <div className="f1 mw0">
                      <div className="r g8">
                        <span className="fs13 w6"><span>{h.who}</span></span>
                        <span className="sp"></span>
                        <span className="fs12 mu num"><span>{h.d}</span></span>
                      </div>
                      <div className="fs12 t3"><span>{h.what}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Documents</h2>
                <span className="sp"></span>
                <button className="lnk">Upload</button>
              </div>
              {TK.docs.map((d, i) => (
                <div key={i} className="wl">
                  <span className="plogo" data-k={d.k}><Icon className="s14" d={I.file} /></span>
                  <div className="f1 mw0">
                    <div className="fs13 w5 ell"><span>{d.t}</span></div>
                    <div className="fs12 mu ell"><span>{d.d}</span></div>
                  </div>
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
