"use client";

import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { signOut } from "@/features/auth/switch-organization";
import { useConsole } from "@/features/console/console-provider";
import { plural } from "@/lib/format/text";

/** Search, Ask FlyFleet, Create, help, notifications and the account menu. */
export function TopBar() {
  const { me, toggleSb, sbLabel, sbExp, sbIcon, openPalette, I, aiOn, toggleAI, toggleCreate, createExp, isCreate, CR, notifOn, toggleNotif, alertCount, acctOn, toggleAcct, acctExp, user, isAcct, org, ACCT, openHelp } = useConsole();
  // A dispatch team's dispatcher sees only the team's trucks; the chip says so wherever they are.
  const scope = me.scope;
  const scopeLabel = scope ? (scope.team_name ? `${scope.team_name} · ${plural(scope.trucks, "truck")}` : "No team · no trucks") : "";
  const scopeTip = scope ? (scope.team_name ? `You see only ${scope.team_name}’s trucks and the loads, drivers and alerts on them` : "You’re on no dispatch team, and the company has set dispatchers on no team to see no trucks") : "";
  return (
    <header className="tb">
      <button className="btn ghost icon hdtog" onClick={toggleSb} aria-label={sbLabel} title={sbLabel} aria-expanded={sbExp}><Icon d={sbIcon} /></button>
      <button className="gs" onClick={openPalette} aria-label="Search, press Command K">
        <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
        <span className="f1 ell">Search loads, drivers, trucks, invoices…</span>
        <span className="kbd">⌘K</span>
      </button>
      {scope ? (
        <span className="scope" title={scopeTip}>
          <Icon className="s14" d={I.truck} />
          {scopeLabel}
        </span>
      ) : null}
      <span className="sp"></span>
      <button className={clsx("btn ghost", aiOn)} onClick={toggleAI}>
        <Icon className="s14" d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z" />
        Ask FlyFleet
      </button>
      <div className="mwrap">
        <button className="btn pri" onClick={toggleCreate} aria-haspopup="menu" aria-expanded={createExp}>
          <Icon className="s14 b" d="M12 5v14M5 12h14" />
          Create
          <span className="spl"></span>
          <Icon className="s12 b" d="M6 9l6 6 6-6" />
        </button>
        {isCreate ? (
          <div className="menu" role="menu" aria-label="Create">
            {CR.map((m, i) => (
              <button key={i} className="menui" role="menuitem" onClick={m.go}>
                <span className="paic"><Icon className="s14" d={m.ic} /></span>
                <span className="f1 c">
                  <span className="fs13 w5 tx"><span>{m.t}</span></span>
                  <span className="fs12 mu"><span>{m.s}</span></span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button className="btn ghost icon" aria-label="Help center" title="Help center" onClick={openHelp}>
        <Icon className="s18" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
      </button>
      <button className={clsx("btn ghost icon", notifOn)} style={{ position: "relative" }} onClick={toggleNotif} aria-label={alertCount ? `Notifications, ${alertCount} to look at` : "Notifications"}>
        <Icon className="s18" d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        {alertCount ? (
          <span className="ndot"></span>
        ) : null}
      </button>
      <span className="vdiv"></span>
      <div className="mwrap">
        <button className={clsx("me", acctOn)} onClick={toggleAcct} aria-label="Account menu" aria-haspopup="menu" aria-expanded={acctExp}>
          <span className="av md me"><span>{user.ini}</span></span>
          <span className="c">
            <span className="fs13 w5 tx"><span>{user.name}</span></span>
            <span className="fs11 mu"><span>{user.role}</span></span>
          </span>
          <Icon className="s14 mu" d="M6 9l6 6 6-6" />
        </button>
        {isAcct ? (
          <div className="menu" role="menu" aria-label="Account" style={{ width: "288px" }}>
            <div className="r g10" style={{ padding: "8px 8px 10px" }}>
              <span className="av md me"><span>{user.ini}</span></span>
              <div className="f1">
                <div className="fs13 w6 tx ell"><span>{user.name}</span></div>
                <div className="fs12 mu ell"><span>{user.email}</span></div>
              </div>
            </div>
            <div className="r g6" style={{ padding: "0 8px 10px" }}>
              <span className="tag" data-k="brand"><span>{user.role}</span></span>
              <span className="fs12 mu ell"><span>{org.name}</span></span>
            </div>
            <div className="hr"></div>
            {ACCT.map((m, i) => (
              <button key={i} className="menui" role="menuitem" onClick={m.go}>
                <Icon d={m.ic} />
                <span className="f1"><span>{m.t}</span></span>
                {m.kbd ? (
                  <span className="kbd"><span>{m.kbd}</span></span>
                ) : null}
              </button>
            ))}
            <div className="hr"></div>
            <button className="menui" role="menuitem" onClick={() => void signOut()}>
              <Icon d={I.logout} />
              <span className="f1">Sign out</span>
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
