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
- `snapshots/codex-host-runtime/0.7.1/plugin/`
  - Runtime plugin bundle for the independently maintained CodexHost `0.7.1` integration.
- `scripts/apply-codexhost-0.7.1.mjs`
  - Idempotent migration for an official `@codexhost/cli@0.7.1` installation.
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

Do not place a second `hmharness` plugin in CodexHost's user plugin directory; duplicate plugin IDs cause both plugins to be rejected.

### Maintain CodexHost 0.7.1 At Runtime

CodexHost's maintainers have said that HMHarness is outside their roadmap. For the independently maintained runtime integration, install the official host first and apply the local migration after every CodexHost update:

```powershell
npm install -g @codexhost/cli@0.7.1
node scripts/apply-codexhost-0.7.1.mjs
codexhost --version
```

The migration validates that the plugin manifest uses the CodexHost `0.7.1` entry convention (`plugin.mjs`), copies the bundle into the official package's nested platform runtime, enables the plugin, and adds the renderer/controller model and ownership mappings. Close and relaunch CodexHost through its normal launcher after applying it. The current bundle was adapted from official upstream commit `e6adb05095aff8aba5241230b07619c8b8aa8db4`; its plugin SHA-256 is `57D1EDD1394F2011B0FF4C88830870FF64C6D4A0A49BFA3BAF0C7094FDA4436A`.

### Upstream Status

- [CodexHost PR #243](https://github.com/BytePioneer-AI/codex-host/pull/243), based on official commit `25fb54f`, was closed because HMHarness is not currently in the CodexHost roadmap. No technical review or CI feedback was left.
- `@hmharness/codexhost-bridge@0.6.5` is public on npm, is not private, declares MIT, and points to the correct monorepo subdirectory.
- The bridge snapshot preserved here is `0.6.5` from clean HMHarness `main` commit `b17e02f5c6d654c4a50bbe4c614164167cf9851a`.
- The PR excludes local build products, temporary scripts, machine paths, credentials, and runtime state.
- This repository is maintained independently unless CodexHost later changes its roadmap.

### Validation Snapshot

On 2026-09-12:

- CodexHost `0.7.1`, its nested Windows platform package `0.7.1`, Codex CLI `0.154.0`, Desktop `26.908.4834.0`, and bridge `0.6.5` were current. The local integration was rebased onto official upstream commit `e6adb05095aff8aba5241230b07619c8b8aa8db4`; the TypeScript build passed and the targeted suite passed `270/270`.
- The `0.7.1` migration was syntax-checked and executed twice as an idempotency test. HMHarness remained `ready`, listed 14 configured models, selected `glm / glm-5.3`, and returned real UI marker `HMH_CODEXHOST_071_20260912_OK`; the visible Thinking count returned to `0` and no HM bridge child process remained.
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
- `snapshots/codex-host-runtime/0.7.1/plugin/`：独立维护的 CodexHost `0.7.1` 运行时插件包。
- `scripts/apply-codexhost-0.7.1.mjs`：面向官方 `@codexhost/cli@0.7.1` 安装的幂等迁移脚本。
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

不要把另一个 `hmharness` 插件放进 CodexHost 的用户插件目录；重复插件 ID 会导致两个插件同时被拒绝。

### 维护 CodexHost 0.7.1 运行时

CodexHost 官方已明确 HMHarness 不在其路线图内。独立维护的运行时集成应先安装官方宿主，再在每次 CodexHost 更新后应用本地迁移：

```powershell
npm install -g @codexhost/cli@0.7.1
node scripts/apply-codexhost-0.7.1.mjs
codexhost --version
```

迁移脚本会校验插件 manifest 使用 CodexHost `0.7.1` 的入口约定（`plugin.mjs`），复制插件包到官方包内嵌的平台运行时，启用插件，并补齐 renderer/controller 的模型与 ownership 映射。应用后需要按正常启动器完整重启 CodexHost。当前 bundle 基于官方上游提交 `e6adb05095aff8aba5241230b07619c8b8aa8db4` 适配；插件 SHA-256 为 `57D1EDD1394F2011B0FF4C88830870FF64C6D4A0A49BFA3BAF0C7094FDA4436A`。

### 官方状态与维护策略

官方提案状态：

- [CodexHost PR #243](https://github.com/BytePioneer-AI/codex-host/pull/243) 基于官方提交 `25fb54f` 的干净分支，但维护者以 HMHarness 当前不在 CodexHost 计划中为由关闭；未留下技术 review 或 CI 反馈。
- `@hmharness/codexhost-bridge@0.6.5` 已公开发布，非 private，MIT 许可，npm repository directory 指向正确。
- 本仓库保留的 bridge 快照来自干净的 HMHarness `main` 提交 `b17e02f5c6d654c4a50bbe4c614164167cf9851a`。
- PR 已排除本地构建产物、临时脚本、机器路径、凭据和运行状态。
- 除非 CodexHost 路线图变化，本仓库按独立方案维护。

### 验证记录

2026-09-12：

- CodexHost `0.7.1`、其内嵌 Windows 平台包 `0.7.1`、Codex CLI `0.154.0`、Desktop `26.908.4834.0`、bridge `0.6.5` 均为当前版本。本地集成已适配官方上游提交 `e6adb05095aff8aba5241230b07619c8b8aa8db4`；TypeScript 构建通过，目标测试 `270/270` 通过。
- `0.7.1` 迁移脚本通过语法检查，并连续执行两次验证幂等。HMHarness 保持 `ready`，列出 14 个已配置模型，选择 `glm / glm-5.3`，真实 UI marker 返回 `HMH_CODEXHOST_071_20260912_OK`；完成后可见“正在思考”计数为 `0`，且没有 HM bridge 子进程残留。
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
