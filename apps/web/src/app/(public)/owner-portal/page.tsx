import type { Metadata } from "next";
import { OwnerPortal } from "@/features/owners/owner-portal";

export const metadata: Metadata = { title: "Owner portal" };

export default function OwnerPortalPage() {
  return <OwnerPortal />;
}
