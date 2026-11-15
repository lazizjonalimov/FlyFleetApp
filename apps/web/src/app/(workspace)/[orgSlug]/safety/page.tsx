import type { Metadata } from "next";
import { SafetyScreen } from "@/features/safety/safety-screen";

export const metadata: Metadata = { title: "Compliance" };

export default function SafetyPage() {
  return <SafetyScreen />;
}
