import { clsx } from "clsx";
import type { InputHTMLAttributes, ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & { id: string; label: ReactNode; error?: string; hint?: string };

/** A labelled input in the design's form style, with the problem under it when there is one. */
export function Field({ id, label, error, hint, className, ...input }: Props) {
  return (
    <div className="fld">
      {typeof label === "string" ? <label htmlFor={id}>{label}</label> : label}
      <input id={id} className={clsx("inp", error && "err", className)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} {...input} />
      {error ? (
        <span className="errt" id={`${id}-err`} role="alert">{error}</span>
      ) : hint ? (
        <span className="fs12 mu" id={`${id}-hint`}>{hint}</span>
      ) : null}
    </div>
  );
}
