"use client";

import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** A confirmation after the server has answered, or what went wrong. */
export function Toast() {
  const { hasToast, toast, toastBad, closeToast, I } = useConsole();
  if (!hasToast) return null;
  return (
    <div className="toastw" role={toastBad ? "alert" : "status"}>
      <div className="toast">
        <Icon className="s14 b" d={toastBad ? I.alert : I.check} />
        <span className="f1"><span>{toast}</span></span>
        <button className="lnk" style={{ color: "#8DA9FB" }} onClick={closeToast}>Dismiss</button>
      </div>
    </div>
  );
}
