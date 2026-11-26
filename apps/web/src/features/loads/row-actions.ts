"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useConsole } from "@/features/console/console-provider";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { toLocalInput } from "@/lib/format/dates";
import type { LoadDetail, LoadListItem } from "./load-data";
import { WEEKDAYS } from "./load-money";

type Ref = Pick<LoadListItem, "id" | "load_number" | "version" | "pickup_at" | "status">;
const UNDO_MS = 7000;

/** Monday is 0, on the company's calendar. */
export const weekdayOf = (iso: string, zone: string) => (new Date(`${toLocalInput(iso, zone).slice(0, 10)}T12:00:00Z`).getUTCDay() + 6) % 7;

/**
 * What a load's ⋯ menu does, with an Undo on the toast for the changes that can be taken back: a duplicate is
 * cancelled again, a cancel is put back.
 */
export function useRowActions() {
  const { me, notify, set } = useConsole();
  const client = useQueryClient();
  const zone = me.organization.timezone;
  const refresh = () => client.invalidateQueries({ queryKey: [me.organization.id, "loads"] });
  const run = async <T,>(work: () => Promise<T>): Promise<T | null> => {
    try {
      const out = await work();
      await refresh();
      return out;
    } catch (error) {
      notify(errorMessage(error), true);
      return null;
    }
  };
  const transition = (id: string, version: number, action: "cancel", reason: string) =>
    unwrap(api.POST("/api/v1/loads/{load_id}/transitions", { params: { path: { load_id: id } }, body: { action, version, reason } }));

  const duplicate = async (load: Ref) => {
    const copy = await run(() => unwrap(api.POST("/api/v1/loads/{load_id}/duplicate", { params: { path: { load_id: load.id } } })));
    if (!copy) return;
    notify(`Draft ${copy.load_number} created from ${load.load_number}`, false, {
      ms: UNDO_MS,
      action: { label: "Undo", run: () => void run(() => transition(copy.id, copy.version, "cancel", "Duplicate undone")).then((done) => done && notify(`${copy.load_number} removed`)) },
    });
    set({ drawer: copy.id });
  };

  const repeat = async (load: Ref & { recurrence?: LoadDetail["recurrence"] }, repeating: boolean) => {
    if (!load.pickup_at && !repeating) return notify(`${load.load_number} needs a pickup date to repeat`, true);
    const day = load.pickup_at ? weekdayOf(load.pickup_at, zone) : 0;
    const year = new Date().getFullYear();
    const done = await run(() => unwrap(api.PATCH("/api/v1/loads/{load_id}", { params: { path: { load_id: load.id } }, body: { version: load.version, recurrence: repeating ? null : { days: [day], until: `${year}-12-31` } } })));
    if (done) notify(repeating ? `${load.load_number} no longer repeats` : `${load.load_number} will repeat every ${WEEKDAYS[day]} until Dec 31 · change it on the load`);
  };

  const copyLink = async (load: Ref) => {
    const detail = await run(() => unwrap(api.PUT("/api/v1/loads/{load_id}/tracking-link", { params: { path: { load_id: load.id } }, body: { enabled: true } })));
    const path = detail?.tracking_link?.url_path;
    if (!path) return;
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      notify(`Tracking link copied · ${url}`);
    } catch {
      notify(`Tracking link: ${url}`);
    }
  };

  const cancel = async (load: Ref, reason = "Cancelled from the loads list") => {
    const out = await run(() => transition(load.id, load.version, "cancel", reason));
    if (!out) return;
    notify(`${load.load_number} cancelled`, false, {
      ms: UNDO_MS,
      action: { label: "Undo", run: () => void run(() => unwrap(api.POST("/api/v1/loads/{load_id}/undo-cancel", { params: { path: { load_id: load.id } }, body: { version: out.version } }))).then((back) => back && notify(`${load.load_number} is back`)) },
    });
  };

  return { duplicate, repeat, copyLink, cancel, refresh };
}
