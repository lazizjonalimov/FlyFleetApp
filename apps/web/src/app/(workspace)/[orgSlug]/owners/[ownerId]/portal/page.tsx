import type { Metadata } from "next";
import { OwnerPortal } from "@/features/owners/owner-portal";

export const metadata: Metadata = { title: "Owner portal preview" };

/** Staff previewing exactly what an owner's portal users see. */
export default function OwnerPortalPreviewPage() {
  return <OwnerPortal />;
}
