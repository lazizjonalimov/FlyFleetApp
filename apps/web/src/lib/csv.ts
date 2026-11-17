// CSV files the browser saves: quoted where a value needs it, UTF-8 with a byte-order mark so spreadsheets
// open names with accents correctly.

export type CsvValue = string | number | null | undefined;

export function csvText(header: string[], rows: CsvValue[][]): string {
  const esc = (v: CsvValue) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

/** Saves rows as a CSV file the browser downloads. */
export function downloadCsv(filename: string, header: string[], rows: CsvValue[][]): void {
  const url = URL.createObjectURL(new Blob(["﻿", csvText(header, rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
