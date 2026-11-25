import type { Metadata } from "next";
import { CompaniesScreen } from "@/features/companies/companies-screen";

export const metadata: Metadata = { title: "Companies" };

export default function CompaniesPage() {
  return <CompaniesScreen />;
}
