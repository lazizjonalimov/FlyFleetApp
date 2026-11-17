import type { Metadata } from "next";
import { OwnerStatementScreen } from "@/features/statements/owner-statement-screen";

export const metadata: Metadata = { title: "Owner settlement" };

export default function OwnerStatementPage() {
  return <OwnerStatementScreen />;
}
