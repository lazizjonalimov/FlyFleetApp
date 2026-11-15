import type { Metadata } from "next";
import { TeamScreen } from "@/features/administration/team-screen";

export const metadata: Metadata = { title: "Team & access" };

export default function TeamPage() {
  return <TeamScreen />;
}
