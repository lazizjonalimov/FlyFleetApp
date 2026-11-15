"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { BasicCell } from "@/components/data-table/cells";
import { ChangeDetail } from "@/components/data-table/change-detail";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Driver profile with the qualification file. */
export function DriverScreen() {
  const { isDriver, DP, goDrivers, goMessages, goDispatch, goLoads } = useConsole();
  if (!isDriver) return null;
  return (
    <div className="scr">
      <div className="ph" style={{ alignItems: "center", paddingBottom: "16px" }}>
        <span className="av lg" data-k={DP.pk}>
          <span>{DP.ini}</span>
          <span className="pres" style={{ width: "14px", height: "14px", borderWidth: "3px" }}></span>
        </span>
        <div className="f1">
          <div className="crumb" style={{ marginBottom: "2px" }}>
            <span>Directory</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <button onClick={goDrivers}>Drivers</button>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b><span>{DP.n}</span></b>
          </div>
          <div className="r g10">
            <h1 className="h1"><span>{DP.n}</span></h1>
            <span className="badge" data-k={DP.sk}>
              <i></i>
              <span>{DP.st}</span>
            </span>
            <span className="badge sq" data-k={DP.qk}>
              <Icon className="s12 b" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
              <span>{DP.ql}</span>
            </span>
          </div>
          <p className="sub"><span>{DP.sub}</span></p>
        </div>
        <div className="r g8">
          <button className="btn" onClick={goMessages}>
            <Icon className="s14" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            Message
          </button>
          <button className="btn">
            <Icon className="s14" d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
            Edit
          </button>
          <button className="btn pri" onClick={goDispatch}>Assign load</button>
        </div>
      </div>
      <div className="tabs">
        <button className="tab on">Overview</button>
        <button className="tab">
          Qualifications
          <span className="tcnt">6</span>
        </button>
        <button className="tab">
          Documents
          <span className="tcnt">11</span>
        </button>
        <button className="tab">Loads</button>
        <button className="tab">{"Location & privacy"}</button>
        <button className="tab">Activity</button>
      </div>
      <div className="lpg">
        <div className="c g16">
          {DP.alert ? (
            <div className="banner" data-k={DP.aK}>
              <Icon d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
              <div className="f1">
                <div className="bt"><span>{DP.aT}</span></div>
                <div><span>{DP.aD}</span></div>
              </div>
              <button className="btn sm"><span>{DP.aB}</span></button>
            </div>
          ) : null}
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Qualification file</h2>
              <span className="fs12 mu">Reviewed documents decide eligibility — reminders don’t</span>
              <span className="sp"></span>
              <button className="btn sm">
                <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                Add document
              </button>
            </div>
            <div className="thead" style={{ gridTemplateColumns: DP.q.cols }}>
              {DP.q.head.map((h, i) => (
                <span key={i} className={h.al}><span>{h.l}</span></span>
              ))}
            </div>
            {DP.q.rows.map((r, i) => (
              <Fragment key={i}>
                <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: DP.q.cols }} onClick={r.open}>
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
              <h2 className="h2">Recent loads</h2>
              <span className="fs12 mu">Last 30 days</span>
              <span className="sp"></span>
              <button className="lnk" onClick={goLoads}>All loads</button>
            </div>
            <div className="thead" style={{ gridTemplateColumns: DP.loads.cols }}>
              {DP.loads.head.map((h, i) => (
                <span key={i} className={h.al}><span>{h.l}</span></span>
              ))}
            </div>
            {DP.loads.rows.map((r, i) => (
              <Fragment key={i}>
                <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: DP.loads.cols }} onClick={r.open}>
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
              <h2 className="h2">Right now</h2>
              <span className="sp"></span>
              <span className="fs12 mu">11:20 CT</span>
            </div>
            <div className="cb c g10">
              {DP.now.map((x, i) => (
                <div key={i} className="r g10">
                  <span className="badge" data-k={x.k}>
                    <i></i>
                    <span>{x.st}</span>
                  </span>
                  <div className="f1">
                    <div className="r g6">
                      <button className="idl" onClick={x.go}><span>{x.id}</span></button>
                      <span className="fs13 ell"><span>{x.lane}</span></span>
                    </div>
                    <div className="fs12 mu"><span>{x.t}</span></div>
                  </div>
                </div>
              ))}
              <div className="hr"></div>
              <dl className="kv">
                <dt>Truck</dt>
                <dd><span className="mono"><span>{DP.trk}</span></span></dd>
                <dt>Trailer</dt>
                <dd><span className="mono"><span>{DP.trl}</span></span></dd>
                <dt>Last position</dt>
                <dd><span>{DP.pos}</span></dd>
              </dl>
            </div>
          </section>
          <section className="card oh">
            <div className="ch"><h2 className="h2">Connected channels</h2></div>
            {DP.chans.map((h, i) => (
              <div key={i} className="r g10" style={{ padding: "10px 16px", borderBottom: "1px solid var(--bd2)" }}>
                <span className="chn" data-k={h.k} style={{ width: "30px", height: "30px" }}><Icon className="s14" d={h.ic} /></span>
                <div className="f1">
                  <div className="fs13 w5"><span>{h.n}</span></div>
                  <div className="fs12 mu"><span>{h.d}</span></div>
                </div>
                <button className="btn xs ghost"><span>{h.act}</span></button>
              </div>
            ))}
            <p className="note" style={{ padding: "10px 16px 12px" }}>
              <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
              FlyFleet keeps the canonical message history. Telegram is a delivery channel only.
            </p>
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Sensitive details</h2>
              <Icon className="s14 mu" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
            </div>
            <div className="cb c g10">
              <dl className="kv">
                <dt>License number</dt>
                <dd className="mono">{"•••• "}<span>{DP.lic}</span></dd>
                <dt>Date of birth</dt>
                <dd className="mu">Hidden</dd>
                <dt>Medical examiner</dt>
                <dd className="mu">Hidden</dd>
              </dl>
              <button className="btn sm" style={{ alignSelf: "flex-start" }}>
                <Icon className="s14" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                Reveal · logged to audit
              </button>
            </div>
          </section>
          <section className="card oh">
            <div className="ch"><h2 className="h2">Last 30 days</h2></div>
            <div className="money" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
              {DP.stats.map((s, i) => (
                <div key={i} className="c g2">
                  <span className="fs12 t3"><span>{s.k}</span></span>
                  <span className="fs20 w6 num"><span>{s.v}</span></span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
