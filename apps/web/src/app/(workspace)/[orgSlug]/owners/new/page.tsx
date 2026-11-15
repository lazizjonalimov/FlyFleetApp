import type { Metadata } from "next";
import { OwnerFormScreen } from "@/features/owners/owner-form-screen";

export const metadata: Metadata = { title: "Add owner" };

export default function NewOwnerPage() {
  return <OwnerFormScreen />;
}
