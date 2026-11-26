"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/feedback/states";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { loadLabel, loadTone } from "@/features/fleet/labels";
import type { ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { formatStamp } from "@/lib/format/dates";
import { formatWholeMoney } from "@/lib/format/money";
import { formatNumber } from "@/lib/format/text";
import type { LoadListItem } from "./load-data";

export const COLUMNS = [
  { key: "unassigned", label: "Unassigned" },
  { key: "assigned", label: "Assigned" },
  { key: "in_transit", label: "In transit" },
  { key: "delivered", label: "Delivered" },
  { key: "completed", label: "Completed" },
] as const;
export type Column = (typeof COLUMNS)[number]["key"];

/** Which column a load sits in: the same rule the server applies to a move (backend rules.column_of). */
export function columnOf(l: Pick<LoadListItem, "status" | "assignment">): Column | null {
  const driver = !!l.assignment && l.assignment.status === "active";
  if (l.status === "cancelled") return null;
  if (l.status === "draft" || l.status === "planned" || (l.status === "on_hold" && !driver)) return "unassigned";
  if (l.status === "assigned" || l.status === "on_hold") return "assigned";
  if (["dispatched", "at_pickup", "in_transit", "at_delivery"].includes(l.status)) return "in_transit";
  if (l.status === "delivered" || l.status === "pod_review") return "delivered";
  return "completed";
}

/**
 * The loads as cards in five columns. Dropping a card in another column asks the server to make that move; when it
 * can't (no driver, no going back once moving, no POD), the toast says why, and a load without a driver opens the
 * assign panel.
 */
export function LoadsBoard({ params, open }: { params: ListQuery; open: (id: string) => void }) {
  const { me, fin, set, notify } = useConsole();
  const zone = me.organization.timezone;
  const loads = useQuery({
    queryKey: [me.organization.id, "loads", "board", params],
    queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { ...params, sort: "pickup_at", limit: 100, count: true } as never } })),
  });
  const [drag, setDrag] = useState<{ l: LoadListItem; x0: number; y0: number; moving: boolean } | null>(null);
  const [over, setOver] = useState<Column | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const move = async (l: LoadListItem, to: Column) => {
    if (columnOf(l) === to) return;
    setBusy(l.id);
    try {
      await unwrap(api.POST("/api/v1/loads/{load_id}/board-move", { params: { path: { load_id: l.id } }, body: { version: l.version, column: to } }));
      await loads.refetch();
      notify(`${l.load_number} moved to ${COLUMNS.find((c) => c.key === to)!.label}`);
    } catch (error) {
      const assign = error instanceof ApiError && (error.details as { needs_assign?: boolean } | undefined)?.needs_assign;
      if (assign) {
        notify(errorMessage(error), true, { action: { label: "Assign driver", run: () => set({ ...goTo("dispatch"), panel: "assign", assignLoad: l.id }) } });
      } else notify(errorMessage(error), true);
    } finally {
      setBusy(null);
    }
  };

  // Pointer events, so a mouse, a pen and a finger all drag the same way.
  useEffect(() => {
    if (!drag) return;
    const columnAt = (x: number, y: number) => ((document.elementFromPoint(x, y)?.closest("[data-col]") as HTMLElement | null)?.dataset.col ?? null) as Column | null;
    const moveP = (e: PointerEvent) => {
      const moving = drag.moving || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6;
      if (moving !== drag.moving) setDrag({ ...drag, moving });
      if (moving) setOver(columnAt(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => {
      const to = drag.moving ? columnAt(e.clientX, e.clientY) : null;
      const l = drag.l;
      setTimeout(() => setDrag(null), 0);
      setOver(null);
      if (to) void move(l, to);
    };
    const cancel = () => { setDrag(null); setOver(null); };
    window.addEventListener("pointermove", moveP);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => { window.removeEventListener("pointermove", moveP); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); };
  });

  if (loads.isPending) return <div className="card" style={{ margin: "0 24px 24px" }}><Skeleton /></div>;
  if (loads.isError) return <div className="card" style={{ margin: "0 24px 24px", padding: "16px" }}>{errorMessage(loads.error)}</div>;
  const fetched = loads.data.items;
  const items = fetched.filter((l) => l.status !== "cancelled");
  const total = loads.data.page.total_count ?? fetched.length;
  const by = new Map<Column, LoadListItem[]>(COLUMNS.map((c) => [c.key, []]));
  for (const l of items) {
    const c = columnOf(l);
    if (c) by.get(c)!.push(l);
  }

  return (
    <div className="c g8" style={{ flex: 1, minHeight: 0, margin: "0 24px 24px" }}>
      {total > fetched.length ? <p className="fs12 mu">{`Showing the first ${formatNumber(fetched.length)} of ${formatNumber(total)} loads by pickup time · filter to narrow the board`}</p> : null}
      <div className="ldb" role="list" aria-label="Loads board">
        {COLUMNS.map((c) => {
          const list = by.get(c.key)!;
          return (
            <section key={c.key} className={clsx("ldb-col", over === c.key && "over")} data-col={c.key} aria-label={`${c.label}, ${list.length}`} role="listitem">
              <header className="r g6 ldb-h">
                <span className="w6 fs13">{c.label}</span>
                <span className="tcnt"><span>{list.length}</span></span>
              </header>
              <div className="c g6 ldb-cards">
                {list.map((l) => {
                  const risk = l.risks[0];
                  return (
                    <button key={l.id} type="button" className={clsx("ldb-card", drag?.moving && drag.l.id === l.id && "dragging", busy === l.id && "busy")}
                      onPointerDown={(e) => { if (e.button !== 0) return; setDrag({ l, x0: e.clientX, y0: e.clientY, moving: false }); }}
                      onClick={(e) => { if (drag?.moving) { e.preventDefault(); return; } open(l.id); }}
                      onKeyDown={(e) => {
                        // Keyboard: [ and ] move a card one column left or right.
                        const at = COLUMNS.findIndex((x) => x.key === columnOf(l));
                        if (e.key === "]" && at < COLUMNS.length - 1) { e.preventDefault(); void move(l, COLUMNS[at + 1]!.key); }
                        if (e.key === "[" && at > 0) { e.preventDefault(); void move(l, COLUMNS[at - 1]!.key); }
                      }}
                      aria-label={`${l.load_number}, ${loadLabel(l.status)}, ${l.customer.name}, ${l.origin_city ?? ""} to ${l.destination_city ?? ""}. Open, or drag to another column. [ and ] move it.`}>
                      <span className="r g6">
                        <span className="mono fs12 w6">{l.load_number}</span>
                        <span className="tag" data-k={loadTone(l.status)}>{loadLabel(l.status)}</span>
                        <span className="sp"></span>
                        {fin && l.revenue ? <span className="fs12 num t2">{formatWholeMoney(l.revenue, l.currency)}</span> : null}
                      </span>
                      <span className="fs12 t2 ell">{l.customer.name}</span>
                      <span className="fs12 ell">{`${l.origin_city ?? "—"} → ${l.destination_city ?? "—"}`}</span>
                      <span className="fs11 mu ell">{[l.pickup_at ? formatStamp(l.pickup_at, zone) : "No pickup time", l.assignment?.driver.name ?? "No driver"].join(" · ")}</span>
                      {risk ? <span className="tag" data-k={risk.code === "UNASSIGNED_SOON" ? "warn" : "bad"} title={risk.reason}>{risk.label || risk.message}</span> : null}
                    </button>
                  );
                })}
                {!list.length ? <p className="fs12 mu" style={{ padding: "8px 4px" }}>No loads here</p> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
