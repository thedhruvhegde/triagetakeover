#!/usr/bin/env node
// Offline SPIKE-M2 check: bundle the app with the Forge CLI's OWN webpack configuration
// (@forge/bundler, shipped inside @forge/cli) and load the result, without a Forge login.
//
//   node scripts/forge-bundle-check.cjs            # skip (exit 0) when the Forge CLI is not installed
//   node scripts/forge-bundle-check.cjs --require  # fail when the Forge CLI is not installed (CI)
//
// What it proves: the function entry points named by manifest.yml handlers (`index.*`,
// `actions.*`) compile with Forge's ts-loader/babel setup, `@tt/engine` and `@tt/seedgen` resolve
// through the pnpm workspace symlinks (to their prebuilt dist/), every handler named in the
// manifest is exported by the bundle, and the UI Kit (`render: native`) resources compile with
// Forge's native-UI webpack config. What it does NOT prove: that `forge deploy` uploads and runs
// the bundle (packaging, runtime wrapper, node_modules tracing). That stays SPIKE-M2 on deploy day.
//
// Prerequisite: `pnpm build:engine` (engine/seedgen dist), which `pnpm build` runs first.
// CommonJS on purpose: @forge/bundler reads `require.main`, which is unset under an ESM entry.
"use strict";
const { execSync } = require("node:child_process");
const { existsSync, mkdtempSync, readFileSync, rmSync, statSync } = require("node:fs");
const { createRequire } = require("node:module");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const { parse } = require("yaml");

const appDir = resolve(__dirname, "..");
const requireCli = process.argv.includes("--require");

function findBundler() {
  const candidates = [];
  if (process.env.FORGE_CLI_DIR) candidates.push(process.env.FORGE_CLI_DIR);
  try {
    candidates.push(join(execSync("npm root -g", { encoding: "utf8" }).trim(), "@forge", "cli"));
  } catch {
    /* npm not on PATH */
  }
  for (const cli of candidates) {
    for (const b of [join(cli, "node_modules", "@forge", "bundler"), join(dirname(cli), "bundler")]) {
      if (existsSync(join(b, "out", "config", "common.js"))) return { cli, bundler: b };
    }
  }
  return null;
}

const found = findBundler();
if (!found) {
  const msg = "forge-bundle-check: @forge/cli is not installed globally (npm i -g @forge/cli).";
  if (requireCli) {
    console.error(msg);
    process.exit(1);
  }
  console.log(`SKIP ${msg}`);
  process.exit(0);
}

for (const pkg of ["engine", "seedgen"]) {
  if (!existsSync(join(appDir, "..", "..", "packages", pkg, "dist", "index.js"))) {
    console.error(`forge-bundle-check: packages/${pkg}/dist is missing; run \`pnpm build:engine\` first.`);
    process.exit(1);
  }
}

const req = createRequire(join(found.bundler, "package.json"));
const webpack = req("webpack");
const { getCommonWebpackConfig } = req("./out/config/common.js");
const { getNativeUiBuildConfig } = req("./out/config/nativeui.js");
const cliVersion = JSON.parse(readFileSync(join(found.cli, "package.json"), "utf8")).version;
const bundlerVersion = JSON.parse(readFileSync(join(found.bundler, "package.json"), "utf8")).version;

const manifest = parse(readFileSync(join(appDir, "manifest.yml"), "utf8"));
const handlers = (manifest.modules.function ?? []).map((f) => {
  const [module, fn] = String(f.handler).split(".");
  return { key: f.key, module, fn };
});
const modules = [...new Set(handlers.map((h) => h.module))];
const nativeResources = new Set(
  Object.values(manifest.modules)
    .flat()
    .filter((m) => m && m.render === "native")
    .map((m) => m.resource),
);
const nativeUi = (manifest.resources ?? []).filter((r) => nativeResources.has(r.key));

async function main() {
const out = mkdtempSync(join(tmpdir(), "tt-forge-bundle-"));
process.chdir(appDir);

function run(config) {
  return new Promise((res, rej) => {
    webpack(config).run((e, stats) => {
      if (e) return rej(e);
      const j = stats.toJson({ all: false, errors: true, warnings: true });
      res(j);
    });
  });
}

let failed = false;
const report = (name, j) => {
  for (const e of j.errors) console.error(`error    [${name}] ${e.message.split("\n").slice(0, 4).join(" | ")}`);
  for (const w of j.warnings) console.log(`warning  [${name}] ${w.message.split("\n")[0]}`);
  if (j.errors.length > 0) failed = true;
};

// 1. Functions: exactly the NodeBundler settings from @forge/bundler out/runtime.js.
const nodeCfg = getCommonWebpackConfig({ appDirectory: appDir, entryPoints: modules.map((m) => ({ name: m, path: join("src", m) })) });
nodeCfg.target = "node18";
nodeCfg.output.filename = "[name].cjs";
nodeCfg.output.path = join(out, "functions");
nodeCfg.name = "node-runtime";
nodeCfg.module.rules.push({ test: /\.m?js$/, resolve: { fullySpecified: false } });
nodeCfg.devtool = false;
report("functions", await run(nodeCfg));

if (!failed) {
  const load = createRequire(join(out, "functions", "x.cjs"));
  for (const m of modules) {
    const file = join(out, "functions", `${m}.cjs`);
    const exp = load(file);
    const kb = Math.round(statSync(file).size / 1024);
    for (const h of handlers.filter((x) => x.module === m)) {
      if (typeof exp[h.fn] !== "function") {
        console.error(`error    [functions] ${h.key}: handler ${m}.${h.fn} is not exported by the bundle`);
        failed = true;
      }
    }
    console.log(`ok       [functions] ${m}.cjs ${kb} KB, exports ${handlers.filter((x) => x.module === m).map((h) => h.fn).join(", ")}`);
  }
}

// 2. UI Kit resources: the NativeUIBundler settings from @forge/bundler out/config/nativeui.js.
for (const r of nativeUi) {
  const cfg = getNativeUiBuildConfig([{ name: r.key, path: r.path }], undefined, false);
  cfg.output.path = join(out, "native-ui", r.key);
  cfg.devtool = false;
  const j = await run(cfg);
  report(`native-ui:${r.key}`, j);
  const js = join(cfg.output.path, `${r.key}.js`);
  if (j.errors.length === 0 && existsSync(js)) console.log(`ok       [native-ui] ${r.key} (${r.path}) ${Math.round(statSync(js).size / 1024)} KB`);
}

rmSync(out, { recursive: true, force: true });
if (failed) {
  console.error(`forge-bundle-check: FAILED with @forge/cli ${cliVersion} (@forge/bundler ${bundlerVersion}).`);
  process.exit(1);
}
console.log(`forge-bundle-check OK with @forge/cli ${cliVersion} (@forge/bundler ${bundlerVersion}); offline only, not a deploy.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
