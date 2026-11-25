import type { CSSProperties } from "react";

/** The colours of the logo: Night for the second chevron and the name, Flight Blue for the first chevron. */
export const NIGHT = "#0B1220";
export const FLIGHT_BLUE = "#1F4FE0";
/** Flight Blue lightened for dark backgrounds, where the deeper blue loses contrast. */
export const FLIGHT_BLUE_ON_DARK = "#4D7BFF";

/**
 * How the logo is coloured: on white (the default), on Night, on Flight Blue, or in one colour. `current` draws
 * the dark parts in the text colour, so the logo turns white wherever the text does (dark mode).
 */
export type LogoTone = "white" | "night" | "blue" | "one" | "current";

const TONES: Record<LogoTone, { dark: string; accent: string }> = {
  white: { dark: NIGHT, accent: FLIGHT_BLUE },
  night: { dark: "#FFFFFF", accent: FLIGHT_BLUE_ON_DARK },
  blue: { dark: "#FFFFFF", accent: NIGHT },
  one: { dark: NIGHT, accent: NIGHT },
  current: { dark: "currentColor", accent: FLIGHT_BLUE },
};

/** The mark: two chevrons, the first in the accent and the second in the main colour. Drawn in a 96 × 84 box. */
function Chevrons({ dark, accent }: { dark: string; accent: string }) {
  return (
    <>
      <path d="M0 0H14L56 42L14 84H0L26 42Z" fill={accent} />
      <path d="M40 0H54L96 42L54 84H40L66 42Z" fill={dark} />
    </>
  );
}

/** The name, FLYFLEET, as outlines, so it looks the same whatever fonts the browser has. */
const WORDMARK =
  "M98.02 81.31V36.56H141.99V46.38H111.23V55.42H138.61V65.24H111.23V81.31ZM151.29 81.31V36.56H164.49V70.64H193.24V81.31ZM219.32 81.31V63.49L197.21 36.56H212.88L225.95 53.34H226.54L239.74 36.56H254.7L232.59 63.49V81.31ZM262.63 81.31V36.56H306.6V46.38H275.84V55.42H303.22V65.24H275.84V81.31ZM315.9 81.31V36.56H329.1V70.64H357.85V81.31ZM366.24 81.31V36.56H412.8V46.38H379.5V53.93H408.64V63.42H379.5V71.49H413.32V81.31ZM423.66 81.31V36.56H470.23V46.38H436.93V53.93H466.07V63.42H436.93V71.49H470.75V81.31ZM496.51 81.31V47.23H477.12V36.56H529.15V47.23H509.77V81.31Z";

/** The mark alone: for places under 24 px tall, the collapsed sidebar and the browser tab. */
export function LogoMark({ size = 32, tone = "current", title = "FlyFleet" }: { size?: number; tone?: LogoTone; title?: string }) {
  const { dark, accent } = TONES[tone];
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title} style={{ display: "block", flex: "none" }}>
      <g transform="translate(18 23.25) scale(0.875)">
        <Chevrons dark={dark} accent={accent} />
      </g>
    </svg>
  );
}

/** The full logo: the mark and the name. At least 24 px tall; below that, use the mark. Leave half the mark's height clear on every side. */
export function Logo({ height = 40, tone = "current", title = "FlyFleet", style }: { height?: number; tone?: LogoTone; title?: string; style?: CSSProperties }) {
  const { dark, accent } = TONES[tone];
  return (
    <svg width={(537.15 / 120) * height} height={height} viewBox="0 0 537.15 120" role="img" aria-label={title} style={{ display: "block", overflow: "visible", flex: "none", ...style }}>
      <g transform="translate(8 30) scale(0.690476)">
        <Chevrons dark={dark} accent={accent} />
      </g>
      <path d={WORDMARK} fill={dark} />
    </svg>
  );
}
