/** Small numeric helpers shared by the telemetry and render modules. */

/** Clamps x to [lo, hi]. */
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** Polynomial smoothstep on [0, 1] (no `exp`, §8.2). */
export function smoothstep(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

/** Linear interpolation. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Rounds to a multiple of `q`, never returning −0. */
export function quantize(x: number, q: number): number {
  const v = Math.round(x / q) * q;
  return v === 0 ? 0 : v;
}

/** Rounds to `d` decimals (deterministic; `toFixed` is exactly specified). */
export const round = (x: number, d: number): number => Number(x.toFixed(d));
