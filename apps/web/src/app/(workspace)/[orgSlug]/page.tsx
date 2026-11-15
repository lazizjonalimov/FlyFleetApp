import { redirect } from "next/navigation";

// A workspace opens on its dashboard.
export default async function WorkspaceHome({ params }: PageProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/dashboard`);
}
