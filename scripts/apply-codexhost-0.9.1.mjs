#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";

const expectedCodexHostVersion = "0.9.1";
const harnessId = "hmharness";
// Codex Host 0.9.1 ships zh-CN resources but may leave the remote i18n layer disabled.
const rendererI18nGatePatch = `
(() => {
  const layerName = "72216192";
  const marker = "__codexhostI18nGatePatch";
  const descriptorsMarker = marker + "Descriptors";
  function patchClient(client) {
    if (!client || client[marker] || typeof client.getLayer !== "function") return;
    const originalGetLayer = client.getLayer;
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
    throw new Error(`Expected one CodexHost 0.9.1 patch anchor for ${label}, found ${count}`);
  }
  return source.replace(search, replacement);
}

function replaceExactCount(source, search, replacement, expectedCount, label) {
  if (source.includes(replacement)) return source;
  const count = source.split(search).length - 1;
  if (count !== expectedCount) {
    throw new Error(`Expected ${expectedCount} CodexHost 0.9.1 patch anchors for ${label}, found ${count}`);
  }
  return source.replaceAll(search, replacement);
}

function withRendererI18nGate(source) {
  const prefix = `"use strict";\n`;
  const appOpening = `\n(() => {\n`;
  const patchOpening = `\n(() => {\n  const layerName = "72216192";`;
  if (!source.startsWith(prefix)) throw new Error("CodexHost renderer has an unexpected prologue");
  let body = source.slice(prefix.length);
  if (body.startsWith(patchOpening)) {
    const nextAppOpening = body.indexOf(appOpening, patchOpening.length);
    if (nextAppOpening < 0) throw new Error("Unable to replace the existing renderer i18n gate patch");
    body = body.slice(nextAppOpening);
  }
  if (!body.startsWith(appOpening)) throw new Error("CodexHost renderer i18n gate anchor was not found");
  return prefix + rendererI18nGatePatch + body;
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
  `          "antigravity",\n          "kiro-cli",\n          "codebuddy",\n          "workbuddy",\n          "cursor-cli",\n          "qoder",\n          "qoder-cn",\n          "hermes"`,
  `          "antigravity",\n          "hmharness",\n          "kiro-cli",\n          "codebuddy",\n          "workbuddy",\n          "cursor-cli",\n          "qoder",\n          "qoder-cn",\n          "hermes"`,
  "Desktop Controller enabled Agents",
);
await writeFile(controllerPath, controller);

const rendererPath = join(codexHostRoot, "app", "renderer-extension.js");
let renderer = await readFile(rendererPath, "utf8");
renderer = withRendererI18nGate(renderer);
renderer = replaceOnce(
  renderer,
  `  // src/renderer-agent-icon.ts\n`,
  `  // src/renderer-agent-icon.ts\n  var hmharness_agent_default = "data:image/svg+xml;base64,${pluginIconBase64}";\n`,
  "Renderer HMHarness icon asset",
);

renderer = replaceOnce(
  renderer,
  `  var KNOWN_RENDERER_AGENTS = [\n    "codex",\n    "pi",\n    "claude-code",\n    "deepseek-harness",\n    "opencode",\n    "grok",\n    "omp",\n    "antigravity",\n    "kiro-cli",\n    "codebuddy",\n    "workbuddy",\n    "cursor-cli",\n    "hermes",\n    "qoder",\n    "qoder-cn"\n  ];`,
  `  var KNOWN_RENDERER_AGENTS = [\n    "codex",\n    "pi",\n    "claude-code",\n    "deepseek-harness",\n    "opencode",\n    "grok",\n    "omp",\n    "antigravity",\n    "hmharness",\n    "kiro-cli",\n    "codebuddy",\n    "workbuddy",\n    "cursor-cli",\n    "hermes",\n    "qoder",\n    "qoder-cn"\n  ];`,
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
  `image.src = agent === "codebuddy" ? codebuddy_agent_default : agent === "workbuddy" ? workbuddy_agent_default : agent === "cursor-cli" ? cursor_agent_default : agent === "kiro-cli" ? kiro_agent_default : antigravity_agent_default;`,
  `image.src = agent === "hmharness" ? hmharness_agent_default : agent === "codebuddy" ? codebuddy_agent_default : agent === "workbuddy" ? workbuddy_agent_default : agent === "cursor-cli" ? cursor_agent_default : agent === "kiro-cli" ? kiro_agent_default : antigravity_agent_default;`,
  "Renderer HMHarness icon selection",
);
renderer = replaceOnce(
  renderer,
  `"antigravity",\n          "kiro-cli",\n          "codebuddy",\n          "workbuddy",\n          "cursor-cli",\n          "hermes",\n          "qoder",\n          "qoder-cn"`,
  `"antigravity",\n          "hmharness",\n          "kiro-cli",\n          "codebuddy",\n          "workbuddy",\n          "cursor-cli",\n          "hermes",\n          "qoder",\n          "qoder-cn"`,
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
  `  var externalAgents = [\n    "pi",\n    "claude-code",\n    "deepseek-harness",\n    "opencode",\n    "grok",\n    "omp",\n    "antigravity",\n    "kiro-cli",\n    "codebuddy",\n    "workbuddy",\n    "cursor-cli",\n    "hermes",\n    "qoder",\n    "qoder-cn"\n  ];`,
  `  var externalAgents = [\n    "pi",\n    "claude-code",\n    "deepseek-harness",\n    "opencode",\n    "grok",\n    "omp",\n    "antigravity",\n    "hmharness",\n    "kiro-cli",\n    "codebuddy",\n    "workbuddy",\n    "cursor-cli",\n    "hermes",\n    "qoder",\n    "qoder-cn"\n  ];`,
  "Renderer external Agents",
);
renderer = replaceExactCount(
  renderer,
  `    antigravity: "https://antigravity.google/product/antigravity-cli",\n    "kiro-cli": "https://kiro.dev/docs/cli/",\n    codebuddy: "https://www.codebuddy.ai/docs/zh/cli/overview",`,
  `    antigravity: "https://antigravity.google/product/antigravity-cli",\n    hmharness: "https://www.npmjs.com/package/@hmharness/cli",\n    "kiro-cli": "https://kiro.dev/docs/cli/",\n    codebuddy: "https://www.codebuddy.ai/docs/zh/cli/overview",`,
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
  `          availability: { ...activeHarnessAvailabilityState().availability },\n          selections,`,
  `          availability: { ...activeHarnessAvailabilityState().availability },\n          errors: { ...activeHarnessAvailabilityState().errors },\n          selections,`,
  "Renderer availability probe errors",
);
renderer = replaceOnce(
  renderer,
  `if (inspection.harnessId === "kiro-cli" || inspection.harnessId === "codebuddy" || inspection.harnessId === "workbuddy" || inspection.harnessId === "cursor-cli") {`,
  `if (inspection.harnessId === "hmharness" || inspection.harnessId === "kiro-cli" || inspection.harnessId === "codebuddy" || inspection.harnessId === "workbuddy" || inspection.harnessId === "cursor-cli") {`,
  "Renderer restored plugin Thread ownership",
);
renderer = replaceOnce(
  renderer,
  `if (agent === "antigravity" || agent === "kiro-cli" || agent === "codebuddy" || agent === "workbuddy" || agent === "cursor-cli") {`,
  `if (agent === "antigravity" || agent === "hmharness" || agent === "kiro-cli" || agent === "codebuddy" || agent === "workbuddy" || agent === "cursor-cli") {`,
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
  `agent === "kiro-cli" || agent === "codebuddy" || agent === "workbuddy" || agent === "cursor-cli" ? encodeHarnessPluginRoute({`,
  `agent === "hmharness" || agent === "kiro-cli" || agent === "codebuddy" || agent === "workbuddy" || agent === "cursor-cli" ? encodeHarnessPluginRoute({`,
  "Renderer HMHarness model carrier",
);
renderer = replaceOnce(
  renderer,
  `antigravity: void 0,\n        "kiro-cli": void 0,\n        codebuddy: void 0,\n        workbuddy: void 0,\n        "cursor-cli": void 0,\n        hermes: void 0,\n        qoder: void 0,\n        "qoder-cn": void 0`,
  `antigravity: void 0,\n        hmharness: void 0,\n        "kiro-cli": void 0,\n        codebuddy: void 0,\n        workbuddy: void 0,\n        "cursor-cli": void 0,\n        hermes: void 0,\n        qoder: void 0,\n        "qoder-cn": void 0`,
  "Renderer initial HMHarness errors",
);
renderer = replaceOnce(
  renderer,
  `            } catch (error51) {\n              status = "error";\n              nextError = {\n                code: "internalError",\n                message: error51 instanceof Error ? error51.message : String(error51),\n                retryable: !(error51 instanceof RendererMethodUnavailableError),\n                stage: "request"\n              };\n            }`,
  `            } catch (error51) {\n              const localBridgeWarming = hostId === "local" && error51 instanceof RendererMethodUnavailableError;\n              status = localBridgeWarming ? "checking" : "error";\n              nextError = {\n                code: "internalError",\n                message: error51 instanceof Error ? error51.message : String(error51),\n                retryable: localBridgeWarming || !(error51 instanceof RendererMethodUnavailableError),\n                stage: "request"\n              };\n            }`,
  "Renderer local bridge startup retry",
);

await writeFile(rendererPath, renderer);
if (process.platform === "win32") {
  const placementResult = spawnSync(
    "pwsh",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(repoRoot, "tools", "install-windows.ps1")],
    { stdio: "inherit" },
  );
  if (placementResult.error) throw placementResult.error;
  if (placementResult.status !== 0) throw new Error(`HMHarness Windows placement failed with exit ${placementResult.status}`);
}
console.log(
  `Applied HMHarness to CodexHost ${expectedCodexHostVersion} (${installation.name}) at ${codexHostRoot}`,
);
