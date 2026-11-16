import type { Metadata } from "next";
import { StatementScreen } from "@/features/statements/statement-screen";

export const metadata: Metadata = { title: "Statement" };

export default function StatementPage() {
  return <StatementScreen />;
}
