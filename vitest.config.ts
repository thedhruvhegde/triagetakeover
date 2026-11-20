import { defineConfig } from "vitest/config";
// Node environment by default; a DOM test opts in with a `// @vitest-environment jsdom` header.
export default defineConfig({
  test: {
    include: [
      "packages/*/test/**/*.test.{ts,tsx}",
      "apps/*/test/**/*.test.{ts,tsx}",
      "apps/forge/static/*/test/**/*.test.{ts,tsx}",
    ],
  },
});
