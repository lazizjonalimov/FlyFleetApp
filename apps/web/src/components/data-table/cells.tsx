"use client";

import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { tx } from "@/features/console/dom";
import { type Cell } from "@/features/console/view";

/** A table cell of any kind, including record links and row actions. */
export function DataCell({ c }: { c: Cell }) {
  return (
    <div className={clsx("td", c.al)}>
      {c.isTx ? (
        <div className="mw0">
          <div className={clsx("ell", c.cls)}>{tx(c.v)}</div>
          {c.s ? (
            <div className={clsx("sub2 ell", c.scls)}><span>{c.s}</span></div>
          ) : null}
        </div>
      ) : null}
      {c.isId ? (
        <div className="mw0">
          <button className={clsx("idl", c.idc)} onClick={c.go}>{tx(c.v)}</button>
          {c.s ? (
            <div className="sub2 ell">{tx(c.s)}</div>
          ) : null}
        </div>
      ) : null}
      {c.isBadge ? (
        <span className="badge" data-k={c.k}>
          <i></i>
          {tx(c.v)}
        </span>
      ) : null}
      {c.isRisk ? (
        <span className="risk" data-k={c.k}>
          <Icon className="s14" d={c.ic} />
          <span className="ell">{tx(c.v)}</span>
        </span>
      ) : null}
      {c.isP ? (
        <div className="r g8">
          <span className="av sm" data-k={c.k}>
            {tx(c.ini)}
            {c.k ? (
              <span className="pres"></span>
            ) : null}
          </span>
          <div className="mw0">
            <div className="ell">{tx(c.v)}</div>
            {c.s ? (
              <div className="sub2 ell"><span>{c.s}</span></div>
            ) : null}
          </div>
        </div>
      ) : null}
      {c.isM ? (
        <div>
          <div className={clsx("mono w5 num", c.cls)}>{tx(c.v)}</div>
          {c.s ? (
            <div className="sub2 mono"><span>{c.s}</span></div>
          ) : null}
        </div>
      ) : null}
      {c.isBar ? (
        <div className="r g8">
          <span className="bar" data-k={c.k}><span style={{ width: c.pct }}></span></span>
          <span className="fs12 num t3 nw">{tx(c.v)}</span>
        </div>
      ) : null}
      {c.isDots ? (
        <div className="r g6">
          <span className="r g2">
            {c.dots?.map((d, i) => (
              <span key={i} className="qd" data-k={d}></span>
            ))}
          </span>
          <span className="fs12 tc w5 ell" data-k={c.k}>{tx(c.v)}</span>
        </div>
      ) : null}
      {c.isTags ? (
        <div className="r g4">
          {c.tags?.map((t, i) => (
            <span key={i} className="tag" data-k={t.k}><span>{t.v}</span></span>
          ))}
        </div>
      ) : null}
      {c.isDocs ? (
        <div className="r g6">
          <span className="docs">
            {c.bars?.map((b, i) => (
              <i key={i} data-k={b}></i>
            ))}
          </span>
          <span className="mono fs12 tc w5" data-k={c.k}>{tx(c.v)}</span>
        </div>
      ) : null}
      {c.isCh ? (
        <div className="r g4">
          {c.ch?.map((h, i) => (
            <span key={i} className="chn" data-k={h.k} title={h.t}><Icon className="s12" d={h.ic} /></span>
          ))}
        </div>
      ) : null}
      {c.isBtn ? (
        <button className={clsx("btn xs", c.cls)} onClick={c.go}>{tx(c.v)}</button>
      ) : null}
      {c.isChk ? (
        <button className={clsx("chk", c.on)} onClick={c.go} aria-label="Select row">
          {c.on ? (
            <Icon className="s12 b" d="M5 12l5 5 9-10" />
          ) : null}
        </button>
      ) : null}
      {c.isActs ? (
        <div className="acts5">
          {c.acts?.map((a, i) => (
            <button key={i} className={clsx("btn xs", a.cls)} onClick={a.go}><span>{a.l}</span></button>
          ))}
        </div>
      ) : null}
      {c.isMore ? (
        <button className="btn ghost icon xs" aria-label="Row actions"><Icon className="dots" d="M5 12h.01M12 12h.01M19 12h.01" /></button>
      ) : null}
    </div>
  );
}

/** A table cell of any kind. */
export function BasicCell({ c }: { c: Cell }) {
  return (
    <div className={clsx("td", c.al)}>
      {c.isTx ? (
        <div className="mw0">
          <div className={clsx("ell", c.cls)}>{tx(c.v)}</div>
          {c.s ? (
            <div className={clsx("sub2 ell", c.scls)}><span>{c.s}</span></div>
          ) : null}
        </div>
      ) : null}
      {c.isId ? (
        <div className="mw0">
          <button className="idl" onClick={c.go}>{tx(c.v)}</button>
          {c.s ? (
            <div className="sub2 ell"><span>{c.s}</span></div>
          ) : null}
        </div>
      ) : null}
      {c.isBadge ? (
        <span className="badge" data-k={c.k}>
          <i></i>
          {tx(c.v)}
        </span>
      ) : null}
      {c.isRisk ? (
        <span className="risk" data-k={c.k}>
          <Icon className="s14" d={c.ic} />
          <span className="ell">{tx(c.v)}</span>
        </span>
      ) : null}
      {c.isP ? (
        <div className="r g8">
          <span className="av sm" data-k={c.k}>
            {tx(c.ini)}
            {c.k ? (
              <span className="pres"></span>
            ) : null}
          </span>
          <div className="mw0">
            <div className="ell">{tx(c.v)}</div>
            {c.s ? (
              <div className="sub2 ell">{tx(c.s)}</div>
            ) : null}
          </div>
        </div>
      ) : null}
      {c.isM ? (
        <div>
          <div className={clsx("mono w5 num", c.cls)}>{tx(c.v)}</div>
          {c.s ? (
            <div className="sub2 mono"><span>{c.s}</span></div>
          ) : null}
        </div>
      ) : null}
      {c.isBar ? (
        <div className="r g8">
          <span className="bar" data-k={c.k}><span style={{ width: c.pct }}></span></span>
          <span className="fs12 num t3 nw">{tx(c.v)}</span>
        </div>
      ) : null}
      {c.isDots ? (
        <div className="r g6">
          <span className="r g2">
            {c.dots?.map((d, i) => (
              <span key={i} className="qd" data-k={d}></span>
            ))}
          </span>
          <span className="fs12 tc w5 ell" data-k={c.k}>{tx(c.v)}</span>
        </div>
      ) : null}
      {c.isTags ? (
        <div className="r g4">
          {c.tags?.map((t, i) => (
            <span key={i} className="tag" data-k={t.k}><span>{t.v}</span></span>
          ))}
        </div>
      ) : null}
      {c.isDocs ? (
        <div className="r g6">
          <span className="docs">
            {c.bars?.map((b, i) => (
              <i key={i} data-k={b}></i>
            ))}
          </span>
          <span className="mono fs12 tc w5" data-k={c.k}>{tx(c.v)}</span>
        </div>
      ) : null}
      {c.isCh ? (
        <div className="r g4">
          {c.ch?.map((h, i) => (
            <span key={i} className="chn" data-k={h.k} title={h.t}><Icon className="s12" d={h.ic} /></span>
          ))}
        </div>
      ) : null}
      {c.isBtn ? (
        <button className={clsx("btn xs", c.cls)} onClick={c.go}>{tx(c.v)}</button>
      ) : null}
      {c.isChk ? (
        <button className={clsx("chk", c.on)} onClick={c.go} aria-label="Select row">
          {c.on ? (
            <Icon className="s12 b" d="M5 12l5 5 9-10" />
          ) : null}
        </button>
      ) : null}
      {c.isMore ? (
        <button className="btn ghost icon xs" aria-label="Row actions"><Icon className="dots" d="M5 12h.01M12 12h.01M19 12h.01" /></button>
      ) : null}
    </div>
  );
}
