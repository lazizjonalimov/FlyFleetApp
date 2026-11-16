"use client";

import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { cell as cells } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import type { Cell, ListView, Row } from "@/features/console/view";
import { useDebounced } from "@/hooks/use-debounced";
import type { PageInfo } from "@/lib/api/types";
import { formatNumber } from "@/lib/format/text";

const SORT_UP = "M12 19V5M6 11l6-6 6 6";
const SORT_DOWN = "M12 5v14M6 13l6 6 6-6";
export const PAGE_SIZE = 25;
const noop = () => {};

export type ListPage<Item> = { items: Item[]; page: PageInfo };
export type ListQuery = Record<string, string | number | boolean | undefined>;

export type Column<Item> = {
  label: string;
  /** Grid track: a width, or minmax() for the columns that take up the slack. */
  width: string;
  right?: boolean;
  /** The API's sort key for this column, when the list can be sorted by it. */
  sort?: string;
  cell: (item: Item) => Cell;
};

export type Tab = { label: string; params?: ListQuery };

export type EmptyState = { icon: string; title: string; text: string; action?: { label: string; go: () => void } };

export type ListSpec<Item extends { id: string }> = {
  /** Names the list in the query cache. */
  key: string;
  group: string;
  title: string;
  /** The line under the title. `total` is how many records there are in all, once known. */
  sub: (total: number | null) => string;
  placeholder: string;
  /** Fetches a page: the API does the filtering, sorting and paging. */
  fetch: (query: ListQuery) => Promise<ListPage<Item>>;
  /** Whether the signed-in role may read this list at all. */
  enabled?: boolean;
  defaultSort: string;
  tabs?: Tab[];
  columns: Column<Item>[];
  /** Wide tables scroll sideways with this many leading columns frozen. */
  frozen?: 1 | 2;
  open?: (item: Item) => void;
  rowClass?: (item: Item) => string;
  /** Selection with these bulk actions. */
  bulk?: string[];
  actions: ListView["actions"];
  kpis?: ListView["kpis"];
  band?: ListView["band"];
  callout?: ListView["callout"];
  /** Filters the design offers to add. */
  adds?: string[];
  hidden?: string;
  empty: EmptyState;
};

export type ListStatus = "loading" | "error" | "empty" | "filtered" | "ready";

export type ListResult = {
  L: ListView;
  status: ListStatus;
  error: unknown;
  retry: () => void;
  empty: EmptyState;
  clearFilters: () => void;
  pager: { page: number; previous: (() => void) | null; next: (() => void) | null };
};

/**
 * A list screen's view from a page of API records: tabs with their counts, search, sortable headings,
 * selection and paging. Tab, search text, sort and selection are interface state, so they survive opening a
 * record and coming back.
 */
export function useList<Item extends { id: string }>(spec: ListSpec<Item>): ListResult {
  const { me, state, set } = useConsole();
  const tabs = spec.tabs ?? [];
  const tabIndex = Math.min(typeof state.ltab === "number" ? state.ltab : 0, Math.max(0, tabs.length - 1));
  const tab = tabs[tabIndex];
  const text = typeof state.lq === "string" ? state.lq : "";
  const q = useDebounced(text.trim(), 250);
  const sort = typeof state.lsort === "string" && state.lsort ? state.lsort : spec.defaultSort;
  const trail = Array.isArray(state.lpage) ? (state.lpage as string[]) : [];
  const cursor = trail.at(-1);
  const selected = Array.isArray(state.lsel) ? (state.lsel as string[]) : [];
  const enabled = spec.enabled !== false;

  const filters: ListQuery = { ...tab?.params, ...(q ? { q } : {}) };
  const query = useQuery({
    queryKey: [me.organization.id, spec.key, "list", filters, sort, cursor ?? null],
    queryFn: () => spec.fetch({ ...filters, sort, cursor, limit: PAGE_SIZE, count: true }),
    placeholderData: keepPreviousData,
    enabled,
  });
  // every tab shows how many records it holds, whichever one is open
  const counts = useQueries({
    queries: tabs.map((each) => ({
      queryKey: [me.organization.id, spec.key, "count", each.params ?? {}],
      queryFn: () => spec.fetch({ ...each.params, limit: 1, count: true }),
      staleTime: 30_000,
      enabled,
    })),
  });
  const allCount = tabs.length ? null : (query.data?.page.total_count ?? null);
  const totalOf = (index: number) => counts[index]?.data?.page.total_count ?? null;
  // the list's size is the widest tab's, or the list's own when it has no tabs
  const total = tabs.length ? tabs.reduce<number | null>((most, _, index) => (totalOf(index) === null ? most : Math.max(most ?? 0, totalOf(index)!)), null) : allCount;

  const items = query.data?.items ?? [];
  const keys = items.map((item) => item.id);
  const picked = keys.filter((key) => selected.includes(key));
  const direction = sort.startsWith("-") ? -1 : 1;
  const sortKey = sort.replace(/^-/, "");
  const restart = { lpage: [], lsel: [] };

  const rows: Row[] = items.map((item) => {
    const on = selected.includes(item.id);
    const row: Cell[] = spec.columns.map((column) => column.cell(item));
    if (spec.bulk) row.unshift(cells.check(on, () => set({ lsel: on ? selected.filter((key) => key !== item.id) : [...selected, item.id] })));
    const open = spec.open;
    return { key: item.id, cls: [spec.rowClass?.(item), on ? "sel" : ""].filter(Boolean).join(" "), cells: row, open: open ? () => open(item) : noop };
  });

  const matching = query.data?.page.total_count ?? null;
  const first = trail.length * PAGE_SIZE + 1;
  const foot = !items.length ? "" : matching === null ? `Showing ${formatNumber(first)}–${formatNumber(first + items.length - 1)}` : `Showing ${formatNumber(first)}–${formatNumber(first + items.length - 1)} of ${formatNumber(matching)}`;

  const L: ListView = {
    group: spec.group,
    title: spec.title,
    sub: spec.sub(total),
    ph: spec.placeholder,
    actions: spec.actions,
    tabs: tabs.length ? tabs.map((each, index) => ({ l: each.label, n: totalOf(index) === null ? "" : formatNumber(totalOf(index)), on: index === tabIndex ? "on" : "", go: () => set({ ltab: index, ...restart }) })) : null,
    kpis: spec.kpis ?? null,
    kpiN: spec.kpis?.length ?? 0,
    band: spec.band ?? null,
    callout: spec.callout ?? null,
    chips: [],
    adds: spec.adds ?? [],
    hidden: spec.hidden ?? "",
    cols: (spec.bulk ? "16px " : "") + spec.columns.map((column) => column.width).join(" "),
    head: spec.columns.map((column) => {
      const al = column.right ? "rt" : "";
      if (!column.sort) return { l: column.label, al, nogo: true };
      const on = sortKey === column.sort;
      const key = column.sort;
      return {
        l: column.label,
        al,
        srt: true,
        son: on ? "on" : "",
        sic: on && direction < 0 ? SORT_DOWN : SORT_UP,
        aria: `Sort by ${column.label}${on ? (direction > 0 ? ", sorted ascending" : ", sorted descending") : ""}`,
        go: () => set({ lsort: on && direction > 0 ? `-${key}` : key, ...restart }),
      };
    }),
    rows,
    foot: foot + (foot && spec.frozen ? " · scroll sideways for more columns" : ""),
    tsc: "tscroll" + (spec.frozen ? ` on fz${spec.frozen}` : ""),
    qv: text,
    setQ: (event) => set({ lq: (event as { target?: { value?: string } } | undefined)?.target?.value ?? "", ...restart }),
    selectable: !!spec.bulk,
    allOn: picked.length ? "on" : "",
    allAll: picked.length > 0 && picked.length === keys.length,
    allSome: picked.length > 0 && picked.length < keys.length,
    allAria: picked.length === keys.length && keys.length > 0 ? "Clear selection" : "Select all on this page",
    toggleAll: () => set({ lsel: picked.length === keys.length ? [] : keys }),
    bulk: picked.length > 0,
    selN: String(picked.length),
    bulkActs: spec.bulk,
    clearSel: () => set({ lsel: [] }),
  };

  const filtered = q !== "" || tabIndex !== 0;
  const status: ListStatus = !enabled ? "empty" : query.isPending ? "loading" : query.isError ? "error" : items.length ? "ready" : filtered ? "filtered" : "empty";
  const next = query.data?.page.has_more ? query.data.page.next_cursor : null;

  return {
    L,
    status,
    error: query.error,
    retry: () => void query.refetch(),
    empty: spec.empty,
    clearFilters: () => set({ lq: "", ltab: 0, ...restart }),
    pager: {
      page: trail.length + 1,
      previous: trail.length ? () => set({ lpage: trail.slice(0, -1), lsel: [] }) : null,
      next: next ? () => set({ lpage: [...trail, next], lsel: [] }) : null,
    },
  };
}
