"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { formatDay } from "@/lib/format/dates";
import { initials, plural } from "@/lib/format/text";

type Invitation = Schema<"InvitationOut">;
const STATE: Record<string, [string, string]> = { pending: ["Waiting", "warn"], expired: ["Expired", "mu"], accepted: ["Joined", "ok"] };

/** The link to share: FlyFleet doesn't send email yet, so whoever invites passes it on. */
function ShareLink({ path, name }: { path: string; name: string }) {
  const { notify } = useConsole();
  const link = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  return (
    <div className="c g6">
      <div className="banner" data-k="info"><span className="f1 fs12">{`Send this link to ${name}. It works once, for a week, and isn’t shown again — make a new one if it’s lost.`}</span></div>
      <div className="r g8">
        <input className="inp mono f1" readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
        <button className="btn" onClick={() => void navigator.clipboard?.writeText(link).then(() => notify("Link copied"), () => notify("Select the link and copy it", true))}><Icon className="s14" d={I.copy} />Copy</button>
      </div>
    </div>
  );
}

/** Invite someone with a role: they get a link to set up their sign-in. Or, for someone at hand, a temporary
 * password straight away. */
export function InviteDialog({ onClose, onPassword, driver }: { onClose: () => void; onPassword?: () => void; driver?: { id: string; name: string; email: string | null } }) {
  const { me } = useConsole();
  const org = me.organization.id;
  const client = useQueryClient();
  const roles = useQuery({ queryKey: [org, "roles"], queryFn: () => unwrap(api.GET("/api/v1/roles")), staleTime: 30_000, enabled: !driver });
  const [name, setName] = useState(driver?.name ?? "");
  const [email, setEmail] = useState(driver?.email ?? "");
  const [role, setRole] = useState(driver ? "driver" : "dispatcher");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [made, setMade] = useState<{ path: string; name: string } | null>(null);
  const choices = (roles.data?.roles ?? []).filter((r) => r.assignable && r.key !== "owner_portal" && r.key !== "driver" && (r.key !== "owner" || me.organization.role === "owner"));
  const send = async () => {
    if (!name.trim()) return setProblem("Enter their name");
    if (!email.trim()) return setProblem("Enter their email");
    setPending(true);
    setProblem(null);
    try {
      const out = await unwrap(api.POST("/api/v1/invitations", { body: { email: email.trim(), full_name: name.trim(), role, driver_id: driver?.id ?? null } }));
      await client.invalidateQueries({ queryKey: [org, "invitations"] });
      setMade({ path: out.path, name: name.trim().split(" ")[0] ?? name.trim() });
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      title={driver ? `Invite ${driver.name} to the driver app` : "Invite member"}
      sub={made ? "Invitation ready" : "They choose their own password when they open the link"}
      icon={I.userplus}
      width={520}
      onClose={() => !pending && onClose()}
      footer={made ? <><span className="sp"></span><button className="btn pri" onClick={onClose}>Done</button></> : (
        <>
          {onPassword && !driver ? <button className="btn ghost" onClick={onPassword}>Set a temporary password instead</button> : null}
          <span className="sp"></span>
          <button className="btn" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn pri" onClick={() => void send()} disabled={pending}>{pending ? "Creating…" : "Create invitation"}</button>
        </>
      )}
    >
      <Problem message={problem} />
      {made ? <ShareLink path={made.path} name={made.name} /> : (
        <>
          <div className="fld"><label htmlFor="inv-name">Name</label><input id="inv-name" className="inp" maxLength={120} value={name} onChange={(e) => setName(e.currentTarget.value)} autoFocus={!driver} /></div>
          <div className="fld"><label htmlFor="inv-email">Email</label><input id="inv-email" className="inp" type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.currentTarget.value)} /></div>
          {driver ? <p className="fs12 mu">They sign in to the driver app with it, and messages and alerts reach them there.</p> : (
            <div className="fld">
              <label htmlFor="inv-role">Role</label>
              <select id="inv-role" className="inp" value={role} onChange={(e) => setRole(e.currentTarget.value)}>
                {choices.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}

/** Invitations: waiting, expired and recently used, with a fresh link or withdrawal for those not used. */
export function InvitationsPanel({ onInvite }: { onInvite: () => void }) {
  const { me, notify } = useConsole();
  const org = me.organization;
  const client = useQueryClient();
  const list = useQuery({ queryKey: [org.id, "invitations"], queryFn: () => unwrap(api.GET("/api/v1/invitations")) });
  const [link, setLink] = useState<{ path: string; name: string } | null>(null);
  const renew = async (i: Invitation) => {
    try {
      const out = await unwrap(api.POST("/api/v1/invitations/{invitation_id}/renew", { params: { path: { invitation_id: i.id } } }));
      await client.invalidateQueries({ queryKey: [org.id, "invitations"] });
      setLink({ path: out.path, name: i.full_name.split(" ")[0] ?? i.full_name });
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  const withdraw = async (i: Invitation) => {
    try {
      await unwrap(api.DELETE("/api/v1/invitations/{invitation_id}", { params: { path: { invitation_id: i.id } } }));
      await client.invalidateQueries({ queryKey: [org.id, "invitations"] });
      notify(`Invitation to ${i.full_name} withdrawn`);
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  const cols = "minmax(0,1.3fr) minmax(0,1.2fr) 160px 110px 150px 170px";
  return (
    <div className="card oh c" style={{ flex: "1", minHeight: "0", margin: "16px 24px 24px" }}>
      <div className="thead" style={{ gridTemplateColumns: cols }}>
        {["Person", "Email", "Role", "Status", "Invited", ""].map((h) => <span key={h}><span>{h}</span></span>)}
      </div>
      <div className="tbody">
        {list.isPending ? <Skeleton /> : null}
        {list.isError ? <ErrorState error={list.error} retry={() => void list.refetch()} /> : null}
        {list.data && !list.data.length ? (
          <EmptyState icon={I.userplus} title="No invitations" text="Invite someone with a role: they get a link to set up their own sign-in.">
            <button className="btn pri sm" onClick={onInvite}><Icon className="s14" d={I.userplus} />Invite member</button>
          </EmptyState>
        ) : null}
        {(list.data ?? []).map((i) => {
          const [label, tone] = STATE[i.state] ?? [i.state, "mu"];
          return (
            <div key={i.id} className="trow" style={{ gridTemplateColumns: cols }}>
              <div className="td"><div className="r g8 mw0"><span className="av sm">{initials(i.full_name)}</span><span className="ell w5">{i.full_name}</span></div></div>
              <div className="td"><span className="ell t2">{i.email}</span></div>
              <div className="td"><span className="ell">{i.role_label}</span></div>
              <div className="td"><span className="badge" data-k={tone}><i></i>{label}</span></div>
              <div className="td"><span className="fs12 t2">{`${formatDay(i.created_at, org.timezone)}${i.invited_by_name ? ` · ${i.invited_by_name.split(" ")[0]}` : ""}`}</span></div>
              <div className="td rt">
                {i.state === "accepted" ? <span className="fs12 mu">{i.accepted_at ? `Joined ${formatDay(i.accepted_at, org.timezone)}` : ""}</span> : (
                  <div className="r g6">
                    <button className="btn xs" onClick={() => void renew(i)}>New link</button>
                    <button className="btn xs ghost" onClick={() => void withdraw(i)}>Withdraw</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="tfoot"><span>{list.data ? `${plural(list.data.filter((i) => i.state === "pending").length, "invitation")} waiting · links work once, for a week` : ""}</span></div>
      {link ? (
        <Dialog title="New invitation link" sub="The old link no longer works" icon={I.link} width={520} onClose={() => setLink(null)} footer={<><span className="sp"></span><button className="btn pri" onClick={() => setLink(null)}>Done</button></>}>
          <ShareLink path={link.path} name={link.name} />
        </Dialog>
      ) : null}
    </div>
  );
}

/** Access review: who can do what, with their exceptions and sensitive access, to check now and then. */
export function AccessReviewDialog({ onClose }: { onClose: () => void }) {
  const { me } = useConsole();
  const review = useQuery({ queryKey: [me.organization.id, "access-review"], queryFn: () => unwrap(api.GET("/api/v1/access-review", { params: { query: { format: "json" } } })) });
  const rows = (review.data ?? []) as Schema<"ReviewRow">[];
  return (
    <Dialog title="Access review" sub="Each person’s role, their exceptions and the sensitive access they end up with" icon={I.history} width={760} onClose={onClose}
      footer={<><button className="btn" onClick={() => window.open("/api/v1/access-review?format=csv", "_blank", "noopener")}><Icon className="s14" d={I.download} />Export CSV</button><span className="sp"></span><button className="btn pri" onClick={onClose}>Done</button></>}>
      {review.isPending ? <Skeleton /> : null}
      <div className="c" style={{ maxHeight: "420px", overflow: "auto", border: "1px solid var(--bd)", borderRadius: "8px" }}>
        {rows.map((r) => (
          <div key={r.user_id} className="wl" style={{ alignItems: "flex-start", opacity: r.active ? 1 : 0.6 }}>
            <span className="av sm">{initials(r.name)}</span>
            <div className="f1" style={{ minWidth: "0" }}>
              <div className="fs13 w5">{r.name}<span className="mu fs12">{` · ${r.role_label}${r.team ? ` · ${r.team}` : ""}${r.active ? "" : " · access removed"}`}</span></div>
              <div className="fs12 mu">{`${plural(r.permissions, "permission")}${r.sensitive.length ? ` · sensitive: ${r.sensitive.join(", ")}` : ""}`}</div>
              {r.exceptions.length ? <div className="fs12 t2">{`Exceptions: ${r.exceptions.join(", ")}`}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
