"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { DataCell } from "@/components/data-table/cells";
import { ChangeDetail } from "@/components/data-table/change-detail";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** One owner settlement statement. */
export function StatementScreen() {
  const { isStmt, SM, I } = useConsole();
  if (!isStmt) return null;
  return (
    <div className="col">
      <div className="ph" style={{ alignItems: "center", paddingBottom: "14px" }}>
        <span className="omk lg" data-k="teal"><span>{SM.ini}</span></span>
        <div className="f1 mw0">
          <div className="crumb" style={{ marginBottom: "2px" }}>
            <span>Finance</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <button onClick={SM.toList}>Statements</button>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b><span>{SM.n}</span></b>
          </div>
          <div className="r g10">
            <h1 className="h1">{"Owner settlement · "}<span>{SM.n}</span></h1>
            <span className="badge" data-k={SM.sk}>
              <i></i>
              <span>{SM.st}</span>
            </span>
          </div>
          <p className="sub"><span>{SM.period}</span>{" · "}<span>{SM.pays}</span></p>
        </div>
        <div className="r g8">
          <button className="btn" onClick={SM.toOwner}>
            <Icon className="s14" d={I.owner} />
            Owner record
          </button>
          <button className="btn">
            <Icon className="s14" d={I.download} />
            PDF
          </button>
          <button className="btn">
            <Icon className="s14" d={I.send} />
            Send to owner
          </button>
          {SM.canApprove ? (
            <button className="btn pri">
              <Icon className="s14" d={I.check} />
              Approve
            </button>
          ) : null}
        </div>
      </div>
      <div className="scr5">
        <div className="st5">
          <div className="c g16">
            <div className="mm5 vz big">
              {SM.sum.map((s, i) => (
                <div key={i} className="mm5s">
                  <i className="mm5k" data-v={s.k}></i>
                  <span className="fs12 t3 ell"><span>{s.l}</span></span>
                  <span className="mm5v"><span>{s.v}</span></span>
                  <span className="fs11 mu ell"><span>{s.s}</span></span>
                </div>
              ))}
            </div>
            {SM.callout ? (
              <div className="banner" data-k="info">
                <Icon d={I.info} />
                <div className="f1">
                  <div className="bt"><span>{SM.callout.t}</span></div>
                  <div><span>{SM.callout.d}</span></div>
                </div>
              </div>
            ) : null}
            {SM.secs.map((sc, i) => (
              <section key={i} className="card oh">
                <div className="ch">
                  <span className="dot" data-k={sc.k}></span>
                  <button className="idl" onClick={sc.go} style={{ fontSize: "13px" }}><span>{sc.u}</span></button>
                  <div className="f1 mw0 c">
                    <span className="fs13 w6 ell"><span>{sc.terms}</span></span>
                    <span className="fs12 mu ell"><span>{sc.drv}</span></span>
                  </div>
                  <span className="fs12 mu ell" style={{ maxWidth: "300px" }}><span>{sc.ts}</span></span>
                </div>
                <div className="sl4">
                  {sc.lines.map((ln, i2) => (
                    <div key={i2} className={clsx("sln", ln.cls)}>
                      <div className="f1 mw0">
                        <div className="slt"><span>{ln.t}</span></div>
                        {ln.s ? (
                          <div className="sls"><span>{ln.s}</span></div>
                        ) : null}
                      </div>
                      <div className={clsx("slv mono", ln.vc)}><span>{ln.v}</span></div>
                    </div>
                  ))}
                </div>
                {sc.hasNot ? (
                  <div className="not5">
                    <div className="over">Not on this settlement</div>
                    {sc.not.map((nt, i2) => (
                      <div key={i2} className="r g12">
                        <span className="f1 fs12 t2">
                          <span>{nt.a}</span>{" · "}
                          <span className="mu"><span>{nt.d}</span></span>
                        </span>
                        <span className="mono fs12 t3 nw"><span>{nt.v}</span></span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
            <section className="card oh c">
              <div className="ch">
                <div className="f1 c">
                  <h2 className="h2">Loads on this settlement</h2>
                  <span className="fs12 mu"><span>{SM.ltNote}</span></span>
                </div>
              </div>
              <div className={clsx("tscroll on", SM.lt.fz)}>
                <div className="tinner">
                  <div className="thead" style={{ gridTemplateColumns: SM.lt.cols }}>
                    {SM.lt.head.map((h, i) => (
                      <div key={i} className={clsx("th", h.al)}><span>{h.l}</span></div>
                    ))}
                  </div>
                  <div className="tb2">
                    {SM.lt.rows.map((r, i) => (
                      <Fragment key={i}>
                        <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: SM.lt.cols }} onClick={r.open}>
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
          </div>
          <aside className="c g16 stk5">
            <section className="card oh">
              <div className="ch"><h2 className="h2">Net settlement</h2></div>
              <div className="cb c g4">
                <span className="mono" style={{ fontSize: "26px", lineHeight: "32px", fontWeight: "600" }}><span>{SM.netV}</span></span>
                <span className="fs12 t3"><span>{SM.pays}</span></span>
              </div>
            </section>
            <section className="card oh">
              <div className="ch"><h2 className="h2">Escrow</h2></div>
              <div className="cb">
                <dl className="kv kvw5">
                  {SM.esc.map((x, i) => (
                    <Fragment key={i}>
                      <dt><span>{x.k}</span></dt>
                      <dd><span>{x.v}</span></dd>
                    </Fragment>
                  ))}
                </dl>
              </div>
            </section>
            <section className="card oh">
              <div className="ch"><h2 className="h2">Trail</h2></div>
              {SM.trail.map((hh, i) => (
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
            <section className="card oh">
              <div className="ch"><h2 className="h2">Lease rules built in</h2></div>
              <div className="cb c g6">
                {SM.rules.map((ru, i) => (
                  <div key={i} className="seenl ok"><span>{ru}</span></div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
