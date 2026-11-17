"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { useConsole } from "@/features/console/console-provider";
import { api, unwrap } from "@/lib/api/client";
import type { Schema } from "@/lib/api/types";

export type Facility = Schema<"FacilityOption">;

/**
 * A stop's facility: type a name, or pick one of the customers' saved facilities or a place a load already went,
 * which fills in the address too.
 */
export function FacilityField({ id, value, invalid, onChange, onPick }: { id: string; value: string; invalid?: boolean; onChange: (text: string) => void; onPick: (facility: Facility) => void }) {
  const { me } = useConsole();
  const [open, setOpen] = useState(false);
  const q = value.trim();
  const found = useQuery({
    queryKey: [me.organization.id, "facilities", q],
    queryFn: () => unwrap(api.GET("/api/v1/facilities", { params: { query: { q, limit: 8 } } })),
    enabled: open,
    staleTime: 30_000,
  });
  const options = found.data ?? [];
  const shown = open && options.length > 0;
  return (
    <div className="dd" style={{ width: "100%" }}>
      <input
        id={id}
        className={clsx("inp", invalid && "err")}
        value={value}
        placeholder="Search saved facilities, or type a name"
        autoComplete="off"
        role="combobox"
        aria-expanded={shown}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      {shown ? (
        <div className="ddl" id={`${id}-list`} role="listbox" aria-label="Facilities" style={{ width: "100%", maxHeight: "280px", overflow: "auto" }}>
          {options.map((option) => (
            <button key={`${option.label}-${option.city}-${option.source}`} className="ddi" role="option" aria-selected="false" style={{ height: "auto", padding: "6px 8px", alignItems: "flex-start" }}
              onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(option); setOpen(false); }}>
              <span className="f1 c" style={{ alignItems: "flex-start", minWidth: 0 }}>
                <span className="fs13 w5 ell" style={{ maxWidth: "100%" }}>{option.label}</span>
                <span className="fs12 mu ell" style={{ maxWidth: "100%" }}>{[option.address, [option.city, option.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="fs11 mu nw">{option.source === "saved" ? `Saved · ${option.customer}` : "Used before"}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
