"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";

type View = Schema<"SavedViewOut">;
/** What a view keeps of a list: the tab, the filters, the search and the order. */
export type ViewParams = { tab: string; filters: Record<string, string>; q: string; sort: string };

const sameFilters = (a: Record<string, string> = {}, b: Record<string, string> = {}) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => (a[key] ?? "") === (b[key] ?? ""));
};

/**
 * A person's saved views of a list, and the ones shared with the whole company. A view is in force while the list
 * shows exactly what it saved; changing anything leaves it.
 */
export function useSavedViews(resource: string, current: ViewParams) {
  const { me, notify } = useConsole();
  const client = useQueryClient();
  const key = [me.organization.id, "saved-views", resource];
  const query = useQuery({ queryKey: key, queryFn: () => unwrap(api.GET("/api/v1/saved-views", { params: { query: { resource } } })), staleTime: 60_000 });
  const views = query.data ?? [];
  const matches = (view: View) => {
    const saved = view.params as Partial<ViewParams>;
    return (saved.tab ?? "") === current.tab && (saved.q ?? "") === current.q && (saved.sort ?? "") === current.sort && sameFilters(saved.filters, current.filters);
  };
  const save = async (name: string, shared: boolean) => {
    await unwrap(api.POST("/api/v1/saved-views", { body: { resource, name, params: current, shared } }));
    await client.invalidateQueries({ queryKey: key });
    notify(`View “${name}” saved`);
  };
  const remove = async (view: View) => {
    try {
      await unwrap(api.DELETE("/api/v1/saved-views/{view_id}", { params: { path: { view_id: view.id } } }));
      await client.invalidateQueries({ queryKey: key });
      notify(`View “${view.name}” removed`);
    } catch (error) {
      notify(errorMessage(error), true);
    }
  };
  return { views, active: views.find(matches) ?? null, save, remove, mine: (view: View) => view.owner_user_id === me.user.id };
}

/** Names the list as it is now, to come back to it in one click. */
export function SaveViewDialog({ what, onSave, onClose }: { what: string; onSave: (name: string, shared: boolean) => Promise<void>; onClose: () => void }) {
  const { can } = useConsole();
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async () => {
    if (!name.trim()) return setProblem("Name the view");
    setPending(true);
    setProblem(null);
    try {
      await onSave(name.trim(), shared);
      onClose();
    } catch (error) {
      setProblem(errorMessage(error));
      setPending(false);
    }
  };
  return (
    <Dialog
      title="Save view"
      sub={`Keeps this tab, its filters, the search and the order: ${what}`}
      icon={I.loads}
      width={460}
      onClose={() => !pending && onClose()}
      footer={<><span className="sp"></span><button className="btn" onClick={onClose} disabled={pending}>Cancel</button><button className="btn pri" onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save view"}</button></>}
    >
      <Problem message={problem} />
      <label className="c g4">
        <span className="fs12 w5">Name</span>
        <input className="inp" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} placeholder="This week’s Dallas pickups" maxLength={80} aria-label="Name" autoFocus />
      </label>
      {can("organization.manage") ? (
        <label className="r g8 fs13">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Share with everyone in the company
        </label>
      ) : null}
    </Dialog>
  );
}
