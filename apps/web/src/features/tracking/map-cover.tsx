"use client";

import { useEffect } from "react";
import { useConsole } from "@/features/console/console-provider";

/** The sheet the live map is drawn on, in pixels. */
const SHEET = { width: 1208, height: 788 };

/**
 * Scales the live map's sheet to cover the area it has (see `--fit` in globals.css). Draws nothing itself.
 * In a window of the design's size the scale is 1 and the map is left exactly as designed.
 */
export function MapCover() {
  const { isTracking } = useConsole();
  useEffect(() => {
    if (!isTracking) return;
    const area = document.querySelector<HTMLElement>(".ff .mapw");
    if (!area) return;
    const fit = () => {
      const scale = Math.max(area.clientWidth / SHEET.width, area.clientHeight / SHEET.height);
      if (scale === 1) area.style.removeProperty("--fit");
      else area.style.setProperty("--fit", scale.toFixed(4));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    return () => observer.disconnect();
  }, [isTracking]);
  return null;
}
