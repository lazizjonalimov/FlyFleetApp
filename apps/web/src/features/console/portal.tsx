"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/**
 * Renders on top of the whole console (inside its `.ff` root, so the design's styles still apply), for a dialog
 * opened from somewhere narrow like the sidebar, which would otherwise clip it.
 */
export function ConsolePortal({ children }: { children: React.ReactNode }) {
  const root = useSyncExternalStore(noop, () => document.querySelector<HTMLElement>(".ff"), () => null);
  return root ? createPortal(children, root) : null;
}
