/**
 * Small presentational pieces: EvidenceLink, ConfidenceBadge, ConditionChips, SyntheticBadge,
 * Disclaimer.
 */
import Lozenge from "@atlaskit/lozenge";
import type { ConditionChip } from "@tt/engine";
import { useId, useState, type MouseEvent, type ReactNode } from "react";
import { formatPercent } from "./format.js";
import { useNavigator } from "./navigation.js";
import { colors, font, space, visuallyHidden } from "./theme.js";
import type { ChipLike, ConfidenceLike, EvidenceLike } from "./types.js";

// ------------------------------------------------------------------ EvidenceLink

export interface EvidenceLinkProps {
  readonly evidence: EvidenceLike;
  /** Position in the list; gives the `tt-evidence-link-<n>` test id. */
  readonly index?: number;
  readonly children?: ReactNode;
}

/**
 * A link to an issue (or other evidence) opened with the Forge router (`router.open`), never
 * `window.open` / `target=_blank`: the iframe has no `allow-popups` (ARCHITECTURE §14).
 * A real `href` keeps it a normal, keyboard-focusable link.
 */
export function EvidenceLink({ evidence, index, children }: EvidenceLinkProps) {
  const nav = useNavigator();
  const onClick = (e: MouseEvent<HTMLAnchorElement>): void => {
    e.preventDefault();
    void nav.open(evidence.url);
  };
  return (
    <a
      href={evidence.url}
      onClick={onClick}
      data-testid={index === undefined ? undefined : `tt-evidence-link-${index}`}
      data-evidence-kind={evidence.kind}
      style={{ color: colors.link }}
    >
      {children ?? evidence.label}
    </a>
  );
}

/** A key → `/browse/KEY` evidence link. */
export function IssueLink({ issueKey, index, children }: { readonly issueKey: string; readonly index?: number; readonly children?: ReactNode }) {
  return (
    <EvidenceLink evidence={{ kind: "issue", key: issueKey, url: `/browse/${encodeURIComponent(issueKey)}`, label: issueKey }} {...(index === undefined ? {} : { index })}>
      {children}
    </EvidenceLink>
  );
}

/** An inline, comma-separated evidence list. */
export function EvidenceList({ evidence, label = "Evidence", startIndex = 0 }: { readonly evidence: readonly EvidenceLike[]; readonly label?: string; readonly startIndex?: number }) {
  if (evidence.length === 0) return null;
  return (
    <p style={{ font: font.small, color: colors.subtle, margin: `${space.xs} 0` }} data-testid="tt-evidence-list">
      {label}:{" "}
      {evidence.map((e, i) => (
        <span key={`${e.url}-${i}`}>
          {i > 0 ? ", " : ""}
          <EvidenceLink evidence={e} index={startIndex + i} />
        </span>
      ))}
    </p>
  );
}

// ------------------------------------------------------------------ ConfidenceBadge

export interface ConfidenceBadgeProps {
  readonly confidence: ConfidenceLike;
  readonly label?: string;
  readonly testId?: string;
}

/**
 * "Confidence 78%" with its definition always reachable: a native `title` on hover, and a
 * keyboard-operable "what is this?" toggle that shows the definition inline (no popup layer,
 * which keeps Atlaskit's top-layer/popper code out of the bundle).
 */
export function ConfidenceBadge({ confidence, label = "Confidence", testId = "tt-confidence" }: ConfidenceBadgeProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const inputs = confidence.inputs === undefined ? "" : Object.entries(confidence.inputs).map(([k, v]) => `${k} = ${Number.isFinite(v) ? Number(v.toPrecision(3)) : "–"}`).join(", ");
  const explanation = `${confidence.definition}${inputs === "" ? "" : ` (${inputs})`}`;
  return (
    <span data-testid={testId} data-value={confidence.value} style={{ display: "inline-flex", flexWrap: "wrap", gap: space.xs, alignItems: "baseline", font: font.body }}>
      <span title={explanation}>
        {label} <strong>{formatPercent(confidence.value)}</strong>
      </span>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-def`}
        onClick={() => setOpen(!open)}
        data-testid={`${testId}-toggle`}
        style={{ background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "0 6px", font: font.small, color: colors.subtle, cursor: "pointer" }}
      >
        <span aria-hidden="true">?</span>
        <span style={visuallyHidden}>How is {label.toLowerCase()} defined?</span>
      </button>
      <span id={`${id}-def`} hidden={!open} style={{ font: font.small, color: colors.subtle, flexBasis: "100%" }}>
        {explanation}
      </span>
    </span>
  );
}

// ------------------------------------------------------------------ ConditionChips

const CHIP_LABEL: Readonly<Record<ConditionChip, string>> = {
  night: "night",
  "low-sun-glare": "low-sun-glare",
  "blur-rain": "blur-rain",
  normal: "normal",
};

export interface ConditionChipsProps {
  readonly chips: readonly (ChipLike | ConditionChip)[];
  /** Show the rule that fired next to each chip (panel); the board shows names only. */
  readonly showRules?: boolean;
  /** Shown when there are no chips (e.g. no frames decoded). */
  readonly emptyText?: string;
  /** PRD US-08 AC4: chips are image statistics, not scene understanding. */
  readonly caption?: boolean;
}

/** Condition chips with the metric and threshold that fired each one (PRD US-08 AC2). */
export function ConditionChips({ chips, showRules = false, emptyText = "n/a", caption = false }: ConditionChipsProps) {
  const list: ChipLike[] = chips.map((c) => (typeof c === "string" ? { chip: c, rules: [] } : c));
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: space.xs, alignItems: "center" }} data-testid="tt-chips">
      {list.length === 0 && <span style={{ color: colors.subtlest }}>{emptyText}</span>}
      {list.map((c) => {
        const rules = c.rules.join("; ");
        return (
          <span key={c.chip} data-testid={`tt-chip-${c.chip}`} style={{ display: "inline-flex", gap: space.xs, alignItems: "center" }}>
            <Lozenge appearance={c.chip === "normal" ? "default" : "moved"}>{CHIP_LABEL[c.chip]}</Lozenge>
            {showRules && rules !== "" && <span style={{ font: font.small, color: colors.subtle }}>{rules}</span>}
            {!showRules && rules !== "" && <span style={visuallyHidden}>({rules})</span>}
          </span>
        );
      })}
      {caption && <span style={{ font: font.small, color: colors.subtlest }}>Image statistics, not scene understanding.</span>}
    </span>
  );
}

// ------------------------------------------------------------------ SyntheticBadge / Disclaimer

/** DEMO_SCRIPT §1 rule 1: shown whenever seeded data is on screen. */
export const SYNTHETIC_BADGE_TEXT = "SYNTHETIC DEMO DATA: no real fleet, vehicles or people";

export function SyntheticBadge({ show = true }: { readonly show?: boolean }) {
  if (!show) return null;
  return (
    <span data-testid="tt-synthetic-badge" role="note">
      <Lozenge appearance="new" isBold>
        {SYNTHETIC_BADGE_TEXT}
      </Lozenge>
    </span>
  );
}

/** Footer disclaimer (ARCHITECTURE §14 "Not a safety tool"); text comes from the backend. */
export function Disclaimer({ text }: { readonly text: string }) {
  return (
    <p data-testid="tt-disclaimer" style={{ font: font.small, color: colors.subtlest, marginTop: space.l }}>
      {text}
    </p>
  );
}
