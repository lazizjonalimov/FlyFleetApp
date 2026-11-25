"use client";

import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";

export type MyCompany = Schema<"MyCompany">;
export type MyCompanies = Schema<"MyCompaniesOut">;
export type MyInvitation = Schema<"MyInvitation">;

/** Your companies are yours, not a company's: kept under one key whatever company is open. */
export const COMPANIES_KEY = ["me", "companies"];

/** The companies you can open, your role in each, and invitations waiting for you. */
export function useMyCompanies() {
  return useQuery({ queryKey: COMPANIES_KEY, queryFn: () => unwrap(api.GET("/api/v1/me/companies")), staleTime: 30_000 });
}

/** Moving to another company in place: see `useSwitchCompany`. */
export { useSwitchCompany as useOpenCompany } from "@/features/shell/company-switch";
