"use client";

import { useCallback } from "react";
import { useConsole } from "@/features/console/console-provider";
import { useAction } from "@/features/console/use-action";
import { api, unwrap } from "@/lib/api/client";

/**
 * Asks the driver who hauled a delivered load for its signed proof of delivery. The answer says whether the
 * request reached them: a driver who isn't on the driver app isn't told, and the person asking is told so.
 */
export function usePodRequest() {
  const { notify } = useConsole();
  const act = useAction();
  return useCallback(
    async (loadId: string) => {
      const out = await act(() => unwrap(api.POST("/api/v1/loads/{load_id}/pod-request", { params: { path: { load_id: loadId } } })));
      if (out) notify(out.sent ? `POD requested from ${out.driver} in the driver app` : `${out.driver} isn’t on the driver app, so the request wasn’t sent — call them, or invite them to the app`, !out.sent);
    },
    [act, notify],
  );
}
