# 2026-04-19 — 修复 Google AQ Key 已填却提示未配置

## 排查结果

- 用户配置文件 `%AppData%/openclaw-terminal/config.json` 中：
  - `OCT_PROVIDER=google`
  - `OCT_MODEL=google/gemini-2.5-flash-preview-04-17`
  - `GOOGLE_AI_API_KEY` 已存在（AQ 开头）
- 但项目根 `.env.local` 固定了：
  - `OCT_CONFIG_FILE=E:/windows-window/OpenClaw-Terminal/oct-gateway/config.json`
- 该项目配置文件中的 `GOOGLE_AI_API_KEY` 为空，导致网关实际读取为空并报「API Key 未配置」。

## 修复

- 修改 `.env.local`：移除 `OCT_CONFIG_FILE` 固定路径，改为
  - `OCT_DEV_USE_PROJECT_CONFIG=0`
- 让 Gateway 默认读取设置面板保存的 `userData/config.json`，与 UI 配置一致。

## 备注

- 若仍报错，重启应用（确保 Gateway 子进程重新拉起）。
