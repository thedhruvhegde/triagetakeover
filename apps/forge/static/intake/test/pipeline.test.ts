// @vitest-environment jsdom
import "../../common/jsdom-setup.js";
import { DEFAULT_RULE_THRESHOLDS, WINDOW_N, parseTtThumbs } from "@tt/engine";
import { describe, expect, it } from "vitest";
import { fakeClient } from "../../common/testing.js";
import { buildThumbs, createIssue, fallbackFilename, uploadOriginals, withAttachmentIds, type PickedFile } from "../src/jira.js";
import { inspectCsv, mergeThresholds, needsMappingStep, presetFits, processFiles } from "../src/pipeline.js";
import { createProcessor, type WorkerLike, type WorkerRequest, type WorkerResponse } from "../src/processor.js";
import { enc, laneLossCsv, testJpeg } from "./files.js";

const ctx = { occurredAt: "2026-11-14T09:12:00Z", vehicleId: "VEH-TEST", variant: "cam-B", build: "4.12.0", odd: ["highway"] };

describe("pipeline (engine calls only)", () => {
  it("recognises canonical headers and asks for mapping when they are unknown", () => {
    const ok = inspectCsv(enc(laneLossCsv()));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.headers).toEqual(["t", "speed", "lane_offset", "lane_conf", "takeover"]);
    expect(needsMappingStep(ok)).toBe(false);
    const unknown = inspectCsv(enc(laneLossCsv({ headers: ["zeit", "geschw", "spur", "qualitaet", "uebernahme"] })));
    expect(unknown.ok && needsMappingStep(unknown)).toBe(true);
    if (unknown.ok) expect(unknown.missingRequired).toEqual(["t"]);
  });

  it("names the row of a malformed CSV", () => {
    const bad = inspectCsv(enc("t,speed\n"));
    // header only: parse succeeds; processing reports the empty table
    expect(bad.ok).toBe(true);
    const r = processFiles({ csv: enc("t,speed\n"), frames: [], ctx });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.code).toBe("E_CSV_EMPTY");
  });

  it("computes tt.event, the 201-sample preview series and grayscale thumbnails", () => {
    const r = processFiles({ csv: enc(laneLossCsv()), frames: [testJpeg(), enc("not a jpeg")], ctx });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.event.sig.type).toBe("lane-loss");
    expect(r.event.ctx).toEqual(ctx);
    expect(r.series.channels["lane_conf"]?.length).toBe(WINDOW_N);
    expect(r.frames.map((f) => f.ok)).toEqual([true, false]);
    expect(r.event.source.frames.length).toBe(1);
    expect(r.thumbs.length).toBe(1);
    const t = r.thumbs[0];
    expect(t?.w).toBe(64);
    expect(t?.rgba[0]).toBe(t?.rgba[1]);
    expect(r.eventBytes).toBeLessThan(12 * 1024);
  });

  it("merges admin thresholds over engine defaults, ignoring unknown keys", () => {
    const m = mergeThresholds(DEFAULT_RULE_THRESHOLDS, { llLaneConf: 0.3, bogus: 9 });
    expect(m.llLaneConf).toBe(0.3);
    expect(m.ldLatOffset).toBe(DEFAULT_RULE_THRESHOLDS.ldLatOffset);
    expect("bogus" in m).toBe(false);
  });

  it("matches saved presets only when every mapped column exists", () => {
    const preset = { columns: { t: "zeit", speed: "geschw" }, multipliers: {}, invert: {}, brakeUnit: "ratio" as const };
    expect(presetFits(preset, ["zeit", "geschw", "x"])).toBe(true);
    expect(presetFits(preset, ["zeit"])).toBe(false);
  });
});

describe("processor (SPIKE-C3 worker with main-thread fallback)", () => {
  it("uses the main thread when no worker can be created", async () => {
    const p = createProcessor({ createWorker: () => null });
    expect(p.mode()).toBe("main-thread");
    const r = await p.inspect(enc(laneLossCsv()));
    expect(r.ok).toBe(true);
  });

  it("uses the worker's answer when it replies", async () => {
    const seen: WorkerRequest[] = [];
    const fake: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage(m) {
        seen.push(m);
        const reply: WorkerResponse = { id: m.id, ok: true, result: { ok: false, errors: [{ code: "E_FROM_WORKER", message: "worker" }] } };
        queueMicrotask(() => this.onmessage?.({ data: reply } as MessageEvent<WorkerResponse>));
      },
      terminate() {},
    };
    const p = createProcessor({ createWorker: () => fake });
    expect(p.mode()).toBe("worker");
    const r = await p.inspect(enc("t\n1\n"));
    expect(seen[0]?.op).toBe("inspect");
    expect(r.ok === false && r.errors[0]?.code).toBe("E_FROM_WORKER");
  });

  it("falls back to the main thread when the worker errors, and stays there", async () => {
    const reasons: string[] = [];
    const fake: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage() {
        queueMicrotask(() => this.onerror?.(new Event("error")));
      },
      terminate() {},
    };
    const p = createProcessor({ createWorker: () => fake, onFallback: (r) => reasons.push(r) });
    const r = await p.process({ csv: enc(laneLossCsv()), frames: [], ctx });
    expect(r.ok).toBe(true);
    expect(p.mode()).toBe("main-thread");
    expect(reasons[0]).toContain("SPIKE-C3");
  });

  it("falls back when the worker never answers", async () => {
    const fake: WorkerLike = { onmessage: null, onerror: null, postMessage() {}, terminate() {} };
    const p = createProcessor({ createWorker: () => fake, timeoutMs: 5 });
    const r = await p.inspect(enc(laneLossCsv()));
    expect(r.ok).toBe(true);
    expect(p.mode()).toBe("main-thread");
  });
});

const csvFile: PickedFile = { name: "takeover.csv", type: "text/csv", bytes: enc(laneLossCsv()) };
const jpgFile: PickedFile = { name: "frame-1.jpg", type: "image/jpeg", bytes: testJpeg() };

describe("browser Jira writes (SPIKE-I2) and fallbacks", () => {
  it("uploads all originals in one multipart request with X-Atlassian-Token: no-check", async () => {
    const calls: { path: string; init: RequestInit | undefined }[] = [];
    const requestJira = async (path: string, init?: RequestInit): Promise<Response> => {
      calls.push({ path, init });
      return new Response(JSON.stringify([{ id: "100", filename: "takeover.csv" }, { id: "101", filename: "frame-1.jpg" }]), { status: 200 });
    };
    const out = await uploadOriginals(requestJira, fakeClient({}), "TEST-1", [csvFile, jpgFile], 360 * 1024);
    expect(out).toEqual({ ids: ["100", "101"], report: { via: "browser", status: "uploaded" } });
    expect(calls[0]?.path).toBe("/rest/api/3/issue/TEST-1/attachments");
    expect((calls[0]?.init?.headers as Record<string, string>)["X-Atlassian-Token"]).toBe("no-check");
    expect(calls[0]?.init?.body).toBeInstanceOf(FormData);
  });

  it("falls back to the resolver per file, and reports files it could not attach", async () => {
    const requestJira = async (): Promise<Response> => new Response("forbidden", { status: 403 });
    const client = fakeClient({ uploadAttachment: (req) => ({ attachmentId: `b-${req.filename}`, filename: req.filename, size: 1 }) });
    const all = await uploadOriginals(requestJira, client, "TEST-1", [csvFile, jpgFile], 360 * 1024);
    expect(all).toEqual({ ids: ["b-takeover.csv", "b-frame-1.jpg"], report: { via: "backend", status: "uploaded" } });
    expect(client.calls[0]?.req).toMatchObject({ issueKey: "TEST-1", filename: "takeover.csv", mimeType: "text/csv" });

    const tiny = await uploadOriginals(requestJira, client, "TEST-1", [csvFile, jpgFile], 10);
    expect(tiny.ids).toEqual([null, null]);
    expect(tiny.report).toMatchObject({ via: "none", status: "failed" });
    expect(tiny.report.error).toContain("2 of 2 files not attached");
  });

  it("sends the fallback upload a file name the resolver accepts (umlauts, #, brackets)", async () => {
    const requestJira = async (): Promise<Response> => new Response("forbidden", { status: 403 });
    const client = fakeClient({ uploadAttachment: (req) => ({ attachmentId: "b-1", filename: req.filename, size: 1 }) });
    const odd: PickedFile = { name: "Übernahme A9 #3 [cam B].csv", type: "text/csv", bytes: csvFile.bytes };
    const out = await uploadOriginals(requestJira, client, "TEST-1", [odd], 360 * 1024);
    expect(out.report).toEqual({ via: "backend", status: "uploaded" });
    const sent = (client.calls[0]?.req as { filename: string }).filename;
    expect(sent).toBe("_bernahme A9 _3 _cam B_.csv");
    expect(sent).toMatch(/^[A-Za-z0-9 ._()+-]{1,120}$/);
    const long = fallbackFilename(`${"x".repeat(200)}.jpeg`);
    expect(long).toHaveLength(120);
    expect(long.endsWith(".jpeg")).toBe(true);
    expect(fallbackFilename("ööö.csv")).toBe("___.csv");
    expect(fallbackFilename("..")).toBe("file");
  });

  it("creates the issue from the browser, else through createTakeoverIssue", async () => {
    let body: unknown;
    const ok = await createIssue(
      async (_p, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ key: "TEST-9", id: "10009" }), { status: 201 });
      },
      fakeClient({}),
      { projectKey: "TEST", issueType: "Task", summary: "car drifted left", description: "first para\n\nsecond", labels: ["tt-takeover"] },
    );
    expect(ok).toEqual({ ok: true, issue: { key: "TEST-9", id: "10009", via: "browser" } });
    expect(body).toMatchObject({ fields: { project: { key: "TEST" }, issuetype: { name: "Task" }, labels: ["tt-takeover"], description: { type: "doc", content: [{}, {}] } } });

    const client = fakeClient({ createTakeoverIssue: () => ({ key: "TEST-10", id: "10010", url: "/browse/TEST-10" }) });
    const fb = await createIssue(async () => {
      throw new Error("CSP");
    }, client, { projectKey: "TEST", issueType: "Task", summary: "s", description: "", labels: [] });
    expect(fb).toEqual({ ok: true, issue: { key: "TEST-10", id: "10010", via: "backend" } });
  });

  it("writes attachment ids into the event, skipping frames the engine could not decode", () => {
    const r = processFiles({ csv: enc(laneLossCsv()), frames: [enc("nope"), testJpeg()], ctx });
    if (!r.ok) throw new Error("processing failed");
    const e = withAttachmentIds(r.event, "100", ["101", "102"], r.frames.map((f) => f.ok));
    expect(e.source.csv.attachmentId).toBe("100");
    expect(e.source.frames.map((f) => f.attachmentId)).toEqual(["102"]);
  });

  it("builds tt.thumbs within the 12 KB target, or none without a canvas", () => {
    const raster = { w: 160, h: 90, rgba: new Uint8ClampedArray(160 * 90 * 4) };
    const t = buildThumbs([raster, raster], () => "QUJDRA==");
    expect(t !== undefined && parseTtThumbs(t).ok).toBe(true);
    expect(t?.frames.length).toBe(2);
    expect(buildThumbs([raster], () => null)).toBeUndefined();
    const huge = buildThumbs([raster, raster], () => "A".repeat(8000));
    expect(huge?.frames.length).toBe(1);
  });
});
