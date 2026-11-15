"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Live fleet map with the vehicle list and the selected vehicle’s panel. */
export function TrackingScreen() {
  const { isTracking, M, goMessages } = useConsole();
  if (!isTracking) return null;
  return (
    <div className="col">
      <div className="mtop">
        <div className="c">
          <div className="r g10">
            <h1 className="h1" style={{ fontSize: "18px", lineHeight: "24px" }}>Live fleet</h1>
            <span className="badge" data-k="ok">
              <i></i>
              Live · 11:20:14 CT
            </span>
          </div>
          <span className="fs12 mu"><span>{M.sub}</span></span>
        </div>
        <span className="sp"></span>
        <button className="chip add">
          <Icon className="s12 b" d="M12 5v14M5 12h14" />
          Status
        </button>
        <button className="chip add">
          <Icon className="s12 b" d="M12 5v14M5 12h14" />
          Load
        </button>
        <div className="seg" role="group" aria-label="Map layers">
          <button className="on">
            <Icon className="s12 b" d="M5 12l5 5 9-10" />
            Geofences
          </button>
          <button className="on">
            <Icon className="s12 b" d="M5 12l5 5 9-10" />
            Trails
          </button>
          <button>Labels</button>
        </div>
        <button className="btn">
          <Icon className="s14" d="M6 4l14 8-14 8z" />
          Trip history
        </button>
      </div>
      <div className="mapw">
        <svg className="msvg" viewBox="0 0 1208 788" preserveAspectRatio="none" aria-hidden="true">
          <path className="mwater" d={M.water} />
          <path className="mstate" d={M.states} />
          <path className="mminor" d={M.minor} />
          <path className="mcase" d={M.major} />
          <path className="mmajor" d={M.major} />
          <path className="mtrail" d={M.trail} />
          <path className="mplan" d={M.plan} />
        </svg>
        {M.fences.map((f, i) => (
          <span key={i} className="fence" data-k={f.k} style={{ left: `${f.x}px`, top: `${f.y}px`, width: `${f.d}px`, height: `${f.d}px` }}>
            <span className="fencel"><span>{f.l}</span></span>
          </span>
        ))}
        {M.cities.map((cty, i) => (
          <span key={i} className={clsx("city", cty.cls)} style={{ left: `${cty.x}px`, top: `${cty.y}px` }}><span>{cty.n}</span></span>
        ))}
        {M.shields.map((sh, i) => (
          <span key={i} className="shield" style={{ left: `${sh.x}px`, top: `${sh.y}px` }}><span>{sh.n}</span></span>
        ))}
        {M.trucks.map((v, i) => (
          <Fragment key={i}>
            {" "}
            <button className={clsx("vm", v.cls)} data-k={v.k} style={{ left: `${v.x}px`, top: `${v.y}px` }} aria-label={v.aria}>
              <span className="vmh"><span className="r" style={{ transform: `rotate(${v.h}deg)` }}><Icon className="s12 fill" d="M12 2l7 19-7-4-7 4z" /></span></span>
              <span className="vml"><span>{v.unit}</span></span>
            </button>
            {" "}
          </Fragment>
        ))}
        {M.clusters.map((cl, i) => (
          <button key={i} className="vcl" style={{ left: `${cl.x}px`, top: `${cl.y}px` }} aria-label={cl.aria}><span>{cl.n}</span></button>
        ))}
        <section className="mpl card">
          <div className="r g8" style={{ padding: "12px 12px 8px" }}>
            <span className="h2">Vehicles</span>
            <span className="cnt" data-k="mu"><span>{M.vn}</span></span>
            <span className="sp"></span>
            <button className="btn ghost xs icon" aria-label="Sort vehicles"><Icon className="s14" d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" /></button>
          </div>
          <div style={{ padding: "0 12px 8px" }}>
            <label className="search" style={{ width: "100%" }}>
              <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
              <input placeholder="Unit, driver or load" aria-label="Search vehicles" />
            </label>
          </div>
          <div className="r g4 wrap" style={{ padding: "0 12px 10px", borderBottom: "1px solid var(--bd2)" }}>
            {M.filters.map((ft, i) => (
              <button key={i} className={clsx("mf", ft.on)} data-k={ft.k}>
                <span className="dot"></span>
                <span>{ft.l}</span>
                <span className="mono"><span>{ft.n}</span></span>
              </button>
            ))}
          </div>
          <div className="mlist">
            {M.list.map((x, i) => (
              <button key={i} className={clsx("mrow", x.sel)}>
                <span className="mstat" data-k={x.k}>
                  <Icon className="s14" d="M1 5h14v11H1zM15 9h4l3 3v4h-7zM5.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
                </span>
                <span className="f1 c">
                  <span className="r g6">
                    <span className="mono fs13 w6 tx"><span>{x.unit}</span></span>
                    <span className="fs12 t3 ell"><span>{x.drv}</span></span>
                  </span>
                  <span className="fs12 mu ell"><span>{x.line}</span></span>
                </span>
                <span className="c" style={{ alignItems: "flex-end" }}>
                  <span className="mono fs13 w6 tc" data-k={x.sk}><span>{x.spd}</span></span>
                  <span className="r g4 fs11 mu nw">
                    <span className="dot" data-k={x.fk} style={{ width: "6px", height: "6px" }}></span>
                    <span>{x.fresh}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="mpr card">
          <div className="r g8" style={{ padding: "14px 16px 0" }}>
            <span className="mono" style={{ fontSize: "18px", fontWeight: "600" }}>T-1121</span>
            <span className="badge" data-k="bad">
              <i></i>
              Speeding
            </span>
            <span className="sp"></span>
            <button className="btn ghost icon sm" aria-label="Close vehicle panel"><Icon d="M18 6L6 18M6 6l12 12" /></button>
          </div>
          <div className="fs13 t3" style={{ padding: "2px 16px 0" }}>
            {"Jamal Carter · "}
            <button className="lnk" style={{ fontSize: "13px" }} onClick={M.openLoad}>FF-24839</button>
            {" Lewisville → Austin"}
          </div>
          <div className="mstats">
            <div>
              <div className="fs12 mu">Speed</div>
              <div className="kv2 tc" data-k="bad" style={{ fontSize: "24px", lineHeight: "30px" }}>
                74
                <small>mph</small>
              </div>
            </div>
            <div>
              <div className="fs12 mu">Heading</div>
              <div className="fs15 w6">182° S</div>
            </div>
            <div>
              <div className="fs12 mu">Updated</div>
              <div className="fs15 w6 num">12 s ago</div>
            </div>
          </div>
          <div className="c g2" style={{ padding: "0 16px 12px" }}>
            <span className="fs13 w5">I-35 southbound near Temple, TX</span>
            <span className="fs12 mu">Vehicle telematics · ±5 m · event 11:20:02, received 11:20:03</span>
          </div>
          <div className="incident">
            <div className="r g8">
              <span className="h3">Speeding incident</span>
              <span className="mono fs12 mu">SPD-0412</span>
              <span className="sp"></span>
              <span className="tag" data-k="warn">Not acknowledged</span>
            </div>
            <div className="spark">
              <svg viewBox="0 0 312 96" preserveAspectRatio="none" aria-hidden="true">
                <rect className="spz" x={M.zx} y="0" width={M.zw} height="96" />
                <line className="spt" x1="0" x2="312" y1="48" y2="48" />
                <line className="spt2" x1="0" x2="312" y1="33.6" y2="33.6" />
                <path className="spl2" d={M.spark} />
              </svg>
              <span className="spk" style={{ top: "40px" }}>70 limit set by company</span>
              <span className="spk" style={{ top: "20px", color: "#B42318" }}>73 with tolerance</span>
              <div className="r jb fs11 mu mono" style={{ marginTop: "4px" }}>
                <span>10:50</span>
                <span>11:05</span>
                <span>11:20</span>
              </div>
            </div>
            <ol className="itl">
              <li>
                <span className="dot" data-k="bad"></span>
                <span className="f1">Detected — above 73 mph for 2 min</span>
                <span className="mono mu">11:16</span>
              </li>
              <li>
                <span className="dot" data-k="info"></span>
                <span className="f1">Driver alerted · Telegram + app, delivered</span>
                <span className="mono mu">11:16</span>
              </li>
              <li>
                <span className="dot" data-k="info"></span>
                <span className="f1">Dispatch notified · Jordan Lee</span>
                <span className="mono mu">11:16</span>
              </li>
              <li>
                <span className="dot" data-k="off"></span>
                <span className="f1 mu">Escalates to Safety if not acknowledged</span>
                <span className="mono mu">11:26</span>
              </li>
            </ol>
            <div className="r g8">
              <button className="btn pri sm">Acknowledge</button>
              <button className="btn sm" onClick={goMessages}>
                <Icon className="s14" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                Message
              </button>
              <button className="btn sm ghost">Resolve…</button>
            </div>
          </div>
          <p className="note" style={{ padding: "10px 16px 0" }}>
            <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
            Measured against the company threshold in policy “Highway sustained v3”, not the posted speed limit.
          </p>
          <div className="r g8" style={{ padding: "12px 16px 16px" }}>
            <span className="risk" data-k="late">
              <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2" />
              FF-24839 ETA 16:05 · +35m
            </span>
            <span className="sp"></span>
            <button className="lnk" onClick={M.openLoad}>Open load</button>
          </div>
        </section>
        <div className="mleg">
          <span className="r g6">
            <span className="dot" data-k="ok"></span>
            {"Live < 2 min"}
          </span>
          <span className="r g6">
            <span className="dot" data-k="warn"></span>
            Delayed 2–15 min
          </span>
          <span className="r g6">
            <span className="dot" data-k="bad"></span>
            {"Stale > 15 min"}
          </span>
          <span className="r g6">
            <span className="dot" data-k="off"></span>
            No signal
          </span>
          <span className="mu">{"· Location shown to Dispatch & Safety only, on duty"}</span>
        </div>
      </div>
    </div>
  );
}
