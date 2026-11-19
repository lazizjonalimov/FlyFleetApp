import type { CSSProperties } from "react";

/** The colours of the logo: Night for the bars and the name, Flight Blue for the last bar. */
export const NIGHT = "#0B1220";
export const FLIGHT_BLUE = "#1F4FE0";

/**
 * How the logo is coloured: on white (the default), on Night, on Flight Blue, or in one colour. `current` draws
 * the dark parts in the text colour, so the logo turns white wherever the text does (dark mode).
 */
export type LogoTone = "white" | "night" | "blue" | "one" | "current";

const TONES: Record<LogoTone, { dark: string; last: string }> = {
  white: { dark: NIGHT, last: FLIGHT_BLUE },
  night: { dark: "#FFFFFF", last: FLIGHT_BLUE },
  blue: { dark: "#FFFFFF", last: NIGHT },
  one: { dark: NIGHT, last: NIGHT },
  current: { dark: "currentColor", last: FLIGHT_BLUE },
};

/** The three bars: two in the main colour and a shorter last one in the accent. */
function Bars({ dark, last }: { dark: string; last: string }) {
  return (
    <>
      <path d="M8 30 H94 L110 46 H24 Z" fill={dark} />
      <path d="M24 54 H86 L100 68 H38 Z" fill={dark} />
      <path d="M40 76 H74 L86 88 H52 Z" fill={last} />
    </>
  );
}

/** The mark alone: for places under 24 px tall, the collapsed sidebar and the browser tab. */
export function LogoMark({ size = 32, tone = "current", title = "FlyFleet" }: { size?: number; tone?: LogoTone; title?: string }) {
  const { dark, last } = TONES[tone];
  return (
    <svg width={size} height={size} viewBox="6 6 108 108" role="img" aria-label={title} style={{ display: "block", flex: "none" }}>
      <Bars dark={dark} last={last} />
    </svg>
  );
}

/**
 * The full logo: the mark and the name. At least 24 px tall; below that, use the mark. Leave half the mark's
 * height clear on every side. The name is Archivo Black, loaded as `--font-archivo`.
 */
export function Logo({ height = 40, tone = "current", title = "FlyFleet", style }: { height?: number; tone?: LogoTone; title?: string; style?: CSSProperties }) {
  const { dark, last } = TONES[tone];
  return (
    <svg width={(523.3 / 120) * height} height={height} viewBox="0 0 523.3 120" role="img" aria-label={title} style={{ display: "block", overflow: "visible", flex: "none", ...style }}>
      <g transform="translate(0,1)">
        <Bars dark={dark} last={last} />
      </g>
      <text x="127.41" y="81.27" fontFamily="var(--font-archivo), Archivo, sans-serif" fontSize="62" fontWeight="900" letterSpacing="6.8" fill={dark}>
        FLYFLEET
      </text>
    </svg>
  );
}
