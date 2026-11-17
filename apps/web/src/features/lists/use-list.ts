"use client";

import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { cell as cells } from "@/components/data-table/cell";
import { useConsole } from "@/features/console/console-provider";
import type { Cell, FilterMenu, ListView, Row } from "@/features/console/view";
import { useDebounced } from "@/hooks/use-debounced";
import type { PageInfo } from "@/lib/api/types";
import { downloadCsv } from "@/lib/csv";
import { errorMessage } from "@/lib/api/errors";
import { formatNumber } from "@/lib/format/text";

const SORT_UP = "M12 19V5M6 11l6-6 6 6";
const SORT_DOWN = "M12 5v14M6 13l6 6 6-6";
export const PAGE_SIZE = 25;
/** Export stops here: a file larger than this belongs in a report. */
const EXPORT_LIMIT = 10_000;
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
  /** The value in an exported file, when the cell's text isn't it. */
  csv?: (item: Item) => string | number | null | undefined;
  /** Hidden until someone turns it on under Columns. */
  hidden?: boolean;
};

export type Tab = { label: string; params?: ListQuery };

/** A filter the list offers: its values come from the company's own records. */
export type Filter = {
  key: string;
  label: string;
  options: { value: string; label: string; count?: number }[];
  /** The API parameters for a value (default: `{ [key]: value }`). */
  params?: (value: string) => ListQuery;
};

/** A bulk action: what it does with the selected rows. "export" saves them as a CSV file. */
export type BulkAction<Item> = { label: string; go: (items: Item[]) => void | Promise<void> } | "export";

export type EmptyState = { icon: string; title: string; text: string; action?: { label: string; go: () => void } };

export type ListSpec<Item extends { id: string }> = {
  /** Names the list in the query cache, and its remembered columns. */
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
  bulk?: BulkAction<Item>[];
  actions: ListView["actions"];
  kpis?: ListView["kpis"];
  band?: ListView["band"];
  callout?: ListView["callout"];
  /** Filters the list offers to add. */
  filters?: Filter[];
  hidden?: string;
  empty: EmptyState;
  /** Rows shown first on the first page of the first tab with no search: e.g. the carrier's own fleet. */
  pinned?: Row[];
  /** What one record is called in messages ("truck"); defaults to the title. */
  noun?: string;
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

// Hidden columns are remembered per list on this device. Read through useSyncExternalStore so the first render
// on the server and in the browser agree, and every list on the page sees a change at once.
const COLUMNS_EVENT = "ff-columns";
const columnsKey = (key: string) => `ff.columns.${key}`;
function readColumns(key: string): string {
  try {
    return window.localStorage.getItem(columnsKey(key)) ?? "";
  } catch {
    return "";
  }
}
function writeColumns(key: string, value: string[] | null): void {
  try {
    if (value === null) window.localStorage.removeItem(columnsKey(key));
    else window.localStorage.setItem(columnsKey(key), JSON.stringify(value));
  } catch {
    // private windows and blocked storage: the choice lasts until the page is reloaded
  }
  window.dispatchEvent(new Event(COLUMNS_EVENT));
}
function subscribeColumns(change: () => void): () => void {
  window.addEventListener(COLUMNS_EVENT, change);
  window.addEventListener("storage", change);
  return () => {
    window.removeEventListener(COLUMNS_EVENT, change);
    window.removeEventListener("storage", change);
  };
}

/** The text of a cell as it reads on screen, for exported files. */
export function cellText(c: Cell): string {
  if (c.isTags) return (c.tags ?? []).map((t) => t.v).join(", ");
  if (c.isCh) return (c.ch ?? []).map((x) => x.t).join(", ");
  if (c.isChk || c.isMore || c.isActs) return "";
  const v = c.v === "—" ? "" : (c.v ?? "");
  return c.s && c.isTx ? [v, c.s].filter(Boolean).join(" · ") : v;
}

/**
 * A list screen's view from a page of API records: tabs with their counts, search, filters from the company's
 * own values, sortable headings, columns to show or hide, selection with bulk actions, export, and paging.
 * Tab, search text, filters, sort and selection are interface state, so they survive opening a record and
 * coming back.
 */
export function useList<Item extends { id: string }>(spec: ListSpec<Item>): ListResult {
  const { me, state, set, notify } = useConsole();
  const tabs = spec.tabs ?? [];
  const tabIndex = Math.min(typeof state.ltab === "number" ? state.ltab : 0, Math.max(0, tabs.length - 1));
  const tab = tabs[tabIndex];
  const text = typeof state.lq === "string" ? state.lq : "";
  const q = useDebounced(text.trim(), 250);
  const sort = typeof state.lsort === "string" && state.lsort ? state.lsort : spec.defaultSort;
  const trail = Array.isArray(state.lpage) ? (state.lpage as string[]) : [];
  const cursor = trail.at(-1);
  const selected = Array.isArray(state.lsel) ? (state.lsel as string[]) : [];
  const picked = (state.lf && typeof state.lf === "object" ? state.lf : {}) as Record<string, string>;
  const enabled = spec.enabled !== false;
  const [menu, setMenu] = useState<string | null>(null);
  const [menuQ, setMenuQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const stored = useSyncExternalStore(subscribeColumns, () => readColumns(spec.key), () => "");
  let hiddenColumns: string[];
  try {
    hiddenColumns = stored ? (JSON.parse(stored) as string[]) : spec.columns.filter((c) => c.hidden).map((c) => c.label);
  } catch {
    hiddenColumns = [];
  }

  const filterParams: ListQuery = {};
  for (const f of spec.filters ?? []) {
    const value = picked[f.key];
    if (value) Object.assign(filterParams, f.params ? f.params(value) : { [f.key]: value });
  }
  const filters: ListQuery = { ...tab?.params, ...filterParams, ...(q ? { q } : {}) };
  const query = useQuery({
    queryKey: [me.organization.id, spec.key, "list", filters, sort, cursor ?? null],
    queryFn: () => spec.fetch({ ...filters, sort, cursor, limit: PAGE_SIZE, count: true }),
    placeholderData: keepPreviousData,
    enabled,
  });
  // every tab shows how many records it holds under the filters in force, whichever tab is open
  const counts = useQueries({
    queries: tabs.map((each) => ({
      queryKey: [me.organization.id, spec.key, "count", each.params ?? {}, filterParams],
      queryFn: () => spec.fetch({ ...each.params, ...filterParams, limit: 1, count: true }),
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
  const pickedRows = keys.filter((key) => selected.includes(key));
  const direction = sort.startsWith("-") ? -1 : 1;
  const sortKey = sort.replace(/^-/, "");
  const restart = { lpage: [], lsel: [] };
  const columns = spec.columns.filter((column, index) => index === 0 || !hiddenColumns.includes(column.label));
  const noun = spec.noun ?? spec.title.toLowerCase();

  const pinned = !cursor && tabIndex === 0 && !q && !Object.keys(filterParams).length
    ? (spec.pinned ?? []).map((row) => ({ ...row, cells: spec.bulk ? [{ isTx: 1, v: "" } as Cell, ...row.cells] : row.cells }))
    : [];
  const itemRows: Row[] = items.map((item) => {
    const on = selected.includes(item.id);
    const row: Cell[] = columns.map((column) => column.cell(item));
    if (spec.bulk) row.unshift(cells.check(on, () => set({ lsel: on ? selected.filter((key) => key !== item.id) : [...selected, item.id] })));
    const open = spec.open;
    return { key: item.id, cls: [spec.rowClass?.(item), on ? "sel" : ""].filter(Boolean).join(" "), cells: row, open: open ? () => open(item) : noop };
  });
  const rows: Row[] = [...pinned, ...itemRows];

  const save = (list: Item[], name: string) => {
    const visible = columns.filter((c) => c.label);
    downloadCsv(`${name}.csv`, visible.map((c) => c.label), list.map((item) => visible.map((c) => (c.csv ? c.csv(item) : cellText(c.cell(item))))));
  };
  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: me.organization.timezone });
  const exportAll = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const all: Item[] = [];
      let next: string | undefined;
      do {
        const page = await spec.fetch({ ...filters, sort, cursor: next, limit: 100 });
        all.push(...page.items);
        next = page.page.has_more && page.page.next_cursor ? page.page.next_cursor : undefined;
      } while (next && all.length < EXPORT_LIMIT);
      save(all, `${spec.key}-${stamp}`);
      notify(`Exported ${formatNumber(all.length)} ${all.length === 1 ? noun.replace(/s$/, "") : noun}${next ? ` · the first ${formatNumber(EXPORT_LIMIT)}` : ""}`);
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      setExporting(false);
    }
  };

  // Paging: the API pages by cursor, so a page further on is reached by walking the pages before it.
  const matching = query.data?.page.total_count ?? null;
  const pageCount = matching === null ? trail.length + 1 + (query.data?.page.has_more ? 1 : 0) : Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const goPage = async (n: number) => {
    if (n === trail.length + 1) return;
    if (n <= trail.length) return set({ lpage: trail.slice(0, n - 1), lsel: [] });
    try {
      const cursors = [...trail];
      while (cursors.length < n - 1) {
        const page = await spec.fetch({ ...filters, sort, cursor: cursors.at(-1), limit: PAGE_SIZE });
        if (!page.page.has_more || !page.page.next_cursor) break;
        cursors.push(page.page.next_cursor);
      }
      set({ lpage: cursors, lsel: [] });
    } catch (error) {
      notify(errorMessage(error), true);
    }
  };
  const current = trail.length + 1;
  const windowStart = Math.max(1, Math.min(current - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, i) => windowStart + i).map((n) => ({ n, on: n === current, go: () => void goPage(n) }));

  const first = trail.length * PAGE_SIZE + 1;
  const foot = !items.length ? "" : matching === null ? `Showing ${formatNumber(first)}–${formatNumber(first + items.length - 1)}` : `Showing ${formatNumber(first)}–${formatNumber(first + items.length - 1)} of ${formatNumber(matching)}`;

  const closeMenus = () => {
    setMenu(null);
    setMenuQ("");
  };
  const setFilter = (key: string, value: string | null) => {
    const nextFilters = { ...picked };
    if (value) nextFilters[key] = value;
    else delete nextFilters[key];
    closeMenus();
    set({ lf: nextFilters, ...restart });
  };
  const chips = (spec.filters ?? [])
    .filter((f) => picked[f.key])
    .map((f) => ({ l: `${f.label}: ${f.options.find((o) => o.value === picked[f.key])?.label ?? picked[f.key]}`, clear: () => setFilter(f.key, null) }));
  const adds: FilterMenu[] = (spec.filters ?? [])
    .filter((f) => !picked[f.key])
    .map((f) => {
      const open = menu === `f:${f.key}`;
      const needle = open ? menuQ.trim().toLowerCase() : "";
      return {
        l: f.label,
        open,
        toggle: () => (open ? closeMenus() : (setMenuQ(""), setMenu(`f:${f.key}`))),
        q: open ? menuQ : "",
        setQ: (event) => setMenuQ((event as { currentTarget?: { value?: string } } | undefined)?.currentTarget?.value ?? ""),
        search: f.options.length > 8,
        head: f.options.length ? `${f.label} in your records` : `No ${f.label.toLowerCase()} values yet`,
        opts: f.options
          .filter((o) => !needle || o.label.toLowerCase().includes(needle))
          .map((o) => ({ l: o.label, n: o.count === undefined ? "" : formatNumber(o.count), go: () => setFilter(f.key, o.value) })),
      };
    });

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
    chips,
    adds,
    hidden: spec.hidden ?? "",
    cols: (spec.bulk ? "16px " : "") + columns.map((column) => column.width).join(" "),
    head: columns.map((column) => {
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
    allOn: pickedRows.length ? "on" : "",
    allAll: pickedRows.length > 0 && pickedRows.length === keys.length,
    allSome: pickedRows.length > 0 && pickedRows.length < keys.length,
    allAria: pickedRows.length === keys.length && keys.length > 0 ? "Clear selection" : "Select all on this page",
    toggleAll: () => set({ lsel: pickedRows.length === keys.length ? [] : keys }),
    bulk: pickedRows.length > 0,
    selN: String(pickedRows.length),
    bulkActs: (spec.bulk ?? []).map((action) => {
      const chosen = () => items.filter((item) => selected.includes(item.id));
      if (action === "export") {
        return { l: "Export", go: () => { const list = chosen(); save(list, `${spec.key}-selected-${stamp}`); notify(`Exported ${formatNumber(list.length)} selected`); } };
      }
      return { l: action.label, go: () => void action.go(chosen()) };
    }),
    clearSel: () => set({ lsel: [] }),
    columns: spec.columns.map((column, index) => {
      const on = index === 0 || !hiddenColumns.includes(column.label);
      return {
        l: column.label || "Actions",
        on,
        locked: index === 0,
        toggle: () => writeColumns(spec.key, on ? [...hiddenColumns, column.label] : hiddenColumns.filter((l) => l !== column.label)),
      };
    }),
    colsOpen: menu === "columns",
    toggleCols: () => (menu === "columns" ? closeMenus() : setMenu("columns")),
    closeMenus,
    exportAll: () => void exportAll(),
    exporting,
    pages,
  };

  const filtered = q !== "" || tabIndex !== 0 || Object.keys(filterParams).length > 0;
  const status: ListStatus = !enabled ? "empty" : query.isPending ? "loading" : query.isError ? "error" : items.length ? "ready" : filtered ? "filtered" : "empty";
  const next = query.data?.page.has_more ? query.data.page.next_cursor : null;

  return {
    L,
    status,
    error: query.error,
    retry: () => void query.refetch(),
    empty: spec.empty,
    clearFilters: () => set({ lq: "", ltab: 0, lf: {}, ...restart }),
    pager: {
      page: trail.length + 1,
      previous: trail.length ? () => set({ lpage: trail.slice(0, -1), lsel: [] }) : null,
      next: next ? () => set({ lpage: [...trail, next], lsel: [] }) : null,
    },
  };
}

/** Resets the column choices of a list to its defaults. */
export const resetColumns = (key: string) => writeColumns(key, null);
