"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Fragment } from "react";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format/dates";
import { initials, plural } from "@/lib/format/text";

type Role = Schema<"Role">;

/** The Members / Roles / Dispatch teams tabs shared by Team & access and Dispatch teams. */
export function TeamTabs({ current }: { current: "members" | "roles" | "teams" }) {
  const { me, set, state } = useConsole();
  const org = me.organization.id;
  const members = useQuery({ queryKey: [org, "members"], queryFn: () => unwrap(api.GET("/api/v1/members")), staleTime: 30_000 });
  const roles = useQuery({ queryKey: [org, "roles"], queryFn: () => unwrap(api.GET("/api/v1/roles")), staleTime: 300_000 });
  const tabs: [key: "members" | "roles" | "teams", label: string, n: string][] = [
    ["members", "Members", members.data ? String(members.data.filter((member) => member.active).length) : ""],
    ["roles", "Roles & permissions", roles.data ? String(roles.data.roles.length) : ""],
    ["teams", "Dispatch teams", "0"],
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
  const tab = state.tmtab === "roles" ? "roles" : "members";
  const members = useQuery({ queryKey: [org.id, "members"], queryFn: () => unwrap(api.GET("/api/v1/members")), staleTime: 30_000 });
  const roles = useQuery({ queryKey: [org.id, "roles"], queryFn: () => unwrap(api.GET("/api/v1/roles")), staleTime: 300_000 });
  const history = useQuery({ queryKey: [org.id, "audit", "members"], queryFn: () => unwrap(api.GET("/api/v1/audit-logs", { params: { query: { entity_type: "user", limit: 6 } } })), staleTime: 60_000 });
  const people = members.data ?? [];
  const roleList = roles.data?.roles ?? [];
  const selected = roleList.find((role) => role.key === state.trole) ?? roleList.find((role) => role.key === "dispatcher") ?? roleList[0];
  const holders = people.filter((member) => member.active && member.role === selected?.key);
  const labelOf = (key: string) => roleList.find((role) => role.key === key)?.label ?? key;
  const invite = () => set({ modal: "add", kind: "member", mstep: "manual", overlay: "none", dd: null, ddq: "", fv: {}, ferr: {} });
  const change = (userId: string, patch: { role?: Role; active?: boolean }, done: string) => void act(() => unwrap(api.PATCH("/api/v1/members/{user_id}", { params: { path: { user_id: userId } }, body: patch })), done);
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
          <p className="sub">{`${org.name}${members.data ? ` · ${plural(people.filter((member) => member.active).length, "member")}` : ""}${roles.data ? ` · ${plural(roleList.length, "role")}` : ""} · the same permissions guard pages, the API, search and exports`}</p>
        </div>
        <div className="r g8">
          <button className="btn" onClick={() => set(goTo("audit"))}>
            <Icon className="s14" d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
            Access review
          </button>
          <button className="btn pri" onClick={invite}>
            <Icon className="s14" d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6" />
            Add member
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
                    <select className="inp" style={{ height: "30px" }} value={member.role} disabled={self || lastOwner || !member.active} aria-label={`Role of ${member.full_name}`} onChange={(event) => change(member.user_id, { role: event.target.value as Role }, `${member.full_name} is now ${labelOf(event.target.value)}`)}>
                      {roleList.filter((role) => role.assignable || role.key === member.role).map((role) => (
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
      ) : (
        <div className="tmg">
          <nav className="rolelist" aria-label="Roles">
            {roleList.map((role) => (
              <button key={role.key} className={clsx("rolei", role.key === selected?.key && "on")} onClick={() => set({ trole: role.key })}>
                <span className="f1 c">
                  <span className="r g6">
                    <span className="fs13 w5 tx ell"><span>{role.label}</span></span>
                    <span className="tag" data-k="mu">System</span>
                  </span>
                  <span className="fs12 mu ell"><span>{role.description}</span></span>
                </span>
                <span className="mono fs12 mu"><span>{people.filter((member) => member.active && member.role === role.key).length}</span></span>
              </button>
            ))}
          </nav>
          <section className="c" style={{ minHeight: "0", minWidth: "0" }}>
            {selected ? (
              <>
                <div className="r g12" style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--bd2)" }}>
                  <div className="f1">
                    <div className="r g8">
                      <span className="fs16 w6">{selected.label}</span>
                      <span className="tag" data-k="brand">Built in</span>
                    </div>
                    <div className="fs12 mu" style={{ marginTop: "2px" }}>{`${selected.description}. ${plural(selected.permissions.length, "permission")}.`}</div>
                  </div>
                  <div className="r" style={{ marginRight: "4px" }}>
                    {holders.slice(0, 6).map((member) => (
                      <span key={member.user_id} className="av sm stack" title={member.full_name}><span>{initials(member.full_name)}</span></span>
                    ))}
                  </div>
                </div>
                <div className="pmh" style={{ gridTemplateColumns: "minmax(0,1fr) 96px" }}>
                  <span>Permission</span>
                  <span className="rt" style={{ justifySelf: "center" }}>Allowed</span>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflow: "auto" }}>
                  {(roles.data?.groups ?? []).map((group) => (
                    <Fragment key={group.name}>
                      <div className="pmg"><span>{group.name}</span></div>
                      {group.permissions.map((permission) => {
                        const on = selected.permissions.includes(permission.key);
                        return (
                          <div key={permission.key} className="pmr" style={{ gridTemplateColumns: "minmax(0,1fr) 96px" }}>
                            <div className="r g8 mw0">
                              <span className="fs13 ell"><span>{permission.label}</span></span>
                              <span className="fs11 mu ell mono">{permission.key}</span>
                              {permission.key.includes("sensitive") ? (
                                <span className="tag" data-k="warn">
                                  <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
                                  Sensitive
                                </span>
                              ) : null}
                            </div>
                            <span className="pm">
                              <span className={clsx("pmb lockd", on && "on")} aria-label={`${permission.label}: ${on ? "allowed" : "not allowed"}`}>
                                {on ? <Icon className="s12 b" d="M5 12l5 5 9-10" /> : null}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </>
            ) : roles.isPending ? (
              <Skeleton />
            ) : null}
          </section>
          <aside className="tmside">
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Members with this role</h2>
              </div>
              {holders.length ? (
                holders.map((member) => (
                  <div key={member.user_id} className="wl">
                    <span className="av sm"><span>{initials(member.full_name)}</span></span>
                    <div className="f1">
                      <div className="fs13 w5"><span>{member.full_name}</span></div>
                      <div className="fs12 mu"><span>{member.email}</span></div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="cb fs12 mu">Nobody has this role.</div>
              )}
            </section>
            <section className="card oh">
              <div className="ch">
                <h2 className="h2">Change history</h2>
                <button className="lnk" style={{ marginLeft: "auto" }} onClick={() => set(goTo("audit"))}>Audit log</button>
              </div>
              {(history.data?.items ?? []).map((hh) => (
                <div key={hh.id} className="wl" style={{ alignItems: "flex-start" }}>
                  <div className="f1 fs12 t2">
                    <b className="tx"><span>{hh.actor_name ?? "System"}</span></b>
                    {" "}<span className="mono">{hh.action}</span>
                  </div>
                  <span className="fs11 mu num nw"><span>{formatDateTime(hh.created_at, org.timezone)}</span></span>
                </div>
              ))}
              {history.data && !history.data.items.length ? <div className="cb fs12 mu">No role changes recorded.</div> : null}
            </section>
            <p className="note">
              <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
              Roles are built in. Change what someone can do by changing their role under Members.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
