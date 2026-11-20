/**
 * Jira-side contract constants: entity property keys (§6.1), the labels the app relies on
 * (§7.1, §9, §5.10) and the `jira:entityProperty` JQL aliases declared in manifest.yml
 * (test/manifest.test.ts keeps this mirror in sync).
 */

export const PROPERTY_KEYS = {
  event: "tt.event",
  thumbs: "tt.thumbs",
  triage: "tt.triage",
  cluster: "tt.cluster",
  scenario: "tt.scenario",
  /** `{seed, gen, itemId}` on seeded issues (SEED_DATA §15.1). */
  seed: "tt.seed",
} as const;

export const LABELS = {
  takeover: "tt-takeover",
  cluster: "tt-cluster",
  scenario: "tt-scenario",
  synthetic: "tt-synthetic",
} as const;

/** `[SYNTHETIC]` summary prefix for every seeded item (§9 honesty). */
export const SYNTHETIC_SUMMARY_PREFIX = "[SYNTHETIC]";

export type PropertyIndexType = "number" | "string" | "text" | "date" | "user";

export interface PropertyIndexDef {
  readonly propertyKey: string;
  /** Dotted path inside the property value. */
  readonly path: string;
  readonly type: PropertyIndexType;
  readonly alias: string;
}

/** Mirror of `modules.jira:entityProperty` in manifest.yml. SPIKE-E1: indexing and lag unverified. */
export const PROPERTY_INDEXES: readonly PropertyIndexDef[] = [
  { propertyKey: "tt.event", path: "v", type: "number", alias: "ttV" },
  { propertyKey: "tt.event", path: "sig.type", type: "string", alias: "ttType" },
  { propertyKey: "tt.event", path: "ctx.variant", type: "string", alias: "ttVariant" },
  { propertyKey: "tt.event", path: "ctx.build", type: "string", alias: "ttBuild" },
  { propertyKey: "tt.event", path: "ctx.occurredAt", type: "date", alias: "ttOccurred" },
  { propertyKey: "tt.seed", path: "itemId", type: "string", alias: "ttSeedItem" },
  { propertyKey: "tt.seed", path: "seed", type: "number", alias: "ttSeed" },
];

/** JQL alias names, for building queries without typos. */
export const JQL_ALIASES = {
  v: "ttV",
  type: "ttType",
  variant: "ttVariant",
  build: "ttBuild",
  occurred: "ttOccurred",
  seedItem: "ttSeedItem",
  seed: "ttSeed",
} as const;

/** Quotes a value for JQL (always double quotes; escapes `"` and `\`). */
export function jqlQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
