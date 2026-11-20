/**
 * Design-token shortcuts. Every colour and space comes from `@atlaskit/tokens`, so the apps follow
 * the host's light or dark theme once `view.theme.enable()` has run. The second argument is the
 * light-theme fallback used before the theme loads (and in jsdom tests).
 */
import { token } from "@atlaskit/tokens";
import type { CSSProperties } from "react";

export const colors = {
  text: token("color.text", "#172B4D"),
  subtle: token("color.text.subtle", "#44546F"),
  subtlest: token("color.text.subtlest", "#626F86"),
  inverse: token("color.text.inverse", "#FFFFFF"),
  border: token("color.border", "#091E4224"),
  surface: token("elevation.surface", "#FFFFFF"),
  surfaceRaised: token("elevation.surface.raised", "#FFFFFF"),
  sunken: token("elevation.surface.sunken", "#F7F8F9"),
  neutral: token("color.background.neutral", "#091E420F"),
  danger: token("color.background.danger", "#FFECEB"),
  dangerBold: token("color.background.danger.bold", "#C9372C"),
  dangerText: token("color.text.danger", "#AE2E24"),
  success: token("color.background.success", "#DCFFF1"),
  successText: token("color.text.success", "#216E4E"),
  warning: token("color.background.warning", "#FFF7D6"),
  warningText: token("color.text.warning", "#A54800"),
  information: token("color.background.information", "#E9F2FF"),
  link: token("color.link", "#0C66E4"),
  focus: token("color.border.focused", "#388BFF"),
  marker: token("color.border.danger", "#E2483D"),
  grid: token("color.border", "#091E4224"),
  /** Series colours (event + 3 neighbours); always paired with a dash pattern (not colour only). */
  series: [
    token("color.chart.categorical.1", "#2898BD"),
    token("color.chart.categorical.2", "#5E4DB2"),
    token("color.chart.categorical.3", "#E06C00"),
    token("color.chart.categorical.4", "#943D73"),
  ],
  bar: token("color.chart.neutral", "#8590A2"),
  barAfter: token("color.chart.danger", "#E2483D"),
} as const;

/** Dash patterns that pair with `colors.series` so overlays never rely on colour alone. */
export const SERIES_DASH = ["", "6 3", "2 3", "8 3 2 3"] as const;

export const space = {
  xs: token("space.050", "4px"),
  s: token("space.100", "8px"),
  m: token("space.200", "16px"),
  l: token("space.300", "24px"),
} as const;

export const font = {
  body: token("font.body", 'normal 400 14px/20px "Atlassian Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, "Helvetica Neue", sans-serif'),
  small: token("font.body.small", 'normal 400 12px/16px "Atlassian Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, "Helvetica Neue", sans-serif'),
  code: token("font.code", 'normal 400 0.875em/1 "Atlassian Mono", ui-monospace, Menlo, "Segoe UI Mono", "Ubuntu Mono", monospace'),
} as const;

/** Hides content visually but keeps it for screen readers. */
export const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export const tableStyle: CSSProperties = { borderCollapse: "collapse", width: "100%", font: font.body, color: colors.text };
export const thStyle: CSSProperties = {
  textAlign: "left",
  padding: `${space.xs} ${space.s}`,
  borderBottom: `2px solid ${colors.border}`,
  color: colors.subtle,
  font: font.small,
  fontWeight: 600,
  verticalAlign: "bottom",
};
export const tdStyle: CSSProperties = { padding: `${space.xs} ${space.s}`, borderBottom: `1px solid ${colors.border}`, verticalAlign: "top" };
export const numericCell: CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };

/**
 * State colours (docs/design/preview.html). One meaning each; bright fills always carry
 * `onState` (near-black) text and a word, never colour alone. Fallbacks are the light palette.
 */
export const state = {
  regress: "var(--tt-regress, #ff4d8b)",
  regressTint: "var(--tt-regress-tint, #ffd9e6)",
  regressText: "var(--tt-regress-text, #9c1048)",
  inconclusive: "var(--tt-inconclusive, #e8b94a)",
  inconclusiveTint: "var(--tt-inconclusive-tint, #f9ecc8)",
  featured: "var(--tt-featured, #1a3a3a)",
  featuredTint: "var(--tt-featured-tint, #dce9e5)",
  onFeatured: "var(--tt-on-featured, #ffffff)",
  novel: "var(--tt-novel, #b8a4ed)",
  novelTint: "var(--tt-novel-tint, #ebe4fb)",
  gap: "var(--tt-gap, #ffb084)",
  gapTint: "var(--tt-gap-tint, #ffe6d6)",
  covered: "var(--tt-covered, #a4d4c5)",
  coveredTint: "var(--tt-covered-tint, #e0f1eb)",
  onState: "var(--tt-on-state, #0a0a0a)",
  ink: "var(--tt-ink, #0a0a0a)",
  surface: "var(--tt-surface, #f5f0e0)",
  surfaceStrong: "var(--tt-surface-strong, #ebe6d6)",
  hairline: "var(--tt-hairline, #e5e0d0)",
} as const;

export const radius = { s: 8, m: 12, l: 16, xl: 24 } as const;

/** Mono stack for numbers, keys, builds and p-values. */
export const mono = 'var(--tt-mono, "JetBrains Mono", ui-monospace, Menlo, monospace)';
