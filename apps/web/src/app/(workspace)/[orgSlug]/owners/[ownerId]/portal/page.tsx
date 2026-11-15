import type { Metadata } from "next";
import { OWN5 } from "@/features/console/model/console-model";
import { OUTSIDE_OWNER_IDS } from "@/features/console/records";

export const dynamicParams = false;

export function generateStaticParams() {
  return OUTSIDE_OWNER_IDS.map((ownerId) => ({ ownerId }));
}

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/owners/[ownerId]/portal">): Promise<Metadata> {
  const { ownerId } = await params;
  return { title: `Owner portal · ${OWN5.find((o) => o.id === ownerId)?.name ?? "owner"}` };
}

// A preview of what this owner sees. The portal replaces the whole console, so the frame draws it, not this page.
export default function OwnerPortalPreviewPage() {
  return null;
}
