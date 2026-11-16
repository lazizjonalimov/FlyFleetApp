"use client";

import { EmptyState } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

const SPARK = "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z";

/** Ask FlyFleet: the assistant panel. The assistant isn't connected yet, so it says so. */
export function AskFlyFleet() {
  const { isAI, closeOverlay, goAlerts } = useConsole();
  if (!isAI) return null;
  return (
    <aside className="aip" aria-label="Ask FlyFleet">
      <div className="r g8" style={{ padding: "14px 16px", borderBottom: "1px solid var(--bd)" }}>
        <span className="ilogo" data-k="violet" style={{ width: "30px", height: "30px" }}>
          <Icon className="s14" d={SPARK} />
        </span>
        <div className="f1">
          <div className="fs14 w6">Ask FlyFleet</div>
          <div className="fs11 mu">Answers from records you can see · read-only</div>
        </div>
        <button className="btn ghost icon sm" onClick={closeOverlay} aria-label="Close assistant"><Icon d="M18 6L6 18M6 6l12 12" /></button>
      </div>
      <div className="aibody" style={{ display: "grid", placeItems: "center" }}>
        <EmptyState icon={SPARK} title="The assistant isn’t available yet" text="When it is, it will answer questions from the records your role can see. For now, what needs attention is listed under Fleet alerts.">
          <button
            className="btn sm"
            onClick={() => {
              closeOverlay();
              goAlerts();
            }}
          >
            Open Fleet alerts
          </button>
        </EmptyState>
      </div>
    </aside>
  );
}
