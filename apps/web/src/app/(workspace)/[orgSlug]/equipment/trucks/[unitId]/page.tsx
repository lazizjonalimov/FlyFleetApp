import type { Metadata } from "next";
import { UNIT_IDS } from "@/features/console/records";
import { TruckScreen } from "@/features/equipment/truck-screen";

export const dynamicParams = false;

export function generateStaticParams() {
  return UNIT_IDS.map((unitId) => ({ unitId }));
}

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/equipment/trucks/[unitId]">): Promise<Metadata> {
  const { unitId } = await params;
  return { title: unitId };
}

export default function TruckPage() {
  return <TruckScreen />;
}
