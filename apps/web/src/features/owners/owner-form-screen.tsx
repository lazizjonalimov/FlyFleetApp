"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { tx } from "@/features/console/dom";
import { OwnerFormField } from "@/features/owners/owner-form-field";

/** Add or edit an equipment owner. */
export function OwnerFormScreen() {
  const { isOForm, goOwners, OF, I } = useConsole();
  if (!isOForm) return null;
  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "14px" }}>
        <div className="f1 mw0">
          <div className="crumb">
            <span>Directory</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <button onClick={goOwners}>Owners</button>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b><span>{OF.crumb}</span></b>
          </div>
          <h1 className="h1"><span>{OF.title}</span></h1>
          <p className="sub"><span>{OF.sub}</span></p>
        </div>
        <div className="r g8">
          <button className="btn" onClick={OF.cancel}>Cancel</button>
          <button className="btn pri" onClick={OF.save}><span>{OF.saveL}</span></button>
        </div>
      </div>
      <div className="scr5">
        <div className="of5">
          <div className="c g16">
            <section className="card">
              <div className="ch">
                <h2 className="h2">Owner type</h2>
                <span className="fs12 mu">Owners can be people or businesses</span>
              </div>
              <div className="cb">
                <div className="ent5">
                  {OF.ent.map((e, i) => (
                    <button key={i} className={e.on} aria-pressed={e.p} onClick={e.go}>
                      <span className="fs13 w6"><span>{e.l}</span></span>
                      <span className="fs12 mu"><span>{e.d}</span></span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
            {OF.showMatch ? (
              <section className="card oh">
                <div className="ch">
                  <div className="f1 c">
                    <h2 className="h2">Already in FlyFleet?</h2>
                    <span className="fs12 mu">Link a driver or employee instead of typing them in again · one person, more roles</span>
                  </div>
                </div>
                {OF.linked ? (
                  <div className="lk5">
                    <span className="av md"><span>{OF.linked.ini}</span></span>
                    <div className="f1 mw0">
                      <div className="r g6">
                        <span className="fs13 w6"><span>{OF.linked.n}</span></span>
                        <span className="tag" data-k="brand"><span>{OF.linked.role}</span></span>
                        <span className="tag" data-k="ok">Linked</span>
                      </div>
                      <div className="fs12 t3"><span>{OF.linked.d}</span></div>
                    </div>
                    <button className="btn sm" onClick={OF.linked.unlink}>Unlink</button>
                  </div>
                ) : null}
                {OF.hasMatches ? (
                  <>
                    <div className="cb" style={{ paddingBottom: "4px" }}>
                      <label className="search" style={{ width: "100%" }}>
                        <Icon className="s14" d={I.search} />
                        <input placeholder="Search drivers and staff by name, phone or CDL number" aria-label="Search people already in FlyFleet" />
                      </label>
                    </div>
                    {OF.matches.map((m, i) => (
                      <div key={i} className="wl">
                        <span className="av md"><span>{m.ini}</span></span>
                        <div className="f1 mw0">
                          <div className="r g6">
                            <span className="fs13 w5"><span>{m.n}</span></span>
                            <span className="tag" data-k={m.k}><span>{m.role}</span></span>
                          </div>
                          <div className="fs12 mu"><span>{m.d}</span></div>
                        </div>
                        <button className="btn sm" onClick={m.go}><span>{m.b}</span></button>
                      </div>
                    ))}
                  </>
                ) : null}
              </section>
            ) : null}
            <section className="card">
              <div className="ch">
                <h2 className="h2"><span>{OF.identT}</span></h2>
                <span className="fs12 mu"><span>{OF.identS}</span></span>
              </div>
              <div className="cb">
                <div className="mgrid" style={{ marginBottom: "0" }}>
                  {OF.ident.map((f, i) => (
                    <OwnerFormField key={i} f={f} />
                  ))}
                </div>
              </div>
            </section>
            <section className="card">
              <div className="ch"><h2 className="h2">Contact and address</h2></div>
              <div className="cb">
                <div className="mgrid" style={{ marginBottom: "0" }}>
                  {OF.contact.map((f, i) => (
                    <OwnerFormField key={i} f={f} />
                  ))}
                </div>
              </div>
            </section>
            <section className="card">
              <div className="ch">
                <div className="f1 c">
                  <h2 className="h2">Equipment and ownership</h2>
                  <span className="fs12 mu">One row per unit: how much they own, since when, under which agreement, and who drives it</span>
                </div>
                <button className="btn sm" onClick={OF.addUnit}>
                  <Icon className="s14 b" d="M12 5v14M5 12h14" />
                  Add a unit
                </button>
              </div>
              <div className="ur5 urh">
                <span>Unit</span>
                <span>Ownership</span>
                <span>Start date</span>
                <span>Agreement</span>
                <span>Who drives</span>
              </div>
              {OF.rows.map((r, i) => (
                <div key={i} className="ur5">
                  <div className="mw0">
                    {r.ufld.isDd ? (
                      <>
                        <div className="dd">
                          <button className={clsx("inp ddb", r.ufld.ddsz)} onClick={r.ufld.toggle} aria-haspopup="listbox" aria-expanded={r.ufld.exp} aria-label={r.ufld.aria}>
                            <span className={clsx("f1 ell", r.ufld.vcls)}><span>{r.ufld.shown}</span></span>
                            {r.ufld.ab ? (
                              <span className="ddab"><span>{r.ufld.ab}</span></span>
                            ) : null}
                            <Icon className="s14 ddc" d="M6 9l6 6 6-6" />
                          </button>
                          {r.ufld.open ? (
                            <>
                              <div className="ddcatch" onClick={r.ufld.close}></div>
                              <div className="ddl">
                                {r.ufld.search ? (
                                  <label className="dds">
                                    <Icon className="s14" d={I.search} />
                                    <input defaultValue={r.ufld.q} placeholder={r.ufld.qph} aria-label={r.ufld.qph} onInput={r.ufld.setQ} />
                                  </label>
                                ) : null}
                                <div className="ddh"><span>{r.ufld.head}</span></div>
                                <div className="ddo" role="listbox" aria-label={r.ufld.l}>
                                  {r.ufld.dopts.map((o, i2) => (
                                    <button key={i2} className={clsx("ddi", o.on)} role="option" aria-selected={o.sel} onClick={o.go}>
                                      <span className="f1 ell"><span>{o.l}</span></span>
                                      {o.ab ? (
                                        <span className="ddab"><span>{o.ab}</span></span>
                                      ) : null}
                                      <Icon className="ddk" d="M5 12l5 5 9-10" />
                                    </button>
                                  ))}
                                  {r.ufld.none ? (
                                    <div className="ddn">Nothing matches that</div>
                                  ) : null}
                                </div>
                                {r.ufld.hasOther ? (
                                  <div className="ddf">
                                    <button className={clsx("ddi", r.ufld.otherOn)} role="option" aria-selected={r.ufld.otherSel} onClick={r.ufld.pickOther}>
                                      <Icon className="ddp" d={I.pencil} />
                                      <span className="f1">
                                        <span className="ddt">{tx(r.ufld.otherT)}</span>
                                        <span className="ddd">{tx(r.ufld.otherD)}</span>
                                      </span>
                                      <Icon className="ddk" d="M5 12l5 5 9-10" />
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </>
                          ) : null}
                        </div>
                        {r.ufld.showOther ? (
                          <>
                            <label className="othl" htmlFor={r.ufld.oid}>{tx(r.ufld.otherL)}</label>
                            <input id={r.ufld.oid} className="inp othr" defaultValue={r.ufld.ov} placeholder={r.ufld.otherPh} onInput={r.ufld.setOther} />
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  <label className="ufield ufld5">
                    <input className="inp mono" defaultValue={r.pct} aria-label="Ownership percentage" />
                    <span>%</span>
                  </label>
                  <input className="inp mono" defaultValue={r.since} placeholder="MM/DD/YYYY" aria-label="Ownership start date" />
                  <div className="mw0">
                    {r.terms.isDd ? (
                      <>
                        <div className="dd">
                          <button className={clsx("inp ddb", r.terms.ddsz)} onClick={r.terms.toggle} aria-haspopup="listbox" aria-expanded={r.terms.exp} aria-label={r.terms.aria}>
                            <span className={clsx("f1 ell", r.terms.vcls)}><span>{r.terms.shown}</span></span>
                            {r.terms.ab ? (
                              <span className="ddab">{tx(r.terms.ab)}</span>
                            ) : null}
                            <Icon className="s14 ddc" d="M6 9l6 6 6-6" />
                          </button>
                          {r.terms.open ? (
                            <>
                              <div className="ddcatch" onClick={r.terms.close}></div>
                              <div className="ddl">
                                {r.terms.search ? (
                                  <label className="dds">
                                    <Icon className="s14" d={I.search} />
                                    <input defaultValue={r.terms.q} placeholder={r.terms.qph} aria-label={r.terms.qph} onInput={r.terms.setQ} />
                                  </label>
                                ) : null}
                                <div className="ddh"><span>{r.terms.head}</span></div>
                                <div className="ddo" role="listbox" aria-label={r.terms.l}>
                                  {r.terms.dopts.map((o, i2) => (
                                    <button key={i2} className={clsx("ddi", o.on)} role="option" aria-selected={o.sel} onClick={o.go}>
                                      <span className="f1 ell"><span>{o.l}</span></span>
                                      {o.ab ? (
                                        <span className="ddab">{tx(o.ab)}</span>
                                      ) : null}
                                      <Icon className="ddk" d="M5 12l5 5 9-10" />
                                    </button>
                                  ))}
                                  {r.terms.none ? (
                                    <div className="ddn">Nothing matches that</div>
                                  ) : null}
                                </div>
                                {r.terms.hasOther ? (
                                  <div className="ddf">
                                    <button className={clsx("ddi", r.terms.otherOn)} role="option" aria-selected={r.terms.otherSel} onClick={r.terms.pickOther}>
                                      <Icon className="ddp" d={I.pencil} />
                                      <span className="f1">
                                        <span className="ddt">{tx(r.terms.otherT)}</span>
                                        <span className="ddd">{tx(r.terms.otherD)}</span>
                                      </span>
                                      <Icon className="ddk" d="M5 12l5 5 9-10" />
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </>
                          ) : null}
                        </div>
                        {r.terms.showOther ? (
                          <>
                            <label className="othl" htmlFor={r.terms.oid}>{tx(r.terms.otherL)}</label>
                            <input id={r.terms.oid} className="inp othr" defaultValue={r.terms.ov} placeholder={r.terms.otherPh} onInput={r.terms.setOther} />
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  <div className="mw0">
                    {r.drives.isDd ? (
                      <>
                        <div className="dd">
                          <button className={clsx("inp ddb", r.drives.ddsz)} onClick={r.drives.toggle} aria-haspopup="listbox" aria-expanded={r.drives.exp} aria-label={r.drives.aria}>
                            <span className={clsx("f1 ell", r.drives.vcls)}><span>{r.drives.shown}</span></span>
                            {r.drives.ab ? (
                              <span className="ddab">{tx(r.drives.ab)}</span>
                            ) : null}
                            <Icon className="s14 ddc" d="M6 9l6 6 6-6" />
                          </button>
                          {r.drives.open ? (
                            <>
                              <div className="ddcatch" onClick={r.drives.close}></div>
                              <div className="ddl">
                                {r.drives.search ? (
                                  <label className="dds">
                                    <Icon className="s14" d={I.search} />
                                    <input defaultValue={r.drives.q} placeholder={r.drives.qph} aria-label={r.drives.qph} onInput={r.drives.setQ} />
                                  </label>
                                ) : null}
                                <div className="ddh"><span>{r.drives.head}</span></div>
                                <div className="ddo" role="listbox" aria-label={r.drives.l}>
                                  {r.drives.dopts.map((o, i2) => (
                                    <button key={i2} className={clsx("ddi", o.on)} role="option" aria-selected={o.sel} onClick={o.go}>
                                      <span className="f1 ell"><span>{o.l}</span></span>
                                      {o.ab ? (
                                        <span className="ddab">{tx(o.ab)}</span>
                                      ) : null}
                                      <Icon className="ddk" d="M5 12l5 5 9-10" />
                                    </button>
                                  ))}
                                  {r.drives.none ? (
                                    <div className="ddn">Nothing matches that</div>
                                  ) : null}
                                </div>
                                {r.drives.hasOther ? (
                                  <div className="ddf">
                                    <button className={clsx("ddi", r.drives.otherOn)} role="option" aria-selected={r.drives.otherSel} onClick={r.drives.pickOther}>
                                      <Icon className="ddp" d={I.pencil} />
                                      <span className="f1">
                                        <span className="ddt">{tx(r.drives.otherT)}</span>
                                        <span className="ddd">{tx(r.drives.otherD)}</span>
                                      </span>
                                      <Icon className="ddk" d="M5 12l5 5 9-10" />
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </>
                          ) : null}
                        </div>
                        {r.drives.showOther ? (
                          <>
                            <label className="othl" htmlFor={r.drives.oid}>{tx(r.drives.otherL)}</label>
                            <input id={r.drives.oid} className="inp othr" defaultValue={r.drives.ov} placeholder={r.drives.otherPh} onInput={r.drives.setOther} />
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  <div className="urn">
                    <span className="badge" data-k={r.sk}>
                      <i></i>
                      <span>{r.st}</span>
                    </span>
                    <span><span>{r.note}</span></span>
                  </div>
                </div>
              ))}
              <div className="cat5">
                <span className="fs12 t3">Category</span>
                <span className="tag" data-k={OF.cat.k}><span>{OF.cat.l}</span></span>
                <span className="fs12 mu"><span>{OF.cat.d}</span></span>
              </div>
            </section>
            <section className="card">
              <div className="ch"><h2 className="h2">Ownership status</h2></div>
              <div className="cb c g8">
                <div className="seg" role="group" aria-label="Ownership status" style={{ alignSelf: "flex-start" }}>
                  {OF.status.map((s, i) => (
                    <button key={i} className={s.on} aria-pressed={s.p} onClick={s.go}><span>{s.l}</span></button>
                  ))}
                </div>
                <span className="fs12 mu"><span>{OF.statusD}</span></span>
              </div>
            </section>
            {OF.fin ? (
              <section className="card">
                <div className="ch">
                  <h2 className="h2">Settlement and payment</h2>
                  <span className="fs12 mu">Finance roles only · tax ID and bank are encrypted</span>
                </div>
                <div className="cb">
                  <div className="mgrid" style={{ marginBottom: "0" }}>
                    {OF.pay.map((f, i) => (
                      <OwnerFormField key={i} f={f} />
                    ))}
                  </div>
                </div>
              </section>
            ) : null}
            <section className="card oh">
              <div className="ch">
                <div className="f1 c">
                  <h2 className="h2">Owner portal and permissions</h2>
                  <span className="fs12 mu">What this owner can see when they sign in · enforced by the API, not just the screen</span>
                </div>
                <button className={clsx("sw5", OF.portalOn)} role="switch" aria-checked={OF.portalChk} aria-label="Give portal access" onClick={OF.portalTog}><i></i></button>
              </div>
              {OF.portal ? (
                <>
                  <div className="cb r g16 wrap" style={{ alignItems: "flex-end" }}>
                    <div className="fld" style={{ width: "300px" }}>
                      <label htmlFor="of-login">Login email</label>
                      <input id="of-login" className="inp" defaultValue={OF.loginEmail} placeholder="name@example.com" />
                    </div>
                    <div className="fld">
                      <span className="lbl">{"Preset · "}<span>{OF.permN}</span></span>
                      <div className="seg" role="group" aria-label="Permission presets">
                        {OF.presets.map((pr, i) => (
                          <button key={i} className={pr.on} onClick={pr.go}><span>{pr.l}</span></button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="pm5g sm">
                    {OF.perms.map((pm, i) => (
                      <div key={i} className="pm5">
                        <span className="f1 fs13"><span>{pm.l}</span></span>
                        <button className={clsx("sw5", pm.on)} role="switch" aria-checked={pm.chk} aria-label={pm.l} onClick={pm.go}><i></i></button>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </section>
          </div>
          <aside className="c g16 stk5">
            <section className="card oh">
              <div className="ch"><h2 className="h2">What gets saved</h2></div>
              <div className="cb">
                <dl className="kv kvw5">
                  {OF.summary.map((x, i) => (
                    <Fragment key={i}>
                      <dt><span>{x.l}</span></dt>
                      <dd>
                        <div><span>{x.v}</span></div>
                        {x.s ? (
                          <div className="fs12 mu"><span>{x.s}</span></div>
                        ) : null}
                      </dd>
                    </Fragment>
                  ))}
                </dl>
              </div>
            </section>
            {OF.change ? (
              <section className="card oh">
                <div className="ch"><h2 className="h2"><span>{OF.change.t}</span></h2></div>
                <div className="cb c g4">
                  <div className="seenh">Stays the same</div>
                  {OF.change.keep.map((x, i) => (
                    <div key={i} className="seenl ok"><span>{x}</span></div>
                  ))}
                  <div className="seenh" style={{ marginTop: "8px" }}><span>{OF.change.moveT}</span></div>
                  {OF.change.move.map((x, i) => (
                    <div key={i} className="seenl mv"><span>{x}</span></div>
                  ))}
                </div>
              </section>
            ) : null}
            {OF.dupWarn ? (
              <p className="note">
                <Icon className="s14" d={I.info} />
                <span>Before you save, FlyFleet checks the name, phone, email and tax ID against every driver and employee, so the same person is never created twice.</span>
              </p>
            ) : null}
            <section className="card oh">
              <div className="ch"><h2 className="h2"><span>{OF.checksT}</span></h2></div>
              {OF.checks.map((ck, i) => (
                <div key={i} className="wl">
                  <span className="dot" data-k={ck.k}></span>
                  <div className="f1 mw0">
                    <div className="fs13"><span>{ck.t}</span></div>
                    <div className="fs12 mu"><span>{ck.d}</span></div>
                  </div>
                </div>
              ))}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
