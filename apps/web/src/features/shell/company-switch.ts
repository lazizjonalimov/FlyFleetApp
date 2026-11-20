"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { useConsole } from "@/features/console/console-provider";
import { postJson } from "@/lib/api/post";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Areas that belong to one company at a time: they open on the dashboard when moving to All companies. */
const PER_COMPANY = new Set(["settings", "platform", "portal", "messages", "tracking"]);

/**
 * Where the same page is in another company (or in all of them): the address with the company swapped. A record
 * belongs to one company, so from a record the person lands on its list; a page the other side doesn't have
 * becomes the dashboard.
 */
export function companyPath(pathname: string, slug: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const rest = parts.slice(1);
  if (!rest.length) return `/${slug}/dashboard`;
  if (slug === "all" && PER_COMPANY.has(rest[0]!)) return `/${slug}/dashboard`;
  const cut = rest.findIndex((part) => UUID.test(part));
  return `/${[slug, ...(cut === -1 ? rest : rest.slice(0, Math.max(1, cut)))].join("/")}`;
}

/**
 * Move to another company, or to All companies, in place: the page stays, the session is not asked to sign in
 * again. The API only remembers where the person last worked; which company a request is about comes from the
 * address, and the API re-checks membership every time.
 */
export function useSwitchCompany() {
  const router = useRouter();
  const pathname = usePathname();
  const { set } = useConsole();
  return useCallback(
    async (target: { id: string; slug: string } | "all") => {
      const slug = target === "all" ? "all" : target.slug;
      await postJson("/api/auth/switch", target === "all" ? { scope: "all" } : { organization_id: target.id }).catch(() => undefined);
      set({ lsel: [], lpage: [], lf: {}, lq: "", ltab: 0 });
      router.push(companyPath(pathname, slug));
    },
    [router, pathname, set],
  );
}
