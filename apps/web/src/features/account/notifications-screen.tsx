"use client";

import { clsx } from "clsx";
import { useId } from "react";
import { Icon } from "@/components/ui/icon";
import { SettingsFrame } from "@/features/administration/settings-frame";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { MUTED_KEY, NOTICES } from "@/features/shell/account-dialogs";
import { usePreference } from "@/hooks/use-preference";

export const CHANNELS_KEY = "notifications.channels";

export const CHANNELS = [
  { key: "in_app", label: "In app", icon: I.bell },
  { key: "email", label: "Email", icon: I.mail },
  { key: "telegram", label: "Telegram", icon: I.send },
  { key: "push", label: "Push", icon: I.mobile },
] as const;
export type Channel = (typeof CHANNELS)[number]["key"];

/** The alert types you choose channels for. `bell` names what the bell shows for each, so In app decides it. */
export const ALERT_TYPES: { key: string; label: string; bell: string[] }[] = [
  { key: "loads_late", label: "Load late or at risk", bell: ["LOADS_AT_RISK"] },
  { key: "safety", label: "Speeding and safety", bell: ["DRIVERS_BLOCKED", "UNITS_BLOCKED"] },
  { key: "driver_messages", label: "Driver messages", bell: [] },
  { key: "assignments", label: "Assignments", bell: ["LOADS_UNASSIGNED"] },
  { key: "documents", label: "Documents to review", bell: ["DOCUMENTS_TO_REVIEW", "POD_REVIEW"] },
  { key: "compliance", label: "Compliance expiring", bell: ["EXPIRING_SOON"] },
];

type Choices = Record<string, Channel[]>;
const DEFAULT: Channel[] = ["in_app"];

/** What a person's choices become after one cell is flipped. Pure, so it can be tested on its own. */
export function flip(choices: Choices, muted: string[], type: (typeof ALERT_TYPES)[number], channel: Channel): { choices: Choices; muted: string[] } {
  const current = choices[type.key] ?? DEFAULT;
  const on = !current.includes(channel);
  const next = { ...choices, [type.key]: on ? [...current, channel] : current.filter((c) => c !== channel) };
  if (channel !== "in_app") return { choices: next, muted };
  // In app is the bell: turning it off for a type mutes what the bell shows for it, and back.
  const rest = muted.filter((code) => !type.bell.includes(code));
  return { choices: next, muted: on ? rest : [...rest, ...type.bell] };
}

/**
 * Notifications: which alerts reach you, and where. Personal, so every role can open it. Each cell is saved
 * the moment it is changed.
 */
export function NotificationsScreen() {
  const { can } = useConsole();
  const id = useId();
  const [choices, saveChoices] = usePreference<Choices>(CHANNELS_KEY, {});
  const [muted, saveMuted] = usePreference<string[]>(MUTED_KEY, []);
  const has = (type: (typeof ALERT_TYPES)[number], channel: Channel) =>
    channel === "in_app" && choices[type.key] === undefined ? !type.bell.length || type.bell.some((code) => !muted.includes(code)) : (choices[type.key] ?? DEFAULT).includes(channel);

  const toggle = (type: (typeof ALERT_TYPES)[number], channel: Channel) => {
    const base = choices[type.key] === undefined ? { ...choices, [type.key]: has(type, "in_app") ? DEFAULT : [] } : choices;
    const next = flip(base, muted, type, channel);
    saveChoices(next.choices);
    if (next.muted !== muted) saveMuted(next.muted);
  };

  // The bell's other kinds, which the grid doesn't cover, stay switchable one by one.
  const covered = new Set(ALERT_TYPES.flatMap((type) => type.bell));
  const others = NOTICES.filter((notice) => !covered.has(notice.code) && notice.needs.every((p) => can(p)));
  const toggleNotice = (code: string) => saveMuted(muted.includes(code) ? muted.filter((c) => c !== code) : [...muted, code]);

  return (
    <SettingsFrame current="notifications" sub="Which alerts reach you, and where · saved as you change them">
      <div className="c g16" style={{ maxWidth: "760px" }}>
        <section className="card oh" aria-labelledby={`${id}-grid`}>
          <div className="ch"><h2 id={`${id}-grid`} className="fs14 w6">Alerts by channel</h2></div>
          <div style={{ overflowX: "auto" }}>
            <table className="ntgrid">
              <thead>
                <tr>
                  <th scope="col">Alert</th>
                  {CHANNELS.map((channel) => (
                    <th key={channel.key} scope="col">
                      <span className="r g6" style={{ justifyContent: "center" }}><Icon className="s14" d={channel.icon} />{channel.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALERT_TYPES.map((type) => (
                  <tr key={type.key}>
                    <th scope="row" className="w5">{type.label}</th>
                    {CHANNELS.map((channel) => {
                      const on = has(type, channel.key);
                      return (
                        <td key={channel.key}>
                          <button className={clsx("sw5", on && "on")} role="switch" aria-checked={on} aria-label={`${type.label} by ${channel.label}`} onClick={() => toggle(type, channel.key)}><i></i></button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="banner" data-k="info" role="note">
          <Icon className="s14" d={I.info} />
          <div className="f1">In app shows under the bell right away. Email, Telegram and push need a sending service, which isn’t set up for this FlyFleet installation yet: your choices are kept and used once it is. Fleet alert policies decide who is told about each alert on the road.</div>
        </div>

        {others.length ? (
          <section className="card" aria-labelledby={`${id}-bell`}>
            <div className="ch"><h2 id={`${id}-bell`} className="fs14 w6">Also under the bell</h2></div>
            <div className="cb c g8">
              {others.map((notice) => (
                <label key={notice.code} className="r g8 fs13" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={!muted.includes(notice.code)} onChange={() => toggleNotice(notice.code)} />
                  <span>{notice.label}</span>
                </label>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </SettingsFrame>
  );
}
