"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { DataCell } from "@/components/data-table/cells";
import { ChangeDetail } from "@/components/data-table/change-detail";
import { Icon } from "@/components/ui/icon";
import { EmptyState, ErrorState, FilteredEmpty, Skeleton } from "@/components/feedback/states";
import { tx } from "@/features/console/dom";
import type { ListResult } from "./use-list";
import type React from "react";

/**
 * The shared list screen: a title and actions, tabs, figures, search and filters, and one table that sorts,
 * selects and pages. What it lists comes from `useList`.
 */
export function ListScreen({ list }: { list: ListResult }) {
  const { L, status, pager } = list;
  return (
    <>
      <div className="col">
        <div className="ph" style={{ paddingBottom: "12px" }}>
          <div className="f1">
            <div className="crumb">
              <span><span>{L.group}</span></span>
              <Icon className="s12" d="M9 6l6 6-6 6" />
              <b><span>{L.title}</span></b>
            </div>
            <h1 className="h1"><span>{L.title}</span></h1>
            <p className="sub"><span>{L.sub}</span></p>
          </div>
          <div className="r g8">
            {L.actions.map((b, i) => (
              <button key={i} className={clsx("btn", b.cls)} onClick={b.go}>
                {b.ic ? (
                  <Icon className="s14" d={b.ic} />
                ) : null}
                <span>{b.l}</span>
              </button>
            ))}
          </div>
        </div>
        {L.tabs ? (
          <div className="tabs">
            {L.tabs.map((t, i) => (
              <button key={i} className={clsx("tab", t.on)} onClick={t.go}>
                <span>{t.l}</span>
                {t.n ? (
                  <span className="tcnt"><span>{t.n}</span></span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
        {L.kpis ? (
          <div className="kpis" style={{ margin: "14px 24px 0", gridTemplateColumns: `repeat(${L.kpiN},minmax(0,1fr))` }}>
            {L.kpis.map((k, i) => (
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
        ) : null}
        {L.band ? (
          <div className="card" style={{ margin: "14px 24px 0", padding: "12px 16px" }}>
            <div className="r g8" style={{ marginBottom: "8px" }}>
              <span className="h3"><span>{L.band.title}</span></span>
              <span className="fs12 mu"><span>{L.band.sub}</span></span>
              <span className="sp"></span>
              <span className="mono fs13 w6"><span>{L.band.total}</span></span>
            </div>
            <div className="segbar" style={{ height: "12px", borderRadius: "6px" }}>
              {L.band.segs.map((sg, i) => (
                <span key={i} data-k={sg.k} style={{ width: sg.w }}></span>
              ))}
            </div>
            <div className="r g20" style={{ marginTop: "8px" }}>
              {L.band.segs.map((sg, i) => (
                <span key={i} className="c">
                  <span className="r g6 fs12 t3">
                    <span className="qd" data-k={sg.k} style={{ width: "8px", height: "8px" }}></span>
                    <span>{sg.l}</span>
                  </span>
                  <span className="mono fs13 w5" style={{ paddingLeft: "14px" }}><span>{sg.v}</span></span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {L.callout ? (
          <div className="banner" data-k={L.callout.k} style={{ margin: "14px 24px 0" }}>
            <Icon d={L.callout.ic} />
            <div className="f1">
              <div className="bt"><span>{L.callout.t}</span></div>
              <div><span>{L.callout.d}</span></div>
            </div>
            {L.callout.b ? (
              <button className="btn sm" onClick={L.callout.go}><span>{L.callout.b}</span></button>
            ) : null}
          </div>
        ) : null}
        <div className="fb">
          <label className="search">
            <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
            <input placeholder={L.ph} aria-label={`Search ${L.title}`} value={L.qv} onChange={L.setQ} />
          </label>
          <FilterChips L={L} />
          <span className="sp"></span>
          {L.hidden ? (
            <span className="fs12 mu r g6">
              <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
              {tx(L.hidden)}
            </span>
          ) : null}
          <ColumnsButton L={L} />
          <ExportButton L={L} />
        </div>
        <div className="card oh c" style={{ flex: "1", minHeight: "0", margin: "0 24px 24px" }}>
          <div className={L.tsc}>
            <div className="tinner">
              <div className="thead" style={{ gridTemplateColumns: L.cols }}>
                {L.selectable ? (
                  <div className="th thc0">
                    <button className={clsx("chk", L.allOn)} onClick={L.toggleAll} aria-label={L.allAria}>
                      {L.allAll ? (
                        <Icon className="s12 b" d="M5 12l5 5 9-10" />
                      ) : null}
                      {L.allSome ? (
                        <i className="chkm"></i>
                      ) : null}
                    </button>
                  </div>
                ) : null}
                {L.head.map((h, i) => (
                  <div key={i} className={clsx("th", h.al)}>
                    {h.srt ? (
                      <button className={clsx("thb", h.al, h.son)} onClick={h.go} aria-label={h.aria}>
                        <span>{h.l}</span>
                        <Icon d={h.sic} />
                      </button>
                    ) : null}
                    {h.nogo ? (
                      <span><span>{h.l}</span></span>
                    ) : null}
                  </div>
                ))}
              </div>
              {status === "ready" ? (
                <div className="tb2">
                  {L.rows.map((r) => (
                    <Fragment key={r.key}>
                      <div className={clsx("trow", r.cls)} style={{ gridTemplateColumns: L.cols }} onClick={r.open}>
                        {r.cells.map((c, i2) => (
                          <DataCell key={i2} c={c} />
                        ))}
                      </div>
                      <ChangeDetail r={r} />
                    </Fragment>
                  ))}
                </div>
              ) : null}
            </div>
            {status === "loading" ? <Skeleton /> : null}
          </div>
          {status === "error" ? <ErrorState error={list.error} retry={list.retry} /> : null}
          {status === "filtered" ? <FilteredEmpty what={L.title.toLowerCase()} clear={list.clearFilters} /> : null}
          {status === "empty" ? (
            <EmptyState icon={list.empty.icon} title={list.empty.title} text={list.empty.text}>
              {list.empty.action ? <button className="btn sm pri" onClick={list.empty.action.go}>{list.empty.action.label}</button> : null}
            </EmptyState>
          ) : null}
          <div className="tfoot">
            <span className="num"><span>{L.foot}</span></span>
            <span className="sp"></span>
            <Pager L={L} pager={pager} />
          </div>
        </div>
      </div>
      <BulkBar L={L} />
    </>
  );
}

type L = ListResult["L"];

/** Filters in force as chips, and the filters that can be added, each a menu of the company's own values. */
export function FilterChips({ L }: { L: L }) {
  return (
    <>
      {L.chips.map((ch) => (
        <button key={ch.l} className="chip" onClick={ch.clear} aria-label={`Remove filter ${ch.l}`}>
          <span>{ch.l}</span>
          <Icon className="s12 b" d="M18 6L6 18M6 6l12 12" />
        </button>
      ))}
      {L.adds.map((ad) => (
        <div key={ad.l} className="dd">
          <button className="chip add" onClick={ad.toggle} aria-haspopup="listbox" aria-expanded={ad.open} aria-label={`Filter by ${ad.l.toLowerCase()}`}>
            <Icon className="s12 b" d="M12 5v14M5 12h14" />
            <span>{ad.l}</span>
          </button>
          {ad.open ? (
            <>
              <div className="ddcatch" onClick={L.closeMenus}></div>
              <div className="ddl" style={{ width: "260px" }}>
                {ad.search ? (
                  <label className="dds">
                    <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
                    <input autoFocus defaultValue={ad.q} placeholder={`Search ${ad.l.toLowerCase()}`} aria-label={`Search ${ad.l.toLowerCase()}`} onInput={ad.setQ} />
                  </label>
                ) : null}
                <div className="ddh">{tx(ad.head)}</div>
                <div className="ddo" role="listbox" aria-label={ad.l}>
                  {ad.opts.map((o) => (
                    <button key={o.l} className="ddi" role="option" aria-selected="false" onClick={o.go}>
                      <span className="f1 ell"><span>{o.l}</span></span>
                      {o.n ? <span className="fs12 mu num">{o.n}</span> : null}
                    </button>
                  ))}
                  {!ad.opts.length ? <div className="fs12 mu" style={{ padding: "6px 8px" }}>Nothing matches</div> : null}
                </div>
              </div>
            </>
          ) : null}
        </div>
      ))}
    </>
  );
}

/** Show or hide columns; the first column always stays. Remembered on this device. */
export function ColumnsButton({ L, cls = "btn sm" }: { L: L; cls?: string }) {
  return (
    <div className="dd">
      <button className={cls} onClick={L.toggleCols} aria-haspopup="true" aria-expanded={!!L.colsOpen}>
        <Icon className="s14" d="M3 4h18v16H3zM9 4v16M15 4v16" />
        Columns
      </button>
      {L.colsOpen ? (
        <>
          <div className="ddcatch" onClick={L.closeMenus}></div>
          <div className="ddl" style={{ left: "auto", right: "0", width: "240px" }} role="group" aria-label="Columns">
            <div className="ddh">Columns to show · kept on this device</div>
            <div className="ddo" style={{ maxHeight: "320px" }}>
              {L.columns?.filter((c) => c.l).map((c) => (
                <label key={c.l} className="ddi" style={{ cursor: c.locked ? "default" : "pointer" }}>
                  <input type="checkbox" checked={c.on} disabled={c.locked} onChange={c.toggle} />
                  <span className="f1 ell"><span>{c.l}</span></span>
                  {c.locked ? <span className="fs11 mu">Always</span> : null}
                </label>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Saves every row matching the tab, search and filters as a CSV file. */
export function ExportButton({ L, cls = "btn sm" }: { L: L; cls?: string }) {
  return (
    <button className={cls} onClick={L.exportAll} disabled={L.exporting} aria-busy={L.exporting}>
      <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
      {L.exporting ? "Exporting…" : "Export"}
    </button>
  );
}

/** Previous, numbered pages and next. */
export function Pager({ L, pager, style }: { L: L; pager: ListResult["pager"]; style?: React.CSSProperties }) {
  return (
    <div className="pg" style={style}>
      <button aria-label="Previous page" disabled={!pager.previous} onClick={pager.previous ?? undefined}><Icon className="s14" d="M15 6l-6 6 6 6" /></button>
      {(L.pages?.length ? L.pages : [{ n: pager.page, on: true, go: () => undefined }]).map((pg) => (
        <button key={pg.n} className={pg.on ? "on" : ""} aria-current={pg.on ? "page" : undefined} aria-label={`Page ${pg.n}`} onClick={pg.go}>{pg.n}</button>
      ))}
      <button aria-label="Next page" disabled={!pager.next} onClick={pager.next ?? undefined}><Icon className="s14" d="M9 6l6 6-6 6" /></button>
    </div>
  );
}

/** The bar that appears with a selection: how many, what can be done with them, and clear. */
export function BulkBar({ L }: { L: L }) {
  if (!L.bulk) return null;
  return (
    <div className="bulk" role="region" aria-label="Bulk actions">
      <span className="w5 num" style={{ marginRight: "10px" }}>{tx(L.selN)}{" selected"}</span>
      <span style={{ width: "1px", height: "20px", background: "#2A3550", marginRight: "4px" }}></span>
      {L.bulkActs?.map((ba) => (
        <button key={ba.l} onClick={ba.go}><span>{ba.l}</span></button>
      ))}
      <button onClick={L.clearSel} aria-label="Clear selection" className="bx"><Icon className="s14 b" d="M18 6L6 18M6 6l12 12" /></button>
    </div>
  );
}
