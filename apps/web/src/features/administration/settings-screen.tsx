"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Problem } from "@/components/feedback/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import { api, unwrap } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";

type Organization = Schema<"OrganizationOut">;
type Page = "organization" | "numbering" | "notifications" | "policy" | "integrations" | "retention" | "billing";

const NAV: { l: string; ic: string; page?: Page; screen?: string }[] = [
  { l: "Organization", ic: I.building, page: "organization" },
  { l: "Team & access", ic: I.team, screen: "team" },
  { l: "Dispatch teams", ic: I.truck, screen: "teams" },
  { l: "Notifications", ic: I.bell, page: "notifications" },
  { l: "Fleet alert policies", ic: I.alert, page: "policy" },
  { l: "Integrations", ic: I.link, page: "integrations" },
  { l: "Numbering & formats", ic: I.sliders, page: "numbering" },
  { l: "Data & retention", ic: I.history, page: "retention" },
  { l: "Billing & plan", ic: I.dollar, page: "billing" },
  { l: "Audit log", ic: I.history, screen: "audit" },
];
const SUB: Record<Page, string> = {
  organization: "The company’s legal details, contact and time zone",
  numbering: "How loads and invoices are numbered",
  notifications: "Who is told what, and how",
  policy: "When a fleet event becomes an alert, and who is told",
  integrations: "Telematics, fuel cards, accounting and messaging providers",
  retention: "How long records and documents are kept",
  billing: "Your FlyFleet subscription",
};

type Form = Record<string, string>;
const FIELDS: { k: keyof Organization & string; l: string; span: number; hint?: string; mono?: boolean }[] = [
  { k: "name", l: "Company name", span: 3 },
  { k: "legal_name", l: "Legal name", span: 3 },
  { k: "dot_number", l: "USDOT number", span: 2, mono: true },
  { k: "mc_number", l: "MC number", span: 2, mono: true },
  { k: "timezone", l: "Time zone", span: 2, hint: "“Today” on every screen is today here", mono: true },
  { k: "phone", l: "Phone", span: 2 },
  { k: "email", l: "Billing email", span: 4 },
  { k: "address", l: "Address", span: 3 },
  { k: "city", l: "City", span: 1 },
  { k: "state", l: "State", span: 1, mono: true },
  { k: "postal_code", l: "ZIP", span: 1, mono: true },
];
const NUMBERING: { k: keyof Organization & string; l: string; span: number; hint?: string; mono?: boolean }[] = [
  { k: "load_number_prefix", l: "Load number prefix", span: 2, mono: true, hint: "Loads are numbered like L-1001" },
  { k: "invoice_number_prefix", l: "Invoice number prefix", span: 2, mono: true, hint: "Invoices are numbered like INV-1001" },
  { k: "default_payment_terms_days", l: "Default payment terms (days)", span: 2, mono: true, hint: "For new customers" },
];

/** The organization form: shown with the record's values, saved as one change. */
function OrganizationForm({ organization, fields }: { organization: Organization; fields: typeof FIELDS }) {
  const { can } = useConsole();
  const act = useAction();
  const start: Form = Object.fromEntries(fields.map((field) => [field.k, String(organization[field.k] ?? "")]));
  const [values, setValues] = useState<Form>(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const changed = fields.filter((field) => values[field.k] !== start[field.k]);
  const editable = can("organization.manage");

  async function save() {
    setPending(true);
    setProblem(null);
    setErrors({});
    const body = Object.fromEntries(changed.map((field) => [field.k, field.k === "default_payment_terms_days" ? (values[field.k] ? Number(values[field.k]) : null) : values[field.k]!.trim() || null]));
    try {
      await unwrap(api.PATCH("/api/v1/organization", { body }));
      await act(async () => undefined, "Company settings saved");
    } catch (error) {
      setErrors(error instanceof ApiError ? error.fieldErrors : {});
      setProblem(errorMessage(error));
    }
    setPending(false);
  }

  return (
    <section className="card oh" style={{ maxWidth: "860px" }}>
      <div className="cb c g12">
        <Problem message={problem} />
        <div className="sgrid" style={{ padding: "0" }}>
          {fields.map((field) => (
            <div key={field.k} className="fld" style={{ gridColumn: `span ${field.span}` }}>
              <label htmlFor={`org-${field.k}`}>{field.l}</label>
              <input id={`org-${field.k}`} className={clsx("inp", field.mono && "mono", errors[field.k] && "err")} value={values[field.k] ?? ""} disabled={!editable} onChange={(event) => setValues({ ...values, [field.k]: event.target.value })} />
              {errors[field.k] ? <span className="errt">{errors[field.k]}</span> : field.hint ? <span className="hint">{field.hint}</span> : null}
            </div>
          ))}
        </div>
      </div>
      {editable ? (
        <div className="savebar">
          <span className="dot" data-k={changed.length ? "warn" : "ok"}></span>
          <span className="fs13">{changed.length ? <b>{`${changed.length} unsaved ${changed.length === 1 ? "change" : "changes"}`}</b> : "Saved"}</span>
          <span className="sp"></span>
          <button className="btn" onClick={() => setValues(start)} disabled={!changed.length || pending}>Discard</button>
          <button className="btn pri" onClick={() => void save()} disabled={!changed.length || pending}>{pending ? "Saving…" : "Save"}</button>
        </div>
      ) : null}
    </section>
  );
}

/** Settings: the company, and how FlyFleet works for it. */
export function SettingsScreen() {
  const { me, state, set, screen } = useConsole();
  const org = me.organization.id;
  const page: Page = screen === "policy" ? "policy" : typeof state.setpage === "string" && state.setpage in SUB && state.setpage !== "policy" ? (state.setpage as Page) : "integrations";
  const organization = useQuery({ queryKey: [org, "organization"], queryFn: () => unwrap(api.GET("/api/v1/organization")), staleTime: 300_000 });
  const label = NAV.find((item) => item.page === page)?.l ?? "Settings";
  const go = (item: (typeof NAV)[number]) => {
    if (item.screen) return set(goTo(item.screen));
    if (item.page === "policy") return set({ ...goTo("policy"), setpage: "policy" });
    set({ ...(screen === "settings" ? {} : goTo("settings")), setpage: item.page });
  };

  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "14px", borderBottom: "1px solid var(--bd)" }}>
        <div className="f1">
          <div className="crumb">
            <span>Administration</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <span>Settings</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b><span>{label}</span></b>
          </div>
          <h1 className="h1"><span>{label}</span></h1>
          <p className="sub"><span>{SUB[page]}</span></p>
        </div>
      </div>
      <div className="stg">
        <nav className="stnav" aria-label="Settings sections">
          {NAV.map((item) => (
            <button key={item.l} className={clsx("rci", item.page === page && "on")} onClick={() => go(item)} aria-current={item.page === page ? "page" : undefined}>
              <Icon className="s14" d={item.ic} />
              <span className="f1 ell"><span>{item.l}</span></span>
            </button>
          ))}
        </nav>
        <div style={{ overflow: "auto", minHeight: "0", padding: "20px 24px 24px" }}>
          {page === "organization" || page === "numbering" ? (
            organization.data ? (
              <OrganizationForm key={`${page}-${organization.dataUpdatedAt}`} organization={organization.data} fields={page === "organization" ? FIELDS : NUMBERING} />
            ) : organization.isError ? (
              <ErrorState error={organization.error} retry={() => void organization.refetch()} />
            ) : (
              <Skeleton />
            )
          ) : null}
          {page === "integrations" ? (
            <EmptyState icon={I.link} title="No integrations connected" text="Telematics, fuel cards, accounting and messaging providers aren’t available to connect yet. Everything in FlyFleet works without them: loads, check calls, fuel and documents are entered here." />
          ) : null}
          {page === "policy" ? (
            <EmptyState icon={I.alert} title="No alert policies yet" text="Fleet alerts are worked out by FlyFleet from loads, dates and work orders — late or at-risk loads, expired paperwork, urgent repairs. Custom policies, such as speeding thresholds, need a telematics connection." />
          ) : null}
          {page === "notifications" ? <EmptyState icon={I.bell} title="Notifications aren’t sent yet" text="What needs attention shows under the bell and on the dashboard for each role. Email and text notifications aren’t available yet." /> : null}
          {page === "retention" ? <EmptyState icon={I.history} title="Everything is kept" text="Records, documents and the audit log are kept for as long as the company exists. Retention rules aren’t configurable yet." /> : null}
          {page === "billing" ? <EmptyState icon={I.dollar} title="Billing isn’t set up here yet" text="Your FlyFleet subscription isn’t managed in the app yet." /> : null}
        </div>
      </div>
    </div>
  );
}
