"use client";

import { clsx } from "clsx";
import { useState } from "react";
import { Problem } from "@/components/feedback/dialog";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import { pickFile } from "@/features/documents/use-upload";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage, toApiError } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { formatNumber, plural } from "@/lib/format/text";
import { ModalFrame } from "./frame";
import type { Flow, ImportKind } from "./flows";

type Imp = Schema<"ImportOut">;
const STEPS = ["Upload", "Match columns", "Review", "Done"];
const SHEETS = ".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const OK = "M5 12l5 5 9-10";
const WARN = "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01";
const NO = "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2";
const LIST_SCREEN: Record<ImportKind, string> = { drivers: "drivers", trucks: "trucks", trailers: "trailers", mileage: "fuel" };
type Decision = "update" | "skip" | "odometer" | "miles";
const DECISION: Record<string, string> = { update: "Update", skip: "Skip", odometer: "Use odometer", miles: "Use miles" };

/** Bring drivers, trucks, trailers or IFTA miles in from a CSV or Excel file: match the columns, look at the rows
 * that need it, import the rest. Nothing is saved until Import. */
export function ImportFlow({ kind, flow, onBack, onClose }: { kind: ImportKind; flow: Flow; onBack: (() => void) | null; onClose: () => void }) {
  const { set, notify } = useConsole();
  const act = useAction();
  const [imp, setImp] = useState<Imp | null>(null);
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reminders, setReminders] = useState(true);
  const [hold, setHold] = useState(true);
  const noun = flow.plural;
  const miles = kind === "mileage";
  const one = miles ? "row" : noun.replace(/s$/, "");

  const choose = async () => {
    const file = await pickFile(SHEETS);
    if (!file) return;
    setPending(true);
    setProblem(null);
    try {
      const form = new FormData();
      form.append("kind", kind);
      form.append("file", file);
      const sent = await fetch("/api/v1/imports", { method: "POST", body: form, credentials: "same-origin" });
      const body = await sent.json().catch(() => null);
      if (!sent.ok) throw toApiError(sent.status, body);
      setImp(body as Imp);
      setStep(1);
    } catch (error) {
      setProblem(errorMessage(error));
    }
    setPending(false);
  };
  const update = async (mapping: Record<string, string | null>, decisions: Record<string, Decision>) => {
    if (!imp) return;
    setProblem(null);
    try {
      setImp(await unwrap(api.PUT("/api/v1/imports/{import_id}", { params: { path: { import_id: imp.id } }, body: { mapping, decisions } })));
    } catch (error) {
      setProblem(errorMessage(error));
    }
  };
  const mapping = () => Object.fromEntries((imp?.columns ?? []).map((c) => [c.header, c.field ?? null]));
  const decisions = () => Object.fromEntries((imp?.issues ?? []).filter((i) => i.decision).map((i) => [String(i.row), i.decision as Decision]));
  const commit = async () => {
    if (!imp) return;
    setPending(true);
    setProblem(null);
    try {
      const done = await unwrap(api.POST("/api/v1/imports/{import_id}/commit", { params: { path: { import_id: imp.id } }, body: { reminders, hold } }));
      await act(async () => undefined);
      setImp(done);
      setStep(3);
      notify(`${plural(Number(done.result?.created ?? 0), miles ? "trip row" : one)} imported`);
    } catch (error) {
      setProblem(errorMessage(error));
    }
    setPending(false);
  };
  const template = (format: "csv" | "xlsx") => window.open(`/api/v1/imports/template?kind=${kind}&format=${format}`, "_blank", "noopener");
  const title = `Import ${noun}`;
  const sub = "From a CSV or Excel file";
  const close = onClose;

  if (step === 0 || !imp) {
    return (
      <ModalFrame title={title} sub={sub} icon="M4 3h16v18H4zM4 9h16M4 15h16M10 3v18" steps={STEPS} step={0} onClose={close} left={onBack ? [{ l: "Back", cls: "ghost", go: onBack }] : []} right={[{ l: "Cancel", go: close }]}>
        <div className="mbody c g14">
          <Problem message={problem} />
          <div className="drop big">
            <span className="cic"><Icon className="s20" d="M4 3h16v18H4zM4 9h16M4 15h16M10 3v18" /></span>
            <span className="fs15 w6 tx">Choose a spreadsheet</span>
            <span className="fs12 mu">CSV or Excel (.xlsx) · from Google Sheets use File › Download › CSV · up to 5,000 rows</span>
            <button className="btn sm pri" style={{ marginTop: "6px" }} onClick={() => void choose()} disabled={pending}>
              <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              {pending ? "Reading the file…" : "Choose a file"}
            </button>
          </div>
          <div className="r g12" style={{ padding: "12px 14px", border: "1px solid var(--bd)", borderRadius: "10px" }}>
            <span className="xls">CSV</span>
            <div className="f1">
              <div className="fs13 w5">Start from our template</div>
              <div className="fs12 mu">{miles ? "Columns for the truck, date, state, miles and odometer start and end, already named." : `One row per ${one}, with the columns FlyFleet reads already named.`}</div>
            </div>
            <button className="btn sm" onClick={() => template("csv")}>
              <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              CSV
            </button>
            <button className="btn sm" onClick={() => template("xlsx")}>
              <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              Excel
            </button>
          </div>
          <p className="note">
            <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
            <span>{miles ? "For trucks without GPS. One row is one state on one trip; miles are checked against the odometer readings, and imported miles are marked on the return." : "Columns are matched by their names; you can change any match. Nothing is saved until you import."}</span>
          </p>
        </div>
      </ModalFrame>
    );
  }

  if (step === 1) {
    const ext = imp.filename.toLowerCase().endsWith(".csv") ? "CSV" : "XLSX";
    return (
      <ModalFrame title={title} sub={sub} icon="M4 3h16v18H4zM4 9h16M4 15h16M10 3v18" steps={STEPS} step={1} size="mid" onClose={close}
        left={[{ l: "Back", cls: "ghost", go: () => setStep(0) }]}
        right={[{ l: `Check ${formatNumber(imp.rows)} ${imp.rows === 1 ? "row" : "rows"}`, cls: "pri", go: () => setStep(2), disabled: !imp.covered && (miles || imp.missing.includes("unit number")) }]}>
        <div className="mbody c g12">
          <Problem message={problem} />
          <div className="filechip">
            <span className="xls">{ext}</span>
            <div className="f1">
              <div className="fs13 w5 mono">{imp.filename}</div>
              <div className="fs12 mu">{[imp.sheet, plural(imp.rows, "row"), plural(imp.columns.length, "column")].filter(Boolean).join(" · ")}</div>
            </div>
            <button className="btn sm ghost" onClick={() => setStep(0)}>Change file</button>
          </div>
          <div className="banner" data-k={imp.covered ? "ok" : "warn"}>
            <Icon className="s14 b" d={imp.covered ? OK : WARN} />
            <div>
              <b>{`${imp.matched} of ${imp.columns.length} columns matched.`}</b>{" "}
              {imp.covered ? "Every field FlyFleet needs is covered." : `Not in the file yet: ${imp.missing.join(", ")}. Match a column to it, or add it later.`}
            </div>
          </div>
          <div className="card oh" style={{ boxShadow: "none" }}>
            <div className="thead" style={{ gridTemplateColumns: "160px minmax(0,1fr) 20px 200px 150px" }}>
              <span>Column in your file</span>
              <span>Example</span>
              <span></span>
              <span>FlyFleet field</span>
              <span>Status</span>
            </div>
            {imp.columns.map((c) => {
              const tone = c.status === "warn" ? "warn" : c.status === "ignored" ? "mu" : "ok";
              return (
                <div key={c.header} className="trow" style={{ gridTemplateColumns: "160px minmax(0,1fr) 20px 200px 150px", cursor: "default" }}>
                  <span className="mono fs12 w5 ell"><span>{c.header}</span></span>
                  <span className="fs12 t3 ell"><span>{c.example}</span></span>
                  <Icon className="s14 mu" d="M5 12h14M13 6l6 6-6 6" />
                  <span className="dd">
                    <select className={clsx("selb", c.status === "ignored" && "skip", c.status === "warn" && "warn")} style={{ appearance: "none", paddingRight: "26px" }} aria-label={`FlyFleet field for ${c.header}`} value={c.field ?? ""}
                      onChange={(e) => void update({ ...mapping(), [c.header]: e.currentTarget.value || null }, decisions())}>
                      <option value="">Don’t import</option>
                      {imp.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <Icon className="s12 mu" d="M6 9l6 6 6-6" style={{ position: "absolute", right: "9px", top: "9px", pointerEvents: "none" }} />
                  </span>
                  <span className="risk" data-k={tone}>
                    <Icon className="s12 b" d={tone === "ok" ? OK : tone === "warn" ? WARN : NO} />
                    <span className="ell"><span>{c.note}</span></span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </ModalFrame>
    );
  }

  if (step === 2) {
    const toAdd = imp.ready + imp.issues.filter((i) => i.decision && i.decision !== "skip").length;
    return (
      <ModalFrame title={title} sub={sub} icon="M4 3h16v18H4zM4 9h16M4 15h16M10 3v18" steps={STEPS} step={2} size="mid" onClose={close}
        left={[{ l: "Back", cls: "ghost", go: () => setStep(1) }]} note="Nothing is saved until you import"
        right={[{ l: pending ? "Importing…" : `Import ${plural(toAdd, one)}`, cls: "pri", go: () => void commit(), disabled: pending || toAdd === 0 }]}>
        <div className="mbody c g12">
          <Problem message={problem} />
          <div className="kpis" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))", boxShadow: "none" }}>
            {[{ l: "Ready", v: imp.ready, s: "will be added", k: "ok" }, { l: "Need a look", v: imp.look, s: imp.look ? "choose below" : "none", k: "warn" }, { l: "Can’t import", v: imp.cant, s: imp.cant ? "fix in your file" : "none", k: "bad" }].map((k) => (
              <div key={k.l} className="kpi">
                <span className="kl"><span className="dot" data-k={k.k}></span><span>{k.l}</span></span>
                <span className="kv2" style={{ fontSize: "22px", lineHeight: "28px" }}><span>{formatNumber(k.v)}</span></span>
                <span className="fs12 mu"><span>{k.s}</span></span>
              </div>
            ))}
          </div>
          <div className="card oh" style={{ boxShadow: "none" }}>
            <div className="ch" style={{ minHeight: "40px" }}>
              <h3 className="h3">Rows to look at</h3>
              <span className="cnt" data-k="warn">{imp.issues.length}</span>
              <span className="sp"></span>
              <span className="fs12 mu">Everything else is ready</span>
            </div>
            {!imp.issues.length ? <div className="cb fs13 mu">Every row is ready.</div> : null}
            {imp.issues.map((r) => (
              <div key={r.row} className="wl" style={{ alignItems: "flex-start" }}>
                <span className="mono fs12 mu" style={{ width: "56px", flex: "none", paddingTop: "1px" }}>{`Row ${r.row}`}</span>
                <div className="f1">
                  <div className="fs13 w5"><span>{r.title}</span></div>
                  <div className="r g6 ast fs12 tc" data-k={r.tone} style={{ marginTop: "3px" }}>
                    <Icon className="s12 b" d={r.tone === "bad" ? NO : WARN} style={{ marginTop: "2px" }} />
                    <span><span>{r.message}</span></span>
                  </div>
                </div>
                {r.actions.length ? (
                  <div className="seg sm" role="group" aria-label={`Row ${r.row}`}>
                    {r.actions.map((a) => (
                      <button key={a} className={r.decision === a ? "on" : ""} aria-pressed={r.decision === a} onClick={() => void update(mapping(), { ...decisions(), [String(r.row)]: a as Decision })}>
                        <span>{DECISION[a] ?? a}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="tag" data-k="bad"><span>Fix in file</span></span>
                )}
              </div>
            ))}
          </div>
          {miles ? (
            <label className="r g8 fs13">
              <input type="checkbox" className="cbx" checked={hold} onChange={(e) => setHold(e.currentTarget.checked)} />
              <span>Hold imported miles for review before the return is approved</span>
            </label>
          ) : kind !== "drivers" ? (
            <label className="r g8 fs13">
              <input type="checkbox" className="cbx" checked={reminders} onChange={(e) => setReminders(e.currentTarget.checked)} />
              <span>List registrations and inspections due within 60 days when the import is done</span>
            </label>
          ) : null}
        </div>
      </ModalFrame>
    );
  }

  const r = (imp.result ?? {}) as { created?: number; updated?: number; skipped?: number; failed?: { row: number; message: string }[]; due_soon?: { unit: string; what: string; on: string }[]; held?: boolean; odometer_rows?: number[]; skipped_rows?: { row: number; message: string }[]; trucks?: string[]; quarters?: string[] };
  if (miles) {
    const created = r.created ?? 0;
    const used = r.odometer_rows ?? [];
    const quarters = (r.quarters ?? []).map((q) => `Q${q.slice(5)} ${q.slice(0, 4)}`);
    const trucks = r.trucks ?? [];
    const lines = [
      { t: "Added", n: created - used.length, k: "ok" },
      ...used.map((row) => ({ t: `Updated · row ${row}, odometer used`, n: 1, k: "info" })),
      ...(r.skipped_rows ?? []).map((x) => ({ t: `Skipped · row ${x.row}, ${x.message.charAt(0).toLowerCase()}${x.message.slice(1)}`, n: 1, k: "bad" })),
      ...(r.failed ?? []).map((x) => ({ t: `Refused · row ${x.row}, ${x.message}`, n: 1, k: "bad" })),
    ];
    return (
      <ModalFrame title={title} sub={imp.filename} icon="M4 3h16v18H4zM4 9h16M4 15h16M10 3v18" steps={STEPS} step={3} onClose={close}
        right={[{ l: "View mileage", go: () => { close(); set({ ...goTo("fuel"), ftab: 1 }); } }, { l: "Done", cls: "pri", go: close }]}>
        <div className="mbody">
          <div className="c g10" style={{ alignItems: "center", textAlign: "center", padding: "16px 0 8px" }}>
            <span className="donei"><Icon className="s24 b" d={OK} /></span>
            <h3 style={{ fontSize: "18px", lineHeight: "24px", fontWeight: "600" }}>{`${plural(created, "trip row")} imported`}</h3>
            <p className="fs13 mu" style={{ maxWidth: "460px" }}>
              {`Miles are added to ${trucks.length > 3 ? plural(trucks.length, "truck") : trucks.join(", ") || "the trucks"} by state and marked as imported on the ${quarters.join(" and ") || "quarter’s"} return.${r.held ? " They’re held for review until someone releases them on the Mileage tab." : ""}`}
            </p>
          </div>
          <div className="card oh" style={{ boxShadow: "none", marginTop: "12px" }}>
            {lines.map((x) => (
              <div key={x.t} className="wl">
                <span className="dot" data-k={x.k}></span>
                <span className="f1 fs13"><span>{x.t}</span></span>
                <span className="mono fs13 w6"><span>{x.n}</span></span>
              </div>
            ))}
          </div>
        </div>
      </ModalFrame>
    );
  }
  const rows = [
    { t: "Added", n: r.created ?? 0, k: "ok" },
    { t: "Updated", n: r.updated ?? 0, k: "info" },
    { t: "Skipped", n: r.skipped ?? 0, k: "mu" },
    ...(r.failed?.length ? [{ t: "Refused by FlyFleet’s checks", n: r.failed.length, k: "bad" }] : []),
  ];
  return (
    <ModalFrame title={title} sub={imp.filename} icon="M4 3h16v18H4zM4 9h16M4 15h16M10 3v18" steps={STEPS} step={3} onClose={close}
      right={[{ l: `Open ${noun}`, go: () => { close(); set(goTo(LIST_SCREEN[kind])); } }, { l: "Done", cls: "pri", go: close }]}>
      <div className="mbody">
        <div className="c g10" style={{ alignItems: "center", textAlign: "center", padding: "16px 0 8px" }}>
          <span className="donei"><Icon className="s24 b" d={OK} /></span>
          <h3 style={{ fontSize: "18px", lineHeight: "24px", fontWeight: "600" }}>{`${plural(r.created ?? 0, noun.replace(/s$/, ""))} imported`}</h3>
          <p className="fs13 mu" style={{ maxWidth: "460px" }}>Each was checked by the same rules as the form. The import is in the audit log.</p>
        </div>
        <div className="card oh" style={{ boxShadow: "none", marginTop: "12px" }}>
          {rows.map((x) => (
            <div key={x.t} className="wl">
              <span className="dot" data-k={x.k}></span>
              <span className="f1 fs13"><span>{x.t}</span></span>
              <span className="mono fs13 w6"><span>{x.n}</span></span>
            </div>
          ))}
          {(r.failed ?? []).map((f) => (
            <div key={`f${f.row}`} className="wl"><span className="mono fs12 mu" style={{ width: "56px" }}>{`Row ${f.row}`}</span><span className="f1 fs12 t3">{f.message}</span></div>
          ))}
        </div>
        {r.due_soon?.length ? (
          <div className="card oh" style={{ boxShadow: "none", marginTop: "12px" }}>
            <div className="ch" style={{ minHeight: "40px" }}><h3 className="h3">Due within 60 days</h3><span className="sp"></span><span className="fs12 mu">Also on Compliance</span></div>
            {r.due_soon.map((d) => (
              <div key={`${d.unit}${d.what}`} className="wl"><span className="mono fs12 w5" style={{ width: "72px" }}>{d.unit}</span><span className="f1 fs13 t2">{d.what}</span><span className="mono fs12 t3">{d.on}</span></div>
            ))}
          </div>
        ) : null}
      </div>
    </ModalFrame>
  );
}
