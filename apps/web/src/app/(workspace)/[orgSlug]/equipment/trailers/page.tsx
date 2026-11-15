import type { Metadata } from "next";
import { ListScreen } from "@/features/lists/list-screen";

export const metadata: Metadata = { title: "Trailers" };

export default function TrailersPage() {
  return <ListScreen />;
}
