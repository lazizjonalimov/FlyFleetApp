"use client";

import { Dialog } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";

/** What the bell can tell you about, and who can be told: the same rules the server uses to raise each one. */
export const NOTICES: { code: string; label: string; needs: string[] }[] = [
  { code: "LOADS_AT_RISK", label: "Loads at risk", needs: ["loads.read"] },
  { code: "LOADS_UNASSIGNED", label: "Loads waiting for a driver", needs: ["loads.read"] },
  { code: "MISSING_POD", label: "Delivered without proof of delivery", needs: ["loads.read"] },
  { code: "POD_REVIEW", label: "Proof of delivery to review", needs: ["loads.read", "loads.close"] },
  { code: "LOADS_ON_HOLD", label: "Loads on hold", needs: ["loads.read"] },
  { code: "DRIVERS_BLOCKED", label: "Drivers who can’t be dispatched", needs: ["safety.read"] },
  { code: "UNITS_BLOCKED", label: "Equipment that can’t be dispatched", needs: ["safety.read"] },
  { code: "EXPIRING_SOON", label: "Licenses and papers expiring soon", needs: ["safety.read"] },
  { code: "DOCUMENTS_TO_REVIEW", label: "Compliance documents to review", needs: ["safety.read", "safety.manage"] },
  { code: "WORK_ORDERS_URGENT", label: "Urgent work orders", needs: ["maintenance.read"] },
  { code: "WORK_ORDERS_OVERDUE", label: "Work orders past their date", needs: ["maintenance.read"] },
  { code: "SETTLEMENTS_TO_PAY", label: "Driver pay approved, not yet paid", needs: ["settlements.read"] },
  { code: "INVOICES_OVERDUE", label: "Overdue invoices", needs: ["invoices.read"] },
  { code: "READY_TO_INVOICE", label: "Completed loads not yet invoiced", needs: ["invoices.read"] },
  { code: "DRAFT_INVOICES", label: "Draft invoices", needs: ["invoices.read"] },
];
/** The kinds a person turned off for the bell, kept with their account. */
export const MUTED_KEY = "notifications.muted";

/** The shortcuts, as the dialog lists them. The keys themselves are handled by the console provider. */
export const SHORTCUTS: [keys: string[], what: string][] = [
  [["⌘", "K"], "Search everything, or go anywhere (Ctrl K on Windows)"],
  [["?"], "Keyboard shortcuts"],
  [["Esc"], "Close the panel, menu or dialog on top"],
  [["↑", "↓"], "Move through search results"],
  [["↵"], "Open the search result picked"],
];

/**
 * The keyboard shortcuts dialog: over the current page, never a page of its own. Opened from the account menu
 * or by pressing "?" outside a box; Esc, Done, the close button or the backdrop close it.
 */
export function AccountDialogs() {
  const { state, set } = useConsole();
  if (state.acct !== "keys") return null;
  return <ShortcutsDialog onClose={() => set({ acct: null })} />;
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" sub="They work anywhere in FlyFleet, except while typing in a box" icon={I.kbd} width={480} onClose={onClose}
      footer={<><span className="sp"></span><button className="btn pri" onClick={onClose} autoFocus>Done</button></>}>
      <dl className="c g8">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={what} className="r g8 fs13">
            <dt className="r g4" style={{ minWidth: "72px" }}>{keys.map((k) => <kbd key={k} className="kbd">{k}</kbd>)}</dt>
            <dd className="f1">{what}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
