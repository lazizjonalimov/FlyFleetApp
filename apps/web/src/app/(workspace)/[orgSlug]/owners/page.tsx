import type { Metadata } from "next";
import { OwnersScreen } from "@/features/owners/owners-screen";

export const metadata: Metadata = { title: "Owners" };

export default function Page() {
  return <OwnersScreen />;
}
