import type { Metadata } from "next";
import { AcceptInvitation, type InvitationPreview } from "@/features/auth/accept-invitation";
import { apiFetch } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Join your team" };

/** An invitation link: what it is for, then the sign-in that joins the company. */
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  let preview: InvitationPreview | null = null;
  try {
    const response = await apiFetch(`/auth/invitations/${encodeURIComponent(token)}`);
    preview = response.ok ? ((await response.json()) as InvitationPreview) : null;
  } catch {
    preview = null;
  }
  return <AcceptInvitation token={token} preview={preview} />;
}
