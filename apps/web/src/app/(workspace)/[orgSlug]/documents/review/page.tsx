import type { Metadata } from "next";
import { DocReviewScreen } from "@/features/documents/doc-review-screen";

export const metadata: Metadata = { title: "Document review" };

export default function DocumentReviewPage() {
  return <DocReviewScreen />;
}
