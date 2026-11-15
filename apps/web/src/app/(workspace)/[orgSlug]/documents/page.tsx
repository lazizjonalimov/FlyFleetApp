import type { Metadata } from "next";
import { ListScreen } from "@/features/lists/list-screen";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return <ListScreen />;
}
