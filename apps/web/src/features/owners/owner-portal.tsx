"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { DataCell } from "@/components/data-table/cells";
import { ChangeDetail } from "@/components/data-table/change-detail";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { useOwnerPortal } from "./portal-view";

/** What an equipment owner sees: only their own equipment, and only what their permissions allow. */
export function OwnerPortal() {
  const { I, me } = useConsole();
  const { view: OP, error, retry } = useOwnerPortal();
  const company = me.organization.name;
  const now = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: me.organization.timezone, timeZoneName: "short" });
  if (!OP) return <div className="portal oport"><div className="opbody">{error ? <ErrorState error={error} retry={retry} /> : <Skeleton rows={8} />}</div></div>;
  return (
    <div className="portal oport">
      <header className="ptop">
        <div className="r g10">
          <span className="omk" data-k={OP.k}><span>{OP.ini}</span></span>
          <div className="c">
            <span className="fs14 w6"><span>{OP.n}</span></span>
            <span className="fs11 mu">Owner portal · {company}</span>
          </div>
        </div>
        <nav className="r g4" style={{ marginLeft: "28px" }} aria-label="Owner portal">
          {OP.tabs.map((t, i) => (
            <button key={i} className={clsx("ptab", t.on)} onClick={t.go}><span>{t.l}</span></button>
          ))}
        </nav>
        <span className="sp"></span>
        <span className="opscope">
          <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
          <span>{OP.scope}</span>
        </span>
        <span className="av md" title={OP.uname}><span>{OP.uini}</span></span>
      </header>
      <div className="opbody">
        {OP.preview ? (
          <div className="banner" data-k="info">
            <Icon d={I.eye} />
            <div className="f1">
              <div className="bt">{"Previewing "}<span>{OP.uname}</span>’s portal</div>
              <div>This is exactly what they see with today’s permissions. Change them on the owner’s Access tab.</div>
            </div>
            <button className="btn sm" onClick={OP.exit}>Back to access settings</button>
          </div>
        ) : null}
        {OP.t.ov ? (
          <>
            <div className="r g16 ast">
              <div className="f1">
                <h1 className="h1"><span>{OP.hello}</span></h1>
                <p className="sub"><span>{OP.sub}</span></p>
              </div>
              {OP.showNext ? (
                <div className="opnext">
                  <span className="fs12 mu"><span>{OP.next.t}</span></span>
                  <span className="mono" style={{ fontSize: "20px", lineHeight: "26px", fontWeight: "600" }}><span>{OP.next.v}</span></span>
                  <span className="fs12 t3"><span>{OP.next.d}</span></span>
                </div>
              ) : null}
            </div>
            <div className="kpis" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
              {OP.kpis.map((k, i) => (
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
            <div className="r g8" style={{ marginTop: "4px" }}>
              <h2 className="h2">Your equipment</h2>
              <span className="sp"></span>
              <span className="fs12 mu">From {company} · updated {now}</span>
            </div>
            <div className={clsx("opunits", OP.ucls)}>
              {OP.units.map((u, i) => (
                <div key={i} className="opu">
                  <div className="r g8">
                    <span className="mono fs13 w6"><span>{u.u}</span></span>
                    <span className="tag" data-k="mu"><span>{u.kind}</span></span>
                    <span className="sp"></span>
                    <span className="badge" data-k={u.sk}>
                      <i></i>
                      <span>{u.s}</span>
                    </span>
                  </div>
                  <div className="fs12 mu ell"><span>{u.ymm}</span></div>
                  <div className="opnow">
                    <div className="fs13 w5 ell"><span>{u.now}</span></div>
                    <div className="fs12 t3 ell"><span>{u.det}</span></div>
                  </div>
                  <div className="fs12 t2 ell"><span>{u.drv}</span></div>
                  <div className="r g8 fs11 mu">
                    <span className="ell"><span>{u.wk}</span></span>
                    <span className="sp"></span>
                    <span className="ell"><span>{u.svc}</span></span>
                  </div>
                </div>
              ))}
            </div>
            {OP.showMap ? (
              <div className="opmap5">
                <section className="card oh">
                  <div className="ch">
                    <h2 className="h2">Where your trucks are</h2>
                    <span className="badge" data-k="ok">
                      <i></i>
                      Live · {now}
                    </span>
                    <span className="sp"></span>
                    <span className="fs12 mu">Last reported place of each truck</span>
                  </div>
                  <div className="omapw" style={{ height: "380px" }}>
                    {!OP.map?.trucks?.length ? (
                      <EmptyState icon={I.pin} title="No positions on the map yet" text={`Your trucks show here once they report a position to ${company}. The list beside it shows each truck’s last reported place.`} />
                    ) : null}
                    <div className="omapin" style={{ left: `calc(50% - ${OP.map?.cx ?? ""}px)`, top: `calc(50% - ${OP.map?.cy ?? ""}px)` }}>
                      <svg className="msvg" viewBox="0 0 1208 788" preserveAspectRatio="none" aria-hidden="true">
                        <path className="mwater" d={OP.map?.water} />
                        <path className="mstate" d={OP.map?.states} />
                        <path className="mminor" d={OP.map?.minor} />
                        <path className="mcase" d={OP.map?.major} />
                        <path className="mmajor" d={OP.map?.major} />
                      </svg>
                      {OP.map?.cities?.map((cty, i) => (
                        <span key={i} className={clsx("city", cty.cls)} style={{ left: `${cty.x}px`, top: `${cty.y}px` }}><span>{cty.n}</span></span>
                      ))}
                      {OP.map?.shields?.map((sh, i) => (
                        <span key={i} className="shield" style={{ left: `${sh.x}px`, top: `${sh.y}px` }}><span>{sh.n}</span></span>
                      ))}
                      {OP.map?.trucks?.map((v, i) => (
                        <span key={i} className={clsx("vm", v.cls)} data-k={v.k} style={{ left: `${v.x}px`, top: `${v.y}px` }} title={v.aria}>
                          <span className="vmh"><span className="r" style={{ transform: `rotate(${v.h}deg)` }}><Icon className="s12 fill" d="M12 2l7 19-7-4-7 4z" /></span></span>
                          <span className="vml"><span>{v.unit}</span></span>
                        </span>
                      ))}
                    </div>
                  </div>
                </section>
                <section className="card oh">
                  <div className="ch"><h2 className="h2">Right now</h2></div>
                  {OP.now.map((nw, i) => (
                    <div key={i} className="lvi5" style={{ cursor: "default" }}>
                      <div className="r g8">
                        <span className="mono fs13 w6"><span>{nw.u}</span></span>
                        <span className="badge" data-k={nw.sk}>
                          <i></i>
                          <span>{nw.s}</span>
                        </span>
                      </div>
                      {nw.d ? (
                        <div className="fs12 t2 ell"><span>{nw.d}</span></div>
                      ) : null}
                      <div className="fs13 w5 ell"><span>{nw.loc}</span></div>
                      <div className={clsx("fs12 ell", nw.fk)}><span>{nw.fresh}</span></div>
                      <div className="fs12 mu ell"><span>{nw.lane}</span></div>
                    </div>
                  ))}
                </section>
              </div>
            ) : null}
            {OP.hiddenN ? (
              <p className="note">
                <Icon className="s14" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
                <span><span>{OP.hiddenN}</span></span>
              </p>
            ) : null}
          </>
        ) : null}
        {OP.t.eq ? (
          <section className="card oh c">
            <div className="ch"><h2 className="h2">Your equipment</h2></div>
            <div className={clsx("tscroll on", OP.eq.fz)}>
              <div className="tinner">
                <div className="thead" style={{ gridTemplateColumns: OP.eq.cols }}>
                  {OP.eq.head.map((h, i) => (
                    <div key={i} className={clsx("th", h.al)}><span>{h.l}</span></div>
                  ))}
                </div>
                <div className="tb2">
                  {OP.eq.rows.map((r, i) => (
                    <Fragment key={i}>
                      <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: OP.eq.cols }} onClick={r.open}>
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
        {OP.t.loads ? (
          <section className="card oh c">
            <div className="ch"><h2 className="h2">Loads on your equipment</h2></div>
            <div className={clsx("tscroll on", OP.lt.fz)}>
              <div className="tinner">
                <div className="thead" style={{ gridTemplateColumns: OP.lt.cols }}>
                  {OP.lt.head.map((h, i) => (
                    <div key={i} className={clsx("th", h.al)}><span>{h.l}</span></div>
                  ))}
                </div>
                <div className="tb2">
                  {OP.lt.rows.map((r, i) => (
                    <Fragment key={i}>
                      <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: OP.lt.cols }} onClick={r.open}>
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
            <div className="rtnote">
              <Icon className="s14" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" style={{ marginTop: "1px" }} />
              <span><span>{OP.ltNote}</span></span>
            </div>
          </section>
        ) : null}
        {OP.t.stmt ? (
          <>
            <div className="mm5 vz big">
              {OP.sum.map((s, i) => (
                <div key={i} className="mm5s">
                  <span className="fs12 t3"><span>{s.l}</span></span>
                  <span className="mm5v"><span>{s.v}</span></span>
                  <span className="fs11 mu ell"><span>{s.s}</span></span>
                </div>
              ))}
            </div>
            <div className="opgrid">
              <section className="card oh">
                <div className="ch">
                  <h2 className="h2"><span>{OP.next.t}</span>, by unit</h2>
                  <span className="sp"></span>
                  {OP.canDl ? (
                    <button className="btn sm">
                      <Icon className="s14" d={I.download} />
                      PDF
                    </button>
                  ) : null}
                </div>
                <div className="ps5 ps5h">
                  <span>Unit</span>
                  <span>How it earned</span>
                  <span className="rt">Earned</span>
                  <span className="rt">Costs</span>
                  <span className="rt">Net</span>
                </div>
                {OP.sl.map((x, i) => (
                  <div key={i} className="ps5">
                    <span className="mono fs13 w6"><span>{x.u}</span></span>
                    <span className="fs12 t3 ell"><span>{x.d}</span></span>
                    <span className="mono fs13 rt"><span>{x.g}</span></span>
                    <span className="mono fs13 t3 rt"><span>{x.c}</span></span>
                    <span className="mono fs13 w6 rt"><span>{x.n}</span></span>
                  </div>
                ))}
              </section>
              <section className="card oh">
                <div className="ch"><h2 className="h2">Past statements</h2></div>
                {OP.past.map((x, i) => (
                  <div key={i} className="wl">
                    <div className="f1">
                      <div className="fs13 w5"><span>{x.p}</span></div>
                      <div className="fs12 mu"><span>{x.d}</span></div>
                    </div>
                    <span className="mono fs13 w6"><span>{x.v}</span></span>
                    {OP.canDl ? (
                      <button className="btn xs ghost">PDF</button>
                    ) : null}
                  </div>
                ))}
              </section>
            </div>
          </>
        ) : null}
        {OP.t.exp ? (
          <>
            <section className="card oh c">
              <div className="ch"><h2 className="h2">Fuel charged to you · <span>{OP.next.t.replace("Statement · ", "")}</span></h2></div>
              {OP.hasFuel ? (
                <div className={clsx("tscroll on", OP.ft.fz)}>
                  <div className="tinner">
                    <div className="thead" style={{ gridTemplateColumns: OP.ft.cols }}>
                      {OP.ft.head.map((h, i) => (
                        <div key={i} className={clsx("th", h.al)}><span>{h.l}</span></div>
                      ))}
                    </div>
                    <div className="tb2">
                      {OP.ft.rows.map((r, i) => (
                        <Fragment key={i}>
                          <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: OP.ft.cols }} onClick={r.open}>
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
              ) : null}
              {OP.noFuel ? (
                <div className="cb fs13 t3"><span>{OP.noFuel}</span></div>
              ) : null}
            </section>
            {OP.hasExp ? (
              <section className="card oh">
                <div className="ch"><h2 className="h2">Other costs on your statement</h2></div>
                {OP.exp.map((x, i) => (
                  <div key={i} className="wl">
                    <div className="f1 mw0">
                      <div className="fs13 w5"><span>{x.t}</span></div>
                      <div className="fs12 mu ell"><span>{x.d}</span></div>
                    </div>
                    <span className="mono fs13"><span>{x.v}</span></span>
                  </div>
                ))}
              </section>
            ) : null}
          </>
        ) : null}
        {OP.t.mt ? (
          <section className="card oh c">
            <div className="ch"><h2 className="h2">Maintenance on your equipment</h2></div>
            <div className={clsx("tscroll on", OP.mt.fz)}>
              <div className="tinner">
                <div className="thead" style={{ gridTemplateColumns: OP.mt.cols }}>
                  {OP.mt.head.map((h, i) => (
                    <div key={i} className={clsx("th", h.al)}><span>{h.l}</span></div>
                  ))}
                </div>
                <div className="tb2">
                  {OP.mt.rows.map((r, i) => (
                    <Fragment key={i}>
                      <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: OP.mt.cols }} onClick={r.open}>
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
        {OP.t.docs ? (
          <section className="card oh c">
            <div className="ch"><h2 className="h2">Documents</h2></div>
            <div className={clsx("tscroll on", OP.dt.fz)}>
              <div className="tinner">
                <div className="thead" style={{ gridTemplateColumns: OP.dt.cols }}>
                  {OP.dt.head.map((h, i) => (
                    <div key={i} className={clsx("th", h.al)}><span>{h.l}</span></div>
                  ))}
                </div>
                <div className="tb2">
                  {OP.dt.rows.map((r, i) => (
                    <Fragment key={i}>
                      <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: OP.dt.cols }} onClick={r.open}>
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
        <div className="opfoot">
          <Icon className="s14" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
          <span><span>{OP.foot}</span></span>
        </div>
      </div>
    </div>
  );
}
