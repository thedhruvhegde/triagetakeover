/**
 * Canonical orderings used for every deterministic tie-break (ARCHITECTURE §5.8).
 * Plain code-unit comparison only (no localeCompare, which depends on Intl/ICU).
 */

/** -1 / 0 / 1 comparison that is safe for ±Infinity (unlike `a - b`). */
export function compareNumbers(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Code-unit string comparison, independent of locale. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Trailing issue number of a key such as "ADAS-305", or null. */
export function issueNumberOf(key: string): number | null {
  const m = /-(\d+)$/.exec(key);
  return m?.[1] === undefined ? null : Number(m[1]);
}

/**
 * Orders issue keys by trailing issue number ("lowest issue number" rule), then by
 * the full string. Keys without a number sort after keys with one.
 */
export function compareIssueKeys(a: string, b: string): number {
  const na = issueNumberOf(a);
  const nb = issueNumberOf(b);
  if (na !== null && nb !== null && na !== nb) return na - nb;
  if (na !== null && nb === null) return -1;
  if (na === null && nb !== null) return 1;
  return compareStrings(a, b);
}

/** Something with an issue identity. */
export interface Keyed {
  readonly key: string;
  readonly issueNumber: number;
}

/** Canonical event order: issue number, then key. */
export function compareKeyed(a: Keyed, b: Keyed): number {
  return compareNumbers(a.issueNumber, b.issueNumber) || compareStrings(a.key, b.key);
}

/** A sorted copy in canonical order. */
export function canonicalSort<T extends Keyed>(items: readonly T[]): T[] {
  return [...items].sort(compareKeyed);
}
