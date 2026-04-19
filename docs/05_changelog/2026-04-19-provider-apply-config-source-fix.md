# 2026-04-19 — 修复开发模式 Provider 应用后未生效（配置源不一致）

## 问题

在开发模式下，设置面板「应用」会写入 Electron `userData/config.json`，
但 Gateway 默认读取项目内 `oct-gateway/config.json`，导致 Provider 切换后实际运行配置未变化（常见表现：选了 Google 仍显示/使用 MiniMax）。

## 修复

- `electron/main.ts`
  - `resolveGatewayConfigFileForSpawn()` 中 `OCT_DEV_USE_PROJECT_CONFIG` 默认值由 `1` 改为 `0`。
  - 结果：开发模式默认与设置面板统一读取 `userData/config.json`。
  - 若确需强制使用项目内配置，可手动设置 `OCT_DEV_USE_PROJECT_CONFIG=1`。

## 影响

- 设置面板中的 Provider / Model / Key / Base URL 应用后会与 Gateway 实际生效配置一致。
- 避免「UI 显示已切换，但网关仍按旧 provider 出站」的问题。
