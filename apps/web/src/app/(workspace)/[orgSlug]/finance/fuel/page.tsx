import type { Metadata } from "next";
import { FuelScreen } from "@/features/fuel/fuel-screen";

export const metadata: Metadata = { title: "Fuel & IFTA" };

export default function FuelPage() {
  return <FuelScreen />;
}
