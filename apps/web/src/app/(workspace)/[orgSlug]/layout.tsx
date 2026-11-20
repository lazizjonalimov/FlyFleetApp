import { notFound, redirect } from "next/navigation";
import { ConsoleFrame } from "@/features/console/console-frame";
import { ConsoleProvider } from "@/features/console/console-provider";
import { CustomerPortalFrame } from "@/features/customers/customer-portal-frame";
import { PortalFrame } from "@/features/owners/portal-frame";
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
    if (!home.memberships.some((membership) => membership.slug === orgSlug)) notFound();
    const there = await getMe(orgSlug);
    if (!there) notFound();
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
