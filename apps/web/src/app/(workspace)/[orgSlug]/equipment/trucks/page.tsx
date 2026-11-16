import type { Metadata } from "next";
import { UnitsScreen } from "@/features/equipment/units-screen";

export const metadata: Metadata = { title: "Trucks" };

export default function TrucksPage() {
  return <UnitsScreen kind="truck" />;
}
