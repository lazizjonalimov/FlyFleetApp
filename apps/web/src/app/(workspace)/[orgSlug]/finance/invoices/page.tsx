import type { Metadata } from "next";
import { ListScreen } from "@/features/lists/list-screen";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return <ListScreen />;
}
