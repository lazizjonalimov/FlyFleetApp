import type { Metadata } from "next";
import { DriversScreen } from "@/features/drivers/drivers-screen";

export const metadata: Metadata = { title: "Drivers" };

export default function DriversPage() {
  return <DriversScreen />;
}
