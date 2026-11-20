/**
 * JSON Schemas (draft 2020-12 subset) for the Rovo action / MCP tool responses
 * (ARCHITECTURE §10.3). `ENVELOPE_SCHEMA` is the common envelope; `DATA_SCHEMAS` describes
 * `data` per action when `ok` is true. They are plain data: the contract tests validate every
 * action response against them, and they document the contract for agents and MCP clients.
 *
 * Kept free of runtime dependencies (no Ajv in the Forge bundle).
 */
import type { ActionKey } from "../validation/actions";

export type JsonSchema = { readonly [k: string]: unknown };

const num = { type: "number" } as const;
const int = { type: "integer" } as const;
const strT = { type: "string" } as const;
const bool = { type: "boolean" } as const;
const strArr = { type: "array", items: strT } as const;
const numOrNull = { type: ["number", "null"] } as const;

/** §10.3 envelope, verbatim apart from `error.retryable` and the `clusterRef.id/url` extras. */
export const ENVELOPE_SCHEMA: JsonSchema = {
  $id: "tt/envelope.v1",
  type: "object",
  required: ["schemaVersion", "ok", "status", "headline", "evidence", "warnings"],
  properties: {
    schemaVersion: { const: "1" },
    ok: bool,
    status: { enum: ["ok", "not-enough-data", "no-signal-data", "novel", "ambiguous", "forbidden-or-not-found", "invalid-input", "needs-confirmation", "error"] },
    headline: { type: "string", maxLength: 300 },
    data: { type: "object" },
    confidence: {
      type: "object",
      required: ["value", "definition"],
      properties: {
        value: { type: "number", minimum: 0, maximum: 1 },
        definition: strT,
        inputs: { type: "object", additionalProperties: num },
      },
    },
    why: { type: "array", items: { $ref: "#/$defs/whyRow" }, maxItems: 12 },
    evidence: { type: "array", items: { $ref: "#/$defs/evidence" }, maxItems: 30 },
    caveats: strArr,
    nextSteps: strArr,
    warnings: strArr,
    error: { type: "object", required: ["code", "message"], properties: { code: strT, message: strT, retryable: bool } },
  },
  $defs: {
    evidence: {
      type: "object",
      required: ["kind", "url", "label"],
      properties: {
        kind: { enum: ["issue", "attachment", "property", "driveSessions", "scenario", "jql", "rule"] },
        key: strT,
        id: strT,
        url: strT,
        label: strT,
      },
    },
    whyRow: {
      type: "object",
      required: ["feature", "eventValue", "referenceValue", "contribution"],
      properties: {
        feature: strT,
        unit: strT,
        eventValue: numOrNull,
        referenceValue: numOrNull,
        z: numOrNull,
        contribution: num,
        note: strT,
      },
    },
  },
};

/** Shared sub-schemas for `data`. */
export const DATA_DEFS = {
  clusterRef: {
    type: "object",
    required: ["key", "name", "bucket", "memberCount"],
    properties: { key: strT, id: strT, name: strT, bucket: strT, memberCount: int, url: strT },
  },
  eventRef: {
    type: "object",
    required: ["key", "type", "variant", "build", "chips"],
    properties: { key: strT, type: strT, variant: strT, build: strT, chips: strArr, occurredAt: strT, synthetic: bool },
  },
  onset: {
    type: "object",
    required: ["verdict"],
    properties: {
      verdict: { enum: ["regression-likely", "inconclusive", "no-evidence", "not-enough-data"] },
      onsetBuild: strT,
      k1: int,
      e1Km: num,
      k2: int,
      e2Km: num,
      ratePer1000kmBefore: num,
      ratePer1000kmAfter: num,
      rateRatio: { type: ["number", "string"] },
      rrCi95: { type: "array", items: { type: ["number", "string"] }, minItems: 2, maxItems: 2 },
      pRaw: num,
      pScan: num,
      pHolm: num,
      boundariesTested: int,
      exposureFilter: strT,
      buildsWithoutExposure: strArr,
      builds: { type: "array", items: { type: "object", required: ["build", "events", "km"], properties: { build: strT, events: int, km: num } } },
      headline: strT,
      message: strT,
    },
  },
} as const;

const ref = (name: keyof typeof DATA_DEFS): JsonSchema => DATA_DEFS[name];

const neighbour = { type: "object", required: ["key", "d", "clusterKey"], properties: { key: strT, d: numOrNull, clusterKey: strT } } as const;

/** `data` schema per action (only for `ok: true` responses; failures carry no `data` or a preview). */
export const DATA_SCHEMAS: { readonly [K in ActionKey]: JsonSchema } = {
  "get-cluster-for-event": {
    type: "object",
    required: ["event", "result", "accepted", "alternatives", "dStar", "tau", "neighbours", "message"],
    properties: {
      event: ref("eventRef"),
      result: { enum: ["match", "novel", "first-of-kind", "ambiguous"] },
      accepted: bool,
      cluster: ref("clusterRef"),
      alternatives: { type: "array", items: ref("clusterRef") },
      dStar: numOrNull,
      tau: num,
      neighbours: { type: "array", items: neighbour, maxItems: 3 },
      message: strT,
    },
  },
  "explain-match": {
    type: "object",
    required: ["event", "cluster", "bucketRule", "sameBucket", "dSig", "dCond", "d", "tau", "decision", "topContributors"],
    properties: {
      event: ref("eventRef"),
      cluster: ref("clusterRef"),
      bucketRule: strT,
      sameBucket: bool,
      dSig: numOrNull,
      dCond: num,
      d: numOrNull,
      tau: num,
      decision: { enum: ["within-tau", "exceeds-tau"] },
      topContributors: strArr,
      chipDifference: strArr,
    },
  },
  "build-regression-check": {
    type: "object",
    required: ["projectKey", "scope", "results", "holmFamilySize"],
    properties: {
      projectKey: strT,
      scope: { enum: ["cluster", "build"] },
      build: strT,
      results: { type: "array", maxItems: 25, items: { type: "object", required: ["cluster", "onset"], properties: { cluster: ref("clusterRef"), onset: ref("onset") } } },
      holmFamilySize: int,
    },
  },
  "list-novel-since": {
    type: "object",
    required: ["projectKey", "since", "sinceSource", "events"],
    properties: {
      projectKey: strT,
      since: strT,
      sinceSource: { enum: ["mark-triaged", "input", "7d-default"] },
      events: {
        type: "array",
        maxItems: 25,
        items: {
          type: "object",
          required: ["key", "type", "variant", "build", "chips", "reason", "dStar", "tau"],
          properties: { key: strT, type: strT, variant: strT, build: strT, chips: strArr, occurredAt: strT, reason: { enum: ["exceeds-tau", "first-of-kind"] }, nearestCluster: ref("clusterRef"), dStar: numOrNull, tau: num, message: strT },
        },
      },
    },
  },
  "list-coverage-gaps": {
    type: "object",
    required: ["projectKey", "scenarioJql", "scenarioCount", "state", "gaps"],
    properties: {
      projectKey: strT,
      scenarioJql: strT,
      scenarioCount: int,
      state: { enum: ["ok", "no-scenario-tests", "jql-error"] },
      gaps: {
        type: "array",
        maxItems: 25,
        items: {
          type: "object",
          required: ["cluster", "signature", "verdict", "missingDims"],
          properties: {
            cluster: ref("clusterRef"),
            signature: { type: "object", required: ["type", "variant", "chips", "odd"], properties: { type: strT, variant: strT, chips: strArr, odd: strArr, text: strT } },
            verdict: { enum: ["uncovered", "partial"] },
            missingDims: strArr,
            bestTest: strT,
            text: strT,
          },
        },
      },
    },
  },
  "suggest-owner": {
    type: "object",
    required: ["clusterKey", "source", "rule", "twgStatus", "reasons"],
    properties: {
      clusterKey: strT,
      source: { enum: ["twg", "component", "project-role", "none"] },
      team: { type: "object", required: ["name", "ref", "source"], properties: { name: strT, ref: strT, source: { enum: ["twg", "component", "project-role"] } } },
      contact: { type: "object", required: ["accountId", "source"], properties: { accountId: strT, displayName: strT, source: { enum: ["twg", "component", "project-role"] } } },
      rule: { type: "object", required: ["index", "text"], properties: { index: int, text: strT } },
      twgStatus: { enum: ["ok", "empty", "error", "skipped"] },
      fallbackReason: strT,
      reasons: strArr,
    },
    // D8: member lists never leave through actions / MCP.
    not: { required: ["members"] },
  },
  "link-event": {
    type: "object",
    required: ["created", "alreadyLinked", "link", "undo"],
    properties: {
      created: bool,
      alreadyLinked: bool,
      link: { type: "object", required: ["type", "inward", "outward"], properties: { id: strT, type: strT, inward: strT, outward: strT } },
      cluster: ref("clusterRef"),
      summary: strT,
      undo: strT,
    },
  },
  "create-cluster": {
    type: "object",
    required: ["created", "cluster", "seededWith", "proposedMembers", "nameSource", "undo"],
    properties: {
      created: bool,
      cluster: ref("clusterRef"),
      seededWith: strT,
      proposedMembers: strArr,
      nameSource: { enum: ["user", "deterministic"] },
      summary: strT,
      undo: strT,
    },
  },
  "create-scenario-stub": {
    type: "object",
    required: ["created", "stub", "linkedEvents", "narrativeSource"],
    properties: {
      created: bool,
      stub: { type: "object", required: ["key", "url", "labels"], properties: { key: strT, id: strT, url: strT, labels: strArr, summary: strT } },
      clusterKey: strT,
      linkedEvents: strArr,
      narrativeSource: { const: "template" },
    },
  },
};

/** `data` of a `needs-confirmation` response: what WOULD be written. Nothing was. */
export const CONFIRMATION_DATA_SCHEMA: JsonSchema = {
  type: "object",
  required: ["wouldDo", "written"],
  properties: { wouldDo: strT, written: { const: false }, preview: { type: "object" } },
};
