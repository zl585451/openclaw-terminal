# 2026-04-19 — 开发模式固定使用仓库内 Gateway 配置

## 变更

- 新增项目根目录 `.env.local`：
  - `OCT_CONFIG_FILE=E:/windows-window/OpenClaw-Terminal/oct-gateway/config.json`
- 更新 `electron/main.ts`：开发模式拉起 `oct-gateway` 时，默认优先使用项目内 `oct-gateway/config.json`（可用 `OCT_DEV_USE_PROJECT_CONFIG=0` 关闭）
- 更新 `oct-gateway/config.json`，加入 Google 独立配置项：
  - `GOOGLE_AI_API_KEY`
  - `GOOGLE_AI_BASE_URL`
  - `GOOGLE_HTTPS_PROXY`
  - `GOOGLE_TOOLS_MODE`
  - 当前开发目录默认值设为 `GOOGLE_TOOLS_MODE=on`（仅 Google 生效）

## 目的

- 开发模式下强制使用仓库内配置，不依赖客户端用户目录 `%AppData%/openclaw-terminal/config.json`。
- Google 配置集中在项目目录，便于调试且不影响其他 Provider 的默认行为。
