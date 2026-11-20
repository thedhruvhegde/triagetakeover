/** Loads the SPIKE-A2 context fixtures and builds Forge `(payload, context)` arguments from them. */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface ContextFixture {
  readonly name: string;
  readonly caller: string;
  readonly inputStyle: "native" | "strings" | "nested";
  readonly payloadContext: unknown;
  readonly invocationContext: unknown;
}

const DIR = fileURLToPath(new URL("../fixtures/contexts/", import.meta.url));

export const FIXTURE_NAMES = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

export function loadFixture(name: string, vars: { issueKey?: string; projectKey?: string } = {}): ContextFixture {
  const text = readFileSync(`${DIR}${name}.json`, "utf8")
    .replaceAll("{{issueKey}}", vars.issueKey ?? "TTDEMO-1")
    .replaceAll("{{projectKey}}", vars.projectKey ?? "TTDEMO");
  const raw = JSON.parse(text) as Omit<ContextFixture, "name">;
  return { name, ...raw };
}

function encode(v: unknown, style: ContextFixture["inputStyle"]): unknown {
  return style === "strings" && (typeof v === "number" || typeof v === "boolean") ? String(v) : v;
}

/** The two handler arguments for `inputs` as this caller would send them. */
export function invocationArgs(f: ContextFixture, inputs: Record<string, unknown>): [Record<string, unknown>, unknown] {
  const encoded = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, encode(v, f.inputStyle)]));
  const payload = f.inputStyle === "nested" ? { inputs: encoded, context: f.payloadContext } : { ...encoded, context: f.payloadContext };
  return [payload, f.invocationContext];
}
