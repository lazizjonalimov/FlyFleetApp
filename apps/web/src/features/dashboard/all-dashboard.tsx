"use client";

import { clsx } from "clsx";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { ByCompany } from "./by-company";
import { KpiCards, useKpis, type Period } from "./kpi-cards";
import { QuickActions } from "./quick-actions";
import { TodaysSchedule } from "./schedule";

/**
 * The dashboard across all companies: the same figures, added up across the companies the person can open (each
 * company counted with the person's own role there), today's schedule across them, and a row per company that
 * opens it on this page. Money is never added across companies.
 */
export function AllDashboard() {
  const { can, set } = useConsole();
  const [period, setPeriod] = useState<Period>("today");
  const kpis = useKpis(period);
  const companies = kpis.data?.companies ?? [];
  const updated = kpis.dataUpdatedAt ? new Date(kpis.dataUpdatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div className="scr">
      <div className="ph">
        <div className="f1">
          <nav className="crumb" aria-label="Breadcrumb"><span>Overview</span><Icon className="s12" d="M9 6l6 6-6 6" /><b aria-current="page">Dashboard</b></nav>
          <h1 className="h1"><span>All companies</span></h1>
          <p className="sub"><span>{kpis.isPending ? "Loading…" : `${companies.length} companies · each counted with your role there · updated ${updated}`}</span></p>
        </div>
        <div className="r g8">
          <div className="seg" role="group" aria-label="Period">
            {(["today", "week", "month"] as const).map((each) => (
              <button key={each} type="button" className={clsx(period === each && "on")} onClick={() => setPeriod(each)} aria-pressed={period === each}>{each === "today" ? "Today" : each === "week" ? "This week" : "This month"}</button>
            ))}
          </div>
          {can("loads.create") ? (
            <button type="button" className="btn pri" onClick={() => set(goTo("newload"))}>
              <Icon className="s14 b" d="M12 5v14M5 12h14" />
              New load
            </button>
          ) : null}
        </div>
      </div>
      <QuickActions />
      {kpis.isError ? <div className="banner" data-k="bad" role="alert" style={{ margin: "0 24px 12px" }}><div className="f1">The companies’ figures couldn’t be loaded. Try again in a moment.</div></div> : null}
      <KpiCards kpis={kpis.data?.kpis ?? []} loading={kpis.isPending} />
      {can("dispatch.read") ? <TodaysSchedule /> : null}
      {companies.length ? <ByCompany companies={companies} /> : null}
      <div style={{ height: "24px" }}></div>
    </div>
  );
}
