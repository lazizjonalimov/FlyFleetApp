"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { usePreview } from "@/lib/auth/session";
import { formatDay } from "@/lib/format/dates";
import { initials, plural } from "@/lib/format/text";
import { TeamTabs } from "./team-screen";

type Overview = Schema<"TeamsOverview">;
type Team = Schema<"TeamOut">;
const KEY = (org: string) => [org, "dispatch-teams"];

/** Team & access › Dispatch teams: which trucks each group of dispatchers works. A team's dispatchers see those
 * trucks and everything tied to them, and nothing else of the fleet. */
export function DispatchTeamsScreen() {
  const { me, set, notify } = useConsole();
  const org = me.organization;
  const client = useQueryClient();
  const preview = usePreview();
  const teams = useQuery({ queryKey: KEY(org.id), queryFn: () => unwrap(api.GET("/api/v1/dispatch-teams")) });
  const members = useQuery({ queryKey: [org.id, "members"], queryFn: () => unwrap(api.GET("/api/v1/members")), staleTime: 30_000 });
  const [picked, setPicked] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "new" | "edit" | "dispatchers" | "trucks">(null);
  const data = teams.data;
  const team = data?.teams.find((t) => t.id === picked) ?? data?.teams[0] ?? null;

  // Every change answers with the whole picture, so the screen takes it as it comes.
  const apply = async (run: () => Promise<Overview>, done: string) => {
    const out = await run();
    client.setQueryData(KEY(org.id), out);
    void client.invalidateQueries({ queryKey: [org.id], predicate: (q) => q.queryKey[1] !== "dispatch-teams" });
    notify(done);
    return out;
  };
  const change = (run: () => Promise<Overview>, done: string) => void apply(run, done).catch((e: unknown) => notify(errorMessage(e), true));
  const startPreview = async (t: Team) => {
    try {
      await preview.start(t.id);
      set(goTo("dispatch"));
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  const lead = team?.dispatchers.find((d) => d.lead) ?? team?.dispatchers[0] ?? null;
  const active = (members.data ?? []).filter((m) => m.active).length;

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
          <p className="sub">{`${org.name}${members.data ? ` · ${plural(active, "member")}` : ""} · dispatch teams limit a dispatcher to a set of trucks and everything tied to them`}</p>
        </div>
        <div className="r g8">
          {team ? (
            <button className="btn" onClick={() => void startPreview(team)} title={`See the console as ${team.name}’s dispatchers do`}>
              <Icon className="s14" d={I.eye} />
              {lead ? `Preview as ${lead.name}` : `Preview ${team.name}`}
            </button>
          ) : null}
          <button className="btn pri" onClick={() => setDialog("new")}>
            <Icon className="s14 b" d="M12 5v14M5 12h14" />
            New dispatch team
          </button>
        </div>
      </div>
      <TeamTabs current="teams" />
      {teams.isError ? <ErrorState error={teams.error} retry={() => void teams.refetch()} /> : !data ? <Skeleton rows={8} /> : (
        <div className="dtg">
          <nav className="rolelist" aria-label="Dispatch teams">
            {data.teams.map((t) => (
              <button key={t.id} className={clsx("rolei", t.id === team?.id && "on")} aria-current={t.id === team?.id ? "true" : undefined} onClick={() => setPicked(t.id)}>
                <span className="tmk" style={{ background: t.color }}>{initials(t.name).slice(0, 1)}</span>
                <span className="f1 c">
                  <span className="fs13 w5 tx ell">{t.name}</span>
                  <span className="fs12 mu ell">{`${plural(t.dispatchers.length, "dispatcher")} · ${plural(t.vehicles.length, "truck")}`}</span>
                </span>
              </button>
            ))}
            <div className="dtdef" style={{ marginTop: "6px" }}>
              <span className="tmk def"><Icon className="s14" d={I.globe} /></span>
              <span className="f1 c g2">
                <span className="fs13 w5 tx">No team · default</span>
                <span className="fs12 mu">
                  {`${plural(data.no_team.dispatchers.length, "dispatcher")}${data.no_team.dispatchers.length ? ` · ${data.no_team.dispatchers.map((d) => d.name).join(", ")}` : ""}. `}
                  {data.dispatchers_without_team === "all" ? `Sees all ${plural(data.total_vehicles, "truck")} and every load.` : "Sees no trucks until put on a team."}
                </span>
              </span>
            </div>
            <button className="addstop" style={{ height: "38px", marginTop: "6px" }} onClick={() => setDialog("new")}>
              <Icon className="s14 b" d="M12 5v14M5 12h14" />
              New dispatch team
            </button>
          </nav>
          <section className="dtmain">
            {team ? <TeamDetail team={team} data={data} openDialog={setDialog} /> : (
              <div className="c g8" style={{ margin: "auto", textAlign: "center", maxWidth: "420px", alignItems: "center" }}>
                <span className="forbic"><Icon className="s20" d={I.truck} /></span>
                <span className="fs14 w6">No dispatch teams yet</span>
                <p className="fs12 mu">Every dispatcher sees the whole fleet. A team limits its dispatchers to a set of trucks and the loads, drivers and alerts on them.</p>
                <button className="btn pri sm" onClick={() => setDialog("new")}><Icon className="s14 b" d="M12 5v14M5 12h14" />New dispatch team</button>
              </div>
            )}
          </section>
          <aside className="tmside">
            <Coverage data={data} />
            {team ? (
              <section className="card oh">
                <div className="ch"><h2 className="h2">Unassigned loads</h2></div>
                <div className="cb c g8" role="radiogroup" aria-label={`Unassigned loads ${team.name} sees`}>
                  {([["tagged", "Only loads tagged for the team", "Booked by its dispatchers, or last on one of its trucks"], ["shared", "The shared queue", "They see every unassigned load, but can assign it only to team trucks"]] as const).map(([value, title, sub]) => (
                    <label key={value} className={clsx("opt", team.unassigned_loads === value && "on")}>
                      <input type="radio" className="cbx" name="dt-un" checked={team.unassigned_loads === value}
                        onChange={() => change(() => unwrap(api.PATCH("/api/v1/dispatch-teams/{team_id}", { params: { path: { team_id: team.id } }, body: { unassigned_loads: value, version: team.version, clear_lead: false } })), `${team.name} sees ${value === "shared" ? "the shared queue" : "loads tagged for it"}`)} />
                      <span className="c"><span className="fs13 w5">{title}</span><span className="fs12 mu">{sub}</span></span>
                    </label>
                  ))}
                </div>
              </section>
            ) : null}
            <section className="card oh">
              <div className="ch"><h2 className="h2">New dispatchers</h2></div>
              <div className="cb c g8">
                <div className="seg" role="group" aria-label="New dispatchers start with" style={{ alignSelf: "flex-start" }}>
                  {([["all", "See all trucks"], ["none", "See no trucks"]] as const).map(([value, label]) => (
                    <button key={value} className={clsx(data.dispatchers_without_team === value && "on")} aria-pressed={data.dispatchers_without_team === value}
                      onClick={() => data.dispatchers_without_team !== value && change(() => unwrap(api.PUT("/api/v1/dispatch-teams-default", { body: { dispatchers_without_team: value } })), value === "all" ? "Dispatchers on no team see every truck" : "Dispatchers on no team see no trucks")}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="fs12 mu">See all trucks is the default: a dispatcher who isn’t on a team sees every load and every truck until you add them to one.</p>
              </div>
            </section>
            <section className="card oh">
              <div className="ch"><h2 className="h2">Changes</h2><button className="lnk" style={{ marginLeft: "auto" }} onClick={() => set(goTo("audit"))}>Audit log</button></div>
              {data.changes.length ? data.changes.slice(0, 6).map((c, i) => (
                <div key={i} className="wl" style={{ alignItems: "flex-start" }}>
                  <div className="f1 fs12 t2"><b className="tx">{c.who}</b> {c.what}</div>
                  <span className="fs11 mu num nw">{formatDay(c.at, org.timezone)}</span>
                </div>
              )) : <div className="cb fs12 mu">Nothing changed yet.</div>}
            </section>
          </aside>
        </div>
      )}
      {dialog === "new" || (dialog === "edit" && team) ? (
        <TeamDialog team={dialog === "edit" ? team : null} colors={data?.colors ?? []} onClose={() => setDialog(null)}
          onSave={async (body, remove) => {
            if (remove && team) {
              await apply(() => unwrap(api.DELETE("/api/v1/dispatch-teams/{team_id}", { params: { path: { team_id: team.id } } })), `${team.name} deleted`);
              setPicked(null);
              return;
            }
            if (dialog === "edit" && team) {
              await apply(() => unwrap(api.PATCH("/api/v1/dispatch-teams/{team_id}", { params: { path: { team_id: team.id } }, body: { ...body, clear_lead: body.clear_lead ?? false, version: team.version } })), "Team saved");
            } else {
              const out = await apply(() => unwrap(api.POST("/api/v1/dispatch-teams", { body: { name: body.name, color: body.color, unassigned_loads: "tagged", user_ids: [], vehicle_ids: [] } })), `${body.name} created`);
              setPicked(out.teams.find((t) => t.name === body.name)?.id ?? null);
            }
          }} />
      ) : null}
      {dialog === "dispatchers" && team && data ? (
        <PickDialog
          title={`Dispatchers in ${team.name}`}
          sub="A dispatcher is on one team at a time: choosing someone on another team moves them here"
          icon={I.users}
          options={data.dispatchers.map((d) => ({ id: d.id, label: d.name, sub: d.team_id && d.team_id !== team.id ? `In ${data.teams.find((t) => t.id === d.team_id)?.name ?? "another team"}` : d.team_id ? "" : "No team" }))}
          chosen={team.dispatchers.map((d) => d.id)}
          empty="No one on the team has the dispatcher role yet. Add one in Members."
          onClose={() => setDialog(null)}
          onSave={(ids) => apply(() => unwrap(api.PUT("/api/v1/dispatch-teams/{team_id}/members", { params: { path: { team_id: team.id } }, body: { user_ids: ids, lead_user_id: null } })), `${team.name}’s dispatchers saved`)}
        />
      ) : null}
      {dialog === "trucks" && team && data ? (
        <PickDialog
          title={`Trucks in ${team.name}`}
          sub="A truck is in one team at a time: choosing one in another team moves it here. Loads, drivers and alerts follow the truck."
          icon={I.truck}
          options={data.trucks.map((t) => ({ id: t.id, label: t.unit_number, sub: [t.driver_name ?? "No driver yet", t.team_id && t.team_id !== team.id ? `in ${data.teams.find((x) => x.id === t.team_id)?.name ?? "another team"}` : ""].filter(Boolean).join(" · "), mono: true }))}
          chosen={team.vehicles.map((v) => v.id)}
          empty="There are no trucks in the fleet yet."
          onClose={() => setDialog(null)}
          onSave={(ids) => apply(() => unwrap(api.PUT("/api/v1/dispatch-teams/{team_id}/vehicles", { params: { path: { team_id: team.id } }, body: { vehicle_ids: ids } })), `${team.name}’s trucks saved`)}
        />
      ) : null}
    </div>
  );
}

function TeamDetail({ team, data, openDialog }: { team: Team; data: Overview; openDialog: (d: "edit" | "dispatchers" | "trucks") => void }) {
  const { me, set } = useConsole();
  const lead = team.dispatchers.find((d) => d.lead);
  const others = data.total_vehicles - team.vehicles.length;
  const sub = [lead ? `Lead ${lead.name}` : "No lead", `created ${formatDay(team.created_at, me.organization.timezone)}${team.created_by_name ? ` by ${team.created_by_name}` : ""}`, `${plural(team.open_loads, "open load")} on these trucks`].join(" · ");
  const can = [
    `Loads on these ${plural(team.vehicles.length, "truck")}, plus ${team.unassigned_loads === "shared" ? "every unassigned load" : `unassigned loads tagged for ${team.name}`}`,
    "The drivers on these trucks: profiles, documents and messages",
    "Live positions, alerts and trip history for these trucks",
    "Booking and assigning loads, but only to these trucks",
  ];
  const cant = [
    `The other ${plural(others, "truck")} and their loads, drivers and alerts`,
    "Those trucks in search, the map, exports and notifications",
    "Answers from Ask FlyFleet about trucks outside the team",
  ];
  return (
    <>
      <div className="r g12">
        <span className="tmk" style={{ width: "36px", height: "36px", borderRadius: "9px", fontSize: "15px", background: team.color }}>{initials(team.name).slice(0, 1)}</span>
        <div className="f1">
          <div className="r g8"><span className="fs16 w6">{team.name}</span><span className="tag" data-k="brand">{`Scoped to ${plural(team.vehicles.length, "truck")}`}</span></div>
          <div className="fs12 mu" style={{ marginTop: "2px" }}>{sub}</div>
        </div>
        <button className="btn sm" onClick={() => openDialog("edit")}>Edit team</button>
      </div>
      <div className="c g8">
        <div className="r g8"><span className="h3">Dispatchers</span><span className="cnt" data-k="mu">{team.dispatchers.length}</span><span className="sp"></span><span className="fs12 mu">A dispatcher belongs to one team at a time</span></div>
        <div className="r g6 wrap">
          {team.dispatchers.map((d) => (
            <span key={d.id} className="dpill"><span className="av sm me">{initials(d.name)}</span>{d.name}{d.lead ? <span className="tag" data-k="brand">Lead</span> : null}</span>
          ))}
          <button className="dpill add" onClick={() => openDialog("dispatchers")}><Icon className="s12 b" d="M12 5v14M5 12h14" />Add dispatcher</button>
        </div>
      </div>
      <div className="c g8">
        <div className="r g8"><span className="h3">Trucks</span><span className="cnt" data-k="brand">{`${team.vehicles.length} of ${data.total_vehicles}`}</span><span className="sp"></span><span className="fs12 mu">Loads, drivers and alerts follow the truck</span></div>
        <div className="tchips">
          {team.vehicles.map((t) => (
            <button key={t.id} className="tchip" onClick={() => set({ screen: "truck", unitId: t.id, unitKind: "truck" })}>
              <span className="mono fs12 w6 tx">{t.unit_number}</span>
              <span className={clsx("fs12 ell", t.driver_name ? "t3" : "mu")}>{t.driver_name ?? "No driver yet"}</span>
            </button>
          ))}
          <button className="tchip add" onClick={() => openDialog("trucks")}><Icon className="s12 b" d="M12 5v14M5 12h14" />Add trucks</button>
        </div>
      </div>
      <div className="rulec">
        <section className="card" style={{ padding: "12px 14px", boxShadow: "none" }}>
          <div className="h3" style={{ marginBottom: "4px" }}>{`${team.name} can see and work with`}</div>
          {can.map((x) => <div key={x} className="rule yes"><Icon className="s14 b" d="M5 12l5 5 9-10" /><span>{x}</span></div>)}
        </section>
        <section className="card" style={{ padding: "12px 14px", boxShadow: "none" }}>
          <div className="h3" style={{ marginBottom: "4px" }}>{`Hidden from ${team.name}`}</div>
          {cant.map((x) => <div key={x} className="rule no"><Icon className="s14 b" d="M18 6L6 18M6 6l12 12" /><span>{x}</span></div>)}
        </section>
      </div>
      <p className="note"><Icon className="s14" d={I.shield} /><span>The server applies the same scope to pages, search, the map, exports, live updates and notifications. Role permissions still apply on top — a team never adds access the role doesn’t have.</span></p>
    </>
  );
}

function Coverage({ data }: { data: Overview }) {
  const parts = [
    ...data.teams.map((t, i) => ({ l: t.name, n: t.vehicles.length, color: t.color, k: ["brand", "teal", "violet", "late", "ok", "bad", "mu"][i % 7]! })),
    { l: "No team", n: data.no_team.vehicles, color: "", k: "off" },
  ];
  const total = Math.max(1, data.total_vehicles);
  return (
    <section className="card oh">
      <div className="ch"><h2 className="h2">Truck coverage</h2><span className="sp"></span><span className="fs12 mu">{plural(data.total_vehicles, "truck")}</span></div>
      <div className="cb c g10">
        <div className="segbar" style={{ height: "10px", borderRadius: "5px" }}>
          {parts.filter((sg) => sg.n > 0).map((sg) => <span key={sg.l} data-k={sg.k} style={{ width: `${((sg.n / total) * 100).toFixed(2)}%`, ...(sg.color ? { background: sg.color } : {}) }}></span>)}
        </div>
        <div className="c g6">
          {parts.map((sg) => (
            <div key={sg.l} className="r g8 fs12 t2">
              <span className="qd" data-k={sg.k} style={{ width: "8px", height: "8px", ...(sg.color ? { background: sg.color } : {}) }}></span>
              <span className="f1">{sg.l}</span>
              <span className="mono w6 tx">{sg.n}</span>
            </div>
          ))}
        </div>
        <p className="fs12 mu">Trucks with no team are seen by dispatchers without a team and by every other role.</p>
      </div>
    </section>
  );
}

function TeamDialog({ team, colors, onClose, onSave }: { team: Team | null; colors: string[]; onClose: () => void; onSave: (body: { name: string; color: string; lead_user_id?: string | null; clear_lead?: boolean }, remove?: boolean) => Promise<void> }) {
  const [name, setName] = useState(team?.name ?? "");
  const [color, setColor] = useState(team?.color ?? colors[0] ?? "#1F4FE0");
  const [lead, setLead] = useState(team?.lead_user_id ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = async (remove = false) => {
    if (!remove && !name.trim()) return setProblem("Name the team");
    setPending(true);
    setProblem(null);
    try {
      await onSave(team ? { name: name.trim(), color, ...(lead ? { lead_user_id: lead } : { clear_lead: !!team.lead_user_id }) } : { name: name.trim(), color }, remove);
      onClose();
    } catch (e) {
      setProblem(errorMessage(e));
      setPending(false);
    }
  };
  return (
    <Dialog
      title={team ? `Edit ${team.name}` : "New dispatch team"}
      sub={team ? "Its name, color and lead" : "Name it, then add its dispatchers and trucks"}
      icon={I.truck}
      onClose={() => !pending && onClose()}
      footer={
        <>
          {team ? (
            confirmDelete ? (
              <button className="btn bad" onClick={() => void save(true)} disabled={pending}>Delete {team.name}</button>
            ) : (
              <button className="btn ghost" style={{ color: "#B42318" }} onClick={() => setConfirmDelete(true)} disabled={pending}>Delete team…</button>
            )
          ) : null}
          <span className="sp"></span>
          <button className="btn" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn pri" onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : team ? "Save" : "Create team"}</button>
        </>
      }
    >
      <Problem message={problem} />
      {confirmDelete && team ? <div className="banner" data-k="warn"><span className="f1 fs12">{`Its ${plural(team.dispatchers.length, "dispatcher")} and ${plural(team.vehicles.length, "truck")} will have no team, and loads tagged for it won’t be.`}</span></div> : null}
      <div className="fld">
        <label htmlFor="team-name">Name</label>
        <input id="team-name" className="inp" maxLength={60} value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="Team name" autoFocus />
      </div>
      <div className="fld">
        <span className="lbl"><span>Color</span></span>
        <div className="r g6" role="radiogroup" aria-label="Color">
          {colors.map((c) => (
            <button key={c} role="radio" aria-checked={c === color} aria-label={c} className="tmk" style={{ background: c, outline: c === color ? "2px solid var(--pri)" : "none", outlineOffset: "2px", border: "none", cursor: "pointer" }} onClick={() => setColor(c)}>
              {c === color ? <Icon className="s14 b" d="M5 12l5 5 9-10" /> : null}
            </button>
          ))}
        </div>
      </div>
      {team ? (
        <div className="fld">
          <label htmlFor="team-lead">Lead</label>
          <select id="team-lead" className="inp" value={lead} onChange={(e) => setLead(e.currentTarget.value)}>
            <option value="">No lead</option>
            {team.dispatchers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {!team.dispatchers.length ? <span className="fs12 mu">Add dispatchers to the team to choose a lead.</span> : null}
        </div>
      ) : null}
    </Dialog>
  );
}

function PickDialog({ title, sub, icon, options, chosen, empty, onClose, onSave }: {
  title: string; sub: string; icon: string; options: { id: string; label: string; sub: string; mono?: boolean }[]; chosen: string[]; empty: string;
  onClose: () => void; onSave: (ids: string[]) => Promise<unknown>;
}) {
  const [ids, setIds] = useState<string[]>(chosen);
  const [q, setQ] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const shown = options.filter((o) => !q.trim() || `${o.label} ${o.sub}`.toLowerCase().includes(q.trim().toLowerCase()));
  const save = async () => {
    setPending(true);
    setProblem(null);
    try {
      await onSave(ids);
      onClose();
    } catch (e) {
      setProblem(errorMessage(e));
      setPending(false);
    }
  };
  return (
    <Dialog
      title={title}
      sub={sub}
      icon={icon}
      width={520}
      onClose={() => !pending && onClose()}
      footer={
        <>
          <span className="fs12 mu">{`${ids.length} chosen`}</span>
          <span className="sp"></span>
          <button className="btn" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn pri" onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </>
      }
    >
      <Problem message={problem} />
      {options.length > 8 ? (
        <label className="search" style={{ width: "100%" }}>
          <Icon className="s14" d={I.search} />
          <input placeholder="Search" aria-label="Search" value={q} onChange={(e) => setQ(e.currentTarget.value)} />
        </label>
      ) : null}
      <div className="c" style={{ maxHeight: "320px", overflow: "auto", border: "1px solid var(--bd)", borderRadius: "8px" }}>
        {shown.map((o) => {
          const on = ids.includes(o.id);
          return (
            <button key={o.id} className="menui" role="checkbox" aria-checked={on} onClick={() => setIds(on ? ids.filter((x) => x !== o.id) : [...ids, o.id])}>
              <span className={clsx("chk", on && "on")} aria-hidden="true">{on ? <Icon className="s12" d={I.check} /> : null}</span>
              <span className={clsx("f1", o.mono && "mono")}>{o.label}</span>
              <span className="fs12 mu">{o.sub}</span>
            </button>
          );
        })}
        {!options.length ? <span className="fs12 mu" style={{ padding: "10px" }}>{empty}</span> : null}
      </div>
    </Dialog>
  );
}
