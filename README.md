# HMHarness CodexHost Adapter Backup

[![English](https://img.shields.io/badge/README-English-blue)](#english) [![中文](https://img.shields.io/badge/README-%E4%B8%AD%E6%96%87-red)](#%E4%B8%AD%E6%96%87) [![HMHarness](https://img.shields.io/badge/Friend%20link-HMHarness-2CA5E0)](https://github.com/swsgbl/hmharness) [![CodexHost](https://img.shields.io/badge/Friend%20link-CodexHost-111827)](https://github.com/BytePioneer-AI/codex-host) [![AtomGit](https://img.shields.io/badge/Mirror-AtomGit-1677FF)](https://atomgit.com/hongfu/hmharness-codexhost-adapter)

This repository is a bilingual, source-provenance backup of the working HMHarness integration for CodexHost. It preserves the adapter, bridge protocol, renderer integration, tests, and the clean patch submitted to upstream CodexHost as [PR #243](https://github.com/BytePioneer-AI/codex-host/pull/243). The PR was closed on 2026-09-10, so this repository is now maintained independently.

## English

### What This Is

HMHarness can appear in CodexHost as a selectable AI agent framework. The integration has two parts:

1. **CodexHost adapter**: discovers the `hmh-codexhost` executable, lists providers and models, maps CodexHost harness operations, streams events, and closes every Turn with an authoritative result.
2. **HM bridge**: exposes HMHarness through a stable NDJSON protocol:
   - `{"type":"delta","text":"..."}` streams final-answer text;
   - `{"type":"tool",...}` reports tool activity;
   - `{"type":"line",...}` reports loop status;
   - `{"text":"...","sessionId":...}` is the final authoritative record.

The bridge exits immediately after emitting the final line. The adapter treats the completed Item snapshot as authoritative, so progress text can differ from the final result without leaving the UI in a Thinking state.

### Repository Layout

- `patches/codex-host/0001-add-hmharness-adapter-and-streaming-bridge.patch`
  - Clean source/test-only patch against official CodexHost `main` commit `25fb54f2b91f0f4c488051287ffa813513c9a060`; it is the patch behind PR [#243](https://github.com/BytePioneer-AI/codex-host/pull/243).
- `snapshots/codex-host/`
  - Exact source and test files from the verified local integration.
- `snapshots/hmharness/packages/codexhost-bridge/`
  - Exact source of the machine-readable HM bridge used by the adapter.
- `snapshots/codex-host-runtime/0.10.0/plugin/`
  - Runtime plugin bundle for the independently maintained CodexHost `0.10.0` integration, including the verified HMHarness icon.
- `scripts/apply-codexhost-0.10.0.mjs`
  - Idempotent migration for the official CodexHost `0.10.0` Windows installer layout.
- `tools/launch-windows-0.10.0.ps1`
  - Current Windows fallback launcher for CodexHost `0.10.0`.
- `snapshots/codex-host-runtime/0.9.1/plugin/`
  - Archived runtime plugin bundle for CodexHost `0.9.1`.
- `scripts/apply-codexhost-0.9.1.mjs`
  - Archived migration for CodexHost `0.9.1`.
- `snapshots/codex-host-runtime/0.9.0/plugin/`
  - Archived runtime plugin bundle for CodexHost `0.9.0`.
- `scripts/apply-codexhost-0.9.0.mjs`
  - Archived migration for CodexHost `0.9.0`.
- `snapshots/codex-host-runtime/0.8.2/plugin/`
  - Archived runtime plugin bundle for CodexHost `0.8.2`.
- `scripts/apply-codexhost-0.8.2.mjs`
  - Archived migration for CodexHost `0.8.2`.
- `snapshots/codex-host-runtime/0.7.1/plugin/`
  - Archived runtime plugin bundle for CodexHost `0.7.1`.
- `scripts/apply-codexhost-0.7.1.mjs`
  - Archived migration for an official `@codexhost/cli@0.7.1` installation.
- `tools/install-windows.ps1`
  - Optional Windows placement helper that moves the verified plugin bundle into CodexHost's user plugin directory after the migration mappings exist.
- `tools/launch-windows-0.9.1.ps1`
  - Archived CodexHost `0.9.1` fallback launcher.
- `tools/launch-windows-0.9.0.ps1`
  - Archived CodexHost `0.9.0` fallback launcher.
- `tools/launch-windows-0.8.2.ps1`
  - Archived 0.8.2 fallback launcher.
- `snapshots/codex-host-runtime/0.7.0/plugin/`
  - Archived runtime plugin for the previous CodexHost `0.7.0` integration.
- `manifest/provenance.json`
  - Commit IDs, hashes, patch applicability, and validation results.
- `verification/`
  - Reproduction evidence and commands.

### Apply The CodexHost Patch

```bash
git clone https://github.com/BytePioneer-AI/codex-host.git
cd codex-host
git checkout 25fb54f2b91f0f4c488051287ffa813513c9a060
git apply --check path/to/0001-add-hmharness-adapter-and-streaming-bridge.patch
git apply path/to/0001-add-hmharness-adapter-and-streaming-bridge.patch
npm install
npm run typecheck
npx vitest run --config tests/vitest.config.js \
  packages/protocol-core/test/codex-ui-projector.test.ts \
  packages/adapters/hmharness/test/hmharness-adapter.test.ts \
  packages/host-runtime/test/app-server-host.test.ts \
  packages/renderer-extension/test/renderer-binding-probe.test.ts \
  packages/renderer-extension/test/versioned-renderer-adapter.test.ts \
  tests/release/production-renderer.test.mjs
```

The bridge is publicly distributed as [`@hmharness/codexhost-bridge`](https://www.npmjs.com/package/@hmharness/codexhost-bridge). The current npm release is `0.6.5`; the source snapshot preserved here is the `0.6.5` release from clean HMHarness commit `b17e02f5c6d654c4a50bbe4c614164167cf9851a`.

Do not keep the same `hmharness` plugin in both the npm-managed plugin directory and the user plugin directory: duplicate plugin IDs cause both plugins to be rejected.

### Maintain CodexHost 0.10.0 At Runtime

CodexHost's maintainers have said that HMHarness is outside their roadmap. For the independently maintained runtime integration, install the official host first and apply the local migration after every CodexHost update:

```powershell
# Install the official CodexHost 0.10.0 release first.
npm install -g @codexhost/cli@0.10.0
npm install -g @openai/codex@0.156.1
npm install -g @hmharness/codexhost-bridge@0.6.5
node scripts/apply-codexhost-0.10.0.mjs
pwsh -NoProfile -ExecutionPolicy Bypass -File tools/install-windows.ps1  # optional standalone placement check
Get-Content "$env:LOCALAPPDATA\Programs\codexhost\app\codexhost-distribution.json"
```

The 0.10.0 migration validates the `plugin.mjs` entry convention, copies the verified bundle into the host's plugin directory, enables it, and patches the controller and renderer anchors by exact count. It preserves the renderer's restored plugin-thread ownership path and the local request-bridge warmup retry. It also embeds the HMHarness SVG into the renderer so `hmharness` cannot fall back to the Antigravity icon. The plugin SHA-256 is `57D1EDD1394F2011B0FF4C88830870FF64C6D4A0A49BFA3BAF0C7094FDA4436A`; the icon SHA-256 is `950FA9B06484F9D56C51A976679252D3061832279292658C20E59D9F06FE75DF`. The Windows placement helper verifies both values.

The 0.10.0 renderer i18n patch uses the exact production-bundle opening anchor instead of the ambiguous first `(() => {` substring. This keeps repeated migration runs idempotent. The migration also forces both Statsig feature-gate methods used by CodexHost `0.10.0` and restores the Chrome extension-host config plus the Native Messaging wrapper that clears CodexHost-only CLI environment overrides.

The current verified host is the official Windows installer distribution at `%LOCALAPPDATA%\Programs\codexhost`, version `0.10.0`. The public npm CLI wrapper is also `0.10.0`; nevertheless, always verify `app\codexhost-distribution.json` before applying a migration because the PATH command and installed Desktop host can diverge.

Archived 0.9.1 and older layout notes follow.

The 0.9.1 migration validates the `plugin.mjs` entry convention, copies the verified bundle into the host's plugin directory, enables it, and patches the controller and renderer anchors by exact count. It preserves the renderer's restored plugin-thread ownership path and the local request-bridge warmup retry. It also embeds the HMHarness SVG into the renderer so `hmharness` cannot fall back to the Antigravity icon. The plugin SHA-256 is `57D1EDD1394F2011B0FF4C88830870FF64C6D4A0A49BFA3BAF5C7094FDA4436A`; the icon SHA-256 is `950FA9B06484F9D56C51A976679252D3061832279292658C20E59D9F06FE75DF`. The Windows placement helper verifies both values.

The migration validates that the plugin manifest uses the CodexHost `0.7.1` entry convention (`plugin.mjs`), copies the bundle into the official package's nested platform runtime, enables the plugin, and adds the renderer/controller model and ownership mappings. Close and relaunch CodexHost through its normal launcher after applying it. The current bundle was adapted from official upstream commit `e6adb05095aff8aba5241230b07619c8b8aa8db4`; its plugin SHA-256 is `57D1EDD1394F2011B0FF4C88830870FF64C6D4A0A49BFA3BAF0C7094FDA4436A`.

On Windows, the optional placement helper may be run after the migration mappings are present. It moves only the plugin bundle to `~/.codexhost/plugins/hmharness`, enables that copy, and removes the duplicate from the nested npm runtime. It is not a standalone clean-install migration because the controller/renderer mappings are still required.

For CodexHost 0.9.1, the placement helper removes the duplicate from the official installer plugin directory. On this Windows Insider/MSIX setup, Codex Desktop did not inherit CodexHost's environment injection. `tools/launch-windows-0.9.1.ps1` provides a scoped fallback: it snapshots seven HKCU environment values, writes temporary launch values, starts CodexHost with explicit node/shim/runtime/controller/renderer paths, waits for the Host shim to exit, then restores both HKCU and `~/.codex/config.toml`. A state file supports recovery from a stale shutdown. The desktop shortcut uses the official CodexHost executable icon and launches this script through WSH. CDP ports can change between launches, so discover the current ChatGPT listener instead of assuming one port.

Archived note: the two preceding placement/layout paragraphs describe the older 0.8.2 and 0.7.1 layouts. They do not override the 0.9.1 migration above; do not run archived migrations against CodexHost `0.9.1`.

### Upstream Status

- [CodexHost PR #243](https://github.com/BytePioneer-AI/codex-host/pull/243), based on official commit `25fb54f`, was closed because HMHarness is not currently in the CodexHost roadmap. No technical review or CI feedback was left.
- `@hmharness/codexhost-bridge@0.6.5` is public on npm, is not private, declares MIT, and points to the correct monorepo subdirectory.
- The bridge snapshot preserved here is `0.6.5` from clean HMHarness `main` commit `b17e02f5c6d654c4a50bbe4c614164167cf9851a`.
- The PR excludes local build products, temporary scripts, machine paths, credentials, and runtime state.
- This repository is maintained independently unless CodexHost later changes its roadmap.

### Validation Snapshot

On 2026-09-25:

- CodexHost Desktop/CLI `0.10.0`, global Codex CLI `0.156.1`, and Codex Desktop `26.917.9434.0` were current. The Desktop package reported `Ok`, and npm confirmed `@codexhost/cli@0.10.0` and `@openai/codex@0.156.1` as latest. CodexHost `inspect` reporting its Desktop-cached `0.155.0-alpha.16.4` CLI is expected and is not the global CLI version.
- The 0.10.0 migration was applied repeatedly with the same renderer SHA-256 `860D572067D6698F2FA458269866BD12B03EB1C0D4A1098CF1774DCBB05C3300`; the renderer i18n patch remained idempotent. The sole installed plugin was the user-directory copy with the committed plugin and icon hashes.
- A cold launch through `Desktop\CodexHost.lnk` exposed dynamic CDP port `52324`. HMHarness was `ready` and locked in the composer, exposed `glm / glm-5.3`, rendered its dedicated icon, and returned exact UI marker `HMH_CODEXHOST_0100_20260925_FINAL`. The final Thinking count was `0`, the composer was empty, and no `hmh-codexhost` child process remained.
- Visible Chinese UI passed with `IntlProvider.locale=zh-CN`, 17075 Chinese messages, and visible `文件 / 编辑 / 视图 / 帮助 / 新对话` labels. Both required Statsig i18n gates were forced on.
- ChatGPT Chrome extension `1.26.901.11451` passed the official Chrome and Edge Native Messaging manifest checks. An isolated Chrome profile loaded the exact extension ID and rendered the side panel page as ready; a cold isolated-browser restart launched `extension-host.exe` through `extension-host-no-codexhost.cmd`. An already-running user Chrome retains its startup manifest cache and must be restarted by the user to pick up the wrapper.

On 2026-09-20:

- CodexHost `0.9.1`, Codex CLI `0.155.1`, Codex Desktop `26.915.4065.0`, and bridge `0.6.5` were current. The Desktop package was updated from Microsoft DisplayCatalog/FE3's official x64 MSIX after Store UI delivery failed; its size, SHA-256, and Authenticode signature were verified.
- The 0.9.1 migration was applied twice as an idempotency check. The placement helper installed one user plugin copy and removed the bundled duplicate. A cold Desktop launch initially showed the expected local-bridge warmup window, then returned `hmharness=ready`, `adapter.state=ready`, and dynamically discovered CDP port `56792`.
- The live composer selected HMHarness and displayed `Model: glm / glm-5.3, glm-5.3`. Both the selected-agent trigger and the HMHarness menu option rendered the exact bundled SVG source, not the Antigravity fallback.
- Real UI turns returned the `HMH_CODEXHOST_091_DESKTOP_20260920_OK` acknowledgement and exact final marker `HMH_CODEXHOST_091_DESKTOP_EXACT_20260920_OK` on `glm-5.3`. After each turn the composer was empty, visible Thinking count was `0`, and no `hmh-codexhost` process remained.
- CC Switch on `127.0.0.1:15721`, codex-image-proxy on `127.0.0.1:15731`, and the other user processes were not stopped. The bridge test suite passed `2/2`.

On 2026-09-18:

- The official Windows installer distribution was CodexHost `0.9.0`; the npm CLI on PATH remained wrapper `0.8.0`. Codex CLI was `0.154.0`, Codex Desktop was `26.911.7940.0`, and the bridge was `0.6.5`.
- The 0.9.0 migration installed HMHarness as `ready`, selected `glm / glm-5.3`, and rendered the dedicated HMHarness SVG in the live agent menu. A real UI turn returned exact marker `HMH_CODEXHOST_090_20260918_OK`; run `run_20260917175050_9b4a0c` completed in 25.324 seconds with `outcome.success=true`, `outcome.reason=final`, and `model=glm-5.3`.
- After completion the composer was empty, the visible `正在思考` count was `0`, and no `hm-codexhost` bridge process remained. Shutdown removed the 0.9.0 fallback state, restored HKCU, and left no shim residual in `~/.codex/config.toml`. A cold relaunch returned HMHarness to `ready` on the dynamically selected CDP port `63623` with the same model and icon.

On 2026-09-15:

- The official Windows installer distribution was CodexHost `0.8.2` at `%LOCALAPPDATA%\Programs\codexhost`; the npm CLI on PATH was `0.8.0`, which is not the host version used by Desktop. Codex CLI was `0.154.0`, Codex Desktop was `26.908.8172.0`, and the bridge was `0.6.5`.
- The 0.8.2 migration installed HMHarness as `ready`, exposed the expected models, and selected `glm / glm-5.3`. A real UI turn returned exact marker `HMH_CODEXHOST_082_UI_FINAL_20260915_OK`; run `run_20260914175429_9b60c1` completed in 15.451 seconds with `outcome.success=true`, `outcome.reason=final`, and `model=glm-5.3`.
- After completion the composer was empty, the visible `正在思考` count was `0`, and no `hm-codexhost` bridge process remained. The live agent option rendered HMHarness's dedicated base64 SVG icon, not the Antigravity fallback.
- Closing only the Codex Desktop main process caused `codexhost-shim.exe` to exit. The launcher removed `windows-082-launch-fallback.json`, restored the original HKCU values, and left no shim/CodexHost injection in `~/.codex/config.toml`.

On 2026-09-12:

- CodexHost `0.7.1`, its nested Windows platform package `0.7.1`, Codex CLI `0.154.0`, Desktop `26.908.4834.0`, and bridge `0.6.5` were current. The local integration was rebased onto official upstream commit `e6adb05095aff8aba5241230b07619c8b8aa8db4`; the TypeScript build passed and the targeted suite passed `270/270`.
- The `0.7.1` migration was syntax-checked and executed twice as an idempotency test. HMHarness remained `ready`, listed 14 configured models, selected `glm / glm-5.3`, and returned real UI marker `HMH_CODEXHOST_071_20260912_OK`; the visible Thinking count returned to `0` and no HM bridge child process remained.
- After the migration mappings were present, the Windows placement helper moved the identical plugin bundle to the user plugin directory and removed the npm-managed duplicate. A clean restart still listed 14 models and selected `glm / glm-5.3`; run `run_20260912154904_67851f` returned the exact marker `HMH_CODEXHOST_071_USERPLUGIN_20260912_OK` in 5.850 seconds, ended with Thinking count `0`, and left no HM bridge process.
- CC Switch on `127.0.0.1:15721`, codex-image-proxy on `127.0.0.1:15731`, and the pre-existing DSH Web instance on `3081` remained available. DeepSeek Harness was also returned to `ready` by two machine-local repairs: restoring its truncated official plugin from source and removing an invalid `codegraph` MCP reference plus extending its local startup wait to 60 seconds. Those DeepSeek files are not part of this HMHarness backup.
- CodexHost `0.7.0`, its nested Windows platform package `0.7.0`, Codex CLI `0.154.0`, and bridge `0.6.5` were current. A stale top-level `@codexhost/cli-win32-x64@0.6.2` package was removed after confirming all live node-repl processes used the nested `0.7.0` path.
- The first `0.7.0` migration exposed a real compatibility defect: the copied manifest still pointed at `./dist/plugin.js`, while the actual bundle and official plugin convention use `plugin.mjs`, producing `pluginLoad/loadFailed`. The manifest and migration were corrected and a complete desktop-shortcut relaunch returned HMHarness to `正常`.
- HMHarness listed 14 configured models and selected `glm / glm-5.3`. A real UI turn sent `HMH_CODEXHOST_070_20260912_OK` and received a visible response containing that marker; after completion the composer was empty, the visible Thinking count was zero, and no HM bridge child process remained.
- The desktop launch chain was verified end to end: `Desktop\CodexHost.lnk` to `wscript.exe`, `.codexhost-launch.vbs`, `.codexhost-launch.ps1`, and `codexhost launch`. CDP and attachment listeners were present, while the existing CC Switch and image-proxy listeners stayed available. DeepSeek Harness remained unavailable for its own startup reasons and is unrelated to HMHarness.
- Source bridge `0.6.5` tests passed `2/2` at HMHarness commit `b17e02f5c6d654c4a50bbe4c614164167cf9851a`.

On 2026-09-11:

- CodexHost `0.6.2`, Codex CLI `0.154.0`, and bridge `0.6.2` were current.
- Installed official npm tarball `0.6.2`: `--version` returned `{"version":"0.6.2"}`, the isolated provider listing returned `alt-model`, and the fake keys did not leak.
- Real CodexHost/HMHarness smoke: HMHarness was `ready`, all 13 configured models were listed, `glm / glm-5.3` was selected, two consecutive exact marker requests returned their exact values, the HM bridge process exited after each turn, and the visible Thinking count was zero. `selections.phase: locked` is the expected active external-thread ownership state; it did not block the follow-up turn.
- Final source bridge `0.6.2`: Node tests passed `2/2`, provider listing returned all 13 configured entries without credentials, and a live GLM marker run returned `HMH_062_OK` with streaming deltas, an authoritative final record, and exit code `0`.

On 2026-09-10:

- CodexHost `npm run typecheck`: passed.
- CodexHost `npm run build:typescript`: passed.
- CodexHost `npm run lint`: passed.
- CodexHost targeted suite: 6 files, 256 tests passed.
- HM bridge Node test: 2 tests passed.
- Clean patch generated from official `main` commit `25fb54f` and PR commit `3de8496`.
- Installed npm bridge tarball `0.5.2`: `--version` passed, provider output selected the expected model, and the fake key did not leak.
- Real CodexHost/HMHarness smoke: thread and turn completed, result was available, the HM bridge process exited, and the UI Thinking count was zero.

### License And Notices

See [LICENSE](LICENSE.md), [NOTICE.md](NOTICE.md), and the complete texts under [licenses/](licenses/). The CodexHost and HMHarness snapshots are MIT-licensed.

### Friendly Links

- [AtomGit mirror](https://atomgit.com/hongfu/hmharness-codexhost-adapter): synchronized bilingual backup for China-friendly access.
- [HMHarness main repository](https://github.com/swsgbl/hmharness): self-evolving agent framework for the HarmonyOS development lifecycle.
- [CodexHost](https://github.com/BytePioneer-AI/codex-host): multi-framework desktop host for AI coding agents.
- [CodexHost Releases](https://github.com/BytePioneer-AI/codex-host/releases)

## 中文

### 项目简介

这是 HMHarness 接入 CodexHost 的双语开源备份仓库，保留当前已经真实验证过的 adapter、bridge 协议、桌面端集成、回归测试，以及已提交给官方 CodexHost 的 [PR #243](https://github.com/BytePioneer-AI/codex-host/pull/243) 对应补丁。该 PR 已于 2026-09-10 关闭，本仓库后续独立维护。

接入分为两部分：

1. **CodexHost adapter**：发现 `hmh-codexhost` 可执行文件，读取 provider/model 目录，映射 CodexHost harness 生命周期，消费流式事件，并用权威最终结果关闭 Turn。
2. **HM bridge**：用稳定的 NDJSON 协议暴露 HMHarness 能力：
   - `{"type":"delta","text":"..."}`：最终回答的流式增量；
   - `{"type":"tool",...}`：工具调用活动；
   - `{"type":"line",...}`：执行循环状态；
   - `{"text":"...","sessionId":...}`：最终权威结果。

bridge 输出最终记录后立即退出。adapter 信任 `item.completed` 的权威快照，因此中间进度文本与最终文本不一致时，也不会让 UI 一直停留在“正在思考”。

### 仓库结构

- `patches/codex-host/0001-add-hmharness-adapter-and-streaming-bridge.patch`：只包含源码和测试的精选补丁，基准为官方 `main` 提交 `25fb54f2b91f0f4c488051287ffa813513c9a060`，即 [PR #243](https://github.com/BytePioneer-AI/codex-host/pull/243)。
- `snapshots/codex-host/`：已验证集成中涉及的 CodexHost 源码和测试文件。
- `snapshots/hmharness/packages/codexhost-bridge/`：adapter 依赖的机器可读 bridge 实现。
- `snapshots/codex-host-runtime/0.10.0/plugin/`：独立维护的 CodexHost `0.10.0` 运行时插件包，包含已验证的 HMHarness 图标。
- `scripts/apply-codexhost-0.10.0.mjs`：面向官方 CodexHost `0.10.0` Windows installer 目录结构的幂等迁移脚本。
- `tools/launch-windows-0.10.0.ps1`：当前 CodexHost `0.10.0` Windows fallback 启动器。
- `snapshots/codex-host-runtime/0.9.1/plugin/`：独立维护的 CodexHost `0.9.1` 运行时插件包，包含已验证的 HMHarness 图标。
- `scripts/apply-codexhost-0.9.1.mjs`：已归档的 CodexHost `0.9.1` 迁移脚本。
- `snapshots/codex-host-runtime/0.9.0/plugin/`：已归档的 CodexHost `0.9.0` 运行时插件包。
- `scripts/apply-codexhost-0.9.0.mjs`：已归档的 CodexHost `0.9.0` 迁移脚本。
- `snapshots/codex-host-runtime/0.8.2/plugin/`：独立维护的 CodexHost `0.8.2` 运行时插件包，包含已验证的 HMHarness 图标。
- `scripts/apply-codexhost-0.8.2.mjs`：已归档的 CodexHost `0.8.2` 迁移脚本。
- `snapshots/codex-host-runtime/0.7.1/plugin/`：已归档的 CodexHost `0.7.1` 运行时插件包。
- `scripts/apply-codexhost-0.7.1.mjs`：已归档的官方 `@codexhost/cli@0.7.1` 迁移脚本。
- `tools/install-windows.ps1`：可选的 Windows 插件位置辅助脚本，在迁移映射存在后把已验证插件包移动到 CodexHost 用户插件目录。
- `tools/launch-windows-0.9.1.ps1`：已归档的 CodexHost `0.9.1` fallback 启动器。
- `tools/launch-windows-0.9.0.ps1`：已归档的 CodexHost `0.9.0` fallback 启动器。
- `tools/launch-windows-0.8.2.ps1`：已归档的 `0.8.2` fallback 启动器。
- `snapshots/codex-host-runtime/0.7.0/plugin/`：上一个 CodexHost `0.7.0` 运行时插件的归档。
- `manifest/provenance.json`：来源提交、哈希、补丁可应用性和验证结果。
- `verification/`：复现步骤和证据。

### 应用补丁

```bash
git clone https://github.com/BytePioneer-AI/codex-host.git
cd codex-host
git checkout 25fb54f2b91f0f4c488051287ffa813513c9a060
git apply --check path/to/0001-add-hmharness-adapter-and-streaming-bridge.patch
git apply path/to/0001-add-hmharness-adapter-and-streaming-bridge.patch
npm install
npm run typecheck
npx vitest run --config tests/vitest.config.js \
  packages/protocol-core/test/codex-ui-projector.test.ts \
  packages/adapters/hmharness/test/hmharness-adapter.test.ts \
  packages/host-runtime/test/app-server-host.test.ts \
  packages/renderer-extension/test/renderer-binding-probe.test.ts \
  packages/renderer-extension/test/versioned-renderer-adapter.test.ts \
  tests/release/production-renderer.test.mjs
```

bridge 已在 npm 公开发布为 [`@hmharness/codexhost-bridge`](https://www.npmjs.com/package/@hmharness/codexhost-bridge)。当前 npm 版本是 `0.6.5`；本仓库保留的来源快照是 HMHarness 干净 `main` 提交 `b17e02f5c6d654c4a50bbe4c614164167cf9851a` 上的 `0.6.5` 版本。

不要把同一个 `hmharness` 插件同时留在 npm 管理插件目录和用户插件目录：重复插件 ID 会导致两个插件同时被拒绝。

### 维护 CodexHost 0.10.0 运行时

CodexHost 官方已明确 HMHarness 不在其路线图内。独立维护的运行时集成应先安装官方宿主，再在每次 CodexHost 更新后应用本地迁移：

```powershell
# 先安装官方 CodexHost 0.10.0 发行版。
npm install -g @codexhost/cli@0.10.0
npm install -g @openai/codex@0.156.1
npm install -g @hmharness/codexhost-bridge@0.6.5
node scripts/apply-codexhost-0.10.0.mjs
pwsh -NoProfile -ExecutionPolicy Bypass -File tools/install-windows.ps1  # Windows 可选独立位置检查
Get-Content "$env:LOCALAPPDATA\Programs\codexhost\app\codexhost-distribution.json"
```

0.10.0 迁移脚本会校验 `plugin.mjs` 入口约定，复制已验证插件包，启用插件，并按 controller/renderer 的精确锚点补齐模型、ownership 和外部框架映射。它保留恢复插件线程 ownership 的路径，也保留本地 request-bridge 预热重试处理；同时把 HMHarness SVG 嵌入 renderer，确保 `hmharness` 不会回落到 Antigravity 图标。插件 SHA-256 为 `57D1EDD1394F2011B0FF4C88830870FF64C6D4A0A49BFA3BAF0C7094FDA4436A`，图标 SHA-256 为 `950FA9B06484F9D56C51A976679252D3061832279292658C20E59D9F06FE75DF`；Windows 位置辅助脚本会同时校验这两个值。

0.10.0 的 renderer i18n 补丁改用生产 bundle 的精确起始锚点，不再匹配第一个 `(() => {` 子串，因此重复迁移不会复制旧补丁。迁移同时强制开启 CodexHost `0.10.0` 使用的两个 Statsig feature gate，并恢复 Chrome extension-host 配置与清理 CodexHost 专属 CLI 环境变量的 Native Messaging wrapper。

当前验证的宿主是 `%LOCALAPPDATA%\Programs\codexhost` 下的官方 Windows installer 发行版，版本为 `0.10.0`；npm CLI wrapper 也是 `0.10.0`。PATH 命令和实际 Desktop 宿主仍可能分叉，适配前必须读取 `app\codexhost-distribution.json` 确认宿主版本。

以下为 0.9.1 及更早布局的归档说明。

0.9.1 迁移脚本会校验 `plugin.mjs` 入口约定，复制已验证插件包，启用插件，并按 controller/renderer 的精确锚点补齐模型、ownership 和外部框架映射。它保留恢复插件线程 ownership 的路径，也保留本地 request-bridge 预热重试处理；同时把 HMHarness SVG 嵌入 renderer，确保 `hmharness` 不会回落到 Antigravity 图标。插件 SHA-256 为 `57D1EDD1394F2011B0FF4C88830870FF64C6D4A0A49BFA3BAF5C7094FDA4436A`，图标 SHA-256 为 `950FA9B06484F9D56C51A976679252D3061832279292658C20E59D9F06FE75DF`；Windows 位置辅助脚本会同时校验这两个值。

迁移脚本会校验插件 manifest 使用 CodexHost `0.7.1` 的入口约定（`plugin.mjs`），复制插件包到官方包内嵌的平台运行时，启用插件，并补齐 renderer/controller 的模型与 ownership 映射。应用后需要按正常启动器完整重启 CodexHost。当前 bundle 基于官方上游提交 `e6adb05095aff8aba5241230b07619c8b8aa8db4` 适配；插件 SHA-256 为 `57D1EDD1394F2011B0FF4C88830870FF64C6D4A0A49BFA3BAF0C7094FDA4436A`。

Windows 可在迁移映射存在后运行可选的位置辅助脚本。它只把插件包移动到 `~/.codexhost/plugins/hmharness`，启用该副本，并移除内嵌 npm 运行时里的重复副本。controller/renderer 映射仍然必需，因此它不是干净的独立安装方案。

CodexHost 0.9.1 的位置辅助脚本会移除官方 installer 插件目录里的重复副本。在这台 Windows Insider/MSIX 环境上，Codex Desktop 没有继承 CodexHost 的环境注入；`tools/launch-windows-0.9.1.ps1` 提供范围受限的 fallback：先快照 7 个 HKCU 环境值，写入临时启动值，用显式 node/shim/runtime/controller/renderer 路径启动 CodexHost，等待 Host shim 退出，再恢复 HKCU 和 `~/.codex/config.toml`。状态文件支持异常关机后的下次恢复。桌面快捷方式使用官方 CodexHost 可执行文件图标，并通过 WSH 调用该脚本。CDP 端口可能在多次启动间变化，应发现当前 ChatGPT 监听端口，不能固定假设某个端口。

已归档说明：上面两段位置/布局说明描述旧的 `0.8.2` 与 `0.7.1` 布局，不覆盖前面的 `0.9.1` 迁移；不要对 CodexHost `0.9.1` 运行旧迁移脚本。

### 官方状态与维护策略

官方提案状态：

- [CodexHost PR #243](https://github.com/BytePioneer-AI/codex-host/pull/243) 基于官方提交 `25fb54f` 的干净分支，但维护者以 HMHarness 当前不在 CodexHost 计划中为由关闭；未留下技术 review 或 CI 反馈。
- `@hmharness/codexhost-bridge@0.6.5` 已公开发布，非 private，MIT 许可，npm repository directory 指向正确。
- 本仓库保留的 bridge 快照来自干净的 HMHarness `main` 提交 `b17e02f5c6d654c4a50bbe4c614164167cf9851a`。
- PR 已排除本地构建产物、临时脚本、机器路径、凭据和运行状态。
- 除非 CodexHost 路线图变化，本仓库按独立方案维护。

### 验证记录

2026-09-25：

- CodexHost Desktop/CLI `0.10.0`、全局 Codex CLI `0.156.1`、Codex Desktop `26.917.9434.0` 均为当前版本；Desktop 包状态为 `Ok`，npm 确认 `@codexhost/cli@0.10.0` 与 `@openai/codex@0.156.1` 为最新版。CodexHost `inspect` 显示 Desktop 包内缓存 CLI `0.155.0-alpha.16.4` 属于预期缓存，不代表全局 Codex CLI 升级失败。
- 0.10.0 迁移多次重跑后 renderer SHA-256 均为 `860D572067D6698F2FA458269866BD12B03EB1C0D4A1098CF1774DCBB05C3300`，i18n 补丁保持幂等。最终只保留用户插件目录中的一份 HMHarness，插件与图标哈希与仓库快照一致。
- 通过 `Desktop\CodexHost.lnk` 冷启动后，本次动态 CDP 端口为 `52324`。HMHarness 为 `ready` 并锁定在输入框，模型为 `glm / glm-5.3`，渲染专用图标，并精确返回 `HMH_CODEXHOST_0100_20260925_FINAL`。完成后“正在思考”计数为 `0`，输入框为空，没有 `hmh-codexhost` 子进程残留。
- 可见中文界面通过 `IntlProvider.locale=zh-CN`、17075 条中文消息和可见 `文件 / 编辑 / 视图 / 帮助 / 新对话` 验证；两个必需的 Statsig i18n gate 均被强制开启。
- ChatGPT Chrome 扩展 `1.26.901.11451` 的 Chrome/Edge Native Messaging manifest 官方检查均通过。独立 Chrome profile 按精确扩展 ID 加载并渲染出 ready 的 side panel 页面；独立浏览器冷重启后确认 `extension-host.exe` 由 `extension-host-no-codexhost.cmd` 拉起。已运行的用户 Chrome 会缓存启动时读取的 manifest，需要用户重启该 Chrome 后才切换到 wrapper。

2026-09-20：

- CodexHost `0.9.1`、Codex CLI `0.155.1`、Codex Desktop `26.915.4065.0`、bridge `0.6.5` 均为当前版本。微软商店 UI 交付失败后，改用 Microsoft DisplayCatalog/FE3 返回的官方 x64 MSIX 更新 Desktop；文件大小、SHA-256 和 Authenticode 签名均已验证。
- 0.9.1 迁移脚本连续执行两次验证幂等；位置辅助脚本只保留用户插件副本并移除 installer 目录重复副本。冷启动先出现预期的本地桥接预热窗口，随后 `hmharness=ready`、`adapter.state=ready`，本次动态 CDP 端口为 `56792`。
- 真实输入框选择 HMHarness，模型按钮为 `Model: glm / glm-5.3, glm-5.3`。当前 Agent 按钮和 HMHarness 菜单项都渲染完整匹配的专用 SVG，不是 Antigravity 回落图标。
- 两次真实 UI turn 分别返回 `HMH_CODEXHOST_091_DESKTOP_20260920_OK` 确认和精确最终 marker `HMH_CODEXHOST_091_DESKTOP_EXACT_20260920_OK`，模型为 `glm-5.3`。每次完成后输入框为空、可见“正在思考”计数为 `0`、没有 `hmh-codexhost` 进程残留。
- CC Switch `127.0.0.1:15721`、codex-image-proxy `127.0.0.1:15731` 和其它用户进程未被停止；bridge 测试通过 `2/2`。

2026-09-18：

- 官方 Windows installer 发行版为 `%LOCALAPPDATA%\Programs\codexhost` 下的 CodexHost `0.9.0`；PATH 上的 npm CLI 仍是 wrapper `0.8.0`。Codex CLI 为 `0.154.0`，Codex Desktop 为 `26.911.7940.0`，bridge 为 `0.6.5`。
- 0.9.0 迁移后 HMHarness 为 `ready`，选择 `glm / glm-5.3`，并在真实 Agent 菜单渲染 HMHarness 专用 SVG。真实 UI turn 精确返回 `HMH_CODEXHOST_090_20260918_OK`；`run_20260917175050_9b4a0c` 用时 25.324 秒，`outcome.success=true`、`outcome.reason=final`、`model=glm-5.3`。
- 完成后输入框为空，可见“正在思考”计数为 `0`，且没有 `hm-codexhost` bridge 进程残留。退出 Desktop 后 0.9.0 fallback state 被删除，HKCU 已恢复，`~/.codex/config.toml` 无 shim 残留。冷启动重新回到 `ready`，本次动态 CDP 端口为 `63623`，模型和图标保持一致。

2026-09-15：

- 官方 Windows installer 发行版为 `%LOCALAPPDATA%\Programs\codexhost` 下的 CodexHost `0.8.2`；PATH 上的 npm CLI 是 `0.8.0`，不是 Desktop 实际使用的宿主版本。Codex CLI 为 `0.154.0`，Codex Desktop 为 `26.908.8172.0`，bridge 为 `0.6.5`。
- 0.8.2 迁移后 HMHarness 为 `ready`，暴露预期模型并选择 `glm / glm-5.3`。真实 UI turn 精确返回 `HMH_CODEXHOST_082_UI_FINAL_20260915_OK`；`run_20260914175429_9b60c1` 用时 15.451 秒，`outcome.success=true`、`outcome.reason=final`、`model=glm-5.3`。
- 完成后输入框为空，可见“正在思考”计数为 `0`，且没有 `hm-codexhost` bridge 进程残留。Agent 选项渲染的是 HMHarness 专用 base64 SVG 图标，不是 Antigravity 回落图标。
- 只关闭 Codex Desktop 主进程后，`codexhost-shim.exe` 随之退出。启动器删除 `windows-082-launch-fallback.json`，恢复原始 HKCU 值，并确认 `~/.codex/config.toml` 没有 shim/CodexHost 注入残留。

2026-09-12：

- CodexHost `0.7.1`、其内嵌 Windows 平台包 `0.7.1`、Codex CLI `0.154.0`、Desktop `26.908.4834.0`、bridge `0.6.5` 均为当前版本。本地集成已适配官方上游提交 `e6adb05095aff8aba5241230b07619c8b8aa8db4`；TypeScript 构建通过，目标测试 `270/270` 通过。
- `0.7.1` 迁移脚本通过语法检查，并连续执行两次验证幂等。HMHarness 保持 `ready`，列出 14 个已配置模型，选择 `glm / glm-5.3`，真实 UI marker 返回 `HMH_CODEXHOST_071_20260912_OK`；完成后可见“正在思考”计数为 `0`，且没有 HM bridge 子进程残留。
- 在迁移映射已存在的前提下，Windows 位置辅助脚本把同一个插件包移动到用户插件目录，并移除 npm 管理的重复副本。干净重启后仍列出 14 个模型并选择 `glm / glm-5.3`；`run_20260912154904_67851f` 在 5.850 秒内精确返回 `HMH_CODEXHOST_071_USERPLUGIN_20260912_OK`，完成后“正在思考”计数为 `0`，没有 HM bridge 进程残留。
- `127.0.0.1:15721` 的 CC Switch、`127.0.0.1:15731` 的 codex-image-proxy、既有 `3081` DSH Web 实例均保持可用。DeepSeek Harness 也通过两项本机修复恢复 `ready`：从源码恢复被截断的官方插件，移除无效 `codegraph` MCP 引用并将本机启动等待延长到 60 秒。这些 DeepSeek 文件不属于本 HMHarness 备份。
- CodexHost `0.7.0`、其内嵌 Windows 平台包 `0.7.0`、Codex CLI `0.154.0`、bridge `0.6.5` 均为当前版本；确认所有活跃 node-repl 进程都在使用内嵌 `0.7.0` 路径后，移除了顶层残留的 `@codexhost/cli-win32-x64@0.6.2`。
- 首次 `0.7.0` 迁移暴露出真实兼容缺陷：复制的 manifest 仍指向 `./dist/plugin.js`，而实际 bundle 与官方插件约定都是 `plugin.mjs`，导致 `pluginLoad/loadFailed`。修正 manifest 和迁移脚本后，通过桌面快捷方式完整重启，HMHarness 恢复为 `正常`。
- HMHarness 列出 14 个已配置模型，默认选择 `glm / glm-5.3`。真实 UI turn 发送 `HMH_CODEXHOST_070_20260912_OK` 并收到包含该 marker 的可见回复；完成后输入框为空，可见“正在思考”计数为 0，且没有 HM bridge 子进程残留。
- 桌面启动链路端到端验证为 `Desktop\CodexHost.lnk` -> `wscript.exe` -> `.codexhost-launch.vbs` -> `.codexhost-launch.ps1` -> `codexhost launch`；CDP 与 attachment 监听存在，既有 CC Switch 和图片代理监听保持可用。DeepSeek Harness 仍因自身启动问题不可用，与 HMHarness 无关。
- HMHarness 提交 `b17e02f5c6d654c4a50bbe4c614164167cf9851a` 上的源码 bridge `0.6.5` 测试通过 `2/2`。

2026-09-11：

- CodexHost `0.6.2`、Codex CLI `0.154.0`、bridge `0.6.2` 均为当前版本。
- npm 官方源 tarball `0.6.2` 真实验证：`--version` 返回 `{"version":"0.6.2"}`，隔离 provider 列表返回 `alt-model`，假 key 未泄露。
- 真实 CodexHost/HMHarness 冒烟：HMHarness 为 `ready`，列出全部 13 个已配置模型，选择 `glm / glm-5.3`，连续两个精确 marker 请求均返回精确结果，每个 turn 后 HM bridge 进程退出，可见“正在思考”计数为 0。`selections.phase: locked` 是活动外部线程的预期 ownership 状态，没有阻塞后续 turn。
- 最终源码 bridge `0.6.2`：Node 测试通过 `2/2`，provider 列表返回全部 13 个已配置条目且未输出凭据；真实 GLM marker 请求返回 `HMH_062_OK`，包含流式 delta、权威 final 记录，退出码为 `0`。

2026-09-10：

- CodexHost `npm run typecheck`：通过。
- CodexHost `npm run build:typescript`：通过。
- CodexHost `npm run lint`：通过。
- CodexHost 定向测试：6 个文件、256 个用例全部通过。
- HM bridge Node 测试：2 个用例通过。
- 精选补丁由官方提交 `25fb54f` 和 PR 提交 `3de8496` 生成。
- npm bridge `0.5.2` tarball 真实安装验证：`--version` 通过，provider 输出符合预期，假 key 未泄露。
- 真实 CodexHost/HMHarness 冒烟：thread 与 turn 均完成，结果可读取，bridge 进程退出，UI“正在思考”计数为 0。

### 许可证与声明

见 [LICENSE.md](LICENSE.md)、[NOTICE.md](NOTICE.md) 和 [licenses/](licenses/) 下的完整文本。CodexHost 与 HMHarness 快照均为 MIT 许可。

### 友情链接

- [AtomGit 镜像](https://atomgit.com/hongfu/hmharness-codexhost-adapter)：与 GitHub 保持同步的双语备份。
- [HMHarness 主仓库](https://github.com/swsgbl/hmharness)：面向鸿蒙开发全流程的自进化智能体框架。
- [CodexHost 官方仓库](https://github.com/BytePioneer-AI/codex-host)：多框架 AI 编码智能体桌面宿主。
- [CodexHost Releases](https://github.com/BytePioneer-AI/codex-host/releases)
