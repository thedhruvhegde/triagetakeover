/**
 * Contract-shaped TEST fixtures for the intake (keys `TEST-*`; not demo data).
 */
import type { CommitResult, IntakeContext } from "../../common/api.js";
import { matchView } from "../../common/testing.js";

export function intakeContext(over: Partial<IntakeContext> = {}): IntakeContext {
  return {
    projectKey: "TEST",
    mode: "create",
    eventIssueType: "Task",
    labels: ["tt-takeover"],
    presets: [],
    ruleThresholds: {},
    chipThresholds: {},
    knownVariants: ["cam-A", "cam-B"],
    knownBuilds: ["4.12.0"],
    limits: { csvMaxBytes: 5 * 1024 * 1024, framesMax: 4, uploadFallbackMaxBytes: 360 * 1024, propertyMaxBytes: 32768 },
    existingEvent: false,
    ...over,
  };
}

export function commitResult(issueKey: string, attachments: CommitResult["attachments"]): CommitResult {
  return { issueKey, propertyBytes: { event: 9000, thumbs: null }, recomputed: true, match: matchView({ event: { ...matchView().event, key: issueKey } }), attachments };
}

