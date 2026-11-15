import type { Metadata } from "next";
import { TRUCKS, U5 } from "@/features/console/model/console-model";
import { TruckScreen } from "@/features/equipment/truck-screen";

export const dynamicParams = false;

export function generateStaticParams() {
  return [...new Set([...TRUCKS.map((truck) => truck[0]), ...Object.keys(U5).filter((unit) => unit.startsWith("T-"))])].map((unitId) => ({ unitId }));
}

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/equipment/trucks/[unitId]">): Promise<Metadata> {
  const { unitId } = await params;
  return { title: unitId };
}

export default function TruckPage() {
  return <TruckScreen />;
}
