"use client";

import { clsx } from "clsx";
import { Combobox } from "@/components/forms/combobox";
import { Icon } from "@/components/ui/icon";
import { tx } from "@/features/console/dom";
import { type OwnerFormFieldData } from "@/features/console/view";

/** One field of the owner form: a text input, a read-only linked value, a dropdown or a segmented choice. */
export function OwnerFormField({ f }: { f: OwnerFormFieldData }) {
  return (
    <div className="fld" style={{ gridColumn: `span ${f.span}` }}>
      {f.isInput ? (
        <>
          <label htmlFor={f.id}>
            <span>{f.l}</span>
            {f.req ? (
              <b className="req5">*</b>
            ) : null}
          </label>
          <input id={f.id} className={clsx("inp", f.mono)} defaultValue={f.v} placeholder={f.ph} />
        </>
      ) : null}
      {f.isRo ? (
        <>
          <span className="lbl"><span>{f.l}</span></span>
          <div className="ro5">
            <Icon className="s14" d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
            <div className="ell">{tx(f.v)}</div>
          </div>
        </>
      ) : null}
      {f.isDd ? (
        <>
          <span className="lbl"><span>{f.l}</span></span>
          <Combobox f={f} />
          {f.showOther ? (
            <>
              <label className="othl" htmlFor={f.oid}>{tx(f.otherL)}</label>
              <input id={f.oid} className="inp othr" defaultValue={f.ov} placeholder={f.otherPh} onInput={f.setOther} />
            </>
          ) : null}
        </>
      ) : null}
      {f.isSeg ? (
        <>
          <span className="lbl"><span>{f.l}</span></span>
          <div className="seg" role="group" aria-label={f.l} style={{ alignSelf: "flex-start" }}>
            {f.opts?.map((o, i) => (
              <button key={i} className={o.on} aria-pressed={o.p} onClick={o.go}><span>{o.l}</span></button>
            ))}
          </div>
        </>
      ) : null}
      {f.hint ? (
        <span className="hint"><span>{f.hint}</span></span>
      ) : null}
    </div>
  );
}
