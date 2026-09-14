#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";

const expectedCodexHostVersion = "0.8.2";
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
const nestedPlatformRoot = join(mainRoot, "node_modules", "@codexhost", "cli-win32-x64");
const installerRoot = process.env.CODEXHOST_INSTALL_ROOT
  ? join(process.env.CODEXHOST_INSTALL_ROOT)
  : process.platform === "win32"
    ? join(process.env.LOCALAPPDATA ?? "", "Programs", "codexhost")
    : undefined;

const installationCandidates = [
  { name: "official installer", root: installerRoot },
  { name: "npm nested platform package", root: nestedPlatformRoot },
  {
    name: "npm top-level platform package",
    root: join(npmRoot ?? "", "node_modules", "@codexhost", "cli-win32-x64"),
  },
].filter((candidate) => candidate.root);

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
    throw new Error(`Expected one CodexHost 0.8.2 patch anchor for ${label}, found ${count}`);
  }
  return source.replace(search, replacement);
}

function replaceExactCount(source, search, replacement, expectedCount, label) {
  if (source.includes(replacement)) return source;
  const count = source.split(search).length - 1;
  if (count !== expectedCount) {
    throw new Error(`Expected ${expectedCount} CodexHost 0.8.2 patch anchors for ${label}, found ${count}`);
  }
  return source.replaceAll(search, replacement);
}

const installation = installationCandidates.find((candidate) => {
  const appRoot = join(candidate.root, "app");
  return ["codexhost-distribution.json", "plugins/enabled.json", "desktop-controller.mjs", "renderer-extension.js"].every(
    (relative) => existsSync(join(appRoot, relative)),
  );
});
if (!installation) {
  const searched = installationCandidates.map((candidate) => candidate.root).join(", ");
  throw new Error(`Unable to locate CodexHost ${expectedCodexHostVersion}; searched: ${searched}`);
}
const codexHostRoot = installation.root;
requireVersion(join(codexHostRoot, "app", "codexhost-distribution.json"), expectedCodexHostVersion);

const pluginRoot = join(codexHostRoot, "app", "plugins", harnessId);
const pluginSourceRoot = join(repoRoot, "snapshots", "codex-host-runtime", expectedCodexHostVersion, "plugin");
const pluginManifest = await readJson(join(pluginSourceRoot, "manifest.json"));
if (
  pluginManifest.id !== harnessId ||
  pluginManifest.adapterApiVersion !== 1 ||
  pluginManifest.entry !== "plugin.mjs" ||
  pluginManifest.icon !== "./assets/icon.svg" ||
  !existsSync(join(pluginSourceRoot, pluginManifest.entry))
) {
  throw new Error(`Invalid HMHarness plugin bundle at ${pluginSourceRoot}`);
}
const pluginIconBase64 = Buffer.from(
  await readFile(join(pluginSourceRoot, "assets/icon.svg")),
).toString("base64");

await rm(pluginRoot, { recursive: true, force: true });
await mkdir(pluginRoot, { recursive: true });
for (const relative of ["manifest.json", "plugin.mjs", "assets/icon.svg"]) {
  const source = join(pluginSourceRoot, relative);
  if (!existsSync(source)) throw new Error(`Missing bundled plugin artifact: ${source}`);
  await mkdir(dirname(join(pluginRoot, relative)), { recursive: true });
  await cp(source, join(pluginRoot, relative));
}

const enabledPath = join(codexHostRoot, "app", "plugins", "enabled.json");
const enabled = JSON.parse(await readFile(enabledPath, "utf8"));
if (enabled.version !== 1 || !Array.isArray(enabled.enabled)) {
  throw new Error("CodexHost plugin enabled.json has an unsupported format");
}
if (!enabled.enabled.includes(harnessId)) enabled.enabled.push(harnessId);
await writeFile(enabledPath, `${JSON.stringify(enabled, null, 2)}\n`);

const controllerPath = join(codexHostRoot, "app", "desktop-controller.mjs");
let controller = await readFile(controllerPath, "utf8");
controller = replaceOnce(
  controller,
  `          "antigravity",\n          "kiro-cli",\n          "codebuddy",\n          "cursor-cli",\n          "hermes"`,
  `          "antigravity",\n          "hmharness",\n          "kiro-cli",\n          "codebuddy",\n          "cursor-cli",\n          "hermes"`,
  "Desktop Controller enabled Agents",
);
await writeFile(controllerPath, controller);

const rendererPath = join(codexHostRoot, "app", "renderer-extension.js");
let renderer = await readFile(rendererPath, "utf8");
renderer = replaceOnce(
  renderer,
  `  // src/renderer-agent-icon.ts\n`,
  `  // src/renderer-agent-icon.ts\n  var hmharness_agent_default = "data:image/svg+xml;base64,${pluginIconBase64}";\n`,
  "Renderer HMHarness icon asset",
);

renderer = replaceOnce(
  renderer,
  `  var KNOWN_RENDERER_AGENTS = [\n    "codex",\n    "pi",\n    "claude-code",\n    "deepseek-harness",\n    "opencode",\n    "grok",\n    "omp",\n    "antigravity",\n    "kiro-cli",\n    "codebuddy",\n    "cursor-cli",\n    "hermes"\n  ];`,
  `  var KNOWN_RENDERER_AGENTS = [\n    "codex",\n    "pi",\n    "claude-code",\n    "deepseek-harness",\n    "opencode",\n    "grok",\n    "omp",\n    "antigravity",\n    "hmharness",\n    "kiro-cli",\n    "codebuddy",\n    "cursor-cli",\n    "hermes"\n  ];`,
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
  `image.src = agent === "codebuddy" ? codebuddy_agent_default : agent === "cursor-cli" ? cursor_agent_default : agent === "kiro-cli" ? kiro_agent_default : antigravity_agent_default;`,
  `image.src = agent === "hmharness" ? hmharness_agent_default : agent === "codebuddy" ? codebuddy_agent_default : agent === "cursor-cli" ? cursor_agent_default : agent === "kiro-cli" ? kiro_agent_default : antigravity_agent_default;`,
  "Renderer HMHarness icon selection",
);
renderer = replaceOnce(
  renderer,
  `"antigravity",\n          "kiro-cli",\n          "codebuddy",\n          "cursor-cli",\n          "hermes"`,
  `"antigravity",\n          "hmharness",\n          "kiro-cli",\n          "codebuddy",\n          "cursor-cli",\n          "hermes"`,
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
  `  var externalAgents = [\n    "pi",\n    "claude-code",\n    "deepseek-harness",\n    "opencode",\n    "grok",\n    "omp",\n    "antigravity",\n    "kiro-cli",\n    "codebuddy",\n    "cursor-cli",\n    "hermes"\n  ];`,
  `  var externalAgents = [\n    "pi",\n    "claude-code",\n    "deepseek-harness",\n    "opencode",\n    "grok",\n    "omp",\n    "antigravity",\n    "hmharness",\n    "kiro-cli",\n    "codebuddy",\n    "cursor-cli",\n    "hermes"\n  ];`,
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
  `if (agent === "antigravity" || agent === "kiro-cli" || agent === "codebuddy" || agent === "cursor-cli") {`,
  `if (agent === "antigravity" || agent === "hmharness" || agent === "kiro-cli" || agent === "codebuddy" || agent === "cursor-cli") {`,
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
  `antigravity: void 0,\n        "kiro-cli": void 0,\n        codebuddy: void 0,\n        "cursor-cli": void 0,\n        hermes: void 0`,
  `antigravity: void 0,\n        hmharness: void 0,\n        "kiro-cli": void 0,\n        codebuddy: void 0,\n        "cursor-cli": void 0,\n        hermes: void 0`,
  "Renderer initial HMHarness availability",
);

await writeFile(rendererPath, renderer);
console.log(
  `Applied HMHarness to CodexHost ${expectedCodexHostVersion} (${installation.name}) at ${codexHostRoot}`,
);
