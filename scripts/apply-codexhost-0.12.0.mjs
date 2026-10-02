#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";

const expectedCodexHostVersion = "0.12.0";
const harnessId = "hmharness";
const expectedPluginSha256 = "57D1EDD1394F2011B0FF4C88830870FF64C6D4A0A49BFA3BAF0C7094FDA4436A";
const expectedIconSha256 = "950FA9B06484F9D56C51A976679252D3061832279292658C20E59D9F06FE75DF";
// Codex Host 0.12.0 still gates locale catalog loading behind remote controls.
const rendererI18nGatePatch = `
(() => {
  const layerName = "72216192";
  const marker = "__codexhostI18nGatePatch";
  const descriptorsMarker = marker + "Descriptors";
  const enabledGateNames = new Set(["410065390", "3097504420"]);
  function patchClient(client) {
    if (!client || client[marker] || typeof client.getLayer !== "function") return;
    const originalGetLayer = client.getLayer;
    const originalCheckGate = client.checkGate;
    if (typeof originalCheckGate === "function") {
      client.checkGate = function patchedCheckGate(name, options) {
        const value = originalCheckGate.call(this, name, options);
        return enabledGateNames.has(name) ? true : value;
      };
    }
    const originalGetFeatureGate = client.getFeatureGate;
    if (typeof originalGetFeatureGate === "function") {
      client.getFeatureGate = function patchedGetFeatureGate(name, options) {
        const gate = originalGetFeatureGate.call(this, name, options);
        if (!enabledGateNames.has(name) || gate == null) return gate;
        return { ...gate, value: true };
      };
    }
    client.getLayer = function patchedGetLayer(name, options) {
      const layer = originalGetLayer.call(this, name, options);
      if (name !== layerName) return layer;
      return {
        ...layer,
        get(key, fallback) {
          if (key === "enable_i18n") return true;
          if (key === "locale_source") return "IDE";
          return typeof layer?.get === "function" ? layer.get(key, fallback) : fallback;
        },
      };
    };
    Object.defineProperty(client, marker, { value: true });
  }
  function patchNamespace(namespace) {
    if (!namespace || typeof namespace !== "object") return;
    if (!namespace[marker]) Object.defineProperty(namespace, marker, { value: true });
    if (!namespace[descriptorsMarker]) {
      Object.defineProperty(namespace, descriptorsMarker, { value: true });
      for (const propertyName of ["firstInstance", "instance"]) {
        let current = namespace[propertyName];
        if (current) patchClient(current);
        Object.defineProperty(namespace, propertyName, {
          configurable: true,
          enumerable: true,
          get: () => current,
          set: (client) => {
            current = client;
            patchClient(client);
          },
        });
      }
    }
    for (const propertyName of ["firstInstance", "instance"]) patchClient(namespace[propertyName]);
  }
  if (window[marker]) return;
  Object.defineProperty(window, marker, { value: true });
  let statsigNamespace = window.__STATSIG__;
  patchNamespace(statsigNamespace);
  const poll = setInterval(() => {
    if (statsigNamespace !== window.__STATSIG__) {
      statsigNamespace = window.__STATSIG__;
    }
    patchNamespace(statsigNamespace);
    const client = statsigNamespace?.firstInstance ?? statsigNamespace?.instance;
    if (client?.[marker]) clearInterval(poll);
  }, 5);
  Object.defineProperty(window, "__STATSIG__", {
    configurable: true,
    enumerable: true,
    get: () => statsigNamespace,
    set: (namespace) => {
      statsigNamespace = namespace;
      patchNamespace(namespace);
    },
  });
})();
`;
const repoRoot = resolve(join(import.meta.dirname, ".."));
const snapshotRoot = join(repoRoot, "snapshots", "codex-host-runtime", expectedCodexHostVersion, "plugin");
const npmRoot = process.platform === "win32"
  ? join(process.env.APPDATA ?? "", "npm")
  : undefined;
const codexHostRoot = npmRoot
  ? join(npmRoot, "node_modules", "@codexhost", "cli", "node_modules", "@codexhost", "cli-win32-x64")
  : process.env.CODEXHOST_HOST_ROOT;
const home = process.env.USERPROFILE ?? process.env.HOME;
const userPluginRoot = process.env.CODEXHOST_PLUGIN_DIRECTORY ?? join(home ?? "", ".codexhost", "plugins");
const backupRoot = join(home ?? process.cwd(), ".codexhost", "backups");
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);

if (!home || !isAbsolute(userPluginRoot)) {
  throw new Error(`Unable to resolve the CodexHost user plugin directory: ${userPluginRoot}`);
}
if (!codexHostRoot || !isAbsolute(codexHostRoot)) {
  throw new Error(`Unable to resolve CodexHost ${expectedCodexHostVersion}: ${codexHostRoot ?? "none"}`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
}

function replaceExactCount(source, search, replacement, expectedCount, label) {
  if (source.includes(replacement)) return source;
  const count = source.split(search).length - 1;
  if (count !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} CodexHost ${expectedCodexHostVersion} patch anchors for ${label}, found ${count}`
    );
  }
  return source.replaceAll(search, replacement);
}

function withRendererI18nGate(source) {
  const prefix = `"use strict";\n`;
  const appOpening = `(() => {\n  var __defProp = Object.defineProperty;`;
  const patchOpening = `(() => {\n  const layerName = "72216192";`;
  if (!source.startsWith(prefix)) throw new Error("CodexHost renderer has an unexpected prologue");
  let body = source.slice(prefix.length);
  body = body.startsWith("\n") ? body.slice(1) : body;
  if (body.startsWith(patchOpening)) {
    const appOpeningIndex = body.indexOf(appOpening, patchOpening.length);
    if (appOpeningIndex < 0) throw new Error("Unable to replace the existing renderer i18n gate patch");
    body = body.slice(appOpeningIndex);
  }
  if (!body.startsWith(appOpening)) throw new Error("CodexHost renderer i18n gate anchor was not found");
  return prefix + rendererI18nGatePatch + body;
}

function inside(root, candidate) {
  if (!isAbsolute(candidate)) return false;
  const value = relative(resolve(root), resolve(candidate));
  return value !== "" && value !== ".." && !value.startsWith(`..${sep}`);
}

async function backupAndRemove(root, label) {
  if (!inside(backupRoot, root) && !inside(home, root)) {
    throw new Error(`Refusing unexpected ${label} path: ${root}`);
  }
  const backup = join(backupRoot, `${label}-${stamp}`);
  await mkdir(backup, { recursive: true });
  await cp(root, join(backup, label), { recursive: true });
  await rm(root, { recursive: true, force: true });
  return backup;
}

const distribution = await readJson(join(codexHostRoot, "app", "codexhost-distribution.json"));
if (distribution.version !== expectedCodexHostVersion) {
  throw new Error(`Expected CodexHost ${expectedCodexHostVersion}, found ${distribution.version}`);
}
const officialEnabled = await readJson(join(codexHostRoot, "app", "plugins", "enabled.json"));
if (officialEnabled.version !== 1 || !Array.isArray(officialEnabled.enabled)) {
  throw new Error("CodexHost 0.12.0 official enabled.json has an unsupported format");
}
if (!officialEnabled.enabled.includes("claude-code")) {
  throw new Error("CodexHost 0.12.0 does not have Claude Code enabled in its official plugin list");
}

for (const [relativePath, expectedHash] of [
  ["plugin.mjs", expectedPluginSha256],
  ["assets/icon.svg", expectedIconSha256],
]) {
  const path = join(snapshotRoot, relativePath);
  if (!existsSync(path) || sha256(path) !== expectedHash) {
    throw new Error(`HMHarness snapshot hash mismatch for ${path}; expected ${expectedHash}`);
  }
}
const manifest = await readJson(join(snapshotRoot, "manifest.json"));
if (
  manifest.id !== harnessId ||
  manifest.adapterApiVersion !== 1 ||
  manifest.entry !== "plugin.mjs" ||
  manifest.icon !== "./assets/icon.svg"
) {
  throw new Error(`Invalid HMHarness plugin manifest at ${snapshotRoot}`);
}

await mkdir(userPluginRoot, { recursive: true });
const userPlugin = join(userPluginRoot, harnessId);
if (existsSync(userPlugin)) await backupAndRemove(userPlugin, "hmharness-user-plugin");
await mkdir(join(userPlugin, "assets"), { recursive: true });
for (const relativePath of ["manifest.json", "plugin.mjs", "assets/icon.svg"]) {
  await copyFile(join(snapshotRoot, relativePath), join(userPlugin, relativePath));
}

const userEnabledPath = join(userPluginRoot, "enabled.json");
let userEnabled = { version: 1, enabled: [] };
if (existsSync(userEnabledPath)) {
  userEnabled = await readJson(userEnabledPath);
  if (userEnabled.version !== 1 || !Array.isArray(userEnabled.enabled)) {
    throw new Error(`Unsupported user plugin configuration: ${userEnabledPath}`);
  }
}
userEnabled.enabled = [...new Set([...userEnabled.enabled.filter((id) => id !== harnessId), harnessId])];
await writeFile(userEnabledPath, `${JSON.stringify(userEnabled, null, 2)}\n`, "utf8");

const bundledPlugin = join(codexHostRoot, "app", "plugins", harnessId);
let bundledDuplicateBackup = null;
if (existsSync(bundledPlugin)) {
  bundledDuplicateBackup = await backupAndRemove(bundledPlugin, "codexhost-0120-hmharness-plugin");
  const appEnabledPath = join(codexHostRoot, "app", "plugins", "enabled.json");
  const appEnabled = await readJson(appEnabledPath);
  appEnabled.enabled = appEnabled.enabled.filter((id) => id !== harnessId);
  await writeFile(appEnabledPath, `${JSON.stringify(appEnabled, null, 2)}\n`, "utf8");
}

const runtimeBackupRoot = join(backupRoot, `codexhost-0120-runtime-${stamp}`);
const controllerPath = join(codexHostRoot, "app", "desktop-controller.mjs");
let controller = await readFile(controllerPath, "utf8");
if (!controller.includes(`"${harnessId}"`)) {
  await mkdir(runtimeBackupRoot, { recursive: true });
  await copyFile(controllerPath, join(runtimeBackupRoot, "desktop-controller.mjs.official"));
}
controller = replaceExactCount(
  controller,
  `          "antigravity",\n          "kiro-cli",`,
  `          "antigravity",\n          "${harnessId}",\n          "kiro-cli",`,
  1,
  "Desktop Controller enabled Agents",
);
await writeFile(controllerPath, controller, "utf8");

const pluginIconBase64 = Buffer.from(
  await readFile(join(snapshotRoot, "assets", "icon.svg")),
).toString("base64");
const rendererPath = join(codexHostRoot, "app", "renderer-extension.js");
let renderer = await readFile(rendererPath, "utf8");
const rendererWasPatched = renderer.includes("hmharness_agent_default");
if (!rendererWasPatched) {
  await mkdir(runtimeBackupRoot, { recursive: true });
  await copyFile(rendererPath, join(runtimeBackupRoot, "renderer-extension.js.official"));
}
renderer = withRendererI18nGate(renderer);
renderer = replaceExactCount(
  renderer,
  `  // src/renderer-agent-icon.ts\n`,
  `  // src/renderer-agent-icon.ts\n  var hmharness_agent_default = "data:image/svg+xml;base64,${pluginIconBase64}";\n`,
  1,
  "Renderer HMHarness icon asset",
);
renderer = replaceExactCount(
  renderer,
  `    "antigravity",\n    "kiro-cli",`,
  `    "antigravity",\n    "hmharness",\n    "kiro-cli",`,
  2,
  "Renderer known and external Agents",
);
renderer = replaceExactCount(
  renderer,
  `          "antigravity",\n          "kiro-cli",`,
  `          "antigravity",\n          "hmharness",\n          "kiro-cli",`,
  1,
  "Renderer permission-agent list",
);
renderer = replaceExactCount(
  renderer,
  `    antigravity: harnessIdSchema.parse("antigravity"),\n    "kiro-cli": harnessIdSchema.parse("kiro-cli"),`,
  `    antigravity: harnessIdSchema.parse("antigravity"),\n    hmharness: harnessIdSchema.parse("hmharness"),\n    "kiro-cli": harnessIdSchema.parse("kiro-cli"),`,
  1,
  "Renderer external Harness ID",
);
renderer = replaceExactCount(
  renderer,
  `      if (agent === "antigravity" && model) state.antigravityModel = model;\n      else if (agent === "antigravity") delete state.antigravityModel;\n      if (agent === "kiro-cli" && model) state.kiroCliModel = model;`,
  `      if (agent === "antigravity" && model) state.antigravityModel = model;\n      else if (agent === "antigravity") delete state.antigravityModel;\n      if (agent === "hmharness" && model) state.hmHarnessModel = model;\n      else if (agent === "hmharness") delete state.hmHarnessModel;\n      if (agent === "kiro-cli" && model) state.kiroCliModel = model;`,
  1,
  "Renderer restored model",
);
renderer = replaceExactCount(
  renderer,
  `      if (agent === "antigravity") return state.antigravityModel;\n      if (agent === "kiro-cli") return state.kiroCliModel;`,
  `      if (agent === "antigravity") return state.antigravityModel;\n      if (agent === "hmharness") return state.hmHarnessModel;\n      if (agent === "kiro-cli") return state.kiroCliModel;`,
  1,
  "Renderer model lookup",
);
renderer = replaceExactCount(
  renderer,
  `      else if (agent === "antigravity") state.antigravityModel = model;\n      else if (agent === "kiro-cli") state.kiroCliModel = model;`,
  `      else if (agent === "antigravity") state.antigravityModel = model;\n      else if (agent === "hmharness") state.hmHarnessModel = model;\n      else if (agent === "kiro-cli") state.kiroCliModel = model;`,
  1,
  "Renderer model update",
);
renderer = replaceExactCount(
  renderer,
  `    antigravity: "Antigravity CLI",\n    "kiro-cli": "Kiro CLI",`,
  `    antigravity: "Antigravity CLI",\n    hmharness: "HMHarness",\n    "kiro-cli": "Kiro CLI",`,
  1,
  "Renderer Agent label",
);
renderer = replaceExactCount(
  renderer,
  `    antigravity: "https://antigravity.google/product/antigravity-cli",\n    "kiro-cli": "https://kiro.dev/docs/cli/",`,
  `    antigravity: "https://antigravity.google/product/antigravity-cli",\n    hmharness: "https://www.npmjs.com/package/@hmharness/cli",\n    "kiro-cli": "https://kiro.dev/docs/cli/",`,
  1,
  "Renderer install URL",
);
renderer = replaceExactCount(
  renderer,
  `    if (ownership.harnessId === "antigravity") return "antigravity";\n    if (ownership.harnessId === "kiro-cli") return "kiro-cli";`,
  `    if (ownership.harnessId === "antigravity") return "antigravity";\n    if (ownership.harnessId === "hmharness") return "hmharness";\n    if (ownership.harnessId === "kiro-cli") return "kiro-cli";`,
  1,
  "Renderer sidebar ownership",
);
renderer = replaceExactCount(
  renderer,
  `if (inspection.harnessId === "kiro-cli" || inspection.harnessId === "codebuddy" || inspection.harnessId === "workbuddy" || inspection.harnessId === "cursor-cli") {`,
  `if (inspection.harnessId === "hmharness" || inspection.harnessId === "kiro-cli" || inspection.harnessId === "codebuddy" || inspection.harnessId === "workbuddy" || inspection.harnessId === "cursor-cli") {`,
  1,
  "Renderer restored plugin Thread ownership",
);
renderer = replaceExactCount(
  renderer,
  `    if (agent === "antigravity") return ANTIGRAVITY_TRANSPORT_MODEL_ID;\n    if (agent === "kiro-cli") return encodeHarnessPluginRoute({ harnessId: KIRO_CLI_HARNESS_ID });`,
  `    if (agent === "antigravity") return ANTIGRAVITY_TRANSPORT_MODEL_ID;\n    if (agent === "hmharness") return encodeHarnessPluginRoute({ harnessId: harnessIdSchema.parse("hmharness") });\n    if (agent === "kiro-cli") return encodeHarnessPluginRoute({ harnessId: KIRO_CLI_HARNESS_ID });`,
  1,
  "Renderer transport carrier",
);
renderer = replaceExactCount(
  renderer,
  `agent === "kiro-cli" || agent === "codebuddy" || agent === "workbuddy" || agent === "cursor-cli" ? encodeHarnessPluginRoute({`,
  `agent === "hmharness" || agent === "kiro-cli" || agent === "codebuddy" || agent === "workbuddy" || agent === "cursor-cli" ? encodeHarnessPluginRoute({`,
  1,
  "Renderer HMHarness model carrier",
);
renderer = replaceExactCount(
  renderer,
  `        antigravity: void 0,\n        "kiro-cli": void 0,`,
  `        antigravity: void 0,\n        hmharness: void 0,\n        "kiro-cli": void 0,`,
  1,
  "Renderer initial HMHarness errors",
);
renderer = replaceExactCount(
  renderer,
  `if (agent === "antigravity" || agent === "kiro-cli" || agent === "codebuddy" || agent === "workbuddy" || agent === "cursor-cli" || agent === "kimi-code" || agent === "zcode") {`,
  `if (agent === "antigravity" || agent === "hmharness" || agent === "kiro-cli" || agent === "codebuddy" || agent === "workbuddy" || agent === "cursor-cli" || agent === "kimi-code" || agent === "zcode") {`,
  1,
  "Renderer HMHarness image branch",
);
renderer = replaceExactCount(
  renderer,
  `image.src = agent === "zcode" ? zcode_agent_default : agent === "kimi-code" ? kimi_agent_default : agent === "codebuddy" ? codebuddy_agent_default : agent === "workbuddy" ? workbuddy_agent_default : agent === "cursor-cli" ? cursor_agent_default : agent === "kiro-cli" ? kiro_agent_default : antigravity_agent_default;`,
  `image.src = agent === "hmharness" ? hmharness_agent_default : agent === "zcode" ? zcode_agent_default : agent === "kimi-code" ? kimi_agent_default : agent === "codebuddy" ? codebuddy_agent_default : agent === "workbuddy" ? workbuddy_agent_default : agent === "cursor-cli" ? cursor_agent_default : agent === "kiro-cli" ? kiro_agent_default : antigravity_agent_default;`,
  1,
  "Renderer HMHarness icon selection",
);
await writeFile(rendererPath, renderer, "utf8");

console.log(JSON.stringify({
  codexHost: expectedCodexHostVersion,
  plugin: userPlugin,
  enabled: userEnabledPath,
  pluginSha256: sha256(join(userPlugin, "plugin.mjs")),
  iconSha256: sha256(join(userPlugin, "assets/icon.svg")),
  bundledDuplicateBackup,
  runtimePatch: rendererWasPatched ? "already-applied" : "applied",
  runtimeBackup: runtimeBackupRoot,
  restartRequired: true,
}, null, 2));
