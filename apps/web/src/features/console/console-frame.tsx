"use client";

import { clsx } from "clsx";
import { AddModal } from "@/features/add/add-modal";
import { AskFlyFleet } from "@/features/assistant/ask-flyfleet";
import { useConsole } from "@/features/console/console-provider";
import { CommandPalette } from "@/features/shell/command-palette";
import { Forbidden } from "@/features/shell/forbidden";
import { NotificationsPanel } from "@/features/shell/notifications-panel";
import { Sidebar } from "@/features/shell/sidebar";
import { Toast } from "@/features/shell/toast";
import { TopBar } from "@/features/shell/top-bar";

/** The console: sidebar, top bar, the screen for the address, and whatever is open on top of it. */
export function ConsoleFrame({ children }: { children: React.ReactNode }) {
  const { theme, density, sbCls, isMenu, closeOverlay, isForbidden } = useConsole();
  return (
    <div className="ff" data-theme={theme} data-density={density}>
      <div className={clsx("shell", sbCls)}>
        <Sidebar />
        <div className="c" style={{ minHeight: "0" }}>
          {isMenu ? (
            <div className="away" onClick={closeOverlay}></div>
          ) : null}
          <TopBar />
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
