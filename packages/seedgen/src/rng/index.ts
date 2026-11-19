/**
 * Deterministic randomness (SEED_DATA §4.1, §4.2): splitmix32 seeding, xoshiro128** streams,
 * label-forked substreams, and the few distributions the generator needs.
 * Integer ops only for the generator itself; `poisson` uses `Math.exp` (allowed, §4.3).
 */
import { utf8Encode } from "../util/utf8.js";

/** murmur3 32-bit finaliser. */
export function fmix32(h: number): number {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Returns a splitmix32 generator for `seed` (each call yields a uint32). */
export function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/** Hashes `(seed, label)` into a new uint32 seed: murmur3-style mixing over the UTF-8 label, then fmix32. */
export function hashLabel(seed: number, label: string): number {
  const bytes = utf8Encode(label);
  let h = fmix32((seed ^ 0x9e3779b9) >>> 0);
  for (const b of bytes) {
    h = Math.imul(h ^ b, 0x5bd1e995) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
  }
  return fmix32((h ^ bytes.length) >>> 0);
}

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/** A xoshiro128** stream. Forking by label gives order-independent substreams. */
export class Rng {
  /** The uint32 seed this stream was created from (forks hash it with their label). */
  readonly seed: number;
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    const sm = splitmix32(this.seed);
    this.s0 = sm();
    this.s1 = sm();
    this.s2 = sm();
    this.s3 = sm();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** Next uint32 output of xoshiro128**. */
  next(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Independent substream named by `label` (depends only on this stream's seed and the label). */
  fork(label: string): Rng {
    return new Rng(hashLabel(this.seed, label));
  }

  /** Exact 24-bit uniform in [0, 1). */
  uniform(): number {
    return (this.next() >>> 8) / 16777216;
  }

  /** Uniform in [a, b). */
  range(a: number, b: number): number {
    return a + (b - a) * this.uniform();
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.uniform() * n);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.uniform() < p;
  }

  /** Irwin–Hall approximation of N(0, 1): sum of 12 uniforms minus 6 (bounded at ±6). */
  normal(): number {
    let s = 0;
    for (let i = 0; i < 12; i++) s += this.uniform();
    return s - 6;
  }

  /** Poisson(λ): Knuth multiplication for λ ≤ 30, rounded normal approximation above. */
  poisson(lambda: number): number {
    if (!(lambda > 0)) return 0;
    if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * this.normal()));
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = this.uniform();
    while (p > limit) {
      k++;
      p *= this.uniform();
    }
    return k;
  }

  /** Uniformly chosen element. Throws on an empty list (a generator bug, never user input). */
  pick<T>(items: readonly T[]): T {
    const v = items[this.int(items.length)];
    if (v === undefined) throw new RangeError("pick from empty list");
    return v;
  }

  /** Index drawn with probability proportional to `weights` (all ≥ 0, sum > 0). */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    let u = this.uniform() * total;
    for (let i = 0; i < weights.length; i++) {
      u -= weights[i] ?? 0;
      if (u < 0) return i;
    }
    return weights.length - 1;
  }

  /** Fisher–Yates shuffle into a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const a = out[i] as T;
      out[i] = out[j] as T;
      out[j] = a;
    }
    return out;
  }
}

/** Root stream for a seed. `stream(seed, "event:x")` equals `new Rng(seed).fork("event:x")`. */
export function stream(seed: number, label: string): Rng {
  return new Rng(seed).fork(label);
}
