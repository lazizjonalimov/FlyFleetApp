import type { Metadata } from "next";
import { OWN5 } from "@/features/console/model/console-model";
import { OwnerScreen } from "@/features/owners/owner-screen";

export const dynamicParams = false;

export function generateStaticParams() {
  return OWN5.map((owner) => ({ ownerId: owner.id }));
}

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/owners/[ownerId]">): Promise<Metadata> {
  const { ownerId } = await params;
  return { title: OWN5.find((o) => o.id === ownerId)?.name ?? "Owner" };
}

export default function OwnerPage() {
  return <OwnerScreen />;
}
