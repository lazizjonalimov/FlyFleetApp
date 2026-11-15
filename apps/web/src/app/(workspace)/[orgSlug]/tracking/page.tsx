import type { Metadata } from "next";
import { MapCover } from "@/features/tracking/map-cover";
import { TrackingScreen } from "@/features/tracking/tracking-screen";

export const metadata: Metadata = { title: "Live fleet" };

export default function TrackingPage() {
  return (
    <>
      <TrackingScreen />
      <MapCover />
    </>
  );
}
