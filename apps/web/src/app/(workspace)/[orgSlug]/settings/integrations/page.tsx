import type { Metadata } from "next";
import { SettingsScreen } from "@/features/administration/settings-screen";

export const metadata: Metadata = { title: "Settings" };

export default function IntegrationsPage() {
  return <SettingsScreen />;
}
