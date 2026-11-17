"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { combo } from "@/components/forms/combo";
import { Combobox } from "@/components/forms/combobox";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";

type Kind = "driver" | "customer" | "team";

/** Who to write to: a driver (their one conversation), a customer or one of their contacts, or teammates. */
export function NewConversation({ onClose, onOpen, driverId }: { onClose: () => void; onOpen: (id: string) => void; driverId?: string }) {
  const { me, can } = useConsole();
  const org = me.organization.id;
  const client = useQueryClient();
  const [kind, setKind] = useState<Kind>("driver");
  const [driver, setDriver] = useState(driverId ?? "");
  const [customer, setCustomer] = useState("");
  const [contact, setContact] = useState("");
  const [title, setTitle] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const state = { open, q, setOpen, setQ };

  const drivers = useQuery({ queryKey: [org, "drivers", "message"], queryFn: () => unwrap(api.GET("/api/v1/drivers", { params: { query: { status: "active", sort: "name", limit: 100 } } })), enabled: kind === "driver" && can("drivers.read"), staleTime: 60_000 });
  const customers = useQuery({ queryKey: [org, "customers", "message"], queryFn: () => unwrap(api.GET("/api/v1/customers", { params: { query: { status: "active", sort: "name", limit: 100 } } })), enabled: kind === "customer" && can("customers.read"), staleTime: 60_000 });
  const contacts = useQuery({ queryKey: [org, "customers", customer, "contacts"], queryFn: () => unwrap(api.GET("/api/v1/customers/{parent_id}/contacts", { params: { path: { parent_id: customer } } })), enabled: kind === "customer" && !!customer, staleTime: 60_000 });
  const team = useQuery({ queryKey: [org, "teammates"], queryFn: () => unwrap(api.GET("/api/v1/teammates")), enabled: kind === "team", staleTime: 60_000 });

  const driverField = combo(state, { k: "driver", l: "Driver", value: driver, options: (drivers.data?.items ?? []).map((d) => ({ v: d.id, l: d.full_name, ab: d.user_id ? "Driver app" : "Not on the app" })), onPick: setDriver, placeholder: "Choose a driver", head: "Active drivers", search: true, qph: "Search drivers" });
  const customerField = combo(state, { k: "customer", l: "Customer", value: customer, options: (customers.data?.items ?? []).map((c) => ({ v: c.id, l: c.name })), onPick: (v) => { setCustomer(v); setContact(""); }, placeholder: "Choose a customer", head: "Customers", search: true, qph: "Search customers" });
  const contactOptions = (contacts.data ?? []).map((c) => ({ v: c.id, l: c.name, ab: c.email ?? c.title ?? "" }));
  const contactField = combo(state, { k: "contact", l: "Contact", value: contact, options: contactOptions, onPick: setContact, placeholder: customer ? (contactOptions.length ? "Everyone at the customer" : "No contacts on file") : "Choose the customer first", head: "Contacts", search: contactOptions.length > 8, qph: "Search contacts" });
  const people = (team.data ?? []).filter((m) => m.id !== me.user.id);

  const start = async () => {
    setProblem(null);
    if (kind === "driver" && !driver) return setProblem("Choose the driver");
    if (kind === "customer" && !customer) return setProblem("Choose the customer");
    if (kind === "team" && !title.trim()) return setProblem("Name the conversation");
    if (kind === "team" && !members.length) return setProblem("Add at least one teammate");
    setPending(true);
    try {
      const conv = await unwrap(api.POST("/api/v1/conversations", {
        body: kind === "driver" ? { kind, driver_id: driver } : kind === "customer" ? { kind, customer_id: customer, contact_id: contact || null } : { kind, title: title.trim(), members },
      }));
      await client.invalidateQueries({ queryKey: [org, "conversations"] });
      onOpen(conv.id);
    } catch (e) {
      setProblem(errorMessage(e));
      setPending(false);
    }
  };

  const kinds: [Kind, string, boolean][] = [["driver", "Driver", can("drivers.read")], ["customer", "Customer", can("customers.read")], ["team", "Teammates", true]];
  return (
    <Dialog
      title="New message"
      sub="Start a conversation, or open the one you already have"
      icon={I.msg}
      width={520}
      onClose={() => !pending && onClose()}
      footer={
        <>
          <span className="sp"></span>
          <button className="btn" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn pri" onClick={() => void start()} disabled={pending}>{pending ? "Opening…" : "Open conversation"}</button>
        </>
      }
    >
      <Problem message={problem} />
      <div className="seg sm" role="tablist" aria-label="Write to" style={{ alignSelf: "flex-start" }}>
        {kinds.filter(([, , ok]) => ok).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={kind === key} className={clsx(kind === key && "on")} onClick={() => { setKind(key); setProblem(null); }}>{label}</button>
        ))}
      </div>
      {kind === "driver" ? (
        <div className="fld">
          <span className="lbl"><span>Driver</span></span>
          <Combobox f={driverField} />
          <span className="fs12 mu">A driver has one conversation with the office. Messages reach them in the driver app.</span>
        </div>
      ) : null}
      {kind === "customer" ? (
        <>
          <div className="fld">
            <span className="lbl"><span>Customer</span></span>
            <Combobox f={customerField} />
          </div>
          <div className="fld">
            <span className="lbl"><span>Contact</span></span>
            <Combobox f={contactField} />
            <span className="fs12 mu">Messages to customers go by email, which needs connecting in Integrations before anything is sent.</span>
          </div>
        </>
      ) : null}
      {kind === "team" ? (
        <>
          <div className="fld">
            <label htmlFor="conv-title">Name</label>
            <input id="conv-title" className="inp" maxLength={120} placeholder="What it’s for" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
          </div>
          <div className="fld">
            <span className="lbl"><span>Teammates</span><span className="mu">{members.length ? `${members.length} chosen` : ""}</span></span>
            <div className="c" style={{ maxHeight: "220px", overflow: "auto", border: "1px solid var(--bd)", borderRadius: "8px" }}>
              {team.isLoading ? <span className="fs12 mu" style={{ padding: "10px" }}>Loading…</span> : null}
              {people.map((m) => {
                const on = members.includes(m.id);
                return (
                  <button key={m.id} className="menui" role="checkbox" aria-checked={on} onClick={() => setMembers(on ? members.filter((x) => x !== m.id) : [...members, m.id])}>
                    <span className={clsx("chk", on && "on")} aria-hidden="true">{on ? <Icon className="s12" d={I.check} /> : null}</span>
                    <span className="f1">{m.name}</span>
                    <span className="fs12 mu">{m.role.replace("_", " ")}</span>
                  </button>
                );
              })}
              {team.data && !people.length ? <span className="fs12 mu" style={{ padding: "10px" }}>No one else is on the team yet.</span> : null}
            </div>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
