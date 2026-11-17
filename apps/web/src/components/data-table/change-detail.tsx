"use client";

import { Fragment } from "react";
import { Icon } from "@/components/ui/icon";
import { type Row } from "@/features/console/view";

/** The before/after detail under an expanded row. */
export function ChangeDetail({ r }: { r: Row }) {
  if (!r.x) return null;
  return (
    <div className="xrow">
      <div className="r g8 fs12 mu" style={{ marginBottom: "8px" }}>
        <span className="over"><span>{r.x.title}</span></span>
        <span className="sp"></span>
        <span className="mono"><span>{r.x.meta}</span></span>
      </div>
      {r.x.lines.some((ln) => ln.a) ? (
        <div className="xgrid">
          <span className="xh">Field</span>
          <span className="xh">Before</span>
          <span className="xh">After</span>
          {r.x.lines.map((ln, i) => (
            <Fragment key={i}>
              <span className="mono t2"><span>{ln.k}</span></span>
              <span className="mono xa"><span>{ln.a}</span></span>
              <span className="mono xb">
                <Icon className="s12" d="M5 12h14M13 6l6 6-6 6" />
                <span>{ln.b}</span>
              </span>
            </Fragment>
          ))}
        </div>
      ) : r.x.lines.length ? (
        // Details recorded as they were, without a before and after.
        <div className="xgrid" style={{ gridTemplateColumns: "200px minmax(0,1fr)" }}>
          <span className="xh">Field</span>
          <span className="xh">Recorded</span>
          {r.x.lines.map((ln, i) => (
            <Fragment key={i}>
              <span className="mono t2"><span>{ln.k}</span></span>
              <span className="mono" style={{ overflowWrap: "anywhere" }}><span>{ln.b}</span></span>
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}
