"use client";

import { clsx } from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { AddCompanyDialog } from "@/features/companies/add-company";
import { useMyCompanies, type MyCompany } from "@/features/companies/use-companies";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { ConsolePortal } from "@/features/console/portal";
import { goTo } from "@/features/console/shell";
import { useSession } from "@/lib/auth/session";
import { plural } from "@/lib/format/text";
import { CompanyMark } from "./company-mark";
import { useSwitchCompany } from "./company-switch";

type Entry = { key: string; all?: true; company?: MyCompany };

const CHECK = "M5 13l4 4L19 7";
const GRID = "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z";
/** More than this many companies, and the switcher offers a search. */
const SEARCH_FROM = 5;

/**
 * The company switcher at the foot of the sidebar: a popup in place, never a sign-in page. In order: invitations
 * waiting for you, All companies, your companies (role, MC number, drivers, the default one marked), archived ones
 * (read-only), Add a company with how many of the ten are used, and Manage companies. Arrow keys and Enter work.
 */
export function CompanySwitcher() {
  const { org, set } = useConsole();
  const me = useSession();
  const switchTo = useSwitchCompany();
  const mine = useMyCompanies();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inAll = me.organization.slug === "all";
  const companies = useMemo(() => mine.data?.companies ?? [], [mine.data]);
  const invitations = mine.data?.invitations ?? [];

  const entries = useMemo(() => {
    const needle = text.trim().toLowerCase();
    const match = (c: MyCompany) => !needle || `${c.name} ${c.code} ${c.mc_number ?? ""} ${(c.mc_number ?? "").replace(/\D/g, "")}`.toLowerCase().includes(needle);
    const active = companies.filter((c) => c.status === "active" && match(c));
    const archived = companies.filter((c) => c.status !== "active" && match(c));
    const all: Entry[] = me.all_companies && (!needle || "all companies".includes(needle)) ? [{ key: "all", all: true }] : [];
    return { active, archived, list: [...all, ...active.map((c) => ({ key: c.id, company: c })), ...archived.map((c) => ({ key: c.id, company: c }))] as Entry[] };
  }, [companies, me.all_companies, text]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const close = () => {
    setOpen(false);
    setText("");
    setCursor(0);
  };
  const choose = async (entry: Entry | undefined) => {
    if (!entry || busy) return;
    const current = entry.all ? inAll : entry.company?.id === me.organization.id && !inAll;
    if (current) return close();
    setBusy(true);
    try {
      await switchTo(entry.all ? "all" : entry.company!);
    } finally {
      setBusy(false);
      close();
    }
  };
  const active = Math.min(cursor, Math.max(0, entries.list.length - 1));
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") close();
    else if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor(Math.min(active + 1, entries.list.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor(Math.max(active - 1, 0));
    } else if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") {
      event.preventDefault();
      void choose(entries.list[active]);
    }
  };
  const index = (key: string) => entries.list.findIndex((e) => e.key === key);
  const row = (entry: Entry) => {
    const c = entry.company;
    const current = entry.all ? inAll : c?.id === me.organization.id && !inAll;
    const detail = entry.all
      ? `${companies.filter((m) => m.status === "active").length} companies you can open`
      : [c!.role_label, c!.mc_number, plural(c!.drivers, "driver")].filter(Boolean).join(" · ");
    return (
      <button key={entry.key} className={clsx("coi", index(entry.key) === active && "on")} role="menuitemradio" aria-checked={current} onClick={() => void choose(entry)} onMouseEnter={() => setCursor(index(entry.key))}>
        {entry.all ? <span className="cmark" style={{ width: 28, height: 28, background: "var(--sf3)", color: "var(--tx2)" }}><Icon className="s14" d={GRID} /></span> : <CompanyMark code={c!.code} color={c!.color} size={28} />}
        <span className="f1 c" style={{ minWidth: 0 }}>
          <span className="r g6 fs13 w5" style={{ minWidth: 0 }}>
            <span className="ell">{entry.all ? "All companies" : c!.name}</span>
            {c?.is_default ? <span className="tag" data-k="info">Default</span> : null}
            {c && c.status !== "active" ? <span className="tag" data-k="mu">Read-only</span> : null}
          </span>
          <span className="fs12 mu ell"><span>{detail}</span></span>
        </span>
        {current ? <Icon className="s14" d={CHECK} /> : null}
      </button>
    );
  };
  const used = mine.data?.used ?? companies.length;
  const limit = mine.data?.limit ?? 10;

  return (
    <div ref={box} style={{ position: "relative", width: "100%" }}>
      {open ? (
        <div className="cosw" role="menu" aria-label="Switch company" onKeyDown={onKey}>
          {invitations.length ? (
            <button className="coi cobanner" role="menuitem" onClick={() => { close(); set({ ...goTo("companies"), cotab: "invitations" }); }}>
              <Icon className="s14" d={I.mail} />
              <span className="f1 fs13 w5">{invitations.length === 1 ? "1 invitation is waiting for you" : `${invitations.length} invitations are waiting for you`}</span>
              <Icon className="s12" d={I.chevR} />
            </button>
          ) : null}
          {companies.length > SEARCH_FROM ? <input autoFocus className="inp cosq" placeholder="Find a company or MC number" aria-label="Find a company or MC number" value={text} onChange={(e) => { setText(e.target.value); setCursor(0); }} /> : null}
          {entries.list.some((e) => e.all) ? row(entries.list[0]!) : null}
          {entries.active.length ? <div className="cog">Your companies</div> : null}
          {entries.active.map((c) => row({ key: c.id, company: c }))}
          {entries.archived.length ? (
            <>
              <div className="hr" style={{ margin: "4px -6px" }}></div>
              <div className="cog">Archived</div>
              {entries.archived.map((c) => row({ key: c.id, company: c }))}
            </>
          ) : null}
          {!entries.list.length && mine.data ? <div className="fs13 mu" style={{ padding: "8px" }}>No company matches “{text}”</div> : null}
          <div className="hr" style={{ margin: "4px -6px" }}></div>
          <button className="coi" role="menuitem" onClick={() => { close(); setAdding(true); }}>
            <Icon className="s14" d={I.plus} />
            <span className="f1 fs13">Add a company</span>
            <span className="fs12 mu" aria-label={`${used} of ${limit} companies used`}>{`${used} of ${limit} used`}</span>
          </button>
          <button className="coi" role="menuitem" onClick={() => { close(); set(goTo("companies")); }}>
            <Icon className="s14" d={GRID} />
            <span className="fs13">Manage companies</span>
          </button>
        </div>
      ) : null}
      <button className="org" aria-label="Switch company" aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <span className="orgmk" style={{ background: org.c, color: inAll ? "#fff" : undefined, fontSize: org.ini.length > 3 ? "9px" : undefined }}><span>{org.ini}</span></span>
        <span className="f1">
          <span className="blk ell" style={{ color: "var(--ntstrong)", fontSize: "13px", fontWeight: "500", lineHeight: "16px" }}><span>{org.name}</span></span>
          <span className="blk ell" style={{ fontSize: "11px", lineHeight: "14px" }}><span>{inAll ? `${companies.filter((m) => m.status === "active").length || me.memberships.filter((m) => m.status === "active").length} companies` : org.sub}</span></span>
        </span>
        <Icon className="s14" d="M7 15l5 5 5-5M7 9l5-5 5 5" />
      </button>
      {adding ? <ConsolePortal><AddCompanyDialog onClose={() => setAdding(false)} /></ConsolePortal> : null}
    </div>
  );
}
