"use client";

import { useSyncExternalStore } from "react";

/**
 * A clock that ticks every `step` milliseconds while something is watching it. Its time is null on the server and
 * while the page hydrates, so nothing drawn from "now" can differ between the two.
 */
function clock(step: number) {
  const watchers = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  const subscribe = (onTick: () => void): (() => void) => {
    watchers.add(onTick);
    if (!timer) timer = setInterval(() => watchers.forEach((tick) => tick()), Math.min(step, 20_000));
    return () => {
      watchers.delete(onTick);
      if (!watchers.size && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  };
  const read = () => Math.floor(Date.now() / step) * step;
  return () => useSyncExternalStore(subscribe, read, () => null);
}

/** The time to the minute, in the browser only. */
export const useMinuteClock: () => number | null = clock(60_000);
/** The time to the second, in the browser only. */
export const useSecondClock: () => number | null = clock(1000);
