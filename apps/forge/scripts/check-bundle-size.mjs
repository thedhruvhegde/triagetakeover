#!/usr/bin/env node
// Custom UI bundle budgets (ARCHITECTURE §13): run after `pnpm build:ui`.
//
// - HARD (fails): every Custom UI resource's whole dist ≤ 1.2 MB gzip (§13 "Custom UI bundle
//   (per resource) ≤ 1.2 MB gz").
// - HARD (fails): the engine's JPEG decoder ships only in `intake` (§13 "jpeg-js only in intake").
// - SOFT (warns): the first load (index.html plus the JS/CSS it references) ≤ 500 KB raw, the
//   tighter target the Custom UI work package used.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { parse } from "yaml";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HARD_GZIP = 1.2 * 1024 * 1024;
const SOFT_FIRST_LOAD_RAW = 500 * 1024;
/** Strings that only appear in jpeg-js's decoder (its error messages). */
const JPEG_DECODER_MARKERS = ["marker was not found", "unknown JPEG marker", "JPEG error"];

const manifest = parse(readFileSync(join(appDir, "manifest.yml"), "utf8"));
const resources = (manifest.resources ?? []).filter((r) => String(r.path).startsWith("static/") && String(r.path).endsWith("/dist"));

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

let failed = false;
const rows = [];
for (const r of resources) {
  const dist = join(appDir, r.path);
  if (!existsSync(join(dist, "index.html"))) {
    console.error(`error    ${r.key}: ${r.path}/index.html is missing; run \`pnpm build:ui\` first.`);
    failed = true;
    continue;
  }
  const all = files(dist);
  let raw = 0;
  let gz = 0;
  let jpeg = false;
  for (const f of all) {
    const buf = readFileSync(f);
    raw += buf.length;
    gz += gzipSync(buf, { level: 9 }).length;
    if (/\.js$/.test(f) && JPEG_DECODER_MARKERS.some((m) => buf.includes(m))) jpeg = true;
  }
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const refs = [...html.matchAll(/(?:src|href)="\.?\/?([^"]+\.(?:js|css))"/g)].map((m) => m[1] ?? "");
  let firstRaw = statSync(join(dist, "index.html")).size;
  let firstGz = gzipSync(readFileSync(join(dist, "index.html")), { level: 9 }).length;
  for (const ref of refs) {
    const f = join(dist, ref);
    if (!existsSync(f)) continue;
    const buf = readFileSync(f);
    firstRaw += buf.length;
    firstGz += gzipSync(buf, { level: 9 }).length;
  }
  rows.push({ key: r.key, files: all.length, raw, gz, firstRaw, firstGz, jpeg });
  if (gz > HARD_GZIP) {
    console.error(`error    ${r.key}: whole dist ${kb(gz)} gzip exceeds the §13 budget of ${kb(HARD_GZIP)}`);
    failed = true;
  }
  if (jpeg && r.key !== "intake") {
    console.error(`error    ${r.key}: contains the JPEG decoder; §13 allows it only in intake`);
    failed = true;
  }
  if (firstRaw > SOFT_FIRST_LOAD_RAW) console.log(`warning  ${r.key}: first load ${kb(firstRaw)} raw is over the ${kb(SOFT_FIRST_LOAD_RAW)} target`);
}

console.log("resource  files  dist raw    dist gzip   first-load raw  first-load gzip  jpeg-decoder");
for (const x of rows) {
  console.log(
    `${x.key.padEnd(9)} ${String(x.files).padStart(5)}  ${kb(x.raw).padStart(10)}  ${kb(x.gz).padStart(10)}  ${kb(x.firstRaw).padStart(14)}  ${kb(x.firstGz).padStart(15)}  ${x.jpeg ? "yes" : "no"}`,
  );
}
if (failed) process.exit(1);
console.log(`bundle budgets OK (§13: ≤ ${kb(HARD_GZIP)} gzip per resource; JPEG decoder only in intake).`);
