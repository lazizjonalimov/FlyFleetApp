import type { Metadata } from "next";
import { ProfileScreen } from "@/features/account/profile-screen";

export const metadata: Metadata = { title: "Profile & preferences" };

export default function ProfilePage() {
  return <ProfileScreen />;
}
