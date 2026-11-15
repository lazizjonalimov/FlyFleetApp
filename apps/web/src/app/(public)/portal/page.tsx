import type { Metadata } from "next";
import { CustomerPortal } from "@/features/portal/customer-portal";

export const metadata: Metadata = { title: "Shipments" };

export default function CustomerPortalPage() {
  return <CustomerPortal />;
}
