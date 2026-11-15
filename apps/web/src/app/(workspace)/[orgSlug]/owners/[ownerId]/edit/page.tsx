import type { Metadata } from "next";
import { OWN5 } from "@/features/console/model/console-model";
import { OwnerFormScreen } from "@/features/owners/owner-form-screen";

export const dynamicParams = false;

export function generateStaticParams() {
  return OWN5.filter((owner) => owner.id !== "LSF").map((owner) => ({ ownerId: owner.id }));
}

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/owners/[ownerId]/edit">): Promise<Metadata> {
  const { ownerId } = await params;
  return { title: `Edit ${OWN5.find((o) => o.id === ownerId)?.name ?? "owner"}` };
}

export default function EditOwnerPage() {
  return <OwnerFormScreen />;
}
