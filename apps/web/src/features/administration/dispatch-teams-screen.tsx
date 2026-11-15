"use client";

import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Dispatch teams: who works which trucks. */
export function DispatchTeamsScreen() {
  const { isTeams, DT, I, TT, goAudit } = useConsole();
  if (!isTeams) return null;
  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px" }}>
        <div className="f1">
          <div className="crumb">
            <span>Administration</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>{"Team & access"}</b>
          </div>
          <h1 className="h1">{"Team & access"}</h1>
          <p className="sub">Lone Star Freight · 17 members · dispatch teams limit a dispatcher to a set of trucks and everything tied to them</p>
        </div>
        <div className="r g8">
          <button className="btn" onClick={DT.preview}>
            <Icon className="s14" d={I.eye} />
            Preview as Jordan Lee
          </button>
          <button className="btn pri">
            <Icon className="s14 b" d="M12 5v14M5 12h14" />
            New dispatch team
          </button>
        </div>
      </div>
      <div className="tabs">
        {TT.map((t, i) => (
          <button key={i} className={clsx("tab", t.on)} onClick={t.go}>
            <span>{t.l}</span>
            <span className="tcnt"><span>{t.n}</span></span>
          </button>
        ))}
      </div>
      <div className="dtg">
        <nav className="rolelist" aria-label="Dispatch teams">
          {DT.teams.map((tm, i) => (
            <button key={i} className={clsx("rolei", tm.on)}>
              <span className="tmk" style={{ background: tm.c }}><span>{tm.ini}</span></span>
              <span className="f1 c">
                <span className="fs13 w5 tx ell"><span>{tm.n}</span></span>
                <span className="fs12 mu ell"><span>{tm.d}</span></span>
              </span>
            </button>
          ))}
          <div className="dtdef" style={{ marginTop: "6px" }}>
            <span className="tmk def"><Icon className="s14" d={I.globe} /></span>
            <span className="f1 c g2">
              <span className="fs13 w5 tx">No team · default</span>
              <span className="fs12 mu">1 dispatcher · Chris Allen. Sees all 41 trucks and every load.</span>
            </span>
          </div>
          <button className="addstop" style={{ height: "38px", marginTop: "6px" }}>
            <Icon className="s14 b" d="M12 5v14M5 12h14" />
            New dispatch team
          </button>
        </nav>
        <section className="dtmain">
          <div className="r g12">
            <span className="tmk" style={{ width: "36px", height: "36px", borderRadius: "9px", fontSize: "15px", background: "#1F4FE0" }}>A</span>
            <div className="f1">
              <div className="r g8">
                <span className="fs16 w6"><span>{DT.team.n}</span></span>
                <span className="tag" data-k="brand">Scoped to 14 trucks</span>
              </div>
              <div className="fs12 mu" style={{ marginTop: "2px" }}><span>{DT.team.sub}</span></div>
            </div>
            <button className="btn sm">Edit team</button>
          </div>
          <div className="c g8">
            <div className="r g8">
              <span className="h3">Dispatchers</span>
              <span className="cnt" data-k="mu">5</span>
              <span className="sp"></span>
              <span className="fs12 mu">A dispatcher belongs to one team at a time</span>
            </div>
            <div className="r g6 wrap">
              {DT.disp.map((d, i) => (
                <span key={i} className="dpill">
                  <span className="av sm me"><span>{d.i}</span></span>
                  <span>{d.n}</span>
                  {d.lead ? (
                    <span className="tag" data-k="brand">Lead</span>
                  ) : null}
                </span>
              ))}
              <button className="dpill add">
                <Icon className="s12 b" d="M12 5v14M5 12h14" />
                Add dispatcher
              </button>
            </div>
          </div>
          <div className="c g8">
            <div className="r g8">
              <span className="h3">Trucks</span>
              <span className="cnt" data-k="brand">14 of 41</span>
              <span className="sp"></span>
              <span className="fs12 mu">Loads, drivers and alerts follow the truck</span>
            </div>
            <div className="tchips">
              {DT.trucks.map((t, i) => (
                <button key={i} className="tchip">
                  <span className="mono fs12 w6 tx"><span>{t.u}</span></span>
                  <span className={clsx("fs12 ell", t.dk)}><span>{t.d}</span></span>
                </button>
              ))}
              <button className="tchip add">
                <Icon className="s12 b" d="M12 5v14M5 12h14" />
                Add trucks
              </button>
            </div>
          </div>
          <div className="rulec">
            <section className="card" style={{ padding: "12px 14px", boxShadow: "none" }}>
              <div className="h3" style={{ marginBottom: "4px" }}>Team A can see and work with</div>
              {DT.can.map((x, i) => (
                <div key={i} className="rule yes">
                  <Icon className="s14 b" d="M5 12l5 5 9-10" />
                  <span><span>{x}</span></span>
                </div>
              ))}
            </section>
            <section className="card" style={{ padding: "12px 14px", boxShadow: "none" }}>
              <div className="h3" style={{ marginBottom: "4px" }}>Hidden from Team A</div>
              {DT.cant.map((x, i) => (
                <div key={i} className="rule no">
                  <Icon className="s14 b" d="M18 6L6 18M6 6l12 12" />
                  <span><span>{x}</span></span>
                </div>
              ))}
            </section>
          </div>
          <p className="note">
            <Icon className="s14" d={I.shield} />
            <span>
              The server applies the same scope to pages, search, the map, exports, live updates, notifications and Ask FlyFleet. Role permissions still apply on top — a team never adds access the role doesn’t have.
            </span>
          </p>
        </section>
        <aside className="tmside">
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Truck coverage</h2>
              <span className="sp"></span>
              <span className="fs12 mu">41 trucks</span>
            </div>
            <div className="cb c g10">
              <div className="segbar" style={{ height: "10px", borderRadius: "5px" }}>
                {DT.cov.map((sg, i) => (
                  <span key={i} data-k={sg.k} style={{ width: sg.w }}></span>
                ))}
              </div>
              <div className="c g6">
                {DT.cov.map((sg, i) => (
                  <div key={i} className="r g8 fs12 t2">
                    <span className="qd" data-k={sg.k} style={{ width: "8px", height: "8px" }}></span>
                    <span className="f1"><span>{sg.l}</span></span>
                    <span className="mono w6 tx"><span>{sg.n}</span></span>
                  </div>
                ))}
              </div>
              <p className="fs12 mu">Trucks with no team are seen by dispatchers without a team, Operations Managers and the Main Admin.</p>
            </div>
          </section>
          <section className="card oh">
            <div className="ch"><h2 className="h2">Unassigned loads</h2></div>
            <div className="cb c g8">
              <label className="opt on">
                <input type="radio" className="cbx" name="dt-un" defaultChecked />
                <span className="c">
                  <span className="fs13 w5">Only loads tagged for the team</span>
                  <span className="fs12 mu">From the team’s customers, or created by its dispatchers</span>
                </span>
              </label>
              <label className="opt">
                <input type="radio" className="cbx" name="dt-un" />
                <span className="c">
                  <span className="fs13 w5">The shared queue</span>
                  <span className="fs12 mu">They see every unassigned load, but can assign it only to team trucks</span>
                </span>
              </label>
            </div>
          </section>
          <section className="card oh">
            <div className="ch"><h2 className="h2">New dispatchers</h2></div>
            <div className="cb c g8">
              <div className="seg" role="group" aria-label="New dispatchers start with" style={{ alignSelf: "flex-start" }}>
                <button className="on" aria-pressed="true">See all trucks</button>
                <button aria-pressed="false">See no trucks</button>
              </div>
              <p className="fs12 mu">See all trucks is the default: a dispatcher who isn’t on a team sees every load and every truck until you add them to one.</p>
            </div>
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Changes</h2>
              <button className="lnk" style={{ marginLeft: "auto" }} onClick={goAudit}>Audit log</button>
            </div>
            {DT.hist.map((hh, i) => (
              <div key={i} className="wl" style={{ alignItems: "flex-start" }}>
                <div className="f1 fs12 t2">
                  <b className="tx"><span>{hh.who}</span></b>
                  {" "}<span>{hh.what}</span>
                </div>
                <span className="fs11 mu num nw"><span>{hh.when}</span></span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
