import type { Metadata } from "next";
import { ListScreen } from "@/features/lists/list-screen";

export const metadata: Metadata = { title: "Drivers" };

export default function DriversPage() {
  return <ListScreen />;
}
