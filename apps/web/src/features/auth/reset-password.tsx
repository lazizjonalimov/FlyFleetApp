"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Requirements, StrengthMeter } from "@/features/account/password-fields";
import { I } from "@/features/console/icons";
import { errorMessage } from "@/lib/api/errors";
import { postJson } from "@/lib/api/post";
import { rules } from "@/lib/passwords";
import { AuthFrame } from "./auth-frame";

const CLOSED: Record<string, string> = {
  used: "This link has already been used.",
  expired: "This link has expired. Links work for 30 minutes.",
  invalid: "This link isn’t valid.",
};

/** Set a new password from a one-time link. */
export function ResetPassword({ token, state }: { token: string; state: "open" | "used" | "expired" | "invalid" }) {
  const id = useId();
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const ready = rules(next).slice(0, 3).every((rule) => rule.met) && next === again;

  async function save() {
    setPending(true);
    setError(null);
    try {
      await postJson("/api/auth/reset", { token, new_password: next });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
    setPending(false);
  }

  return (
    <AuthFrame>
      <form className="authcard" method="post" noValidate onSubmit={(event) => { event.preventDefault(); if (ready) void save(); }}>
        <h2 style={{ fontSize: "22px", lineHeight: "28px", fontWeight: "600", letterSpacing: "-0.015em" }}>Set a new password</h2>
        {done ? (
          <div className="c g12" style={{ marginTop: "16px" }}>
            <div className="banner" data-k="ok" role="status"><Icon className="s14" d={I.check} /><div className="f1">Your password is changed and every session is signed out.</div></div>
            <Link className="btn pri lg" href="/login">Sign in</Link>
          </div>
        ) : state !== "open" ? (
          <div className="c g12" style={{ marginTop: "16px" }}>
            <div className="banner" data-k="bad" role="alert"><Icon className="s14" d={I.alert} /><div className="f1">{CLOSED[state]} Sign in and ask for a new one under Settings › Security & privacy.</div></div>
            <Link className="btn lg" href="/login">Back to sign in</Link>
          </div>
        ) : (
          <div className="c g12" style={{ marginTop: "16px" }}>
            {error ? <div className="banner" data-k="bad" role="alert"><Icon className="s14" d={I.alert} /><div className="f1">{error}</div></div> : null}
            <div className="fld">
              <label htmlFor={`${id}-new`}>New password</label>
              <input id={`${id}-new`} className="inp" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-describedby={`${id}-meter ${id}-rules`} />
            </div>
            <StrengthMeter id={`${id}-meter`} password={next} />
            <Requirements id={`${id}-rules`} password={next} />
            <div className="fld">
              <label htmlFor={`${id}-again`}>Confirm new password</label>
              <input id={`${id}-again`} className="inp" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
              {again ? <span className="fs12" role="status">{next === again ? "Passwords match" : "Passwords don’t match yet"}</span> : null}
            </div>
            <button type="submit" className="btn pri lg" disabled={!ready || pending}>{pending ? "Saving…" : "Set new password"}</button>
          </div>
        )}
      </form>
    </AuthFrame>
  );
}
