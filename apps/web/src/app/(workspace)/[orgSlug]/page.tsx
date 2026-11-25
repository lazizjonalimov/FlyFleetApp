import { redirect } from "next/navigation";
import { hrefOf } from "@/features/console/routes";
import { apiFetch, getMe, sessionToken } from "@/lib/auth/server";

/** The start page chosen under Profile & preferences, if any: a section's key such as "loads". */
async function startPage(company: string): Promise<string | null> {
  const token = await sessionToken();
  if (!token) return null;
  try {
    const response = await apiFetch("/preferences", { token, headers: { "X-Company": company } });
    const preferences = response.ok ? ((await response.json()) as Record<string, unknown>) : {};
    return typeof preferences.start_page === "string" ? preferences.start_page : null;
  } catch {
    return null;
  }
}

// A workspace opens on the start page you chose (the dashboard unless you chose another); an owner's or a
// customer's portal sign-in opens on the portal.
export default async function WorkspaceHome({ params }: PageProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const me = await getMe();
  if (me?.organization.role === "owner_portal" || me?.organization.role === "customer") redirect(`/${orgSlug}/portal`);
  const start = orgSlug === "all" ? null : await startPage(orgSlug);
  redirect(start ? hrefOf({ screen: start }, orgSlug) : `/${orgSlug}/dashboard`);
}
