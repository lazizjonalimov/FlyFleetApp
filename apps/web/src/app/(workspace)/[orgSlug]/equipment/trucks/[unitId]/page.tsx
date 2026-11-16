import type { Metadata } from "next";
import { TruckScreen } from "@/features/equipment/truck-screen";

export const metadata: Metadata = { title: "Truck" };

export default function TruckPage() {
  return <TruckScreen />;
}
