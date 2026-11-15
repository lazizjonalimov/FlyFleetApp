import { redirect } from "next/navigation";

// The address bar root leads to sign-in, and from there to the workspace.
export default function Home() {
  redirect("/login");
}
