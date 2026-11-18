"use client";

import { useConsole } from "@/features/console/console-provider";
import { Toast } from "@/features/shell/toast";
import { CustomerPortal } from "./customer-portal";

/** A customer's sign-in sees its shipment portal and nothing of the console: no sidebar, no other screens. */
export function CustomerPortalFrame() {
  const { theme } = useConsole();
  return (
    <div className="ff" data-theme={theme} data-density="compact">
      <CustomerPortal />
      <Toast />
    </div>
  );
}
