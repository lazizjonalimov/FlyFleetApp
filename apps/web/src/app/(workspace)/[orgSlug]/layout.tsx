import { notFound, redirect } from "next/navigation";
import { ConsoleFrame } from "@/features/console/console-frame";
import { ConsoleProvider } from "@/features/console/console-provider";
import { CustomerPortalFrame } from "@/features/customers/customer-portal-frame";
import { PortalFrame } from "@/features/owners/portal-frame";
import { NoAccess } from "@/features/shell/no-access";
import { getMe } from "@/lib/auth/server";
import { SessionProvider } from "@/lib/auth/session";

/**
 * Everything inside a company's workspace, or inside "all" (every company the person can open). The session
 * is checked with the API before anything renders. The company in the address decides which company the page is
 * about, and the API re-checks membership on every request: a link into another of your companies opens
 * directly, a link into one you don't belong to is simply not found, and nothing here sends you to sign in
 * again just to change company.
 */
export default async function WorkspaceLayout({ children, params }: LayoutProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const home = await getMe();
  if (!home) redirect("/login");

  if (orgSlug === "all") {
    if (!home.all_companies) notFound();
    return (
      <SessionProvider me={home} scope="all">
        <ConsoleProvider>
          <ConsoleFrame>{children}</ConsoleFrame>
        </ConsoleProvider>
      </SessionProvider>
    );
  }

  let me = home;
  if (home.organization.slug !== orgSlug) {
    // A link into a company the person can't open says so, rather than a bare "not found".
    if (!home.memberships.some((membership) => membership.slug === orgSlug)) return <NoAccess home={`/${home.organization.slug}`} />;
    const there = await getMe(orgSlug);
    if (!there) return <NoAccess home={`/${home.organization.slug}`} />;
    me = there;
  }

  // A customer's sign-in gets its shipment portal at every address, and nothing else.
  if (me.organization.role === "customer") {
    return (
      <SessionProvider me={me} scope={orgSlug}>
        <ConsoleProvider>
          <CustomerPortalFrame />
        </ConsoleProvider>
      </SessionProvider>
    );
  }

  // An owner's portal sign-in gets the portal at every address, and nothing else.
  if (me.organization.role === "owner_portal") {
    return (
      <SessionProvider me={me} scope={orgSlug}>
        <ConsoleProvider>
          <PortalFrame />
        </ConsoleProvider>
      </SessionProvider>
    );
  }

  return (
    <SessionProvider me={me} scope={orgSlug}>
      <ConsoleProvider>
        <ConsoleFrame>{children}</ConsoleFrame>
      </ConsoleProvider>
    </SessionProvider>
  );
}
