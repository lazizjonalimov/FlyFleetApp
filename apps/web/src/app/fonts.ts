import localFont from "next/font/local";

// Geist, bundled from the `geist` package so a build never depends on a font CDN.
//
// The design draws a handful of symbols (→ ▲ ▼ ≤ ↵) in the system font, because the Geist it loads does not
// cover them. The same ranges and weights are declared here so those symbols, and everything set heavier than
// the design's heaviest weight, come out exactly as designed. No metric-adjusted fallback face is generated,
// for the same reason: anything outside these ranges must fall through to the system font, not to it.
//
// The ranges are Latin, Latin Extended, Vietnamese and Cyrillic; the monospace face adds box drawing. They are
// written out in full because font options must be literal values.

export const geistSans = localFont({
  src: "../../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "400 700",
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD, U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF, U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303, U+0309, U+0323, U+1EA0-1EF9, U+0400-045F, U+0460-052F, U+1C80-1C8A, U+20B4, U+2116, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
    },
  ],
});

export const geistMono = localFont({
  src: "../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "400 600",
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD, U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF, U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303, U+0309, U+0323, U+1EA0-1EF9, U+0400-045F, U+0460-052F, U+1C80-1C8A, U+20B4, U+2116, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F, U+23B8-23BD, U+2500-259F",
    },
  ],
});
