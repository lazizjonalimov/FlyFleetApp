"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useId, useState } from "react";
import { Confirm, Problem } from "@/components/feedback/dialog";
import { ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { SettingsFrame } from "@/features/administration/settings-frame";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { postJson } from "@/lib/api/post";
import type { Schema } from "@/lib/api/types";
import { describeDevice } from "@/lib/format/devices";
import { rules } from "@/lib/passwords";
import { Requirements, StrengthMeter } from "./password-fields";

type Security = Schema<"SecurityOut">;
type Setup = Schema<"AuthenticatorSetupOut">;
const KEY = ["auth", "security"];

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** "5 months ago", "3 days ago", "today". */
export function ago(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 31) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

/** A switch in the design's style: a real button that says whether it is on. */
function Toggle({ on, label, disabled, onClick }: { on: boolean; label: string; disabled?: boolean; onClick: () => void }) {
  return <button type="button" className={clsx("tog", on && "on")} aria-pressed={on} aria-label={label} disabled={disabled} onClick={onClick}></button>;
}

/**
 * Security & privacy: your password and how you sign in. Personal, so every role can open it, and it applies to
 * every company you can open. The API enforces every rule shown here.
 */
export function SecurityScreen() {
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/v1/auth/security")) });
  return (
    <SettingsFrame current="security" sub="Your password and how you sign in · applies to every company you can open">
      <div className="c g16" style={{ maxWidth: "720px" }}>
        {query.data ? (
          <>
            <Checkup state={query.data} />
            <TwoFactorCard state={query.data} />
            <PasswordCard state={query.data} />
            <ActivityCard />
            <PrivacyCard state={query.data} />
          </>
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          <Skeleton />
        )}
      </div>
    </SettingsFrame>
  );
}

function Checkup({ state }: { state: Security }) {
  const { set } = useConsole();
  const tf = state.two_factor;
  const password = state.password;
  return (
    <section aria-label="Security checkup" className="kpis" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
      <div className="kpi">
        <span className="kl"><Icon className="s14" d={I.key} />Password</span>
        <span className="kv2" style={{ fontSize: "20px", lineHeight: "28px" }}>{password.strength ?? "Not rated"}</span>
        <span className="ks mu">{password.changed_at ? `Changed ${day(password.changed_at)}` : `Set ${day(password.since)}`}</span>
      </div>
      <div className="kpi">
        <span className="kl"><Icon className="s14" d={I.shield} />Two-step verification</span>
        <span className="kv2" style={{ fontSize: "20px", lineHeight: "28px" }}>{tf.enabled ? "On" : "Off"}</span>
        <span className="ks mu">{tf.required ? "Required for your role" : tf.enabled ? "Authenticator app" : "Turn on to protect your account"}</span>
      </div>
      <button type="button" className="kpi" onClick={() => set(goTo("profile"))}>
        <span className="kl"><Icon className="s14" d={I.cpu} />Active sessions</span>
        <span className="kv2" style={{ fontSize: "20px", lineHeight: "28px" }}>{state.active_sessions}</span>
        <span className="ks mu">Review where you are signed in</span>
      </button>
    </section>
  );
}

// ---------------------------------------------------------------- two-step verification
function TwoFactorCard({ state }: { state: Security }) {
  const { me, notify } = useConsole();
  const queryClient = useQueryClient();
  const id = useId();
  const tf = state.two_factor;
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [codesOpen, setCodesOpen] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const shownOn = tf.enabled || tf.required || !!setup;
  const phone = me.user.phone ? me.user.phone.replace(/\d(?=(?:\D*\d){4})/g, "•") : null;
  const refresh = (next: Security) => queryClient.setQueryData(KEY, next);

  async function start() {
    setPending("setup");
    setProblem(null);
    try {
      setSetup(await unwrap(api.POST("/api/v1/auth/security/authenticator")));
      setCode("");
    } catch (error) {
      notify(errorMessage(error), true);
    }
    setPending(null);
  }

  async function cancel() {
    setSetup(null);
    setProblem(null);
    await api.DELETE("/api/v1/auth/security/authenticator/setup").catch(() => undefined);
  }

  async function verify() {
    setPending("verify");
    setProblem(null);
    try {
      const done = await unwrap(api.POST("/api/v1/auth/security/authenticator/verify", { body: { code } }));
      refresh(done.state);
      setSetup(null);
      if (done.backup_codes.length) {
        setCodes(done.backup_codes);
        setCodesOpen(true);
      }
      notify("Authenticator app verified");
    } catch (error) {
      setProblem(errorMessage(error));
    }
    setPending(null);
  }

  function download() {
    const text = `FlyFleet backup codes for ${state.email}\nEach code works once.\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "flyfleet-backup-codes.txt" });
    link.click();
    URL.revokeObjectURL(url);
  }

  async function setRemember(on: boolean) {
    try {
      refresh(await unwrap(api.PATCH("/api/v1/auth/security", { body: { remember_device: on } })));
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }

  return (
    <section className="card oh" aria-labelledby={`${id}-h`}>
      <div className="ch">
        <h2 id={`${id}-h`} className="fs14 w6 f1">Two-step verification</h2>
        {tf.required ? <span className="tag" data-k="info">Required for your role</span> : null}
        <span className="fs13 w5">{tf.enabled ? "On" : "Off"}</span>
        <Toggle on={shownOn} label="Two-step verification" disabled={tf.required || pending !== null}
          onClick={() => (tf.enabled ? setConfirmOff(true) : setup ? void cancel() : void start())} />
      </div>
      <div className="cb c g12">
        <p className="fs13 t2">After your password, FlyFleet asks for a second step, so a stolen password alone can’t open your account. It protects every company you can open.</p>
        {!shownOn ? (
          <div className="banner" data-k="warn" role="status">
            <Icon className="s14" d={I.alert} />
            <div className="f1">Two-step verification is off. Anyone with your password can sign in.</div>
          </div>
        ) : !tf.enabled && !setup ? (
          <div className="banner" data-k="warn" role="status">
            <Icon className="s14" d={I.alert} />
            <div className="f1">Your role requires two-step verification. Set up an authenticator app to finish turning it on.</div>
          </div>
        ) : null}
      </div>

      {shownOn ? (
        <>
          <div className="mrow">
            <span className="paic"><Icon className="s14" d={I.mobile} /></span>
            <div className="f1 c g2">
              <span className="r g6 fs13 w6">Authenticator app <span className="tag" data-k="ok">Recommended</span>{tf.enabled ? <span className="tag" data-k="ok">Active</span> : null}</span>
              <span className="fs12 mu">{tf.enabled && tf.authenticator_added_at ? `Codes from an app on your phone · added ${day(tf.authenticator_added_at)}` : "Codes from an app on your phone, such as Google Authenticator or 1Password"}</span>
            </div>
            <button type="button" className="btn sm" onClick={() => void start()} disabled={pending !== null || !!setup}>{tf.enabled ? "Replace" : "Set up"}</button>
          </div>
          {setup ? (
            <div className="setup" role="group" aria-label="Set up an authenticator app">
              {/* eslint-disable-next-line @next/next/no-img-element -- an SVG the API drew, as a data URI: nothing to optimize */}
              <div className="qr"><img src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qr_svg)}`} alt="QR code to scan with your authenticator app" width={164} height={164} /></div>
              <div className="c g10">
                <p className="fs13">1. Scan the code with your authenticator app, or type in this setup key:</p>
                <code className="mono fs13 w6" style={{ wordBreak: "break-all" }} aria-label="Setup key">{setup.setup_key}</code>
                <div className="fld">
                  <label htmlFor={`${id}-code`}>2. Enter the 6-digit code it shows</label>
                  <input id={`${id}-code`} className={clsx("inp mono", problem && "err")} style={{ width: "160px", letterSpacing: ".2em" }} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} aria-invalid={problem ? true : undefined} />
                </div>
                <Problem message={problem} />
                <div className="r g8">
                  <button type="button" className="btn pri sm" onClick={() => void verify()} disabled={code.length !== 6 || pending !== null}>{pending === "verify" ? "Checking…" : "Verify and save"}</button>
                  <button type="button" className="btn sm" onClick={() => void cancel()}>Cancel</button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="mrow">
            <span className="paic"><Icon className="s14" d={I.msg} /></span>
            <div className="f1 c g2">
              <span className="r g6 fs13 w6">Text message (SMS) <span className="tag" data-k="mu">Not available</span></span>
              <span className="fs12 mu">{phone ? `Codes sent to ${phone} · backup only. ` : "Backup only. "}Needs a text-message provider, which isn’t connected to this FlyFleet installation yet.</span>
            </div>
            <button type="button" className="btn sm" disabled>Add</button>
          </div>
          <div className="mrow">
            <span className="paic"><Icon className="s14" d={I.key} /></span>
            <div className="f1 c g2">
              <span className="r g6 fs13 w6">Passkey or security key <span className="tag" data-k="info">Phishing-resistant</span><span className="tag" data-k="mu">Not available</span></span>
              <span className="fs12 mu">Sign in with your device’s fingerprint, face or a hardware key. Not supported by FlyFleet yet.</span>
            </div>
            <button type="button" className="btn sm" disabled>Add</button>
          </div>
          {tf.enabled ? (
            <>
              <div className="mrow">
                <div className="f1 c g2">
                  <span className="fs13 w6">{`Remember this device for ${tf.remember_days} days`}</span>
                  <span className="fs12 mu">{tf.remember_days < 30 ? "Your role is asked again after 7 days." : "Admins are asked again after 7 days."} Changing your password forgets every device.</span>
                </div>
                <Toggle on={tf.remember_device} label={`Remember this device for ${tf.remember_days} days`} onClick={() => void setRemember(!tf.remember_device)} />
              </div>
              <div className="mrow" style={{ flexWrap: "wrap" }}>
                <div className="f1 c g2">
                  <span className="fs13 w6">Backup codes</span>
                  <span className="fs12 mu">{`${tf.backup_codes_unused} of ${tf.backup_codes_total} unused · each works once if you lose your phone`}</span>
                </div>
                <button type="button" className="btn sm" aria-expanded={codesOpen} aria-controls={`${id}-codes`} onClick={() => setCodesOpen(!codesOpen)}>{codesOpen ? "Hide codes" : "Show codes"}</button>
                {codesOpen ? (
                  <div id={`${id}-codes`} className="c g10" style={{ flexBasis: "100%" }}>
                    {codes.length ? (
                      <>
                        <p className="fs12 mu">Save these now. They’re shown only this once; FlyFleet keeps only a scrambled copy.</p>
                        <ul className="codes" aria-label="Backup codes">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
                      </>
                    ) : (
                      <p className="fs12 mu">For your safety, codes are shown only once, when they’re made. To see codes, generate a new set; the old ones stop working.</p>
                    )}
                    <div className="r g8">
                      {codes.length ? <button type="button" className="btn sm" onClick={download}><Icon className="s14" d={I.download} />Download</button> : null}
                      <button type="button" className="btn sm" onClick={() => setConfirmNew(true)}><Icon className="s14" d={I.refresh} />Generate new codes</button>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {confirmOff ? (
        <Confirm title="Turn off two-step verification?" text="Your authenticator app and backup codes are removed. Anyone with your password could then sign in." confirm="Turn off" destructive
          onClose={() => setConfirmOff(false)}
          run={async () => {
            refresh(await unwrap(api.DELETE("/api/v1/auth/security/authenticator")));
            setCodes([]);
            notify("Two-step verification is off");
          }} />
      ) : null}
      {confirmNew ? (
        <Confirm title="Generate new backup codes?" text="Your old backup codes stop working at once." confirm="Generate new codes"
          onClose={() => setConfirmNew(false)}
          run={async () => {
            const fresh = await unwrap(api.POST("/api/v1/auth/security/backup-codes"));
            refresh(fresh.state);
            setCodes(fresh.codes);
            setCodesOpen(true);
            notify("New backup codes made · the old ones no longer work");
          }} />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- password
function PasswordCard({ state }: { state: Security }) {
  const { notify } = useConsole();
  const queryClient = useQueryClient();
  const id = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const passing = rules(next, current).every((rule) => rule.met);
  const ready = !!current && passing && next === again;

  async function update() {
    setPending("update");
    setProblem(null);
    try {
      await postJson("/api/auth/password", { current_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setAgain("");
      await queryClient.invalidateQueries({ queryKey: KEY });
      notify("Password updated · other sessions signed out");
    } catch (error) {
      setProblem(errorMessage(error));
    }
    setPending(null);
  }

  async function sendReset() {
    setPending("reset");
    try {
      const sent = await unwrap(api.POST("/api/v1/auth/password-reset"));
      notify(`Reset link sent to ${sent.email}`);
    } catch (error) {
      notify(errorMessage(error), true);
    }
    setPending(null);
  }

  const since = state.password.changed_at ?? state.password.since;
  return (
    <section className="card" aria-labelledby={`${id}-h`}>
      <div className="ch">
        <h2 id={`${id}-h`} className="fs14 w6 f1">Password</h2>
        <span className="fs12 mu">{`${state.password.changed_at ? "Last changed" : "Set"} ${day(since)} · ${ago(since)}`}</span>
      </div>
      <form className="cb c g12" noValidate onSubmit={(event) => { event.preventDefault(); if (ready) void update(); }}>
        <input type="text" name="username" autoComplete="username" value={state.email} readOnly hidden />
        <Problem message={problem} />
        <div className="fld">
          <label htmlFor={`${id}-cur`}>Current password</label>
          <input id={`${id}-cur`} className="inp" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="fld">
          <label htmlFor={`${id}-new`}>New password</label>
          <input id={`${id}-new`} className="inp" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-describedby={`${id}-meter ${id}-rules`} />
        </div>
        <StrengthMeter id={`${id}-meter`} password={next} />
        <Requirements id={`${id}-rules`} password={next} current={current} />
        <div className="fld">
          <label htmlFor={`${id}-again`}>Confirm new password</label>
          <input id={`${id}-again`} className="inp" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} aria-describedby={`${id}-match`} />
          <span id={`${id}-match`} className={clsx("fs12", again && next === again ? "pwok" : "mu")} aria-live="polite">{again ? (next === again ? "Passwords match" : "Passwords don’t match yet") : ""}</span>
        </div>
        <div className="r">
          <button type="submit" className="btn pri" disabled={!ready || pending !== null}>{pending === "update" ? "Updating…" : "Update password"}</button>
        </div>
        <div className="hr"></div>
        <div className="r g12" style={{ flexWrap: "wrap" }}>
          <div className="f1 c g2" style={{ minWidth: "240px" }}>
            <span className="fs13 w6">Forgot your current password?</span>
            <span className="fs12 mu">{`We’ll email a one-time link to ${state.email}. It expires in 30 minutes.`}</span>
          </div>
          <button type="button" className="btn sm" onClick={() => void sendReset()} disabled={pending !== null}>{pending === "reset" ? "Sending…" : "Email me a reset link"}</button>
        </div>
        <p className="note"><Icon className="s14" d={I.info} /><span>Changing your password signs you out of every other session and forgets remembered devices.</span></p>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- recent sign-in activity
const EVENTS: Record<string, { label: string; tag: string; k: string }> = {
  signed_in: { label: "Signed in", tag: "Allowed", k: "ok" },
  new_device: { label: "New device signed in", tag: "New device", k: "warn" },
  failed_password: { label: "Failed sign-in attempt", tag: "Blocked", k: "bad" },
  failed_second_step: { label: "Wrong two-step code", tag: "Blocked", k: "bad" },
};

function ActivityCard() {
  const { set } = useConsole();
  const id = useId();
  const activity = useQuery({ queryKey: ["auth", "activity"], queryFn: () => unwrap(api.GET("/api/v1/auth/security/activity")) });
  const rows = activity.data ?? [];
  const here = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const thisDevice = rows.find((row) => (row.kind === "signed_in" || row.kind === "new_device") && row.user_agent === here)?.id;
  return (
    <section className="card oh" aria-labelledby={`${id}-h`}>
      <div className="ch">
        <h2 id={`${id}-h`} className="fs14 w6 f1">Recent sign-in activity</h2>
        <button type="button" className="btn sm" onClick={() => set(goTo("profile"))}>Manage sessions</button>
      </div>
      {activity.isError ? (
        <ErrorState error={activity.error} retry={() => void activity.refetch()} />
      ) : activity.isPending ? (
        <div className="cb"><Skeleton /></div>
      ) : rows.length ? (
        <ul aria-label="Recent sign-ins">
          {rows.slice(0, 8).map((row) => {
            const event = EVENTS[row.kind]!;
            return (
              <li key={row.id} className="actrow">
                <div className="f1 c g2">
                  <span className="fs13 w5">{event.label}{row.id === thisDevice ? " (this device)" : ""}</span>
                  <span className="fs12 mu">{[describeDevice(row.user_agent), row.ip_address].filter(Boolean).join(" · ")}</span>
                </div>
                <span className="fs12 mu nw">{new Date(row.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <span className="badge" data-k={event.k}><i></i>{event.tag}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="cb fs13 mu">No sign-ins recorded yet.</p>
      )}
      <p className="note" style={{ padding: "10px 16px 14px" }}><Icon className="s14" d={I.info} /><span>Don’t recognize one? Change your password and sign out other sessions right away.</span></p>
    </section>
  );
}

// ---------------------------------------------------------------- privacy
function PrivacyCard({ state }: { state: Security }) {
  const { notify } = useConsole();
  const queryClient = useQueryClient();
  const id = useId();
  const [pending, setPending] = useState(false);
  const privacy = state.privacy;

  async function change(body: { support_access?: boolean; share_usage?: boolean }, done: string) {
    try {
      queryClient.setQueryData(KEY, await unwrap(api.PATCH("/api/v1/auth/security", { body })));
      notify(done);
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }

  async function exportData() {
    setPending(true);
    try {
      await unwrap(api.POST("/api/v1/auth/security/data-export"));
      notify("Your data export is being prepared · we’ll email a link");
    } catch (error) {
      notify(errorMessage(error), true);
    }
    setPending(false);
  }

  return (
    <section className="card oh" aria-labelledby={`${id}-h`}>
      <div className="ch"><h2 id={`${id}-h`} className="fs14 w6">Privacy</h2></div>
      <div className="actrow" style={{ borderTop: "none" }}>
        <div className="f1 c g2">
          <span className="fs13 w6">Let FlyFleet Support view my account</span>
          <span className="fs12 mu">{privacy.support_access_until
            ? `On until ${new Date(privacy.support_access_until).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. Every view is logged.`
            : "Only while a support ticket is open. Access ends after 24 hours, and every view is logged."}</span>
        </div>
        <Toggle on={!!privacy.support_access_until} label="Let FlyFleet Support view my account"
          onClick={() => void change({ support_access: !privacy.support_access_until }, privacy.support_access_until ? "Support access ended" : "Support can view your account for 24 hours")} />
      </div>
      <div className="actrow">
        <div className="f1 c g2">
          <span className="fs13 w6">Share product usage to improve FlyFleet</span>
          <span className="fs12 mu">Counts only, such as which screens are used. Never loads, rates, documents or driver data.</span>
        </div>
        <Toggle on={privacy.share_usage} label="Share product usage to improve FlyFleet"
          onClick={() => void change({ share_usage: !privacy.share_usage }, privacy.share_usage ? "Usage sharing is off" : "Usage sharing is on")} />
      </div>
      <div className="actrow">
        <div className="f1 c g2">
          <span className="fs13 w6">Download my data</span>
          <span className="fs12 mu">Your profile, companies, preferences, sessions and sign-ins, as a file.</span>
        </div>
        <button type="button" className="btn sm" onClick={() => void exportData()} disabled={pending}>{pending ? "Requesting…" : "Request export"}</button>
      </div>
    </section>
  );
}
