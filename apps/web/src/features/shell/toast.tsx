"use client";

import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Confirmation toast. */
export function Toast() {
  const { hasToast, toast, closeToast } = useConsole();
  if (!hasToast) return null;
  return (
    <div className="toastw" role="status">
      <div className="toast">
        <Icon className="s14 b" d="M5 12l5 5 9-10" />
        <span className="f1"><span>{toast}</span></span>
        <button className="lnk" style={{ color: "#8DA9FB" }} onClick={closeToast}>Dismiss</button>
      </div>
    </div>
  );
}
