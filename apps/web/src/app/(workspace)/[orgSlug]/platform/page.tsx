import type { Metadata } from "next";

export const metadata: Metadata = { title: "Platform" };

// The platform operator's area is not part of a company's workspace. No company role opens it, so the
// console answers with its "no access" screen; there is nothing to draw here.
export default function PlatformPage() {
  return null;
}
