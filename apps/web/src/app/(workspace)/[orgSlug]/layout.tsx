import { notFound } from "next/navigation";
import { ConsoleFrame } from "@/features/console/console-frame";
import { ConsoleProvider } from "@/features/console/console-provider";
import { ORG_SLUG } from "@/features/console/routes";

// One workspace exists: any other address under the root is simply not found.
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ orgSlug: ORG_SLUG }];
}

/** Everything inside a company's workspace: the console shell around the screen for the address. */
export default async function WorkspaceLayout({ children, params }: LayoutProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  if (orgSlug !== ORG_SLUG) notFound();
  return (
    <ConsoleProvider>
      <ConsoleFrame>{children}</ConsoleFrame>
    </ConsoleProvider>
  );
}
