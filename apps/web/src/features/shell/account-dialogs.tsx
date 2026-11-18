"use client";

import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { useLocalPreference } from "@/hooks/use-local-preference";
import { usePreference } from "@/hooks/use-preference";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";

/** What the bell can tell you about, and who can be told: the same rules the server uses to raise each one. */
export const NOTICES: { code: string; label: string; needs: string[] }[] = [
  { code: "LOADS_AT_RISK", label: "Loads at risk", needs: ["loads.read"] },
  { code: "LOADS_UNASSIGNED", label: "Loads waiting for a driver", needs: ["loads.read"] },
  { code: "MISSING_POD", label: "Delivered without proof of delivery", needs: ["loads.read"] },
  { code: "POD_REVIEW", label: "Proof of delivery to review", needs: ["loads.read", "loads.close"] },
  { code: "LOADS_ON_HOLD", label: "Loads on hold", needs: ["loads.read"] },
  { code: "DRIVERS_BLOCKED", label: "Drivers who can’t be dispatched", needs: ["safety.read"] },
  { code: "UNITS_BLOCKED", label: "Equipment that can’t be dispatched", needs: ["safety.read"] },
  { code: "EXPIRING_SOON", label: "Licenses and papers expiring soon", needs: ["safety.read"] },
  { code: "DOCUMENTS_TO_REVIEW", label: "Compliance documents to review", needs: ["safety.read", "safety.manage"] },
  { code: "WORK_ORDERS_URGENT", label: "Urgent work orders", needs: ["maintenance.read"] },
  { code: "WORK_ORDERS_OVERDUE", label: "Work orders past their date", needs: ["maintenance.read"] },
  { code: "SETTLEMENTS_TO_PAY", label: "Driver pay approved, not yet paid", needs: ["settlements.read"] },
  { code: "INVOICES_OVERDUE", label: "Overdue invoices", needs: ["invoices.read"] },
  { code: "READY_TO_INVOICE", label: "Completed loads not yet invoiced", needs: ["invoices.read"] },
  { code: "DRAFT_INVOICES", label: "Draft invoices", needs: ["invoices.read"] },
];
/** The kinds a person turned off for the bell, kept with their account. */
export const MUTED_KEY = "notifications.muted";

export const SHORTCUTS: [keys: string[], what: string][] = [
  [["⌘", "K"], "Search everything, or go anywhere (Ctrl K on Windows)"],
  [["?"], "Keyboard shortcuts"],
  [["Esc"], "Close the panel, menu or dialog on top"],
  [["↑", "↓"], "Move through search results"],
  [["↵"], "Open the search result picked"],
];

type Which = "profile" | "notify" | "keys" | "help";

/** The account menu's dialogs: your profile and preferences, what the bell tells you, shortcuts, and help. */
export function AccountDialogs() {
  const { state, set } = useConsole();
  const which = typeof state.acct === "string" ? (state.acct as Which) : null;
  const close = () => set({ acct: null });
  if (which === "profile") return <ProfileDialog onClose={close} />;
  if (which === "notify") return <NotifyDialog onClose={close} />;
  if (which === "keys") return <ShortcutsDialog onClose={close} />;
  if (which === "help") return <HelpDialog onClose={close} />;
  return null;
}

function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { me, user, notify } = useConsole();
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState(me.user.full_name);
  const [theme, setTheme] = useLocalPreference("ff.theme", "system");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const renamed = name.trim() !== me.user.full_name;
  const changing = !!(current || next || again);

  async function save() {
    setProblem(null);
    if (!name.trim()) return setProblem("Enter your name");
    if (changing) {
      if (!current || !next) return setProblem("Enter your current password and a new one");
      if (next !== again) return setProblem("The new passwords don’t match");
    }
    setPending(true);
    try {
      if (renamed) await unwrap(api.PATCH("/api/v1/auth/me", { body: { full_name: name.trim() } }));
      if (changing) {
        const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current_password: current, new_password: next }), credentials: "same-origin" });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw Object.assign(new Error(body?.error?.message ?? "The password couldn’t be changed"), { body });
      }
      notify(changing ? "Saved. Your password is changed and other sign-ins were signed out" : renamed ? "Your name is saved" : "Saved");
      if (renamed) router.refresh();
      onClose();
    } catch (e) {
      setProblem(e instanceof Error && !("status" in e) ? e.message : errorMessage(e));
      setPending(false);
    }
  }

  return (
    <Dialog title="Profile & preferences" sub={`${user.email} · ${user.role} at ${me.organization.name}`} icon={I.user} width={520} onClose={onClose}
      footer={<><span className="sp"></span><button className="btn" onClick={onClose} disabled={pending}>Cancel</button><button className="btn pri" onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save"}</button></>}>
      <Problem message={problem} />
      <div className="fld">
        <label htmlFor={`${id}-name`}>Your name</label>
        <input id={`${id}-name`} className="inp" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        <span className="fs12 mu">How teammates see you on loads, messages and the audit log. Your email is how you sign in.</span>
      </div>
      <div className="fld">
        <span className="lbl">Appearance</span>
        <div className="seg sm" role="group" aria-label="Appearance" style={{ alignSelf: "flex-start" }}>
          {[["system", "Like this device"], ["light", "Light"], ["dark", "Dark"]].map(([value, label]) => (
            <button key={value} className={clsx(theme === value && "on")} aria-pressed={theme === value} onClick={() => setTheme(value!)}>{label}</button>
          ))}
        </div>
        <span className="fs12 mu">Kept on this computer.</span>
      </div>
      <div className="hr"></div>
      <div className="fs13 w6">Change password</div>
      <div className="fld">
        <label htmlFor={`${id}-cur`}>Current password</label>
        <input id={`${id}-cur`} className="inp" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="r g12">
        <div className="fld f1">
          <label htmlFor={`${id}-new`}>New password</label>
          <input id={`${id}-new`} className="inp" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="fld f1">
          <label htmlFor={`${id}-again`}>New password again</label>
          <input id={`${id}-again`} className="inp" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </div>
      </div>
      <span className="fs12 mu">Changing it signs you out everywhere else.</span>
    </Dialog>
  );
}

function NotifyDialog({ onClose }: { onClose: () => void }) {
  const { can } = useConsole();
  const [stored, save] = usePreference<string[]>(MUTED_KEY, []);
  // Held here as well, so a box changes the moment it is clicked; the saved copy catches up.
  const [chosen, setChosen] = useState<string[] | null>(null);
  const muted = chosen ?? stored;
  const mine = NOTICES.filter((n) => n.needs.every((p) => can(p)));
  const toggle = (code: string) => {
    const next = muted.includes(code) ? muted.filter((c) => c !== code) : [...muted, code];
    setChosen(next);
    save(next);
  };
  return (
    <Dialog title="Notification settings" sub="What the bell tells you about in this company" icon={I.bell} width={520} onClose={onClose}
      footer={<><span className="sp"></span><button className="btn pri" onClick={onClose}>Done</button></>}>
      <div className="fs13 w6">Show in Notifications</div>
      {mine.length ? (
        <div className="c g6">
          {mine.map((n) => (
            <label key={n.code} className="r g8 fs13" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={!muted.includes(n.code)} onChange={() => toggle(n.code)} />
              <span>{n.label}</span>
            </label>
          ))}
        </div>
      ) : (
        <p className="fs13 mu">Your role isn’t told about anything yet.</p>
      )}
      <div className="hr"></div>
      <div className="fs13 w6">Where you’re told</div>
      <div className="c g6 fs13">
        <div className="r g8"><Icon className="s14" d={I.bell} /><span className="f1">In FlyFleet, under the bell</span><span className="badge" data-k="ok"><i></i>On</span></div>
        <div className="r g8"><Icon className="s14" d={I.msg} /><span className="f1">Email</span><span className="badge" data-k="mu"><i></i>Not connected</span></div>
        <div className="r g8"><Icon className="s14" d={I.phone} /><span className="f1">Text message</span><span className="badge" data-k="mu"><i></i>Not connected</span></div>
      </div>
      <span className="fs12 mu">Email and text need a sending service, which isn’t set up for this FlyFleet installation. Fleet alert policies decide who is told about speeding and other alerts on the road.</span>
    </Dialog>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" sub="They work anywhere in FlyFleet, except while typing in a box" icon={I.kbd} width={480} onClose={onClose}
      footer={<><span className="sp"></span><button className="btn pri" onClick={onClose}>Done</button></>}>
      <div className="c g8">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={what} className="r g8 fs13">
            <span className="r g4" style={{ minWidth: "72px" }}>{keys.map((k) => <span key={k} className="kbd">{k}</span>)}</span>
            <span className="f1">{what}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const { me, set, openPalette, toggleAI } = useConsole();
  const go = (patch: Record<string, unknown>) => set({ acct: null, ...patch });
  return (
    <Dialog title="Help & support" sub={`FlyFleet for ${me.organization.name}`} icon={I.help} width={520} onClose={onClose}
      footer={<><span className="sp"></span><button className="btn pri" onClick={onClose}>Done</button></>}>
      <div className="c g10">
        <button className="menui" onClick={() => { set({ acct: null }); openPalette(); }}>
          <Icon d={I.search} />
          <span className="f1 c"><span className="fs13 w5">Find anything</span><span className="fs12 mu">Search loads, drivers, trucks, invoices and documents, or go to any screen · ⌘K</span></span>
        </button>
        <button className="menui" onClick={() => { set({ acct: null }); toggleAI(); }}>
          <Icon d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
          <span className="f1 c"><span className="fs13 w5">Ask FlyFleet</span><span className="fs12 mu">Questions answered from the records your role can see</span></span>
        </button>
        <button className="menui" onClick={() => go({ acct: "keys" })}>
          <Icon d={I.kbd} />
          <span className="f1 c"><span className="fs13 w5">Keyboard shortcuts</span><span className="fs12 mu">Press ? anywhere</span></span>
        </button>
      </div>
      <div className="hr"></div>
      <div className="fs13 w6">Need access, a teammate or a change?</div>
      <p className="fs13 t2">{`Owners and administrators of ${me.organization.name} manage the team, roles and company settings. On a screen your role can’t open, Request access asks them for you.`}</p>
    </Dialog>
  );
}
