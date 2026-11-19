/**
 * Minimal, zero-dependency runtime validators ("decoders").
 *
 * A decoder takes an unknown value and a path, pushes every problem it finds onto
 * `errs`, and returns either the (re-built, unknown-key-stripped) value or `INVALID`.
 * Decoders never throw and collect all errors, not just the first.
 */
import { err, ok, type EngineError, type Result } from "./result.js";

/** Sentinel returned by a decoder that found an error. */
export const INVALID: unique symbol = Symbol("invalid");
export type Invalid = typeof INVALID;

/** A total validator from `unknown` to `T`. */
export type Decoder<T> = (input: unknown, path: string, errs: EngineError[]) => T | Invalid;

/** Output type of a decoder. */
export type DecodedOf<D> = D extends Decoder<infer T> ? T : never;

/** Joins a parent path and an object key. */
export function joinPath(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

function fail(errs: EngineError[], path: string, message: string): Invalid {
  errs.push({ code: "E_SCHEMA_INVALID", message, path });
  return INVALID;
}

function describe(u: unknown): string {
  if (u === null) return "null";
  if (Array.isArray(u)) return "array";
  if (typeof u === "number" && !Number.isFinite(u)) return String(u);
  return typeof u;
}

/** Runs a decoder at the root and wraps the outcome in a {@link Result}. */
export function run<T>(decoder: Decoder<T>, input: unknown): Result<T> {
  const errs: EngineError[] = [];
  const out = decoder(input, "", errs);
  if (out === INVALID || errs.length > 0) return err(errs);
  return ok(out);
}

export interface NumberOptions {
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}

/** A finite number, optionally an integer and within `[min, max]`. */
export function num(opts: NumberOptions = {}): Decoder<number> {
  return (u, path, errs) => {
    if (typeof u !== "number" || !Number.isFinite(u)) return fail(errs, path, `expected finite number, got ${describe(u)}`);
    if (opts.integer === true && !Number.isInteger(u)) return fail(errs, path, `expected integer, got ${u}`);
    if (opts.min !== undefined && u < opts.min) return fail(errs, path, `expected >= ${opts.min}, got ${u}`);
    if (opts.max !== undefined && u > opts.max) return fail(errs, path, `expected <= ${opts.max}, got ${u}`);
    return u;
  };
}

export interface StringOptions {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: RegExp;
}

/** A string, optionally length-bounded and matching `pattern`. */
export function str(opts: StringOptions = {}): Decoder<string> {
  return (u, path, errs) => {
    if (typeof u !== "string") return fail(errs, path, `expected string, got ${describe(u)}`);
    if (opts.minLength !== undefined && u.length < opts.minLength) return fail(errs, path, `expected length >= ${opts.minLength}`);
    if (opts.maxLength !== undefined && u.length > opts.maxLength) return fail(errs, path, `expected length <= ${opts.maxLength}`);
    if (opts.pattern !== undefined && !opts.pattern.test(u)) return fail(errs, path, `does not match ${String(opts.pattern)}`);
    return u;
  };
}

/** A boolean. */
export const bool: Decoder<boolean> = (u, path, errs) =>
  typeof u === "boolean" ? u : fail(errs, path, `expected boolean, got ${describe(u)}`);

/** Exactly the given primitive value. */
export function literal<const T extends string | number | boolean>(value: T): Decoder<T> {
  return (u, path, errs) => (u === value ? value : fail(errs, path, `expected ${JSON.stringify(value)}`));
}

/** One of a fixed list of string values. */
export function oneOf<const T extends string>(values: readonly T[]): Decoder<T> {
  return (u, path, errs) =>
    typeof u === "string" && (values as readonly string[]).includes(u)
      ? (u as T)
      : fail(errs, path, `expected one of ${values.join(", ")}`);
}

export interface ArrayOptions {
  readonly minLength?: number;
  readonly maxLength?: number;
}

/** An array whose items all satisfy `item`. */
export function arrayOf<T>(item: Decoder<T>, opts: ArrayOptions = {}): Decoder<readonly T[]> {
  return (u, path, errs) => {
    if (!Array.isArray(u)) return fail(errs, path, `expected array, got ${describe(u)}`);
    if (opts.minLength !== undefined && u.length < opts.minLength) return fail(errs, path, `expected >= ${opts.minLength} items`);
    if (opts.maxLength !== undefined && u.length > opts.maxLength) return fail(errs, path, `expected <= ${opts.maxLength} items`);
    const out: T[] = [];
    let bad = false;
    u.forEach((v: unknown, i) => {
      const d = item(v, `${path}[${i}]`, errs);
      if (d === INVALID) bad = true;
      else out.push(d);
    });
    return bad ? INVALID : out;
  };
}

/** `null` or a value satisfying `inner`. */
export function nullable<T>(inner: Decoder<T>): Decoder<T | null> {
  return (u, path, errs) => (u === null ? null : inner(u, path, errs));
}

/** True for a plain (non-null, non-array) object. */
export function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === "object" && u !== null && !Array.isArray(u);
}

type Shape = Readonly<Record<string, Decoder<unknown>>>;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
/** Object type produced by {@link object}: required keys plus optional keys. */
export type ObjectOf<R extends Shape, O extends Shape> = Simplify<
  { readonly [K in keyof R]: DecodedOf<R[K]> } & { readonly [K in keyof O]?: DecodedOf<O[K]> }
>;

/**
 * An object with `required` and `optional` keys. Unknown keys are dropped from the output
 * (forward-compatible, and keeps stray data out of re-serialised properties).
 */
export function object<R extends Shape, O extends Shape = Record<never, never>>(
  required: R,
  optional?: O,
): Decoder<ObjectOf<R, O>> {
  return (u, path, errs) => {
    if (!isRecord(u)) return fail(errs, path, `expected object, got ${describe(u)}`);
    const out: Record<string, unknown> = {};
    let bad = false;
    for (const key of Object.keys(required)) {
      const p = joinPath(path, key);
      if (!Object.prototype.hasOwnProperty.call(u, key)) {
        fail(errs, p, "is required");
        bad = true;
        continue;
      }
      const d = (required[key] as Decoder<unknown>)(u[key], p, errs);
      if (d === INVALID) bad = true;
      else out[key] = d;
    }
    for (const key of Object.keys(optional ?? {})) {
      if (!Object.prototype.hasOwnProperty.call(u, key) || u[key] === undefined) continue;
      const d = ((optional as O)[key] as Decoder<unknown>)(u[key], joinPath(path, key), errs);
      if (d === INVALID) bad = true;
      else out[key] = d;
    }
    return bad ? INVALID : (out as ObjectOf<R, O>);
  };
}

/**
 * An object whose keys are a subset of `keys` (all optional) and whose values satisfy
 * `value`. Keys outside `keys` are an error (e.g. `F11` in a feature map).
 */
export function partialRecord<K extends string, V>(keys: readonly K[], value: Decoder<V>): Decoder<Partial<Record<K, V>>> {
  return (u, path, errs) => {
    if (!isRecord(u)) return fail(errs, path, `expected object, got ${describe(u)}`);
    const out: Partial<Record<K, V>> = {};
    let bad = false;
    for (const key of Object.keys(u)) {
      const p = joinPath(path, key);
      if (!(keys as readonly string[]).includes(key)) {
        fail(errs, p, "unknown key");
        bad = true;
        continue;
      }
      const d = value(u[key], p, errs);
      if (d === INVALID) bad = true;
      else out[key as K] = d;
    }
    return bad ? INVALID : out;
  };
}

/** Applies an extra check after `inner` succeeds. `check` returns an error message or null. */
export function refine<T>(inner: Decoder<T>, check: (value: T) => string | null): Decoder<T> {
  return (u, path, errs) => {
    const d = inner(u, path, errs);
    if (d === INVALID) return INVALID;
    const msg = check(d);
    return msg === null ? d : fail(errs, path, msg);
  };
}
