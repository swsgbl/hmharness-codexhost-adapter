# Upstream Proposal Status / 官方提案状态

## English

Completed:

1. Published `@hmharness/codexhost-bridge@0.6.1` to npm with MIT metadata and no `private` flag.
2. Updated the HMHarness source bridge to `0.6.1` with matching runtime dependencies, tests, README, LICENSE, and publish preflight.
3. Created a clean branch from official CodexHost `main` commit `25fb54f`.
4. Verified TypeScript build, typecheck, lint, formatting, and 256 targeted tests.
5. Submitted [CodexHost PR #243](https://github.com/BytePioneer-AI/codex-host/pull/243).
6. CodexHost maintainers closed PR #243 on 2026-09-10 because HMHarness is not currently in the CodexHost roadmap; no technical review or CI feedback was left.

Next:

1. Maintain this bilingual backup and installation patch independently.
2. Track future CodexHost releases and re-test this patch against relevant versions.
3. Revisit upstream only if CodexHost changes its roadmap or maintainers request another proposal.

## 中文

已完成：

1. `@hmharness/codexhost-bridge@0.6.1` 已公开发布到 npm，MIT 元数据正确，且不再是 private。
2. HMHarness 源码中的 bridge 已升级到 `0.6.1`，运行依赖、测试、README、LICENSE 和发布预检均已补齐。
3. 已从官方 CodexHost `main` 提交 `25fb54f` 创建干净分支。
4. 已验证 TypeScript 构建、typecheck、lint、格式检查和 256 个定向测试。
5. 已提交 [CodexHost PR #243](https://github.com/BytePioneer-AI/codex-host/pull/243)。
6. CodexHost 维护者已于 2026-09-10 关闭 PR #243，理由是 HMHarness 当前不在 CodexHost 计划中；未留下技术 review 或 CI 反馈。

后续：

1. 独立维护双语备份和安装补丁。
2. 跟踪 CodexHost 后续版本，并在相关版本上回归测试本补丁。
3. 仅在 CodexHost 路线图变化或维护者再次邀请提案时重新评估上游合并。
