// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Purity rules shared by the engine and the seed generator (ARCHITECTURE §4, SEED_DATA §3). */
const purity = {
  "no-restricted-globals": ["error", "window", "document", "fetch", "Date", "Intl", "process"],
  "no-restricted-properties": ["error", { object: "Math", property: "random", message: "Engine must be deterministic." }],
};

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.forge/**", "docs/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    // The engine must stay pure: deterministic, no platform or clock/RNG access, and it never
    // imports the generator (so it cannot read ground truth, SEED_DATA §14.1).
    files: ["packages/engine/src/**/*.ts"],
    rules: {
      ...purity,
      "no-restricted-imports": ["error", { patterns: ["@forge/*", "node:*", "@tt/seedgen", "**/seedgen/**"] }],
    },
  },
  {
    // The seed generator follows the same purity rules (SEED_DATA §3); it may import the engine.
    files: ["packages/seedgen/src/**/*.ts"],
    rules: {
      ...purity,
      "no-restricted-imports": ["error", { patterns: ["@forge/*", "node:*"] }],
    },
  },
);
