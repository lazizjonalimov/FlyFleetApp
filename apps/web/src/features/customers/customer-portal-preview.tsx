"use client";

import { useConsole } from "@/features/console/console-provider";
import { CustomerPortal } from "./customer-portal";

/** The shipment portal as a customer sees it, shown to staff inside the console. Nothing can be sent from here. */
export function CustomerPortalPreview() {
  const { state } = useConsole();
  const id = typeof state.customerId === "string" ? state.customerId : null;
  return id ? <div className="col" style={{ minHeight: "0", overflow: "hidden" }}><CustomerPortal customerId={id} /></div> : null;
}
