"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";

/** Who at a customer signs in to the shipment portal, and giving someone a sign-in. */
export function PortalAccessDialog({ customer, onClose }: { customer: { id: string; name: string }; onClose: () => void }) {
  const { me, can, notify } = useConsole();
  const client = useQueryClient();
  const id = useId();
  const key = [me.organization.id, "customers", customer.id, "portal-users"];
  const users = useQuery({ queryKey: key, queryFn: () => unwrap(api.GET("/api/v1/customers/{customer_id}/portal-users", { params: { path: { customer_id: customer.id } } })) });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const manage = can("customers.manage");

  const add = async () => {
    setPending(true);
    setProblem(null);
    try {
      const added = await unwrap(api.POST("/api/v1/customers/{customer_id}/portal-users", { params: { path: { customer_id: customer.id } }, body: { full_name: name.trim(), email: email.trim(), password: password || null } }));
      notify(added.existing_account ? `${added.full_name} can now see ${customer.name}’s shipments with their own sign-in` : `${added.full_name} can sign in to the shipment portal with the temporary password`);
      setName("");
      setEmail("");
      setPassword("");
      await client.invalidateQueries({ queryKey: key });
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  const remove = async (userId: string, who: string) => {
    try {
      await unwrap(api.DELETE("/api/v1/customers/{customer_id}/portal-users/{user_id}", { params: { path: { customer_id: customer.id, user_id: userId } } }));
      notify(`${who} can no longer sign in to the shipment portal`);
      await client.invalidateQueries({ queryKey: key });
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };

  return (
    <Dialog title={`Shipment portal · ${customer.name}`} sub="People at the customer who see its shipments, papers and invoices. Rates, pay and drivers are never shown." icon={I.users} width={560} onClose={onClose}
      footer={<><span className="sp"></span><button className="btn" onClick={onClose} disabled={pending}>Done</button>{manage ? <button className="btn pri" onClick={() => void add()} disabled={pending || !name.trim() || !email.trim()}>{pending ? "Adding…" : "Give access"}</button> : null}</>}>
      <Problem message={problem} />
      <div className="c g6">
        {users.data && !users.data.length ? <p className="fs13 mu">Nobody at {customer.name} signs in yet. Until someone does, messages to them go only by email, which isn’t connected.</p> : null}
        {users.data?.map((u) => (
          <div key={u.user_id} className="r g8 fs13">
            <span className="av sm">{u.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
            <span className="f1 c"><span className="w5">{u.full_name}</span><span className="fs12 mu">{`${u.email} · ${u.signed_in ? "has signed in" : "hasn’t signed in yet"}`}</span></span>
            {manage ? <button className="btn xs" onClick={() => void remove(u.user_id, u.full_name)}>Remove</button> : null}
          </div>
        ))}
      </div>
      {manage ? (
        <>
          <div className="hr"></div>
          <div className="r g12">
            <div className="fld f1"><label htmlFor={`${id}-n`}>Name</label><input id={`${id}-n`} className="inp" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="fld f1"><label htmlFor={`${id}-e`}>Work email</label><input id={`${id}-e`} className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          <div className="fld">
            <label htmlFor={`${id}-p`}>Temporary password</label>
            <input id={`${id}-p`} className="inp" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="fs12 mu">For a new sign-in, at least 10 characters; tell it to them yourself. Someone who already signs in to FlyFleet keeps their own password.</span>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
