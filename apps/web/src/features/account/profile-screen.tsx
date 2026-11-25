"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { Confirm, Problem } from "@/components/feedback/dialog";
import { ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { SettingsFrame } from "@/features/administration/settings-frame";
import { signOut } from "@/features/auth/switch-organization";
import { useConsole, useDensity, useTheme } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { startPages } from "@/features/console/shell";
import { useLocalPreference } from "@/hooks/use-local-preference";
import { usePreference } from "@/hooks/use-preference";
import { api, unwrap } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { postJson } from "@/lib/api/post";
import { timeZoneLabel } from "@/lib/format/dates";
import { activeAgo, describeDevice } from "@/lib/format/devices";

export const START_PAGE_KEY = "start_page";

/** Every time zone the browser knows, for the time zone picker. */
function timeZones(current: string | null | undefined): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  return current && !zones.includes(current) ? [current, ...zones] : zones;
}

/**
 * Profile & preferences: who you are to your teammates, how FlyFleet looks for you, and where you are signed
 * in. Personal, so every role can open it. Passwords are changed elsewhere, under Security & privacy.
 */
export function ProfileScreen() {
  const { me, can, notify } = useConsole();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = useId();
  const user = me.user;
  const [startPage, , { ready }] = usePreference<string>(START_PAGE_KEY, "dashboard");
  const pages = useMemo(() => startPages(can), [can]);
  const zones = useMemo(() => timeZones(user.timezone), [user.timezone]);

  const saved = { full_name: user.full_name, phone: user.phone ?? "", timezone: user.timezone ?? "", start: startPage };
  const [edits, setEdits] = useState<Partial<typeof saved>>({});
  const form = { ...saved, ...edits };
  const changed = (Object.keys(edits) as (keyof typeof saved)[]).filter((key) => edits[key] !== saved[key]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Theme and density take effect the moment they are picked, and are kept on this computer.
  const [, setTheme] = useLocalPreference("ff.theme", "system");
  const [, setDensity] = useLocalPreference("ff.density", "compact");
  const theme = useTheme();
  const density = useDensity();

  async function save() {
    setProblem(null);
    setErrors({});
    if (!form.full_name.trim()) {
      setErrors({ full_name: "Enter your name" });
      return setProblem("Enter your name");
    }
    setPending(true);
    try {
      const profile = changed.filter((key) => key !== "start");
      if (profile.length) {
        const body = Object.fromEntries(profile.map((key) => [key, form[key].trim()]));
        await unwrap(api.PATCH("/api/v1/auth/me", { body }));
      }
      if (changed.includes("start")) {
        await unwrap(api.PUT("/api/v1/preferences/{key}", { params: { path: { key: START_PAGE_KEY } }, body: { value: form.start } }));
        await queryClient.invalidateQueries({ queryKey: [me.organization.id, "preferences"] });
      }
      setEdits({});
      notify(changed.length ? "Your profile and preferences are saved" : "Nothing to save");
      if (profile.length) router.refresh();
    } catch (error) {
      setErrors(error instanceof ApiError ? error.fieldErrors : {});
      setProblem(errorMessage(error));
    }
    setPending(false);
  }

  const field = (key: "full_name" | "phone") => ({
    id: `${id}-${key}`,
    className: clsx("inp", errors[key] && "err"),
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setEdits({ ...edits, [key]: event.target.value }),
  });

  return (
    <SettingsFrame
      current="profile"
      sub="How teammates see you, how FlyFleet looks for you, and where you’re signed in"
      actions={
        <button className="btn pri" onClick={() => void save()} disabled={pending || !ready}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      }
    >
      <div className="c g16" style={{ maxWidth: "760px" }}>
        <Problem message={problem} />

        <section className="card" aria-labelledby={`${id}-profile`}>
          <div className="ch"><h2 id={`${id}-profile`} className="fs14 w6">Profile</h2></div>
          <div className="sgrid">
            <div className="fld" style={{ gridColumn: "span 3" }}>
              <label htmlFor={`${id}-full_name`}>Full name</label>
              <input {...field("full_name")} maxLength={120} autoComplete="name" />
              {errors.full_name ? <span className="errt">{errors.full_name}</span> : <span className="hint">How teammates see you on loads, messages and the audit log</span>}
            </div>
            <div className="fld" style={{ gridColumn: "span 3" }}>
              <label htmlFor={`${id}-email`}>Sign-in email</label>
              <input id={`${id}-email`} className="inp" value={user.email} readOnly aria-readonly="true" />
              <span className="hint">How you sign in. It can’t be changed here.</span>
            </div>
            <div className="fld" style={{ gridColumn: "span 3" }}>
              <label htmlFor={`${id}-phone`}>Mobile phone</label>
              <input {...field("phone")} type="tel" maxLength={40} autoComplete="tel" placeholder="+1 312 555 0142" />
              {errors.phone ? <span className="errt">{errors.phone}</span> : null}
            </div>
            <div className="fld" style={{ gridColumn: "span 3" }}>
              <label htmlFor={`${id}-tz`}>Time zone</label>
              <select id={`${id}-tz`} className={clsx("inp", errors.timezone && "err")} value={form.timezone} onChange={(event) => setEdits({ ...edits, timezone: event.target.value })}>
                <option value="">{`The company’s (${me.organization.timezone})`}</option>
                {zones.map((zone) => (
                  <option key={zone} value={zone}>{`${zone.replaceAll("_", " ")} · ${timeZoneLabel(zone)}`}</option>
                ))}
              </select>
              {errors.timezone ? <span className="errt">{errors.timezone}</span> : null}
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby={`${id}-prefs`}>
          <div className="ch"><h2 id={`${id}-prefs`} className="fs14 w6">Preferences</h2></div>
          <div className="cb c g14">
            <div className="r g12">
              <div className="f1 c g2">
                <span className="lbl" id={`${id}-theme`}>Theme</span>
                <span className="fs12 mu">Changes at once, on this computer</span>
              </div>
              <div className="seg sm" role="group" aria-labelledby={`${id}-theme`}>
                {(["light", "dark"] as const).map((value) => (
                  <button key={value} className={clsx(theme === value && "on")} aria-pressed={theme === value} onClick={() => setTheme(value)}>
                    <Icon className="s14" d={value === "light" ? I.sun : "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"} />
                    {value === "light" ? "Light" : "Dark"}
                  </button>
                ))}
              </div>
            </div>
            <div className="hr"></div>
            <div className="r g12">
              <div className="f1 c g2">
                <span className="lbl" id={`${id}-density`}>Density</span>
                <span className="fs12 mu">How tightly lists and tables are packed · changes at once</span>
              </div>
              <div className="seg sm" role="group" aria-labelledby={`${id}-density`}>
                {(["compact", "comfortable"] as const).map((value) => (
                  <button key={value} className={clsx(density === value && "on")} aria-pressed={density === value} onClick={() => setDensity(value)}>
                    {value === "compact" ? "Compact" : "Comfortable"}
                  </button>
                ))}
              </div>
            </div>
            <div className="hr"></div>
            <div className="r g12">
              <div className="f1 c g2">
                <label className="lbl" htmlFor={`${id}-start`}>Start page</label>
                <span className="fs12 mu">{`Where FlyFleet opens when you come to ${me.organization.name}`}</span>
              </div>
              <select id={`${id}-start`} className="inp" style={{ width: "220px" }} value={form.start} onChange={(event) => setEdits({ ...edits, start: event.target.value })} disabled={!ready}>
                {pages.some((page) => page.key === form.start) ? null : <option value={form.start}>Dashboard</option>}
                {pages.map((page) => (
                  <option key={page.key} value={page.key}>{page.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <SessionsCard />
      </div>
    </SettingsFrame>
  );
}

/** Where you are signed in: this device first, each with its own Sign out, and all the others at once. */
function SessionsCard() {
  const { notify } = useConsole();
  const id = useId();
  const sessions = useQuery({ queryKey: ["auth", "sessions"], queryFn: () => unwrap(api.GET("/api/v1/auth/sessions")), staleTime: 15_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const rows = sessions.data ?? [];
  const others = rows.filter((row) => !row.current);

  async function end(sessionId: string) {
    setBusy(sessionId);
    try {
      await unwrap(api.DELETE("/api/v1/auth/sessions/{session_id}", { params: { path: { session_id: sessionId } } }));
      notify("That device is signed out");
      await sessions.refetch();
    } catch (error) {
      notify(errorMessage(error), true);
    }
    setBusy(null);
  }

  return (
    <section className="card oh" aria-labelledby={`${id}-sessions`}>
      <div className="ch">
        <h2 id={`${id}-sessions`} className="fs14 w6 f1">Sessions</h2>
        <button className="btn sm" onClick={() => setConfirmAll(true)} disabled={!others.length}>Sign out of all other sessions</button>
      </div>
      {sessions.isError ? (
        <ErrorState error={sessions.error} retry={() => void sessions.refetch()} />
      ) : sessions.isPending ? (
        <div className="cb"><Skeleton /></div>
      ) : (
        <ul>
          {rows.map((row) => {
            const device = describeDevice(row.user_agent);
            return (
              <li key={row.id} className="sesrow">
                <span className="paic"><Icon className="s14" d={/iOS|Android/.test(device) ? I.mobile : I.cpu} /></span>
                <div className="f1 c">
                  <span className="r g8 fs13 w5">
                    {device}
                    {row.current ? <span className="badge" data-k="ok"><i></i>This device</span> : null}
                  </span>
                  <span className="fs12 mu">{[row.current ? "Active now" : activeAgo(row.last_seen_at), row.ip_address, `signed in ${new Date(row.created_at).toLocaleDateString()}`].filter(Boolean).join(" · ")}</span>
                </div>
                <button className="btn sm" onClick={() => (row.current ? void signOut() : void end(row.id))} disabled={busy === row.id} aria-label={row.current ? "Sign out of this device" : `Sign out ${device}`}>
                  {busy === row.id ? "Signing out…" : "Sign out"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {confirmAll ? (
        <Confirm
          title="Sign out of all other sessions?"
          text={`Every other browser and device signed in as you is signed out now. This one stays signed in.`}
          confirm="Sign out others"
          destructive
          onClose={() => setConfirmAll(false)}
          run={async () => {
            await postJson("/api/auth/sessions/sign-out-others", {});
            notify("Every other session is signed out");
            await sessions.refetch();
          }}
        />
      ) : null}
    </section>
  );
}
