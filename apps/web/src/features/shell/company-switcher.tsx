"use client";

import { clsx } from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import type { OrgRef } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { CompaniesDialog } from "./companies-dialog";
import { CompanyMark } from "./company-mark";
import { useSwitchCompany } from "./company-switch";

type Entry = { key: string; all?: true; company?: OrgRef };

const CHECK = "M5 13l4 4L19 7";
const GRID = "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z";

/**
 * The company switcher at the foot of the sidebar: a popup in place, never a sign-in page. "All companies" is
 * first for anyone with two or more; each company shows the person's role there and its MC number; archived
 * companies sit under a divider and open read-only. Arrow keys and Enter work; with many companies it searches.
 */
export function CompanySwitcher() {
  const { org } = useConsole();
  const me = useSession();
  const switchTo = useSwitchCompany();
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inAll = me.organization.slug === "all";
  const owner = me.account.is_owner;

  const entries = useMemo(() => {
    const needle = text.trim().toLowerCase();
    const match = (c: OrgRef) => !needle || `${c.name} ${c.code} ${c.mc_number ?? ""}`.toLowerCase().includes(needle);
    const active = me.memberships.filter((c) => c.status === "active" && match(c));
    const archived = me.memberships.filter((c) => c.status !== "active" && match(c));
    const all: Entry[] = me.all_companies && (!needle || "all companies".includes(needle)) ? [{ key: "all", all: true }] : [];
    return { active, archived, list: [...all, ...active.map((c) => ({ key: c.id, company: c })), ...archived.map((c) => ({ key: c.id, company: c }))] as Entry[] };
  }, [me.memberships, me.all_companies, text]);

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
    const current = entry.all ? inAll : entry.company?.slug === me.organization.slug;
    if (current) return close();
    setBusy(true);
    try {
      await switchTo(entry.all ? "all" : { id: entry.company!.id, slug: entry.company!.slug });
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
    } else if (event.key === "Enter") {
      event.preventDefault();
      void choose(entries.list[active]);
    }
  };
  const index = (key: string) => entries.list.findIndex((e) => e.key === key);
  const row = (entry: Entry) => {
    const c = entry.company;
    const current = entry.all ? inAll : c?.slug === me.organization.slug;
    return (
      <button key={entry.key} className={clsx("coi", index(entry.key) === active && "on")} role="menuitemradio" aria-checked={current} onClick={() => void choose(entry)} onMouseEnter={() => setCursor(index(entry.key))}>
        {entry.all ? <span className="cmark" style={{ width: 28, height: 28, background: "var(--sf3)", color: "var(--tx2)" }}><Icon className="s14" d={GRID} /></span> : <CompanyMark code={c!.code} color={c!.color} size={28} />}
        <span className="f1 c" style={{ minWidth: 0 }}>
          <span className="fs13 w5 ell"><span>{entry.all ? "All companies" : c!.name}</span></span>
          <span className="fs12 mu ell"><span>{entry.all ? `${me.memberships.filter((m) => m.status === "active").length} companies you can open` : [c!.role_label, c!.mc_number, c!.status !== "active" ? "Archived · read-only" : ""].filter(Boolean).join(" · ")}</span></span>
        </span>
        {current ? <Icon className="s14" d={CHECK} /> : null}
      </button>
    );
  };

  return (
    <div ref={box} style={{ position: "relative", width: "100%" }}>
      {open ? (
        <div className="cosw" role="menu" aria-label="Switch company" onKeyDown={onKey}>
          {me.memberships.length > 6 ? <input autoFocus className="inp cosq" placeholder="Find a company" aria-label="Find a company" value={text} onChange={(e) => { setText(e.target.value); setCursor(0); }} /> : null}
          {entries.list.some((e) => e.all) ? row(entries.list[0]!) : null}
          {entries.active.map((c) => row({ key: c.id, company: c }))}
          {entries.archived.length ? (
            <>
              <div className="hr" style={{ margin: "4px -6px" }}></div>
              <div className="cog">Archived</div>
              {entries.archived.map((c) => row({ key: c.id, company: c }))}
            </>
          ) : null}
          {!entries.list.length ? <div className="fs13 mu" style={{ padding: "8px" }}>No company matches “{text}”</div> : null}
          {owner ? (
            <>
              <div className="hr" style={{ margin: "4px -6px" }}></div>
              <button className="coi" onClick={() => { close(); setManage(true); }}><Icon className="s14" d="M12 5v14M5 12h14" /><span className="fs13">Add a company</span></button>
              <button className="coi" onClick={() => { close(); setManage(true); }}><Icon className="s14" d={GRID} /><span className="fs13">Manage companies</span></button>
            </>
          ) : null}
        </div>
      ) : null}
      <button className="org" aria-label="Switch company" aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <span className="orgmk" style={{ background: org.c, color: inAll ? "#fff" : undefined, fontSize: org.ini.length > 3 ? "9px" : undefined }}><span>{org.ini}</span></span>
        <span className="f1">
          <span className="blk ell" style={{ color: "var(--ntstrong)", fontSize: "13px", fontWeight: "500", lineHeight: "16px" }}><span>{org.name}</span></span>
          <span className="blk ell" style={{ fontSize: "11px", lineHeight: "14px" }}><span>{inAll ? `${me.memberships.filter((m) => m.status === "active").length} companies` : org.sub}</span></span>
        </span>
        <Icon className="s14" d="M7 15l5 5 5-5M7 9l5-5 5 5" />
      </button>
      {manage ? <CompaniesDialog onClose={() => setManage(false)} /> : null}
    </div>
  );
}
