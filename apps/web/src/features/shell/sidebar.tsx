"use client";

import { clsx } from "clsx";
import { Logo, LogoMark } from "@/components/layout/logo";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { CompanySwitcher } from "./company-switcher";

/** Main navigation, grouped by area, with the organization switcher at the foot. */
export function Sidebar() {
  const { nav, I } = useConsole();
  return (
    <aside className="sb" aria-label="Main navigation">
      <div className="logo">
        <span className="lk"><Logo height={40} /></span>
        <span className="lkm"><LogoMark size={32} /></span>
      </div>
      <nav className="nav">
        {nav.map((g, i) => (
          <div key={i} className="c" style={{ gap: "1px" }}>
            <div className="navg"><span>{g.label}</span></div>
            {g.items.map((it, i2) => (
              <button key={i2} className={clsx("navi", it.cls)} onClick={it.go} aria-current={it.cur} aria-label={it.aria} title={it.tip}>
                <Icon d={it.d} />
                <span className="f1 ell"><span>{it.label}</span></span>
                {it.count ? (
                  <span className={clsx("navc", it.hot)}><span>{it.count}</span></span>
                ) : null}
                {it.locked ? (
                  <Icon className="s12" d={I.lock} />
                ) : null}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="sbf">
        <CompanySwitcher />
      </div>
    </aside>
  );
}
