// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.forge/**", "docs/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    // The engine must stay pure: deterministic, no platform or clock/RNG access.
    files: ["packages/engine/src/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["@forge/*", "node:*"] }],
      "no-restricted-globals": ["error", "window", "document", "fetch", "Date", "Intl", "process"],
      "no-restricted-properties": ["error", { object: "Math", property: "random", message: "Engine must be deterministic." }],
    },
  },
);
