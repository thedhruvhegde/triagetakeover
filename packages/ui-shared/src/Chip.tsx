/**
 * StateChip: the small pill used for every state in the app (replaces Atlaskit Lozenge so the
 * palette in docs/design/preview.html applies exactly, and labels never truncate).
 * Bright tones carry near-black text; `featured` (deep teal) carries white. The label is always
 * a word, so the state never depends on colour alone.
 */
import type { ReactNode } from "react";
import { state } from "./theme.js";

export type ChipTone = "regress" | "inconclusive" | "featured" | "novel" | "gap" | "covered" | "neutral" | "outline" | "synthetic";

const TONE: Readonly<Record<ChipTone, { readonly bg: string; readonly fg: string; readonly border: string }>> = {
  regress: { bg: state.regress, fg: state.onState, border: state.regress },
  inconclusive: { bg: state.inconclusive, fg: state.onState, border: state.inconclusive },
  featured: { bg: state.featured, fg: state.onFeatured, border: state.featured },
  novel: { bg: state.novel, fg: state.onState, border: state.novel },
  gap: { bg: state.gap, fg: state.onState, border: state.gap },
  covered: { bg: state.covered, fg: state.onState, border: state.covered },
  neutral: { bg: state.surfaceStrong, fg: state.ink, border: state.surfaceStrong },
  outline: { bg: "transparent", fg: state.ink, border: "var(--tt-muted, #6a6a6a)" },
  synthetic: { bg: "transparent", fg: state.ink, border: state.ink },
};

export function StateChip({ tone, children, testId, title }: { readonly tone: ChipTone; readonly children: ReactNode; readonly testId?: string; readonly title?: string }) {
  const t = TONE[tone];
  return (
    <span
      data-testid={testId}
      data-tone={tone}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 8px",
        borderRadius: 999,
        border: `1px ${tone === "synthetic" ? "dashed" : "solid"} ${t.border}`,
        background: t.bg,
        color: t.fg,
        font: "normal 600 12px/18px var(--tt-font, Inter, ui-sans-serif, sans-serif)",
        letterSpacing: tone === "synthetic" ? "0.02em" : undefined,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
