"use client";

import { clsx } from "clsx";
import { useRef, useState, type CSSProperties } from "react";
import { CompanyMark } from "@/features/shell/company-mark";
import { Icon } from "@/components/ui/icon";
import { tx } from "@/features/console/dom";
import { type Cell } from "@/features/console/view";

const DOTS = "M5 12h.01M12 12h.01M19 12h.01";

/**
 * A row's "⋯" menu. It is placed against the window, not the table, so a scrolling table never clips it, and
 * it opens upwards when there is no room below. A click inside it never opens the row.
 */
function RowMenu({ items }: { items: NonNullable<Cell["menu"]> }) {
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<CSSProperties | null>(null);
  const width = 220;
  const toggle = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    if (at) return setAt(null);
    const box = button.current?.getBoundingClientRect();
    if (!box) return;
    const tall = items.length * 34 + 12;
    const below = box.bottom + 4 + tall <= window.innerHeight;
    setAt({ position: "fixed", width: `${width}px`, minWidth: 0, left: `${Math.max(8, box.right - width)}px`, ...(below ? { top: `${box.bottom + 4}px` } : { top: "auto", bottom: `${window.innerHeight - box.top + 4}px` }) });
  };
  return (
    <div className="dd" onClick={(event) => event.stopPropagation()}>
      <button ref={button} className="btn ghost icon xs" aria-label="Row actions" aria-haspopup="menu" aria-expanded={!!at} onClick={toggle}>
        <Icon className="dots" d={DOTS} />
      </button>
      {at ? (
        <>
          <div className="ddcatch" onClick={() => setAt(null)}></div>
          <div className="ddl" role="menu" style={at} ref={(menu) => menu?.querySelector<HTMLButtonElement>(".ddi")?.focus()} onKeyDown={(event) => { if (event.key === "Escape") { setAt(null); button.current?.focus(); } }}>
            <div className="ddo" style={{ maxHeight: "none", paddingTop: "4px" }}>
              {items.map((item) => (
                <button key={item.l} className={clsx("ddi", item.cls)} role="menuitem" onClick={() => { setAt(null); item.go(); }}>{item.l}</button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function More({ c }: { c: Cell }) {
  if (c.menu) return c.menu.length ? <RowMenu items={c.menu} /> : null;
  return <button className="btn ghost icon xs" aria-label="Row actions"><Icon className="dots" d={DOTS} /></button>;
}

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
      {c.isCo && c.co ? (
        <div className="r g8" style={{ alignItems: "center", minWidth: 0 }}>
          <CompanyMark code={c.co.code} color={c.co.color} logo={c.co.logo} size={22} />
          <div className="ell">{tx(c.v)}</div>
        </div>
      ) : null}
      {c.isId ? (
        <div className="mw0">
          <button className={clsx("idl", c.idc)} onClick={c.go}>{c.pre ? <span className="ccode">{c.pre}</span> : null}{tx(c.v)}</button>
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
        <div className="mw0">
          <span className="risk" data-k={c.k}>
            <Icon className="s14" d={c.ic} />
            <span className="ell">{tx(c.v)}</span>
          </span>
          {c.s ? <div className="sub2 ell" title={c.s}>{tx(c.s)}</div> : null}
        </div>
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
      {c.isMore ? <More c={c} /> : null}
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
        <div className="mw0">
          <span className="risk" data-k={c.k}>
            <Icon className="s14" d={c.ic} />
            <span className="ell">{tx(c.v)}</span>
          </span>
          {c.s ? <div className="sub2 ell" title={c.s}>{tx(c.s)}</div> : null}
        </div>
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
      {c.isMore ? <More c={c} /> : null}
    </div>
  );
}
