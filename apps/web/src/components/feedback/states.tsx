import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { I } from "@/features/console/icons";
import { ApiError, errorMessage } from "@/lib/api/errors";

const OFFLINE = "M1 1l22 22M16.7 11.1A11 11 0 0 1 19 12.6M5 12.6a11 11 0 0 1 5.2-2.5M10.7 5A16 16 0 0 1 22.6 9M1.4 9a16 16 0 0 1 4.7-2.9M8.5 16.1a6 6 0 0 1 7 0M12 20h.01";
const RETRY = "M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15";
const FILTER = "M22 3H2l8 9.5V19l4 2v-8.5z";
const WIDTHS = ["62%", "48%", "70%", "55%", "66%", "58%", "44%", "68%"];

/** Nothing here yet, or nothing matches: an icon, what it means, and what to do about it. */
export function EmptyState({ icon, title, text, children }: { icon: string; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="stc">
      <span className="forbic"><Icon className="s20" d={icon} /></span>
      <div className="fs14 w6">{title}</div>
      {text ? <p className="fs12 mu pre" style={{ maxWidth: "420px" }}>{text}</p> : null}
      {children ? <div className="r g8">{children}</div> : null}
    </div>
  );
}

/** Filters or a search hide everything. */
export function FilteredEmpty({ what, clear }: { what: string; clear: () => void }) {
  return (
    <EmptyState icon={FILTER} title={`No ${what} match`}>
      <button className="btn sm" onClick={clear}>Clear filters</button>
    </EmptyState>
  );
}

/** The request failed: what the server said, a way to try again, and the request's id for support. */
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const api = error instanceof ApiError ? error : null;
  const denied = api?.status === 403;
  return (
    <div className="stc" role="alert">
      <span className="forbic"><Icon className="s20" d={denied ? I.lock : OFFLINE} /></span>
      <div className="fs14 w6">{denied ? "Your role doesn’t include this" : api ? "This couldn’t be loaded" : "Couldn’t reach FlyFleet"}</div>
      <p className="fs12 mu pre" style={{ maxWidth: "420px" }}>{errorMessage(error)}</p>
      {retry && !denied ? (
        <button className="btn sm pri" onClick={retry}>
          <Icon className="s14" d={RETRY} />
          Retry
        </button>
      ) : null}
      {api?.requestId ? <span className="fs11 mu mono">{`request_id ${api.requestId}`}</span> : null}
    </div>
  );
}

/** Placeholder lines while the first page of something loads. */
export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="c g10" style={{ padding: "14px 16px" }} aria-busy="true" aria-label="Loading">
      <span className="skel" style={{ width: "40%" }}></span>
      {WIDTHS.slice(0, rows).map((width, i) => (
        <div key={i} className="r g10">
          <span className="skel" style={{ width: "18px", height: "18px", borderRadius: "5px" }}></span>
          <span className="skel" style={{ width }}></span>
          <span className="skel" style={{ width: "16%", marginLeft: "auto" }}></span>
        </div>
      ))}
    </div>
  );
}
