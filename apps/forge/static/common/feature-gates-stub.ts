/**
 * Build-time replacement for `@atlaskit/feature-gate-js-client/feature-gates` (aliased in
 * `vite.shared.ts`). Atlaskit components ask it for platform feature gates; in a Custom UI iframe
 * the client is never initialised, so every gate already resolves to its default (`false`).
 * The stub gives the same answers without bundling the Statsig client (~400 KB of source), and
 * guarantees no feature-gate network code ships in the app (no egress, ARCHITECTURE §14).
 */
type Fn = (...args: unknown[]) => unknown;

const known: Record<string, Fn> = {
  checkGate: () => false,
  getExperimentValue: (_experiment, _param, defaultValue) => defaultValue,
  getLayerValue: (_layer, _param, defaultValue) => defaultValue,
  initializeCompleted: () => false,
  isGateExists: () => false,
  isExperimentExists: () => false,
  getPackageVersion: () => "stub",
};

const FeatureGates: Record<string, Fn> = new Proxy(known, {
  get: (target, prop: string) => target[prop] ?? (() => undefined),
});

export const CLIENT_VERSION = "stub";
export default FeatureGates;
