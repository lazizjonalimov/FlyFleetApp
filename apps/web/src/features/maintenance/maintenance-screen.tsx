"use client";

import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Maintenance board of work orders. */
export function MaintenanceScreen() {
  const { isMaint, MT } = useConsole();
  if (!isMaint) return null;
  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px" }}>
        <div className="f1">
          <div className="crumb">
            <span>{"Safety & fleet"}</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>Maintenance</b>
          </div>
          <h1 className="h1">Maintenance</h1>
          <p className="sub">Work orders for 41 trucks and 64 trailers · equipment in the shop is excluded from dispatch</p>
        </div>
        <div className="r g8">
          <div className="seg" role="group" aria-label="View">
            <button className="on">Board</button>
            <button>List</button>
            <button>Calendar</button>
          </div>
          <button className="btn pri">
            <Icon className="s14 b" d="M12 5v14M5 12h14" />
            New work order
          </button>
        </div>
      </div>
      <div className="kpis" style={{ margin: "0 24px", gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
        {MT.kpis.map((k, i) => (
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
      <div className="kanban">
        {MT.cols.map((col, i) => (
          <section key={i} className="kcol">
            <div className="r g8 kch">
              <span className="dot" data-k={col.k}></span>
              <span className="h3"><span>{col.l}</span></span>
              <span className="cnt" data-k="mu"><span>{col.n}</span></span>
              <span className="sp"></span>
              <button className="btn ghost xs icon" aria-label="Add work order"><Icon className="s14" d="M12 5v14M5 12h14" /></button>
            </div>
            <div className="c g8" style={{ padding: "0 8px 8px", overflow: "auto", minHeight: "0", flex: "1" }}>
              {col.cards.map((w, i2) => (
                <article key={i2} className="wo">
                  <div className="r g6">
                    <span className="mono fs12 mu"><span>{w.id}</span></span>
                    <span className="sp"></span>
                    <span className="tag" data-k={w.pk}><span>{w.pri}</span></span>
                  </div>
                  <div className="fs13 w5"><span>{w.title}</span></div>
                  <div className="r g6 fs12 t3">
                    <span className="eqic" style={{ width: "22px", height: "22px" }}>
                      <Icon className="s12" d="M1 5h14v11H1zM15 9h4l3 3v4h-7zM5.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
                    </span>
                    <span className="mono w5"><span>{w.unit}</span></span>
                    <span className="mu ell"><span>{w.meta}</span></span>
                  </div>
                  <div className="r jb fs12 mu" style={{ paddingTop: "6px", borderTop: "1px solid var(--bd2)" }}>
                    <span className="ell"><span>{w.vendor}</span></span>
                    <span className="num nw"><span>{w.date}</span></span>
                  </div>
                  {w.rts ? (
                    <div className="banner" data-k={w.rk} style={{ padding: "6px 8px" }}>
                      <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
                      <div>
                        <b><span>{w.rts}</span></b>
                        {" "}<span>{w.rtsd}</span>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
