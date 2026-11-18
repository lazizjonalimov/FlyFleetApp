"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import type { ConsoleState } from "@/features/console/state";
import { useOpenConversation } from "@/features/messages/use-message";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { timeZoneLabel } from "@/lib/format/dates";

const SPARK = "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z";
const EYE = "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";
const LOCK = "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4";
const SEND = "M22 2L11 13M22 2l-7 20-4-9-9-4z";

type Answer = Schema<"AskAnswer">;
type Link = Schema<"AskRecord">;
type Turn = { question: string; answer: Answer | null; error: string | null; sent?: string };

/** Where a cited record opens, and its icon. */
const OPENS: Record<string, { ic: string; open: (id: string) => ConsoleState }> = {
  load: { ic: I.loads, open: (id) => ({ screen: "loads", drawer: id, overlay: "none" }) },
  driver: { ic: I.user, open: (id) => ({ screen: "driver", driverId: id, overlay: "none" }) },
  vehicle: { ic: I.truck, open: (id) => ({ screen: "truck", unitId: id, unitKind: "truck", overlay: "none" }) },
  incident: { ic: I.alert, open: () => goTo("alerts") },
  conversation: { ic: I.msg, open: (id) => ({ ...goTo("messages"), conv: id }) },
  invoices: { ic: I.invoice, open: () => goTo("invoices") },
};

/** The answer as plain text, for the next question's context. */
const asText = (a: Answer) => [a.intro, ...a.points.map((p, i) => `${i + 1}. ${p.text}`)].join("\n");

/**
 * Ask FlyFleet: questions answered from the records the person's role can see, each point with links to the records
 * it relies on. Read-only: a message it suggests is a draft until the person approves it.
 */
export function AskFlyFleet() {
  const { me, isAI, closeOverlay, set, notify, can } = useConsole();
  const org = me.organization;
  const message = useOpenConversation();
  const info = useQuery({ queryKey: [org.id, "assistant"], queryFn: () => unwrap(api.GET("/api/v1/assistant")), enabled: isAI, staleTime: 5 * 60_000 });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!isAI) return null;
  const on = info.data?.enabled ?? false;

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setText("");
    setBusy(true);
    const history = turns.filter((t) => t.answer).slice(-4).map((t) => ({ question: t.question, answer: asText(t.answer!) }));
    setTurns((all) => [...all, { question: q, answer: null, error: null }]);
    try {
      const answer = await unwrap(api.POST("/api/v1/assistant/ask", { body: { question: q, history } }));
      setTurns((all) => all.map((t, i) => (i === all.length - 1 ? { ...t, answer } : t)));
    } catch (e) {
      setTurns((all) => all.map((t, i) => (i === all.length - 1 ? { ...t, error: errorMessage(e) } : t)));
    } finally {
      setBusy(false);
    }
  };
  const open = (link: Link) => {
    const where = OPENS[link.kind];
    if (where) set(where.open(link.id ?? ""));
  };
  const approve = async (index: number, draft: NonNullable<Answer["draft"]>) => {
    try {
      const conv = await unwrap(api.POST("/api/v1/conversations", { body: draft.kind === "driver" ? { kind: "driver", driver_id: draft.id } : { kind: "customer", customer_id: draft.id, contact_id: null } }));
      await unwrap(api.POST("/api/v1/conversations/{conversation_id}/messages", { params: { path: { conversation_id: conv.id } }, body: { body: draft.body, channels: null, load_id: draft.load_id, document_ids: [] } }));
      setTurns((all) => all.map((t, i) => (i === index ? { ...t, sent: draft.label.replace(/^Message to /, "") } : t)));
      notify(`Sent to ${draft.label.replace(/^Message to /, "")}`);
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  const clock = (iso: string) => `${new Date(iso).toLocaleTimeString("en-US", { timeZone: org.timezone, hour: "2-digit", minute: "2-digit", hour12: false })} ${timeZoneLabel(org.timezone)}`;

  return (
    <aside className="aip" aria-label="Ask FlyFleet">
      <div className="r g8" style={{ padding: "14px 16px", borderBottom: "1px solid var(--bd)" }}>
        <span className="ilogo" data-k="violet" style={{ width: "30px", height: "30px" }}>
          <Icon className="s14" d={SPARK} />
        </span>
        <div className="f1">
          <div className="fs14 w6">Ask FlyFleet</div>
          <div className="fs11 mu">Answers from records you can see · read-only</div>
        </div>
        <button className="btn ghost icon sm" aria-label="New chat" onClick={() => { setTurns([]); setText(""); }} disabled={busy}><Icon className="s14" d="M12 5v14M5 12h14" /></button>
        <button className="btn ghost icon sm" onClick={closeOverlay} aria-label="Close assistant"><Icon d="M18 6L6 18M6 6l12 12" /></button>
      </div>
      {info.data ? (
        <div className="aiscope">
          <span className="r g6"><Icon className="s12" d={EYE} /><span>{`Using: ${info.data.using.join(", ")}`}</span></span>
          {info.data.hidden.length ? <span className="r g6"><Icon className="s12" d={LOCK} /><span>{`Hidden for your role: ${info.data.hidden.join(", ")}`}</span></span> : null}
        </div>
      ) : null}
      <div className="aibody" aria-live="polite">
        {info.isPending ? <p className="fs13 mu">Loading…</p> : null}
        {info.isError ? (
          <div className="banner" data-k="warn">
            <Icon d={I.alert} />
            <div className="f1">
              <div className="bt">Ask FlyFleet couldn’t be loaded</div>
              <div>{errorMessage(info.error)}</div>
            </div>
            <button className="btn sm" onClick={() => void info.refetch()}>Retry</button>
          </div>
        ) : null}
        {info.data && !on ? (
          <div className="banner" data-k="info">
            <Icon d={I.info} />
            <div className="f1">
              <div className="bt">Ask FlyFleet isn’t connected</div>
              <div>{info.data.detail}</div>
            </div>
          </div>
        ) : null}
        {on && !turns.length ? <p className="fs13 mu">Ask about loads, drivers, alerts and documents. Answers say which records they come from, and nothing is changed or sent without you.</p> : null}
        {turns.map((turn, index) => (
          <div key={index} className="c g10">
            <div className="aiq"><span>{turn.question}</span></div>
            {!turn.answer && !turn.error ? <div className="fs13 mu">Reading your records…</div> : null}
            {turn.error ? <div className="banner" data-k="warn"><Icon d={I.alert} /><div className="f1">{turn.error}</div></div> : null}
            {turn.answer ? (
              <div className="aia">
                {turn.answer.intro ? <p className="fs13"><span>{turn.answer.intro}</span></p> : null}
                {turn.answer.points.length ? (
                  <ol className="c g10" style={{ marginTop: "8px" }}>
                    {turn.answer.points.map((point, i) => (
                      <li key={i} className="aili">
                        <span className="ain mono">{i + 1}</span>
                        <div className="f1">
                          <p className="fs13 t2"><span>{point.text}</span></p>
                          {point.refs.length ? (
                            <div className="r g4 wrap" style={{ marginTop: "5px" }}>
                              {point.refs.map((ref) => (
                                <button key={ref.key} className="srcchip" onClick={() => open(ref)} disabled={!OPENS[ref.kind] || (!ref.id && !["incident", "invoices"].includes(ref.kind))}>
                                  <Icon className="s12" d={OPENS[ref.kind]?.ic ?? I.file} />
                                  {ref.kind === "conversation" ? "Chat" : ref.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : null}
                {turn.answer.draft ? (
                  <div className="aiact">
                    <div className="r g8">
                      <span className="tag" data-k="violet">{turn.sent ? "Sent" : "Draft · needs your approval"}</span>
                      <span className="sp"></span>
                      <span className="fs11 mu">{turn.answer.draft.label}</span>
                    </div>
                    <p className="fs12 t2" style={{ marginTop: "6px", lineHeight: "17px", whiteSpace: "pre-wrap" }}>{turn.answer.draft.body}</p>
                    {!turn.sent && can("messages.send") ? (
                      <div className="r g6" style={{ marginTop: "8px" }}>
                        <button className="btn xs" onClick={() => { const d = turn.answer!.draft!; void message(d.kind === "driver" ? { driverId: d.id } : { customerId: d.id }, d.body); }}>Edit</button>
                        <button className="btn xs pri" onClick={() => void approve(index, turn.answer!.draft!)}>{"Approve & send"}</button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="r g8 fs11 mu" style={{ marginTop: "10px" }}>
                  <span className="f1">{`Data as of ${clock(turn.answer.as_of)} · ${turn.answer.records_read} records read · AI can be wrong — check the sources.`}</span>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="aiin">
        {info.data?.suggestions.length ? (
          <div className="r g6 wrap">
            {info.data.suggestions.map((s) => <button key={s} className="btn xs" onClick={() => void ask(s)} disabled={!on || busy}>{s}</button>)}
          </div>
        ) : null}
        <form className="r g8 aibox" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
          <input placeholder="Ask about loads, drivers, documents…" aria-label="Ask FlyFleet" value={text} onChange={(e) => setText(e.target.value)} disabled={!on} maxLength={500} />
          <button className="btn pri sm icon" aria-label="Send question" disabled={!on || busy || !text.trim()}><Icon className="s14" d={SEND} /></button>
        </form>
      </div>
    </aside>
  );
}
