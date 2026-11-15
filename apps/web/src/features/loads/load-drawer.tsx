"use client";

import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { tx } from "@/features/console/dom";

/** Load details in a side drawer, opened from the loads list. */
export function LoadDrawer() {
  const { hasDrawer, closeDrawer, DL, noFin, fin, user } = useConsole();
  if (!hasDrawer) return null;
  return (
    <>
      <div className="scrim" onClick={closeDrawer}></div>
      <aside className="drawer" aria-label="Load details">
        <div style={{ padding: "16px 20px 0", flex: "none", borderBottom: "1px solid var(--bd)" }}>
          <div className="r g8">
            <span className="mono fs13 w5 t2">{tx(DL.id)}</span>
            <span className="badge" data-k={DL.k}>
              <i></i>
              {tx(DL.st)}
            </span>
            {DL.rk ? (
              <span className="risk" data-k={DL.rk}>
                <Icon className="s14" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
                {tx(DL.rkTxt)}
              </span>
            ) : null}
            <span className="sp"></span>
            <button className="btn ghost icon" onClick={DL.full} aria-label="Open full page">
              <Icon className="s14" d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </button>
            <button className="btn ghost icon" aria-label="More actions"><Icon className="dots" d="M5 12h.01M12 12h.01M19 12h.01" /></button>
            <button className="btn ghost icon" onClick={closeDrawer} aria-label="Close"><Icon d="M18 6L6 18M6 6l12 12" /></button>
          </div>
          <h2 style={{ margin: "10px 0 2px", fontSize: "18px", lineHeight: "24px", fontWeight: "600", letterSpacing: "-0.01em" }}>{tx(DL.pu)}{" → "}{tx(DL.del)}</h2>
          <div className="fs13 mu">{tx(DL.cust)}{" · "}{tx(DL.ref)}{" · "}{tx(DL.miF)}{" mi · "}{tx(DL.eq)}</div>
          {DL.alert ? (
            <div className="banner" data-k={DL.aK} style={{ marginTop: "14px" }}>
              <Icon d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
              <div className="f1">
                <div className="bt">{tx(DL.aTitle)}</div>
                <div>{tx(DL.aText)}</div>
              </div>
              <button className="btn sm">{tx(DL.aBtn)}</button>
            </div>
          ) : null}
          <div className="r g20" style={{ marginTop: "12px" }}>
            <button className="dtab on">Overview</button>
            <button className="dtab">Stops</button>
            <button className="dtab">
              Documents
              <span className="mono fs11 tc" data-k={DL.docK}>{tx(DL.docsF)}</span>
            </button>
            <button className="dtab">
              Financials
              {noFin ? (
                <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
              ) : null}
            </button>
            <button className="dtab">Activity</button>
          </div>
        </div>
        <div className="c g20" style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "18px 20px 20px" }}>
          <div>
            <div className="over" style={{ marginBottom: "10px" }}>Stops</div>
            {DL.stops?.map((s, i) => (
              <div key={i} className="stop">
                <div className="c" style={{ alignItems: "center" }}>
                  <span className="smk" data-k={s.k}>
                    {s.done ? (
                      <Icon className="s12 b" d="M5 12l5 5 9-10" />
                    ) : null}
                    {s.todo ? (
                      <span>{s.n}</span>
                    ) : null}
                  </span>
                  <span className={clsx("sline", s.lc)}></span>
                </div>
                <div style={{ paddingBottom: "16px" }} className="mw0">
                  <div className="over" style={{ letterSpacing: ".04em" }}><span>{s.type}</span></div>
                  <div className="fs14 w5"><span>{s.fac}</span></div>
                  <div className="fs12 mu num"><span>{s.city}</span>{" · Appt "}<span>{s.appt}</span></div>
                </div>
                <div className="fs12 w5 tc num nw rt" data-k={s.sk} style={{ paddingTop: "16px" }}><span>{s.stTxt}</span></div>
              </div>
            ))}
          </div>
          <div>
            <div className="over" style={{ marginBottom: "10px" }}>Assignment</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "8px" }}>
              {DL.assign?.map((x, i) => (
                <div key={i} className="card" style={{ padding: "10px 12px", boxShadow: "none" }}>
                  <div className="fs12 mu"><span>{x.k}</span></div>
                  <div className="fs13 w5 tc" data-k={x.tk} style={{ marginTop: "2px" }}><span>{x.v}</span></div>
                  <div className="fs12 mu ell"><span>{x.sub}</span></div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="over r g6" style={{ marginBottom: "10px" }}>
              Financials
              {noFin ? (
                <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
              ) : null}
            </div>
            {fin ? (
              <div className="card oh" style={{ boxShadow: "none" }}>
                {DL.finRows?.map((f, i) => (
                  <div key={i} className="r jb fs13" style={{ padding: "8px 12px", borderBottom: "1px solid var(--bd2)" }}>
                    <span className="t3"><span>{f.k}</span></span>
                    <span className="mono num"><span>{f.v}</span></span>
                  </div>
                ))}
                <div className="r jb fs13 w6" style={{ padding: "10px 12px", background: "var(--sf2)" }}>
                  <span>
                    {"Estimated total "}
                    <span className="fs12 mu" style={{ fontWeight: "400" }}>{"· "}{tx(DL.rpm)}/mi · not yet invoiced</span>
                  </span>
                  <span className="mono num">{tx(DL.total)}</span>
                </div>
              </div>
            ) : null}
            {noFin ? (
              <div className="r g12" style={{ padding: "12px 14px", border: "1px dashed var(--bd3)", borderRadius: "8px", background: "var(--sf2)" }}>
                <span className="eqic"><Icon className="s14" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" /></span>
                <div className="f1">
                  <div className="fs13 w5">Financials are restricted</div>
                  <div className="fs12 mu">Your role (<span>{user.role}</span>) can’t view rates, pay or margins. The server doesn’t send them.</div>
                </div>
                <button className="btn sm">Request access</button>
              </div>
            ) : null}
          </div>
          <div>
            <div className="over" style={{ marginBottom: "10px" }}>Documents</div>
            <div className="card oh" style={{ boxShadow: "none" }}>
              {DL.docs?.map((dc, i) => (
                <div key={i} className="r g10" style={{ padding: "8px 12px", borderBottom: "1px solid var(--bd2)" }}>
                  <Icon className="mu" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" />
                  <span className="f1 fs13"><span>{dc.k}</span></span>
                  <span className="risk" data-k={dc.tk}>
                    <span className="dot"></span>
                    <span>{dc.state}</span>
                  </span>
                  <button className="lnk" style={{ width: "56px", textAlign: "right" }}><span>{dc.act}</span></button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="over" style={{ marginBottom: "10px" }}>Activity</div>
            {DL.activity?.map((ac, i) => (
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
        </div>
        <div className="dfoot">
          <span className="fs12 mu">Updated 2 min ago · v14</span>
          <span className="sp"></span>
          <button className="btn">
            Update status
            <Icon className="s12" d="M6 9l6 6 6-6" />
          </button>
          <button className="btn pri" onClick={DL.full}>{tx(DL.primary)}</button>
        </div>
      </aside>
    </>
  );
}
