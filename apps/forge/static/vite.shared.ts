/**
 * Shared Vite settings for the Custom UI apps (board, panel, intake).
 * - `base: "./"`: Custom UI serves `dist/` from a per-app path, so asset URLs must be relative.
 * - Everything is bundled (no CDN, no remote fonts: ARCHITECTURE §14 CSP).
 * - `@tt/engine` is compiled from source so the intake bundle never picks up a stale `dist/`.
 * - The Atlaskit feature-gate client is replaced by a stub (see common/feature-gates-stub.ts).
 */
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import type { UserConfig } from "vite";

const engineSrc = fileURLToPath(new URL("../../../packages/engine/src/index.ts", import.meta.url));
const featureGatesStub = fileURLToPath(new URL("./common/feature-gates-stub.ts", import.meta.url));

export function customUiConfig(): UserConfig {
  return {
    base: "./",
    plugins: [react()],
    resolve: {
      alias: [
        { find: /^@tt\/engine$/, replacement: engineSrc },
        // See common/feature-gates-stub.ts: same answers as the uninitialised client, far smaller.
        { find: /^@atlaskit\/feature-gate-js-client\/feature-gates$/, replacement: featureGatesStub },
      ],
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
      target: "es2022",
      reportCompressedSize: true,
      // Forge's per-resource front-end budget used by this project: 500 KB (raw, per chunk warning).
      chunkSizeWarningLimit: 500,
      rolldownOptions: {
        // The engine is pure (ARCHITECTURE §4: no I/O, no globals), so its modules are free of
        // side effects; telling the bundler lets it drop the CSV/JPEG pipeline from bundles that
        // only use constants (board, panel, and the intake main chunk; the worker keeps it).
        treeshake: { moduleSideEffects: (id: string) => !/[\\/]packages[\\/]engine[\\/]src[\\/]/.test(id) },
      },
    },
    worker: { format: "es" },
  };
}
