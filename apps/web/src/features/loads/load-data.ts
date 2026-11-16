"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useConsole } from "@/features/console/console-provider";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";
import { fromLocalInput } from "@/lib/format/dates";

export type LoadListItem = Schema<"LoadListItem">;
export type LoadDetail = Schema<"LoadDetail">;
export type Stop = Schema<"StopOut">;
export type Action = Schema<"TransitionIn">["action"];

export const loadKey = (organization: string, id: string) => [organization, "loads", "detail", id];

/** One load with its stops, charges, notes, history and what may happen to it next. */
export function useLoad(id: string | null | undefined) {
  const { me } = useConsole();
  return useQuery({ queryKey: loadKey(me.organization.id, id ?? ""), queryFn: () => unwrap(api.GET("/api/v1/loads/{load_id}", { params: { path: { load_id: id! } } })), enabled: !!id });
}

/** The documents attached to a load. */
export function useLoadDocuments(id: string | null | undefined) {
  const { me, can } = useConsole();
  return useQuery({
    queryKey: [me.organization.id, "documents", "load", id ?? ""],
    queryFn: () => unwrap(api.GET("/api/v1/documents", { params: { query: { entity_type: "load", entity_id: id!, limit: 100 } } })),
    enabled: !!id && can("documents.read"),
  });
}

/** The stop the truck is at, or heading to next: the first one it hasn't left. */
export function currentStop(load: LoadDetail): { stop: Stop; index: number } | null {
  const index = load.stops.findIndex((stop) => !stop.departed_at);
  return index >= 0 ? { stop: load.stops[index]!, index } : null;
}

/** What each lifecycle action is called on a control, and what it asks before it runs. */
export const ACTIONS: Record<string, { label: string; verb: string; reason?: "required" | "optional"; destructive?: boolean; text?: string }> = {
  mark_ready: { label: "Mark ready", verb: "marked ready" },
  dispatch: { label: "Dispatch", verb: "dispatched", text: "The driver sees the load from this moment. Eligibility is checked again now." },
  arrive: { label: "Arrived", verb: "updated" },
  depart: { label: "Departed", verb: "updated" },
  approve_pod: { label: "Approve POD", verb: "completed", text: "The load is completed and can be invoiced." },
  reject_pod: { label: "Reject POD", verb: "sent back", reason: "required", destructive: true, text: "The load goes back to waiting for a proof of delivery." },
  hold: { label: "Put on hold", verb: "put on hold", reason: "required", text: "A held load keeps its driver and equipment." },
  release: { label: "Release hold", verb: "released" },
  cancel: { label: "Cancel load", verb: "cancelled", reason: "required", destructive: true, text: "The driver and equipment are freed. A cancelled load can’t be reopened." },
};

/**
 * Changes to a load. Every load endpoint answers with the whole load, so the screen shows the server's result
 * at once; everything else loaded for the company is then checked again. A refusal is thrown for the caller
 * to show where the person is looking.
 */
export function useLoadChanges() {
  const { me } = useConsole();
  const client = useQueryClient();
  const organization = me.organization.id;
  const zone = me.organization.timezone;

  const settle = useCallback(
    async (load: LoadDetail) => {
      client.setQueryData(loadKey(organization, load.id), load);
      await client.invalidateQueries({ queryKey: [organization], predicate: (query) => query.queryKey.join("/") !== loadKey(organization, load.id).join("/") });
      return load;
    },
    [client, organization],
  );

  const transition = useCallback(
    async (load: LoadDetail, action: Action, answer: { reason?: string; when?: string } = {}) => {
      const stop = action === "arrive" || action === "depart" ? currentStop(load)?.stop : undefined;
      const body = { action, version: load.version, reason: answer.reason || undefined, stop_id: stop?.id, occurred_at: answer.when ? fromLocalInput(answer.when, zone) : undefined };
      return settle(await unwrap(api.POST("/api/v1/loads/{load_id}/transitions", { params: { path: { load_id: load.id } }, body })));
    },
    [settle, zone],
  );

  const unassign = useCallback(
    async (load: LoadDetail, reason: string) =>
      settle(await unwrap(api.POST("/api/v1/dispatch/assignments/{assignment_id}/release", { params: { path: { assignment_id: load.assignment!.id } }, body: { version: load.version, reason: reason || null } }))),
    [settle],
  );

  const addNote = useCallback(async (load: LoadDetail, body: string) => settle(await unwrap(api.POST("/api/v1/loads/{load_id}/notes", { params: { path: { load_id: load.id } }, body: { body } }))), [settle]);

  return { transition, unassign, addNote, settle };
}
