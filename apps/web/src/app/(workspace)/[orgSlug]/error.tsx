"use client";

import { Icon } from "@/components/ui/icon";

/** Shown in place of a screen that failed to render. The rest of the console stays usable. */
export default function ScreenError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="forb" role="alert">
      <div className="c g8" style={{ alignItems: "center", maxWidth: "420px", textAlign: "center" }}>
        <span className="forbic">
          <Icon className="s20" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
        </span>
        <h1 className="fs16 w6" style={{ marginTop: "6px" }}>
          This screen couldn’t be shown
        </h1>
        <p className="fs13 mu pre">Something went wrong while drawing it. Nothing was changed. Try again, or open another section from the sidebar.</p>
        <div className="r g8" style={{ marginTop: "8px" }}>
          <button className="btn pri" onClick={reset}>
            <Icon className="s14" d="M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" />
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
