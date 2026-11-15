import type { Metadata } from "next";
import { TrackingScreen } from "@/features/tracking/tracking-screen";

export const metadata: Metadata = { title: "Live fleet" };

export default function TrackingPage() {
  return <TrackingScreen />;
}
