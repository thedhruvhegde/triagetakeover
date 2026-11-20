import { describe, expect, it } from "vitest";
import { classifyThrown, createHttpClient, jiraErrorText, parseRetryAfter } from "../../src/adapters/forge/http.js";
import { textToAdf, adfToText } from "../../src/adapters/forge/adf.js";
import { instantPolicy, response, scriptedRequester } from "./helpers.js";

/** A `Route` is `{ value }`; the port tests cover the real `route` encoding. */
const path = (value: string) => ({ value });

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-11-20T09:00:00.000Z");
  it("reads delta seconds and HTTP dates", () => {
    expect(parseRetryAfter("7", now)).toBe(7);
    expect(parseRetryAfter("Fri, 20 Nov 2026 09:00:30 GMT", now)).toBe(30);
    expect(parseRetryAfter("Fri, 20 Nov 2026 08:00:00 GMT", now)).toBe(0);
    expect(parseRetryAfter(null, now)).toBeUndefined();
    expect(parseRetryAfter("soon", now)).toBeUndefined();
  });
});

describe("createHttpClient", () => {
  it("retries a 429, honouring Retry-After, then succeeds", async () => {
    const { requester, calls } = scriptedRequester({
      "GET /rest/api/3/myself": [response(429, "", { "Retry-After": "2" }), response(200, { accountId: "u1" })],
    });
    const policy = instantPolicy();
    const r = await createHttpClient(requester, policy).send("jira.getMyself", path("/rest/api/3/myself"));
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(policy.slept).toEqual([2000]);
  });

  it("uses exponential back-off with jitter when there is no Retry-After", async () => {
    const { requester } = scriptedRequester({ "GET /x": [response(429), response(429), response(200, "{}")] });
    const policy = instantPolicy({ random: () => 0 });
    const r = await createHttpClient(requester, policy).send("op", path("/x"));
    expect(r.ok).toBe(true);
    expect(policy.slept).toEqual([250, 500]);
  });

  it("fails fast with retryAfterSeconds when the platform asks for a long wait", async () => {
    const { requester, calls } = scriptedRequester({ "GET /x": response(429, { errorMessages: ["Rate limit exceeded"] }, { "Retry-After": "60" }) });
    const policy = instantPolicy();
    const r = await createHttpClient(requester, policy).send("op", path("/x"));
    expect(r).toEqual({ ok: false, error: { kind: "rate-limited", message: "Rate limit exceeded", op: "op", status: 429, retryAfterSeconds: 60 } });
    expect(calls).toHaveLength(1);
    expect(policy.slept).toEqual([]);
  });

  it("stops after maxAttempts", async () => {
    const { requester, calls } = scriptedRequester({ "GET /x": response(429) });
    const r = await createHttpClient(requester, instantPolicy({ maxAttempts: 3 })).send("op", path("/x"));
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(3);
  });

  it("retries 5xx for GET but never for POST (a retried create could duplicate)", async () => {
    const get = scriptedRequester({ "GET /x": [response(503), response(200, "{}")] });
    expect((await createHttpClient(get.requester, instantPolicy()).send("op", path("/x"))).ok).toBe(true);
    const post = scriptedRequester({ "POST /x": [response(503), response(201, "{}")] });
    const r = await createHttpClient(post.requester, instantPolicy()).send("op", path("/x"), { method: "POST" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("unavailable");
    expect(post.calls).toHaveLength(1);
  });

  it("maps statuses onto port kinds with Jira's error text", async () => {
    const cases: [number, string][] = [
      [400, "bad-request"],
      [401, "unauthorized"],
      [403, "forbidden"],
      [404, "not-found"],
      [409, "conflict"],
      [413, "value-too-large"],
    ];
    for (const [status, kind] of cases) {
      const { requester } = scriptedRequester({ "GET /x": response(status, { errorMessages: ["nope"], errors: { summary: "too long" } }) });
      const r = await createHttpClient(requester, instantPolicy()).send("op", path("/x"));
      expect(r).toEqual({ ok: false, error: { kind, message: "nope; summary: too long", op: "op", status } });
    }
  });

  it("never throws: thrown platform errors become values", async () => {
    const auth = new Error("Authentication Required");
    auth.name = "NeedsAuthenticationError";
    const { requester } = scriptedRequester({ "GET /x": auth, "GET /y": new Error("socket hang up") });
    const c = createHttpClient(requester, instantPolicy());
    const a = await c.send("op", path("/x"));
    expect(a.ok ? null : a.error.kind).toBe("unauthorized");
    const b = await c.send("op", path("/y"));
    expect(b.ok ? null : b.error.kind).toBe("unavailable");
    expect(classifyThrown("weird").kind).toBe("unknown");
  });

  it("jiraErrorText falls back to raw text or the status", () => {
    expect(jiraErrorText("", 502)).toBe("HTTP 502");
    expect(jiraErrorText("<html>gateway</html>", 502)).toBe("<html>gateway</html>");
  });
});

describe("ADF conversion", () => {
  it("turns lines into paragraphs and account mentions into mention nodes", () => {
    expect(textToAdf("Suggested contact: [~accountid:557058:abc]\nsecond")).toEqual({
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Suggested contact: " }, { type: "mention", attrs: { id: "557058:abc" } }] },
        { type: "paragraph", content: [{ type: "text", text: "second" }] },
      ],
    });
  });

  it("round-trips plain text, including blank lines and mentions", () => {
    const text = "line one [~accountid:u-1] done\n\nline three";
    expect(adfToText(textToAdf(text))).toBe(text);
  });

  it("flattens nested ADF and ignores marks", () => {
    const doc = {
      type: "doc",
      version: 1,
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title", marks: [{ type: "strong" }] }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "b" }] }] }] },
      ],
    };
    expect(adfToText(doc)).toBe("Title\na\nb");
    expect(adfToText("already text")).toBe("already text");
  });
});
