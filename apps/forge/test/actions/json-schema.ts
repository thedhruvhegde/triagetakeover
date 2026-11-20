/**
 * A small JSON Schema (draft 2020-12) validator for the subset the action schemas use:
 * type, const, enum, required, properties, additionalProperties (schema form), items,
 * minItems, maxItems, maxLength, minimum, maximum, not, $ref to `#/$defs/...`.
 *
 * Ajv is not a direct dependency of the workspace (ARCHITECTURE §16 names it for CI); this
 * keeps the contract tests dependency-free. Unknown keywords make the validator throw, so a
 * schema can never silently use something this file does not check.
 */
type Schema = { readonly [k: string]: unknown };

const KNOWN = new Set(["$id", "$defs", "$ref", "type", "const", "enum", "required", "properties", "additionalProperties", "items", "minItems", "maxItems", "maxLength", "minimum", "maximum", "not", "description"]);

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function typeMatches(v: unknown, t: string): boolean {
  const actual = typeOf(v);
  if (t === "number") return actual === "number" || actual === "integer";
  return actual === t;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Returns a list of problems; empty means valid. */
export function validate(value: unknown, schema: Schema, root: Schema = schema, path = "$"): string[] {
  for (const k of Object.keys(schema)) if (!KNOWN.has(k)) throw new Error(`json-schema: unsupported keyword ${k} at ${path}`);
  const out: string[] = [];
  if (typeof schema["$ref"] === "string") {
    const ref = schema["$ref"];
    const m = /^#\/\$defs\/(.+)$/.exec(ref);
    const defs = root["$defs"] as Record<string, Schema> | undefined;
    const target = m?.[1] !== undefined ? defs?.[m[1]] : undefined;
    if (target === undefined) throw new Error(`json-schema: unresolved $ref ${ref}`);
    return validate(value, target, root, path);
  }
  if ("const" in schema && !deepEqual(value, schema["const"])) out.push(`${path}: expected const ${JSON.stringify(schema["const"])}`);
  if (Array.isArray(schema["enum"]) && !schema["enum"].some((e) => deepEqual(e, value))) out.push(`${path}: ${JSON.stringify(value)} not in enum`);
  if (schema["type"] !== undefined) {
    const types = Array.isArray(schema["type"]) ? (schema["type"] as string[]) : [schema["type"] as string];
    if (!types.some((t) => typeMatches(value, t))) {
      out.push(`${path}: expected ${types.join("|")}, got ${typeOf(value)}`);
      return out;
    }
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) out.push(`${path}: non-finite number`);
    if (typeof schema["minimum"] === "number" && value < schema["minimum"]) out.push(`${path}: below minimum`);
    if (typeof schema["maximum"] === "number" && value > schema["maximum"]) out.push(`${path}: above maximum`);
  }
  if (typeof value === "string" && typeof schema["maxLength"] === "number" && [...value].length > schema["maxLength"]) out.push(`${path}: longer than ${schema["maxLength"]}`);
  if (Array.isArray(value)) {
    if (typeof schema["minItems"] === "number" && value.length < schema["minItems"]) out.push(`${path}: fewer than ${schema["minItems"]} items`);
    if (typeof schema["maxItems"] === "number" && value.length > schema["maxItems"]) out.push(`${path}: more than ${schema["maxItems"]} items`);
    if (schema["items"] !== undefined) value.forEach((v, i) => out.push(...validate(v, schema["items"] as Schema, root, `${path}[${i}]`)));
  }
  if (typeOf(value) === "object") {
    const obj = value as Record<string, unknown>;
    for (const r of (schema["required"] as string[] | undefined) ?? []) if (!(r in obj) || obj[r] === undefined) out.push(`${path}: missing ${r}`);
    const props = (schema["properties"] as Record<string, Schema> | undefined) ?? {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      const p = props[k];
      if (p !== undefined) out.push(...validate(v, p, root, `${path}.${k}`));
      else if (schema["additionalProperties"] !== undefined && typeof schema["additionalProperties"] === "object") out.push(...validate(v, schema["additionalProperties"] as Schema, root, `${path}.${k}`));
      else if (schema["additionalProperties"] === false) out.push(`${path}: unexpected property ${k}`);
    }
  }
  if (schema["not"] !== undefined && validate(value, schema["not"] as Schema, root, path).length === 0) out.push(`${path}: matches a forbidden schema (not)`);
  return out;
}
