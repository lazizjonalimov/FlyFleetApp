import type { Metadata } from "next";
import { LoadScreen } from "@/features/loads/load-screen";

export const metadata: Metadata = { title: "Load" };

export default function LoadPage() {
  return <LoadScreen />;
}
