"use client";

import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Reference of interface states: loading, empty, filtered, forbidden, conflict, stale, offline, success. */
export function StatesGallery() {
  const { isStates, ST2 } = useConsole();
  if (!isStates) return null;
  return (
    <div className="states">
      <div className="r g12" style={{ gridColumn: "1/-1" }}>
        <div className="f1">
          <div className="over">Every data screen</div>
          <h1 className="h1">States, handled the same way everywhere</h1>
        </div>
        <span className="fs13 mu" style={{ maxWidth: "520px", textAlign: "right" }}>
          Loading, empty, filtered-empty, forbidden, not found, conflict, stale and offline — built once into the shared table, form and panel components.
        </span>
      </div>
      <section className="stt">
        <div className="sth">
          <span className="tag" data-k="mu">Loading</span>
          <span className="fs12 mu">first paint</span>
        </div>
        <div className="c g10" style={{ padding: "14px" }}>
          <span className="skel" style={{ width: "40%" }}></span>
          {ST2.sk.map((w, i) => (
            <div key={i} className="r g10">
              <span className="skel" style={{ width: "18px", height: "18px", borderRadius: "5px" }}></span>
              <span className="skel" style={{ width: w }}></span>
              <span className="skel" style={{ width: "16%", marginLeft: "auto" }}></span>
            </div>
          ))}
        </div>
      </section>
      <section className="stt">
        <div className="sth">
          <span className="tag" data-k="mu">Empty</span>
          <span className="fs12 mu">first use</span>
        </div>
        <div className="stc">
          <span className="forbic"><Icon className="s20" d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4" /></span>
          <div className="fs14 w6">No customers yet</div>
          <p className="fs12 mu pre">Customers hold billing terms and contacts. Add one, or import a CSV from your old system.</p>
          <div className="r g8">
            <button className="btn sm">Import CSV</button>
            <button className="btn sm pri">Add customer</button>
          </div>
        </div>
      </section>
      <section className="stt">
        <div className="sth">
          <span className="tag" data-k="mu">Filtered empty</span>
          <span className="fs12 mu">filters hide everything</span>
        </div>
        <div className="stc">
          <span className="forbic"><Icon className="s20" d="M22 3H2l8 9.5V19l4 2v-8.5z" /></span>
          <div className="fs14 w6">No loads match these filters</div>
          <div className="r g6 wrap" style={{ justifyContent: "center" }}>
            <span className="chip" style={{ height: "26px" }}>Status: On hold</span>
            <span className="chip" style={{ height: "26px" }}>Customer: Kimberly-Clark</span>
          </div>
          <button className="btn sm">Clear filters</button>
        </div>
      </section>
      <section className="stt">
        <div className="sth">
          <span className="tag" data-k="bad">Forbidden</span>
          <span className="fs12 mu">403 · same for hidden records</span>
        </div>
        <div className="stc">
          <span className="forbic"><Icon className="s20" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" /></span>
          <div className="fs14 w6">You don’t have access to Invoices</div>
          <p className="fs12 mu pre">
            Your role doesn’t include
            {" "}
            <span className="mono">finance.invoices.read</span>
            .
          </p>
          <button className="btn sm">Request access</button>
        </div>
      </section>
      <section className="stt">
        <div className="sth">
          <span className="tag" data-k="bad">Conflict</span>
          <span className="fs12 mu">409 · stale version</span>
        </div>
        <div className="c g10" style={{ padding: "14px" }}>
          <div className="banner" data-k="warn">
            <Icon className="s14" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
            <div className="f1">
              <div className="bt">This load changed while you were editing</div>
              <div>Alex Rivera moved the delivery appointment. Nothing was overwritten.</div>
            </div>
          </div>
          <div className="xgrid" style={{ gridTemplateColumns: "auto 1fr 1fr" }}>
            <span className="xh">Field</span>
            <span className="xh">Yours</span>
            <span className="xh">Now</span>
            <span className="mono t2">Delivery appt</span>
            <span className="mono xa">15:00</span>
            <span className="mono xb">16:30</span>
          </div>
          <div className="r g8">
            <button className="btn sm">Review changes</button>
            <button className="btn sm pri">{"Reload & keep my edits"}</button>
          </div>
        </div>
      </section>
      <section className="stt">
        <div className="sth">
          <span className="tag" data-k="warn">Stale data</span>
          <span className="fs12 mu">honest freshness</span>
        </div>
        <div className="c g10" style={{ padding: "14px" }}>
          <div className="banner" data-k="warn">
            <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2" />
            <div className="f1">
              <div className="bt">Tracking delayed</div>
              <div>Last position 47 min ago. Telematics sync is retrying — we won’t show old positions as live.</div>
            </div>
          </div>
          <div className="r g8 fs13">
            <span className="mono w6">T-1149</span>
            <span className="mu">Dallas yard · 10:33</span>
            <span className="sp"></span>
            <span className="badge" data-k="bad">
              <i></i>
              Stale
            </span>
          </div>
          <button className="btn sm" style={{ alignSelf: "flex-start" }}>Integration health</button>
        </div>
      </section>
      <section className="stt">
        <div className="sth">
          <span className="tag" data-k="bad">Offline</span>
          <span className="fs12 mu">network or API error</span>
        </div>
        <div className="stc">
          <span className="forbic">
            <Icon className="s20" d="M1 1l22 22M16.7 11.1A11 11 0 0 1 19 12.6M5 12.6a11 11 0 0 1 5.2-2.5M10.7 5A16 16 0 0 1 22.6 9M1.4 9a16 16 0 0 1 4.7-2.9M8.5 16.1a6 6 0 0 1 7 0M12 20h.01" />
          </span>
          <div className="fs14 w6">Couldn’t reach FlyFleet</div>
          <p className="fs12 mu pre">Your form is still here. Retrying won’t create duplicates — each save carries an idempotency key.</p>
          <button className="btn sm pri">
            <Icon className="s14" d="M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" />
            Retry
          </button>
          <span className="fs11 mu mono">request_id req_7Hq2…f91</span>
        </div>
      </section>
      <section className="stt">
        <div className="sth">
          <span className="tag" data-k="ok">Success</span>
          <span className="fs12 mu">after server confirms</span>
        </div>
        <div className="c g10" style={{ padding: "14px" }}>
          <div className="toast">
            <Icon className="s14 b" d="M5 12l5 5 9-10" />
            <span className="f1">
              Load
              {" "}
              <b className="mono">FF-24890</b>
              {" "}
              created as Draft
            </span>
            <button className="lnk" style={{ color: "#8DA9FB" }}>View</button>
          </div>
          <p className="fs12 mu pre">Money, assignments and status changes never update optimistically — the UI waits for the server, then confirms.</p>
          <div className="r g8 fs12">
            <span className="dot" data-k="ok"></span>
            Saved · v1 · 11:21 CT
          </div>
        </div>
      </section>
    </div>
  );
}
