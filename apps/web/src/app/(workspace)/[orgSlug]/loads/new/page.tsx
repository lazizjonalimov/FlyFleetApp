import type { Metadata } from "next";
import { NewLoadScreen } from "@/features/loads/new-load-screen";

export const metadata: Metadata = { title: "New load" };

export default function NewLoadPage() {
  return <NewLoadScreen />;
}
