import type { Metadata } from "next";
import { SignIn } from "@/features/auth/sign-in";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return <SignIn />;
}
