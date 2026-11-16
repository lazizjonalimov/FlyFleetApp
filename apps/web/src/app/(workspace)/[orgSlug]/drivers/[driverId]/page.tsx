import type { Metadata } from "next";
import { DriverScreen } from "@/features/drivers/driver-screen";

export const metadata: Metadata = { title: "Driver" };

export default function DriverPage() {
  return <DriverScreen />;
}
