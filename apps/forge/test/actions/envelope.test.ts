import { describe, expect, it } from "vitest";
import { absolutize, fmtD, fmtP, jsonBytes, normalizeInputs, readInvocation, success, whyRows, withinBudget, ENVELOPE_SCHEMA, LIMITS } from "../../src/actions/index.js";
import { validate } from "./json-schema.js";

describe("envelope builders", () => {
  it("caps headline, why and evidence at the schema limits", () => {
    const env = success({
      headline: "x".repeat(400),
      data: {},
      why: Array.from({ length: 20 }, (_, i) => ({ feature: `F${i}`, label: "l", unit: "u", eventValue: null, referenceValue: null, z: null, contribution: 0, note: "" })),
      evidence: Array.from({ length: 40 }, (_, i) => ({ kind: "issue" as const, key: `TTDEMO-${i + 1}`, url: `/browse/TTDEMO-${i + 1}`, label: "e" })),
    });
    expect([...env.headline].length).toBe(LIMITS.headline);
    expect(env.why).toHaveLength(12);
    expect(env.evidence).toHaveLength(30);
    expect(validate(env, ENVELOPE_SCHEMA)).toEqual([]);
  });

  it("why rows: n/a contributions become 0 with a note, sorted by contribution", () => {
    const rows = whyRows([
      { feature: "F2", key: "k", label: "a", unit: "s", eventValue: 1, referenceValue: 2, z: 1, contribution: 0.2, note: "" },
      { feature: "F1", key: "k", label: "b", unit: "m", eventValue: null, referenceValue: null, z: null, contribution: null, note: "" },
      { feature: "F3", key: "k", label: "c", unit: "m", eventValue: 1, referenceValue: 1, z: 0, contribution: 0.8, note: "" },
    ]);
    expect(rows.map((r) => r.feature)).toEqual(["F3", "F2", "F1"]);
    expect(rows[2]).toMatchObject({ contribution: 0, note: "n/a" });
  });

  it("keeps responses under 50 KB", () => {
    const big = success({ headline: "h", data: { blob: "y".repeat(80_000) }, evidence: [{ kind: "issue", key: "TTDEMO-1", url: "/browse/TTDEMO-1", label: "e" }] });
    const trimmed = withinBudget(big);
    expect(jsonBytes(trimmed)).toBeLessThanOrEqual(LIMITS.bytes);
    expect(trimmed.evidence).toHaveLength(1);
    expect(trimmed.warnings.at(-1)).toMatch(/larger than 50 KB/);
  });

  it("formats distances and p-values deterministically", () => {
    expect(fmtD(null)).toBe("∞");
    expect(fmtD(0.2049)).toBe("0.20");
    expect(fmtP(0.0013145842)).toBe("0.00131");
    expect(fmtP(0.00026)).toBe("2.6e-4");
    expect(fmtP(0.5)).toBe("0.5");
    expect(fmtP(null)).toBe("n/a");
  });

  it("absolutises only site-relative URLs", () => {
    const env = success({ headline: "h", data: {}, evidence: [{ kind: "issue", key: "A-1", url: "/browse/A-1", label: "x" }, { kind: "rule", url: "", label: "r" }] });
    expect(absolutize(env, "https://s.atlassian.net").evidence.map((e) => e.url)).toEqual(["https://s.atlassian.net/browse/A-1", ""]);
  });
});

describe("invocation parsing (SPIKE-A2)", () => {
  it("reads identity only from the invocation, focus from payload.context.jira", () => {
    const inv = readInvocation({ accountId: "attacker", context: { jira: { issueKey: "ttdemo-7", url: "https://acme.atlassian.net/browse/TTDEMO-7" } } }, { principal: { accountId: "acc-1" } });
    expect(inv).toMatchObject({ accountId: "acc-1", focusIssueKey: "TTDEMO-7", focusProjectKey: "TTDEMO", siteBase: "https://acme.atlassian.net" });
    expect(readInvocation({ accountId: "attacker" }, {}).accountId).toBeUndefined();
    expect(readInvocation({}, { accountId: "acc-2" }).accountId).toBe("acc-2");
    // payload.context is caller-supplied: it must not override the platform's top-level accountId.
    expect(readInvocation({ context: { accountId: "spoofed" } }, { accountId: "acc-2" }).accountId).toBe("acc-2");
    expect(readInvocation({ context: { jira: { url: "https://acme.atlassian.net.evil.com/x" } } }, {}).siteBase).toBeUndefined();
  });

  it("lifts nested inputs and normalises boolean strings", () => {
    expect(normalizeInputs({ inputs: { issueKey: "A-1", userConfirmed: " True " }, context: {} })).toEqual({ issueKey: "A-1", userConfirmed: "true", context: {} });
    expect(normalizeInputs({ issueKey: "B-2", inputs: { issueKey: "A-1" } })["issueKey"]).toBe("B-2");
    expect(normalizeInputs("nope")).toEqual({});
  });
});
