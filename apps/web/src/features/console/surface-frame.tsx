"use client";

import { useConsole } from "@/features/console/console-provider";

/** The application root for a surface that stands outside the console shell. */
export function SurfaceFrame({ children }: { children: React.ReactNode }) {
  const { theme, density } = useConsole();
  return (
    <div className="ff" data-theme={theme} data-density={density}>
      {children}
    </div>
  );
}
