"use client";

import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Shown while an administrator previews the console as a dispatch-team member. */
export function PreviewBar() {
  const { SC, I, exitPreview } = useConsole();
  if (!SC.preview) return null;
  return (
    <div className="pvbar" role="status">
      <Icon className="s14" d={I.eye} />
      <span className="f1">
        <b>Previewing as Jordan Lee</b>
        {" · Dispatcher in Team A. You see only Team A’s 14 trucks and their loads, exactly as Jordan does; nothing you do here is saved as Jordan."}
      </span>
      <button className="btn sm" onClick={exitPreview}>Exit preview</button>
    </div>
  );
}
