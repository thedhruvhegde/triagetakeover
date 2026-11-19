/**
 * Condition signature of a cluster (ARCHITECTURE §5.10, PRD US-17 AC1).
 *
 * `chips` holds the signal chips present in at least 50 % of members, and `odd` holds the
 * road-type tags present in at least 50 % of members. Both come out in a canonical order,
 * so member order never changes the result.
 */
import { CONDITION_CHIPS, SIGNAL_CHIPS, type ConditionChip, type ConditionSignature, type TakeoverType } from "../schema/index.js";

/** Road-type ODD tags that count for the signature (SEED_DATA §6 `route`). */
export const ROAD_TYPES = ["highway", "rural", "urban"] as const;

/** The chip used for matching and display when a signature carries no signal chip. */
export const NORMAL_CHIP: ConditionChip = "normal";

/** What the signature needs from one member event. */
export interface SignatureMember {
  /** Condition chips of the event; `undefined` when no frame decoded (chips n/a). */
  readonly chips?: readonly ConditionChip[] | undefined;
  /** ODD tags of the event, taken from its drive session or the event's own `ctx.odd`. */
  readonly odd: readonly string[];
}

export interface SignatureOptions {
  /** Which ODD tags count as road types. Defaults to {@link ROAD_TYPES}. */
  readonly roadTypes?: readonly string[];
}

/** True when `count` is at least half of `known` (exact integer test, no float rounding). */
function isMajority(count: number, known: number): boolean {
  return known > 0 && 2 * count >= known;
}

/** Counts how many entries contain each value (each entry counts once per value). */
function countPresence(entries: readonly (readonly string[])[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const value of new Set(entry)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** Signal chips (never `normal`) present in at least half of the members whose chips are known. */
export function majorityChips(members: readonly SignatureMember[]): ConditionChip[] {
  const known = members.flatMap((m) => (m.chips === undefined ? [] : [m.chips]));
  const counts = countPresence(known);
  return SIGNAL_CHIPS.filter((chip) => isMajority(counts.get(chip) ?? 0, known.length));
}

/** Road-type tags present in at least half of the members that carry any ODD tag, sorted. */
export function majorityOdd(members: readonly SignatureMember[], roadTypes: readonly string[] = ROAD_TYPES): string[] {
  const known = members.filter((m) => m.odd.length > 0).map((m) => m.odd.filter((t) => roadTypes.includes(t)));
  const counts = countPresence(known);
  return [...counts.keys()].filter((tag) => isMajority(counts.get(tag) ?? 0, known.length)).sort();
}

/** Builds the condition signature for a cluster bucket and its member events. */
export function conditionSignature(
  bucket: { readonly type: TakeoverType; readonly variant: string },
  members: readonly SignatureMember[],
  opts: SignatureOptions = {},
): ConditionSignature {
  return {
    type: bucket.type,
    variant: bucket.variant,
    chips: majorityChips(members),
    odd: majorityOdd(members, opts.roadTypes),
  };
}

/**
 * Chips used for matching, grid rows and labels: the signature chips, or `["normal"]` when
 * the signature has none. A daytime cluster is then covered by a `cond:normal` test, not by
 * any test that happens to carry some `cond:` label.
 */
export function effectiveChips(sig: ConditionSignature): readonly ConditionChip[] {
  const chips = CONDITION_CHIPS.filter((c) => c !== NORMAL_CHIP && sig.chips.includes(c));
  return chips.length > 0 ? chips : [NORMAL_CHIP];
}

/** Deterministic display text: type x chips x variant x odd, e.g. `lane-loss x low-sun-glare x cam-B x highway`. */
export function signatureText(sig: ConditionSignature): string {
  return [sig.type, ...effectiveChips(sig), sig.variant, ...sig.odd].join(" x ");
}
