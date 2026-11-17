"use client";

import { clsx } from "clsx";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import type { Flow } from "./flows";

type Button = { l: string; cls?: string; go: () => void; disabled?: boolean };

/** The add dialog's frame, as the design draws it: the heading, the steps on the right, the body and the buttons. */
export function ModalFrame({ title, sub, icon, steps, step, size, label, onClose, left = [], right = [], note, children }: {
  title: string;
  sub: string;
  icon: string;
  steps?: string[];
  /** Which step is current, counting from 0. */
  step?: number;
  size?: string;
  label?: string;
  onClose: () => void;
  left?: Button[];
  right?: Button[];
  note?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="scrim" style={{ zIndex: "50" }} onClick={onClose}></div>
      <div className={clsx("modal", size)} role="dialog" aria-modal="true" aria-label={label ?? title}>
        <div className="mh">
          <span className="mhic"><Icon className="s18" d={icon} /></span>
          <div className="f1 mw0">
            <h2 className="fs16 w6 tx"><span>{title}</span></h2>
            <p className="fs13 mu ell" style={{ marginTop: "2px" }}><span>{sub}</span></p>
          </div>
          {steps ? (
            <ol className="mst" aria-label="Steps">
              {steps.map((l, i) => {
                const done = i < (step ?? 0);
                const cur = i === (step ?? 0);
                return (
                  <li key={l} className={clsx(done && "done", cur && "cur")} aria-current={cur ? "step" : undefined}>
                    <span className="n">{done ? <Icon className="s12 b" d="M5 12l5 5 9-10" /> : <span>{i + 1}</span>}</span>
                    <span>{l}</span>
                  </li>
                );
              })}
            </ol>
          ) : null}
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close"><Icon d="M18 6L6 18M6 6l12 12" /></button>
        </div>
        {children}
        <div className="mfoot">
          {left.map((b) => (
            <button key={b.l} className={clsx("btn", b.cls)} onClick={b.go} disabled={b.disabled}><span>{b.l}</span></button>
          ))}
          <span className="sp"></span>
          {note ? <span className="fs12 mu"><span>{note}</span></span> : null}
          {right.map((b) => (
            <button key={b.l} className={clsx("btn", b.cls)} onClick={b.go} disabled={b.disabled}><span>{b.l}</span></button>
          ))}
        </div>
      </div>
    </>
  );
}

/** Start from a document, type it in, or bring many in from a spreadsheet. */
export function ChooseStep({ flow, onScan, onManual, onImport, onClose, photos }: {
  flow: Flow;
  onScan: () => void;
  onManual: () => void;
  onImport: (() => void) | null;
  onClose: () => void;
  photos: boolean;
}) {
  const { I } = useConsole();
  const choices = [
    { t: flow.scan.title, d: flow.scan.detail + (photos ? "" : " PDFs with their text in them are read here; photos need the photo reader turned on."), ic: I.camera, tag: "Fastest", cls: "rec", reads: flow.scan.reads, go: onScan },
    { t: "Enter manually", d: flow.manualDetail, ic: I.pencil, tag: "", cls: "alt", reads: [], go: onManual },
  ];
  return (
    <ModalFrame title={flow.title} sub="Start from a document, or type it in." icon={flow.icon} onClose={onClose} right={[{ l: "Cancel", go: onClose }]}>
      <div className="mbody">
        <div className="choices">
          {choices.map((o) => (
            <button key={o.t} className={clsx("choice", o.cls)} onClick={o.go}>
              <span className="r" style={{ width: "100%" }}>
                <span className="cic"><Icon className="s20" d={o.ic} /></span>
                <span className="sp"></span>
                {o.tag ? <span className="tag" data-k="brand"><span>{o.tag}</span></span> : null}
              </span>
              <span className="fs15 w6 tx"><span>{o.t}</span></span>
              <span className="fs13 mu pre" style={{ lineHeight: "19px" }}><span>{o.d}</span></span>
              {o.reads.length ? (
                <span className="r g4 wrap" style={{ marginTop: "2px" }}>
                  {o.reads.map((x) => (
                    <span key={x} className="tag" data-k="mu"><span>{x}</span></span>
                  ))}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {onImport ? (
          <div className="bulkln">
            <span className="eqic"><Icon className="s14" d={I.sheet} /></span>
            <span className="f1">{`Adding a lot of ${flow.plural}? Bring them in from a CSV or Excel file.`}</span>
            <button className="btn sm" onClick={onImport}>Import a spreadsheet</button>
          </div>
        ) : null}
      </div>
    </ModalFrame>
  );
}
