"use client";

import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { markColor } from "@/features/console/shell";
import type { OrgRef } from "@/lib/api/types";
import { humanize, initials } from "@/lib/format/text";

type Props = {
  email: string;
  organizations: OrgRef[];
  /** The company the session is in now, when there is one. */
  currentId?: string;
  pending: string | null;
  error: string | null;
  choose: (organization: OrgRef) => void;
  back: () => void;
};

/** The companies an account belongs to. Each keeps its own data; the session is in one at a time. */
export function Organizations({ email, organizations, currentId, pending, error, choose, back }: Props) {
  return (
    <div className="authcard" style={{ width: "460px" }}>
      <div className="r g8">
        <span className="badge" data-k="ok">
          <Icon className="s12 b" d="M5 12l5 5 9-10" />
          Signed in
        </span>
      </div>
      <h2 style={{ fontSize: "22px", lineHeight: "28px", fontWeight: "600", letterSpacing: "-0.015em", marginTop: "12px" }}>Choose an organization</h2>
      <p className="fs13 mu" style={{ marginTop: "4px" }}>{"Signed in as "}<span>{email}</span>{". Each company’s data stays separate."}</p>
      {error ? (
        <div className="banner" data-k="bad" role="alert" style={{ marginTop: "14px" }}>
          <Icon className="s14" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
          <div className="f1">{error}</div>
        </div>
      ) : null}
      <div className="c g8" style={{ marginTop: "18px" }}>
        {organizations.map((organization, i) => {
          const current = currentId ? organization.id === currentId : i === 0;
          return (
            <div key={organization.id} className={clsx("orgc", current && "on")}>
              <span className="orgmk" style={{ background: markColor(organization.id), width: "36px", height: "36px", borderRadius: "8px", fontSize: "13px" }}><span>{initials(organization.name)}</span></span>
              <div className="f1">
                <div className="r g6">
                  <span className="fs14 w6"><span>{organization.name}</span></span>
                  {organization.status !== "active" ? (
                    <span className="tag" data-k="warn">{humanize(organization.status)}</span>
                  ) : null}
                </div>
                <div className="fs12 mu"><span>{organization.role_label || humanize(organization.role)}</span></div>
              </div>
              <button className={clsx("btn sm", current && "pri")} disabled={pending !== null} onClick={() => choose(organization)}>
                <span>{pending === organization.id ? "Opening…" : current ? "Continue" : "Open"}</span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="r g8 fs12 mu" style={{ marginTop: "18px" }}>
        <span className="f1">Not you?</span>
        <button className="lnk" onClick={back}>Use a different account</button>
      </div>
    </div>
  );
}
