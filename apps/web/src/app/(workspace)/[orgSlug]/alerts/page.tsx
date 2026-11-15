import type { Metadata } from "next";
import { ListScreen } from "@/features/lists/list-screen";

export const metadata: Metadata = { title: "Fleet alerts" };

export default function AlertsPage() {
  return <ListScreen />;
}
