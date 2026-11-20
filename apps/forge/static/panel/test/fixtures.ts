/**
 * Contract-shaped TEST fixtures for the panel (keys `TEST-*`; not demo data).
 */
import type { PanelEventView, TriageActionResult } from "../../common/api.js";
import { matchView, series, whyRows } from "../../common/testing.js";

export function eventView(over: Partial<PanelEventView> = {}): PanelEventView {
  return {
    kind: "event",
    match: matchView(),
    features: whyRows(),
    chips: [{ chip: "low-sun-glare", rules: ["sunBlob 0.009 >= 0.004"] }],
    imageNote: "Image statistics computed in the browser (client-attested).",
    telemetry: series("TEST-7"),
    neighbourTelemetry: [series("TEST-2", 0.25), series("TEST-3", 0.3), series("TEST-4", 0.5)],
    thumbs: [{ w: 160, h: 90, dataUri: "data:image/jpeg;base64,AAAA" }],
    triage: { state: "none", viaDemoSeed: false, history: [] },
    undo: { available: false },
    index: { reprocessed: false, outOfSync: false },
    calibration: null,
    propertyVersion: { v: 1, engine: "1.0.0", app: "0.1.0", currentEngine: "1.0.0" },
    attachments: [{ kind: "attachment", id: "1", url: "/browse/TEST-7", label: "takeover.csv" }],
    warnings: [],
    disclaimer: "Not a safety tool.",
    ...over,
  };
}

export const actionResult = (over: Partial<TriageActionResult> = {}): TriageActionResult => ({
  action: "accept",
  summary: "Linked TEST-7 → TEST-5",
  created: true,
  alreadyDone: false,
  proposedMembers: [],
  undoAvailable: true,
  evidence: [],
  ...over,
});

