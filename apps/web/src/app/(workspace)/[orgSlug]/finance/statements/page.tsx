import type { Metadata } from "next";
import { ListScreen } from "@/features/lists/list-screen";

export const metadata: Metadata = { title: "Statements" };

export default function StatementsPage() {
  return <ListScreen />;
}
