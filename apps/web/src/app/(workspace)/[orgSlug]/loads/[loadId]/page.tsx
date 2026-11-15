import type { Metadata } from "next";
import { LOAD_IDS } from "@/features/console/records";
import { LoadScreen } from "@/features/loads/load-screen";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOAD_IDS.map((loadId) => ({ loadId }));
}

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/loads/[loadId]">): Promise<Metadata> {
  const { loadId } = await params;
  return { title: loadId };
}

export default function LoadPage() {
  return <LoadScreen />;
}
