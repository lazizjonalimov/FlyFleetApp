"use client";

import { EmptyState } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useSoon } from "@/features/console/use-action";
import { TeamTabs } from "./team-screen";

/** Dispatch teams: groups of trucks a dispatcher works. Nothing records teams yet, so there are none. */
export function DispatchTeamsScreen() {
  const { me, set } = useConsole();
  const soon = useSoon();
  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px" }}>
        <div className="f1">
          <div className="crumb">
            <span>Administration</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <button onClick={() => set(goTo("team"))}>{"Team & access"}</button>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>Dispatch teams</b>
          </div>
          <h1 className="h1">Dispatch teams</h1>
          <p className="sub">{`${me.organization.name} · a team is a group of trucks a dispatcher works, and limits what they see`}</p>
        </div>
        <div className="r g8">
          <button className="btn pri" onClick={soon("Dispatch teams")}>
            <Icon className="s14 b" d="M12 5v14M5 12h14" />
            New team
          </button>
        </div>
      </div>
      <TeamTabs current="teams" />
      <EmptyState icon="M1 5h14v11H1zM15 9h4l3 3v4h-7zM5.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" title="No dispatch teams yet" text="Dispatch teams aren’t available yet. Every dispatcher sees the whole fleet until they are." />
    </div>
  );
}
