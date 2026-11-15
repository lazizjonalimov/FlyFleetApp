import type { Metadata } from "next";
import { ListScreen } from "@/features/lists/list-screen";

export const metadata: Metadata = { title: "Trucks" };

export default function TrucksPage() {
  return <ListScreen />;
}
