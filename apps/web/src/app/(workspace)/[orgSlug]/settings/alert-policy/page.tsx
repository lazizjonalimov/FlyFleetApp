import type { Metadata } from "next";
import { SettingsScreen } from "@/features/administration/settings-screen";

export const metadata: Metadata = { title: "Fleet alert policy" };

export default function AlertPolicyPage() {
  return <SettingsScreen />;
}
