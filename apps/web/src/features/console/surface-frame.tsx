"use client";

import { useTheme } from "@/features/console/console-provider";

/** The application root for a surface that stands outside the console shell: sign-in, sign-up, choosing a company. */
export function SurfaceFrame({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <div className="ff" data-theme={theme} data-density="compact">
      {children}
    </div>
  );
}
