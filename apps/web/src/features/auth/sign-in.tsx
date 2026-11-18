"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { applyApiErrors } from "@/components/forms/api-errors";
import { Icon } from "@/components/ui/icon";
import { errorMessage } from "@/lib/api/errors";
import { postJson } from "@/lib/api/post";
import type { OrgRef } from "@/lib/api/types";
import { hardNavigate } from "@/lib/hard-navigation";
import { safeNext } from "@/lib/safe-redirect";
import { AuthFrame } from "./auth-frame";
import { Field } from "./field";
import { Organizations } from "./organizations";

const schema = z.object({
  email: z.email("Enter your email address"),
  password: z.string().min(1, "Enter your password"),
});
type Values = z.infer<typeof schema>;

type SessionReply = { organization: OrgRef | null; organizations: OrgRef[]; requires_organization_selection: boolean };

/** Sign in, then choose an organization when the account belongs to more than one. */
export function SignIn() {
  const search = useSearchParams();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  // Set when the person belongs to several companies and has to say which one to open.
  const [choices, setChoices] = useState<OrgRef[] | null>(null);
  const errors = form.formState.errors;

  async function signIn(values: Values, organization?: OrgRef) {
    setPending(organization?.id ?? "form");
    setFormError(null);
    try {
      const reply = await postJson<SessionReply>("/api/auth/login", { ...values, ...(organization ? { organization_id: organization.id } : {}) });
      if (reply.requires_organization_selection || !reply.organization) {
        setChoices(reply.organizations);
        setPending(null);
        return;
      }
      hardNavigate(safeNext(search.get("next"), `/${reply.organization.slug}/${reply.organization.role === "owner_portal" || reply.organization.role === "customer" ? "portal" : "dashboard"}`));
    } catch (error) {
      if (organization) setFormError(errorMessage(error));
      else {
        setFormError(applyApiErrors(form, error));
        setChoices(null);
      }
      setPending(null);
    }
  }

  return (
    <AuthFrame>
      {choices ? (
        <Organizations
          email={form.getValues("email")}
          organizations={choices}
          pending={pending}
          error={formError}
          choose={(organization) => void signIn(form.getValues(), organization)}
          back={() => {
            setChoices(null);
            setFormError(null);
          }}
        />
      ) : (
        <form className="authcard" method="post" noValidate onSubmit={form.handleSubmit((values) => signIn(values))}>
          <h2 style={{ fontSize: "22px", lineHeight: "28px", fontWeight: "600", letterSpacing: "-0.015em" }}>Sign in</h2>
          <p className="fs13 mu" style={{ marginTop: "4px" }}>Use your work email.</p>
          <div className="c g12" style={{ marginTop: "20px" }}>
            {search.get("reason") === "expired" && !formError ? (
              <div className="banner" data-k="info" role="status">
                <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
                <div className="f1">Your session ended. Sign in again to pick up where you left off.</div>
              </div>
            ) : null}
            {formError ? (
              <div className="banner" data-k="bad" role="alert">
                <Icon className="s14" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
                <div className="f1">{formError}</div>
              </div>
            ) : null}
            <Field id="au-e" label="Work email" type="email" autoComplete="username" autoFocus style={{ height: "40px" }} error={errors.email?.message} {...form.register("email")} />
            <Field
              id="au-p"
              label={
                <div className="r jb">
                  <label htmlFor="au-p" className="lbl">Password</label>
                  <button type="button" className="lnk" title="Password reset isn’t available yet. Ask an administrator of your company.">Forgot password?</button>
                </div>
              }
              type="password"
              autoComplete="current-password"
              style={{ height: "40px" }}
              error={errors.password?.message}
              {...form.register("password")}
            />
            <button type="submit" className="btn pri lg" style={{ width: "100%" }} disabled={pending !== null}>{pending ? "Signing in…" : "Continue"}</button>
            <div className="r g10 fs12 mu">
              <span className="hr f1"></span>
              or
              <span className="hr f1"></span>
            </div>
            <button type="button" className="btn lg" style={{ width: "100%" }} title="Single sign-on isn’t available yet">
              <Icon className="s14" d="M15 7a2 2 0 0 1 2 2M21 9a6 6 0 0 1-7.7 5.8L11 17H9v2H7v2H3v-3.6l6.2-6.2A6 6 0 1 1 21 9z" />
              Continue with single sign-on
            </button>
          </div>
          <p className="note" style={{ marginTop: "18px" }}>
            <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
            Sessions use secure cookies. Tokens never reach the browser.
          </p>
          <div className="r g8 fs12 mu" style={{ marginTop: "18px" }}>
            <span className="f1">New to FlyFleet?</span>
            <Link className="lnk" href="/signup">Create an account</Link>
          </div>
        </form>
      )}
    </AuthFrame>
  );
}
