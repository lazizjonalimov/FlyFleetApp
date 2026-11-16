import type { Metadata } from "next";
import { InspectionsScreen } from "@/features/safety/inspections-screen";

export const metadata: Metadata = { title: "Inspections" };

export default function Page() {
  return <InspectionsScreen />;
}
