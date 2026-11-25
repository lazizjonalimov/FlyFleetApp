"use client";

import { useConsole } from "@/features/console/console-provider";
import { CompanyMark } from "@/features/shell/company-mark";
import { useSwitchCompany } from "@/features/shell/company-switch";
import { formatNumber } from "@/lib/format/text";
import type { CompanyKpis } from "./kpi-cards";

/**
 * All companies: one row per company the person can open, with the figures that need someone. A row moves to that
 * company on the same page. Overdue invoices show only for roles with finance access.
 */
export function ByCompany({ companies }: { companies: CompanyKpis[] }) {
  const { can, me } = useConsole();
  const switchTo = useSwitchCompany();
  const finance = can("invoices.read");
  const mcOf = new Map(me.memberships.map((m) => [m.id, m.mc_number]));
  const cols = finance ? "minmax(0,2fr) repeat(5,minmax(0,1fr))" : "minmax(0,2fr) repeat(4,minmax(0,1fr))";
  const of = (c: CompanyKpis, key: string) => c.data.kpis.find((k) => k.key === key);
  const num = (c: CompanyKpis, key: string) => {
    const k = of(c, key);
    return k ? formatNumber(k.value) : "—";
  };
  const ratio = (c: CompanyKpis, key: string) => {
    const k = of(c, key);
    return k ? `${formatNumber(k.value)} / ${formatNumber(k.total ?? 0)}` : "—";
  };
  return (
    <section className="card oh" style={{ margin: "16px 24px 0" }} aria-labelledby="ff-byco">
      <div className="ch">
        <h2 id="ff-byco" className="h2">By company</h2>
        <span className="tag" data-k="brand">All companies</span>
        <span className="sp"></span>
        <span className="fs12 mu">Choose a company to open it on this page</span>
      </div>
      <div className="bycohead" style={{ gridTemplateColumns: cols }} aria-hidden="true">
        <span>Company</span><span>Unassigned</span><span>Late or at risk</span><span>Drivers free</span><span>Trucks down</span>{finance ? <span>Overdue</span> : null}
      </div>
      <ul>
        {companies.map((c) => (
          <li key={c.organization.id}>
            <button type="button" className="bycoline" style={{ gridTemplateColumns: cols }} onClick={() => void switchTo({ id: c.organization.id, slug: c.organization.slug, name: c.organization.name })}
              aria-label={`${c.organization.name}: ${num(c, "unassigned")} unassigned, ${num(c, "late_or_at_risk")} late or at risk, drivers free ${ratio(c, "drivers_available")}, trucks down ${ratio(c, "trucks_unavailable")}${finance ? `, ${num(c, "overdue_invoices")} overdue invoices` : ""}. Open this company.`}>
              <span className="r g8" style={{ minWidth: 0 }}>
                <CompanyMark code={c.organization.code} color={c.organization.color} logo={c.organization.logo_url} size={28} />
                <span className="c" style={{ minWidth: 0 }}>
                  <span className="w5 ell">{c.organization.name}</span>
                  <span className="fs12 mu mono">{mcOf.get(c.organization.id) ?? "No MC number"}</span>
                </span>
              </span>
              <span className="num">{num(c, "unassigned")}</span>
              <span className="num">{num(c, "late_or_at_risk")}</span>
              <span className="num">{ratio(c, "drivers_available")}</span>
              <span className="num">{ratio(c, "trucks_unavailable")}</span>
              {finance ? <span className="num">{num(c, "overdue_invoices")}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
