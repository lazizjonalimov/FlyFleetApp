"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { CompanyMark } from "@/features/shell/company-mark";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatMoney } from "@/lib/format/money";
import { formatNumber } from "@/lib/format/text";

type Summary = Schema<"DashboardSummary">;
type Company = { id: string; code: string; name: string; slug: string; color: string };
type Combined = { by_company: { organization: Company; data: Summary }[]; totals: Record<string, number> };

/**
 * The dashboard across all companies: what can be added up is added up (counts of loads, drivers, trucks), with
 * each company's share beside it. Money is shown company by company in that company's own currency and is never
 * added together. Each company's figures are what the person's role in it allows.
 */
export function AllDashboard() {
  const { me } = useConsole();
  const router = useRouter();
  const summary = useQuery({
    queryKey: [me.organization.id, "dashboard", "summary"],
    queryFn: () => unwrap(api.GET("/api/v1/dashboard/summary")) as unknown as Promise<Combined>,
    refetchInterval: 60_000,
  });
  const rows = summary.data?.by_company ?? [];
  const sum = (pick: (s: Summary) => number | undefined) => rows.reduce((n, r) => n + (pick(r.data) ?? 0), 0);
  const totals: { label: string; value: number; of: (s: Summary) => number | undefined }[] = [
    { label: "Loads in progress", value: sum((s) => s.loads?.active), of: (s) => s.loads?.active },
    { label: "In transit", value: sum((s) => s.loads?.in_transit), of: (s) => s.loads?.in_transit },
    { label: "Unassigned", value: sum((s) => s.loads?.unassigned), of: (s) => s.loads?.unassigned },
    { label: "At risk", value: sum((s) => s.loads?.at_risk), of: (s) => s.loads?.at_risk },
    { label: "Active drivers", value: sum((s) => s.fleet?.drivers_active), of: (s) => s.fleet?.drivers_active },
    { label: "Active trucks", value: sum((s) => s.fleet?.trucks_active), of: (s) => s.fleet?.trucks_active },
  ];
  const open = (slug: string) => router.push(`/${slug}/dashboard`);

  return (
    <div className="scr">
      <div className="ph">
        <div className="f1">
          <div className="crumb"><span>Overview</span><Icon className="s12" d="M9 6l6 6-6 6" /><b>All companies</b></div>
          <h1 className="h1"><span>All companies</span></h1>
          <p className="sub"><span>{summary.isPending ? "Loading…" : `${rows.length} companies · each shows what your role there allows`}</span></p>
        </div>
      </div>
      {summary.isError ? <div className="banner" data-k="bad" role="alert" style={{ margin: "0 24px" }}><div className="f1">The companies’ figures could not be loaded. Try again in a moment.</div></div> : null}
      <div className="kpis" style={{ margin: "0 24px", gridTemplateColumns: "repeat(6,minmax(0,1fr))" }}>
        {totals.map((t) => (
          <div key={t.label} className="kpi">
            <span className="kl"><span>{t.label}</span></span>
            <span className="kv"><span>{summary.data ? formatNumber(t.value) : "—"}</span></span>
            <span className="cobreak" style={{ marginTop: 4 }}>
              {rows.map((r) => (t.of(r.data) === undefined ? null : (
                <span key={r.organization.id} className="cobi" style={{ padding: "1px 6px 1px 1px" }}><CompanyMark code={r.organization.code} color={r.organization.color} logo={(r.organization as { logo_url?: string | null }).logo_url} size={16} />{formatNumber(t.of(r.data) ?? 0)}</span>
              )))}
            </span>
          </div>
        ))}
      </div>
      <div className="c g12" style={{ margin: "16px 24px" }}>
        {rows.map(({ organization: o, data: s }) => (
          <button key={o.id} className="card" onClick={() => open(o.slug)} style={{ textAlign: "left", padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
            <CompanyMark code={o.code} color={o.color} logo={(o as { logo_url?: string | null }).logo_url} size={36} />
            <span className="f1 c">
              <span className="fs14 w6">{o.name}</span>
              <span className="fs12 mu">
                {[s.loads ? `${formatNumber(s.loads.active)} loads in progress` : "", s.fleet ? `${formatNumber(s.fleet.trucks_active)} trucks` : "", s.fleet ? `${formatNumber(s.fleet.drivers_active)} drivers` : ""].filter(Boolean).join(" · ") || "Nothing your role can see here"}
              </span>
            </span>
            {s.receivables ? (
              <span className="c" style={{ textAlign: "right" }}>
                <span className="fs12 mu">Open receivables</span>
                <span className="fs14 w6 num">{formatMoney(s.receivables.open_balance, s.receivables.currency)}</span>
              </span>
            ) : null}
            {s.revenue ? (
              <span className="c" style={{ textAlign: "right" }}>
                <span className="fs12 mu">Revenue this month</span>
                <span className="fs14 w6 num">{formatMoney(s.revenue.this_month, s.revenue.currency)}</span>
              </span>
            ) : null}
          </button>
        ))}
        {summary.data && !rows.length ? <p className="fs13 mu">None of your companies has anything to show yet.</p> : null}
      </div>
    </div>
  );
}
