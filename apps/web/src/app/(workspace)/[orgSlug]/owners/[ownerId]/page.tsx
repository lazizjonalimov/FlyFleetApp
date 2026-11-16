import type { Metadata } from "next";
import { OwnerScreen } from "@/features/owners/owner-screen";

export const metadata: Metadata = { title: "Owner" };

export default function OwnerPage() {
  return <OwnerScreen />;
}
