import type { Metadata } from "next";
import { TruckScreen } from "@/features/equipment/truck-screen";

export const metadata: Metadata = { title: "Trailer" };

// One record screen serves both kinds of unit; the address says which it is.
export default function TrailerPage() {
  return <TruckScreen />;
}
