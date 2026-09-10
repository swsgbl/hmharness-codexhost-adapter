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

The bridge is publicly distributed as [`@hmharness/codexhost-bridge`](https://www.npmjs.com/package/@hmharness/codexhost-bridge). The current npm release is `0.6.2`; its official-registry tarball was installed and verified with a credential-free provider probe. The source snapshot preserved here is the `0.6.2` release from HMHarness commit `f08e2d418eb0e184f14e3792640ab8221997ce7b`.

Do not place a second `hmharness` plugin in CodexHost's user plugin directory; duplicate plugin IDs cause both plugins to be rejected.

### Upstream Status

- [CodexHost PR #243](https://github.com/BytePioneer-AI/codex-host/pull/243), based on official commit `25fb54f`, was closed because HMHarness is not currently in the CodexHost roadmap. No technical review or CI feedback was left.
- `@hmharness/codexhost-bridge@0.6.2` is public on npm, is not private, declares MIT, and points to the correct monorepo subdirectory.
- HMHarness `main` commit `f08e2d418eb0e184f14e3792640ab8221997ce7b` carries the `0.6.2` bridge with matching `@hmharness/agent` and `@hmharness/kernel` dependencies.
- The PR excludes local build products, temporary scripts, machine paths, credentials, and runtime state.
- This repository is maintained independently unless CodexHost later changes its roadmap.

### Validation Snapshot

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

bridge 已在 npm 公开发布为 [`@hmharness/codexhost-bridge`](https://www.npmjs.com/package/@hmharness/codexhost-bridge)。当前 npm 版本是 `0.6.2`，官方源 tarball 已完成真实安装、`--version` 和无凭据 provider 输出验证；本仓库保留的来源快照是 HMHarness 提交 `f08e2d418eb0e184f14e3792640ab8221997ce7b` 上的 `0.6.2` 发布版本。

不要把另一个 `hmharness` 插件放进 CodexHost 的用户插件目录；重复插件 ID 会导致两个插件同时被拒绝。

### 官方状态与维护策略

官方提案状态：

- [CodexHost PR #243](https://github.com/BytePioneer-AI/codex-host/pull/243) 基于官方提交 `25fb54f` 的干净分支，但维护者以 HMHarness 当前不在 CodexHost 计划中为由关闭；未留下技术 review 或 CI 反馈。
- `@hmharness/codexhost-bridge@0.6.2` 已公开发布，非 private，MIT 许可，npm repository directory 指向正确。
- HMHarness `main` 提交 `f08e2d418eb0e184f14e3792640ab8221997ce7b` 中的 bridge 已升级为 `0.6.2`，并匹配 `@hmharness/agent` / `@hmharness/kernel` `0.6.2`。
- PR 已排除本地构建产物、临时脚本、机器路径、凭据和运行状态。
- 除非 CodexHost 路线图变化，本仓库按独立方案维护。

### 验证记录

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
