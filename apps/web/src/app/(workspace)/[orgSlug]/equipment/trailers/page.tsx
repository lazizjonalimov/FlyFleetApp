import type { Metadata } from "next";
import { UnitsScreen } from "@/features/equipment/units-screen";

export const metadata: Metadata = { title: "Trailers" };

export default function TrailersPage() {
  return <UnitsScreen kind="trailer" />;
}
