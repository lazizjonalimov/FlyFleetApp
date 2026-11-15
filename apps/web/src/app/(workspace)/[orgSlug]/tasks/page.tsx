import type { Metadata } from "next";
import { ListScreen } from "@/features/lists/list-screen";

export const metadata: Metadata = { title: "My tasks" };

export default function TasksPage() {
  return <ListScreen />;
}
