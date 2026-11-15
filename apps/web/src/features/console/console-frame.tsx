"use client";

import { clsx } from "clsx";
import { AddModal } from "@/features/add/add-modal";
import { AskFlyFleet } from "@/features/assistant/ask-flyfleet";
import { useConsole } from "@/features/console/console-provider";
import { OwnerPortal } from "@/features/owners/owner-portal";
import { CommandPalette } from "@/features/shell/command-palette";
import { Forbidden } from "@/features/shell/forbidden";
import { NotificationsPanel } from "@/features/shell/notifications-panel";
import { PreviewBar } from "@/features/shell/preview-bar";
import { Sidebar } from "@/features/shell/sidebar";
import { Toast } from "@/features/shell/toast";
import { TopBar } from "@/features/shell/top-bar";

/** The whole application surface: the console shell with its overlays, or one of the standalone surfaces. */
export function ConsoleFrame({ children }: { children: React.ReactNode }) {
  const { theme, density, isConsole, sbCls, isMenu, closeOverlay } = useConsole();
  return (
    <div className="ff" data-theme={theme} data-density={density}>
      {isConsole ? (
        <>
          <div className={clsx("shell", sbCls)}>
            <Sidebar />
            <div className="c" style={{ minHeight: "0" }}>
              {isMenu ? (
                <div className="away" onClick={closeOverlay}></div>
              ) : null}
              <TopBar />
              <PreviewBar />
              <main className="main">
                {children}
                <Forbidden />
              </main>
            </div>
          </div>
          <CommandPalette />
          <NotificationsPanel />
          <AskFlyFleet />
          <AddModal />
          <Toast />
        </>
      ) : null}
      <OwnerPortal />
    </div>
  );
}
