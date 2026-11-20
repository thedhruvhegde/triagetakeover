#!/usr/bin/env node
// Offline manifest validation (ARCHITECTURE §16.1 "Manifest / platform", SPIKE-M1).
//
// Runs the full validator that ships in @forge/manifest (the package the Forge CLI uses for
// `forge lint`): JSON schema, modules, resources, permissions, storage entities, entity
// properties. It needs no login and makes no network calls. It is NOT a substitute for
// `forge lint` / `forge deploy`, which still have to be run once a Forge login exists.
//
// On top of that it enforces the project's own manifest rules (§2.2, §14, §12):
// no `permissions.external`, no `licensing`, no `llm` module, no triggers.
//
// Build outputs (static/*/dist) do not exist in a fresh checkout, so "resource path not
// found" for those directories is reported as PENDING instead of failing. Pass --strict to
// fail on them too (use after `pnpm build` of the Custom UI packages).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { validate } from "@forge/manifest";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(appDir, "manifest.yml");
const strict = process.argv.includes("--strict");

/** Resource directories that are build outputs (Vite), allowed to be missing unless --strict. */
const BUILD_OUTPUT_RESOURCES = ["static/board/dist", "static/panel/dist", "static/intake/dist"];
/** Source files that later work packages create; allowed to be missing unless --strict. */
const PENDING_SOURCES = ["src/frontend/admin.tsx", "src/frontend/triage.tsx", "src/index.ts", "src/actions.ts"];

process.chdir(appDir);
const result = await validate(false, manifestPath);
const errors = (result.errors ?? []).filter((e) => e.level === "error");
const warnings = (result.errors ?? []).filter((e) => e.level !== "error");

const pendingPaths = [...BUILD_OUTPUT_RESOURCES, ...PENDING_SOURCES].filter((p) => !existsSync(join(appDir, p)));
/** True for a validator error that only says one of the pending paths does not exist yet. */
function isPending(e) {
  if (strict) return false;
  const resource = /missing resource '([^']+)'/.exec(e.message);
  if (resource) return pendingPaths.includes(resource[1] ?? "");
  const handler = /cannot find associated file with name '([A-Za-z0-9_-]+)\.\(/.exec(e.message);
  if (handler) return pendingPaths.includes(`src/${handler[1] ?? ""}.ts`);
  return false;
}
const blocking = errors.filter((e) => !isPending(e));
const pending = errors.filter((e) => isPending(e));

// Project rules (not covered by the Forge schema).
const doc = parse(readFileSync(manifestPath, "utf8"));
const rules = [];
if (doc?.permissions?.external !== undefined) rules.push("permissions.external must not exist (§14: no egress)");
if (doc?.app?.licensing !== undefined) rules.push("app.licensing must not exist (§2.2: sharing-link app)");
for (const banned of ["llm", "trigger", "scheduledTrigger", "webtrigger", "core:trigger", "core:scheduledTrigger", "core:webtrigger"]) {
  if (doc?.modules?.[banned] !== undefined) rules.push(`modules.${banned} must not exist (D9, D12)`);
}
const actionKeys = (doc?.modules?.action ?? []).map((a) => a.key);
const mcpTools = doc?.modules?.["rovo:mcp"]?.[0]?.tools ?? [];
const agentActions = doc?.modules?.["rovo:agent"]?.[0]?.actions ?? [];
if (actionKeys.length !== 9) rules.push(`expected 9 actions, found ${actionKeys.length} (§10.3)`);
for (const k of actionKeys) {
  if (!mcpTools.includes(k)) rules.push(`action ${k} missing from rovo:mcp tools`);
  if (!agentActions.includes(k)) rules.push(`action ${k} missing from rovo:agent actions`);
}

const fmt = (e) => `${e.line ?? 0}:${e.column ?? 0} ${e.message}`;
for (const w of warnings) console.log(`warning  ${fmt(w)}`);
for (const p of pending) console.log(`PENDING  ${fmt(p)}`);
for (const b of blocking) console.log(`error    ${fmt(b)}`);
for (const r of rules) console.log(`rule     ${r}`);

if (blocking.length > 0 || rules.length > 0) {
  console.error(`manifest.yml: ${blocking.length} schema/validator error(s), ${rules.length} rule violation(s)`);
  process.exit(1);
}
console.log(
  `manifest.yml OK (@forge/manifest full validation${strict ? ", strict" : ""}; ${pending.length} pending build/source path(s), ${warnings.length} warning(s)). Not yet checked by \`forge lint\`.`,
);
