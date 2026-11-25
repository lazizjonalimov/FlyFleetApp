import type { Metadata } from "next";
import { ResetPassword } from "@/features/auth/reset-password";
import { apiFetch } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Set a new password" };

type State = "open" | "used" | "expired" | "invalid";

/** A password reset link from email: works once, for 30 minutes. */
export default async function ResetPage({ params }: PageProps<"/reset/[token]">) {
  const { token } = await params;
  let state: State = "invalid";
  try {
    const response = await apiFetch(`/auth/password-reset/${encodeURIComponent(token)}`);
    if (response.ok) state = ((await response.json()) as { state: State }).state;
  } catch {
    state = "invalid";
  }
  return <ResetPassword token={token} state={state} />;
}
