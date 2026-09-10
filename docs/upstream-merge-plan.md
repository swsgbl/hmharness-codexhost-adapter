# Upstream Merge Plan / 官方合并准备

## English

1. Resolve the HMHarness bridge distribution path: publish a public package or choose a vendored source layout.
2. Update `@hmharness/agent` and `@hmharness/kernel` dependencies to the current maintained release and rerun bridge tests.
3. Create a clean branch from official CodexHost `main`; apply only the curated patch in this repository.
4. Keep the upstream PR source/test only. Exclude local build products, global npm backups, temporary merge scripts, machine-specific paths, credentials, and runtime state.
5. Resolve or explicitly document the MIT/Apache-2.0 declaration mismatch in HMHarness.
6. Add CI for typecheck, the three targeted CodexHost suites, bridge `--version`, and provider listing without credentials.
7. Attach a short live proof showing model selection, a completed Turn, bridge process exit, and no Thinking spinner after completion.

## 中文

1. 先解决 HM bridge 的分发方式：发布公开 npm 包，或确定 vendored 源码布局。
2. 将 `@hmharness/agent` 和 `@hmharness/kernel` 依赖升级到当前维护版本，并复跑 bridge 测试。
3. 从官方 CodexHost `main` 新建干净分支，只应用本仓库精选补丁。
4. 官方 PR 只保留源码和测试，排除本地构建产物、全局 npm 备份、临时合并脚本、机器路径、凭据和运行状态。
5. 解决或明确说明 HMHarness 中 MIT 与 Apache-2.0 声明不一致的问题。
6. 增加 CI：typecheck、三组 CodexHost 定向测试、bridge `--version`、无凭据 provider 列表。
7. 附上简短真实运行证据：模型可选择、Turn 完成、bridge 进程退出、完成后 UI 没有 Thinking 状态。

