"use client";

import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { I } from "@/features/console/icons";
import { rules, strength, STRENGTH_LABELS } from "@/lib/passwords";

/** The strength meter under a new password: four segments and a word, so it never relies on colour alone. */
export function StrengthMeter({ id, password }: { id: string; password: string }) {
  const score = strength(password);
  const label = password ? STRENGTH_LABELS[score]! : "";
  return (
    <div className="r g8" id={id} aria-live="polite">
      <div className="pwmeter f1" data-score={password ? score : -1} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <span key={i} className={clsx(password && i <= score && "on")}></span>)}
      </div>
      <span className="fs12 w5" style={{ minWidth: "52px" }}>{label ? `Strength: ${label}` : "Strength"}</span>
    </div>
  );
}

/** The live checklist of what a new password needs, each saying Met or Not met in words. */
export function Requirements({ id, password, current }: { id: string; password: string; current?: string }) {
  return (
    <ul className="c g4" id={id} aria-label="Password requirements">
      {rules(password, current).filter((rule) => current !== undefined || rule.key !== "different").map((rule) => (
        <li key={rule.key} className={clsx("r g6 fs12", rule.met ? "pwok" : "mu")}>
          <Icon className="s14" d={rule.met ? I.check : "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"} />
          <span className="f1">{rule.label}</span>
          <span className="w5">{rule.met ? "Met" : "Not met"}</span>
        </li>
      ))}
    </ul>
  );
}
