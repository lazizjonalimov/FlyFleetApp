"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { errorMessage } from "@/lib/api/errors";
import { postJson } from "@/lib/api/post";
import type { OrgRef } from "@/lib/api/types";
import { hardNavigate } from "@/lib/hard-navigation";
import { AuthFrame } from "./auth-frame";
import { Field } from "./field";

export type InvitationPreview = {
  organization_name: string;
  email: string;
  full_name: string;
  role_label: string;
  invited_by_name: string | null;
  expires_at: string;
  state: "open" | "expired" | "used" | "revoked";
  existing_account: boolean;
};

const CLOSED: Record<string, [string, string]> = {
  used: ["This invitation has been used", "Sign in with the email and password it was set up with."],
  revoked: ["This invitation was withdrawn", "Ask whoever invited you for a new one."],
  expired: ["This invitation has expired", "Links work for a week. Ask whoever invited you for a new one."],
};

/** Joining a company from an invitation link: a new sign-in with a password of their own, or the sign-in the
 * email already has. */
export function AcceptInvitation({ token, preview }: { token: string; preview: InvitationPreview | null }) {
  const [name, setName] = useState(preview?.full_name ?? "");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [driverDone, setDriverDone] = useState(false);

  async function join(event: React.FormEvent) {
    event.preventDefault();
    if (!preview) return;
    if (!preview.existing_account && password.length < 10) return setProblem("Use at least 10 characters");
    setPending(true);
    setProblem(null);
    try {
      const reply = await postJson<{ organization: OrgRef }>("/api/auth/invite", { token, password, full_name: preview.existing_account ? null : name.trim() || null });
      if (reply.organization.role === "driver") {
        setDriverDone(true);
        setPending(false);
        return;
      }
      hardNavigate(`/${reply.organization.slug}/dashboard`);
    } catch (error) {
      setProblem(errorMessage(error));
      setPending(false);
    }
  }

  const closed = !preview ? ["This invitation link isn’t valid", "Check that the whole link was copied, or ask for a new one."] : CLOSED[preview.state];
  return (
    <AuthFrame>
      {closed ? (
        <div className="authcard">
          <h2 style={{ fontSize: "22px", lineHeight: "28px", fontWeight: "600" }}>{closed[0]}</h2>
          <p className="fs13 mu" style={{ marginTop: "6px" }}>{closed[1]}</p>
          <Link className="btn lg" style={{ marginTop: "20px", width: "100%" }} href="/login">Go to sign in</Link>
        </div>
      ) : driverDone ? (
        <div className="authcard">
          <h2 style={{ fontSize: "22px", lineHeight: "28px", fontWeight: "600" }}>You’re set up</h2>
          <p className="fs13 mu" style={{ marginTop: "6px" }}>{`Sign in to the FlyFleet driver app with ${preview!.email} and your password. Loads, messages and alerts from ${preview!.organization_name} arrive there.`}</p>
        </div>
      ) : (
        <form className="authcard" method="post" noValidate onSubmit={(e) => void join(e)}>
          <h2 style={{ fontSize: "22px", lineHeight: "28px", fontWeight: "600", letterSpacing: "-0.015em" }}>{`Join ${preview!.organization_name}`}</h2>
          <p className="fs13 mu" style={{ marginTop: "4px" }}>{`${preview!.invited_by_name ? `${preview!.invited_by_name} invited you` : "You’re invited"} as ${preview!.role_label}.`}</p>
          <div className="c g12" style={{ marginTop: "20px" }}>
            {problem ? (
              <div className="banner" data-k="bad" role="alert">
                <Icon className="s14" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
                <div className="f1">{problem}</div>
              </div>
            ) : null}
            <Field id="iv-e" label="Email" type="email" value={preview!.email} readOnly style={{ height: "40px" }} />
            {preview!.existing_account ? (
              <p className="fs12 mu">This email already has a FlyFleet sign-in. Enter its password to add this company to it.</p>
            ) : (
              <Field id="iv-n" label="Your name" autoComplete="name" style={{ height: "40px" }} value={name} onChange={(e) => setName(e.currentTarget.value)} />
            )}
            <Field id="iv-p" label="Password" type="password" autoComplete={preview!.existing_account ? "current-password" : "new-password"} autoFocus style={{ height: "40px" }}
              hint={preview!.existing_account ? undefined : "At least 10 characters. A short sentence works well."} value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
            <button type="submit" className="btn pri lg" style={{ width: "100%" }} disabled={pending}>{pending ? "Joining…" : `Join ${preview!.organization_name}`}</button>
          </div>
          <p className="note" style={{ marginTop: "18px" }}>
            <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
            The link works once. Sessions use secure cookies; tokens never reach the browser.
          </p>
        </form>
      )}
    </AuthFrame>
  );
}
