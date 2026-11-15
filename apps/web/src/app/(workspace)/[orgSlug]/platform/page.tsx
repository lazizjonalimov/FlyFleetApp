import type { Metadata } from "next";
import { ListScreen } from "@/features/lists/list-screen";

export const metadata: Metadata = { title: "Organizations" };

export default function PlatformPage() {
  return <ListScreen />;
}
