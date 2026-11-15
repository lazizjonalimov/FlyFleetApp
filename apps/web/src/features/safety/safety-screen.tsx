"use client";

import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Compliance: qualification matrix and review queue. */
export function SafetyScreen() {
  const { isSafety, SF, goDocs, goReview } = useConsole();
  if (!isSafety) return null;
  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px" }}>
        <div className="f1">
          <div className="crumb">
            <span>{"Safety & fleet"}</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>Compliance</b>
          </div>
          <h1 className="h1">Compliance</h1>
          <p className="sub">Qualification files, expirations and document reviews</p>
        </div>
        <div className="r g8">
          <button className="btn">
            <Icon className="s14" d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
            Reminder rules
          </button>
          <button className="btn">
            <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            Export
          </button>
        </div>
      </div>
      <div className="kpis" style={{ margin: "0 24px", gridTemplateColumns: "repeat(5,minmax(0,1fr))" }}>
        {SF.kpis.map((k, i) => (
          <button key={i} className="kpi">
            <span className="kl">
              <span className="dot" data-k={k.k}></span>
              <span>{k.label}</span>
            </span>
            <span className="kv2">
              <span>{k.value}</span>
              <small><span>{k.suffix}</span></small>
            </span>
            <span className="ks" data-k={k.sk}><span>{k.sub}</span></span>
          </button>
        ))}
      </div>
      <div className="tabs" style={{ marginTop: "12px" }}>
        <button className="tab on">
          Drivers
          <span className="tcnt">12</span>
        </button>
        <button className="tab">
          Trucks
          <span className="tcnt">41</span>
        </button>
        <button className="tab">
          Trailers
          <span className="tcnt">64</span>
        </button>
        <button className="tab">
          Organization
          <span className="tcnt">4</span>
        </button>
      </div>
      <div className="sfg">
        <section className="card oh c" style={{ minHeight: "0" }}>
          <div className="thead" style={{ gridTemplateColumns: SF.cols }}>
            {SF.head.map((h, i) => (
              <span key={i}><span>{h}</span></span>
            ))}
          </div>
          <div className="tbody">
            {SF.rows.map((r, i) => (
              <div key={i} className="trow" style={{ gridTemplateColumns: SF.cols }} onClick={r.open}>
                <div className="r g8 mw0">
                  <span className="av sm"><span>{r.ini}</span></span>
                  <span className="ell w5"><span>{r.n}</span></span>
                </div>
                {r.cells.map((x, i2) => (
                  <span key={i2} className="qp" data-k={x.k}>
                    <Icon className="s12 b" d={x.ic} />
                    <span>{x.t}</span>
                  </span>
                ))}
                <span className="badge" data-k={r.ok}>
                  <i></i>
                  <span>{r.ol}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="tfoot">
            <span className="r g12">
              <span className="r g6">
                <span className="qd" data-k="ok"></span>
                Valid
              </span>
              <span className="r g6">
                <span className="qd" data-k="warn"></span>
                Expires ≤ 30 days
              </span>
              <span className="r g6">
                <span className="qd" data-k="bad"></span>
                Expired or missing
              </span>
              <span className="r g6">
                <span className="qd" data-k="info"></span>
                Awaiting review
              </span>
            </span>
            <span className="sp"></span>
            <span>Dates are calendar dates, not times</span>
          </div>
        </section>
        <div className="c g16" style={{ minHeight: "0", overflow: "auto" }}>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Review queue</h2>
              <span className="cnt" data-k="info">3</span>
              <span className="sp"></span>
              <button className="lnk" onClick={goDocs}>Documents</button>
            </div>
            {SF.queue.map((q, i) => (
              <div key={i} className="wl" style={{ alignItems: "flex-start" }}>
                <span className="eqic"><Icon className="s14" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" /></span>
                <div className="f1">
                  <div className="fs13 w5"><span>{q.t}</span></div>
                  <div className="fs12 mu"><span>{q.who}</span></div>
                  <div className="r g6 fs11 mu" style={{ marginTop: "3px" }}>
                    <span className="tag" data-k={q.ck}>{"OCR "}<span>{q.conf}</span></span>
                    <span>{q.src}</span>
                  </div>
                </div>
                <button className="btn xs" onClick={goReview}>Review</button>
              </div>
            ))}
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Reminder schedule</h2>
              <span className="sp"></span>
              <span className="tag" data-k="ok">On</span>
            </div>
            <div className="cb c g10">
              <dl className="kv">
                <dt>Lead times</dt>
                <dd>60 · 30 · 14 · 7 · 1 days</dd>
                <dt>Channels</dt>
                <dd>Telegram, app, email</dd>
                <dt>Copies to</dt>
                <dd>Safety team</dd>
                <dt>Next run</dt>
                <dd className="num">Tonight · 02:00 CT</dd>
                <dt>Sent this week</dt>
                <dd className="num">14 · 0 failed</dd>
              </dl>
              <p className="note">
                <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
                Each reminder is sent once per document and window. A reminder never marks anything compliant — a reviewer approves the replacement.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
