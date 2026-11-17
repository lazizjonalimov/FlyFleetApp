"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cell } from "@/components/data-table/cell";
import { BasicCell } from "@/components/data-table/cells";
import { Problem } from "@/components/feedback/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { combo } from "@/components/forms/combo";
import { Combobox } from "@/components/forms/combobox";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { pickFile } from "@/features/documents/use-upload";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage, toApiError } from "@/lib/api/errors";
import { US_STATES } from "@/lib/reference/states";
import { previousQuarter, quarterLabel, Table, type TRow, whole } from "./shared";

const COLS = "minmax(0,1.2fr) 112px 96px 128px 128px minmax(0,1fr)";
const RATE = /^\d{0,1}(\.\d{1,4})?$/;

/** The quarter's diesel rates for each jurisdiction the trucks ran in, against last quarter's, entered by hand or
 * imported from the tax matrix. A return keeps the rates it was approved with. */
export function RatesTab({ quarter }: { quarter: string }) {
  const { me, can, notify } = useConsole();
  const client = useQueryClient();
  const org = me.organization;
  const manage = can("expenses.manage");
  const rates = useQuery({ queryKey: [org.id, "ifta", "rates", quarter], queryFn: () => unwrap(api.GET("/api/v1/ifta/rates", { params: { query: { quarter } } })) });
  const [find, setFind] = useState("");
  const [editing, setEditing] = useState<Record<string, { rate: string; surcharge: string }> | null>(null);
  const [adding, setAdding] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const label = quarterLabel(quarter);
  const before = quarterLabel(previousQuarter(quarter)).slice(0, 2);
  const list = rates.data ?? [];
  const shown = list.filter((r) => !find.trim() || `${r.name} ${r.jurisdiction}`.toLowerCase().includes(find.trim().toLowerCase()));
  const refresh = () => client.invalidateQueries({ queryKey: [org.id, "ifta"] });

  const importFile = async () => {
    const file = await pickFile(".csv,text/csv");
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      const form = new FormData();
      form.append("quarter", quarter);
      form.append("file", file);
      const sent = await fetch("/api/v1/ifta/rates/import", { method: "POST", body: form, credentials: "same-origin" });
      const body = await sent.json().catch(() => null);
      if (!sent.ok) throw toApiError(sent.status, body);
      await refresh();
      notify(`${label} rates imported from ${file.name}`);
    } catch (error) {
      setProblem(errorMessage(error));
    }
    setBusy(false);
  };
  const save = async () => {
    if (!editing) return;
    const rows = Object.entries(editing).filter(([, v]) => v.rate.trim());
    const bad = rows.find(([, v]) => !RATE.test(v.rate.trim().replace("$", "")) || (v.surcharge.trim() && !RATE.test(v.surcharge.trim().replace("$", ""))));
    if (bad) return setProblem(`The rate for ${bad[0]} should be dollars per gallon, like 0.2000`);
    if (!rows.length) return setProblem("Enter at least one rate");
    setBusy(true);
    setProblem(null);
    try {
      await unwrap(api.PUT("/api/v1/ifta/rates/{quarter}", { params: { path: { quarter } }, body: { rates: rows.map(([jurisdiction, v]) => ({ jurisdiction, rate: v.rate.trim().replace("$", ""), surcharge: v.surcharge.trim().replace("$", "") || "0" })) } }));
      await refresh();
      setEditing(null);
      notify(`${label} rates saved`);
    } catch (error) {
      setProblem(errorMessage(error));
    }
    setBusy(false);
  };
  const startEdit = () => setEditing(Object.fromEntries(list.map((r) => [r.jurisdiction, { rate: r.rate ?? "", surcharge: r.surcharge && Number(r.surcharge) ? r.surcharge : "" }])));
  const put = (code: string, patch: Partial<{ rate: string; surcharge: string }>) => setEditing((e) => ({ ...(e ?? {}), [code]: { rate: "", surcharge: "", ...(e?.[code] ?? {}), ...patch } }));

  const editRows = editing ? Object.keys(editing).map((code) => list.find((r) => r.jurisdiction === code) ?? { jurisdiction: code, name: US_STATES.find(([c]) => c === code)?.[1] ?? code, rate: null, surcharge: null, change: null, miles: "0", source: null, updated_at: null }) : [];
  const rows: TRow[] = (editing ? editRows : shown).map((r) => {
    const miles = Number(r.miles);
    const change = r.change === null ? (r.rate ? "New this quarter" : "—") : Number(r.change) === 0 ? "No change" : `${Number(r.change) > 0 ? "+" : "−"}$${Math.abs(Number(r.change)).toFixed(4)}`;
    if (editing) {
      const v = editing[r.jurisdiction] ?? { rate: "", surcharge: "" };
      return {
        key: r.jurisdiction,
        cells: [
          cell.text(r.name, r.jurisdiction, "w5"),
          { isTx: 1, v: "", s: "", cls: "", scls: "", al: "rt", edit: { value: v.rate, set: (x: string) => put(r.jurisdiction, { rate: x }), label: `Diesel rate for ${r.name}` } } as never,
          { isTx: 1, v: "", s: "", cls: "", scls: "", al: "rt", edit: { value: v.surcharge, set: (x: string) => put(r.jurisdiction, { surcharge: x }), label: `Surcharge for ${r.name}` } } as never,
          cell.text(change, "", "t3"),
          miles ? cell.num(whole(miles)) : { ...cell.text("—", "", "mu"), al: "rt" },
          miles ? cell.tags([{ v: `${quarter.slice(4)} estimate`, k: "info" }]) : cell.text("Not driven this quarter", "", "mu"),
        ],
      };
    }
    return {
      key: r.jurisdiction,
      cells: [
        cell.text(r.name, r.jurisdiction, "w5"),
        r.rate ? cell.money(`$${Number(r.rate).toFixed(4)}`) : { ...cell.text("No rate", "", "sk-warn"), al: "rt" },
        r.surcharge && Number(r.surcharge) ? cell.money(`$${Number(r.surcharge).toFixed(4)}`) : { ...cell.text("—", "", "mu"), al: "rt" },
        cell.text(change, "", change.startsWith("+") ? "sk-warn" : "t3"),
        miles ? cell.num(whole(miles)) : { ...cell.text("—", "", "mu"), al: "rt" },
        miles ? cell.tags([{ v: `${quarter.slice(4)} estimate`, k: "info" }]) : cell.text("Not driven this quarter", "", "mu"),
      ],
    };
  });
  const addField = combo({ open, q, setOpen, setQ }, {
    k: "add", l: "Add a state", value: adding, options: US_STATES.filter(([c]) => !editing?.[c]).map(([c, n]) => ({ v: c, l: n, ab: c })),
    onPick: (code) => { put(code, {}); setAdding(""); }, placeholder: "Add a state", head: "50 states and DC", search: true, qph: "Search states",
  });
  return (
    <div className="c g16" style={{ padding: "16px 24px 24px" }}>
      <div className="banner" data-k="info">
        <Icon d={I.info} />
        <div className="f1">
          <div className="bt">Rates come from the IFTA, Inc. tax matrix each quarter</div>
          <div>{`Enter the ${label} matrix or import it as a CSV. Each return keeps the rates it was calculated with, and a change shows up here and in the audit log before it touches a return.`}</div>
        </div>
      </div>
      <section className="card oh c">
        <div className="ch">
          <h2 className="h2">{`Diesel rates · ${label}`}</h2>
          <span className="fs12 mu">Jurisdictions your trucks ran in, then the rest entered</span>
          <span className="sp"></span>
          {!editing ? (
            <label className="search" style={{ width: "220px", height: "28px" }}>
              <Icon className="s14" d={I.search} />
              <input placeholder="Find a state" aria-label="Find a state" value={find} onChange={(e) => setFind(e.currentTarget.value)} />
            </label>
          ) : null}
          {manage && !editing ? (
            <>
              <button className="btn sm" onClick={() => void importFile()} disabled={busy}>
                <Icon className="s14" d={I.sheet} />
                {busy ? "Importing…" : "Import CSV"}
              </button>
              <button className="btn sm" onClick={startEdit}>
                <Icon className="s14" d={I.pencil} />
                Edit rates
              </button>
            </>
          ) : null}
          {editing ? (
            <>
              <button className="btn sm" onClick={() => { setEditing(null); setProblem(null); }} disabled={busy}>Cancel</button>
              <button className="btn sm pri" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save rates"}</button>
            </>
          ) : null}
        </div>
        {problem ? <div style={{ padding: "12px 16px 0" }}><Problem message={problem} /></div> : null}
        {rates.isPending ? <Skeleton /> : null}
        {rates.isError ? <ErrorState error={rates.error} retry={() => void rates.refetch()} /> : null}
        {rates.data && !list.length && !editing ? (
          <EmptyState icon={I.dollar} title={`No rates for ${label} yet`} text="Import the quarter’s tax matrix as a CSV with the jurisdiction, rate and any surcharge, or enter the rates for the states your trucks ran in.">
            {manage ? <button className="btn sm pri" onClick={startEdit}>Enter rates</button> : null}
          </EmptyState>
        ) : null}
        {rows.length ? <RateTable rows={rows} before={before} /> : null}
        {editing ? (
          <div className="r g8" style={{ padding: "12px 16px" }}>
            <div style={{ width: "260px" }}><Combobox f={addField} /></div>
            <span className="fs12 mu">Rates are dollars per gallon, to four places</span>
          </div>
        ) : null}
        {rates.data && list.length && !editing && !shown.length ? <div className="cb fs13 mu">{`No state matches “${find}”.`}</div> : null}
      </section>
    </div>
  );
}

/** The table, with inputs in the rate columns while editing. */
function RateTable({ rows, before }: { rows: TRow[]; before: string }) {
  const head = [{ l: "Jurisdiction", al: "" }, { l: "Diesel rate", al: "rt" }, { l: "Surcharge", al: "rt" }, { l: `Change vs ${before}`, al: "" }, { l: "Miles this quarter", al: "rt" }, { l: "Used on", al: "" }];
  const editable = rows.some((r) => r.cells.some((c) => (c as { edit?: unknown }).edit));
  if (!editable) return <Table label="Diesel rates" cols={COLS} head={head} rows={rows} />;
  return (
    <div role="table" aria-label="Diesel rates">
      <div className="thead" role="row" style={{ gridTemplateColumns: COLS }}>
        {head.map((h) => <span key={h.l} role="columnheader" className={h.al}><span>{h.l}</span></span>)}
      </div>
      <div className="tbody">
        {rows.map((r) => (
          <div key={r.key} className="trow" role="row" style={{ gridTemplateColumns: COLS, cursor: "default" }}>
            {r.cells.map((c, i) => {
              const edit = (c as { edit?: { value: string; set: (v: string) => void; label: string } }).edit;
              if (edit) return <input key={i} className="inp mono" style={{ height: "28px", textAlign: "right" }} inputMode="decimal" placeholder="0.0000" aria-label={edit.label} value={edit.value} onChange={(e) => edit.set(e.currentTarget.value)} />;
              return <BasicCell key={i} c={c} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
