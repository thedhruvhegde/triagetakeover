// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Purity rules shared by the engine and the seed generator (ARCHITECTURE §4, SEED_DATA §3). */
const purity = {
  "no-restricted-globals": ["error", "window", "document", "fetch", "Date", "Intl", "process"],
  "no-restricted-properties": ["error", { object: "Math", property: "random", message: "Engine must be deterministic." }],
};

/** Imports nothing outside the app may make (§4 dependency rule: nothing imports `apps/*`). */
const noAppImports = ["@tt/forge", "**/apps/**"];

/** Egress / LLM bans for the Forge app (§14, D9). */
const forgeBannedPaths = [
  { name: "@forge/llm", message: "Forge LLM is cut (D9, SM-9)." },
  { name: "node-fetch", message: "No egress (§14)." },
  { name: "axios", message: "No egress (§14)." },
];

/**
 * SPIKE-M2 (verified offline with the Forge CLI's own webpack config, scripts/forge-bundle-check.mjs):
 * the Forge bundler does not map a `./x.js` specifier to `./x.ts`, so code under apps/forge/src
 * uses extensionless relative imports. Tests are not bundled by Forge and may keep `.js`.
 */
const noJsSpecifier = { regex: "^\\.{1,2}/.*\\.js$", message: "SPIKE-M2: the Forge bundler cannot resolve ./x.js to x.ts; drop the extension." };

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
      "no-restricted-imports": ["error", { patterns: ["@forge/*", "node:*", "@tt/seedgen", "**/seedgen/**", ...noAppImports] }],
    },
  },
  {
    // The seed generator follows the same purity rules (SEED_DATA §3); it may import the engine.
    files: ["packages/seedgen/src/**/*.ts"],
    rules: {
      ...purity,
      "no-restricted-imports": ["error", { patterns: ["@forge/*", "node:*", ...noAppImports] }],
    },
  },
  {
    // Forge app (§14): no egress. Jira calls go through requestJira in the adapters, never
    // `fetch`; no Forge LLM (D9); the server never imports Custom UI code.
    files: ["apps/forge/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": ["error", { name: "fetch", message: "No egress: use the JiraPort/TwgPort adapters (§14)." }, "XMLHttpRequest", "WebSocket"],
      "no-restricted-imports": ["error", { paths: forgeBannedPaths, patterns: [{ group: ["**/static/**"] }, noJsSpecifier] }],
    },
  },
  {
    // The in-memory fakes must not touch the real platform.
    files: ["apps/forge/src/adapters/memory/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: forgeBannedPaths, patterns: [{ group: ["**/static/**", "@forge/*"] }, noJsSpecifier] }],
    },
  },
  {
    // The app tests must not touch the real platform.
    files: ["apps/forge/test/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { paths: forgeBannedPaths, patterns: ["**/static/**", "@forge/*"] }],
    },
  },
  {
    // Custom UI and shared components (§14): no egress (Jira calls go through @forge/bridge
    // requestJira / invoke) and no popups (the iframe has no allow-popups; use router.*).
    files: ["apps/forge/static/**/*.{ts,tsx}", "packages/ui-shared/src/**/*.{ts,tsx}"],
    ignores: ["apps/forge/static/**/test/**", "apps/forge/static/common/testing.tsx", "apps/forge/static/common/jsdom-setup.ts"],
    rules: {
      "no-restricted-globals": ["error", { name: "fetch", message: "No egress: use @forge/bridge requestJira or invoke (§14)." }, "XMLHttpRequest", "WebSocket", "EventSource"],
      "no-restricted-properties": ["error", { object: "window", property: "open", message: "No popups in Custom UI: use router.open (§14)." }],
      "no-restricted-imports": ["error", { paths: forgeBannedPaths }],
    },
  },
  {
    // Node scripts (.cjs): CommonJS globals.
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { require: "readonly", module: "writable", __dirname: "readonly", process: "readonly", console: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Node scripts (.mjs): declare the Node globals they use.
    files: ["**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly", URL: "readonly" } },
  },
);
