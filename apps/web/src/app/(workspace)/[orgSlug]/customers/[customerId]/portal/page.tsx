import type { Metadata } from "next";
import { CustomerPortalPreview } from "@/features/customers/customer-portal-preview";

export const metadata: Metadata = { title: "Shipment portal preview" };

/** Staff seeing exactly what a customer's portal sign-ins see. */
export default function CustomerPortalPreviewPage() {
  return <CustomerPortalPreview />;
}
