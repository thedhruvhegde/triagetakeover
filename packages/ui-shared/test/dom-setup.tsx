/**
 * jsdom gaps Atlaskit touches at import time. Import FIRST in DOM tests (ES imports run in order).
 * (A .tsx file so the root `tsconfig.test.json`, which has no DOM lib, does not pick it up.)
 */
if (typeof window !== "undefined") {
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (q: string) =>
      ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }) as MediaQueryList;
  }
  // Atlaskit platform feature flags resolve to their default (false) without the gate client.
  (window as unknown as Record<string, unknown>)["__PLATFORM_FEATURE_FLAGS__"] = { booleanResolver: () => false };
}
export {};
