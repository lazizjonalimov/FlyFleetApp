"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Dispatch board: unassigned queue, driver timeline and the assignment panel. */
export function DispatchScreen() {
  const { isDispatch, B, goTracking, goNew, A, closePanel } = useConsole();
  if (!isDispatch) return null;
  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px" }}>
        <div className="f1">
          <div className="crumb">
            <span>Operations</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>Dispatch board</b>
          </div>
          <h1 className="h1">Dispatch board</h1>
          <p className="sub"><span>{B.sub}</span></p>
        </div>
        <div className="r g8">
          <button className="btn">
            <Icon className="s14" d="M12 2l10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5" />
            View: Today
            <Icon className="s12" d="M6 9l6 6 6-6" />
          </button>
          <div className="r" style={{ border: "1px solid var(--bd3)", borderRadius: "6px", background: "var(--sf)", height: "32px", overflow: "hidden", boxShadow: "var(--sh1)" }}>
            <button className="btn ghost icon" style={{ height: "30px", borderRadius: "0" }} aria-label="Previous day"><Icon className="s14" d="M15 6l-6 6 6 6" /></button>
            <span className="fs13 w5" style={{ padding: "0 10px", borderLeft: "1px solid var(--bd)", borderRight: "1px solid var(--bd)", lineHeight: "30px" }}>
              Fri, Nov 13
            </span>
            <button className="btn ghost icon" style={{ height: "30px", borderRadius: "0" }} aria-label="Next day"><Icon className="s14" d="M9 6l6 6-6 6" /></button>
          </div>
          <div className="seg" role="group" aria-label="Board layout">
            <button className="on">Timeline</button>
            <button>Table</button>
            <button onClick={goTracking}>Map</button>
          </div>
          <button className="btn pri" onClick={goNew}>
            <Icon className="s14 b" d="M12 5v14M5 12h14" />
            New load
          </button>
        </div>
      </div>
      <div className="r g8" style={{ padding: "0 24px 12px", flex: "none" }}>
        <div className="sumbar">
          {B.sum.map((s, i) => (
            <button key={i} className={clsx("sumi", s.on)} data-k={s.k}>
              <span className="dot"></span>
              <span>{s.label}</span>
              <span className="mono w6 tx"><span>{s.n}</span></span>
            </button>
          ))}
        </div>
        <span className="sp"></span>
        <label className="search" style={{ width: "176px" }}>
          <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
          <input placeholder="Find driver or load" aria-label="Find driver or load" />
        </label>
        <button className="chip">
          Equipment: Dry van, Reefer
          <Icon className="s12 b" d="M18 6L6 18M6 6l12 12" />
        </button>
        <button className="chip add">
          <Icon className="s12 b" d="M12 5v14M5 12h14" />
          Driver group
        </button>
        <span className="fs12 mu nw r g6">
          <span className="dot" data-k="ok"></span>
          Auto-refresh · 11:20:14
        </span>
      </div>
      <div className={clsx("dboard", B.wp)}>
        {B.showQueue ? (
          <section className="card oh c" style={{ minHeight: "0" }}>
            <div className="ch" style={{ minHeight: "46px", padding: "0 14px" }}>
              <h2 className="h2">Unassigned</h2>
              <span className="cnt" data-k="warn"><span>{B.qn}</span></span>
              <span className="sp"></span>
              <button className="btn ghost xs">
                Pickup time
                <Icon className="s12" d="M6 9l6 6 6-6" />
              </button>
            </div>
            <div className="queue">
              {B.queue.map((q, i) => (
                <div key={i} className={clsx("qcard", q.cls)}>
                  <div className="r g8">
                    <Icon className="s12 dots mu" d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" />
                    <span className="mono fs12 w5 t2"><span>{q.id}</span></span>
                    <span className="sp"></span>
                    <span className="tag" data-k={q.uk}><span>{q.urg}</span></span>
                  </div>
                  <div className="r g6 fs13 w5">
                    <span className="ell"><span>{q.a}</span></span>
                    <Icon className="s12 mu" d="M5 12h14M13 6l6 6-6 6" />
                    <span className="ell"><span>{q.b}</span></span>
                  </div>
                  <div className="fs12 mu num"><span>{q.when}</span>{" "}·{" "}<span>{q.mi}</span>{" "}mi ·{" "}<span>{q.eq}</span></div>
                  <div className="r jb fs12" style={{ marginTop: "3px", paddingTop: "7px", borderTop: "1px solid var(--bd2)" }}>
                    <span className="t3 ell"><span>{q.cust}</span></span>
                    {q.rateF ? (
                      <span className="mono w5 tx"><span>{q.rateF}</span></span>
                    ) : null}
                    {q.canAssign ? (
                      <button className="btn xs" onClick={q.assign}>Assign</button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <section className="card oh c" style={{ minHeight: "0" }}>
          <div className="tlh">
            <div className="tlh0">Driver · equipment</div>
            <div className="tlhours">
              {B.hours.map((h, i) => (
                <span key={i}><span>{h}</span></span>
              ))}
              <span className="nowtag" style={{ left: B.nowP }}>11:20</span>
            </div>
          </div>
          <div className="tlbody">
            {B.rows.map((d, i) => (
              <div key={i} className={clsx("tlrow", d.cls)}>
                <div className="tld">
                  <span className="av" data-k={d.pk}>
                    <span>{d.ini}</span>
                    <span className="pres"></span>
                  </span>
                  <div className="f1">
                    <div className="fs13 w5 ell"><span>{d.n}</span></div>
                    <div className="mono fs11 mu"><span>{d.units}</span></div>
                  </div>
                  <span className="fs11 w5 tc nw" data-k={d.ck}><span>{d.chip}</span></span>
                </div>
                <div className="tltrack">
                  {d.blocks.map((b, i2) => (
                    <Fragment key={i2}>
                      {" "}
                      <div className={clsx("blk2", b.cls)} data-k={b.k} style={{ left: b.l, width: b.w }} title={b.title}>
                        <div className="r g4">
                          <span className="mono fs11 w6 nw"><span>{b.id}</span></span>
                          {b.alert ? (
                            <Icon className="s12 b" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
                          ) : null}
                        </div>
                        <div className="fs11 ell"><span>{b.lane}</span></div>
                      </div>
                      {" "}
                    </Fragment>
                  ))}
                  {d.empty ? (
                    <div className="tlempty">Available all day · drag a load here or use Assign</div>
                  ) : null}
                </div>
              </div>
            ))}
            <div className="nowline" style={{ left: `calc(208px + (100% - 208px) * ${B.nowF})` }}></div>
          </div>
        </section>
        {B.wp ? (
          <aside className="card oh c apanel" aria-label="Assign load">
            <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--bd2)" }}>
              <div className="r g8">
                <span className="over">Assign load</span>
                <span className="mono fs12 w5 t2"><span>{A.id}</span></span>
                <span className="badge" data-k="planned">
                  <i></i>
                  Planned
                </span>
                <span className="sp"></span>
                <button className="btn ghost icon sm" onClick={closePanel} aria-label="Close assignment panel"><Icon d="M18 6L6 18M6 6l12 12" /></button>
              </div>
              <div className="fs15 w6" style={{ marginTop: "8px" }}><span>{A.lane}</span></div>
              <div className="fs12 mu num" style={{ marginTop: "2px" }}><span>{A.when}</span></div>
              <div className="r g4 wrap" style={{ marginTop: "10px" }}>
                {A.req.map((t, i) => (
                  <span key={i} className="tag" data-k="mu"><span>{t}</span></span>
                ))}
              </div>
            </div>
            <div className="c g12" style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "12px 16px 16px" }}>
              {A.conflict ? (
                <div className="banner" data-k="bad">
                  <Icon d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
                  <div className="f1">
                    <div className="bt">Ben Okafor was just assigned elsewhere</div>
                    <div>
                      Alex Rivera assigned him to
                      {" "}
                      <b className="mono">FF-24873</b>
                      {" "}
                      12 seconds ago (15:00 → 03:00), which overlaps this load. Nothing was saved — your other choices are kept.
                    </div>
                    <div className="r g8" style={{ marginTop: "8px" }}>
                      <button className="btn sm">
                        <Icon className="s14" d="M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" />
                        Refresh availability
                      </button>
                      <button className="btn sm ghost">View FF-24873</button>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="r g8">
                <span className="h3">Drivers</span>
                <span className="fs12 mu"><span>{A.elig}</span></span>
                <span className="sp"></span>
                <button className="btn ghost xs">
                  Best match
                  <Icon className="s12" d="M6 9l6 6 6-6" />
                </button>
              </div>
              <div className="c g6">
                {A.cands.map((cd, i) => (
                  <button key={i} className={clsx("cand", cd.cls)} aria-pressed={cd.pressed}>
                    <span className={clsx("radio", cd.on)}></span>
                    <span className="av" data-k={cd.pk}>
                      <span>{cd.ini}</span>
                      <span className="pres"></span>
                    </span>
                    <span className="f1 c g2">
                      <span className="r g6">
                        <span className="fs13 w5 tx ell"><span>{cd.n}</span></span>
                        {cd.best ? (
                          <span className="tag" data-k="brand">
                            <Icon className="s12 fill" d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1z" />
                            Best match
                          </span>
                        ) : null}
                        {cd.changed ? (
                          <span className="tag" data-k="bad">Changed</span>
                        ) : null}
                      </span>
                      <span className="fs12 mu ell"><span>{cd.sub}</span></span>
                      <span className="r g4 wrap" style={{ marginTop: "3px" }}>
                        {cd.why.map((y, i2) => (
                          <span key={i2} className="why" data-k={y.k}>
                            <Icon className="s12 b" d={y.ic} />
                            <span>{y.t}</span>
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="r g8" style={{ marginTop: "4px" }}>
                <span className="h3">Equipment</span>
                <span className="fs12 mu">Matched to driver’s unit</span>
              </div>
              <div className="card" style={{ boxShadow: "none" }}>
                {A.eq.map((e, i) => (
                  <div key={i} className="r g10" style={{ padding: "10px 12px", borderBottom: "1px solid var(--bd2)" }}>
                    <span className="eqic">
                      <Icon className="s14" d="M1 5h14v11H1zM15 9h4l3 3v4h-7zM5.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
                    </span>
                    <div className="f1">
                      <div className="fs13 w5">
                        <span className="mono"><span>{e.unit}</span></span>
                        {" "}·{" "}<span>{e.kind}</span>
                      </div>
                      <div className="fs12 mu ell"><span>{e.sub}</span></div>
                    </div>
                    <span className="risk" data-k={e.k}>
                      <Icon className="s12 b" d="M5 12l5 5 9-10" />
                      <span>{e.st}</span>
                    </span>
                    <button className="btn xs ghost">Change</button>
                  </div>
                ))}
              </div>
              <label className="r g8 fs13" style={{ marginTop: "2px" }}>
                <input type="checkbox" className="cbx" defaultChecked />
                Notify driver in app and Telegram
              </label>
              <textarea className="inp" rows={2} placeholder="Message to driver (optional)" aria-label="Message to driver"></textarea>
            </div>
            <div className="dfoot" style={{ padding: "12px 16px" }}>
              <span className="note" style={{ maxWidth: "190px" }}>
                <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
                Availability and qualifications are re-checked when you assign.
              </span>
              <span className="sp"></span>
              <button className="btn" onClick={closePanel}>Cancel</button>
              <button className="btn pri" disabled={A.blocked}><span>{A.cta}</span></button>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
