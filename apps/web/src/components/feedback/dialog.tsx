"use client";

import { clsx } from "clsx";
import { useId, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { I } from "@/features/console/icons";
import { errorMessage } from "@/lib/api/errors";

type DialogProps = { title: string; sub?: string; icon?: string; width?: number; onClose: () => void; children?: ReactNode; footer: ReactNode };

/** A dialog over the console, in the same frame as the add flows: a heading, a body and a row of buttons. */
export function Dialog({ title, sub, icon = I.info, width = 480, onClose, children, footer }: DialogProps) {
  return (
    <>
      <div className="scrim" style={{ zIndex: "50" }} onClick={onClose}></div>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ width: `${width}px` }}>
        <div className="mh">
          <span className="mhic"><Icon className="s18" d={icon} /></span>
          <div className="f1">
            <h2 className="fs16 w6 tx">{title}</h2>
            {sub ? <p className="fs13 mu" style={{ marginTop: "2px" }}>{sub}</p> : null}
          </div>
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close"><Icon d="M18 6L6 18M6 6l12 12" /></button>
        </div>
        {children ? <div className="mbody c g12">{children}</div> : null}
        <div className="mfoot">{footer}</div>
      </div>
    </>
  );
}

/** What went wrong, at the top of a dialog or form. */
export function Problem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="banner" data-k="bad" role="alert">
      <Icon className="s14" d={I.alert} />
      <div className="f1">{message}</div>
    </div>
  );
}

type ConfirmProps = {
  title: string;
  text?: string;
  confirm: string;
  destructive?: boolean;
  /** Asks for a reason before going ahead. */
  reason?: { label: string; required?: boolean; placeholder?: string };
  /** Asks when it happened; empty means now. */
  when?: { label: string; hint?: string };
  onClose: () => void;
  /** Carries out the change. A failure is shown here and the dialog stays open. */
  run: (answer: { reason: string; when: string }) => Promise<unknown>;
};

/** Asks before a change that matters, with the reason or time it needs, and shows the server's answer if it refuses. */
export function Confirm({ title, text, confirm, destructive, reason, when, onClose, run }: ConfirmProps) {
  const id = useId();
  const [why, setWhy] = useState("");
  const [at, setAt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = !!reason?.required && !why.trim();

  async function go() {
    if (missing) return setError(`Enter ${reason!.label.toLowerCase()}`);
    setPending(true);
    setError(null);
    try {
      await run({ reason: why.trim(), when: at });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  return (
    <Dialog
      title={title}
      sub={text}
      icon={destructive ? I.alert : I.info}
      onClose={() => !pending && onClose()}
      footer={
        <>
          <span className="sp"></span>
          <button className="btn" onClick={onClose} disabled={pending}>Cancel</button>
          <button className={clsx("btn", destructive ? "bad" : "pri")} onClick={() => void go()} disabled={pending}>{pending ? "Working…" : confirm}</button>
        </>
      }
    >
      {error || reason || when ? (
        <>
          <Problem message={error} />
          {when ? (
            <div className="fld">
              <label htmlFor={`${id}-when`}>{when.label}</label>
              <input id={`${id}-when`} className="inp" type="datetime-local" value={at} onChange={(event) => setAt(event.target.value)} />
              {when.hint ? <span className="fs12 mu">{when.hint}</span> : null}
            </div>
          ) : null}
          {reason ? (
            <div className="fld">
              <label htmlFor={`${id}-why`}>{reason.label}</label>
              <textarea id={`${id}-why`} className={clsx("inp", error && missing && "err")} rows={3} maxLength={500} placeholder={reason.placeholder} value={why} onChange={(event) => setWhy(event.target.value)} />
            </div>
          ) : null}
        </>
      ) : null}
    </Dialog>
  );
}
