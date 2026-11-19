/**
 * Exact discrete statistics used by the onset test (ARCHITECTURE §5.9).
 * Pure, deterministic, dependency-free.
 */

const LANCZOS_G = 7;
const LANCZOS_COEF = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
] as const;

/** Natural log of the gamma function, Lanczos approximation (g=7, n=9). Valid for x > 0. */
export function logGamma(x: number): number {
  if (!(x > 0)) throw new RangeError(`logGamma requires x > 0, got ${x}`);
  if (x < 0.5) {
    // Reflection formula keeps precision for small x.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let a = LANCZOS_COEF[0];
  const t = z + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_COEF.length; i++) a += (LANCZOS_COEF[i] as number) / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** log C(n, k) */
export function logChoose(n: number, k: number): number {
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

function assertBinomialArgs(n: number, p: number): void {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`n must be a non-negative integer, got ${n}`);
  if (!(p >= 0 && p <= 1)) throw new RangeError(`p must be in [0,1], got ${p}`);
}

/** log P(X = k), X ~ Binomial(n, p). */
export function binomialLogPmf(k: number, n: number, p: number): number {
  assertBinomialArgs(n, p);
  if (k < 0 || k > n || !Number.isInteger(k)) return -Infinity;
  if (p === 0) return k === 0 ? 0 : -Infinity;
  if (p === 1) return k === n ? 0 : -Infinity;
  return logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p);
}

function logSumExp(xs: readonly number[]): number {
  let m = -Infinity;
  for (const x of xs) if (x > m) m = x;
  if (m === -Infinity) return -Infinity;
  let s = 0;
  for (const x of xs) s += Math.exp(x - m);
  return m + Math.log(s);
}

/** Upper tail P(X >= k), X ~ Binomial(n, p), summed in log space. */
export function binomialUpperTail(k: number, n: number, p: number): number {
  assertBinomialArgs(n, p);
  if (k <= 0) return 1;
  if (k > n) return 0;
  const terms: number[] = [];
  for (let i = k; i <= n; i++) terms.push(binomialLogPmf(i, n, p));
  return Math.min(1, Math.exp(logSumExp(terms)));
}

/** CDF P(X <= k). */
export function binomialCdf(k: number, n: number, p: number): number {
  return 1 - binomialUpperTail(k + 1, n, p);
}

function bisect(f: (x: number) => number, lo: number, hi: number): number {
  // f is monotone increasing on [lo, hi]; find root.
  for (let i = 0; i < 80 && hi - lo > 1e-15; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Two-sided Clopper-Pearson interval for a binomial proportion k/n at level 1-alpha. */
export function clopperPearson(k: number, n: number, alpha = 0.05): { lower: number; upper: number } {
  assertBinomialArgs(n, 0.5);
  if (!Number.isInteger(k) || k < 0 || k > n) throw new RangeError(`k must be an integer in [0, n]`);
  if (n === 0) return { lower: 0, upper: 1 };
  const half = alpha / 2;
  // lower: P(X >= k | p) = alpha/2, increasing in p
  const lower = k === 0 ? 0 : bisect((p) => binomialUpperTail(k, n, p) - half, 0, 1);
  // upper: P(X <= k | p) = alpha/2, decreasing in p, so negate
  const upper = k === n ? 1 : bisect((p) => half - binomialCdf(k, n, p), 0, 1);
  return { lower, upper };
}

/**
 * Holm-Bonferroni step-down adjustment. Returns adjusted p-values in the input order,
 * monotone and capped at 1.
 */
export function holm(pValues: readonly number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p || a.i - b.i);
  const adjusted = new Array<number>(m).fill(1);
  let running = 0;
  order.forEach(({ p, i }, rank) => {
    running = Math.max(running, Math.min(1, (m - rank) * p));
    adjusted[i] = running;
  });
  return adjusted;
}
