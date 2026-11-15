import type { Metadata } from "next";
import { ListScreen } from "@/features/lists/list-screen";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditLogPage() {
  return <ListScreen />;
}
