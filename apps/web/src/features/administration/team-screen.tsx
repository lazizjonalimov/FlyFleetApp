"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import { AccessReviewDialog, InvitationsPanel, InviteDialog } from "./invitations";
import { RolesPanel } from "./roles-panel";
import { api, unwrap } from "@/lib/api/client";
import { initials, plural } from "@/lib/format/text";


type TabKey = "members" | "roles" | "teams" | "invitations";

/** The Members / Roles / Dispatch teams / Invitations tabs shared by Team & access and Dispatch teams. */
export function TeamTabs({ current }: { current: TabKey }) {
  const { me, set, state } = useConsole();
  const org = me.organization.id;
  const members = useQuery({ queryKey: [org, "members"], queryFn: () => unwrap(api.GET("/api/v1/members")), staleTime: 30_000 });
  const roles = useQuery({ queryKey: [org, "roles"], queryFn: () => unwrap(api.GET("/api/v1/roles")), staleTime: 30_000 });
  const teams = useQuery({ queryKey: [org, "dispatch-teams"], queryFn: () => unwrap(api.GET("/api/v1/dispatch-teams")), staleTime: 30_000 });
  const invites = useQuery({ queryKey: [org, "invitations"], queryFn: () => unwrap(api.GET("/api/v1/invitations")), staleTime: 30_000 });
  const tabs: [key: TabKey, label: string, n: string][] = [
    ["members", "Members", members.data ? String(members.data.filter((member) => member.active).length) : ""],
    ["roles", "Roles & permissions", roles.data ? String(roles.data.roles.filter((r) => r.key !== "driver").length) : ""],
    ["teams", "Dispatch teams", teams.data ? String(teams.data.teams.length) : ""],
    ["invitations", "Invitations", invites.data ? String(invites.data.filter((i) => i.state === "pending").length) : ""],
  ];
  return (
    <div className="tabs">
      {tabs.map(([key, label, n]) => (
        <button key={key} className={clsx("tab", key === current && "on")} onClick={() => (key === "teams" ? set(goTo("teams")) : set({ ...(state.screen === "team" ? {} : goTo("team")), tmtab: key }))}>
          <span>{label}</span>
          {n ? <span className="tcnt"><span>{n}</span></span> : null}
        </button>
      ))}
    </div>
  );
}

/** Team & access: who is on the team, their roles, and what each role may do. */
export function TeamScreen() {
  const { me, state, set } = useConsole();
  const act = useAction();
  const org = me.organization;
  const tab: TabKey = state.tmtab === "roles" ? "roles" : state.tmtab === "invitations" ? "invitations" : "members";
  const [dialog, setDialog] = useState<null | "invite" | "review">(null);
  const members = useQuery({ queryKey: [org.id, "members"], queryFn: () => unwrap(api.GET("/api/v1/members")), staleTime: 30_000 });
  const roles = useQuery({ queryKey: [org.id, "roles"], queryFn: () => unwrap(api.GET("/api/v1/roles")), staleTime: 30_000 });
  const people = members.data ?? [];
  const roleList = roles.data?.roles ?? [];
  const labelOf = (key: string) => roleList.find((role) => role.key === key)?.label ?? key;
  const withPassword = () => {
    setDialog(null);
    set({ modal: "add", kind: "member", mstep: "manual", overlay: "none", dd: null, ddq: "", fv: {}, ferr: {} });
  };
  const change = (userId: string, patch: { role?: string; active?: boolean }, done: string) => void act(() => unwrap(api.PATCH("/api/v1/members/{user_id}", { params: { path: { user_id: userId } }, body: patch })), done);
  const owners = people.filter((member) => member.active && member.role === "owner").length;

  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px" }}>
        <div className="f1">
          <div className="crumb">
            <span>Administration</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b>{"Team & access"}</b>
          </div>
          <h1 className="h1">{"Team & access"}</h1>
          <p className="sub">{`${org.name}${members.data ? ` · ${plural(people.filter((member) => member.active).length, "member")}` : ""}${roles.data ? ` · ${plural(roleList.filter((r) => r.key !== "driver").length, "role")}` : ""} · the same permissions guard pages, the API, search and exports`}</p>
        </div>
        <div className="r g8">
          <button className="btn" onClick={() => setDialog("review")}>
            <Icon className="s14" d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
            Access review
          </button>
          <button className="btn pri" onClick={() => setDialog("invite")}>
            <Icon className="s14" d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6" />
            Invite member
          </button>
        </div>
      </div>
      <TeamTabs current={tab} />
      {tab === "members" ? (
        <div className="card oh c" style={{ flex: "1", minHeight: "0", margin: "16px 24px 24px" }}>
          <div className="thead" style={{ gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1.2fr) 220px 110px 140px" }}>
            {["Member", "Email", "Role", "Status", ""].map((h) => (
              <span key={h}><span>{h}</span></span>
            ))}
          </div>
          <div className="tbody">
            {members.isPending ? <Skeleton /> : null}
            {members.isError ? <ErrorState error={members.error} retry={() => void members.refetch()} /> : null}
            {members.data && !people.length ? <EmptyState icon="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" title="Only you so far" text="Add the people who work in this company. Each gets a role that decides what they can see and do." /> : null}
            {people.map((member) => {
              const self = member.user_id === me.user.id;
              const lastOwner = member.role === "owner" && owners <= 1;
              return (
                <div key={member.user_id} className={clsx("trow", !member.active && "dim")} style={{ gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1.2fr) 220px 110px 140px" }}>
                  <div className="td">
                    <div className="r g8 mw0">
                      <span className="av sm"><span>{initials(member.full_name)}</span></span>
                      <span className="ell w5">{member.full_name}{self ? <span className="fs12 mu">{" · you"}</span> : null}</span>
                    </div>
                  </div>
                  <div className="td"><span className="ell t2">{member.email}</span></div>
                  <div className="td">
                    <select className="inp" style={{ height: "30px" }} value={member.role} disabled={self || lastOwner || !member.active} aria-label={`Role of ${member.full_name}`} onChange={(event) => change(member.user_id, { role: event.target.value }, `${member.full_name} is now ${labelOf(event.target.value)}`)}>
                      {roleList.filter((role) => (role.assignable && role.key !== "owner_portal") || role.key === member.role).map((role) => (
                        <option key={role.key} value={role.key}>{role.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="td">
                    <span className="badge" data-k={member.active ? "ok" : "mu"}>
                      <i></i>
                      {member.active ? "Active" : "Removed"}
                    </span>
                  </div>
                  <div className="td rt">
                    {self || lastOwner ? null : member.active ? (
                      <button className="btn xs" onClick={() => change(member.user_id, { active: false }, `${member.full_name} no longer has access`)}>Remove access</button>
                    ) : (
                      <button className="btn xs" onClick={() => change(member.user_id, { active: true }, `${member.full_name} has access again`)}>Restore access</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="tfoot">
            <span>At least one owner is always kept. A role change applies from the person’s next request.</span>
          </div>
        </div>
      ) : tab === "roles" ? (
        <RolesPanel members={people} />
      ) : (
        <InvitationsPanel onInvite={() => setDialog("invite")} />
      )}
      {dialog === "invite" ? <InviteDialog onClose={() => setDialog(null)} onPassword={withPassword} /> : null}
      {dialog === "review" ? <AccessReviewDialog onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
