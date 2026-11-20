/**
 * Onset presentation (ARCHITECTURE §5.9, PRD US-14): verdict badge with the p-value in plain
 * words, per-build bars of events per 1,000 km with the onset build marked, and the
 * "How is this computed?" expander with the formula and every input.
 */
import { StateChip, type ChipTone } from "./Chip.js";
import { formatKm, formatNumber, formatP, formatRatio, onsetVerdictLabel, pValueInWords } from "./format.js";
import { colors, font, space, visuallyHidden } from "./theme.js";
import type { OnsetLike, OnsetVerdict } from "./types.js";

const TONE: Readonly<Record<OnsetVerdict, ChipTone>> = {
  "regression-likely": "regress",
  inconclusive: "inconclusive",
  "no-evidence": "neutral",
  "not-enough-data": "outline",
};

/** The p-value used for the verdict sentence: Holm-adjusted when present, else the scan p. */
export function verdictP(onset: Pick<OnsetLike, "pHolm" | "pScan" | "pRaw">): number | null {
  return onset.pHolm ?? onset.pScan ?? onset.pRaw;
}

export interface OnsetBadgeProps {
  readonly onset: OnsetLike;
  /** Show the plain-words sentence below the badge (panel / expanded row). */
  readonly showWords?: boolean;
}

export function OnsetBadge({ onset, showWords = false }: OnsetBadgeProps) {
  const p = verdictP(onset);
  const build = onset.onsetBuild === null ? "" : ` at ${onset.onsetBuild}`;
  const words = onset.verdict === "not-enough-data" ? (onset.message ?? "Not enough data for an onset test.") : pValueInWords(p);
  return (
    <span data-testid="tt-onset-verdict" data-verdict={onset.verdict} style={{ display: "inline-flex", flexDirection: "column", gap: space.xs }}>
      <span style={{ display: "inline-flex", gap: space.xs, alignItems: "center", flexWrap: "wrap" }}>
        <StateChip tone={TONE[onset.verdict]}>{onsetVerdictLabel(onset.verdict)}</StateChip>
        {onset.verdict !== "not-enough-data" && (
          <span style={{ font: font.small, color: colors.subtle }}>
            {build.trim() !== "" && <>{build.trim()} · </>}p_raw {formatP(onset.pRaw)} · p_holm {formatP(onset.pHolm)}
          </span>
        )}
      </span>
      {showWords ? <span style={{ font: font.small, color: colors.subtle }}>{words}</span> : <span style={visuallyHidden}>{words}</span>}
    </span>
  );
}

export interface OnsetBarsProps {
  readonly onset: OnsetLike;
  readonly width?: number;
}

/** Events per 1,000 km per build; the onset build and later builds are marked "after". */
export function OnsetBars({ onset, width = 420 }: OnsetBarsProps) {
  const rows = onset.builds.map((b) => ({ ...b, rate: b.km > 0 ? (b.events / b.km) * 1000 : null }));
  if (rows.length === 0) {
    return (
      <p data-testid="tt-onset-bars" style={{ font: font.body, color: colors.subtle }}>
        No builds with events or exposure yet.
      </p>
    );
  }
  const max = Math.max(1e-9, ...rows.map((r) => r.rate ?? 0));
  const onsetIdx = onset.onsetBuild === null ? -1 : rows.findIndex((r) => r.build === onset.onsetBuild);
  const barH = 18;
  const gap = 8;
  const left = 80;
  const right = 200;
  const height = rows.length * (barH + gap);
  return (
    <figure style={{ margin: 0 }}>
      <svg data-testid="tt-onset-bars" overflow="visible" role="img" aria-label={`Events per 1,000 km by build. ${rows.map((r) => `${r.build}: ${r.events} events in ${formatKm(r.km)}${r.rate === null ? ", no exposure" : `, ${formatNumber(r.rate, 2)} per 1,000 km`}`).join("; ")}.`} viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width, display: "block", font: font.small }}>
        {rows.map((r, i) => {
          const y = i * (barH + gap);
          const after = onsetIdx >= 0 && i >= onsetIdx;
          const w = r.rate === null ? 0 : ((width - left - right) * r.rate) / max;
          return (
            <g key={r.build} data-build={r.build} data-after={after ? "true" : "false"}>
              <text x={left - 6} y={y + 13} textAnchor="end" fill={colors.text} fontSize={11} fontWeight={i === onsetIdx ? 700 : 400}>
                {r.build}
              </text>
              <rect x={left} y={y} width={Math.max(w, r.rate === null ? 0 : 1)} height={barH} fill={after ? colors.barAfter : colors.bar} />
              <text x={left + w + 6} y={y + 13} fill={colors.subtle} fontSize={11}>
                {r.rate === null ? `${r.events} ev, no km` : `${formatNumber(r.rate, 2)} (${r.events} ev / ${formatKm(r.km)})`}
                {i === onsetIdx ? " ← onset" : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption style={{ font: font.small, color: colors.subtlest }}>Events per 1,000 km of drive-session exposure, by build ({onset.exposureFilter}).</figcaption>
    </figure>
  );
}

/** Expandable formula + inputs (PRD US-14 AC4 "shown on hover or expand"). */
export function OnsetHowTo({ onset }: { readonly onset: OnsetLike }) {
  return (
    <details style={{ font: font.small, color: colors.text }}>
      <summary data-testid="tt-onset-howto" style={{ cursor: "pointer", color: colors.link }}>
        How is this computed?
      </summary>
      <div style={{ padding: `${space.s} 0` }}>
        <p style={{ margin: `0 0 ${space.xs}` }}>
          Exact conditional test for two Poisson rates: given n = k₁ + k₂ events, under &quot;no change&quot; k₂ ~ Binomial(n, e₂ / (e₁ + e₂)). The one-sided p-value is P(K ≥ k₂). Every boundary
          between consecutive builds is scanned; the smallest p is corrected for the {onset.boundariesTested} boundaries tested, then Holm-corrected across the {onset.holmFamilySize} tested clusters of this project (the board).
        </p>
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", columnGap: space.m, rowGap: 2, margin: 0 }}>
          <dt>Onset build</dt>
          <dd style={{ margin: 0 }}>{onset.onsetBuild ?? "–"}</dd>
          <dt>Before (k₁ / e₁)</dt>
          <dd style={{ margin: 0 }}>
            {onset.k1} events / {formatKm(onset.e1Km)} ({formatNumber(onset.ratePer1000kmBefore, 2)} per 1,000 km)
          </dd>
          <dt>After (k₂ / e₂)</dt>
          <dd style={{ margin: 0 }}>
            {onset.k2} events / {formatKm(onset.e2Km)} ({formatNumber(onset.ratePer1000kmAfter, 2)} per 1,000 km)
          </dd>
          <dt>Rate ratio (95% CI)</dt>
          <dd style={{ margin: 0 }}>
            {formatRatio(onset.rateRatio)}
            {onset.rrCi95 !== null && ` (${formatRatio(onset.rrCi95[0])} to ${formatRatio(onset.rrCi95[1])})`}
          </dd>
          <dt>p raw / scan / Holm</dt>
          <dd style={{ margin: 0 }}>
            {formatP(onset.pRaw)} / {formatP(onset.pScan)} / {formatP(onset.pHolm)}
          </dd>
          <dt>Exposure</dt>
          <dd style={{ margin: 0 }}>{onset.exposureFilter}</dd>
          {onset.buildsWithoutExposure.length > 0 && (
            <>
              <dt>Builds without exposure</dt>
              <dd style={{ margin: 0 }}>{onset.buildsWithoutExposure.join(", ")}</dd>
            </>
          )}
        </dl>
        <p style={{ margin: `${space.xs} 0 0` }}>{onset.headline}</p>
        {onset.caveats.length > 0 && (
          <ul style={{ margin: `${space.xs} 0 0`, paddingLeft: space.m }}>
            {onset.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
        <p style={{ margin: `${space.xs} 0 0`, color: colors.subtle }}>A p-value is not the probability that the build caused the increase. Use it as a screening signal.</p>
      </div>
    </details>
  );
}
