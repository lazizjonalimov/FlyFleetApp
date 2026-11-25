import type { Metadata } from "next";
import { SecurityScreen } from "@/features/account/security-screen";

export const metadata: Metadata = { title: "Security & privacy" };

export default function SecurityPage() {
  return <SecurityScreen />;
}
