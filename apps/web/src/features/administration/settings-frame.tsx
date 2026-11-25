"use client";

import { clsx } from "clsx";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";

/** A page of Settings: a screen of its own, or one of the pages of the Settings screen (`setpage`). */
export type SettingsPage = "organization" | "numbering" | "policy" | "integrations" | "retention" | "billing";
export type SettingsKey = "profile" | "security" | "notifications" | "team" | "teams" | SettingsPage | "audit";

type Item = { key: SettingsKey; label: string; icon: string; screen?: string; page?: SettingsPage; anyOf?: string[] };

/**
 * The Settings left list, the same on every Settings page. "You" is personal and open to every role; the
 * rest is offered only to roles that can open it (the API checks the same permissions on every request).
 */
export const SETTINGS_NAV: { label: string; items: Item[] }[] = [
  {
    label: "You",
    items: [
      { key: "profile", label: "Profile & preferences", icon: I.user, screen: "profile" },
      { key: "security", label: "Security & privacy", icon: I.shield, screen: "security" },
      { key: "notifications", label: "Notifications", icon: I.bell, screen: "notify" },
    ],
  },
  {
    label: "Organization",
    items: [
      { key: "organization", label: "Organization", icon: I.building, page: "organization", anyOf: ["organization.manage"] },
      { key: "team", label: "Team & access", icon: I.team, screen: "team", anyOf: ["users.manage"] },
      { key: "teams", label: "Dispatch teams", icon: I.truck, screen: "teams", anyOf: ["users.manage"] },
      { key: "numbering", label: "Numbering & formats", icon: I.hash, page: "numbering", anyOf: ["organization.manage"] },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "policy", label: "Fleet alert policies", icon: I.alert, page: "policy", anyOf: ["incidents.read", "alert_policies.manage"] },
      { key: "integrations", label: "Integrations", icon: I.link, page: "integrations", anyOf: ["organization.manage"] },
    ],
  },
  {
    label: "Data & billing",
    items: [
      { key: "retention", label: "Data & retention", icon: I.history, page: "retention", anyOf: ["organization.manage"] },
      { key: "billing", label: "Billing & plan", icon: I.dollar, page: "billing", anyOf: ["organization.manage"] },
      { key: "audit", label: "Audit log", icon: I.history, screen: "audit", anyOf: ["audit.read"] },
    ],
  },
];

export const settingsLabel = (key: SettingsKey): string => SETTINGS_NAV.flatMap((group) => group.items).find((item) => item.key === key)?.label ?? "Settings";

/** The grouped Settings list, showing what this role can open, with the current page marked. */
export function SettingsNav({ current }: { current: SettingsKey }) {
  const { can, set, screen } = useConsole();
  const go = (item: Item) => {
    if (item.screen) return set(goTo(item.screen));
    if (item.page === "policy") return set({ ...goTo("policy"), setpage: "policy" });
    set({ ...(screen === "settings" ? {} : goTo("settings")), setpage: item.page });
  };
  const groups = SETTINGS_NAV.map((group) => ({ ...group, items: group.items.filter((item) => !item.anyOf || can(...item.anyOf)) })).filter((group) => group.items.length);
  return (
    <nav className="stnav" aria-label="Settings sections">
      {groups.map((group) => (
        <div key={group.label} className="stgrp">
          <h2 className="navg stgh">{group.label}</h2>
          {group.items.map((item) => (
            <button key={item.key} className={clsx("rci", item.key === current && "on")} onClick={() => go(item)} aria-current={item.key === current ? "page" : undefined}>
              <Icon className="s14" d={item.icon} />
              <span className="f1 ell"><span>{item.label}</span></span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Personal pages (the "You" group): reached from the account menu, not from Administration. */
export const isPersonal = (key: SettingsKey): boolean => SETTINGS_NAV[0]!.items.some((item) => item.key === key);

/**
 * A Settings page: breadcrumbs, the title and what it is for, actions, the list and the body. The company's
 * pages sit under Administration in the sidebar, so they read "Administration > Settings > page"; your own
 * pages read "Settings > page".
 */
export function SettingsFrame({ current, sub, actions, children }: { current: SettingsKey; sub: string; actions?: ReactNode; children: ReactNode }) {
  const label = settingsLabel(current);
  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "14px", borderBottom: "1px solid var(--bd)" }}>
        <div className="f1">
          <nav className="crumb" aria-label="Breadcrumb">
            {isPersonal(current) ? null : (
              <>
                <span>Administration</span>
                <Icon className="s12" d={I.chevR} />
              </>
            )}
            <span>Settings</span>
            <Icon className="s12" d={I.chevR} />
            <b aria-current="page"><span>{label}</span></b>
          </nav>
          <h1 className="h1"><span>{label}</span></h1>
          <p className="sub"><span>{sub}</span></p>
        </div>
        {actions}
      </div>
      <div className="stg">
        <SettingsNav current={current} />
        <div style={{ overflow: "auto", minHeight: "0", padding: "20px 24px 24px" }}>{children}</div>
      </div>
    </div>
  );
}
