"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { rememberToast } from "@/features/companies/pending-toast";
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
 * again, and a toast says where you are. Every query cached for the company being left is dropped, so nothing of
 * it can show in the next one. The API only remembers where the person last worked; which company a request is
 * about comes from the address, and the API re-checks membership every time.
 */
export function useSwitchCompany() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { me, set } = useConsole();
  return useCallback(
    async (target: { id: string; slug: string; name?: string } | "all", options: { toast?: string; path?: string } = {}) => {
      const slug = target === "all" ? "all" : target.slug;
      await postJson("/api/auth/switch", target === "all" ? { scope: "all" } : { organization_id: target.id }).catch(() => undefined);
      const left = me.organization.id;
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === left || query.queryKey[0] === "all" });
      void queryClient.invalidateQueries({ queryKey: ["me", "companies"] });
      set({ lsel: [], lpage: [], lf: {}, lq: "", ltab: 0, overlay: "none" });
      rememberToast(options.toast ?? `Switched to ${target === "all" ? "All companies" : (target.name ?? "the company")}, same page`);
      router.push(options.path ?? companyPath(pathname, slug));
    },
    [router, pathname, queryClient, me.organization.id, set],
  );
}
