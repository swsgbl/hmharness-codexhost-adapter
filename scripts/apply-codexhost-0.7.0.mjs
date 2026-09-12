#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";

const expectedCodexHostVersion = "0.7.0";
const harnessId = "hmharness";
const repoRoot = join(import.meta.dirname, "..");
const npmRoot = process.env.npm_config_prefix
  ? join(process.env.npm_config_prefix, process.platform === "win32" ? "" : "lib")
  : process.platform === "win32"
    ? join(process.env.APPDATA ?? "", "npm")
    : undefined;

if (!npmRoot || !existsSync(npmRoot)) {
  throw new Error(`Unable to locate the global npm root (candidate: ${npmRoot ?? "none"})`);
}

const mainRoot = join(npmRoot, "node_modules", "@codexhost", "cli");
const platformRoot = join(mainRoot, "node_modules", "@codexhost", "cli-win32-x64");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function requireVersion(path, expected) {
  const parsed = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  if (!parsed || parsed.version !== expected) {
    throw new Error(`${path} must be version ${expected}`);
  }
}

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`Expected one CodexHost 0.7.0 patch anchor for ${label}, found ${count}`);
  }
  return source.replace(search, replacement);
}

function replaceExactCount(source, search, replacement, expectedCount, label) {
  if (source.includes(replacement)) return source;
  const count = source.split(search).length - 1;
  if (count !== expectedCount) {
    throw new Error(`Expected ${expectedCount} CodexHost 0.7.0 patch anchors for ${label}, found ${count}`);
  }
  return source.replaceAll(search, replacement);
}

requireVersion(join(mainRoot, "package.json"), expectedCodexHostVersion);
requireVersion(join(platformRoot, "package.json"), expectedCodexHostVersion);

const pluginRoot = join(platformRoot, "app", "plugins", harnessId);
const pluginSourceRoot = join(repoRoot, "snapshots", "codex-host-runtime", expectedCodexHostVersion, "plugin");
const pluginManifest = await readJson(join(pluginSourceRoot, "manifest.json"));
if (
  pluginManifest.id !== harnessId ||
  pluginManifest.adapterApiVersion !== 1 ||
  pluginManifest.entry !== "plugin.mjs" ||
  !existsSync(join(pluginSourceRoot, pluginManifest.entry))
) {
  throw new Error(`Invalid HMHarness plugin bundle at ${pluginSourceRoot}`);
}

await rm(pluginRoot, { recursive: true, force: true });
await mkdir(pluginRoot, { recursive: true });
for (const relative of ["manifest.json", "plugin.mjs", "assets/icon.svg"]) {
  const source = join(pluginSourceRoot, relative);
  if (!existsSync(source)) throw new Error(`Missing bundled plugin artifact: ${source}`);
  await mkdir(dirname(join(pluginRoot, relative)), { recursive: true });
  await cp(source, join(pluginRoot, relative));
}

const enabledPath = join(platformRoot, "app", "plugins", "enabled.json");
const enabled = JSON.parse(await readFile(enabledPath, "utf8"));
if (enabled.version !== 1 || !Array.isArray(enabled.enabled)) {
  throw new Error("CodexHost plugin enabled.json has an unsupported format");
}
if (!enabled.enabled.includes(harnessId)) enabled.enabled.push(harnessId);
await writeFile(enabledPath, `${JSON.stringify(enabled, null, 2)}\n`);

const controllerPath = join(platformRoot, "app", "desktop-controller.mjs");
let controller = await readFile(controllerPath, "utf8");
controller = replaceOnce(
  controller,
  `          "antigravity",\n          "kiro-cli",\n          "codebuddy",`,
  `          "antigravity",\n          "hmharness",\n          "kiro-cli",\n          "codebuddy",`,
  "Desktop Controller enabled Agents",
);
await writeFile(controllerPath, controller);

const rendererPath = join(platformRoot, "app", "renderer-extension.js");
let renderer = await readFile(rendererPath, "utf8");

renderer = replaceOnce(
  renderer,
  `  var KNOWN_RENDERER_AGENTS = [\n    "codex",\n    "pi",\n    "claude-code",\n    "deepseek-harness",\n    "opencode",\n    "grok",\n    "omp",\n    "antigravity",\n    "kiro-cli",\n    "codebuddy",\n    "cursor-cli"\n  ];`,
  `  var KNOWN_RENDERER_AGENTS = [\n    "codex",\n    "pi",\n    "claude-code",\n    "deepseek-harness",\n    "opencode",\n    "grok",\n    "omp",\n    "antigravity",\n    "hmharness",\n    "kiro-cli",\n    "codebuddy",\n    "cursor-cli"\n  ];`,
  "Renderer known Agents",
);
renderer = replaceOnce(
  renderer,
  `      if (agent === "antigravity" && model) state.antigravityModel = model;\n      else if (agent === "antigravity") delete state.antigravityModel;\n      if (agent === "kiro-cli" && model) state.kiroCliModel = model;`,
  `      if (agent === "antigravity" && model) state.antigravityModel = model;\n      else if (agent === "antigravity") delete state.antigravityModel;\n      if (agent === "hmharness" && model) state.hmHarnessModel = model;\n      else if (agent === "hmharness") delete state.hmHarnessModel;\n      if (agent === "kiro-cli" && model) state.kiroCliModel = model;`,
  "Renderer restored model",
);
renderer = replaceOnce(
  renderer,
  `"antigravity",\n          "kiro-cli",\n          "codebuddy",\n          "cursor-cli"`,
  `"antigravity",\n          "hmharness",\n          "kiro-cli",\n          "codebuddy",\n          "cursor-cli"`,
  "Renderer permission-agent list",
);
renderer = replaceOnce(
  renderer,
  `      if (agent === "antigravity") return state.antigravityModel;\n      if (agent === "kiro-cli") return state.kiroCliModel;`,
  `      if (agent === "antigravity") return state.antigravityModel;\n      if (agent === "hmharness") return state.hmHarnessModel;\n      if (agent === "kiro-cli") return state.kiroCliModel;`,
  "Renderer model lookup",
);
renderer = replaceOnce(
  renderer,
  `      else if (agent === "antigravity") state.antigravityModel = model;\n      else if (agent === "kiro-cli") state.kiroCliModel = model;`,
  `      else if (agent === "antigravity") state.antigravityModel = model;\n      else if (agent === "hmharness") state.hmHarnessModel = model;\n      else if (agent === "kiro-cli") state.kiroCliModel = model;`,
  "Renderer model update",
);
renderer = replaceOnce(
  renderer,
  `    antigravity: "Antigravity CLI",\n    "kiro-cli": "Kiro CLI",`,
  `    antigravity: "Antigravity CLI",\n    hmharness: "HMHarness",\n    "kiro-cli": "Kiro CLI",`,
  "Renderer Agent label",
);
renderer = replaceOnce(
  renderer,
  `    antigravity: harnessIdSchema.parse("antigravity"),\n    "kiro-cli": harnessIdSchema.parse("kiro-cli"),`,
  `    antigravity: harnessIdSchema.parse("antigravity"),\n    hmharness: harnessIdSchema.parse("hmharness"),\n    "kiro-cli": harnessIdSchema.parse("kiro-cli"),`,
  "Renderer external Harness ID",
);
renderer = replaceOnce(
  renderer,
  `  var externalAgents = [\n    "pi",\n    "claude-code",\n    "deepseek-harness",\n    "opencode",\n    "grok",\n    "omp",\n    "antigravity",\n    "kiro-cli",\n    "codebuddy",\n    "cursor-cli"\n  ];`,
  `  var externalAgents = [\n    "pi",\n    "claude-code",\n    "deepseek-harness",\n    "opencode",\n    "grok",\n    "omp",\n    "antigravity",\n    "hmharness",\n    "kiro-cli",\n    "codebuddy",\n    "cursor-cli"\n  ];`,
  "Renderer external Agents",
);
renderer = replaceExactCount(
  renderer,
  `    antigravity: "https://antigravity.google/product/antigravity-cli",\n    "kiro-cli": "https://kiro.dev/docs/cli/",`,
  `    antigravity: "https://antigravity.google/product/antigravity-cli",\n    hmharness: "https://www.npmjs.com/package/@hmharness/cli",\n    "kiro-cli": "https://kiro.dev/docs/cli/",`,
  2,
  "Renderer install URL",
);
renderer = replaceOnce(
  renderer,
  `    if (ownership.harnessId === "antigravity") return "antigravity";\n    if (ownership.harnessId === "kiro-cli") return "kiro-cli";`,
  `    if (ownership.harnessId === "antigravity") return "antigravity";\n    if (ownership.harnessId === "hmharness") return "hmharness";\n    if (ownership.harnessId === "kiro-cli") return "kiro-cli";`,
  "Renderer sidebar ownership",
);
renderer = replaceOnce(
  renderer,
  `if (inspection.harnessId === "kiro-cli" || inspection.harnessId === "codebuddy" || inspection.harnessId === "cursor-cli") {`,
  `if (inspection.harnessId === "hmharness" || inspection.harnessId === "kiro-cli" || inspection.harnessId === "codebuddy" || inspection.harnessId === "cursor-cli") {`,
  "Renderer restored HMHarness Thread",
);
renderer = replaceOnce(
  renderer,
  `    if (agent === "antigravity") return ANTIGRAVITY_TRANSPORT_MODEL_ID;\n    if (agent === "kiro-cli") return encodeHarnessPluginRoute({ harnessId: KIRO_CLI_HARNESS_ID });`,
  `    if (agent === "antigravity") return ANTIGRAVITY_TRANSPORT_MODEL_ID;\n    if (agent === "hmharness") return encodeHarnessPluginRoute({ harnessId: harnessIdSchema.parse("hmharness") });\n    if (agent === "kiro-cli") return encodeHarnessPluginRoute({ harnessId: KIRO_CLI_HARNESS_ID });`,
  "Renderer transport carrier",
);
renderer = replaceOnce(
  renderer,
  `agent === "kiro-cli" || agent === "codebuddy" || agent === "cursor-cli" ? encodeHarnessPluginRoute({`,
  `agent === "hmharness" || agent === "kiro-cli" || agent === "codebuddy" || agent === "cursor-cli" ? encodeHarnessPluginRoute({`,
  "Renderer HMHarness model carrier",
);
renderer = replaceOnce(
  renderer,
  `antigravity: void 0,\n        "kiro-cli": void 0,\n        codebuddy: void 0,\n        "cursor-cli": void 0`,
  `antigravity: void 0,\n        hmharness: void 0,\n        "kiro-cli": void 0,\n        codebuddy: void 0,\n        "cursor-cli": void 0`,
  "Renderer initial HMHarness availability",
);

await writeFile(rendererPath, renderer);
console.log(`Applied HMHarness to @codexhost/cli ${expectedCodexHostVersion} at ${platformRoot}`);
