"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useId, useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { SettingsFrame } from "@/features/administration/settings-frame";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { ConsolePortal } from "@/features/console/portal";
import { goTo } from "@/features/console/shell";
import { CompanyMark } from "@/features/shell/company-mark";
import { useSwitchCompany } from "@/features/shell/company-switch";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { postJson } from "@/lib/api/post";
import { activeAgo } from "@/lib/format/devices";
import { formatNumber, plural } from "@/lib/format/text";
import { AddCompanyDialog } from "./add-company";
import { COMPANIES_KEY, useMyCompanies, type MyCompanies, type MyCompany } from "./use-companies";

type Tab = "active" | "invitations" | "archived";
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const opened = (iso: string | null | undefined) => (iso ? activeAgo(iso).replace("Active now", "Just now") : "Not yet");

/**
 * Settings › Account › Companies: every company your profile can open (up to ten), invitations waiting for you,
 * and archived companies. Personal: every role can open it. What you can do to a company depends on your role in
 * that company, and the API checks it again.
 */
export function CompaniesScreen() {
  const { state, set, me } = useConsole();
  const query = useMyCompanies();
  const [adding, setAdding] = useState(false);
  const data = query.data;
  const full = data ? data.used >= data.limit : false;
  const tab: Tab = state.cotab === "invitations" || state.cotab === "archived" ? state.cotab : "active";

  return (
    <SettingsFrame current="account" title="Companies" trail={["Administration", "Settings", "Account", "Companies"]}
      sub="One profile runs up to 10 companies. Switch between them, add one, or leave one. Each company’s data stays separate."
      actions={<button type="button" className="btn pri" onClick={() => setAdding(true)} disabled={!data || full} title={full ? "You’re at the limit of 10 companies" : undefined}><Icon className="s14" d={I.plus} />Add a company</button>}>
      {data ? (
        <div className="c g16" style={{ maxWidth: "1080px" }}>
          <Summary data={data} />
          <div className="tabs" role="tablist" aria-label="Companies">
            {([["active", "Active", data.companies.filter((c) => c.status === "active").length], ["invitations", "Invitations", data.invitations.length], ["archived", "Archived", data.companies.filter((c) => c.status !== "active").length]] as const).map(([key, label, n]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={clsx("tab", tab === key && "on")} onClick={() => set({ cotab: key })}>
                <span>{label}</span>
                <span className="tcnt"><span>{n}</span></span>
              </button>
            ))}
          </div>
          {tab === "active" ? <ActiveTab data={data} currentId={me.organization.slug === "all" ? null : me.organization.id} /> : null}
          {tab === "invitations" ? <InvitationsTab data={data} /> : null}
          {tab === "archived" ? <ArchivedTab data={data} /> : null}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        <Skeleton />
      )}
      {adding ? <ConsolePortal><AddCompanyDialog onClose={() => setAdding(false)} /></ConsolePortal> : null}
    </SettingsFrame>
  );
}

function Summary({ data }: { data: MyCompanies }) {
  const active = data.companies.filter((c) => c.status === "active");
  const left = Math.max(0, data.limit - data.used);
  return (
    <div className="c g8">
      <section className="kpis" aria-label="Summary" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
        <div className="kpi"><span className="kl"><Icon className="s14" d={I.building} />Companies</span><span className="kv2">{data.used}</span><span className="ks mu">{`${data.used} of ${data.limit} used · ${left} left`}</span></div>
        <div className="kpi"><span className="kl"><Icon className="s14" d={I.user} />Drivers</span><span className="kv2">{formatNumber(active.reduce((n, c) => n + c.drivers, 0))}</span><span className="ks mu">Active, across your companies</span></div>
        <div className="kpi"><span className="kl"><Icon className="s14" d={I.truck} />Trucks</span><span className="kv2">{formatNumber(active.reduce((n, c) => n + c.trucks, 0))}</span><span className="ks mu">In service, across your companies</span></div>
        <div className="kpi"><span className="kl"><Icon className="s14" d={I.mail} />Waiting for you</span><span className="kv2">{data.invitations.length}</span><span className="ks mu">{data.invitations.length === 1 ? "Invitation to answer" : "Invitations to answer"}</span></div>
      </section>
      <div className="usebar" role="progressbar" aria-label="Companies used" aria-valuemin={0} aria-valuemax={data.limit} aria-valuenow={data.used} aria-valuetext={`${data.used} of ${data.limit} companies used`}>
        <span style={{ width: `${Math.min(100, (data.used / data.limit) * 100)}%` }}></span>
      </div>
    </div>
  );
}

function ActiveTab({ data, currentId }: { data: MyCompanies; currentId: string | null }) {
  const { state, set } = useConsole();
  const active = data.companies.filter((c) => c.status === "active");
  const chosen = active.find((c) => c.id === state.cosel) ?? active.find((c) => c.id === currentId) ?? active[0];
  if (!active.length) return <EmptyState icon={I.building} title="No active companies" text="Add a company, or accept an invitation to join one." />;
  return (
    <div className="cogrid">
      <section className="card oh" aria-label="Active companies">
        <div className="cohead" aria-hidden="true"><span>Company</span><span>Your role</span><span>MC number</span><span>Drivers</span><span>Trucks</span><span>Last opened</span></div>
        <ul>
          {active.map((c) => (
            <li key={c.id}>
              <button type="button" className="coline" aria-pressed={chosen?.id === c.id} onClick={() => set({ cosel: c.id })}
                aria-label={`${c.name}${c.id === currentId ? ", current" : ""}${c.is_default ? ", default" : ""}: ${c.role_label}, ${c.mc_number ?? "no MC number"}, ${plural(c.drivers, "driver")}, ${plural(c.trucks, "truck")}, last opened ${opened(c.last_opened_at)}`}>
                <span className="r g8" style={{ minWidth: 0 }}>
                  <CompanyMark code={c.code} color={c.color} logo={c.logo_url} size={28} />
                  <span className="ell w5">{c.name}</span>
                  {c.id === currentId ? <span className="tag" data-k="ok">Current</span> : null}
                  {c.is_default ? <span className="tag" data-k="info">Default</span> : null}
                </span>
                <span>{c.role_label}</span>
                <span className="mono">{c.mc_number ?? "—"}</span>
                <span className="num">{c.drivers}</span>
                <span className="num">{c.trucks}</span>
                <span className="mu">{opened(c.last_opened_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {chosen ? <Detail company={chosen} current={chosen.id === currentId} /> : null}
    </div>
  );
}

function Detail({ company, current }: { company: MyCompany; current: boolean }) {
  const { notify, set } = useConsole();
  const switchTo = useSwitchCompany();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<"archive" | "leave" | null>(null);
  const [pending, setPending] = useState(false);

  async function makeDefault() {
    setPending(true);
    try {
      queryClient.setQueryData(COMPANIES_KEY, await unwrap(api.POST("/api/v1/me/companies/{company_id}/default", { params: { path: { company_id: company.id } } })));
      notify(`${company.name} opens first when you sign in`);
    } catch (error) {
      notify(errorMessage(error), true);
    }
    setPending(false);
  }

  const facts: [string, string][] = [
    ["Your role", company.role_label], ["MC number", company.mc_number ?? "—"], ["USDOT", company.dot_number ?? "—"],
    ["Home state", company.home_state ?? "—"], ["People", String(company.people)], ["Drivers", String(company.drivers)],
    ["Trucks", String(company.trucks)], ["Member since", day(company.member_since)], ["Last opened", opened(company.last_opened_at)],
  ];
  return (
    <aside className="card" aria-label={`${company.name} details`}>
      <div className="cb c g12">
        <div className="r g10">
          <CompanyMark code={company.code} color={company.color} logo={company.logo_url} size={40} />
          <div className="c" style={{ minWidth: 0 }}><span className="fs14 w6 ell">{company.name}</span><span className="fs12 mu">{company.role_label}</span></div>
        </div>
        <div className="r g8" style={{ flexWrap: "wrap" }}>
          {current ? null : <button type="button" className="btn pri sm" onClick={() => void switchTo(company)}>Open company</button>}
          {company.is_default ? <span className="tag" data-k="info">Opens first at sign-in</span> : <button type="button" className="btn sm" onClick={() => void makeDefault()} disabled={pending}>Make default</button>}
        </div>
        <dl className="dl2" style={{ gridTemplateColumns: "110px minmax(0,1fr)" }}>
          {facts.map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd className={k === "MC number" || k === "USDOT" ? "mono" : undefined}>{v}</dd></div>)}
        </dl>
        <div className="hr"></div>
        {company.is_main_admin ? (
          <div className="c g6">
            <button type="button" className="btn sm" onClick={() => (current ? set({ ...goTo("settings"), setpage: "organization" }) : void switchTo(company, { path: `/${company.slug}/settings/integrations` }))}>
              <Icon className="s14" d={I.sliders} />Company settings
            </button>
            <button type="button" className="btn sm badt" onClick={() => setConfirm("archive")}><Icon className="s14" d={I.inbox} />Archive company…</button>
          </div>
        ) : (
          <button type="button" className="btn sm badt" onClick={() => setConfirm("leave")}><Icon className="s14" d={I.logout} />Leave company…</button>
        )}
      </div>
      {confirm ? <ConsolePortal><ArchiveOrLeave company={company} kind={confirm} current={current} onClose={() => setConfirm(null)} /></ConsolePortal> : null}
    </aside>
  );
}

/** Archive a company (Main Admins), or leave it (everyone else), after saying what happens. */
function ArchiveOrLeave({ company, kind, current, onClose }: { company: MyCompany; kind: "archive" | "leave"; current: boolean; onClose: () => void }) {
  const { notify } = useConsole();
  const switchTo = useSwitchCompany();
  const queryClient = useQueryClient();
  const id = useId();
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const check = useQuery({
    queryKey: ["me", "archive-check", company.id],
    queryFn: () => unwrap(api.GET("/api/v1/me/companies/{company_id}/archive-check", { params: { path: { company_id: company.id } } })),
    enabled: kind === "archive",
  });
  const blockers = kind === "archive" ? (check.data?.blockers ?? []) : company.sole_main_admin ? [{ kind: "sole", count: 1, message: "You’re its only Main Admin. Make someone else Main Admin first (Team & access), or archive the company." }] : [];
  const nameOk = typed.trim().replace(/\s+/g, " ").toLowerCase() === company.name.toLowerCase();
  const ready = kind === "archive" ? check.isSuccess && !blockers.length && nameOk : !blockers.length;

  async function go() {
    setPending(true);
    setProblem(null);
    try {
      // Leaving the company this session is in: move the session to another of your companies first, so the
      // requests that follow aren't tied to a company you can no longer open.
      if (kind === "leave" && current) {
        const list = queryClient.getQueryData<MyCompanies>(COMPANIES_KEY);
        const others = (list?.companies ?? []).filter((c) => c.id !== company.id && c.status === "active");
        const to = others.find((c) => c.id === list?.default_company_id) ?? others[0];
        if (to) await postJson("/api/auth/switch", { organization_id: to.id });
      }
      const next = kind === "archive"
        ? await unwrap(api.POST("/api/v1/me/companies/{company_id}/archive", { params: { path: { company_id: company.id } }, body: { confirm_name: typed } }))
        : await unwrap(api.POST("/api/v1/me/companies/{company_id}/leave", { params: { path: { company_id: company.id } } }));
      queryClient.setQueryData(COMPANIES_KEY, next);
      const done = kind === "archive" ? `${company.name} archived` : `You left ${company.name}`;
      onClose();
      if (current) {
        // moved to the default company, or the first active one left
        const to = next.companies.find((c) => c.id === next.default_company_id && c.status === "active") ?? next.companies.find((c) => c.status === "active");
        if (to) return void switchTo(to, { toast: `${done} · now in ${to.name}`, path: `/${to.slug}/settings/account/companies` });
      }
      notify(done);
    } catch (error) {
      setProblem(errorMessage(error));
      setPending(false);
    }
  }

  const lines = kind === "archive"
    ? ["Loads, drivers, documents and statements are kept.", "Its people can no longer sign in to it.", "Both audit logs record who archived it and when.", "It still counts toward your 10-company limit."]
    : ["Your saved views and notification settings for it are removed.", "What you did there stays in its audit log.", "Loads and drivers you created stay with the company."];

  return (
    <Dialog
      title={kind === "archive" ? `Archive ${company.name}?` : `Leave ${company.name}?`}
      sub={kind === "archive" ? "It becomes read-only for everyone. Nothing is deleted, and you can restore it for 90 days." : `You lose access as ${company.role_label}. A Main Admin there can invite you again.`}
      icon={I.alert} width={520} onClose={() => !pending && onClose()}
      footer={<><span className="sp"></span><button type="button" className="btn" onClick={onClose} disabled={pending}>Cancel</button><button type="button" className="btn bad" disabled={!ready || pending} onClick={() => void go()}>{pending ? "Working…" : kind === "archive" ? "Archive company" : "Leave company"}</button></>}>
      <Problem message={problem} />
      {check.isError ? <ErrorState error={check.error} retry={() => void check.refetch()} /> : null}
      {blockers.length ? (
        <div className="banner" data-k="bad" role="alert">
          <Icon className="s14" d={I.alert} />
          <div className="f1 c g4">
            <span className="bt">{kind === "archive" ? "This company can’t be archived yet" : "You can’t leave yet"}</span>
            <ul className="c g2">{blockers.map((b) => <li key={b.kind}>{b.message}</li>)}</ul>
          </div>
        </div>
      ) : null}
      <ul className="c g6 fs13">
        {lines.map((line) => <li key={line} className="r g8"><Icon className="s14 mu" d={I.check} /><span>{line}</span></li>)}
      </ul>
      {kind === "archive" ? (
        <div className="fld">
          <label htmlFor={`${id}-name`}>{`Type ${company.name} to confirm`}</label>
          <input id={`${id}-name`} className="inp" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={!!blockers.length} />
        </div>
      ) : null}
    </Dialog>
  );
}

function InvitationsTab({ data }: { data: MyCompanies }) {
  const { notify, set } = useConsole();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  // "expires in N days" is counted from when the tab opened
  const [now] = useState(() => Date.now());
  if (!data.invitations.length) return <EmptyState icon={I.mail} title="No invitations waiting" text="When a company invites your email, it shows here. You can also join with a code under Add a company." />;

  async function answer(id: string, accept: boolean, name: string) {
    setPending(id);
    try {
      if (accept) {
        const joined = await unwrap(api.POST("/api/v1/me/invitations/{invitation_id}/accept", { params: { path: { invitation_id: id } } }));
        await queryClient.invalidateQueries({ queryKey: COMPANIES_KEY });
        set({ cotab: "active", cosel: joined.id });
        notify(`You joined ${joined.name} as ${joined.role_label}`);
      } else {
        await unwrap(api.POST("/api/v1/me/invitations/{invitation_id}/decline", { params: { path: { invitation_id: id } } }));
        await queryClient.invalidateQueries({ queryKey: COMPANIES_KEY });
        notify(`Invitation from ${name} declined`);
      }
    } catch (error) {
      notify(errorMessage(error), true);
    }
    setPending(null);
  }

  const days = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86_400_000));
  return (
    <div className="c g10">
      {data.invitations.map((inv) => (
        <section key={inv.id} className="card" aria-label={`Invitation from ${inv.company_name}`}>
          <div className="cb r g12" style={{ flexWrap: "wrap" }}>
            <CompanyMark code={inv.company_code} color={inv.company_color} size={40} />
            <div className="f1 c g2" style={{ minWidth: "220px" }}>
              <span className="fs14 w6">{inv.company_name}</span>
              <span className="fs12 mu">{[inv.mc_number, plural(inv.drivers, "driver"), plural(inv.trucks, "truck")].filter(Boolean).join(" · ")}</span>
              <span className="fs12">{`Invited by ${inv.invited_by_name ?? "a Main Admin"} as ${inv.role_label} · Expires in ${plural(days(inv.expires_at), "day")}`}</span>
            </div>
            <button type="button" className="btn sm" onClick={() => void answer(inv.id, false, inv.company_name)} disabled={pending !== null}>Decline</button>
            <button type="button" className="btn pri sm" onClick={() => void answer(inv.id, true, inv.company_name)} disabled={pending !== null || data.used >= data.limit}>{pending === inv.id ? "Working…" : "Accept"}</button>
          </div>
        </section>
      ))}
    </div>
  );
}

function ArchivedTab({ data }: { data: MyCompanies }) {
  const { notify } = useConsole();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const archived = data.companies.filter((c) => c.status !== "active");
  if (!archived.length) return <EmptyState icon={I.inbox} title="No archived companies" text="An archived company is read-only, still counts toward your 10, and can be restored for 90 days." />;

  async function restore(company: MyCompany) {
    setPending(company.id);
    try {
      queryClient.setQueryData(COMPANIES_KEY, await unwrap(api.POST("/api/v1/me/companies/{company_id}/restore", { params: { path: { company_id: company.id } } })));
      notify(`${company.name} restored`);
    } catch (error) {
      notify(errorMessage(error), true);
    }
    setPending(null);
  }

  return (
    <div className="c g10">
      {archived.map((c) => (
        <section key={c.id} className="card" aria-label={c.name}>
          <div className="cb r g12" style={{ flexWrap: "wrap" }}>
            <CompanyMark code={c.code} color={c.color} logo={c.logo_url} size={40} />
            <div className="f1 c g2" style={{ minWidth: "220px" }}>
              <span className="r g6 fs14 w6">{c.name}<span className="tag" data-k="mu">Read-only</span></span>
              <span className="fs12 mu">{[c.mc_number, c.archived_at ? `Archived ${day(c.archived_at)}` : "", c.restorable_until ? `restorable for 90 days, until ${day(c.restorable_until)}` : ""].filter(Boolean).join(" · ")}</span>
            </div>
            {c.is_main_admin ? <button type="button" className="btn sm" onClick={() => void restore(c)} disabled={pending !== null}>{pending === c.id ? "Restoring…" : "Restore"}</button> : null}
          </div>
        </section>
      ))}
    </div>
  );
}
