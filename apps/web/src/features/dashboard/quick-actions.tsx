"use client";

import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { addOf, goTo } from "@/features/console/shell";

/** What each quick action needs; the API checks the same permission when it is done. */
export const QUICK_ACTIONS = [
  { key: "assign", label: "Assign a driver", icon: I.dispatch, needs: "dispatch.assign" },
  { key: "invoice", label: "Create an invoice", icon: I.invoice, needs: "invoices.create" },
  { key: "driver", label: "Add a driver", icon: I.user, needs: "drivers.manage" },
  { key: "truck", label: "Add a truck", icon: I.truck, needs: "equipment.manage" },
] as const;

/** The quick actions a role can take: Accounting sees only the invoice one, a dispatcher only assigning. */
export function quickActionsFor(can: (...anyOf: string[]) => boolean) {
  return QUICK_ACTIONS.filter((action) => can(action.needs));
}

export function QuickActions() {
  const { can, set } = useConsole();
  const actions = quickActionsFor(can);
  if (!actions.length) return null;
  const run = (key: (typeof QUICK_ACTIONS)[number]["key"]) =>
    key === "assign" ? set(goTo("dispatch")) : set(addOf(key));
  return (
    <div className="qact" role="group" aria-label="Quick actions">
      {actions.map((action) => (
        <button key={action.key} type="button" className="btn sm" onClick={() => run(action.key)}>
          <Icon className="s14" d={action.icon} />
          {action.label}
        </button>
      ))}
    </div>
  );
}
