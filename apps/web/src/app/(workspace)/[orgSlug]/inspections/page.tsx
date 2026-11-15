import type { Metadata } from "next";
import { ListScreen } from "@/features/lists/list-screen";

export const metadata: Metadata = { title: "Inspections" };

export default function InspectionsPage() {
  return <ListScreen />;
}
