import { clsx } from "clsx";

/**
 * A stroked 24×24 icon drawn from one path. 16px by default; `s12`, `s14`, `s18`, `s20` and `s24` set the size,
 * `b` makes the stroke bold, `fill` fills instead of stroking. Decorative: the control it sits in carries the label.
 */
export function Icon({ d, className, style }: { d: string | undefined; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={clsx("ic", className)} viewBox="0 0 24 24" aria-hidden="true" style={style}>
      <path d={d} />
    </svg>
  );
}
