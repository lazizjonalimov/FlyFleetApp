import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignIn } from "@/features/auth/sign-in";
import { SwitchOrganization } from "@/features/auth/switch-organization";
import { getMe } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const me = await getMe();
  // signed in already: straight to work, unless they came to move to another of their companies
  if (me && (await searchParams).switch === undefined) redirect(`/${me.organization.slug}/dashboard`);
  if (me) return <SwitchOrganization me={me} />;
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
