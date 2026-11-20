/**
 * `@tt/ui-shared`: presentational React + Atlaskit components for the Custom UI apps.
 * Props are typed structurally (engine types only, ARCHITECTURE §4); no `@forge/bridge` import.
 */
export * from "./types.js";
export * from "./format.js";
export * from "./client.js";
export * from "./navigation.js";
export * from "./theme.js";
export { StateChip, type ChipTone } from "./Chip.js";
export * from "./plot-math.js";
export { SignalPlot, OverlayPlot, StripPlot, type SignalPlotProps, type OverlayPlotProps, type StripPlotProps, type PlotLayer } from "./SignalPlot.js";
export { WhyTable, type WhyTableProps, type ConditionTerm } from "./WhyTable.js";
export { GapGrid, gapCellLabel, type GapGridProps } from "./GapGrid.js";
export { OnsetBadge, OnsetBars, OnsetHowTo, verdictP, type OnsetBadgeProps, type OnsetBarsProps } from "./Onset.js";
export {
  EvidenceLink,
  EvidenceList,
  IssueLink,
  ConfidenceBadge,
  ConditionChips,
  SyntheticBadge,
  Disclaimer,
  SYNTHETIC_BADGE_TEXT,
  type EvidenceLinkProps,
  type ConfidenceBadgeProps,
  type ConditionChipsProps,
} from "./badges.js";
export { Loading, ApiErrorMessage, Warnings, StatusToast, Section, Notice, type NoticeAppearance } from "./status.js";
