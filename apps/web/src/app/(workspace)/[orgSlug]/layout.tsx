import { notFound, redirect } from "next/navigation";
import { SwitchOrganization } from "@/features/auth/switch-organization";
import { ConsoleFrame } from "@/features/console/console-frame";
import { ConsoleProvider } from "@/features/console/console-provider";
import { SurfaceFrame } from "@/features/console/surface-frame";
import { getMe } from "@/lib/auth/server";
import { SessionProvider } from "@/lib/auth/session";

/**
 * Everything inside a company's workspace. The session is checked with the API before anything renders, and
 * the company in the address must be the one the session is for: a link into another of your companies asks
 * you to switch, and a link into a company you don't belong to is simply not found.
 */
export default async function WorkspaceLayout({ children, params }: LayoutProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const me = await getMe();
  if (!me) redirect("/login");

  if (me.organization.slug !== orgSlug) {
    const other = me.memberships.find((membership) => membership.slug === orgSlug);
    if (!other) notFound();
    return (
      <SurfaceFrame>
        <SwitchOrganization me={me} target={other} />
      </SurfaceFrame>
    );
  }

  return (
    <SessionProvider me={me}>
      <ConsoleProvider>
        <ConsoleFrame>{children}</ConsoleFrame>
      </ConsoleProvider>
    </SessionProvider>
  );
}
