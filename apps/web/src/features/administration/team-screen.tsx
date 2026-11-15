"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Team & access: roles and the permission matrix. */
export function TeamScreen() {
  const { isTeam, TT, TM, goAudit } = useConsole();
  if (!isTeam) return null;
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
          <p className="sub">Lone Star Freight · 17 members · 8 roles · the same permissions guard pages, API, search, exports and live feeds</p>
        </div>
        <div className="r g8">
          <button className="btn">
            <Icon className="s14" d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
            Access review
          </button>
          <button className="btn pri">
            <Icon className="s14" d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6" />
            Invite member
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
      <div className="tmg">
        <nav className="rolelist" aria-label="Roles">
          {TM.roles.map((ro, i) => (
            <button key={i} className={clsx("rolei", ro.on)}>
              <span className="f1 c">
                <span className="r g6">
                  <span className="fs13 w5 tx ell"><span>{ro.n}</span></span>
                  {ro.sys ? (
                    <span className="tag" data-k="mu">System</span>
                  ) : null}
                </span>
                <span className="fs12 mu ell"><span>{ro.d}</span></span>
              </span>
              <span className="mono fs12 mu"><span>{ro.cnt}</span></span>
            </button>
          ))}
          <button className="addstop" style={{ height: "38px", marginTop: "6px" }}>
            <Icon className="s14 b" d="M12 5v14M5 12h14" />
            Create custom role
          </button>
        </nav>
        <section className="c" style={{ minHeight: "0", minWidth: "0" }}>
          <div className="r g12" style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--bd2)" }}>
            <div className="f1">
              <div className="r g8">
                <span className="fs16 w6">Dispatcher</span>
                <span className="tag" data-k="brand">From template</span>
                <span className="tag" data-k="warn">2 unsaved changes</span>
              </div>
              <div className="fs12 mu" style={{ marginTop: "2px" }}>Plans and assigns loads. No finance or safety records unless granted. Edited Nov 10 by Dana Kim.</div>
            </div>
            <div className="r" style={{ marginRight: "4px" }}>
              {TM.mem.map((m, i) => (
                <span key={i} className="av sm stack"><span>{m}</span></span>
              ))}
            </div>
            <button className="btn sm">Duplicate</button>
          </div>
          <div className="pmh" style={{ gridTemplateColumns: TM.cols }}>
            <span>Module</span>
            {TM.acts.map((a, i) => (
              <span key={i} className="rt" style={{ justifySelf: "center" }}><span>{a}</span></span>
            ))}
          </div>
          <div style={{ flex: "1", minHeight: "0", overflow: "auto" }}>
            {TM.groups.map((g, i) => (
              <Fragment key={i}>
                <div className="pmg"><span>{g.g}</span></div>
                {g.rows.map((row, i2) => (
                  <div key={i2} className={clsx("pmr", row.cls)} style={{ gridTemplateColumns: TM.cols }}>
                    <div className="r g8 mw0">
                      <span className="fs13 ell"><span>{row.m}</span></span>
                      {row.sens ? (
                        <span className="tag" data-k="warn">
                          <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
                          Sensitive
                        </span>
                      ) : null}
                      {row.note ? (
                        <span className="fs11 mu ell"><span>{row.note}</span></span>
                      ) : null}
                    </div>
                    {row.cells.map((x, i3) => (
                      <span key={i3} className="pm">
                        {x.na ? (
                          <span className="fa">—</span>
                        ) : null}
                        {x.box ? (
                          <button className={clsx("pmb", x.cls)} aria-label={x.aria} aria-pressed={x.pressed}>
                            {x.on ? (
                              <Icon className="s12 b" d="M5 12l5 5 9-10" />
                            ) : null}
                          </button>
                        ) : null}
                      </span>
                    ))}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
          <div className="savebar">
            <span className="dot" data-k="warn"></span>
            <span className="fs13">
              <b>2 unsaved changes</b>
              {" "}
              to Dispatcher · affects 9 members
            </span>
            <span className="sp"></span>
            <span className="fs12 mu">Saving re-checks open sessions and live subscriptions</span>
            <button className="btn">Discard</button>
            <button className="btn pri">
              <Icon className="s14" d="M15 7a2 2 0 0 1 2 2M21 9a6 6 0 0 1-7.7 5.8L11 17H9v2H7v2H3v-3.6l6.2-6.2A6 6 0 1 1 21 9z" />
              {"Review & save"}
            </button>
          </div>
        </section>
        <aside className="tmside">
          <section className="card oh">
            <div className="ch"><h2 className="h2">Pending changes</h2></div>
            <div className="cb c g8 fs12">
              <div className="r g8 ast">
                <span className="tag" data-k="ok">+ grant</span>
                <span className="t2">
                  Fleet alerts ›
                  {" "}
                  <b>Assign/manage</b>
                  {" "}
                  — acknowledge speeding alerts on night shift
                </span>
              </div>
              <div className="r g8 ast">
                <span className="tag" data-k="bad">− revoke</span>
                <span className="t2">
                  Loads ›
                  {" "}
                  <b>Export</b>
                  {" "}
                  — exports include customer rates history
                </span>
              </div>
            </div>
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Member overrides</h2>
              <span className="fs12 mu">Deny wins</span>
            </div>
            {TM.ovr.map((o, i) => (
              <div key={i} className="wl">
                <span className="av sm"><span>{o.ini}</span></span>
                <div className="f1">
                  <div className="fs13 w5"><span>{o.who}</span></div>
                  <div className="fs12 mu"><span>{o.txt}</span></div>
                </div>
                <span className="tag" data-k={o.k}><span>{o.t}</span></span>
              </div>
            ))}
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Change history</h2>
              <button className="lnk" style={{ marginLeft: "auto" }} onClick={goAudit}>Audit log</button>
            </div>
            {TM.hist.map((hh, i) => (
              <div key={i} className="wl" style={{ alignItems: "flex-start" }}>
                <div className="f1 fs12 t2">
                  <b className="tx"><span>{hh.who}</span></b>
                  {" "}<span>{hh.what}</span>
                </div>
                <span className="fs11 mu num nw"><span>{hh.when}</span></span>
              </div>
            ))}
          </section>
          <p className="note">
            <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
            At least one active Main Admin is always kept. Permission changes need a fresh sign-in.
          </p>
        </aside>
      </div>
    </div>
  );
}
