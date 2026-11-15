"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { BasicCell } from "@/components/data-table/cells";
import { ChangeDetail } from "@/components/data-table/change-detail";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Settings: integrations and the fleet alert policy. */
export function SettingsScreen() {
  const { isSettings, SET, isPolicy, isInteg, PO, M, IN } = useConsole();
  if (!isSettings) return null;
  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "14px", borderBottom: "1px solid var(--bd)" }}>
        <div className="f1">
          <div className="crumb">
            <span>Administration</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <span>Settings</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b><span>{SET.page}</span></b>
          </div>
          <h1 className="h1"><span>{SET.page}</span></h1>
          <p className="sub"><span>{SET.sub}</span></p>
        </div>
        {isPolicy ? (
          <div className="r g8">
            <button className="btn">
              <Icon className="s14" d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
              Versions
            </button>
            <button className="btn pri">Save as v4</button>
          </div>
        ) : null}
        {isInteg ? (
          <div className="r g8">
            <button className="btn">
              <Icon className="s14" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" />
              Webhook log
            </button>
            <button className="btn pri">
              <Icon className="s14 b" d="M12 5v14M5 12h14" />
              Add integration
            </button>
          </div>
        ) : null}
      </div>
      <div className="stg">
        <nav className="stnav" aria-label="Settings sections">
          {SET.nav.map((n, i) => (
            <button key={i} className={clsx("rci", n.on)} onClick={n.go}>
              <Icon className="s14" d={n.ic} />
              <span className="f1 ell"><span>{n.l}</span></span>
            </button>
          ))}
        </nav>
        <div style={{ overflow: "auto", minHeight: "0", padding: "20px 24px 24px" }}>
          {isPolicy ? (
            <div className="c g16">
              <div className="r g6 wrap">
                {PO.list.map((p, i) => (
                  <button key={i} className={clsx("pol", p.on)}>
                    <span className="dot" data-k={p.k}></span>
                    <span>{p.l}</span>
                    <span className="mono fs11 mu"><span>{p.v}</span></span>
                  </button>
                ))}
                <button className="pol" style={{ borderStyle: "dashed" }}>
                  <Icon className="s12 b" d="M12 5v14M5 12h14" />
                  New policy
                </button>
              </div>
              <div className="pgrid">
                <section className="card oh">
                  <div className="ch">
                    <h2 className="h2">Rule</h2>
                    <span className="sp"></span>
                    <span className="fs12 t3">Enabled</span>
                    <button className="tog on" aria-label="Policy enabled" aria-pressed="true"></button>
                  </div>
                  <div className="cb c g14">
                    <div className="fld">
                      <label htmlFor="po-n">Name</label>
                      <input id="po-n" className="inp" defaultValue="Highway sustained speeding" />
                    </div>
                    <div className="fld">
                      <span className="lbl">Speed source</span>
                      <label className="opt on">
                        <input type="radio" className="cbx" name="po-src" defaultChecked />
                        <span className="c">
                          <span className="fs13 w5">Vehicle-reported speed (telematics)</span>
                          <span className="fs12 mu">Preferred. Read from the truck’s own sensors.</span>
                        </span>
                      </label>
                      <label className="opt">
                        <input type="radio" className="cbx" name="po-src" />
                        <span className="c">
                          <span className="fs13 w5">Driver app GPS, as fallback only</span>
                          <span className="fs12 mu">Phone GPS is noisy — used only when a truck has no telematics.</span>
                        </span>
                      </label>
                    </div>
                    <div className="pfields">
                      <div className="fld">
                        <label htmlFor="po-t">Threshold</label>
                        <div className="ufield">
                          <input id="po-t" className="inp mono" defaultValue="70" />
                          <span>mph</span>
                        </div>
                        <span className="hint">Company limit — not the posted limit</span>
                      </div>
                      <div className="fld">
                        <label htmlFor="po-tol">Tolerance</label>
                        <div className="ufield">
                          <input id="po-tol" className="inp mono" defaultValue="+3" />
                          <span>mph</span>
                        </div>
                        <span className="hint">Alerts start above 73</span>
                      </div>
                      <div className="fld">
                        <label htmlFor="po-d">Must last at least</label>
                        <div className="ufield">
                          <input id="po-d" className="inp mono" defaultValue="2" />
                          <span>min</span>
                        </div>
                        <span className="hint">One sample never alerts</span>
                      </div>
                      <div className="fld">
                        <label htmlFor="po-c">Cooldown</label>
                        <div className="ufield">
                          <input id="po-c" className="inp mono" defaultValue="20" />
                          <span>min</span>
                        </div>
                        <span className="hint">One incident per episode</span>
                      </div>
                    </div>
                    <div className="fld">
                      <span className="lbl">Ignore samples that are</span>
                      <div className="r g6 wrap">
                        <span className="tag" data-k="mu">less accurate than 50 m</span>
                        <span className="tag" data-k="mu">older than 5 min</span>
                        <span className="tag" data-k="mu">outside 0–110 mph</span>
                      </div>
                    </div>
                    <div className="fld">
                      <span className="lbl">Applies to</span>
                      <div className="r g6 wrap">
                        <span className="chip" style={{ height: "26px" }}>
                          All trucks
                          <Icon className="s12 b" d="M18 6L6 18M6 6l12 12" />
                        </span>
                        <span className="chip add" style={{ height: "26px" }}>
                          <Icon className="s12 b" d="M12 5v14M5 12h14" />
                          Active hours: all day · CT
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
                <section className="card oh">
                  <div className="ch"><h2 className="h2">Who gets told</h2></div>
                  <div className="cb c g12">
                    {PO.who.map((w, i) => (
                      <div key={i} className="whor">
                        <div className="r g8">
                          <span className="av sm"><span>{w.ini}</span></span>
                          <span className="fs13 w5 f1"><span>{w.n}</span></span>
                          <span className="fs12 mu"><span>{w.when}</span></span>
                        </div>
                        <div className="r g6 wrap" style={{ paddingLeft: "32px" }}>
                          {w.ch.map((c2, i2) => (
                            <span key={i2} className="tag" data-k={c2.k}>
                              <Icon className="s12" d={c2.ic} />
                              <span>{c2.l}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="c g6">
                      <span className="lbl">{"Driver message · Telegram & app"}</span>
                      <div className="bubble">
                        FlyFleet — Lone Star Dispatch
                        <br />
                        Your truck has been above 70 mph for 2 minutes. Please slow down when it’s safe. Reply OK to acknowledge.
                      </div>
                      <span className="hint">Approved template v2 · no location or load details in group chats</span>
                    </div>
                  </div>
                </section>
              </div>
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">Preview on real data</h2>
                  <span className="fs12 mu">Last 7 days · all trucks</span>
                  <span className="sp"></span>
                  <span className="mono fs12 t3">T-1121 · today 10:50–11:20</span>
                </div>
                <div className="r g24" style={{ padding: "14px 16px 16px", alignItems: "stretch" }}>
                  <div className="c g12" style={{ width: "260px", flex: "none" }}>
                    {PO.prev.map((pv, i) => (
                      <div key={i} className="c g2">
                        <span className="fs12 t3"><span>{pv.k}</span></span>
                        <span className="fs20 w6 num"><span>{pv.v}</span></span>
                        <span className="fs12 mu"><span>{pv.s}</span></span>
                      </div>
                    ))}
                  </div>
                  <div className="spark f1">
                    <svg viewBox="0 0 312 96" preserveAspectRatio="none" aria-hidden="true" style={{ height: "150px" }}>
                      <rect className="spz" x={M.zx} y="0" width={M.zw} height="96" />
                      <line className="spt" x1="0" x2="312" y1="48" y2="48" />
                      <line className="spt2" x1="0" x2="312" y1="33.6" y2="33.6" />
                      <path className="spl2" d={M.spark} />
                    </svg>
                    <span className="spk" style={{ top: "66px" }}>70 · threshold</span>
                    <span className="spk" style={{ top: "42px", color: "#B42318" }}>73 · alert starts</span>
                    <div className="r jb fs11 mu mono" style={{ marginTop: "4px" }}>
                      <span>10:50</span>
                      <span>11:14 above 73</span>
                      <span>11:16 incident</span>
                      <span>11:20</span>
                    </div>
                  </div>
                </div>
              </section>
              <p className="note">
                <Icon className="s14" d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
                v3 by Dana Kim, Nov 10. Saving creates v4; open incidents keep the version that created them.
              </p>
            </div>
          ) : null}
          {isInteg ? (
            <div className="c g16">
              <div className="igrid">
                {IN.cards.map((it, i) => (
                  <section key={i} className="card icard">
                    <div className="r g10">
                      <span className="ilogo" data-k={it.k}><Icon className="s18" d={it.ic} /></span>
                      <div className="f1">
                        <div className="r g6">
                          <span className="fs14 w6"><span>{it.n}</span></span>
                          {it.tag ? (
                            <span className="tag" data-k="mu"><span>{it.tag}</span></span>
                          ) : null}
                        </div>
                        <div className="fs12 mu"><span>{it.cat}</span></div>
                      </div>
                      <span className="badge" data-k={it.sk}>
                        <i></i>
                        <span>{it.st}</span>
                      </span>
                    </div>
                    <dl className="kv" style={{ fontSize: "12px", lineHeight: "17px" }}>
                      {it.kv.map((x, i2) => (
                        <Fragment key={i2}>
                          <dt><span>{x.k}</span></dt>
                          <dd><span>{x.v}</span></dd>
                        </Fragment>
                      ))}
                    </dl>
                    <div className="r g6" style={{ marginTop: "auto" }}>
                      {it.acts.map((a, i2) => (
                        <button key={i2} className={clsx("btn sm", a.cls)}><span>{a.l}</span></button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2">Inbound events</h2>
                  <span className="fs12 mu">Verified, de-duplicated, then queued — never processed inside the request</span>
                </div>
                <div className="thead" style={{ gridTemplateColumns: IN.t.cols }}>
                  {IN.t.head.map((h, i) => (
                    <span key={i} className={h.al}><span>{h.l}</span></span>
                  ))}
                </div>
                {IN.t.rows.map((r, i) => (
                  <Fragment key={i}>
                    <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: IN.t.cols }} onClick={r.open}>
                      {r.cells.map((c, i2) => (
                        <BasicCell key={i2} c={c} />
                      ))}
                    </div>
                    <ChangeDetail r={r} />
                  </Fragment>
                ))}
              </section>
              <p className="note">
                <Icon className="s14" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
                Credentials live in the secrets vault and are never shown again after saving. Each provider sits behind an adapter, so it can be swapped.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
