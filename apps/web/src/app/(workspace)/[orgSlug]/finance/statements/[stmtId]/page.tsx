import type { Metadata } from "next";
import { OWN5 } from "@/features/console/model/console-model";
import { STATEMENT_IDS } from "@/features/console/records";
import { StatementScreen } from "@/features/statements/statement-screen";

export const dynamicParams = false;

export function generateStaticParams() {
  return STATEMENT_IDS.map((stmtId) => ({ stmtId }));
}

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/finance/statements/[stmtId]">): Promise<Metadata> {
  const { stmtId } = await params;
  return { title: `Statement · ${OWN5.find((o) => o.id === stmtId)?.name ?? "owner"}` };
}

export default function StatementPage() {
  return <StatementScreen />;
}
