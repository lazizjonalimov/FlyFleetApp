"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { api, unwrap } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { plural } from "@/lib/format/text";

type Driver = { id: string; full_name: string; email: string | null; user_id?: string | null };
type Made = { name: string; link?: string; why?: string };

/** Invitations to the driver app: one link per driver, to send them. Drivers already on the app, or with no email
 * on file, are named rather than skipped silently. */
export function InviteDrivers({ drivers, onClose }: { drivers?: Driver[]; onClose: () => void }) {
  const { me, notify } = useConsole();
  const org = me.organization.id;
  const client = useQueryClient();
  const all = useQuery({ queryKey: [org, "drivers", "invite"], queryFn: () => unwrap(api.GET("/api/v1/drivers", { params: { query: { status: "active", sort: "name", limit: 100 } } })), enabled: !drivers });
  const pool = drivers ?? (all.data?.items ?? []).filter((d) => !d.user_id);
  const [chosen, setChosen] = useState<string[]>(drivers ? drivers.map((d) => d.id) : []);
  const [made, setMade] = useState<Made[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const send = async () => {
    const picked = pool.filter((d) => chosen.includes(d.id));
    if (!picked.length) return setProblem("Choose the drivers to invite");
    setPending(true);
    setProblem(null);
    const out: Made[] = [];
    for (const d of picked) {
      if (d.user_id) {
        out.push({ name: d.full_name, why: "already on the driver app" });
        continue;
      }
      if (!d.email) {
        out.push({ name: d.full_name, why: "no email on file — add one to their profile first" });
        continue;
      }
      try {
        const res = await unwrap(api.POST("/api/v1/invitations", { body: { email: d.email, full_name: d.full_name, role: "driver", driver_id: d.id } }));
        out.push({ name: d.full_name, link: `${window.location.origin}${res.path}` });
      } catch (e) {
        out.push({ name: d.full_name, why: e instanceof ApiError ? errorMessage(e) : "couldn’t be invited" });
      }
    }
    await client.invalidateQueries({ queryKey: [org, "invitations"] });
    setMade(out);
    setPending(false);
  };

  return (
    <Dialog
      title={made ? "Invitations to the driver app" : "Invite to the driver app"}
      sub={made ? "Send each driver their link. Each works once, for a week, and isn’t shown again." : "Each driver gets a link to set up their sign-in; messages, loads and alerts then reach them in the app"}
      icon={I.mobile}
      width={560}
      onClose={() => !pending && onClose()}
      footer={made ? <><span className="sp"></span><button className="btn pri" onClick={onClose}>Done</button></> : (
        <><span className="fs12 mu">{`${chosen.length} chosen`}</span><span className="sp"></span><button className="btn" onClick={onClose} disabled={pending}>Cancel</button><button className="btn pri" onClick={() => void send()} disabled={pending}>{pending ? "Creating…" : "Create invitations"}</button></>
      )}
    >
      <Problem message={problem} />
      {made ? (
        <div className="c g8">
          {made.map((m) => (
            <div key={m.name} className="c g4">
              <span className="fs13 w5">{m.name}</span>
              {m.link ? (
                <div className="r g8">
                  <input className="inp mono f1" readOnly value={m.link} aria-label={`Invitation link for ${m.name}`} onFocus={(e) => e.currentTarget.select()} />
                  <button className="btn sm" onClick={() => void navigator.clipboard?.writeText(m.link!).then(() => notify("Link copied"), () => notify("Select the link and copy it", true))}><Icon className="s14" d={I.copy} />Copy</button>
                </div>
              ) : <span className="fs12 mu">{`Not invited: ${m.why}`}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="c" style={{ maxHeight: "320px", overflow: "auto", border: "1px solid var(--bd)", borderRadius: "8px" }}>
          {pool.map((d) => {
            const on = chosen.includes(d.id);
            return (
              <button key={d.id} className="menui" role="checkbox" aria-checked={on} onClick={() => setChosen(on ? chosen.filter((x) => x !== d.id) : [...chosen, d.id])}>
                <span className={clsx("chk", on && "on")} aria-hidden="true">{on ? <Icon className="s12" d={I.check} /> : null}</span>
                <span className="f1">{d.full_name}</span>
                <span className="fs12 mu">{d.user_id ? "On the app" : d.email ?? "No email on file"}</span>
              </button>
            );
          })}
          {!pool.length ? <span className="fs12 mu" style={{ padding: "10px" }}>{all.isLoading ? "Loading…" : "Every active driver is on the driver app."}</span> : null}
        </div>
      )}
      {!made && pool.length ? <p className="fs12 mu">{`${plural(pool.filter((d) => !d.email && !d.user_id).length, "driver")} without an email can’t be invited until one is added.`}</p> : null}
    </Dialog>
  );
}
