/**
 * Rovo action / MCP tool function handlers referenced by manifest.yml
 * (`actions.getClusterForEvent`, ...). Each is `(payload, context) => ActionEnvelope`; the
 * shared layer lives in `actions/`.
 *
 * SPIKE-A1: asUser is assumed to work in action handlers (writes then carry the human's
 * permissions and audit trail). SPIKE-A2: payload/context shapes are read defensively.
 */
import { createForgeContext } from "./context";
import { buildActionHandlers } from "./actions/run";

const handlers = buildActionHandlers(createForgeContext());

export const getClusterForEvent = handlers["get-cluster-for-event"];
export const explainMatch = handlers["explain-match"];
export const buildRegressionCheck = handlers["build-regression-check"];
export const listNovelSince = handlers["list-novel-since"];
export const listCoverageGaps = handlers["list-coverage-gaps"];
export const suggestOwner = handlers["suggest-owner"];
export const linkEvent = handlers["link-event"];
export const createCluster = handlers["create-cluster"];
export const createScenarioStub = handlers["create-scenario-stub"];
