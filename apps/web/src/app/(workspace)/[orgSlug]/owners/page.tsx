import type { Metadata } from "next";
import { ListScreen } from "@/features/lists/list-screen";

export const metadata: Metadata = { title: "Owners" };

export default function OwnersPage() {
  return <ListScreen />;
}
