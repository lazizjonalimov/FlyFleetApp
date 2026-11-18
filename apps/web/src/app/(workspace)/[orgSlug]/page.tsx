import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth/server";

// A workspace opens on its dashboard; an owner's portal sign-in opens on the portal.
export default async function WorkspaceHome({ params }: PageProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const me = await getMe();
  redirect(`/${orgSlug}/${me?.organization.role === "owner_portal" || me?.organization.role === "customer" ? "portal" : "dashboard"}`);
}
