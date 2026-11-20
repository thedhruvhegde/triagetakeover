import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ENTITY_NAMES, ENTITY_SPECS, PROPERTY_INDEXES, PROPERTY_KEYS, QUEUE_NAMES } from "../src/ports/index.js";
import { ACTION_KEYS, parseActionInputs, type ActionKey } from "../src/validation/index.js";

interface ManifestDoc {
  app: { id: string; licensing?: unknown; storage: { entities: { name: string; attributes: Record<string, { type: string }>; indexes: { name: string; partition: string[]; range: string[] }[] }[] } };
  modules: Record<string, { key: string; [k: string]: unknown }[]>;
  permissions: { scopes: string[]; content?: { styles?: string[] }; external?: unknown };
  resources: { key: string; path: string }[];
}

const manifestPath = fileURLToPath(new URL("../manifest.yml", import.meta.url));
const doc = parse(readFileSync(manifestPath, "utf8")) as ManifestDoc;
const mod = (k: string) => doc.modules[k] ?? [];

describe("manifest.yml mirrors (ARCHITECTURE §2, §3, §7.3, §10.3)", () => {
  it("declares exactly the custom entities and indexes in ENTITY_SPECS", () => {
    const entities = doc.app.storage.entities;
    expect(entities.map((e) => e.name)).toEqual([...ENTITY_NAMES]);
    for (const e of entities) {
      const spec = ENTITY_SPECS[e.name as (typeof ENTITY_NAMES)[number]];
      expect(Object.fromEntries(Object.entries(e.attributes).map(([k, v]) => [k, v.type])), e.name).toEqual(spec.attributes);
      expect(e.indexes, e.name).toEqual(spec.indexes.map((i) => ({ name: i.name, partition: [...i.partition], range: [...i.range] })));
    }
  });

  it("declares the entity-property JQL aliases in PROPERTY_INDEXES", () => {
    const declared = mod("jira:entityProperty").flatMap((m) =>
      (m["values"] as { path: string; type: string; searchAlias: string }[]).map((v) => ({ propertyKey: m["propertyKey"], path: v.path, type: v.type, alias: v.searchAlias })),
    );
    expect(declared).toEqual(PROPERTY_INDEXES);
  });

  it("has the 9 actions in the same order everywhere, with the §10.3 inputs", () => {
    const actions = mod("action");
    expect(actions.map((a) => a.key)).toEqual([...ACTION_KEYS]);
    expect(mod("rovo:mcp")[0]?.["tools"]).toEqual([...ACTION_KEYS]);
    expect(mod("rovo:agent")[0]?.["actions"]).toEqual([...ACTION_KEYS]);
    const inputs = Object.fromEntries(actions.map((a) => [a.key, Object.keys((a["inputs"] as Record<string, unknown> | undefined) ?? {})]));
    expect(inputs).toEqual({
      "get-cluster-for-event": ["issueKey"],
      "explain-match": ["issueKey", "clusterKey"],
      "build-regression-check": ["clusterKey", "build", "projectKey"],
      "list-novel-since": ["since", "projectKey", "limit"],
      "list-coverage-gaps": ["projectKey", "minEvents", "includePartial", "limit"],
      "suggest-owner": ["clusterKey"],
      "link-event": ["issueKey", "clusterKey", "userConfirmed"],
      "create-cluster": ["issueKey", "name", "userConfirmed"],
      "create-scenario-stub": ["clusterKey", "userConfirmed"],
    });
    for (const a of actions) {
      const verb = a["actionVerb"];
      expect(verb, a.key).toBe(["link-event", "create-cluster", "create-scenario-stub"].includes(a.key) ? "CREATE" : "GET");
      for (const [name, input] of Object.entries(a["inputs"] as Record<string, { required: boolean; description: string }>)) {
        expect(typeof input.required, `${a.key}.${name}`).toBe("boolean");
        expect(input.description.length, `${a.key}.${name}`).toBeGreaterThan(10);
      }
    }
  });

  it("wires both consumers to the §8 queues and has 12 functions", () => {
    expect(mod("consumer").map((c) => [c["queue"], c["function"]])).toEqual([
      [QUEUE_NAMES.recluster, "recluster"],
      [QUEUE_NAMES.seed, "seed-step"],
    ]);
    const fns = mod("function").map((f) => f.key);
    expect(fns).toHaveLength(12);
    for (const a of mod("action")) expect(fns).toContain(a["function"]);
  });

  it("keeps the §3/§14 guarantees: scopes, no egress, no licensing, no LLM, no triggers", () => {
    expect(doc.permissions.scopes).toEqual([
      "read:jira-work",
      "write:jira-work",
      "read:jira-user",
      "manage:jira-project",
      "storage:app",
      "read:graph:team:atlassian",
      "read:graph:user:atlassian",
    ]);
    expect(doc.permissions.external).toBeUndefined();
    expect(doc.permissions.content?.styles).toEqual(["unsafe-inline"]);
    expect(doc.app.licensing).toBeUndefined();
    for (const banned of ["llm", "trigger", "scheduledTrigger", "webtrigger"]) expect(doc.modules[banned]).toBeUndefined();
    expect(doc.resources.length).toBeLessThanOrEqual(10);
  });

  it("ships the agent prompt and an identical OSS copy of SKILL.md (§10.2)", () => {
    const prompt = readFileSync(fileURLToPath(new URL("../resources/agent/prompt.txt", import.meta.url)), "utf8");
    expect(prompt).toContain("You are Fleet Triage");
    expect(prompt).toContain("userConfirmed true only after the user agrees");
    const skill = readFileSync(fileURLToPath(new URL("../skills/monday-takeover-triage/SKILL.md", import.meta.url)), "utf8");
    const oss = readFileSync(fileURLToPath(new URL("../../../skills/monday-takeover-triage/SKILL.md", import.meta.url)), "utf8");
    expect(oss).toBe(skill);
    expect(skill.split("\n").length).toBeLessThan(500);
  });
});

// ------------------------------------------------------------------ manifest ↔ code (integration)

const appPath = (rel: string): string => fileURLToPath(new URL(`../${rel}`, import.meta.url));

/** A valid sample value for every action input name used in the manifest. */
const SAMPLE: Readonly<Record<string, unknown>> = {
  issueKey: "TTDEMO-1",
  clusterKey: "TTDEMO-2",
  projectKey: "TTDEMO",
  build: "4.12.0",
  since: "2026-11-14T17:00:00Z",
  limit: 5,
  minEvents: 2,
  includePartial: true,
  name: "Lane loss in low sun",
  userConfirmed: true,
};
const TYPE_OF: Readonly<Record<string, string>> = { string: "string", integer: "number", number: "number", boolean: "boolean" };

describe("manifest.yml ↔ code", () => {
  it("every function handler is exported by its module", async () => {
    const modules: Record<string, Record<string, unknown>> = {
      index: (await import("../src/index.js")) as Record<string, unknown>,
      actions: (await import("../src/actions.js")) as Record<string, unknown>,
    };
    for (const f of mod("function")) {
      const [file, fn] = String(f["handler"]).split(".");
      expect(Object.keys(modules), f.key).toContain(file);
      expect(typeof modules[file ?? ""]?.[fn ?? ""], `${f.key}: ${String(f["handler"])}`).toBe("function");
      expect(existsSync(appPath(`src/${file ?? ""}.ts`)), f.key).toBe(true);
    }
  });

  it("every module's resolver/function names a declared function", () => {
    const fns = new Set(mod("function").map((f) => f.key));
    for (const [type, list] of Object.entries(doc.modules)) {
      for (const m of list) {
        const resolver = (m["resolver"] as { function?: string } | undefined)?.function;
        if (resolver !== undefined) expect(fns.has(resolver), `${type}/${m.key}`).toBe(true);
        if (typeof m["function"] === "string") expect(fns.has(m["function"]), `${type}/${m.key}`).toBe(true);
      }
    }
  });

  it("every action's declared inputs match what the code parses (§10.3)", () => {
    for (const a of mod("action")) {
      const key = a.key as ActionKey;
      const inputs = a["inputs"] as Record<string, { type: string; required: boolean }>;
      const full = Object.fromEntries(Object.keys(inputs).map((n) => [n, SAMPLE[n]]));
      for (const [n, spec] of Object.entries(inputs)) {
        expect(SAMPLE[n], `${key}.${n}: no sample`).toBeDefined();
        expect(typeof SAMPLE[n], `${key}.${n}: manifest type ${spec.type}`).toBe(TYPE_OF[spec.type]);
      }
      const parsed = parseActionInputs(key, full);
      expect(parsed.ok, `${key}: a payload with every declared input parses`).toBe(true);
      if (parsed.ok) for (const n of Object.keys(inputs)) expect(parsed.value, `${key}.${n} is read by the code`).toHaveProperty(n);
      for (const [n, spec] of Object.entries(inputs)) {
        // build-regression-check needs one of clusterKey | build; dropping one keeps the other.
        const without = Object.fromEntries(Object.entries(full).filter(([k]) => k !== n));
        const r = parseActionInputs(key, without);
        if (!spec.required) expect(r.ok, `${key}.${n} is optional in the manifest, so the code must not require it`).toBe(true);
        else if (n === "userConfirmed") expect(r.ok && (r.value as { userConfirmed?: boolean }).userConfirmed, `${key}: missing userConfirmed never confirms`).toBe(false);
        else expect(r.ok, `${key}.${n} is required in the manifest and in the code`).toBe(false);
      }
    }
  });

  it("rovo:mcp tools equal the action keys; agent actions and skill tools are subsets", () => {
    const keys = mod("action").map((a) => a.key);
    expect([...(mod("rovo:mcp")[0]?.["tools"] as string[])].sort()).toEqual([...keys].sort());
    for (const k of mod("rovo:agent")[0]?.["actions"] as string[]) expect(keys).toContain(k);
    for (const k of (mod("rovo:skill")[0]?.["dependencies"] as { tools: string[] }).tools) expect(keys).toContain(k);
    expect(mod("rovo:agent")[0]?.["skills"]).toEqual(mod("rovo:skill").map((s) => s.key));
  });

  it("every resource path exists (Custom UI dist: its Vite package; built dists have index.html)", () => {
    for (const r of doc.resources) {
      const dist = /^static\/([a-z]+)\/dist$/.exec(r.path);
      if (dist !== null) {
        const pkg = JSON.parse(readFileSync(appPath(`static/${dist[1] ?? ""}/package.json`), "utf8")) as { scripts?: Record<string, string> };
        expect(pkg.scripts?.["build"], r.key).toBe("vite build");
        expect(existsSync(appPath(`static/${dist[1] ?? ""}/vite.config.ts`)), r.key).toBe(true);
        // `pnpm build:ui` creates it; CI runs the build before the tests and `validate:manifest:strict`.
        if (existsSync(appPath(r.path))) expect(statSync(appPath(`${r.path}/index.html`)).isFile(), r.key).toBe(true);
        else if (process.env["TT_REQUIRE_UI_BUILD"] === "1") expect.fail(`${r.path} is missing; run pnpm build:ui`);
      } else {
        expect(existsSync(appPath(r.path)), `${r.key}: ${r.path}`).toBe(true);
      }
    }
    const keys = new Set(doc.resources.map((r) => r.key));
    for (const [type, list] of Object.entries(doc.modules)) {
      for (const m of list) {
        if (typeof m["resource"] === "string") expect(keys.has(m["resource"]), `${type}/${m.key}`).toBe(true);
        for (const field of ["icon", "prompt"]) {
          const ref = m[field];
          if (typeof ref !== "string" || !ref.startsWith("resource:")) continue;
          const [rk, file] = ref.slice("resource:".length).split(";");
          const res = doc.resources.find((r) => r.key === rk);
          expect(res, `${type}/${m.key}.${field}`).toBeDefined();
          expect(existsSync(appPath(`${res?.path ?? ""}/${file ?? ""}`)), `${type}/${m.key}.${field}: ${ref}`).toBe(true);
        }
      }
    }
    for (const s of mod("rovo:skill")) expect(existsSync(appPath(`${(s["source"] as { dir: string }).dir}/SKILL.md`)), s.key).toBe(true);
  });

  it("UI Kit resources point at a .tsx entry; Custom UI resources at a dist directory", () => {
    const nativeKeys = new Set(Object.values(doc.modules).flatMap((l) => l.filter((m) => m["render"] === "native").map((m) => m["resource"])));
    for (const r of doc.resources) {
      if (nativeKeys.has(r.key)) expect(r.path, r.key).toMatch(/^src\/frontend\/[a-z-]+\.tsx$/);
      else if (["board", "panel", "intake"].includes(r.key)) expect(r.path, r.key).toBe(`static/${r.key}/dist`);
    }
  });

  it("entity-property indexes use the app's property keys", () => {
    const keys = new Set(Object.values(PROPERTY_KEYS));
    for (const m of mod("jira:entityProperty")) expect(keys.has(m["propertyKey"] as never), m.key).toBe(true);
  });

  it("scopes are exactly the MVP rows of ARCHITECTURE §3", () => {
    const arch = readFileSync(fileURLToPath(new URL("../../../docs/ARCHITECTURE.md", import.meta.url)), "utf8");
    const section = arch.slice(arch.indexOf("## 3. Scopes"), arch.indexOf("## 4. "));
    const mvp = section
      .split("\n")
      .filter((l) => /^\| `[a-z:-]+`/.test(l) && /\| MVP[^|]*\|\s*$/.test(l))
      .map((l) => /^\| `([a-z:-]+)`/.exec(l)?.[1] ?? "");
    expect(mvp.length).toBeGreaterThanOrEqual(7);
    expect([...doc.permissions.scopes].sort()).toEqual([...mvp].sort());
  });
});
