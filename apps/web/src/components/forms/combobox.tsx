"use client";

import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { tx } from "@/features/console/dom";
import { type ComboboxField } from "@/features/console/view";

/** A dropdown with an optional search box and an “Other” entry. With `chip`, it opens from a dashed “+ Filter”
 * chip, as a report's filters do. */
export function Combobox({ f, chip, button, end }: { f: ComboboxField; chip?: string; button?: { label: string; icon: string }; end?: boolean }) {
  const { I } = useConsole();
  return (
    <div className="dd">
      {button ? (
        <button className="btn" onClick={f.toggle} aria-haspopup="listbox" aria-expanded={f.exp} aria-label={f.aria}>
          <Icon className="s14" d={button.icon} />
          {button.label}
        </button>
      ) : chip ? (
        <button className="chip add" onClick={f.toggle} aria-haspopup="listbox" aria-expanded={f.exp} aria-label={f.aria}>
          <Icon className="s12 b" d="M12 5v14M5 12h14" />
          {chip}
        </button>
      ) : (
        <button className={clsx("inp ddb", f.ddsz)} onClick={f.toggle} aria-haspopup="listbox" aria-expanded={f.exp} aria-label={f.aria}>
          <span className={clsx("f1 ell", f.vcls)}>{tx(f.shown)}</span>
          {f.ab ? (
            <span className="ddab"><span>{f.ab}</span></span>
          ) : null}
          <Icon className="s14 ddc" d="M6 9l6 6 6-6" />
        </button>
      )}
      {f.open ? (
        <>
          <div className="ddcatch" onClick={f.close}></div>
          <div className={clsx("ddl", end && "end")}>
            {f.search ? (
              <label className="dds">
                <Icon className="s14" d={I.search} />
                <input defaultValue={f.q} placeholder={f.qph} aria-label={f.qph} onInput={f.setQ} />
              </label>
            ) : null}
            <div className="ddh">{tx(f.head)}</div>
            <div className="ddo" role="listbox" aria-label={f.l}>
              {f.dopts?.map((o, i) => (
                <button key={i} className={clsx("ddi", o.on)} role="option" aria-selected={o.sel} onClick={o.go}>
                  <span className="f1 ell"><span>{o.l}</span></span>
                  {o.ab ? (
                    <span className="ddab"><span>{o.ab}</span></span>
                  ) : null}
                  <Icon className="ddk" d="M5 12l5 5 9-10" />
                </button>
              ))}
              {f.none ? (
                <div className="ddn">Nothing matches that</div>
              ) : null}
            </div>
            {f.hasOther ? (
              <div className="ddf">
                <button className={clsx("ddi", f.otherOn)} role="option" aria-selected={f.otherSel} onClick={f.pickOther}>
                  <Icon className="ddp" d={I.pencil} />
                  <span className="f1">
                    <span className="ddt">{tx(f.otherT)}</span>
                    <span className="ddd">{tx(f.otherD)}</span>
                  </span>
                  <Icon className="ddk" d="M5 12l5 5 9-10" />
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
