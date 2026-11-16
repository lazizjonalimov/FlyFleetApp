"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { areaOf, placeOf, SEVERITY_TONE, type Exception } from "@/features/alerts/exceptions";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import { usePreference } from "@/hooks/use-preference";
import { api, unwrap } from "@/lib/api/client";
import { formatNumber } from "@/lib/format/text";

type Seen = Record<string, number>;

/** What is new since someone last looked: kinds they haven't seen, or whose count has grown. */
export function unseen(alerts: Pick<Exception, "code" | "count">[], seen: Seen): Set<string> {
  return new Set(alerts.filter((alert) => alert.count > (seen[alert.code] ?? 0)).map((alert) => alert.code));
}

/** The bell: what needs someone now, worked out live by the API for this person's role. */
export function NotificationsPanel() {
  const { me, can, isNotif, set } = useConsole();
  const [filter, setFilter] = useState<"all" | "high">("all");
  const query = useQuery({ queryKey: [me.organization.id, "dashboard", "exceptions"], queryFn: () => unwrap(api.GET("/api/v1/dashboard/exceptions")), enabled: can("dashboard.read"), refetchInterval: 60_000 });
  const [seen, setSeen] = usePreference<Seen>("notifications.seen", {});
  if (!isNotif) return null;
  const alerts = query.data ?? [];
  const fresh = unseen(alerts, seen);
  const shown = alerts.filter((alert) => filter === "all" || alert.severity === "high");
  const markRead = () => setSeen(Object.fromEntries(alerts.map((alert) => [alert.code, alert.count])));

  return (
    <div className="notif" role="dialog" aria-label="Notifications">
      <div className="r g8" style={{ padding: "12px 14px 8px" }}>
        <span className="h2">Notifications</span>
        {fresh.size ? <span className="cnt" data-k="bad">{fresh.size}</span> : null}
        <span className="sp"></span>
        <button className="lnk" onClick={markRead} disabled={!fresh.size}>Mark all read</button>
      </div>
      <div className="seg sm" style={{ margin: "0 14px 8px", alignSelf: "flex-start" }}>
        <button className={clsx(filter === "all" && "on")} onClick={() => setFilter("all")}>All</button>
        <button className={clsx(filter === "high" && "on")} onClick={() => setFilter("high")}>High</button>
      </div>
      <div style={{ maxHeight: "520px", overflow: "auto", borderTop: "1px solid var(--bd2)" }}>
        {query.isPending ? <div className="cb fs13 mu">Checking…</div> : null}
        {query.isError ? <div className="cb fs13 tc" data-k="bad">Couldn’t check. It will try again in a minute.</div> : null}
        {query.data && !shown.length ? (
          <div className="cb c g4" style={{ alignItems: "center", textAlign: "center", padding: "24px 16px" }}>
            <Icon className="s18 tc" d={I.check} />
            <span className="fs13 w5">Nothing needs you right now</span>
            <span className="fs12 mu">Late loads, expired paperwork, overdue invoices and urgent repairs show up here.</span>
          </div>
        ) : null}
        {shown.map((alert) => {
          const target = placeOf(alert);
          return (
            <button
              key={alert.code}
              className={clsx("nti", fresh.has(alert.code) && "un")}
              onClick={() => {
                setSeen({ ...seen, [alert.code]: alert.count });
                if (target) set(target);
              }}
            >
              <span className="chn" data-k={SEVERITY_TONE[alert.severity] ?? "mu"} style={{ width: "28px", height: "28px" }}><Icon className="s14" d={alert.severity === "high" ? I.alert : I.clock} /></span>
              <span className="f1 c g2">
                <span className="fs13 w5 tx"><span>{`${formatNumber(alert.count)} · ${alert.title}`}</span></span>
                <span className="fs12 t3"><span>{alert.detail}</span></span>
                <span className="fs11 mu"><span>{areaOf(alert)}</span></span>
              </span>
              {fresh.has(alert.code) ? <span className="dot" data-k="brand" style={{ marginTop: "6px" }}></span> : null}
            </button>
          );
        })}
      </div>
      <div className="r" style={{ padding: "10px 14px", borderTop: "1px solid var(--bd2)" }}>
        <button className="lnk" onClick={() => set({ ...goTo("settings"), setpage: "notifications" })}>Notification settings</button>
        <span className="sp"></span>
        <button className="lnk" onClick={() => set(goTo("alerts"))}>All alerts</button>
      </div>
    </div>
  );
}
