"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { tx } from "@/features/console/dom";

/** Messages: conversations, thread and context. */
export function MessagesScreen() {
  const { isMessages, MS, M, goTracking } = useConsole();
  if (!isMessages) return null;
  return (
    <div className="msg3">
      <section className="mconv">
        <div className="r g8" style={{ padding: "16px 16px 10px" }}>
          <h1 className="h1" style={{ fontSize: "18px", lineHeight: "24px" }}>Messages</h1>
          <span className="sp"></span>
          <button className="btn sm icon" aria-label="New message"><Icon className="s14" d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></button>
        </div>
        <div style={{ padding: "0 16px 10px" }}>
          <label className="search" style={{ width: "100%" }}>
            <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
            <input placeholder="Search people and messages" aria-label="Search messages" />
          </label>
        </div>
        <div className="seg sm" style={{ margin: "0 16px 10px", alignSelf: "flex-start" }}>
          <button className="on">All</button>
          <button>Unread · 3</button>
          <button>Drivers</button>
          <button>Customers</button>
        </div>
        <div style={{ flex: "1", minHeight: "0", overflow: "auto", borderTop: "1px solid var(--bd2)" }}>
          {MS.convs.map((cv, i) => (
            <button key={i} className={clsx("cvi", cv.on)}>
              <span className="av md" data-k={cv.pk}>
                <span>{cv.ini}</span>
                <span className="pres"></span>
              </span>
              <span className="f1 c g2">
                <span className="r g6">
                  <span className="fs13 w5 tx ell"><span>{cv.n}</span></span>
                  <Icon className="s12 mu" d={cv.ch} />
                  <span className="sp"></span>
                  <span className="fs11 mu num"><span>{cv.t}</span></span>
                </span>
                <span className="r g6">
                  <span className={clsx("fs12 mu ell f1", cv.uw)}><span>{cv.last}</span></span>
                  {cv.unread ? (
                    <span className="ubadge"><span>{cv.unread}</span></span>
                  ) : null}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="mthread">
        <div className="r g10" style={{ padding: "12px 20px", borderBottom: "1px solid var(--bd)", background: "var(--sf)" }}>
          <span className="av md" data-k="late">
            JC
            <span className="pres"></span>
          </span>
          <div className="f1">
            <div className="r g8">
              <span className="fs14 w6">Jamal Carter</span>
              <span className="tag" data-k="info">
                <Icon className="s12" d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
                Telegram linked
              </span>
              <span className="tag" data-k="brand">
                <Icon className="s12" d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01" />
                App · online
              </span>
            </div>
            <div className="fs12 mu">
              <span className="mono">T-1121</span>
              {" · FF-24839 Lewisville → Austin · driver since 2019"}
            </div>
          </div>
          <button className="btn sm icon" aria-label="Call driver">
            <Icon className="s14" d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
          </button>
          <button className="btn sm" onClick={M.openLoad}>Open load</button>
        </div>
        <div className="mscroll">
          <div className="mday"><span>Today · Fri, Nov 13</span></div>
          {MS.msgs.map((mm, i) => (
            <Fragment key={i}>
              {mm.sys ? (
                <div className="msys" data-k={mm.k}>
                  <span className="eqic" style={{ width: "26px", height: "26px", background: "var(--b)", color: "var(--c)" }}><Icon className="s14" d={mm.ic} /></span>
                  <div className="f1">
                    <div className="fs13 w5 tx">{tx(mm.title)}</div>
                    <div className="fs12 t3"><span>{mm.body}</span></div>
                    <div className="fs11 mu" style={{ marginTop: "3px" }}><span>{mm.meta}</span></div>
                  </div>
                  <span className="fs11 mu num"><span>{mm.t}</span></span>
                </div>
              ) : null}
              {mm.rx ? (
                <div className="mrow2">
                  <span className="av sm">JC</span>
                  <div className="c g2" style={{ maxWidth: "62%" }}>
                    <div className="mb in">
                      <span>{mm.body}</span>
                      {mm.att ? (
                        <span className="matt">
                          <Icon className="s14" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" />
                          <span>{mm.att}</span>
                        </span>
                      ) : null}
                    </div>
                    <span className="fs11 mu"><span>{mm.meta}</span>{" · "}<span>{mm.t}</span></span>
                  </div>
                </div>
              ) : null}
              {mm.tx ? (
                <div className="mrow2 out">
                  <div className="c g2" style={{ maxWidth: "62%", alignItems: "flex-end" }}>
                    <div className="mb out2"><span>{mm.body}</span></div>
                    <span className="fs11 mu r g4">
                      <span>{mm.meta}</span>{" · "}<span>{mm.t}</span>
                      <Icon className="s12 b" d="M5 12l5 5 9-10" />
                    </span>
                  </div>
                </div>
              ) : null}
            </Fragment>
          ))}
          <div className="aidraft">
            <div className="r g8">
              <span className="tag" data-k="violet">
                <Icon className="s12" d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z" />
                AI draft
              </span>
              <span className="fs12 mu">Review before sending — nothing is sent automatically</span>
              <span className="sp"></span>
              <button className="btn ghost xs icon" aria-label="Dismiss draft"><Icon className="s12" d="M18 6L6 18M6 6l12 12" /></button>
            </div>
            <p className="fs13" style={{ marginTop: "6px" }}>
              Copy that, thanks Jamal. I’ve told Sysco Central Texas you’ll arrive around 16:05 instead of 15:30. Take the time you need through the work zone.
            </p>
            <div className="r g6" style={{ marginTop: "8px" }}>
              <button className="btn xs">Use draft</button>
              <button className="btn xs ghost">Shorter</button>
              <span className="fs11 mu">Sources: FF-24839 ETA, message at 11:19</span>
            </div>
          </div>
        </div>
        <div className="mcomp">
          <div className="r g6">
            {MS.quick.map((q, i) => (
              <button key={i} className="btn xs"><span>{q}</span></button>
            ))}
          </div>
          <textarea className="inp" rows={2} placeholder="Message Jamal…" aria-label="Message Jamal"></textarea>
          <div className="r g8">
            <button className="btn ghost sm icon" aria-label="Attach file">
              <Icon className="s14" d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
            </button>
            <button className="btn ghost sm">
              Send via: App + Telegram
              <Icon className="s12" d="M6 9l6 6 6-6" />
            </button>
            <span className="sp"></span>
            <span className="fs11 mu">Kept in FlyFleet · retained per org policy</span>
            <button className="btn pri sm">
              <Icon className="s14" d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
              Send
            </button>
          </div>
        </div>
      </section>
      <aside className="mctx">
        <section className="card oh">
          <div className="ch">
            <h2 className="h2">Load</h2>
            <span className="sp"></span>
            <button className="lnk" onClick={M.openLoad}>FF-24839</button>
          </div>
          <div className="cb c g8">
            <div className="r g6">
              <span className="badge" data-k="transit">
                <i></i>
                In transit
              </span>
              <span className="risk" data-k="late">
                <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2" />
                +35m
              </span>
            </div>
            <div className="fs13 w5">Lewisville, TX → Austin, TX</div>
            <dl className="kv" style={{ fontSize: "12px" }}>
              <dt>Customer</dt>
              <dd>Sysco North Texas</dd>
              <dt>Next stop</dt>
              <dd>Sysco Central Texas</dd>
              <dt>Appointment</dt>
              <dd className="num">15:30 CT</dd>
              <dt>ETA</dt>
              <dd className="num tc" data-k="late">16:05 CT</dd>
              <dt>Equipment</dt>
              <dd>53’ reefer · 34°F set</dd>
            </dl>
          </div>
        </section>
        <section className="card oh">
          <div className="ch">
            <h2 className="h2">Telegram link</h2>
            <span className="sp"></span>
            <span className="badge" data-k="ok">
              <i></i>
              Verified
            </span>
          </div>
          <div className="cb c g8 fs12">
            <dl className="kv" style={{ fontSize: "12px" }}>
              <dt>Linked</dt>
              <dd className="num">Nov 2 · one-time code</dd>
              <dt>Receives</dt>
              <dd>Alerts, load updates, messages</dd>
              <dt>Quiet hours</dt>
              <dd>None (on duty)</dd>
              <dt>Sensitive actions</dt>
              <dd>Open in the app</dd>
            </dl>
            <p className="note">
              <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
              Accepting loads or confirming delivery needs a signed-in FlyFleet session, never just a chat reply.
            </p>
          </div>
        </section>
        <section className="card oh">
          <div className="ch">
            <h2 className="h2">Speeding incident</h2>
            <span className="sp"></span>
            <span className="tag" data-k="ok">Acknowledged 11:19</span>
          </div>
          <div className="cb fs12 t3">
            {"SPD-0412 · 76 mph peak · driver replied in Telegram. "}
            <button className="lnk" onClick={goTracking}>View on map</button>
          </div>
        </section>
      </aside>
    </div>
  );
}
