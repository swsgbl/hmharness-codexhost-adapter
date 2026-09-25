#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";

const expectedCodexHostVersion = "0.10.0";
const harnessId = "hmharness";
const configBackupStamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
// Codex Host 0.10.0 still gates locale catalog loading behind remote feature controls.
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

function replaceExactCount(source, search, replacement, expectedCount, label) {
  if (source.includes(replacement)) return source;
  const count = source.split(search).length - 1;
  if (count !== expectedCount) {
    throw new Error(`Expected ${expectedCount} CodexHost ${expectedCodexHostVersion} patch anchors for ${label}, found ${count}`);
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

async function ensureChromeExtensionHostConfig() {
  if (process.platform !== "win32") return;

  const codexHome = join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".codex");
  const localCodexRoot = join(process.env.LOCALAPPDATA ?? "", "OpenAI", "Codex");
  const chromePluginRoot = join(codexHome, "plugins", "cache", "openai-bundled", "chrome");
  const chromePluginLatestRoot = join(chromePluginRoot, "latest");
  const extensionHostPath = join(chromePluginLatestRoot, "extension-host", "windows", "x64", "extension-host.exe");
  const browserClientPath = join(chromePluginLatestRoot, "scripts", "browser-client.mjs");
  const browserServicePath = join(chromePluginLatestRoot, "scripts", "browser-service.mjs");
  const codexCliPath = join(codexHome, "plugins", ".plugin-appserver", "codex.exe");
  const requiredRuntimePaths = [extensionHostPath, browserClientPath, browserServicePath, codexCliPath];
  if (requiredRuntimePaths.some((path) => !existsSync(path))) return;

  const pluginVersionDirectories = readdirSync(chromePluginRoot)
    .filter((name) => name !== "latest" && existsSync(join(chromePluginRoot, name, "scripts", "browser-client.mjs")))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const pluginVersion = pluginVersionDirectories.at(-1);
  if (!pluginVersion) return;

  const runtimeRoot = join(localCodexRoot, "runtimes", "cua_node");
  const runtimeDirectory = readdirSync(runtimeRoot)
    .map((name) => join(runtimeRoot, name))
    .filter((path) => {
      const nodePath = join(path, "bin", "node.exe");
      const nodeReplPath = join(path, "bin", "node_repl.exe");
      return existsSync(nodePath) && existsSync(nodeReplPath);
    })
    .sort((left, right) => statSync(left).mtimeMs - statSync(right).mtimeMs)
    .at(-1);
  if (!runtimeDirectory) return;

  const nodePath = join(runtimeDirectory, "bin", "node.exe");
  const nodeReplPath = join(runtimeDirectory, "bin", "node_repl.exe");
  const nodeModuleDirs = [join(runtimeDirectory, "bin", "node_modules")];

  const packageQuery = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "$p = Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1; if ($null -eq $p) { exit 1 }; $p | Select-Object Version,InstallLocation | ConvertTo-Json -Compress",
    ],
    { encoding: "utf8" },
  );
  if (packageQuery.status !== 0) return;
  const codexPackage = JSON.parse(packageQuery.stdout);
  const resourcesPath = join(codexPackage.InstallLocation, "app", "resources");
  if (!existsSync(resourcesPath)) return;

  const extensionInfo = await readJson(join(chromePluginLatestRoot, "scripts", "extension-ids.json"));
  const extensionIds = [...new Set(extensionInfo.extensionIds)].filter(Boolean);
  const nativeHostName = extensionInfo.extensionHostName ?? "com.openai.codexextension";
  if (extensionIds.length === 0 || !nativeHostName) return;

  async function writeIfChanged(path, contents) {
    const nextContents = `${JSON.stringify(contents, null, 2)}\n`;
    const previousContents = existsSync(path) ? await readFile(path, "utf8") : null;
    if (previousContents === nextContents) return;
    if (existsSync(path)) {
      await copyFile(path, `${path}.bak-hmharness-${configBackupStamp}`);
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, nextContents, "utf8");
    console.log(`Updated ${path}`);
  }

  const manifestPath = join(codexHome, "chrome-native-hosts-v2.json");
  const localManifestPath = join(localCodexRoot, "chrome-native-hosts-v2.json");
  const paths = {
    browserClientPath,
    browserServicePath,
    codexCliPath,
    codexHome,
    extensionHostPath,
    nodePath,
    nodeModuleDirs,
    nodeReplPath,
    resourcesPath,
  };
  const runtimeEntry = {
    schemaVersion: 2,
    appServerProtocolVersion: 2,
    appVersion: codexPackage.Version,
    channel: "prod",
    cliVersion: pluginVersion,
    entryId: `codex-desktop-${codexPackage.Version}`,
    extensionBuildChannels: ["prod"],
    extensionIds,
    installId: "hongfu-codex-desktop-windows",
    nativeHostNames: [nativeHostName],
    nativeHostProtocolVersion: 2,
    nativeHostVersion: pluginVersion,
    paths,
    proxyHost: "127.0.0.1",
    proxyPort: 0,
    updatedAt: new Date().toISOString(),
  };

  for (const currentManifestPath of [manifestPath, localManifestPath]) {
    const manifest = existsSync(currentManifestPath)
      ? await readJson(currentManifestPath)
      : { schemaVersion: 2, entries: [] };
    if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.entries)) {
      throw new Error(`Unsupported Chrome native host manifest at ${currentManifestPath}`);
    }
    const entryIndex = manifest.entries.findIndex((candidate) =>
      candidate?.paths?.extensionHostPath === extensionHostPath,
    );
    if (entryIndex >= 0) {
      const existingEntry = manifest.entries[entryIndex];
      runtimeEntry.entryId = existingEntry.entryId || runtimeEntry.entryId;
      runtimeEntry.installId = existingEntry.installId || runtimeEntry.installId;
      runtimeEntry.updatedAt = existingEntry.updatedAt || runtimeEntry.updatedAt;
      manifest.entries[entryIndex] = { ...existingEntry, ...runtimeEntry };
    }
    else manifest.entries.unshift(runtimeEntry);
    await writeIfChanged(currentManifestPath, manifest);
  }

  const wrapperPath = join(codexHome, "extension-host-no-codexhost.cmd");
  const wrapperContents = [
    "@echo off",
    "setlocal",
    "if defined CODEX_CLI_PATH set CODEX_CLI_PATH=",
    "if defined CODEXHOST_STOCK_CODEX_PATH set CODEXHOST_STOCK_CODEX_PATH=",
    `"${extensionHostPath}" %*`,
    "endlocal",
    "",
  ].join("\r\n");
  if (existsSync(wrapperPath) && (await readFile(wrapperPath, "utf8")) !== wrapperContents) {
    await copyFile(wrapperPath, `${wrapperPath}.bak-hmharness-${configBackupStamp}`);
  }
  await writeFile(wrapperPath, wrapperContents, "utf8");

  const configPath = join(dirname(extensionHostPath), "extension-host-config.json");
  const config = {
    schemaVersion: 1,
    channel: "prod",
    browserClientPath,
    codexCliPath: paths.codexCliPath,
    nodePath: paths.nodePath,
    nodeReplPath: paths.nodeReplPath,
    proxyHost: "127.0.0.1",
    proxyPort: 0,
  };
  await writeIfChanged(configPath, config);
  console.log(`Restored the Chrome extension host config at ${configPath}`);

  const nativeManifestPath = join(
    process.env.LOCALAPPDATA ?? "",
    "OpenAI",
    "extension",
    "com.openai.codexextension.json",
  );
  if (!existsSync(nativeManifestPath)) return;
  const nativeManifest = await readJson(nativeManifestPath);
  nativeManifest.path = wrapperPath;
  await writeFile(nativeManifestPath, `${JSON.stringify(nativeManifest, null, 2)}\n`, "utf8");
  console.log(`Restored the Chrome Native Messaging host wrapper at ${wrapperPath}`);
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
await ensureChromeExtensionHostConfig();

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
await writeFile(enabledPath, `${JSON.stringify(enabled, null, 2)}\n`, "utf8");

const controllerPath = join(codexHostRoot, "app", "desktop-controller.mjs");
let controller = await readFile(controllerPath, "utf8");
controller = replaceExactCount(
  controller,
  `          "antigravity",\n          "kiro-cli",`,
  `          "antigravity",\n          "hmharness",\n          "kiro-cli",`,
  1,
  "Desktop Controller enabled Agents",
);
await writeFile(controllerPath, controller);

const rendererPath = join(codexHostRoot, "app", "renderer-extension.js");
let renderer = await readFile(rendererPath, "utf8");

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
  `if (agent === "antigravity" || agent === "kiro-cli" || agent === "codebuddy" || agent === "workbuddy" || agent === "cursor-cli" || agent === "kimi-code") {`,
  `if (agent === "antigravity" || agent === "hmharness" || agent === "kiro-cli" || agent === "codebuddy" || agent === "workbuddy" || agent === "cursor-cli" || agent === "kimi-code") {`,
  1,
  "Renderer HMHarness image branch",
);
renderer = replaceExactCount(
  renderer,
  `image.src = agent === "kimi-code" ? kimi_agent_default : agent === "codebuddy" ? codebuddy_agent_default : agent === "workbuddy" ? workbuddy_agent_default : agent === "cursor-cli" ? cursor_agent_default : agent === "kiro-cli" ? kiro_agent_default : antigravity_agent_default;`,
  `image.src = agent === "hmharness" ? hmharness_agent_default : agent === "kimi-code" ? kimi_agent_default : agent === "codebuddy" ? codebuddy_agent_default : agent === "workbuddy" ? workbuddy_agent_default : agent === "cursor-cli" ? cursor_agent_default : agent === "kiro-cli" ? kiro_agent_default : antigravity_agent_default;`,
  1,
  "Renderer HMHarness icon selection",
);
renderer = replaceExactCount(
  renderer,
  `          availability: { ...activeHarnessAvailabilityState().availability },\n          selections,`,
  `          availability: { ...activeHarnessAvailabilityState().availability },\n          errors: { ...activeHarnessAvailabilityState().errors },\n          selections,`,
  1,
  "Renderer availability probe errors",
);
renderer = replaceExactCount(
  renderer,
  `            } catch (error51) {\n              status = "error";\n              nextError = {\n                code: error51 instanceof RendererMethodUnavailableError ? "unavailable" : "internalError",\n                message: error51 instanceof Error ? error51.message : String(error51),\n                retryable: !(error51 instanceof RendererMethodUnavailableError),\n                stage: "request"\n              };\n            }`,
  `            } catch (error51) {\n              const localBridgeWarming = hostId === "local" && error51 instanceof RendererMethodUnavailableError;\n              status = localBridgeWarming ? "checking" : "error";\n              nextError = {\n                code: error51 instanceof RendererMethodUnavailableError ? "unavailable" : "internalError",\n                message: error51 instanceof Error ? error51.message : String(error51),\n                retryable: localBridgeWarming || !(error51 instanceof RendererMethodUnavailableError),\n                stage: "request"\n              };\n            }`,
  1,
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
