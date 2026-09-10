# Upstream Merge Status / 官方合并状态

## English

Completed:

1. Published `@hmharness/codexhost-bridge@0.5.2` to npm with MIT metadata and no `private` flag.
2. Updated the HMHarness source bridge to `0.5.3` with matching runtime dependencies, tests, README, LICENSE, and publish preflight.
3. Created a clean branch from official CodexHost `main` commit `25fb54f`.
4. Verified TypeScript build, typecheck, lint, formatting, and 256 targeted tests.
5. Submitted [CodexHost PR #243](https://github.com/BytePioneer-AI/codex-host/pull/243).

Next:

1. Address upstream review feedback.
2. Publish bridge `0.5.3` after completing npm web login, then verify `npm view` and a tarball install.
3. If requested, add upstream CI covering adapter, projector, host runtime, renderer binding, plugin packaging, bridge `--version`, and provider listing without credentials.

## 中文

已完成：

1. `@hmharness/codexhost-bridge@0.5.2` 已公开发布到 npm，MIT 元数据正确，且不再是 private。
2. HMHarness 源码中的 bridge 已升级到 `0.5.3`，运行依赖、测试、README、LICENSE 和发布预检均已补齐。
3. 已从官方 CodexHost `main` 提交 `25fb54f` 创建干净分支。
4. 已验证 TypeScript 构建、typecheck、lint、格式检查和 256 个定向测试。
5. 已提交 [CodexHost PR #243](https://github.com/BytePioneer-AI/codex-host/pull/243)。

后续：

1. 跟进官方 review 意见。
2. 完成 npm web login 后发布 bridge `0.5.3`，再用 `npm view` 和 tarball 安装复核。
3. 如官方需要，补充 adapter、projector、host runtime、renderer binding、插件打包、bridge `--version` 和无凭据 provider 列表的 CI。
