import { clsx } from "clsx";

/** Black or white, whichever reads on this colour. */
function ink(color: string): string {
  const n = parseInt(color.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#0B1220" : "#FFFFFF";
}

/**
 * A company's mark: its logo when it has one, otherwise its short code on its colour. Shown beside numbers
 * wherever companies mix.
 */
export function CompanyMark({ code, color, size = 24, className, logo }: { code: string; color: string; size?: number; className?: string; logo?: string | null }) {
  if (logo) {
    return (
      <span className={clsx("cmark logo", className)} style={{ width: size, height: size }} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small private picture from the API, already sized */}
        <img src={logo} alt="" />
      </span>
    );
  }
  return (
    <span className={clsx("cmark", className)} style={{ background: color, color: ink(color), width: size, height: size, fontSize: Math.max(8, Math.round(size / (code.length > 3 ? 3.2 : 2.5))) }} aria-hidden="true">
      {code}
    </span>
  );
}
