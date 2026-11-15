import type { Metadata } from "next";
import { LoadsScreen } from "@/features/loads/loads-screen";

export const metadata: Metadata = { title: "Loads" };

export default function LoadsPage() {
  return <LoadsScreen />;
}
