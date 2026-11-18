"use client";

import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { useAction } from "@/features/console/use-action";
import { api, unwrap } from "@/lib/api/client";

/** Shown instead of a screen the signed-in role may not open. */
export function Forbidden() {
  const { FB, user, goDash } = useConsole();
  const run = useAction();
  // Asks the people who manage the team; asking again says who was already asked.
  const ask = () => void run(() => unwrap(api.POST("/api/v1/access-requests", { body: { permission: FB.perm, context: FB.mod } })), (out) => (out.already ? `You’ve already asked ${out.admins.join(" and ")}` : `Asked ${out.asked.join(" and ")} for access to ${FB.mod}`));
  return (
    <div className="forb">
      <div className="c g8" style={{ alignItems: "center", maxWidth: "420px", textAlign: "center" }}>
        <span className="forbic"><Icon className="s20" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" /></span>
        <h1 className="fs16 w6" style={{ marginTop: "6px" }}>{"You don’t have access to "}<span>{FB.mod}</span></h1>
        <p className="fs13 mu pre">
          Your role (<span>{user.role}</span>{") doesn’t include "}
          <span className="mono t2"><span>{FB.perm}</span></span>
          {". If you need it, ask an owner or administrator to change your role in Team & access."}
        </p>
        <div className="r g8" style={{ marginTop: "8px" }}>
          <button className="btn" onClick={ask}>Request access</button>
          <button className="btn pri" onClick={goDash}>Back to dashboard</button>
        </div>
        <p className="fs11 mu" style={{ marginTop: "10px" }}>FlyFleet gives the same answer whether or not a record exists, and hides the counts too.</p>
      </div>
    </div>
  );
}
