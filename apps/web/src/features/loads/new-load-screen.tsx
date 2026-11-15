"use client";

import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Guided new-load form. */
export function NewLoadScreen() {
  const { isNew, goLoads, NL, fin, noFin } = useConsole();
  if (!isNew) return null;
  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "14px", borderBottom: "1px solid var(--bd)" }}>
        <div className="f1">
          <div className="crumb">
            <span>Operations</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <button onClick={goLoads}>Loads</button>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>New load</b>
          </div>
          <div className="r g10">
            <h1 className="h1">New load</h1>
            <span className="badge" data-k="draft">
              <i></i>
              Draft · not saved
            </span>
          </div>
        </div>
        <div className="r g8">
          <button className="btn ghost" onClick={goLoads}>Cancel</button>
          <button className="btn">Save draft</button>
        </div>
      </div>
      <div className="nlg">
        <nav className="nlsteps" aria-label="Steps">
          {NL.steps.map((s, i) => (
            <div key={i} className={clsx("nls", s.st)}>
              <span className="nln">
                {s.done ? (
                  <Icon className="s12 b" d="M5 12l5 5 9-10" />
                ) : null}
                {s.todo ? (
                  <span>{s.n}</span>
                ) : null}
              </span>
              <span className="c">
                <span className="fs13 w5"><span>{s.l}</span></span>
                <span className="fs12 mu"><span>{s.d}</span></span>
              </span>
            </div>
          ))}
          <p className="note" style={{ marginTop: "auto" }}>
            <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
            Everything here is validated again by the server when you save — the form only gives faster feedback.
          </p>
        </nav>
        <div className="nlmain">
          <div className="r g8" style={{ marginBottom: "4px" }}><span className="over">Step 3 of 6</span></div>
          <h2 style={{ fontSize: "18px", lineHeight: "24px", fontWeight: "600" }}>{"Stops & appointments"}</h2>
          <p className="fs13 mu" style={{ margin: "2px 0 16px" }}>Stops run in order. Times use each facility’s local timezone.</p>
          <div className="c g12">
            <section className="card stopc">
              <div className="r g8 stoph">
                <button className="btn ghost xs icon" aria-label="Drag to reorder">
                  <Icon className="dots" d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" />
                </button>
                <span className="smk" data-k="brand">1</span>
                <span className="h3">Pickup</span>
                <span className="sp"></span>
                <button className="btn ghost xs icon" aria-label="Move stop down"><Icon className="s14" d="M6 9l6 6 6-6" /></button>
                <button className="btn ghost xs icon" aria-label="Remove stop"><Icon className="s14" d="M18 6L6 18M6 6l12 12" /></button>
              </div>
              <div className="sgrid">
                <div className="fld" style={{ gridColumn: "span 6" }}>
                  <label htmlFor="nl-f1">Facility</label>
                  <div className="search" style={{ width: "auto", height: "36px" }}>
                    <Icon className="s14" d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4" />
                    <input id="nl-f1" defaultValue="Owens Corning Plant 2 — 1100 Ferris Rd, Waxahachie, TX 75165" />
                  </div>
                  <span className="hint r g6">
                    <Icon className="s12 b" d="M5 12l5 5 9-10" />
                    Saved facility · geocoded · America/Chicago
                  </span>
                </div>
                <div className="fld" style={{ gridColumn: "span 2" }}>
                  <span className="lbl">Appointment type</span>
                  <div className="seg">
                    <button className="on">Window</button>
                    <button>Appointment</button>
                    <button>FCFS</button>
                  </div>
                </div>
                <div className="fld" style={{ gridColumn: "span 2" }}>
                  <label htmlFor="nl-d1">Date</label>
                  <input id="nl-d1" className="inp" defaultValue="Fri, Nov 13, 2026" />
                </div>
                <div className="fld">
                  <label htmlFor="nl-a1">From</label>
                  <input id="nl-a1" className="inp mono" defaultValue="14:00" />
                </div>
                <div className="fld">
                  <label htmlFor="nl-b1">To</label>
                  <input id="nl-b1" className="inp mono" defaultValue="16:00" />
                </div>
                <div className="fld" style={{ gridColumn: "span 2" }}>
                  <label htmlFor="nl-r1">Pickup number</label>
                  <input id="nl-r1" className="inp mono" defaultValue="PU 88213-1" />
                </div>
                <div className="fld" style={{ gridColumn: "span 4" }}>
                  <label htmlFor="nl-i1">Driver instructions</label>
                  <input id="nl-i1" className="inp" defaultValue="Check in at gate 3. Bring two load locks." />
                </div>
              </div>
            </section>
            <section className="card stopc">
              <div className="r g8 stoph">
                <button className="btn ghost xs icon" aria-label="Drag to reorder">
                  <Icon className="dots" d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" />
                </button>
                <span className="smk" data-k="brand">2</span>
                <span className="h3">Delivery</span>
                <span className="tag" data-k="bad" style={{ marginLeft: "4px" }}>1 error</span>
                <span className="sp"></span>
                <button className="btn ghost xs icon" aria-label="Move stop up"><Icon className="s14" d="M18 15l-6-6-6 6" /></button>
                <button className="btn ghost xs icon" aria-label="Remove stop"><Icon className="s14" d="M18 6L6 18M6 6l12 12" /></button>
              </div>
              <div className="sgrid">
                <div className="fld" style={{ gridColumn: "span 6" }}>
                  <label htmlFor="nl-f2">Facility</label>
                  <div className="search" style={{ width: "auto", height: "36px" }}>
                    <Icon className="s14" d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4" />
                    <input id="nl-f2" defaultValue="ABC Supply #418 — 4501 Industrial Loop, Shreveport, LA 71108" />
                  </div>
                  <span className="hint r g6">
                    <Icon className="s12 b" d="M5 12l5 5 9-10" />
                    Geocoded · America/Chicago · 214 mi from stop 1 (estimate)
                  </span>
                </div>
                <div className="fld" style={{ gridColumn: "span 2" }}>
                  <span className="lbl">Appointment type</span>
                  <div className="seg">
                    <button className="on">Window</button>
                    <button>Appointment</button>
                    <button>FCFS</button>
                  </div>
                </div>
                <div className="fld" style={{ gridColumn: "span 2" }}>
                  <label htmlFor="nl-d2">Date</label>
                  <input id="nl-d2" className="inp" defaultValue="Sat, Nov 14, 2026" />
                </div>
                <div className="fld">
                  <label htmlFor="nl-a2">From</label>
                  <input id="nl-a2" className="inp mono" defaultValue="08:00" />
                </div>
                <div className="fld">
                  <label htmlFor="nl-b2">To</label>
                  <input id="nl-b2" className="inp mono err" defaultValue="07:00" aria-invalid="true" aria-describedby="nl-e2" />
                </div>
                <div className="fld" style={{ gridColumn: "span 6" }}>
                  <p className="errt" id="nl-e2">
                    <Icon className="s14" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
                    Window ends before it starts. Choose an end time after 08:00.
                  </p>
                </div>
                <div className="fld" style={{ gridColumn: "span 2" }}>
                  <label htmlFor="nl-r2">Delivery number</label>
                  <input id="nl-r2" className="inp mono" defaultValue="PO 88213" />
                </div>
                <div className="fld" style={{ gridColumn: "span 4" }}>
                  <label htmlFor="nl-i2">Driver instructions</label>
                  <input id="nl-i2" className="inp" placeholder="Dock, lumper, contact on arrival…" />
                </div>
              </div>
            </section>
            <button className="addstop">
              <Icon className="s14 b" d="M12 5v14M5 12h14" />
              Add stop
              <span className="fs12 mu" style={{ fontWeight: "400" }}>Pickup, delivery, or fuel / scale stop</span>
            </button>
          </div>
        </div>
        <aside className="nlside">
          <section className="card oh">
            <div className="ch"><h2 className="h2">Summary</h2></div>
            <div className="cb c g12">
              <dl className="kv">
                <dt>Customer</dt>
                <dd>Owens Corning</dd>
                <dt>Reference</dt>
                <dd className="mono">PO 88213</dd>
                <dt>Equipment</dt>
                <dd>53’ Dry van</dd>
                <dt>Commodity</dt>
                <dd>Roofing shingles</dd>
                <dt>Weight</dt>
                <dd className="num">42,000 lb · 22 pallets</dd>
                <dt>Est. distance</dt>
                <dd className="num">214 mi</dd>
              </dl>
              <div className="banner" data-k="ok">
                <Icon className="s14 b" d="M5 12l5 5 9-10" />
                <div>
                  {"Reference "}
                  <b className="mono">PO 88213</b>
                  {" is unique for Owens Corning."}
                </div>
              </div>
              {fin ? (
                <>
                  <div className="hr"></div>
                  <dl className="kv">
                    <dt>Line haul</dt>
                    <dd className="mono">$1,150.00</dd>
                    <dt>Fuel surcharge</dt>
                    <dd className="mono">$138.00</dd>
                    <dt>Rate / mile</dt>
                    <dd className="mono">$6.02</dd>
                  </dl>
                </>
              ) : null}
              {noFin ? (
                <div className="note">
                  <Icon className="s14" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
                  Rate entry needs the “Load rates” permission. Accounting will complete it.
                </div>
              ) : null}
            </div>
          </section>
          <section className="card oh">
            <div className="ch">
              <h2 className="h2">Check before saving</h2>
              <span className="cnt" data-k="bad">1</span>
            </div>
            <div className="cb c g10 fs13">
              <div className="r g8 ast">
                <span className="tc" data-k="bad">
                  <Icon className="s14" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
                </span>
                <span>Stop 2 delivery window is invalid</span>
              </div>
              <div className="r g8 ast">
                <span className="tc" data-k="ok"><Icon className="s14 b" d="M5 12l5 5 9-10" /></span>
                <span className="t3">Stops are in a valid order</span>
              </div>
              <div className="r g8 ast">
                <span className="tc" data-k="ok"><Icon className="s14 b" d="M5 12l5 5 9-10" /></span>
                <span className="t3">Customer is active · credit OK</span>
              </div>
              <div className="r g8 ast">
                <span className="tc" data-k="warn"><Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" /></span>
                <span className="t3">Rate confirmation not attached yet — load stays Draft until it is</span>
              </div>
            </div>
          </section>
        </aside>
      </div>
      <div className="nlfoot">
        <span className="fs12 mu">
          {"Saving creates load "}
          <b className="mono tx">FF-24890</b>
          {" as a Draft. Nothing is sent to drivers until you dispatch."}
        </span>
        <span className="sp"></span>
        <button className="btn">
          <Icon className="s14" d="M15 6l-6 6 6 6" />
          Back
        </button>
        <button className="btn pri">
          {"Continue to rate & charges"}
          <Icon className="s14" d="M9 6l6 6-6 6" />
        </button>
      </div>
    </div>
  );
}
