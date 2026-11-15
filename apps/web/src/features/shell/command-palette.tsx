"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Search and actions, opened with ⌘K. */
export function CommandPalette() {
  const { isPalette, closeOverlay, PL } = useConsole();
  if (!isPalette) return null;
  return (
    <>
      <div className="scrim" onClick={closeOverlay} style={{ zIndex: "40" }}></div>
      <div className="pal" role="dialog" aria-label="Search everything">
        <div className="palin">
          <Icon className="s18 mu" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
          <input defaultValue="248" aria-label="Search everything" />
          <span className="kbd">esc</span>
        </div>
        <div className="palbody">
          {PL.groups.map((g, i) => (
            <Fragment key={i}>
              <div className="palg"><span>{g.l}</span></div>
              {g.items.map((it, i2) => (
                <button key={i2} className={clsx("pali", it.on)} onClick={it.go}>
                  <span className="paic"><Icon className="s14" d={it.ic} /></span>
                  <span className="f1 c">
                    <span className="fs13 w5 tx ell"><span>{it.t}</span></span>
                    <span className="fs12 mu ell"><span>{it.s}</span></span>
                  </span>
                  {it.badge ? (
                    <span className="badge" data-k={it.k}>
                      <i></i>
                      <span>{it.badge}</span>
                    </span>
                  ) : null}
                  {it.kbd ? (
                    <span className="kbd"><span>{it.kbd}</span></span>
                  ) : null}
                </button>
              ))}
            </Fragment>
          ))}
        </div>
        <div className="palf">
          <span className="r g4">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>
            move
          </span>
          <span className="r g4">
            <span className="kbd">↵</span>
            open
          </span>
          <span className="sp"></span>
          <span><span>{PL.foot}</span></span>
        </div>
      </div>
    </>
  );
}
