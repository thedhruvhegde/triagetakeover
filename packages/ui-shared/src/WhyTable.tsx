/**
 * WhyTable: per-feature values, reference (cluster profile) values, z and share of the signal
 * distance, plus the condition (chip) term and the deciding rule texts (ARCHITECTURE §5.7,
 * PRD US-10 AC1). Missing features are shown with their note ("n/a (channel not mapped)").
 */
import type { ConditionChip } from "@tt/engine";
import { formatNumber, formatPercent } from "./format.js";
import { colors, font, numericCell, space, tableStyle, tdStyle, thStyle, visuallyHidden } from "./theme.js";
import type { WhyRowLike } from "./types.js";

export interface ConditionTerm {
  /** λ · Hamming distance over the signal chips. */
  readonly dCond: number;
  readonly chipDifference: readonly ConditionChip[];
}

export interface WhyTableProps {
  readonly rows: readonly WhyRowLike[];
  readonly caption?: string;
  /** Header of the reference column, e.g. "Cluster TTDEMO-5". */
  readonly referenceLabel?: string;
  readonly conditionTerm?: ConditionTerm;
  /** Deciding rule texts; the first "Bucket: …" line gets the `tt-why-bucket-rule` id. */
  readonly headlines?: readonly string[];
  readonly testId?: string;
}

function ContributionBar({ value }: { readonly value: number | null }) {
  if (value === null) return <span style={{ color: colors.subtlest }}>–</span>;
  const pct = Math.min(1, Math.max(0, value));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: space.xs, justifyContent: "flex-end", width: "100%" }}>
      <span aria-hidden="true" style={{ display: "inline-block", width: 60, height: 8, background: colors.neutral, borderRadius: 2 }}>
        <span style={{ display: "block", width: `${pct * 100}%`, height: 8, background: colors.series[0], borderRadius: 2 }} />
      </span>
      <span>{formatPercent(pct)}</span>
    </span>
  );
}

export function WhyTable({ rows, caption = "Why: feature contributions to the signal distance", referenceLabel = "Cluster reference", conditionTerm, headlines = [], testId = "tt-why-table" }: WhyTableProps) {
  const ranked = [...rows].sort((a, b) => (b.contribution ?? -1) - (a.contribution ?? -1) || a.feature.localeCompare(b.feature, "en", { numeric: true }));
  return (
    <div data-testid={testId}>
      {headlines.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: `0 0 ${space.s}`, font: font.body }}>
          {headlines.map((h, i) => (
            <li key={`${i}-${h}`} data-testid={h.startsWith("Bucket") ? "tt-why-bucket-rule" : i === headlines.length - 1 ? "tt-why-headline" : `tt-why-line-${i}`}>
              {h}
            </li>
          ))}
        </ul>
      )}
      <table style={tableStyle}>
        <caption style={{ textAlign: "left", font: font.small, color: colors.subtle, paddingBottom: space.xs }}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col" style={thStyle}>Feature</th>
            <th scope="col" style={{ ...thStyle, textAlign: "right" }}>This event</th>
            <th scope="col" style={{ ...thStyle, textAlign: "right" }}>{referenceLabel}</th>
            <th scope="col" style={{ ...thStyle, textAlign: "right" }}>
              z<span style={visuallyHidden}> (difference in feature scales)</span>
            </th>
            <th scope="col" style={{ ...thStyle, textAlign: "right" }}>Share of distance</th>
            <th scope="col" style={thStyle}>Note</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => (
            <tr key={r.feature} data-testid={`tt-why-row-${r.feature}`}>
              <th scope="row" style={{ ...tdStyle, fontWeight: 400, textAlign: "left" }}>
                <span style={{ font: font.small, color: colors.subtlest }}>{r.feature}</span> {r.label}
                {r.unit !== "" && r.unit !== "-" && <span style={{ color: colors.subtlest }}> ({r.unit})</span>}
              </th>
              <td style={numericCell}>{formatNumber(r.eventValue, 3)}</td>
              <td style={numericCell}>{formatNumber(r.referenceValue, 3)}</td>
              <td style={numericCell}>{formatNumber(r.z, 2)}</td>
              <td style={numericCell}>
                <ContributionBar value={r.contribution} />
              </td>
              <td style={{ ...tdStyle, color: colors.subtle, font: font.small }}>{r.note}</td>
            </tr>
          ))}
          {conditionTerm !== undefined && (
            <tr data-testid="tt-why-condition-term">
              <th scope="row" style={{ ...tdStyle, fontWeight: 400, textAlign: "left" }}>
                Condition chips <span style={{ color: colors.subtlest }}>(Hamming term)</span>
              </th>
              <td style={numericCell} colSpan={4}>
                d_cond = {formatNumber(conditionTerm.dCond, 2)}
              </td>
              <td style={{ ...tdStyle, color: colors.subtle, font: font.small }}>
                {conditionTerm.chipDifference.length === 0 ? "Same chips" : `Differs: ${conditionTerm.chipDifference.join(", ")}`}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
