"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import { loadTone } from "@/features/fleet/labels";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { humanize } from "@/lib/format/text";
import { ACCEPT, checkFile, uploadDocument } from "@/lib/upload";
import { NewConversation } from "./new-conversation";

type Item = Schema<"ConversationItem">;
type Thread = Schema<"Thread">;
type Msg = Schema<"MessageOut">;
type Tab = "all" | "unread" | "drivers" | "customers";

const TABS: [Tab, string][] = [["all", "All"], ["unread", "Unread"], ["drivers", "Drivers"], ["customers", "Customers"]];
const CHANNEL_ICON: Record<string, string> = { app: I.mobile, email: I.mail, team: I.team, none: I.mobile, telegram: I.send, portal: I.globe };
const LABEL: Record<string, string> = { app: "App", telegram: "Telegram", sms: "SMS", email: "Email", in_app: "In app", portal: "Shipment portal" };
const RANK: Record<string, number> = { sent: 0, delivered: 1, read: 2 };
const STATE_TAG: Record<string, [string, string]> = { open: ["Open", "bad"], notified: ["Notified", "warn"], acknowledged: ["Acknowledged", "ok"], resolved: ["Resolved", "mu"], watching: ["Watching", "mu"] };

/** Dates and times in the company's time zone, the way a conversation shows them. */
function clocks(timeZone: string) {
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const key = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const short = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
  const long = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });
  const today = key.format(new Date());
  const yesterday = key.format(new Date(Date.now() - 86_400_000));
  const dayOf = (iso: string) => key.format(new Date(iso));
  return {
    time: (iso: string) => time.format(new Date(iso)),
    dayOf,
    /** In the list: the time today, "Yesterday", or the date. */
    when: (iso: string | null | undefined) => (!iso ? "" : dayOf(iso) === today ? time.format(new Date(iso)) : dayOf(iso) === yesterday ? "Yesterday" : short.format(new Date(iso))),
    /** Over a day's messages. */
    day: (iso: string) => (dayOf(iso) === today ? `Today · ${long.format(new Date(iso))}` : dayOf(iso) === yesterday ? `Yesterday · ${long.format(new Date(iso))}` : long.format(new Date(iso))),
    /** A time, with the date when it isn't today. */
    stamp: (iso: string | null | undefined) => (!iso ? "—" : dayOf(iso) === today ? time.format(new Date(iso)) : `${short.format(new Date(iso))} ${time.format(new Date(iso))}`),
  };
}

const names = (channels: string[]) => channels.map((c) => LABEL[c] ?? humanize(c));

/** What happened to a message on its way: by which channels, and how far it got. */
function deliveryLine(m: Msg, firstName: string, card: boolean): string {
  const reached = m.deliveries.filter((d) => d.status !== "not_sent");
  const missed = m.deliveries.filter((d) => d.status === "not_sent");
  if (!reached.length) {
    if (!missed.length) return "";
    const why = missed.some((d) => d.reason === "not_on_app") ? `${firstName || "They"} isn’t on the driver app` : `${names(missed.map((d) => d.channel)).join(" and ")} not connected`;
    const other = missed.filter((d) => d.reason !== "not_on_app");
    return `Not sent · ${why}${missed.some((d) => d.reason === "not_on_app") && other.length ? ` · ${names(other.map((d) => d.channel)).join(" and ")} not connected` : ""}`;
  }
  const least = reached.reduce((low, d) => (RANK[d.status]! < RANK[low]! ? d.status : low), "read" as string);
  const via = names(reached.map((d) => d.channel));
  const tail = missed.length ? ` · ${names(missed.map((d) => d.channel)).join(" and ")} not connected` : "";
  return card ? `Sent to ${via.join(" and ").toLowerCase()} · ${least}${tail}` : `${via.join(" + ")} · ${least}${tail}`;
}

/** Messages with drivers, customers and teammates: who you're talking to, what reached them by which channel, and
 * the load and alert beside the conversation. */
export function MessagesScreen() {
  const { me, can, set, state } = useConsole();
  const org = me.organization;
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [composing, setComposing] = useState(false);
  const query = useDeferredValue(q.trim());
  const list = useQuery({
    queryKey: [org.id, "conversations", tab, query],
    queryFn: () => unwrap(api.GET("/api/v1/conversations", { params: { query: { tab, q: query || undefined } } })),
    refetchInterval: 15_000,
  });
  const items = list.data?.items ?? [];
  const chosen = typeof state.conv === "string" ? state.conv : null;
  const selected = chosen ?? items[0]?.id ?? null;
  const counts = list.data?.counts;
  const nothingYet = !!list.data && counts?.all === 0 && !query;
  const open = (id: string) => set({ conv: id });

  return (
    <div className="msg3" style={nothingYet || !selected ? { gridTemplateColumns: "320px minmax(0,1fr)" } : undefined}>
      <section className="mconv" aria-label="Conversations">
        <div className="r g8" style={{ padding: "16px 16px 10px" }}>
          <h1 className="h1" style={{ fontSize: "18px", lineHeight: "24px" }}>Messages</h1>
          <span className="sp"></span>
          {can("messages.send") ? (
            <button className="btn sm icon" aria-label="New message" onClick={() => setComposing(true)}><Icon className="s14" d={I.pencil} /></button>
          ) : null}
        </div>
        <div style={{ padding: "0 16px 10px" }}>
          <label className="search" style={{ width: "100%" }}>
            <Icon className="s14" d={I.search} />
            <input placeholder="Search people and messages" aria-label="Search messages" value={q} onChange={(e) => setQ(e.currentTarget.value)} />
          </label>
        </div>
        <div className="seg sm" style={{ margin: "0 16px 10px", alignSelf: "flex-start" }} role="tablist" aria-label="Show">
          {TABS.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={clsx(tab === key && "on")} onClick={() => setTab(key)}>
              {label}{key === "unread" && counts?.unread ? ` · ${counts.unread}` : ""}
            </button>
          ))}
        </div>
        <div style={{ flex: "1", minHeight: "0", overflow: "auto", borderTop: "1px solid var(--bd2)" }}>
          {list.isLoading ? <div className="fs12 mu" style={{ padding: "14px 16px" }}>Loading…</div> : null}
          {items.map((cv) => (
            <ConversationRow key={cv.id} cv={cv} on={cv.id === selected} timeZone={org.timezone} onOpen={() => open(cv.id)} />
          ))}
          {list.data && !items.length ? (
            <div className="c g6" style={{ padding: "24px 16px", alignItems: "flex-start" }}>
              <span className="fs13 w5">{query ? "Nothing matches" : nothingYet ? "No conversations yet" : tab === "unread" ? "All caught up" : `No conversations with ${tab}`}</span>
              <span className="fs12 mu">
                {query ? "Try a name, or words from a message." : nothingYet ? "Messages with drivers, customers and teammates show here, with what reached them." : "Nothing unread in your conversations."}
              </span>
            </div>
          ) : null}
        </div>
      </section>
      {selected ? (
        <ThreadView key={selected} id={selected} />
      ) : (
        <section className="mthread" style={{ display: "grid", placeItems: "center" }}>
          {list.isLoading ? null : (
            <EmptyState icon={I.msg} title="No conversations yet" text="Message a driver in the driver app, a customer, or your teammates. Every message is kept here with what reached them.">
              {can("messages.send") ? <button className="btn pri sm" onClick={() => setComposing(true)}><Icon className="s14" d={I.pencil} />New message</button> : null}
            </EmptyState>
          )}
        </section>
      )}
      {composing ? <NewConversation onClose={() => setComposing(false)} onOpen={(id) => { setComposing(false); open(id); }} /> : null}
    </div>
  );
}

function ConversationRow({ cv, on, timeZone, onOpen }: { cv: Item; on: boolean; timeZone: string; onOpen: () => void }) {
  const c = clocks(timeZone);
  return (
    <button className={clsx("cvi", on && "on")} onClick={onOpen} aria-current={on ? "true" : undefined}>
      <span className="av md" data-k={cv.tone}>{cv.initials}<span className="pres"></span></span>
      <span className="f1 c g2" style={{ minWidth: "0" }}>
        <span className="r g6">
          <span className="fs13 w5 tx ell">{cv.name}</span>
          <Icon className="s12 mu" d={CHANNEL_ICON[cv.channel] ?? I.msg} />
          <span className="sp"></span>
          <span className="fs11 mu num">{c.when(cv.last_at)}</span>
        </span>
        <span className="r g6">
          <span className={clsx("fs12 mu ell f1", cv.unread > 0 && "uw")}>{cv.last ?? ""}</span>
          {cv.unread > 0 ? <span className="ubadge">{cv.unread}</span> : null}
        </span>
      </span>
    </button>
  );
}

function ThreadView({ id }: { id: string }) {
  const { me, can, set, state } = useConsole();
  const org = me.organization;
  // A message drafted where the conversation was opened from (a load asking for a new appointment), for this one only.
  const drafted = state.mtext && typeof state.mtext === "object" ? (state.mtext as { conv?: string; text?: string }) : null;
  const client = useQueryClient();
  const c = clocks(org.timezone);
  const thread = useQuery({
    queryKey: [org.id, "conversation", id],
    queryFn: () => unwrap(api.GET("/api/v1/conversations/{conversation_id}", { params: { path: { conversation_id: id } } })),
    refetchInterval: 10_000,
  });
  const t = thread.data;
  const [text, setText] = useState(drafted?.conv === id ? (drafted.text ?? "") : "");
  const [older, setOlder] = useState<Msg[]>([]);
  const [moreGone, setMoreGone] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const count = t?.messages.length ?? 0;
  const lastId = t?.messages[count - 1]?.id;

  // What is on screen is read.
  const unread = t?.unread ?? 0;
  useEffect(() => {
    if (!unread) return;
    void api.POST("/api/v1/conversations/{conversation_id}/read", { params: { path: { conversation_id: id } } }).then(async () => {
      // A count still on its way was worked out before this read; drop it so the refetch counts afresh.
      await client.cancelQueries({ queryKey: [org.id, "conversations"] });
      await client.invalidateQueries({ queryKey: [org.id, "conversations"] });
    });
  }, [id, unread, lastId, client, org.id]);
  // The newest message in view.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  // The assistant's suggestion for their latest message, asked for once.
  const wantDraft = !!t && t.assistant && can("messages.send") && t.draft?.state === "none";
  const drafting = useQuery({
    queryKey: [org.id, "draft", id, t?.draft?.for_message_id ?? ""],
    queryFn: () => unwrap(api.POST("/api/v1/conversations/{conversation_id}/draft", { params: { path: { conversation_id: id } }, body: { shorter: false } })),
    enabled: wantDraft,
    staleTime: Infinity,
    retry: false,
  });

  if (thread.isError) {
    return (
      <section className="mthread" style={{ display: "grid", placeItems: "center" }}>
        <EmptyState icon={I.msg} title="Conversation not found" text="It may have been opened from an old link, or it isn’t one you’re in.">
          <button className="btn sm" onClick={() => set({ conv: null })}>Back to messages</button>
        </EmptyState>
      </section>
    );
  }
  if (!t) return <section className="mthread"><div className="fs12 mu" style={{ padding: "16px 20px" }}>Loading…</div></section>;

  const first = t.driver?.name.split(" ")[0] ?? t.customer?.contact?.name.split(" ")[0] ?? "";
  const all = [...older, ...t.messages];
  const draft = t.draft?.state === "ready" ? t.draft : drafting.data && drafting.data.for_message_id === t.draft?.for_message_id && t.draft?.state === "none" ? drafting.data : null;

  const showEarlier = async () => {
    const before = all[0]?.created_at;
    if (!before) return;
    const page = await unwrap(api.GET("/api/v1/conversations/{conversation_id}", { params: { path: { conversation_id: id }, query: { before } } }));
    setOlder([...page.messages, ...older]);
    if (!page.has_more) setMoreGone(true);
  };

  const days: { day: string; msgs: Msg[] }[] = [];
  for (const m of all) {
    const key = c.dayOf(m.created_at);
    if (days.length && c.dayOf(days[days.length - 1]!.msgs[0]!.created_at) === key) days[days.length - 1]!.msgs.push(m);
    else days.push({ day: c.day(m.created_at), msgs: [m] });
  }
  const app = t.channels.find((ch) => ch.key === "app");
  const phone = t.driver?.phone ?? t.customer?.contact?.phone ?? null;
  const sub = t.kind === "driver"
    ? [t.driver?.truck ? <span key="u" className="mono">{t.driver.truck}</span> : null, t.load ? `${t.load.load_number} ${t.load.short_lane}` : null, t.driver?.hire_date ? `driver since ${t.driver.hire_date.slice(0, 4)}` : null]
    : t.kind === "customer"
      ? [t.customer?.contact ? t.customer.contact.name + (t.customer.contact.title ? `, ${t.customer.contact.title}` : "") : "All contacts", t.customer?.contact?.email ?? null]
      : [t.members.map((m) => m.name ?? "—").join(", ")];

  return (
    <>
      <section className="mthread" aria-label={`Conversation with ${t.name}`}>
        <div className="r g10" style={{ padding: "12px 20px", borderBottom: "1px solid var(--bd)", background: "var(--sf)" }}>
          <span className="av md" data-k={t.tone}>{t.initials}<span className="pres"></span></span>
          <div className="f1" style={{ minWidth: "0" }}>
            <div className="r g8">
              {t.kind === "driver" && t.driver ? (
                <button className="fs14 w6 ell tx" style={{ background: "none", border: "none", padding: "0", cursor: "pointer" }} title="Open the driver’s profile" onClick={() => set({ screen: "driver", driverId: t.driver!.id })}>{t.name}</button>
              ) : (
                <span className="fs14 w6 ell">{t.name}</span>
              )}
              {t.kind === "driver" ? (
                app?.connected ? <span className="tag" data-k="brand"><Icon className="s12" d={I.mobile} />App · signed in</span> : <span className="tag" data-k="mu"><Icon className="s12" d={I.mobile} />Not on the app</span>
              ) : t.kind === "customer" ? (
                <span className="tag" data-k="mu"><Icon className="s12" d={I.mail} />Email not connected</span>
              ) : (
                <span className="tag" data-k="mu"><Icon className="s12" d={I.team} />Team · {t.members.length}</span>
              )}
            </div>
            <div className="fs12 mu ell">{sub.filter(Boolean).flatMap((x, i) => (i ? [" · ", x] : [x]))}</div>
          </div>
          {phone ? (
            <a className="btn sm icon" aria-label={`Call ${t.name}`} href={`tel:${phone.replace(/[^\d+]/g, "")}`}><Icon className="s14" d={I.phone} /></a>
          ) : t.kind !== "team" ? (
            <button className="btn sm icon" aria-label="Call" disabled title="No phone number on file"><Icon className="s14" d={I.phone} /></button>
          ) : null}
          {t.load ? <button className="btn sm" onClick={() => set({ screen: "load", loadId: t.load!.id })}>Open load</button> : null}
        </div>
        <div className="mscroll" ref={scroller}>
          {t.has_more && !moreGone ? <div className="mday"><button className="btn xs ghost" onClick={() => void showEarlier()}>Show earlier messages</button></div> : null}
          {!all.length ? (
            <div className="c g6" style={{ margin: "auto", textAlign: "center", maxWidth: "360px" }}>
              <span className="fs13 w5">No messages yet</span>
              <span className="fs12 mu">{t.kind === "driver" ? `Loads dispatched to ${first || "them"} and alerts sent to them show here too, with what reached them.` : "Write the first message below."}</span>
            </div>
          ) : null}
          {days.map((d) => (
            <DayGroup key={d.day} day={d.day} msgs={d.msgs} thread={t} first={first} time={c.time} />
          ))}
          {draft ? <DraftCard id={id} draft={draft} onUse={setText} /> : wantDraft && drafting.isFetching ? (
            <div className="aidraft"><div className="r g8"><span className="tag" data-k="violet"><Icon className="s12" d={I.spark} />AI draft</span><span className="fs12 mu">Writing a suggestion…</span></div></div>
          ) : null}
        </div>
        <Composer t={t} first={first} text={text} setText={setText} />
      </section>
      <Context t={t} />
    </>
  );
}

function DayGroup({ day, msgs, thread, first, time }: { day: string; msgs: Msg[]; thread: Thread; first: string; time: (iso: string) => string }) {
  const { me, set } = useConsole();
  const openDoc = (docId: string) => set({ screen: "docreview", docId, drawer: null, overlay: "none", modal: "none" });
  return (
    <>
      <div className="mday"><span>{day}</span></div>
      {msgs.map((m) => {
        if (m.kind === "system") {
          const tone = m.event === "alert" ? "bad" : "brand";
          return (
            <div key={m.id} className="msys" data-k={tone}>
              <span className="eqic" style={{ width: "26px", height: "26px", background: "var(--b)", color: "var(--c)" }}><Icon className="s14" d={m.event === "alert" ? I.gauge : I.loads} /></span>
              <div className="f1">
                <div className="fs13 w5 tx">{m.title}</div>
                <div className="fs12 t3">{m.body}</div>
                <div className="fs11 mu" style={{ marginTop: "3px" }}>{deliveryLine(m, first, true)}</div>
              </div>
              <span className="fs11 mu num">{time(m.created_at)}</span>
            </div>
          );
        }
        const mine = m.direction === "out" || (m.direction === "internal" && m.author_user_id === me.user.id);
        const attachments = m.attachments.map((a) => (
          <button key={a.id} className="matt" onClick={() => openDoc(a.id)}><Icon className="s14" d={I.file} />{a.filename}</button>
        ));
        if (mine) {
          const line = m.direction === "out" ? deliveryLine(m, first, false) : "In app";
          return (
            <div key={m.id} className="mrow2 out">
              <div className="c g2" style={{ maxWidth: "62%", alignItems: "flex-end" }}>
                <div className="mb out2">{m.body ? <span className="pre">{m.body}</span> : null}{attachments}</div>
                <span className="fs11 mu r g4">
                  {m.direction === "out" && m.author_user_id !== me.user.id && m.author_name ? `${m.author_name} · ` : ""}{line} · {time(m.created_at)}
                  {m.deliveries.some((d) => d.status === "read") ? <Icon className="s12 b" d={I.check} /> : null}
                </span>
              </div>
            </div>
          );
        }
        const who = m.author_name ?? thread.name;
        const meta = m.direction === "in" ? `via ${(LABEL[m.via ?? ""] ?? m.via ?? "app").toLowerCase()}` : who;
        return (
          <div key={m.id} className="mrow2">
            <span className="av sm">{who.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</span>
            <div className="c g2" style={{ maxWidth: "62%" }}>
              <div className="mb in">{m.body ? <span className="pre">{m.body}</span> : null}{attachments}</div>
              <span className="fs11 mu">{m.direction === "in" && thread.kind === "customer" && m.author_name ? `${m.author_name} · ` : ""}{meta} · {time(m.created_at)}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

function DraftCard({ id, draft, onUse }: { id: string; draft: { text?: string | null; sources: string[] }; onUse: (text: string) => void }) {
  const { me } = useConsole();
  const act = useAction();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const use = () => onUse(draft.text ?? "");
  const shorter = async () => {
    setBusy(true);
    await act(() => unwrap(api.POST("/api/v1/conversations/{conversation_id}/draft", { params: { path: { conversation_id: id } }, body: { shorter: true } })));
    setBusy(false);
  };
  const dismiss = () => void act(async () => {
    await unwrap(api.DELETE("/api/v1/conversations/{conversation_id}/draft", { params: { path: { conversation_id: id } } }));
    await client.invalidateQueries({ queryKey: [me.organization.id, "conversation", id] });
  });
  return (
    <div className="aidraft">
      <div className="r g8">
        <span className="tag" data-k="violet"><Icon className="s12" d={I.spark} />AI draft</span>
        <span className="fs12 mu">Review before sending — nothing is sent automatically</span>
        <span className="sp"></span>
        <button className="btn ghost xs icon" aria-label="Dismiss draft" onClick={dismiss}><Icon className="s12" d={I.x} /></button>
      </div>
      <p className="fs13 pre" style={{ marginTop: "6px" }}>{draft.text}</p>
      <div className="r g6" style={{ marginTop: "8px" }}>
        <button className="btn xs" onClick={use}>Use draft</button>
        <button className="btn xs ghost" onClick={() => void shorter()} disabled={busy}>{busy ? "Shortening…" : "Shorter"}</button>
        {draft.sources.length ? <span className="fs11 mu">Sources: {draft.sources.join(", ")}</span> : null}
      </div>
    </div>
  );
}

function Composer({ t, first, text, setText }: { t: Thread; first: string; text: string; setText: (text: string) => void }) {
  const { can, set, notify } = useConsole();
  const act = useAction();
  const [via, setVia] = useState<string[] | null>(null);
  const [menu, setMenu] = useState(false);
  const [files, setFiles] = useState<{ id: string; filename: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const connected = t.channels.filter((ch) => ch.connected).map((ch) => ch.key);
  const chosen = (via ?? connected).filter((k) => connected.includes(k));
  const canSend = can("messages.send");
  const blocked = !connected.length;
  const ready = !!(text.trim() || files.length) && !!chosen.length && !sending && !uploading;

  const send = async () => {
    if (!ready) return;
    setSending(true);
    const ok = await act(() => unwrap(api.POST("/api/v1/conversations/{conversation_id}/messages", {
      params: { path: { conversation_id: t.id } },
      body: { body: text.trim(), channels: t.kind === "team" ? null : (chosen as Schema<"MessageIn">["channels"]), document_ids: files.map((f) => f.id), load_id: null },
    })));
    setSending(false);
    if (ok) {
      setText("");
      setFiles([]);
    }
  };
  const attach = async (file: File) => {
    const problem = checkFile(file);
    if (problem) return notify(problem, true);
    setUploading(true);
    try {
      const entity = t.kind === "driver" ? (t.load ? { entityType: "load" as const, entityId: t.load.id } : { entityType: "driver" as const, entityId: t.driver!.id })
        : t.kind === "customer" ? { entityType: "customer" as const, entityId: t.customer!.id } : {};
      const doc = await uploadDocument({ file, type: "other", ...entity });
      setFiles((f) => [...f, { id: doc.id, filename: doc.filename }]);
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setUploading(false);
    }
  };

  if (!canSend) {
    return <div className="mcomp"><span className="fs12 mu">Your role can read messages but not send them.</span></div>;
  }
  if (blocked) {
    const why = t.channels.map((ch) => ch.detail).join(" · ");
    return (
      <div className="mcomp">
        <div className="r g8">
          <Icon className="s14 mu" d={I.info} />
          <span className="fs12 t2 f1">{t.kind === "driver" ? `${first || t.name} can’t get messages yet: ${why.charAt(0).toLowerCase()}${why.slice(1)}.` : `Nothing can carry a message to ${t.name} yet: ${why.charAt(0).toLowerCase()}${why.slice(1)}.`}</span>
          {t.kind === "driver" && t.driver ? <button className="btn sm" onClick={() => set({ screen: "driver", driverId: t.driver!.id })}>Open driver</button> : null}
          {t.kind === "customer" && can("organization.manage") ? <button className="btn sm" onClick={() => set(goTo("settings"))}>Integrations</button> : null}
        </div>
      </div>
    );
  }
  const viaLabel = t.kind === "team" ? "In app" : names(chosen).join(" + ") || "no channel";
  return (
    <div className="mcomp">
      {t.quick_replies.length ? (
        <div className="r g6">{t.quick_replies.map((reply) => <button key={reply} className="btn xs" onClick={() => setText(reply)}>{reply}</button>)}</div>
      ) : null}
      {files.length ? (
        <div className="r g6" style={{ flexWrap: "wrap" }}>
          {files.map((f) => (
            <span key={f.id} className="matt"><Icon className="s14" d={I.file} />{f.filename}<button className="btn ghost xs icon" aria-label={`Remove ${f.filename}`} onClick={() => setFiles(files.filter((x) => x.id !== f.id))}><Icon className="s12" d={I.x} /></button></span>
          ))}
        </div>
      ) : null}
      <textarea
        className="inp"
        rows={2}
        placeholder={`Message ${first || t.name}…`}
        aria-label={`Message ${first || t.name}`}
        value={text}
        maxLength={4000}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <div className="r g8">
        <button className="btn ghost sm icon" aria-label="Attach file" onClick={() => picker.current?.click()} disabled={uploading || files.length >= 5}><Icon className="s14" d={I.clip} /></button>
        <input ref={picker} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (f) void attach(f); }} />
        <div className="mwrap">
          {menu ? <div style={{ position: "fixed", inset: "0", zIndex: 42 }} onClick={() => setMenu(false)}></div> : null}
          <button className="btn ghost sm" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} disabled={t.kind === "team"}>
            Send via: {viaLabel}{t.kind === "team" ? null : <Icon className="s12" d={I.chevD} />}
          </button>
          {menu ? (
            <>
              <div
                className="menu"
                role="menu"
                aria-label="Send via"
                style={{ top: "auto", bottom: "calc(100% + 8px)", left: "0", right: "auto", width: "300px" }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setMenu(false);
                  }
                }}
              >
                {t.channels.map((ch) => {
                  const on = chosen.includes(ch.key);
                  return (
                    <button
                      key={ch.key}
                      role="menuitemcheckbox"
                      aria-checked={on}
                      className="menui"
                      disabled={!ch.connected}
                      style={ch.connected ? undefined : { opacity: 0.6, cursor: "not-allowed" }}
                      onClick={() => setVia(on ? chosen.filter((k) => k !== ch.key) : [...chosen, ch.key])}
                    >
                      <span className={clsx("chk", on && "on")} aria-hidden="true">{on ? <Icon className="s12" d={I.check} /> : null}</span>
                      <span className="f1 c" style={{ alignItems: "flex-start" }}><span className="fs13">{ch.label}</span><span className="fs11 mu">{ch.detail}</span></span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
        <span className="sp"></span>
        <span className="fs11 mu">{uploading ? "Uploading…" : "Kept in FlyFleet with the company’s records"}</span>
        <button className="btn pri sm" onClick={() => void send()} disabled={!ready}><Icon className="s14" d={I.send} />{sending ? "Sending…" : "Send"}</button>
      </div>
    </div>
  );
}

function Context({ t }: { t: Thread }) {
  const { me, set, can } = useConsole();
  const c = clocks(me.organization.timezone);
  const l = t.load;
  const inc = t.incident;
  const [tagText, tagTone] = inc ? STATE_TAG[inc.state] ?? [humanize(inc.state), "mu"] : ["", ""];
  return (
    <aside className="mctx" aria-label="Details">
      {t.kind === "customer" && t.customer ? (
        <section className="card oh">
          <div className="ch"><h2 className="h2">Contact</h2><span className="sp"></span><button className="lnk" onClick={() => set({ ...goTo("customers") })}>{t.customer.name}</button></div>
          <div className="cb c g8">
            {t.customer.contact ? (
              <dl className="kv" style={{ fontSize: "12px" }}>
                <dt>Name</dt><dd>{t.customer.contact.name}</dd>
                <dt>Title</dt><dd>{t.customer.contact.title ?? "—"}</dd>
                <dt>Email</dt><dd className="ell">{t.customer.contact.email ?? "—"}</dd>
                <dt>Phone</dt><dd className="num">{t.customer.contact.phone ?? "—"}</dd>
              </dl>
            ) : <p className="fs12 mu">The whole customer, not one contact.</p>}
          </div>
        </section>
      ) : null}
      {l ? (
        <section className="card oh">
          <div className="ch"><h2 className="h2">Load</h2><span className="sp"></span><button className="lnk" onClick={() => set({ screen: "load", loadId: l.id })}>{l.load_number}</button></div>
          <div className="cb c g8">
            <div className="r g6">
              <span className="badge" data-k={loadTone(l.status)}><i></i>{humanize(l.status)}</span>
              {l.late_by_minutes > 0 ? <span className="risk" data-k="late"><Icon className="s14" d={I.clock} />+{l.late_by_minutes >= 60 ? `${Math.floor(l.late_by_minutes / 60)}h ${l.late_by_minutes % 60}m` : `${l.late_by_minutes}m`}</span> : null}
            </div>
            <div className="fs13 w5">{l.lane}</div>
            <dl className="kv" style={{ fontSize: "12px" }}>
              <dt>Customer</dt><dd>{l.customer ?? "—"}</dd>
              <dt>Next stop</dt><dd>{l.next_stop ?? "—"}</dd>
              <dt>Appointment</dt><dd className="num">{c.stamp(l.appointment)}</dd>
              <dt>ETA</dt><dd className={clsx("num", l.late_by_minutes > 0 && "tc")} data-k={l.late_by_minutes > 0 ? "late" : undefined}>{l.eta ? c.stamp(l.eta) : "—"}</dd>
              <dt>Equipment</dt><dd>{l.equipment}</dd>
            </dl>
          </div>
        </section>
      ) : t.kind === "driver" ? (
        <section className="card oh">
          <div className="ch"><h2 className="h2">Load</h2></div>
          <div className="cb fs12 mu">No load assigned to {t.driver?.name.split(" ")[0] ?? "them"} right now.</div>
        </section>
      ) : null}
      {t.kind === "driver" ? (
        <section className="card oh">
          <div className="ch"><h2 className="h2">Telegram link</h2><span className="sp"></span><span className="badge" data-k="mu"><i></i>Not connected</span></div>
          <div className="cb c g8 fs12">
            <dl className="kv" style={{ fontSize: "12px" }}>
              <dt>Linked</dt><dd>No</dd>
              <dt>Receives</dt><dd>Nothing until Telegram is connected</dd>
              <dt>Driver app</dt><dd>{t.channels.find((ch) => ch.key === "app")?.connected ? "Signed in · gets messages and alerts" : "Not signed up yet"}</dd>
              <dt>Sensitive actions</dt><dd>Open in the app</dd>
            </dl>
            <p className="note"><Icon className="s14" d={I.shield} />Accepting loads or confirming delivery needs a signed-in FlyFleet session, never just a chat reply.</p>
            {can("organization.manage") ? <button className="lnk" style={{ alignSelf: "flex-start" }} onClick={() => set(goTo("settings"))}>Connect messaging in Integrations</button> : null}
          </div>
        </section>
      ) : null}
      {t.kind === "team" ? (
        <section className="card oh">
          <div className="ch"><h2 className="h2">People</h2><span className="sp"></span><span className="fs12 mu">{t.members.length}</span></div>
          <div className="cb c g8">
            {t.members.map((m) => (
              <div key={m.id} className="r g8"><span className="av sm">{(m.name ?? "?").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</span><span className="fs13">{m.name ?? "—"}{m.id === me.user.id ? <span className="mu"> · you</span> : null}</span></div>
            ))}
          </div>
        </section>
      ) : null}
      {inc ? (
        <section className="card oh">
          <div className="ch"><h2 className="h2">{inc.label} incident</h2><span className="sp"></span><span className="tag" data-k={tagTone}>{tagText}{inc.state === "acknowledged" && inc.acknowledged_at ? ` ${c.time(inc.acknowledged_at)}` : ""}</span></div>
          <div className="cb fs12 t3">
            {inc.number} · {inc.peak != null ? `${Math.round(inc.peak)} mph peak` : inc.title}{inc.driver_replied_at ? " · driver replied in the app" : ""}.{" "}
            {can("tracking.read") ? <button className="lnk" onClick={() => set({ ...goTo("tracking"), vehicle: inc.vehicle_id })}>View on map</button> : null}
          </div>
        </section>
      ) : null}
    </aside>
  );
}
