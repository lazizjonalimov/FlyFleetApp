"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import type { ListQuery } from "@/features/lists/use-list";
import { api, unwrap } from "@/lib/api/client";
import { formatNumber } from "@/lib/format/text";

/** Multi-select filters: the chosen values of each, comma-joined in the list's filter state. */
export const MULTI = [
  { key: "status", label: "Status", param: "status", facet: "status" },
  { key: "customer", label: "Customer", param: "customer_ids", facet: "customer" },
  { key: "risk", label: "Risk", param: "risks", facet: "risk" },
  { key: "equipment", label: "Equipment", param: "equipment_types", facet: "equipment" },
  { key: "driver", label: "Driver", param: "driver_ids", facet: "driver" },
] as const;
export const valuesOf = (raw: string | undefined) => (raw ? raw.split(",").filter(Boolean) : []);

type Single = { key: string; label: string; options: { value: string; label: string }[] };

/**
 * The filter chips above the loads table. Pickup date picks one range; the others pick several values, each with
 * how many loads it would show given the other filters, counted by the API.
 */
export function LoadFilters({ params, single, clearAll, preset }: { params: ListQuery; single: Single; clearAll: () => void; preset?: { l: string; clear: () => void } }) {
  const { me, state, set } = useConsole();
  const picked = (state.lf && typeof state.lf === "object" ? state.lf : {}) as Record<string, string>;
  const [open, setOpen] = useState<string | null>(null);
  const [needle, setNeedle] = useState("");
  const facets = useQuery({
    queryKey: [me.organization.id, "loads", "facets", params],
    queryFn: () => unwrap(api.GET("/api/v1/loads/facets", { params: { query: params as never } })),
    staleTime: 15_000,
  });
  const put = (key: string, value: string | null) => {
    const next = { ...picked };
    if (value) next[key] = value;
    else delete next[key];
    set({ lf: next, lpage: [], lsel: [] });
  };
  const toggle = (key: string, value: string) => {
    const cur = valuesOf(picked[key]);
    put(key, (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]).join(","));
  };
  const close = () => {
    setOpen(null);
    setNeedle("");
  };
  const any = Object.keys(picked).length > 0;
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); setNeedle(""); } };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  const chosenSingle = single.options.find((o) => o.value === picked[single.key]);

  const bare = { background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" } as const;
  /** A chosen filter: its values open the menu again, and × takes it off. */
  const chosen = (label: string, toggle: () => void, expanded: boolean, go: () => void, aria: string) => (
    <span className="chip" style={{ gap: "6px" }}>
      <button style={bare} onClick={toggle} aria-haspopup="listbox" aria-expanded={expanded} aria-label={aria}><span>{label}</span><Icon className="s12" d="M6 9l6 6 6-6" /></button>
      <button style={bare} onClick={go} aria-label={`Remove filter ${label}`}><Icon className="s12 b" d="M18 6L6 18M6 6l12 12" /></button>
    </span>
  );
  return (
    <>
      {preset ? (
        <button className="chip" onClick={preset.clear} aria-label={`Remove filter ${preset.l}`}>
          <span>{preset.l}</span>
          <Icon className="s12 b" d="M18 6L6 18M6 6l12 12" />
        </button>
      ) : null}
      <div className="dd">
        {chosenSingle ? chosen(`${single.label}: ${chosenSingle.label}`, () => setOpen(open === single.key ? null : single.key), open === single.key, () => put(single.key, null), `Filter by ${single.label.toLowerCase()}: ${chosenSingle.label}`) : (
          <button className="chip add" onClick={() => setOpen(open === single.key ? null : single.key)} aria-haspopup="listbox" aria-expanded={open === single.key} aria-label={`Filter by ${single.label.toLowerCase()}`}>
            <span>{single.label}</span>
            <Icon className="s12" d="M6 9l6 6 6-6" />
          </button>
        )}
        {open === single.key ? (
          <>
            <div className="ddcatch" onClick={close}></div>
            <div className="ddl" style={{ width: "200px" }} role="listbox" aria-label={single.label}>
              <button className={clsx("ddi", !chosenSingle && "on")} role="option" aria-selected={!chosenSingle} onClick={() => { put(single.key, null); close(); }}>All dates</button>
              {single.options.map((o) => (
                <button key={o.value} className={clsx("ddi", picked[single.key] === o.value && "on")} role="option" aria-selected={picked[single.key] === o.value} onClick={() => { put(single.key, o.value); close(); }}>{o.label}</button>
              ))}
            </div>
          </>
        ) : null}
      </div>
      {MULTI.map((f) => {
        const cur = valuesOf(picked[f.key]);
        const options = (facets.data?.[f.facet] ?? []).filter((o) => o.value !== "");
        const label = (v: string) => options.find((o) => o.value === v)?.label ?? (v || "No driver");
        const shown = options.filter((o) => !needle || o.label.toLowerCase().includes(needle.toLowerCase()));
        return (
          <div key={f.key} className="dd">
            {cur.length ? chosen(`${f.label}: ${label(cur[0]!)}${cur.length > 1 ? ` +${cur.length - 1}` : ""}`, () => (open === f.key ? close() : (setNeedle(""), setOpen(f.key))), open === f.key, () => put(f.key, null), `Filter by ${f.label.toLowerCase()}: ${cur.length} chosen`) : (
              <button className="chip add" onClick={() => (open === f.key ? close() : (setNeedle(""), setOpen(f.key)))} aria-haspopup="listbox" aria-expanded={open === f.key} aria-label={`Filter by ${f.label.toLowerCase()}`}>
                <Icon className="s12 b" d="M12 5v14M5 12h14" />
                <span>{f.label}</span>
              </button>
            )}
            {open === f.key ? (
              <>
                <div className="ddcatch" onClick={close}></div>
                <div className="ddl" style={{ width: "260px" }}>
                  {options.length > 8 ? (
                    <label className="dds">
                      <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
                      <input autoFocus value={needle} placeholder={`Search ${f.label.toLowerCase()}`} aria-label={`Search ${f.label.toLowerCase()}`} onChange={(e) => setNeedle(e.target.value)} />
                    </label>
                  ) : null}
                  <div className="ddh">{facets.isPending ? "Counting…" : options.length ? `${f.label} in these loads` : `No ${f.label.toLowerCase()} values yet`}</div>
                  <div className="ddo" role="listbox" aria-multiselectable="true" aria-label={f.label}>
                    {shown.map((o) => {
                      const on = cur.includes(o.value);
                      return (
                        <button key={o.value || "none"} className={clsx("ddi", on && "on")} role="option" aria-selected={on} onClick={() => toggle(f.key, o.value)}>
                          <span className={clsx("chk", on && "on")} aria-hidden="true">{on ? <Icon className="s12 b" d="M5 12l5 5 9-10" /> : null}</span>
                          <span className="f1 ell"><span>{o.label}</span></span>
                          <span className="fs12 mu num">{formatNumber(o.count)}</span>
                        </button>
                      );
                    })}
                  </div>
                  {cur.length ? (
                    <div className="r" style={{ padding: "6px 8px", borderTop: "1px solid var(--bd)" }}>
                      <button className="lnk fs12" onClick={() => { put(f.key, null); close(); }}>{`Clear ${f.label.toLowerCase()}`}</button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        );
      })}
      {any ? <button className="lnk" style={{ color: "var(--mu)", padding: "0 4px" }} onClick={clearAll}>Clear all</button> : null}
    </>
  );
}

