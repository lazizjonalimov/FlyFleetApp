"use client";

import { EmptyState } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";

/** Messages with drivers and customers. Messaging isn't available yet, so there are no conversations. */
export function MessagesScreen() {
  return (
    <div className="msg3" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
      <section className="mconv" style={{ borderRight: "none" }}>
        <div className="r g8" style={{ padding: "16px 16px 10px" }}>
          <h1 className="h1" style={{ fontSize: "18px", lineHeight: "24px" }}>Messages</h1>
          <span className="sp"></span>
          <button className="btn sm icon" aria-label="New message" disabled title="Messaging isn’t available yet"><Icon className="s14" d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></button>
        </div>
        <div style={{ flex: "1", minHeight: "0", display: "grid", placeItems: "center", borderTop: "1px solid var(--bd2)" }}>
          <EmptyState icon="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" title="No conversations yet" text="Messaging with drivers and customers isn’t available yet. Notes on a load are the place for anything the team needs to know." />
        </div>
      </section>
    </div>
  );
}
