"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from "react";
import { api, unwrap } from "@/lib/api/client";
import { setPreviewTeam } from "@/lib/api/preview";
import { setScope } from "@/lib/api/scope";
import type { Me } from "@/lib/api/types";

const SessionContext = createContext<Me | null>(null);

type Preview = { start: (teamId: string) => Promise<void>; stop: () => void; on: boolean };
const PreviewContext = createContext<Preview>({ start: async () => {}, stop: () => {}, on: false });

/**
 * Makes the signed-in user and their active company available to client components in the workspace. While
 * a dispatch team is previewed, it is the team's view instead: a dispatcher's role and the team's trucks.
 */
export function SessionProvider({ me: signedIn, scope, children }: { me: Me; scope: string; children: React.ReactNode }) {
  const client = useQueryClient();
  // In "all" the company is no single one: its id and address are "all", which also keeps cached data apart.
  const me = useMemo<Me>(
    () => (scope === "all" ? { ...signedIn, organization: { ...signedIn.organization, id: "all", slug: "all", name: "All companies", code: "ALL", color: "#334155", mc_number: null } } : signedIn),
    [signedIn, scope],
  );
  // Before any query of this tree runs, every API request is told which company (or all) the address is for.
  useLayoutEffect(() => {
    setScope(scope);
    return () => setScope(null);
  }, [scope]);
  const [previewed, setPreviewed] = useState<Me | null>(null);
  const start = useCallback(async (teamId: string) => {
    setPreviewTeam(teamId);
    try {
      const view = await unwrap(api.GET("/api/v1/auth/me"));
      client.removeQueries({ queryKey: [me.organization.id] });
      setPreviewed(view);
    } catch (error) {
      setPreviewTeam(null);
      throw error;
    }
  }, [client, me.organization.id]);
  const stop = useCallback(() => {
    setPreviewTeam(null);
    client.removeQueries({ queryKey: [me.organization.id] });
    setPreviewed(null);
  }, [client, me.organization.id]);
  const preview = useMemo(() => ({ start, stop, on: previewed !== null }), [start, stop, previewed]);
  return (
    <PreviewContext.Provider value={preview}>
      <SessionContext.Provider value={previewed ?? me}>{children}</SessionContext.Provider>
    </PreviewContext.Provider>
  );
}

/** Seeing the console as a dispatch team's dispatchers would, and leaving that view. */
export function usePreview(): Preview {
  return useContext(PreviewContext);
}

export function useSession(): Me {
  const me = useContext(SessionContext);
  if (!me) throw new Error("useSession must be used inside the workspace");
  return me;
}

/** The active company. Its id is part of every query key, so cached data is always partitioned by company. */
export function useOrg() {
  return useSession().organization;
}

/**
 * Whether the user's role includes a permission. This only decides what to show: the API checks every
 * request again, so hiding a button is never what protects the data.
 */
export function useCan() {
  const { permissions } = useSession();
  return useCallback((...anyOf: string[]) => anyOf.some((p) => permissions.includes(p)), [permissions]);
}

/** A path inside the active company's workspace: workspacePath("loads", id) -> "/acme-1a2b/loads/<id>". */
export function useWorkspacePath() {
  const { slug } = useOrg();
  return useCallback((...parts: string[]) => `/${slug}/${parts.join("/")}`, [slug]);
}
