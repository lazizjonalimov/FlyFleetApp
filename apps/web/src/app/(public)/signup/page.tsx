import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUp } from "@/features/auth/sign-up";
import { getMe } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage() {
  const me = await getMe();
  if (me) redirect(`/${me.organization.slug}/dashboard`);
  return <SignUp />;
}
