import type { Metadata } from "next";
import { StatementsScreen } from "@/features/statements/statements-screen";

export const metadata: Metadata = { title: "Statements" };

export default function Page() {
  return <StatementsScreen />;
}
