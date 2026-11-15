"use client";

import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Notifications popover. */
export function NotificationsPanel() {
  const { isNotif, NT } = useConsole();
  if (!isNotif) return null;
  return (
    <div className="notif" role="dialog" aria-label="Notifications">
      <div className="r g8" style={{ padding: "12px 14px 8px" }}>
        <span className="h2">Notifications</span>
        <span className="cnt" data-k="bad">5</span>
        <span className="sp"></span>
        <button className="lnk">Mark all read</button>
      </div>
      <div className="seg sm" style={{ margin: "0 14px 8px", alignSelf: "flex-start" }}>
        <button className="on">All</button>
        <button>For me</button>
        <button>Alerts</button>
      </div>
      <div style={{ maxHeight: "520px", overflow: "auto", borderTop: "1px solid var(--bd2)" }}>
        {NT.map((n, i) => (
          <button key={i} className={clsx("nti", n.un)} onClick={n.go}>
            <span className="chn" data-k={n.k} style={{ width: "28px", height: "28px" }}><Icon className="s14" d={n.ic} /></span>
            <span className="f1 c g2">
              <span className="fs13 w5 tx"><span>{n.t}</span></span>
              <span className="fs12 t3"><span>{n.b}</span></span>
              <span className="fs11 mu num"><span>{n.when}</span></span>
            </span>
            {n.un ? (
              <span className="dot" data-k="brand" style={{ marginTop: "6px" }}></span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="r" style={{ padding: "10px 14px", borderTop: "1px solid var(--bd2)" }}>
        <button className="lnk">Notification settings</button>
        <span className="sp"></span>
        <span className="fs11 mu">{"Telegram & email follow your preferences"}</span>
      </div>
    </div>
  );
}
