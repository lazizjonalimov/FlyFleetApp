"use client";

import { useConsole } from "@/features/console/console-provider";
import { Toast } from "@/features/shell/toast";
import { OwnerPortal } from "./owner-portal";

/** An equipment owner's sign-in sees the portal and nothing of the console: no sidebar, no other screens. */
export function PortalFrame() {
  const { theme } = useConsole();
  return (
    <div className="ff" data-theme={theme} data-density="compact">
      <OwnerPortal />
      <Toast />
    </div>
  );
}
