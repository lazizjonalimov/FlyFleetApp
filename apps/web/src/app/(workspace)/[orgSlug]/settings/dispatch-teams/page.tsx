import type { Metadata } from "next";
import { DispatchTeamsScreen } from "@/features/administration/dispatch-teams-screen";

export const metadata: Metadata = { title: "Dispatch teams" };

export default function DispatchTeamsPage() {
  return <DispatchTeamsScreen />;
}
