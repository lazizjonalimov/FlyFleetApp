"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { errorMessage } from "@/lib/api/errors";
import { useConsole } from "./console-provider";

/**
 * Runs a change against the API and reports how it went: a confirmation once the server has answered, or what
 * it said was wrong. Nothing on screen changes ahead of the answer; afterwards everything loaded for the
 * company is checked again, since one change (an assignment, a payment) shows up on several screens.
 */
export function useAction() {
  const { me, notify } = useConsole();
  const client = useQueryClient();
  const organization = me.organization.id;
  return useCallback(
    async <T,>(run: () => Promise<T>, done?: string | ((result: T) => string)): Promise<T | undefined> => {
      try {
        const result = await run();
        await client.invalidateQueries({ queryKey: [organization] });
        if (done) notify(typeof done === "function" ? done(result) : done);
        return result;
      } catch (error) {
        notify(errorMessage(error), true);
        return undefined;
      }
    },
    [client, organization, notify],
  );
}

/** For a control whose function is not built yet: says so instead of doing nothing. */
export function useSoon() {
  const { notify } = useConsole();
  return useCallback((what: string) => () => notify(`${what} isn’t available yet`), [notify]);
}
