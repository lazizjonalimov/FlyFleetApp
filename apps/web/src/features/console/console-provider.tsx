"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useLocalPreference } from "@/hooks/use-local-preference";
import { api, unwrap } from "@/lib/api/client";
import { companyOfRecord } from "@/lib/api/scope";
import type { Me } from "@/lib/api/types";
import { useCan, useSession } from "@/lib/auth/session";
import { plural } from "@/lib/format/text";
import { hrefOf, parseLocation, sameScreenHref, staticPaths, touchesLocation } from "./routes";
import { buildShell, type Shell } from "./shell";
import type { ConsoleState, ConsoleUpdate } from "./state";

export type Console = Shell & {
  /** Who is signed in, and to which company. */
  me: Me;
  /** Whether the signed-in role has any of these permissions. Decides what is offered; the API decides what is allowed. */
  can: (...anyOf: string[]) => boolean;
  state: ConsoleState;
  /** Ask for a change of interface state. A change of screen or record is carried out as a navigation. */
  set: (update: ConsoleUpdate) => void;
  /** An address inside the company's workspace. */
  path: (...parts: string[]) => string;
  /** Show a confirmation, or a failure with `bad`. */
  notify: (text: string, bad?: boolean) => void;
};

const ConsoleContext = createContext<Console | null>(null);

/** The shell's view, the interface state, and the ways to change it. */
export function useConsole(): Console {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error("useConsole must be used inside <ConsoleProvider>");
  return value;
}

/**
 * The address the tab is on its way to, until it gets there. A click often runs two handlers that ask for the
 * same move (a link inside a row that is itself a link); the tab must move once. One tab has one address, so
 * this is kept for the tab rather than per component.
 */
let heading: string | null = null;

const DARK = "(prefers-color-scheme: dark)";
const subscribeTheme = (onChange: () => void) => {
  const media = window.matchMedia(DARK);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
/** Light or dark: as chosen under Profile & preferences, or following the device. */
export function useTheme(): "light" | "dark" {
  const [choice] = useLocalPreference("ff.theme", "system");
  const device = useSyncExternalStore<"light" | "dark">(subscribeTheme, () => (window.matchMedia(DARK).matches ? "dark" : "light"), () => "light");
  return choice === "light" || choice === "dark" ? choice : device;
}

/** Compact or comfortable rows: as chosen under Profile & preferences, kept on this computer. */
export function useDensity(): "compact" | "comfortable" {
  const [choice] = useLocalPreference("ff.density", "compact");
  return choice === "comfortable" ? "comfortable" : "compact";
}

/**
 * Holds the console's interface state and gives screens the shell's view of it.
 *
 * The address is the authority on where you are: screen, record and open drawer are read from it, and a state
 * change that moves you is carried out as a navigation. Everything else (overlays, tabs, selection, sorting,
 * form values) is kept here and survives moving between screens.
 */
export function ConsoleProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const me = useSession();
  const can = useCan();
  const slug = me.organization.slug;
  const [store, setStore] = useState<ConsoleState>({});
  const [, startTransition] = useTransition();
  const theme = useTheme();
  const density = useDensity();
  const [sidebar, setSidebar] = useLocalPreference("flyfleet-sidebar", "open");

  const location = useMemo(() => parseLocation(pathname, new URLSearchParams(search)), [pathname, search]);
  const state = useMemo<ConsoleState>(() => ({ ...store, ...location.state }), [store, location]);

  useEffect(() => {
    heading = null;
  }, [pathname, search]);

  // Each render's handlers act on that render's state, like any other React callback.
  const set = useCallback(
    (update: ConsoleUpdate) => {
      const patch = typeof update === "function" ? update(state) : update;
      const apply = () => setStore((previous) => ({ ...previous, ...patch }));
      // Creating anything across companies starts by asking which company it is for.
      if (slug === "all" && patch.modal === "add") return setStore((previous) => ({ ...previous, whichCompany: patch }));
      if (!touchesLocation(patch)) return apply();

      const here = window.location.pathname + window.location.search;
      const next = { ...state, ...patch };
      // A record opens under its own company's address, never under "all".
      const owner = slug === "all" ? companyOfRecord(next.loadId, next.driverId, next.unitId, next.statementId, next.ownerId, next.customerId, next.drawer, next.docId) : null;
      const target = hrefOf(next, owner ?? slug);
      if (target.split("?")[0] === pathname) {
        // Staying on the screen: only the drawer can differ. The address changes without a round trip.
        const same = sameScreenHref(pathname, new URLSearchParams(search), next);
        apply();
        if (same !== here) window.history.pushState(null, "", same);
        return;
      }
      if (target === heading) return apply();
      heading = target;
      // the screen stays as it is until the next one is ready, then state and address change together
      startTransition(() => {
        apply();
        router.push(target);
      });
    },
    [router, state, slug, pathname, search],
  );

  // one confirmation at a time; it leaves by itself
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((text: string, bad = false) => {
    clearTimeout(toastTimer.current);
    setStore((previous) => ({ ...previous, toast: { text, bad } }));
    toastTimer.current = setTimeout(() => setStore((previous) => ({ ...previous, toast: null })), bad ? 8000 : 5000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // what needs someone now, for the sidebar's badges and the bell
  const watching = can("dashboard.read");
  const summary = useQuery({ queryKey: [me.organization.id, "dashboard", "summary"], queryFn: () => unwrap(api.GET("/api/v1/dashboard/summary")), enabled: watching, refetchInterval: 60_000 });
  const exceptions = useQuery({ queryKey: [me.organization.id, "dashboard", "exceptions"], queryFn: () => unwrap(api.GET("/api/v1/dashboard/exceptions")), enabled: watching, refetchInterval: 60_000 });
  const organization = useQuery({ queryKey: [me.organization.id, "organization"], queryFn: () => unwrap(api.GET("/api/v1/organization")), staleTime: 5 * 60_000 });
  const incidents = useQuery({ queryKey: [me.organization.id, "incidents", "counts"], queryFn: () => unwrap(api.GET("/api/v1/incidents/counts")), enabled: can("incidents.read"), refetchInterval: 60_000 });
  const tasks = useQuery({ queryKey: [me.organization.id, "tasks", "counts"], queryFn: () => unwrap(api.GET("/api/v1/tasks/counts")), enabled: can("tasks.read"), refetchInterval: 60_000 });
  const unread = useQuery({ queryKey: [me.organization.id, "conversations", "unread"], queryFn: () => unwrap(api.GET("/api/v1/conversations/unread")), enabled: can("messages.read"), refetchInterval: 30_000 });

  const shell = useMemo(() => {
    const alerts = exceptions.data ?? [];
    const safety = summary.data?.safety;
    const counts = {
      alerts: incidents.data ? { n: incidents.data.open, hot: incidents.data.high > 0 } : { n: 0, hot: false },
      safety: safety ? { n: safety.expired + safety.expiring + safety.missing } : undefined,
      documents: { n: alerts.find((alert) => alert.code === "DOCUMENTS_TO_REVIEW")?.count ?? 0 },
      tasks: tasks.data ? { n: tasks.data.open, hot: tasks.data.overdue > 0 } : undefined,
      messages: unread.data ? { n: unread.data.unread } : undefined,
    };
    const drivers = summary.data?.fleet?.drivers_active;
    const orgSub = [organization.data?.mc_number || (organization.data?.dot_number ? `DOT ${organization.data.dot_number}` : ""), drivers === undefined ? "" : plural(drivers, "driver")].filter(Boolean).join(" · ");
    return buildShell({ me, can, state, set, theme, density, mini: sidebar === "mini", setMini: (mini) => setSidebar(mini ? "mini" : "open"), orgSub, counts });
  }, [me, can, state, set, theme, density, sidebar, setSidebar, summary.data, exceptions.data, organization.data, incidents.data, tasks.data, unread.data]);

  const path = useCallback((...parts: string[]) => `/${slug}/${parts.join("/")}`, [slug]);

  const value = useMemo<Console>(() => ({ ...shell, me, can, state, set, path, notify }), [shell, me, can, state, set, path, notify]);

  // for the keyboard: the view as last rendered
  const current = useRef(value);
  useEffect(() => {
    current.current = value;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const now = current.current;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (now.isPalette) now.closeOverlay();
        else now.openPalette();
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (event.key === "?" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        now.set({ overlay: "none", acct: "keys" });
        return;
      }
      if (event.key !== "Escape") return;
      // close the top-most layer only
      if (now.state.acct) now.set({ acct: null });
      else if (now.state.dd) now.set({ dd: null, ddq: "" });
      else if (now.hasModal) now.closeModal();
      else if (now.isPalette || now.isNotif || now.isAI || now.isCreate || now.isAcct) now.closeOverlay();
      else if (now.state.drawer) now.closeDrawer();
      else if (now.isDispatch && now.state.panel && now.state.panel !== "none") now.closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // keep the current sidebar item in view when it sits below the fold
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".ff .nav");
    const item = nav?.querySelector<HTMLElement>(".navi.on");
    if (!nav || !item) return;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (bottom > nav.scrollTop + nav.clientHeight - 8) nav.scrollTop = bottom - nav.clientHeight + 40;
    else if (top < nav.scrollTop) nav.scrollTop = Math.max(0, top - 40);
  }, [pathname]);

  // the sidebar's destinations are ready before they are asked for
  useEffect(() => {
    for (const address of staticPaths(slug)) router.prefetch(address);
  }, [router, slug]);


  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}
