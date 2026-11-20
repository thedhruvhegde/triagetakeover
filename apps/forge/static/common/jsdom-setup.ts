/**
 * jsdom gaps that Atlaskit touches at import time. Import this FIRST in every DOM test
 * (the root vitest config has no setupFiles; ES imports run in order).
 */
if (typeof window !== "undefined") {
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (typeof globalThis.ResizeObserver !== "function") {
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
  // Atlaskit platform feature flags: answer `false` (the default) without touching the real
  // feature-gate client, which is not initialised in tests (production uses the build stub).
  (window as unknown as Record<string, unknown>)["__PLATFORM_FEATURE_FLAGS__"] = { booleanResolver: () => false };
}
export {};
