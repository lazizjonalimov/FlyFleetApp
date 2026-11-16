import type { Metadata } from "next";
import { AlertsScreen } from "@/features/alerts/alerts-screen";

export const metadata: Metadata = { title: "Fleet alerts" };

export default function Page() {
  return <AlertsScreen />;
}
