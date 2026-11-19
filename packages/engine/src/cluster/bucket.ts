/**
 * Rule bucket = takeover type × sensor variant; the build is deliberately excluded (D5).
 */
import { bucketId, type BucketKey, type TakeoverType } from "../schema/index.js";
import { compareStrings } from "./order.js";

/** Builds a bucket key. `unknown` events get their own `unknown × variant` bucket. */
export function bucketOf(type: TakeoverType, variant: string): BucketKey {
  return { type, variant };
}

/** True for `unknown × variant` buckets, whose matches carry a warning chip (§5.8 step 1). */
export function isUnknownBucket(b: BucketKey): boolean {
  return b.type === "unknown";
}

/** Same bucket? */
export function sameBucket(a: BucketKey, b: BucketKey): boolean {
  return a.type === b.type && a.variant === b.variant;
}

/** One bucket's items, input order preserved. */
export interface BucketGroup<T> {
  readonly id: string;
  readonly bucket: BucketKey;
  readonly items: readonly T[];
}

/** Groups items by bucket; groups are sorted by bucket id (code-unit order). */
export function groupByBucket<T extends { readonly bucket: BucketKey }>(items: readonly T[]): BucketGroup<T>[] {
  const groups = new Map<string, { bucket: BucketKey; items: T[] }>();
  for (const item of items) {
    const id = bucketId(item.bucket);
    const g = groups.get(id);
    if (g) g.items.push(item);
    else groups.set(id, { bucket: item.bucket, items: [item] });
  }
  return [...groups.entries()]
    .sort(([a], [b]) => compareStrings(a, b))
    .map(([id, g]) => ({ id, bucket: g.bucket, items: g.items }));
}
