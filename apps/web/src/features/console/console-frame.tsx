"use client";

import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { AddModal } from "@/features/add/add-modal";
import { AskFlyFleet } from "@/features/assistant/ask-flyfleet";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import { plural } from "@/lib/format/text";
import { CommandPalette } from "@/features/shell/command-palette";
import { Forbidden } from "@/features/shell/forbidden";
import { NotificationsPanel } from "@/features/shell/notifications-panel";
import { Sidebar } from "@/features/shell/sidebar";
import { Toast } from "@/features/shell/toast";
import { TopBar } from "@/features/shell/top-bar";
import { usePreview } from "@/lib/auth/session";

/** The console: sidebar, top bar, the screen for the address, and whatever is open on top of it. */
export function ConsoleFrame({ children }: { children: React.ReactNode }) {
  const { me, set, theme, density, sbCls, isMenu, closeOverlay, isForbidden } = useConsole();
  const preview = usePreview();
  const scope = me.scope;
  return (
    <div className="ff" data-theme={theme} data-density={density}>
      <div className={clsx("shell", sbCls)}>
        <Sidebar />
        <div className="c" style={{ minHeight: "0" }}>
          {isMenu ? (
            <div className="away" onClick={closeOverlay}></div>
          ) : null}
          <TopBar />
          {preview.on && scope ? (
            <div className="pvbar" role="status">
              <Icon className="s14" d={I.eye} />
              <span className="f1">
                <b>{`Previewing as ${scope.lead_name ?? `a dispatcher in ${scope.team_name}`}`}</b>
                {` · Dispatcher in ${scope.team_name}. You see only ${scope.team_name}’s ${plural(scope.trucks, "truck")} and their loads, exactly as ${scope.lead_name ? scope.lead_name.split(" ")[0] + " does" : "its dispatchers do"}; nothing can be changed while previewing.`}
              </span>
              <button className="btn sm" onClick={() => { preview.stop(); set(goTo("teams")); }}>Exit preview</button>
            </div>
          ) : null}
          <main className="main">{isForbidden ? <Forbidden /> : children}</main>
        </div>
      </div>
      <CommandPalette />
      <NotificationsPanel />
      <AskFlyFleet />
      <AddModal />
      <Toast />
    </div>
  );
}
