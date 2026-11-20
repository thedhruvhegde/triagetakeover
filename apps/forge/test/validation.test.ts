import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { run } from "@tt/engine";
import {
  build,
  clampedInt,
  freeText,
  isoInstant,
  issueKey,
  parseActionInputs,
  parseCommitDraft,
  parseReclusterJob,
  parseSeedJob,
  readActionContext,
  sanitizeText,
} from "../src/validation/index.js";
import { validEvent } from "./fixtures.js";

describe("input decoders (§10.3 Validation)", () => {
  it("accepts issue keys case-insensitively and rejects everything else", () => {
    expect(run(issueKey, "ttdemo-12")).toEqual({ ok: true, value: "TTDEMO-12" });
    for (const bad of ["TTDEMO", "1ABC-1", "T-1", "TTDEMO-", "TTDEMO-1234567890", "TT DEMO-1", 12, null, "TTDEMO-1; DROP"]) {
      expect(run(issueKey, bad).ok, String(bad)).toBe(false);
    }
  });

  it("checks builds against ^[0-9A-Za-z.+_-]{1,40}$", () => {
    expect(run(build, "4.12.0+rc1").ok).toBe(true);
    expect(run(build, "4.12 0").ok).toBe(false);
    expect(run(build, "x".repeat(41)).ok).toBe(false);
  });

  it("parses ISO dates strictly and normalises to UTC", () => {
    expect(run(isoInstant, "2026-11-14T17:00:00+01:00")).toEqual({ ok: true, value: "2026-11-14T16:00:00.000Z" });
    expect(run(isoInstant, "2026-11-14")).toEqual({ ok: true, value: "2026-11-14T00:00:00.000Z" });
    for (const bad of ["2026-02-30", "2026-11-14 17:00:00Z", "2026-11-14T17:00:00", "14/11/2026", "yesterday", "2026-11-14T25:00:00Z"]) {
      expect(run(isoInstant, bad).ok, bad).toBe(false);
    }
  });

  it("strips control and bidi characters from free text and caps the length", () => {
    expect(sanitizeText("  Lane\u0000loss\u202E · low\tsun  ", 80)).toBe("Lane loss · low sun");
    expect(run(freeText(5), "abcdefgh")).toEqual({ ok: true, value: "abcde" });
    expect(run(freeText(), "\u0007\u0008").ok).toBe(false);
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 200 }), (s) => {
        const t = sanitizeText(s, 80);
        // eslint-disable-next-line no-control-regex -- asserting no control characters remain
        return [...t].length <= 80 && !/[\u0000-\u001F\u007F-\u009F\u202A-\u202E]/.test(t) && t === t.trim();
      }),
    );
  });

  it("clamps integers and accepts numeric strings (SPIKE-A2)", () => {
    expect(run(clampedInt(1, 25), 100)).toEqual({ ok: true, value: 25 });
    expect(run(clampedInt(1, 25), "0")).toEqual({ ok: true, value: 1 });
    expect(run(clampedInt(1, 25), 2.5).ok).toBe(false);
  });
});

describe("parseActionInputs", () => {
  it("applies §10.3 defaults and ignores unknown inputs and the context object", () => {
    expect(parseActionInputs("list-novel-since", { context: { jira: { issueKey: "X-1" } }, evil: "drop me" })).toEqual({ ok: true, value: { limit: 10 } });
    expect(parseActionInputs("list-coverage-gaps", { includePartial: "false", limit: 99 })).toEqual({ ok: true, value: { minEvents: 2, includePartial: false, limit: 25 } });
    expect(parseActionInputs("explain-match", { issueKey: "ttdemo-3", clusterKey: "" })).toEqual({ ok: true, value: { issueKey: "TTDEMO-3" } });
  });

  it("requires one of clusterKey or build for build-regression-check", () => {
    const r = parseActionInputs("build-regression-check", { projectKey: "TTDEMO" });
    expect(r.ok).toBe(false);
    expect(parseActionInputs("build-regression-check", { build: "4.12.0" })).toEqual({ ok: true, value: { build: "4.12.0" } });
  });

  it("turns a missing or non-true userConfirmed into false (needs-confirmation), not an input error", () => {
    expect(parseActionInputs("link-event", { issueKey: "TTDEMO-1", clusterKey: "TTDEMO-9" })).toEqual({ ok: true, value: { issueKey: "TTDEMO-1", clusterKey: "TTDEMO-9", userConfirmed: false } });
    expect(parseActionInputs("link-event", { issueKey: "TTDEMO-1", clusterKey: "TTDEMO-9", userConfirmed: "true" })).toMatchObject({ ok: true, value: { userConfirmed: true } });
    expect(parseActionInputs("create-scenario-stub", { clusterKey: "TTDEMO-9", userConfirmed: "yes" }).ok).toBe(false);
  });

  it("reports invalid and missing required inputs by name", () => {
    const r = parseActionInputs("create-cluster", { name: "\u0000", userConfirmed: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.map((e) => e.input).sort()).toEqual(["issueKey", "name"]);
    const s = parseActionInputs("suggest-owner", { clusterKey: "not a key" });
    expect(s.ok ? null : s.error[0]?.input).toBe("clusterKey");
  });

  it("never throws on arbitrary payloads", () => {
    fc.assert(
      fc.property(fc.anything(), fc.constantFrom("get-cluster-for-event", "list-novel-since", "link-event", "create-cluster", "build-regression-check" as const), (payload, key) => {
        const r = parseActionInputs(key, payload);
        return typeof r.ok === "boolean";
      }),
    );
  });
});

describe("readActionContext (SPIKE-A2)", () => {
  it("takes identity from the invocation context and the focus from payload.context.jira", () => {
    const ctx = readActionContext(
      { issueKey: "OTHER-1", context: { cloudId: "abc-123", jira: { issueKey: "ttdemo-7" }, accountId: "spoof" } },
      { principal: { accountId: "557058:abc" } },
    );
    expect(ctx).toEqual({ accountId: "557058:abc", cloudId: "abc-123", focusIssueKey: "TTDEMO-7", focusProjectKey: "TTDEMO" });
  });

  it("drops malformed values", () => {
    expect(readActionContext({ context: { jira: { issueKey: "<script>", projectKey: 5 } } }, null)).toEqual({});
    expect(readActionContext("nonsense")).toEqual({});
  });
});

describe("parseCommitDraft", () => {
  it("accepts a valid draft and strips unknown keys", () => {
    const r = parseCommitDraft({ issueKey: "ttdemo-1", event: { ...validEvent(), extra: 1 }, thumbs: { v: 1, frames: [] } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.issueKey).toBe("TTDEMO-1");
      expect("extra" in r.value.event).toBe(false);
      expect(r.value.thumbs).toEqual({ v: 1, frames: [] });
    }
  });

  it("collects errors from every part with prefixed paths", () => {
    const ev = validEvent();
    const r = parseCommitDraft({ issueKey: "bad", event: { ...ev, sig: { ...ev.sig, type: "late-brake" } }, thumbs: { v: 2, frames: [] } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const paths = r.error.map((e) => e.path ?? "");
      expect(paths).toContain("issueKey");
      expect(paths.some((p) => p.startsWith("event"))).toBe(true);
      expect(paths.some((p) => p.startsWith("thumbs"))).toBe(true);
    }
  });

  it("rejects payloads over the 500 KB invoke limit", () => {
    const r = parseCommitDraft({ issueKey: "TTDEMO-1", event: validEvent(), pad: "x".repeat(501 * 1024) });
    expect(r.ok ? null : r.error[0]?.code).toBe("E_PROPERTY_TOO_LARGE");
  });
});

describe("queue job parsers", () => {
  it("validates recluster jobs; resync jobs carry no bucket", () => {
    expect(parseReclusterJob({ projectKey: "TTDEMO", reason: "intake", bucket: "lane-loss|cam-B", requestedAt: "2026-11-16T09:00:00Z" }).ok).toBe(true);
    expect(parseReclusterJob({ projectKey: "TTDEMO", reason: "resync", requestedAt: "2026-11-16T09:00:00Z" }).ok).toBe(true);
    expect(parseReclusterJob({ projectKey: "TTDEMO", reason: "resync", bucket: "lane-loss|cam-B", requestedAt: "2026-11-16T09:00:00Z" }).ok).toBe(false);
    expect(parseReclusterJob({ projectKey: "TTDEMO", reason: "cron", requestedAt: "2026-11-16T09:00:00Z" }).ok).toBe(false);
  });

  it("validates seed jobs", () => {
    expect(parseSeedJob({ jobId: "seed-1", step: "S4", cursor: 8, seed: 2029 }).ok).toBe(true);
    expect(parseSeedJob({ jobId: "seed-1", step: "S4", cursor: -1, seed: 2029 }).ok).toBe(false);
    expect(parseSeedJob({ jobId: "seed 1", step: "S4", cursor: 0, seed: 2 ** 32 }).ok).toBe(false);
  });
});
