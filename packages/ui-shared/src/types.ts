/**
 * Prop types of the shared components.
 *
 * `ui-shared` may import engine TYPES only and never imports `apps/*` (ARCHITECTURE §4), so the
 * shapes below are declared structurally. They are deliberately the same shapes as the
 * `apps/forge/src/contract/ui-api.ts` views, so a contract value can be passed straight in;
 * the apps' typecheck proves the two stay compatible.
 */
import type { ConditionChip, TakeoverType } from "@tt/engine";

/** A link to the data a statement is based on. `url` is site-relative (`/browse/KEY`). */
export interface EvidenceLike {
  readonly kind?: string;
  readonly key?: string;
  readonly url: string;
  readonly label: string;
}

/** A confidence value with its definition (PRD US-09 AC4). */
export interface ConfidenceLike {
  /** 0..1. */
  readonly value: number;
  readonly definition: string;
  readonly inputs?: Readonly<Record<string, number>>;
}

/** One why-table row (ARCHITECTURE §5.7). */
export interface WhyRowLike {
  readonly feature: string;
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly eventValue: number | null;
  readonly referenceValue: number | null;
  readonly z: number | null;
  readonly contribution: number | null;
  readonly note: string;
}

/** A 10 Hz telemetry window, decoded (null = masked / NaN sample). */
export interface SeriesLike {
  readonly key: string;
  readonly hz: number;
  /** Seconds relative to the takeover (window starts at -15 s). */
  readonly tStart: number;
  readonly channels: Readonly<Record<string, readonly (number | null)[]>>;
}

export interface ChipLike {
  readonly chip: ConditionChip;
  /** e.g. "sunBlob 0.009 >= 0.004". */
  readonly rules: readonly string[];
}

export interface GapGridLike {
  readonly columns: readonly TakeoverType[];
  readonly rows: readonly {
    readonly dimension: "cond" | "odd";
    readonly value: string;
    readonly cells: readonly { readonly type: TakeoverType; readonly events: number; readonly tests: number; readonly gap: boolean }[];
  }[];
}

export type OnsetVerdict = "regression-likely" | "inconclusive" | "no-evidence" | "not-enough-data";

export interface OnsetLike {
  readonly verdict: OnsetVerdict;
  readonly onsetBuild: string | null;
  readonly k1: number;
  readonly e1Km: number;
  readonly k2: number;
  readonly e2Km: number;
  readonly ratePer1000kmBefore: number | null;
  readonly ratePer1000kmAfter: number | null;
  readonly rateRatio: number | "∞" | null;
  readonly rrCi95: readonly [number | "∞", number | "∞"] | null;
  readonly pRaw: number | null;
  readonly pScan: number | null;
  readonly pHolm: number | null;
  readonly holmFamilySize: number;
  readonly boundariesTested: number;
  readonly exposureFilter: string;
  readonly buildsWithoutExposure: readonly string[];
  readonly builds: readonly { readonly build: string; readonly events: number; readonly km: number }[];
  readonly headline: string;
  readonly message?: string;
  readonly caveats: readonly string[];
}
