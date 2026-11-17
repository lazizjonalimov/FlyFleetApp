"use client";

import { useCallback } from "react";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";

/** Opens the conversation with a driver or a customer, starting it the first time. */
export function useOpenConversation() {
  const { set, notify, can } = useConsole();
  return useCallback(
    async (to: { driverId: string } | { customerId: string; contactId?: string | null }, draft?: string) => {
      if (!can("messages.send")) return notify("Your role can’t send messages", true);
      try {
        const conv = await unwrap(api.POST("/api/v1/conversations", {
          body: "driverId" in to ? { kind: "driver", driver_id: to.driverId } : { kind: "customer", customer_id: to.customerId, contact_id: to.contactId ?? null },
        }));
        // A drafted message waits in the composer, to read over and send or not.
        set({ ...goTo("messages"), conv: conv.id, mtext: draft ? { conv: conv.id, text: draft } : null });
      } catch (e) {
        notify(errorMessage(e), true);
      }
    },
    [set, notify, can],
  );
}
