import type { Metadata } from "next";
import { MaintenanceScreen } from "@/features/maintenance/maintenance-screen";

export const metadata: Metadata = { title: "Maintenance" };

export default function MaintenancePage() {
  return <MaintenanceScreen />;
}
