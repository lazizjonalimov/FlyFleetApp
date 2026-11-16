"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api/errors";
import { postJson } from "@/lib/api/post";
import type { Me, OrgRef } from "@/lib/api/types";
import { hardNavigate } from "@/lib/hard-navigation";
import { AuthFrame } from "./auth-frame";
import { Organizations } from "./organizations";

/** Ends the session in this browser and returns to sign-in. */
export async function signOut(): Promise<void> {
  await postJson("/api/auth/logout", {}).catch(() => undefined);
  hardNavigate("/login");
}

/**
 * Move this browser to another company. The server re-checks membership and issues a session for the chosen
 * company; the full page load that follows throws away everything cached for the one being left.
 */
export async function switchOrganization(organizationId: string, path?: string): Promise<void> {
  const reply = await postJson<{ organization: OrgRef }>("/api/auth/switch", { organization_id: organizationId });
  hardNavigate(path ?? `/${reply.organization.slug}/dashboard`);
}

/**
 * The signed-in account's companies, to move the session to another one. With `target`, the address being
 * opened belongs to that company: it is offered first, and switching to it stays on the address. Switching is
 * always the person's own click; a link alone never changes which company's data is on screen.
 */
export function SwitchOrganization({ me, target }: { me: Me; target?: OrgRef }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(organization: OrgRef) {
    const here = target && organization.id === target.id ? window.location.pathname + window.location.search : undefined;
    if (organization.id === me.organization.id) return hardNavigate(`/${organization.slug}/dashboard`);
    setPending(organization.id);
    setError(null);
    try {
      await switchOrganization(organization.id, here);
    } catch (e) {
      setError(errorMessage(e));
      setPending(null);
    }
  }

  const first = target ?? me.memberships.find((membership) => membership.id === me.organization.id);
  const organizations = first ? [first, ...me.memberships.filter((membership) => membership.id !== first.id)] : me.memberships;

  return (
    <AuthFrame>
      <Organizations email={me.user.email} organizations={organizations} currentId={first?.id} pending={pending} error={error} choose={(organization) => void choose(organization)} back={() => void signOut()} />
    </AuthFrame>
  );
}
