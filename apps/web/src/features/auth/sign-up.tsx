"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { applyApiErrors } from "@/components/forms/api-errors";
import { Icon } from "@/components/ui/icon";
import { postJson } from "@/lib/api/post";
import type { OrgRef } from "@/lib/api/types";
import { hardNavigate } from "@/lib/hard-navigation";
import { AuthFrame } from "./auth-frame";
import { Field } from "./field";

const schema = z.object({
  organization_name: z.string().trim().min(2, "Enter your company’s name").max(160),
  full_name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.email("Enter a valid email address"),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});
type Values = z.infer<typeof schema>;

/** The browser's time zone becomes the company's, so "today" means today where the company operates. */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** A new account with its first company. More companies are added from inside. */
export function SignUp() {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { organization_name: "", full_name: "", email: "", password: "" } });
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const errors = form.formState.errors;

  async function onSubmit(values: Values) {
    setPending(true);
    setFormError(null);
    try {
      const reply = await postJson<{ organization: OrgRef }>("/api/auth/signup", { ...values, timezone: browserTimeZone() });
      hardNavigate(`/${reply.organization.slug}/dashboard`);
    } catch (error) {
      setFormError(applyApiErrors(form, error));
      setPending(false);
    }
  }

  return (
    <AuthFrame>
      <form className="authcard" method="post" noValidate onSubmit={form.handleSubmit(onSubmit)}>
        <h2 style={{ fontSize: "22px", lineHeight: "28px", fontWeight: "600", letterSpacing: "-0.015em" }}>Create your account</h2>
        <p className="fs13 mu" style={{ marginTop: "4px" }}>Start with one company. You can add more under the same profile.</p>
        <div className="c g12" style={{ marginTop: "20px" }}>
          {formError ? (
            <div className="banner" data-k="bad" role="alert">
              <Icon className="s14" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
              <div className="f1">{formError}</div>
            </div>
          ) : null}
          <Field id="su-o" label="Company name" autoComplete="organization" autoFocus style={{ height: "40px" }} error={errors.organization_name?.message} {...form.register("organization_name")} />
          <Field id="su-n" label="Your name" autoComplete="name" style={{ height: "40px" }} error={errors.full_name?.message} {...form.register("full_name")} />
          <Field id="su-e" label="Work email" type="email" autoComplete="username" style={{ height: "40px" }} error={errors.email?.message} {...form.register("email")} />
          <Field id="su-p" label="Password" type="password" autoComplete="new-password" style={{ height: "40px" }} hint="At least 10 characters. A short sentence works well." error={errors.password?.message} {...form.register("password")} />
          <button type="submit" className="btn pri lg" style={{ width: "100%" }} disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
        </div>
        <p className="note" style={{ marginTop: "18px" }}>
          <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
          Sessions use secure cookies. Tokens never reach the browser.
        </p>
        <div className="r g8 fs12 mu" style={{ marginTop: "18px" }}>
          <span className="f1">Already have an account?</span>
          <Link className="lnk" href="/login">Sign in</Link>
        </div>
      </form>
    </AuthFrame>
  );
}
