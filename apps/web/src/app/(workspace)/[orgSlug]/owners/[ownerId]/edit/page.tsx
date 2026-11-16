import type { Metadata } from "next";
import { OwnerFormScreen } from "@/features/owners/owner-form-screen";

export const metadata: Metadata = { title: "Edit owner" };

export default function EditOwnerPage() {
  return <OwnerFormScreen />;
}
