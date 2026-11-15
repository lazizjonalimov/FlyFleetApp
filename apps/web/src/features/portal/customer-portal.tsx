"use client";

import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Customer portal: shared shipments, status and documents. */
export function CustomerPortal() {
  const { isPortal, PT } = useConsole();
  if (!isPortal) return null;
  return (
    <div className="portal">
      <header className="ptop">
        <div className="r g10">
          <span className="orgmk" style={{ background: "#E8A317", width: "30px", height: "30px" }}>LS</span>
          <div className="c">
            <span className="fs14 w6">Lone Star Freight</span>
            <span className="fs11 mu">Shipment portal</span>
          </div>
        </div>
        <nav className="r g4" style={{ marginLeft: "28px" }}>
          <button className="ptab on">Shipments</button>
          <button className="ptab">Documents</button>
          <button className="ptab">Invoices</button>
        </nav>
        <span className="sp"></span>
        <span className="fs12 mu">Walmart Transportation</span>
        <span className="av md">KM</span>
      </header>
      <div className="pbody">
        <section className="c g10" style={{ minHeight: "0" }}>
          <div className="r g8">
            <h1 className="h1" style={{ fontSize: "18px" }}>Shipments</h1>
            <span className="sp"></span>
            <label className="search" style={{ width: "200px" }}>
              <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
              <input placeholder="PO or load number" aria-label="Search shipments" />
            </label>
          </div>
          <div className="seg sm" style={{ alignSelf: "flex-start" }}>
            <button className="on">Active · 2</button>
            <button>Delivered</button>
            <button>All</button>
          </div>
          {PT.list.map((s, i) => (
            <button key={i} className={clsx("pship", s.on)}>
              <div className="r g8">
                <span className="mono fs12 w5 t2"><span>{s.id}</span></span>
                <span className="fs12 mu"><span>{s.po}</span></span>
                <span className="sp"></span>
                <span className="badge" data-k={s.k}>
                  <i></i>
                  <span>{s.st}</span>
                </span>
              </div>
              <div className="fs14 w5 tx" style={{ marginTop: "6px" }}><span>{s.lane}</span></div>
              <div className="fs12 mu num" style={{ marginTop: "2px" }}><span>{s.when}</span></div>
            </button>
          ))}
        </section>
        <section className="card oh c" style={{ minHeight: "0" }}>
          <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--bd2)" }}>
            <div className="r g8">
              <span className="mono fs13 w5 t2">FF-24817</span>
              <span className="fs12 mu">PO 71904</span>
              <span className="badge" data-k="transit">
                <i></i>
                In transit
              </span>
              <span className="sp"></span>
              <button className="btn sm">
                <Icon className="s14" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                Contact dispatch
              </button>
            </div>
            <h2 style={{ fontSize: "20px", lineHeight: "26px", fontWeight: "600", marginTop: "8px" }}>Fort Worth, TX → Oklahoma City, OK</h2>
          </div>
          <div style={{ padding: "16px 20px", overflow: "auto" }} className="c g16">
            <div className="banner" data-k="late">
              <Icon d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2" />
              <div className="f1">
                <div className="bt">Delivery estimate updated: 16:40 CT</div>
                <div>Your appointment at DC 6094 is 15:00. Cause: heavy traffic on I-35 near Ardmore. Updated 11:18 CT by Lone Star Freight.</div>
              </div>
            </div>
            <div className="pmile">
              {PT.miles.map((m, i) => (
                <div key={i} className={clsx("lcs", m.st)}>
                  <span className="lcd">
                    {m.done ? (
                      <Icon className="s12 b" d="M5 12l5 5 9-10" />
                    ) : null}
                  </span>
                  <span className="lcl"><span>{m.l}</span></span>
                  <span className="lct"><span>{m.t}</span></span>
                </div>
              ))}
            </div>
            <div className="lpmap" style={{ borderRadius: "10px", border: "1px solid var(--bd)", height: "180px" }}>
              <svg viewBox="0 0 760 200" preserveAspectRatio="none" aria-hidden="true" className="lpsvg">
                <path className="mroad" d="M0 168 C 140 150, 210 120, 300 128 S 520 60, 760 40" />
                <path className="mdone" d="M70 160 C 180 150, 260 118, 360 110 S 450 96, 492 84" />
                <path className="mrest" d="M492 84 C 560 66, 630 52, 690 42" />
              </svg>
              <span className="mpin" style={{ left: "70px", top: "160px" }} data-k="ok"></span>
              <span className="mpin" style={{ left: "690px", top: "42px" }} data-k="brand"></span>
              <span className="mtruck" style={{ left: "492px", top: "84px" }}><Icon className="s12 fill" d="M12 2l7 19-7-4-7 4z" /></span>
              <span className="mlab" style={{ left: "440px", top: "104px" }}>Near Ardmore, OK · 11:18</span>
            </div>
            <div className="pgrid2">
              <div className="card" style={{ padding: "12px 14px", boxShadow: "none" }}>
                <div className="over" style={{ marginBottom: "8px" }}>Stops</div>
                <dl className="kv" style={{ fontSize: "12px" }}>
                  <dt>Pickup</dt>
                  <dd>Walmart DC 7012 · picked up 07:05</dd>
                  <dt>Delivery</dt>
                  <dd>Walmart DC 6094 · appt 15:00</dd>
                  <dt>Equipment</dt>
                  <dd>53’ dry van</dd>
                </dl>
              </div>
              <div className="card" style={{ padding: "12px 14px", boxShadow: "none" }}>
                <div className="over" style={{ marginBottom: "8px" }}>Documents</div>
                <div className="c g8">
                  <div className="r g8 fs13">
                    <Icon className="s14 mu" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" />
                    <span className="f1">Bill of lading</span>
                    <button className="lnk">Download</button>
                  </div>
                  <div className="r g8 fs13 mu">
                    <Icon className="s14" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" />
                    <span className="f1">Proof of delivery</span>
                    <span className="fs12">After delivery</span>
                  </div>
                </div>
              </div>
            </div>
            <p className="note">
              <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
              You see shipments Lone Star Freight shares with Walmart Transportation. Rates and driver details aren’t shared.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
