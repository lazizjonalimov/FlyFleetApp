"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { BasicCell } from "@/components/data-table/cells";
import { ChangeDetail } from "@/components/data-table/change-detail";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { LoadDrawer } from "@/features/loads/load-drawer";

/** Loads list with saved views, filters, bulk selection and the detail drawer. */
export function LoadsScreen() {
  const { isLoads, LT, goNew, toggleAll, clearSel } = useConsole();
  if (!isLoads) return null;
  return (
    <>
      <div className="col">
        <div className="ph" style={{ paddingBottom: "12px" }}>
          <div className="f1">
            <div className="crumb">
              <span>Operations</span>
              <Icon className="s12" d="M9 6l6 6-6 6" />
              <b>Loads</b>
            </div>
            <h1 className="h1">Loads</h1>
            <p className="sub"><span>{LT.sub}</span></p>
          </div>
          <div className="r g8">
            <button className="btn">
              <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              Import
            </button>
            <button className="btn">
              <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              Export
            </button>
            <button className="btn pri" onClick={goNew}>
              <Icon className="s14 b" d="M12 5v14M5 12h14" />
              New load
            </button>
          </div>
        </div>
        <div className="tabs">
          {LT.tabs.map((t, i) => (
            <button key={i} className={clsx("tab", t.on)} onClick={t.go}>
              <span>{t.label}</span>
              <span className="tcnt"><span>{t.n}</span></span>
            </button>
          ))}
          <button className="tab" style={{ color: "var(--pri)" }}>
            <Icon className="s12 b" d="M12 5v14M5 12h14" />
            Save view
          </button>
        </div>
        <div className="fb">
          <label className="search">
            <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
            <input placeholder="Load #, reference, customer, city" aria-label="Search loads" />
          </label>
          <button className="chip">
            Pickup: This week
            <Icon className="s12 b" d="M18 6L6 18M6 6l12 12" />
          </button>
          <button className="chip add">
            <Icon className="s12 b" d="M12 5v14M5 12h14" />
            Status
          </button>
          <button className="chip add">
            <Icon className="s12 b" d="M12 5v14M5 12h14" />
            Customer
          </button>
          <button className="chip add">
            <Icon className="s12 b" d="M12 5v14M5 12h14" />
            Risk
          </button>
          <button className="lnk" style={{ color: "var(--mu)", padding: "0 4px" }}>Clear all</button>
          <span className="sp"></span>
          {LT.noFin ? (
            <span className="fs12 mu r g6">
              <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
              Rates hidden for your role
            </span>
          ) : null}
          <button className="btn sm">
            <Icon className="s14" d="M3 4h18v16H3zM9 4v16M15 4v16" />
            Columns
          </button>
          <button className="btn sm">
            <Icon className="s14" d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
            Pickup date
          </button>
        </div>
        <div className="card oh c" style={{ flex: "1", minHeight: "0", margin: "0 24px 24px" }}>
          <div className="thead" style={{ gridTemplateColumns: LT.cols }}>
            <button className={clsx("chk", LT.allOn)} onClick={toggleAll} aria-label="Select all loads">
              {LT.allOn ? (
                <span style={{ width: "8px", height: "2px", borderRadius: "1px", background: "#fff" }}></span>
              ) : null}
            </button>
            {LT.head.map((h, i) => (
              <span key={i} className={h.al}><span>{h.l}</span></span>
            ))}
          </div>
          <div className="tbody">
            {LT.rows.map((r, i) => (
              <Fragment key={i}>
                <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: LT.cols }} onClick={r.open}>
                  {r.cells.map((c, i2) => (
                    <BasicCell key={i2} c={c} />
                  ))}
                </div>
                <ChangeDetail r={r} />
              </Fragment>
            ))}
          </div>
          <div className="tfoot">
            <span className="num">
              Showing
              {" "}
              <b className="tx w5"><span>{LT.range}</span></b>
              {" "}of{" "}<span>{LT.total}</span>
            </span>
            <span className="sp"></span>
            <span>Rows per page</span>
            <button className="btn xs">
              25
              <Icon className="s12" d="M6 9l6 6 6-6" />
            </button>
            <div className="pg" style={{ marginLeft: "8px" }}>
              <button aria-label="Previous page" disabled><Icon className="s14" d="M15 6l-6 6 6 6" /></button>
              <button className="on">1</button>
              <button>2</button>
              <button>3</button>
              <button disabled>…</button>
              <button>52</button>
              <button aria-label="Next page"><Icon className="s14" d="M9 6l6 6-6 6" /></button>
            </div>
          </div>
        </div>
      </div>
      {LT.bulk ? (
        <div className="bulk">
          <span className="w5 num" style={{ marginRight: "10px" }}><span>{LT.selN}</span>{" "}selected</span>
          <span style={{ width: "1px", height: "20px", background: "#2A3550", marginRight: "4px" }}></span>
          <button>Assign driver</button>
          <button>Change status</button>
          <button>Print BOLs</button>
          <button>Export</button>
          <button onClick={clearSel} aria-label="Clear selection" className="bx"><Icon className="s14 b" d="M18 6L6 18M6 6l12 12" /></button>
        </div>
      ) : null}
      <LoadDrawer />
    </>
  );
}
