"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ConsoleLogic, DRIVERS, stopTimers, type ConsoleProps, type ConsoleState, type ConsoleUpdate } from "./model/console-model";
import { hrefOf, parseLocation, propsFromQuery, STATIC_PATHS, touchesLocation } from "./routes";
import type { ConsoleView } from "./view";

const ConsoleContext = createContext<ConsoleView | null>(null);

/** Everything the current screen renders, and the handlers its controls call. */
export function useConsole(): ConsoleView {
  const view = useContext(ConsoleContext);
  if (!view) throw new Error("useConsole must be used inside <ConsoleProvider>");
  return view;
}

const DRIVER_NAMES = DRIVERS.map((driver) => driver.n);
const NO_QUERY = new URLSearchParams();
type Query = { get(name: string): string | null; toString(): string };

/**
 * Holds the console's interface state and turns it, with the address, into the view the screens render.
 *
 * The address is the authority on where you are: screen, record and open drawer are read from it, and a state
 * change that moves you is carried out as a navigation. Everything else (overlays, tabs, selection, sorting,
 * form values) is kept here and survives moving between screens, as it does in the design.
 */
function Console({ query, children }: { query: Query; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [store, setStore] = useState<ConsoleState>({});
  const [, startTransition] = useTransition();

  const search = query.toString();
  const location = useMemo(() => parseLocation(pathname, new URLSearchParams(search), DRIVER_NAMES), [pathname, search]);
  const props = useMemo<ConsoleProps>(() => ({ ...propsFromQuery(new URLSearchParams(search)), ...location.props }), [search, location]);
  const state = useMemo<ConsoleState>(() => ({ ...store, ...location.state }), [store, location]);

  // Each render's handlers act on that render's state, like any other React callback.
  const dispatch = useCallback(
    (update: ConsoleUpdate) => {
      const patch = typeof update === "function" ? update(state) : update;
      const apply = () => setStore((previous) => ({ ...previous, ...patch }));
      if (!touchesLocation(patch)) return apply();

      const here = pathname + (search ? `?${search}` : "");
      const target = hrefOf({ ...state, ...patch }, props, new URLSearchParams(search));
      if (target === here) return apply();
      if (target.split("?")[0] === pathname) {
        // same screen, different drawer: the address changes without a round trip
        apply();
        window.history.pushState(null, "", target);
        return;
      }
      // the screen stays as it is until the next one is ready, then state and address change together
      startTransition(() => {
        apply();
        router.push(target);
      });
    },
    [router, state, props, pathname, search],
  );

  const view = useMemo<ConsoleView>(() => {
    const logic = new ConsoleLogic();
    logic.props = props;
    logic.state = state;
    logic.onState = dispatch;
    return { ...props, ...logic.renderVals() };
  }, [props, state, dispatch]);

  // for the keyboard: the view and state as last rendered
  const current = useRef({ view, state, dispatch });
  useEffect(() => {
    current.current = { view, state, dispatch };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { view: now, state: nowState, dispatch: act } = current.current;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (!now.isConsole) return;
        event.preventDefault();
        if (now.isPalette) now.closeOverlay();
        else now.openPalette();
        return;
      }
      if (event.key !== "Escape") return;
      // close the top-most layer only
      if (nowState.dd) act({ dd: null, ddq: "" });
      else if (now.hasModal) now.closeModal();
      else if (now.isPalette || now.isNotif || now.isAI || now.isCreate || now.isAcct) now.closeOverlay();
      else if (now.hasDrawer) now.closeDrawer();
      else if (now.isDispatch && now.B?.wp) now.closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // keep the current sidebar item in view when it sits below the fold
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".ff .nav");
    const current = nav?.querySelector<HTMLElement>(".navi.on");
    if (!nav || !current) return;
    const top = current.offsetTop;
    const bottom = top + current.offsetHeight;
    if (bottom > nav.scrollTop + nav.clientHeight - 8) nav.scrollTop = bottom - nav.clientHeight + 40;
    else if (top < nav.scrollTop) nav.scrollTop = Math.max(0, top - 40);
  }, [pathname]);

  // the sidebar's destinations are ready before they are asked for
  useEffect(() => {
    if (!pathname.startsWith("/login") && !location.known) return;
    const sticky = hrefOf({ screen: "dashboard" }, {}, new URLSearchParams(search)).split("?")[1];
    for (const path of STATIC_PATHS) router.prefetch(sticky ? `${path}?${sticky}` : path);
    // once per sign-in state is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => stopTimers, []);

  return <ConsoleContext.Provider value={view}>{children}</ConsoleContext.Provider>;
}

function ConsoleWithQuery({ children }: { children: React.ReactNode }) {
  return <Console query={useSearchParams()}>{children}</Console>;
}

/**
 * Pages are prerendered, and a prerender cannot know the query string. The fallback is therefore the console
 * itself, rendered for an address without one, which is what the server sends. In the browser the same console
 * renders with the real query (a role being viewed, an open drawer).
 */
export function ConsoleProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Console query={NO_QUERY}>{children}</Console>}>
      <ConsoleWithQuery>{children}</ConsoleWithQuery>
    </Suspense>
  );
}
