import type { Metadata } from "next";
import { LOADS } from "@/features/console/model/console-model";
import { LoadScreen } from "@/features/loads/load-screen";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOADS.map((load) => ({ loadId: load.id }));
}

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/loads/[loadId]">): Promise<Metadata> {
  const { loadId } = await params;
  return { title: loadId };
}

export default function LoadPage() {
  return <LoadScreen />;
}
