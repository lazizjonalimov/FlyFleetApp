"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { api, unwrap } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { plural } from "@/lib/format/text";

type Driver = { id: string; full_name: string; user_id?: string | null };

/** One message to several drivers, each in their own conversation. Drivers nothing can reach are named, not
 * pretended to be told. */
export function BulkMessage({ drivers, onClose }: { drivers: Driver[]; onClose: () => void }) {
  const { me, notify } = useConsole();
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const reachable = drivers.filter((d) => d.user_id);
  const unreachable = drivers.filter((d) => !d.user_id);

  const send = async () => {
    if (!text.trim()) return setProblem("Write the message");
    if (!reachable.length) return setProblem("None of these drivers is on the driver app yet");
    setPending(true);
    setProblem(null);
    let sent = 0;
    const missed: string[] = [];
    for (const d of reachable) {
      try {
        const conv = await unwrap(api.POST("/api/v1/conversations", { body: { kind: "driver", driver_id: d.id } }));
        await unwrap(api.POST("/api/v1/conversations/{conversation_id}/messages", { params: { path: { conversation_id: conv.id } }, body: { body: text.trim(), channels: null, document_ids: [], load_id: null } }));
        sent += 1;
      } catch (e) {
        if (!(e instanceof ApiError)) setProblem(errorMessage(e));
        missed.push(d.full_name);
      }
    }
    await client.invalidateQueries({ queryKey: [me.organization.id] });
    const tail = [...missed, ...unreachable.map((d) => d.full_name)];
    notify(`Sent to ${plural(sent, "driver")}${tail.length ? ` · not sent to ${tail.join(", ")}` : ""}`, sent === 0);
    onClose();
  };

  return (
    <Dialog
      title={`Message ${plural(drivers.length, "driver")}`}
      sub="Each driver gets it in their own conversation, in the driver app"
      icon={I.msg}
      width={520}
      onClose={() => !pending && onClose()}
      footer={
        <>
          <span className="sp"></span>
          <button className="btn" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn pri" onClick={() => void send()} disabled={pending || !reachable.length}>{pending ? "Sending…" : `Send to ${plural(reachable.length, "driver")}`}</button>
        </>
      }
    >
      <Problem message={problem} />
      <div className="fld">
        <label htmlFor="bulk-message">Message</label>
        <textarea id="bulk-message" className="inp" rows={4} maxLength={4000} value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder="What every driver should know" />
      </div>
      {unreachable.length ? (
        <div className="banner" data-k="warn">
          <span className="f1 fs12">{unreachable.map((d) => d.full_name).join(", ")} {unreachable.length === 1 ? "isn’t" : "aren’t"} on the driver app, and Telegram and SMS aren’t connected yet, so {unreachable.length === 1 ? "they" : "they"} won’t get it.</span>
        </div>
      ) : null}
    </Dialog>
  );
}
