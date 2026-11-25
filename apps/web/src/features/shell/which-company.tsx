"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import type { ConsoleState } from "@/features/console/state";
import { CompanyMark } from "./company-mark";
import { useSwitchCompany } from "./company-switch";

const LAST = "ff.lastCompany";
const remembered = (): string | null => {
  try {
    return window.localStorage.getItem(LAST);
  } catch {
    return null;
  }
};

/**
 * Creating and every Add button, in All companies, ask "Which company?" first. The last company used is chosen
 * already. The person then continues in that company, where the new record belongs and where only that company's
 * drivers, trucks and trailers can be used.
 */
export function WhichCompany() {
  const { me, state, set } = useConsole();
  const switchTo = useSwitchCompany();
  const pending = state.whichCompany as ConsoleState | undefined;
  const companies = me.memberships.filter((m) => m.status === "active");
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const picked = choice ?? (companies.find((c) => c.id === remembered()) ?? companies[0])?.id;

  // once the page is in the chosen company, the add flow opens there
  const after = state.afterSwitch as { slug: string; patch: ConsoleState } | undefined;
  useEffect(() => {
    if (after && me.organization.slug === after.slug) set({ ...after.patch, afterSwitch: null });
  }, [after, me.organization.slug, set]);

  if (!pending) return null;
  const go = async () => {
    const company = companies.find((c) => c.id === picked);
    if (!company) return;
    setBusy(true);
    try {
      window.localStorage.setItem(LAST, company.id);
    } catch {
      // the choice just isn't remembered
    }
    set({ whichCompany: null, afterSwitch: { slug: company.slug, patch: pending } });
    await switchTo({ id: company.id, slug: company.slug, name: company.name });
    setBusy(false);
  };
  return (
    <Dialog title="Which company?" sub="This is created in one company. It can only use that company’s own drivers, trucks and trailers." icon={I.building} width={460} onClose={() => set({ whichCompany: null })}
      footer={<><span className="sp"></span><button className="btn" onClick={() => set({ whichCompany: null })}>Cancel</button><button className="btn pri" disabled={!picked || busy} onClick={() => void go()}>Continue</button></>}>
      <div className="c g6" role="radiogroup" aria-label="Company">
        {companies.map((c) => (
          <button key={c.id} role="radio" aria-checked={picked === c.id} className={`coi${picked === c.id ? " on" : ""}`} style={{ display: "flex", gap: 10, alignItems: "center", padding: 8, border: "1px solid var(--bd)", borderRadius: 8, background: picked === c.id ? "var(--sel)" : "transparent", textAlign: "left" }} onClick={() => setChoice(c.id)}>
            <CompanyMark code={c.code} color={c.color} logo={c.logo_url} size={28} />
            <span className="f1 c"><span className="fs13 w5">{c.name}</span><span className="fs12 mu">{[c.role_label, c.mc_number].filter(Boolean).join(" · ")}</span></span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
