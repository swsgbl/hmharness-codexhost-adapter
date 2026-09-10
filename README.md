# HMHarness CodexHost Adapter Backup

[![English](https://img.shields.io/badge/README-English-blue)](#english) [![中文](https://img.shields.io/badge/README-%E4%B8%AD%E6%96%87-red)](#%E4%B8%AD%E6%96%87) [![HMHarness](https://img.shields.io/badge/Friend%20link-HMHarness-2CA5E0)](https://github.com/swsgbl/hmharness) [![CodexHost](https://img.shields.io/badge/Friend%20link-CodexHost-111827)](https://github.com/BytePioneer-AI/codex-host)

This repository is a bilingual, source-provenance backup of the working HMHarness integration for CodexHost. It preserves the adapter, bridge protocol, renderer integration, tests, and a clean patch that applies to upstream CodexHost.

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
  - Clean source/test-only patch against CodexHost commit `0b76b9de8c6f551506287d9a12905f9fdc860da2`.
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
git checkout 0b76b9de8c6f551506287d9a12905f9fdc860da2
git apply --check path/to/0001-add-hmharness-adapter-and-streaming-bridge.patch
git apply path/to/0001-add-hmharness-adapter-and-streaming-bridge.patch
npm install
npm run typecheck
npx vitest run --config tests/vitest.config.js \
  packages/protocol-core/test/codex-ui-projector.test.ts \
  packages/adapters/hmharness/test/hmharness-adapter.test.ts \
  packages/host-runtime/test/app-server-host.test.ts
```

The bridge package in this backup is an implementation snapshot, not a published npm package. Copy it into an HMHarness monorepo workspace or install it from a local path. Do not place a second `hmharness` plugin in CodexHost's user plugin directory; duplicate plugin IDs cause both plugins to be rejected.

### Upstream Readiness

This integration is worth proposing upstream, but it is not ready for immediate merge into the official CodexHost default branch:

- Publish a non-private `@hmharness/codexhost-bridge` package or vendor a maintained bridge path. On 2026-09-10, npm returned 404 for this package and its manifest is marked `private: true`.
- Reconcile the bridge dependency versions with the current HMHarness release. The bridge manifest currently pins `@hmharness/agent` and `@hmharness/kernel` to `0.2.0`, while the HMHarness monorepo packages are at `0.5.2`.
- Create a clean feature branch from official `main`. The original local working history also contains build products, machine backups, and temporary merge artifacts; only the curated patch in this repository should be submitted.
- Clarify licensing at the HMHarness source: package manifests declare Apache-2.0 while the repository root carries MIT text. Preserve both notices until upstream resolves the intended license.
- Add a small upstream-friendly CI job covering the adapter, projector, host runtime, bridge version output, and provider listing without credentials.

### Validation Snapshot

On 2026-09-10:

- CodexHost `npm run typecheck`: passed.
- CodexHost targeted suite: 3 files, 170 tests passed.
- HM bridge Node test: 2 tests passed.
- Clean patch applied with `git apply --check` to upstream commit `0b76b9d`.
- Real CodexHost/HMHarness smoke: thread and turn completed, result was available, the HM bridge process exited, and the UI Thinking count was zero.

### License And Notices

See [LICENSE](LICENSE.md), [NOTICE.md](NOTICE.md), and the complete texts under [licenses/](licenses/). The CodexHost patch and snapshot derive from MIT-licensed CodexHost source. The HM bridge snapshot declares Apache-2.0 in its package manifest.

### Friendly Links

- [HMHarness main repository](https://github.com/swsgbl/hmharness): self-evolving agent framework for the HarmonyOS development lifecycle.
- [CodexHost](https://github.com/BytePioneer-AI/codex-host): multi-framework desktop host for AI coding agents.
- [CodexHost Releases](https://github.com/BytePioneer-AI/codex-host/releases)

## 中文

### 项目简介

这是 HMHarness 接入 CodexHost 的双语开源备份仓库，保留当前已经真实验证过的 adapter、bridge 协议、桌面端集成、回归测试，以及一份可干净应用到官方 CodexHost 源码的补丁。

接入分为两部分：

1. **CodexHost adapter**：发现 `hmh-codexhost` 可执行文件，读取 provider/model 目录，映射 CodexHost harness 生命周期，消费流式事件，并用权威最终结果关闭 Turn。
2. **HM bridge**：用稳定的 NDJSON 协议暴露 HMHarness 能力：
   - `{"type":"delta","text":"..."}`：最终回答的流式增量；
   - `{"type":"tool",...}`：工具调用活动；
   - `{"type":"line",...}`：执行循环状态；
   - `{"text":"...","sessionId":...}`：最终权威结果。

bridge 输出最终记录后立即退出。adapter 信任 `item.completed` 的权威快照，因此中间进度文本与最终文本不一致时，也不会让 UI 一直停留在“正在思考”。

### 仓库结构

- `patches/codex-host/0001-add-hmharness-adapter-and-streaming-bridge.patch`：只包含源码和测试的精选补丁，基准为官方 `main` 提交 `0b76b9de8c6f551506287d9a12905f9fdc860da2`。
- `snapshots/codex-host/`：已验证集成中涉及的 CodexHost 源码和测试文件。
- `snapshots/hmharness/packages/codexhost-bridge/`：adapter 依赖的机器可读 bridge 实现。
- `manifest/provenance.json`：来源提交、哈希、补丁可应用性和验证结果。
- `verification/`：复现步骤和证据。

### 应用补丁

```bash
git clone https://github.com/BytePioneer-AI/codex-host.git
cd codex-host
git checkout 0b76b9de8c6f551506287d9a12905f9fdc860da2
git apply --check path/to/0001-add-hmharness-adapter-and-streaming-bridge.patch
git apply path/to/0001-add-hmharness-adapter-and-streaming-bridge.patch
npm install
npm run typecheck
npx vitest run --config tests/vitest.config.js \
  packages/protocol-core/test/codex-ui-projector.test.ts \
  packages/adapters/hmharness/test/hmharness-adapter.test.ts \
  packages/host-runtime/test/app-server-host.test.ts
```

这里的 bridge 是实现快照，不是已发布 npm 包。可以复制回 HMHarness monorepo workspace，或从本地路径安装。不要把另一个 `hmharness` 插件放进 CodexHost 的用户插件目录；重复插件 ID 会导致两个插件同时被拒绝。

### 是否建议合并到官方仓库

建议作为功能提案提交给官方，但不建议把当前本地历史直接推送或直接请求合并：

- 先发布非 private 的 `@hmharness/codexhost-bridge`，或提供官方可维护的 vendored bridge 路径。2026-09-10 查询 npm 时该包返回 404，manifest 也标记为 `private: true`。
- bridge 依赖仍固定在 HMHarness `0.2.0`，而 HMHarness 当前包版本是 `0.5.2`，需要升级并回归。
- 官方 PR 必须从官方 `main` 新建干净分支。本仓库的精选补丁已排除本地构建产物、全局安装备份和临时合并脚本。
- HMHarness 根许可证写 MIT，各 package manifest 写 Apache-2.0，提官方前需要在上游明确统一。
- 建议官方 CI 至少覆盖 adapter、projector、host runtime、bridge 版本输出和不含凭据的 provider 列表。

### 验证记录

2026-09-10：

- CodexHost `npm run typecheck`：通过。
- CodexHost 定向测试：3 个文件、170 个用例全部通过。
- HM bridge Node 测试：2 个用例通过。
- 精选补丁对官方提交 `0b76b9d` 执行 `git apply --check`：通过。
- 真实 CodexHost/HMHarness 冒烟：thread 与 turn 均完成，结果可读取，bridge 进程退出，UI“正在思考”计数为 0。

### 许可证与声明

见 [LICENSE.md](LICENSE.md)、[NOTICE.md](NOTICE.md) 和 [licenses/](licenses/) 下的完整文本。CodexHost 补丁和快照来源于 MIT 许可的 CodexHost 源码；HM bridge 快照的 package manifest 声明为 Apache-2.0。

### 友情链接

- [HMHarness 主仓库](https://github.com/swsgbl/hmharness)：面向鸿蒙开发全流程的自进化智能体框架。
- [CodexHost 官方仓库](https://github.com/BytePioneer-AI/codex-host)：多框架 AI 编码智能体桌面宿主。
- [CodexHost Releases](https://github.com/BytePioneer-AI/codex-host/releases)

