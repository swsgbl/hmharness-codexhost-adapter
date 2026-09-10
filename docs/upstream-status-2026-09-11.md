# Latest Upstream Status / 最新官方状态（2026-09-11）

## English

Completed:

1. `@hmharness/codexhost-bridge@0.6.2` is public on the official npm registry with MIT metadata, no `private` flag, and the correct `repository.directory`.
2. A clean project installed the official-registry tarball and verified `--version`, provider listing, and credential-free output. `--version` returned `{"version":"0.6.2"}`, the isolated provider listing returned `alt-model`, and neither fake key appeared.
3. CodexHost maintainers closed [PR #243](https://github.com/BytePioneer-AI/codex-host/pull/243) on 2026-09-10 because HMHarness is not currently in the CodexHost roadmap. No technical review or CI feedback was left.
4. The 2026-09-11 desktop update verification covered CodexHost `0.6.2`, Codex Desktop `26.903.9818.0`, Codex CLI `0.154.0`, an `HMHarness ready` selection, all 13 configured models, the `glm / glm-5.3` model, two consecutive exact responses, bridge process exit after each turn, and zero visible Thinking indicators. `selections.phase: locked` is the expected active external-thread ownership state and did not block the follow-up turn.
5. The final `0.6.2` source bridge from HMHarness commit `f08e2d418eb0e184f14e3792640ab8221997ce7b` passed its Node tests, returned all 13 configured providers, and completed a live GLM marker turn with output `HMH_062_OK`, streaming deltas, an authoritative final record, and process exit `0`.
6. Earlier integration validation covered TypeScript build, typecheck, lint, 256 targeted tests, a real HMHarness task, bridge process exit, and zero Thinking indicators after completion.

Next:

1. Keep this repository as the independent bilingual backup and installation patch.
2. Revisit upstream only if the CodexHost roadmap or maintainers change scope.

## 中文

已完成：

1. `@hmharness/codexhost-bridge@0.6.2` 已在 npm 官方源公开，MIT 元数据正确，没有 `private` 标记，`repository.directory` 指向正确。
2. 已在干净项目中安装官方源 tarball，并完成 `--version`、provider 列表和无凭据输出验证。`--version` 返回 `{"version":"0.6.2"}`，隔离 provider 列表返回 `alt-model`，两个假 key 均未出现。
3. CodexHost 维护者已于 2026-09-10 关闭 [PR #243](https://github.com/BytePioneer-AI/codex-host/pull/243)，理由是 HMHarness 当前不在 CodexHost 计划中；未留下技术 review 或 CI 反馈。
4. 2026-09-11 的桌面更新验证覆盖 CodexHost `0.6.2`、Codex Desktop `26.903.9818.0`、Codex CLI `0.154.0`、`HMHarness ready` 选择状态、全部 13 个已配置模型、`glm / glm-5.3` 模型、连续两个精确响应、每个 turn 后 bridge 进程退出，以及可见 Thinking 指示为 0。`selections.phase: locked` 是活动外部线程的预期 ownership 状态，没有阻塞后续 turn。
5. 来自 HMHarness 提交 `f08e2d418eb0e184f14e3792640ab8221997ce7b` 的最终 `0.6.2` 源码 bridge 通过 Node 测试，返回全部 13 个已配置 provider，并完成真实 GLM marker turn：输出 `HMH_062_OK`，包含流式 delta 和权威 final 记录，进程退出码为 `0`。
6. 此前集成验证已覆盖 TypeScript 构建、typecheck、lint、256 个定向测试、真实 HMHarness 任务、bridge 进程退出，以及完成后 Thinking 指示为 0。

后续：

1. 继续将本仓库作为独立的双语备份和安装补丁维护。
2. 仅在 CodexHost 路线图或维护者态度变化时重新评估上游提案。
