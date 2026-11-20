import { mountDev } from "../../common/dev-harness.js";
import { fakeClient } from "../../common/testing.js";
import { IntakeApp } from "../src/App.js";
import { canvasThumbEncoder } from "../src/jira.js";
import { createProcessor, type WorkerLike } from "../src/processor.js";
import { commitResult, intakeContext } from "../test/fixtures.js";

const client = fakeClient({
  getIntakeContext: () => intakeContext(),
  commitEvent: (req) => commitResult(req.issueKey, req.attachments ?? { via: "none", status: "skipped" }),
  saveMappingPreset: (req) => ({ id: req.id }),
});

// The real Web Worker (SPIKE-C3 path) and a fake Jira that accepts the issue and the upload.
const processor = createProcessor({ createWorker: () => new Worker(new URL("../src/worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike });
const requestJira = async (path: string): Promise<Response> =>
  path === "/rest/api/3/issue" ? new Response(JSON.stringify({ key: "TEST-77", id: "10077" }), { status: 201 }) : new Response("[]", { status: 200 });

mountDev(<IntakeApp deps={{ client, target: { inModal: true, mode: "create", projectKey: "TEST" }, processor, requestJira, encodeThumb: canvasThumbEncoder, close: async () => undefined }} />);
