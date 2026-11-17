"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Fragment, useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { formatDay } from "@/lib/format/dates";
import { initials, plural } from "@/lib/format/text";

type Matrix = Schema<"RoleMatrixOut">;
type Role = Schema<"RoleOut">;
type Member = Schema<"MemberOut">;
const LOCK = "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4";

/** What a permission is called in the grid: "Loads › Export". */
export function permissionLabel(matrix: Matrix | undefined, permission: string): string {
  for (const g of matrix?.matrix.groups ?? []) {
    for (const m of g.modules) {
      const action = Object.entries(m.cells).find(([, p]) => p === permission)?.[0];
      if (action) return `${m.label} › ${action}`;
    }
  }
  return permission;
}

/** Roles & permissions: each role's grid of modules and actions, edited and saved together, custom roles, one
 * person's exceptions (a denial wins) and the history of changes. */
export function RolesPanel({ members }: { members: Member[] }) {
  const { me, state, set, notify } = useConsole();
  const org = me.organization;
  const client = useQueryClient();
  const roles = useQuery({ queryKey: [org.id, "roles"], queryFn: () => unwrap(api.GET("/api/v1/roles")), staleTime: 30_000 });
  const [draft, setDraft] = useState<{ key: string; perms: string[] } | null>(null);
  const [dialog, setDialog] = useState<null | "create" | "review" | "exception">(null);
  const data = roles.data;
  const list = data?.roles.filter((r) => r.key !== "driver") ?? [];
  const selected = list.find((r) => r.key === state.trole) ?? list.find((r) => r.key === "dispatcher") ?? list[0];
  if (roles.isError) return <ErrorState error={roles.error} retry={() => void roles.refetch()} />;
  if (!data || !selected) return <Skeleton rows={10} />;

  const saved = new Set(selected.permissions);
  const current = new Set(draft?.key === selected.key ? draft.perms : selected.permissions);
  const granted = [...current].filter((p) => !saved.has(p));
  const revoked = [...saved].filter((p) => !current.has(p));
  const dirty = granted.length + revoked.length;
  const holders = members.filter((m) => m.active && m.role === selected.key);
  const editable = !selected.locked;
  const pick = (key: string) => {
    if (dirty && !window.confirm("Discard the unsaved changes to this role?")) return;
    setDraft(null);
    set({ trole: key });
  };
  const toggle = (perm: string) => {
    const next = new Set(current);
    if (next.has(perm)) next.delete(perm);
    else next.add(perm);
    setDraft({ key: selected.key, perms: [...next].sort() });
  };
  const apply = (out: Matrix, done: string) => {
    client.setQueryData([org.id, "roles"], out);
    void client.invalidateQueries({ queryKey: [org.id, "members"] });
    notify(done);
  };
  const reset = async () => {
    try {
      apply(await unwrap(api.POST("/api/v1/roles/{key}/reset", { params: { path: { key: selected.key } } })), `${selected.label} is back to the FlyFleet template`);
      setDraft(null);
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete the ${selected.label} role?`)) return;
    try {
      apply(await unwrap(api.DELETE("/api/v1/roles/{key}", { params: { path: { key: selected.key } } })), `${selected.label} deleted`);
      set({ trole: "dispatcher" });
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  const tag = selected.locked ? ["System", "mu"] : selected.custom ? ["Custom", "violet"] : ["From template", "brand"];
  const edited = selected.updated_at ? ` Edited ${formatDay(selected.updated_at, org.timezone)}${selected.updated_by_name ? ` by ${selected.updated_by_name}` : ""}.` : "";

  return (
    <div className="tmg">
      <nav className="rolelist" aria-label="Roles">
        {list.map((role) => (
          <button key={role.key} className={clsx("rolei", role.key === selected.key && "on")} onClick={() => pick(role.key)} aria-current={role.key === selected.key ? "true" : undefined}>
            <span className="f1 c">
              <span className="r g6">
                <span className="fs13 w5 tx ell">{role.label}</span>
                {role.locked ? <span className="tag" data-k="mu">System</span> : role.custom ? <span className="tag" data-k="violet">Custom</span> : null}
              </span>
              <span className="fs12 mu ell">{role.description}</span>
            </span>
            <span className="mono fs12 mu">{role.members}</span>
          </button>
        ))}
        <button className="addstop" style={{ height: "38px", marginTop: "6px" }} onClick={() => setDialog("create")}>
          <Icon className="s14 b" d="M12 5v14M5 12h14" />
          Create custom role
        </button>
      </nav>
      <section className="c" style={{ minHeight: "0", minWidth: "0" }}>
        <div className="r g12" style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--bd2)" }}>
          <div className="f1" style={{ minWidth: "0" }}>
            <div className="r g8">
              <span className="fs16 w6">{selected.label}</span>
              <span className="tag" data-k={tag[1]}>{tag[0]}</span>
              {selected.changed ? <span className="tag" data-k="mu">Changed for this company</span> : null}
              {dirty ? <span className="tag" data-k="warn">{plural(dirty, "unsaved change")}</span> : null}
            </div>
            <div className="fs12 mu" style={{ marginTop: "2px" }}>{`${selected.description}.${edited}`}</div>
          </div>
          <div className="r" style={{ marginRight: "4px" }}>
            {holders.slice(0, 5).map((m) => <span key={m.user_id} className="av sm stack" title={m.full_name}>{initials(m.full_name)}</span>)}
            {holders.length > 5 ? <span className="av sm stack">{`+${holders.length - 5}`}</span> : null}
          </div>
          {selected.changed ? <button className="btn sm ghost" onClick={() => void reset()}>Reset to template</button> : null}
          {selected.custom ? <button className="btn sm ghost" style={{ color: "#B42318" }} onClick={() => void remove()} disabled={selected.members > 0} title={selected.members ? "Give its members another role first" : undefined}>Delete</button> : null}
          <button className="btn sm" onClick={() => setDialog("create")}>Duplicate</button>
        </div>
        <div className="pmh" style={{ gridTemplateColumns: "minmax(0,1fr) repeat(7,60px)" }}>
          <span>Module</span>
          {data.matrix.actions.map((a) => <span key={a} className="rt" style={{ justifySelf: "center" }}>{a}</span>)}
        </div>
        <div style={{ flex: "1", minHeight: "0", overflow: "auto" }}>
          {data.matrix.groups.map((g) => (
            <Fragment key={g.name}>
              <div className="pmg">{g.name}</div>
              {g.modules.map((m) => {
                const changed = Object.values(m.cells).some((p) => p && (granted.includes(p) || revoked.includes(p)));
                return (
                  <div key={m.key} className={clsx("pmr", changed && "chg")} style={{ gridTemplateColumns: "minmax(0,1fr) repeat(7,60px)" }}>
                    <div className="r g8 mw0">
                      <span className="fs13 nw" style={{ flex: "none" }}>{m.label}</span>
                      {m.sensitive ? <span className="tag" data-k="warn"><Icon className="s12" d={LOCK} />Sensitive</span> : null}
                      {m.note ? <span className="fs11 mu ell">{m.note}</span> : null}
                    </div>
                    {data.matrix.actions.map((a) => {
                      const perm = m.cells[a];
                      if (!perm) return <span key={a} className="pm"><span className="fa">—</span></span>;
                      const on = current.has(perm);
                      const locked = !editable || m.locked || !data.grantable.includes(perm);
                      const cls = locked ? "lockd" : granted.includes(perm) ? "add" : revoked.includes(perm) ? "rem" : on ? "on" : "";
                      return (
                        <span key={a} className="pm">
                          <button
                            className={clsx("pmb", cls, locked && on && "on")}
                            aria-label={`${m.label} — ${a}`}
                            aria-pressed={on}
                            disabled={locked}
                            title={locked ? (m.locked ? "Only the owner and administrators manage the team" : "FlyFleet keeps this role as it is") : undefined}
                            onClick={() => toggle(perm)}
                          >
                            {on ? <Icon className="s12 b" d={I.check} /> : null}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
        {dirty ? (
          <div className="savebar">
            <span className="dot" data-k="warn"></span>
            <span className="fs13"><b>{plural(dirty, "unsaved change")}</b>{` to ${selected.label} · affects ${plural(selected.members, "member")}`}</span>
            <span className="sp"></span>
            <span className="fs12 mu">Saving applies on each person’s next request</span>
            <button className="btn" onClick={() => setDraft(null)}>Discard</button>
            <button className="btn pri" onClick={() => setDialog("review")}><Icon className="s14" d="M15 7a2 2 0 0 1 2 2M21 9a6 6 0 0 1-7.7 5.8L11 17H9v2H7v2H3v-3.6l6.2-6.2A6 6 0 1 1 21 9z" />{"Review & save"}</button>
          </div>
        ) : null}
      </section>
      <aside className="tmside">
        <section className="card oh">
          <div className="ch"><h2 className="h2">Pending changes</h2></div>
          <div className="cb c g8 fs12">
            {granted.map((p) => <div key={p} className="r g8 ast"><span className="tag" data-k="ok">+ grant</span><span className="t2"><b>{permissionLabel(data, p)}</b></span></div>)}
            {revoked.map((p) => <div key={p} className="r g8 ast"><span className="tag" data-k="bad">− revoke</span><span className="t2"><b>{permissionLabel(data, p)}</b></span></div>)}
            {!dirty ? <span className="mu">{editable ? "Tick or untick a box to change what this role may do." : "FlyFleet keeps this role as it is."}</span> : null}
          </div>
        </section>
        <section className="card oh">
          <div className="ch"><h2 className="h2">Member overrides</h2><span className="fs12 mu" style={{ marginLeft: "auto" }}>Deny wins</span></div>
          {data.overrides.map((o) => (
            <div key={o.id} className="wl">
              <span className="av sm">{initials(o.name)}</span>
              <div className="f1" style={{ minWidth: "0" }}>
                <div className="fs13 w5">{o.name}</div>
                <div className="fs12 mu ell">{o.label}{o.note ? ` · ${o.note}` : ""}</div>
              </div>
              <span className="tag" data-k={o.effect === "allow" ? "ok" : "bad"}>{o.effect === "allow" ? "Allow" : "Deny"}</span>
              <button className="btn ghost xs icon" aria-label={`Remove ${o.name}’s ${o.label} exception`} onClick={() => void unwrap(api.DELETE("/api/v1/permission-overrides/{override_id}", { params: { path: { override_id: o.id } } })).then((out) => apply(out, "Exception removed")).catch((e: unknown) => notify(errorMessage(e), true))}>
                <Icon className="s12" d={I.x} />
              </button>
            </div>
          ))}
          {!data.overrides.length ? <div className="cb fs12 mu">Nobody has an exception to their role.</div> : null}
          <div className="cb" style={{ paddingTop: "0" }}><button className="lnk" onClick={() => setDialog("exception")}>Add an exception</button></div>
        </section>
        <section className="card oh">
          <div className="ch"><h2 className="h2">Change history</h2><button className="lnk" style={{ marginLeft: "auto" }} onClick={() => set(goTo("audit"))}>Audit log</button></div>
          {data.history.map((h, i) => (
            <div key={i} className="wl" style={{ alignItems: "flex-start" }}>
              <div className="f1 fs12 t2"><b className="tx">{h.who}</b> {h.what}</div>
              <span className="fs11 mu num nw">{formatDay(h.at, org.timezone)}</span>
            </div>
          ))}
          {!data.history.length ? <div className="cb fs12 mu">No role changes yet: every role is as FlyFleet defines it.</div> : null}
        </section>
        <p className="note"><Icon className="s14" d={I.shield} />At least one active owner is always kept. Permission changes apply on each person’s next request.</p>
      </aside>
      {dialog === "review" ? (
        <ReviewDialog role={selected} granted={granted} revoked={revoked} label={(p) => permissionLabel(data, p)} onClose={() => setDialog(null)}
          onSave={async () => {
            const out = await unwrap(api.PUT("/api/v1/roles/{key}", { params: { path: { key: selected.key } }, body: { permissions: [...current].sort(), version: selected.version, name: null, description: null } }));
            setDraft(null);
            apply(out, `${selected.label} saved`);
          }} />
      ) : null}
      {dialog === "create" ? (
        <CreateRoleDialog roles={list.filter((r) => r.key !== "owner_portal")} from={selected.key === "owner_portal" ? "dispatcher" : selected.key} onClose={() => setDialog(null)}
          onCreate={async (name, description, from) => {
            const out = await unwrap(api.POST("/api/v1/roles", { body: { name, description: description || null, from_key: from } }));
            apply(out, `${name} created`);
            const made = out.roles.find((r) => r.label === name);
            if (made) set({ trole: made.key });
          }} />
      ) : null}
      {dialog === "exception" ? (
        <ExceptionDialog data={data} members={members.filter((m) => m.active && !["owner", "admin", "driver", "owner_portal", "customer"].includes(m.role))} onClose={() => setDialog(null)}
          onSave={async (body) => apply(await unwrap(api.POST("/api/v1/permission-overrides", { body })), "Exception saved")} />
      ) : null}
    </div>
  );
}

function ReviewDialog({ role, granted, revoked, label, onClose, onSave }: { role: Role; granted: string[]; revoked: string[]; label: (p: string) => string; onClose: () => void; onSave: () => Promise<void> }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const save = async () => {
    setPending(true);
    try {
      await onSave();
      onClose();
    } catch (e) {
      setProblem(errorMessage(e));
      setPending(false);
    }
  };
  return (
    <Dialog title={`Save ${role.label}`} sub={`${plural(role.members, "person", "people")} with this role get the change on their next request`} icon={I.shield} width={520} onClose={() => !pending && onClose()}
      footer={<><span className="sp"></span><button className="btn" onClick={onClose} disabled={pending}>Back</button><button className="btn pri" onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save role"}</button></>}>
      <Problem message={problem} />
      <div className="c g6 fs13">
        {granted.map((p) => <div key={p} className="r g8"><span className="tag" data-k="ok">+ grant</span><span>{label(p)}</span></div>)}
        {revoked.map((p) => <div key={p} className="r g8"><span className="tag" data-k="bad">− revoke</span><span>{label(p)}</span></div>)}
      </div>
    </Dialog>
  );
}

function CreateRoleDialog({ roles, from, onClose, onCreate }: { roles: Role[]; from: string; onClose: () => void; onCreate: (name: string, description: string, from: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState(from);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const save = async () => {
    if (!name.trim()) return setProblem("Name the role");
    setPending(true);
    try {
      await onCreate(name.trim(), description.trim(), source);
      onClose();
    } catch (e) {
      setProblem(errorMessage(e));
      setPending(false);
    }
  };
  return (
    <Dialog title="Create custom role" sub="It starts with another role’s permissions; change them afterwards" icon={I.users} onClose={() => !pending && onClose()}
      footer={<><span className="sp"></span><button className="btn" onClick={onClose} disabled={pending}>Cancel</button><button className="btn pri" onClick={() => void save()} disabled={pending}>{pending ? "Creating…" : "Create role"}</button></>}>
      <Problem message={problem} />
      <div className="fld"><label htmlFor="role-name">Name</label><input id="role-name" className="inp" maxLength={60} value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="What people with it do" autoFocus /></div>
      <div className="fld"><label htmlFor="role-desc">Description</label><input id="role-desc" className="inp" maxLength={200} value={description} onChange={(e) => setDescription(e.currentTarget.value)} placeholder="Optional" /></div>
      <div className="fld">
        <label htmlFor="role-from">Start from</label>
        <select id="role-from" className="inp" value={source} onChange={(e) => setSource(e.currentTarget.value)}>
          {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <span className="fs12 mu">Managing the team stays with the owner and administrators, whatever it starts from.</span>
      </div>
    </Dialog>
  );
}

function ExceptionDialog({ data, members, onClose, onSave }: { data: Matrix; members: Member[]; onClose: () => void; onSave: (body: { user_id: string; permission: string; effect: "allow" | "deny"; note: string | null }) => Promise<void> }) {
  const [who, setWho] = useState(members[0]?.user_id ?? "");
  const [perm, setPerm] = useState("");
  const [effect, setEffect] = useState<"allow" | "deny">("deny");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const options = data.matrix.groups.flatMap((g) => g.modules.flatMap((m) => Object.entries(m.cells).filter(([, p]) => p && data.grantable.includes(p)).map(([a, p]) => ({ p: p!, l: `${m.label} › ${a}`, g: g.name }))));
  const save = async () => {
    if (!who) return setProblem("Choose who");
    if (!perm) return setProblem("Choose the permission");
    setPending(true);
    try {
      await onSave({ user_id: who, permission: perm, effect, note: note.trim() || null });
      onClose();
    } catch (e) {
      setProblem(errorMessage(e));
      setPending(false);
    }
  };
  return (
    <Dialog title="Add an exception" sub="One person, one permission, whatever their role says. A denial always wins." icon={I.shield} onClose={() => !pending && onClose()}
      footer={<><span className="sp"></span><button className="btn" onClick={onClose} disabled={pending}>Cancel</button><button className="btn pri" onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save exception"}</button></>}>
      <Problem message={problem} />
      {!members.length ? <p className="fs12 mu">Only people whose role isn’t full access can have exceptions, and there is nobody like that on the team yet.</p> : null}
      <div className="fld"><label htmlFor="ex-who">Person</label>
        <select id="ex-who" className="inp" value={who} onChange={(e) => setWho(e.currentTarget.value)}>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select>
      </div>
      <div className="fld"><label htmlFor="ex-perm">Permission</label>
        <select id="ex-perm" className="inp" value={perm} onChange={(e) => setPerm(e.currentTarget.value)}>
          <option value="">Choose…</option>
          {[...new Set(options.map((o) => o.g))].map((g) => <optgroup key={g} label={g}>{options.filter((o) => o.g === g).map((o) => <option key={o.p} value={o.p}>{o.l}</option>)}</optgroup>)}
        </select>
      </div>
      <div className="fld"><span className="lbl"><span>Exception</span></span>
        <div className="seg sm" role="radiogroup" aria-label="Exception" style={{ alignSelf: "flex-start" }}>
          {(["allow", "deny"] as const).map((e) => <button key={e} role="radio" aria-checked={effect === e} className={clsx(effect === e && "on")} onClick={() => setEffect(e)}>{e === "allow" ? "Allow" : "Deny"}</button>)}
        </div>
      </div>
      <div className="fld"><label htmlFor="ex-note">Why</label><input id="ex-note" className="inp" maxLength={200} value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder="Optional, shown with the exception" /></div>
    </Dialog>
  );
}
