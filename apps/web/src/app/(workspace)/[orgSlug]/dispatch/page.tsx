import type { Metadata } from "next";
import { DispatchScreen } from "@/features/dispatch/dispatch-screen";

export const metadata: Metadata = { title: "Dispatch board" };

export default function DispatchPage() {
  return <DispatchScreen />;
}
