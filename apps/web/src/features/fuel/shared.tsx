"use client";

import { clsx } from "clsx";
import { Fragment } from "react";
import { BasicCell } from "@/components/data-table/cells";
import type { Cell } from "@/features/console/view";
import { formatMoney } from "@/lib/format/money";
import { US_STATES } from "@/lib/reference/states";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The IFTA quarter a day is in, written as the API writes it: 2026Q4. */
export const quarterOf = (day: string) => `${day.slice(0, 4)}Q${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`;
export const quarterLabel = (q: string) => `Q${q.slice(5)} ${q.slice(0, 4)}`;
export const previousQuarter = (q: string) => (q.endsWith("Q1") ? `${Number(q.slice(0, 4)) - 1}Q4` : `${q.slice(0, 5)}${Number(q.slice(5)) - 1}`);
/** "Nov 13" from 2026-11-13. */
export const short = (day: string | null | undefined) => (day ? `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}` : "—");
export const stateName = (code: string | null | undefined) => (code ? US_STATES.find(([c]) => c === code)?.[1] ?? code : "");
/** Money, with a credit (a negative amount) in brackets as a return shows it. */
export const credit = (value: string | number | null | undefined, currency = "USD") => {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return n < 0 ? `(${formatMoney(String(-n), currency)})` : formatMoney(value, currency);
};
export const whole = (value: string | number | null | undefined) => (value === null || value === undefined || value === "" ? "—" : Math.round(Number(value)).toLocaleString("en-US"));
export const signed = (value: string | number) => {
  const n = Math.round(Number(value));
  return n < 0 ? `−${Math.abs(n).toLocaleString("en-US")}` : n.toLocaleString("en-US");
};

export type TRow = { key: string; cls?: string; open?: () => void; cells: Cell[] };

/** A table in the console's grid style: fixed columns, a header row, and rows that may open something. */
export function Table({ cols, head, rows, label }: { cols: string; head: { l: string; al: string }[]; rows: TRow[]; label: string }) {
  return (
    <div role="table" aria-label={label}>
      <div className="thead" role="row" style={{ gridTemplateColumns: cols }}>
        {head.map((h) => (
          <span key={h.l} role="columnheader" className={h.al}><span>{h.l}</span></span>
        ))}
      </div>
      <div className="tbody">
        {rows.map((r) => (
          <Fragment key={r.key}>
            <div className={clsx("trow", r.cls)} role="row" style={{ gridTemplateColumns: cols, cursor: r.open ? "pointer" : "default" }} onClick={r.open}>
              {r.cells.map((c, i) => (
                <BasicCell key={i} c={c} />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
