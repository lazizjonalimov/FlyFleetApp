"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { BasicCell } from "@/components/data-table/cells";
import { ChangeDetail } from "@/components/data-table/change-detail";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Load detail page: lifecycle, route and tracking, stops, documents, financials, activity. */
export function LoadScreen() {
  const { isLoad, goLoads, LP, goMessages, noFin, goTracking, fin } = useConsole();
  if (!isLoad) return null;
  return (
    <div className="scr">
      <div className="ph" style={{ paddingBottom: "10px" }}>
        <div className="f1">
          <div className="crumb">
            <span>Operations</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <button onClick={goLoads}>Loads</button>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b className="mono"><span>{LP.id}</span></b>
          </div>
          <div className="r g10">
            <h1 className="h1"><span>{LP.title}</span></h1>
            <span className="badge lg" data-k={LP.k}>
              <i></i>
              <span>{LP.st}</span>
            </span>
            {LP.rk ? (
              <span className="badge lg sq" data-k={LP.rk}>
                <Icon className="s14" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
                <span>{LP.rkTxt}</span>
              </span>
            ) : null}
          </div>
          <p className="sub"><span>{LP.sub}</span></p>
        </div>
        <div className="r g8">
          <button className="btn" onClick={goMessages}>
            <Icon className="s14" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            Message driver
          </button>
          <button className="btn">
            Update status
            <Icon className="s12" d="M6 9l6 6 6-6" />
          </button>
          <button className="btn pri">
            <Icon className="s14" d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
            Notify customer
          </button>
        </div>
      </div>
      <div className="lc">
        {LP.steps.map((s, i) => (
          <div key={i} className={clsx("lcs", s.st)}>
            <span className="lcd">
              {s.done ? (
                <Icon className="s12 b" d="M5 12l5 5 9-10" />
              ) : null}
            </span>
            <span className="lcl"><span>{s.l}</span></span>
            <span className="lct"><span>{s.t}</span></span>
          </div>
        ))}
        <div className="lcx">
          <span className="fs11 mu">Other transitions</span>
          <button className="lnk">Put on hold</button>
          <button className="lnk" style={{ color: "#B42318" }}>Cancel load</button>
        </div>
      </div>
      <div className="tabs" style={{ marginTop: "4px" }}>
        <button className="tab on">Overview</button>
        <button className="tab">
          Stops
          <span className="tcnt">2</span>
        </button>
        <button className="tab">Tracking</button>
        <button className="tab">
          Documents
          <span className="tcnt">2/3</span>
        </button>
        <button className="tab">
          Financials
          {noFin ? (
            <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
          ) : null}
        </button>
        <button className="tab">
          Messages
          <span className="tcnt">4</span>
        </button>
        <button className="tab">
          Activity
          <span className="tcnt">14</span>
        </button>
      </div>
      <div className="lpg">
        <div className="c g16">
          {LP.alert ? (
            <div className="banner" data-k={LP.aK}>
              <Icon d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
              <div className="f1">
                <div className="bt"><span>{LP.aTitle}</span></div>
                <div><span>{LP.aText}</span></div>
              </div>
              <div className="r g8">
                {LP.a2 ? (
                  <button className="btn sm"><span>{LP.a2}</span></button>
                ) : null}
                <button className="btn sm pri"><span>{LP.aBtn}</span></button>
              </div>
            </div>
          ) : null}
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">{"Route & tracking"}</h2>
              <span className="badge" data-k={LP.fk}>
                <i></i>
                <span>{LP.fresh}</span>
              </span>
              <span className="sp"></span>
              <button className="lnk" onClick={goTracking}>Open in Live fleet</button>
            </div>
            <div className="lpmap">
              <svg viewBox="0 0 760 200" preserveAspectRatio="none" aria-hidden="true" className="lpsvg">
                <path className="mroad" d="M0 168 C 140 150, 210 120, 300 128 S 520 60, 760 40" />
                <path className="mroad" d="M90 0 C 120 60, 160 120, 140 200" />
                <path className="mroad" d="M560 0 C 540 70, 600 140, 640 200" />
                <path className="mdone" d="M70 160 C 180 150, 260 118, 360 110 S 450 96, 492 84" />
                <path className="mrest" d="M492 84 C 560 66, 630 52, 690 42" />
              </svg>
              <span className="mpin" style={{ left: "70px", top: "160px" }} data-k="ok"></span>
              <span className="mlab" style={{ left: "58px", top: "172px" }}><span>{LP.oLab}</span></span>
              <span className="mpin" style={{ left: "690px", top: "42px" }} data-k={LP.dK}></span>
              <span className="mlab" style={{ left: "560px", top: "16px" }}><span>{LP.dLab}</span></span>
              {LP.moving ? (
                <>
                  <span className="mtruck" style={{ left: "492px", top: "84px" }}><Icon className="s12 fill" d="M12 2l7 19-7-4-7 4z" /></span>
                  <span className="mlab" style={{ left: "440px", top: "104px" }}><span>{LP.tLab}</span></span>
                </>
              ) : null}
            </div>
            <div className="lpstats">
              {LP.stats.map((s, i) => (
                <div key={i}>
                  <div className="fs12 mu"><span>{s.k}</span></div>
                  <div className="fs14 w6 num tc" data-k={s.tk}><span>{s.v}</span></div>
                </div>
              ))}
            </div>
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Stops</h2>
              <span className="fs12 mu">Appointment times in the stop’s timezone</span>
              <span className="sp"></span>
              <button className="btn sm">
                <Icon className="s12 b" d="M12 5v14M5 12h14" />
                Add stop
              </button>
            </div>
            <div className="thead" style={{ gridTemplateColumns: LP.stops.cols }}>
              {LP.stops.head.map((h, i) => (
                <span key={i} className={h.al}><span>{h.l}</span></span>
              ))}
            </div>
            {LP.stops.rows.map((r, i) => (
              <Fragment key={i}>
                <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: LP.stops.cols }} onClick={r.open}>
                  {r.cells.map((c, i2) => (
                    <BasicCell key={i2} c={c} />
                  ))}
                </div>
                <ChangeDetail r={r} />
              </Fragment>
            ))}
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Documents</h2>
              <span className="cnt" data-k="warn">2 of 3</span>
              <span className="sp"></span>
              <button className="btn sm">
                <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                Upload
              </button>
            </div>
            <div className="thead" style={{ gridTemplateColumns: LP.docs.cols }}>
              {LP.docs.head.map((h, i) => (
                <span key={i} className={h.al}><span>{h.l}</span></span>
              ))}
            </div>
            {LP.docs.rows.map((r, i) => (
              <Fragment key={i}>
                <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: LP.docs.cols }} onClick={r.open}>
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
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Assignment</h2>
              <span className="sp"></span>
              <button className="btn xs">Reassign</button>
            </div>
            <div className="cb c g12">
              <div className="r g10">
                <span className="av md" data-k={LP.dpk}>
                  <span>{LP.dini}</span>
                  <span className="pres"></span>
                </span>
                <div className="f1">
                  <div className="fs13 w5"><span>{LP.drv}</span></div>
                  <div className="fs12 mu"><span>{LP.dsub}</span></div>
                </div>
                <span className="chn" data-k="info" title="Telegram linked"><Icon className="s12" d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></span>
                <span className="chn" data-k="brand" title="Driver app online">
                  <Icon className="s12" d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01" />
                </span>
              </div>
              <div className="hr"></div>
              <dl className="kv">
                {LP.asg.map((x, i) => (
                  <Fragment key={i}>
                    <dt><span>{x.k}</span></dt>
                    <dd className="num"><span>{x.v}</span></dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Financials</h2>
              {noFin ? (
                <Icon className="s14 mu" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
              ) : null}
              <span className="sp"></span>
              {fin ? (
                <span className="tag" data-k="mu">Estimated</span>
              ) : null}
            </div>
            {fin ? (
              <div className="cb c g8">
                {LP.fin.map((f, i) => (
                  <div key={i} className="r jb fs13">
                    <span className="t3"><span>{f.k}</span></span>
                    <span className="mono num"><span>{f.v}</span></span>
                  </div>
                ))}
                <div className="hr"></div>
                <div className="r jb fs14 w6">
                  <span>Total</span>
                  <span className="mono num"><span>{LP.total}</span></span>
                </div>
                <p className="note">
                  <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
                  Revenue is recognized on the invoice, after POD review — not here.
                </p>
              </div>
            ) : null}
            {noFin ? (
              <div className="cb fs13 mu">Rates, pay and margins aren’t available to your role.</div>
            ) : null}
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Customer</h2>
              <span className="sp"></span>
              <span className="tag" data-k="ok">
                <Icon className="s12" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
                Shared in portal
              </span>
            </div>
            <div className="cb c g10">
              <div className="fs13 w5"><span>{LP.cust}</span></div>
              <div className="r g10">
                <span className="av sm"><span>{LP.c1i}</span></span>
                <div className="f1">
                  <div className="fs13"><span>{LP.c1}</span></div>
                  <div className="fs12 mu">Operations · receives delay notices</div>
                </div>
                <Icon className="s14 mu" d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6" />
              </div>
              <div className="r g10">
                <span className="av sm">AP</span>
                <div className="f1">
                  <div className="fs13">Accounts payable</div>
                  <div className="fs12 mu">Billing contact · Net 30</div>
                </div>
                <Icon className="s14 mu" d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6" />
              </div>
            </div>
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Activity</h2>
              <span className="fs12 mu">Immutable · newest first</span>
            </div>
            <div className="cb" style={{ paddingTop: "8px" }}>
              {LP.act.map((ac, i) => (
                <div key={i} className="act">
                  <span className="dot" data-k={ac.k} style={{ marginTop: "6px" }}></span>
                  <div className="fs13 t2">
                    <span className="w5 tx"><span>{ac.who}</span></span>
                    {" "}<span>{ac.what}</span>
                    <span className="src"><span>{ac.src}</span></span>
                  </div>
                  <span className="fs12 mu num nw"><span>{ac.when}</span></span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
