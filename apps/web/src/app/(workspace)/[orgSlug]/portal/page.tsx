import type { Metadata } from "next";
import { OwnerPortal } from "@/features/owners/owner-portal";

export const metadata: Metadata = { title: "Owner portal" };

/** An equipment owner's own portal. Its frame is set by the workspace layout for owner sign-ins. */
export default function OwnerPortalPage() {
  return <OwnerPortal />;
}
