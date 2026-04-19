# 2026-04-19 — Google 独立配置档（代理与工具策略）

## 背景

Google/Gemini 链路常需要单独代理与额外工具能力策略，若复用全局 `HTTPS_PROXY` 与通用模型能力声明，容易影响其他 Provider。

## 变更

- `oct-gateway/config.js`
  - 新增 `GOOGLE_HTTPS_PROXY`（读取 `.env` / 用户 `config.json`）
  - 新增 `GOOGLE_TOOLS_MODE`（`off | auto | on`，默认 `auto`）
  - 新增 Google 独立覆盖文件加载：`oct-gateway/google.profile.json`
    - 仅覆盖 Google 相关键：`GOOGLE_AI_API_KEY` / `GOOGLE_AI_BASE_URL` / `GOOGLE_HTTPS_PROXY` / `GOOGLE_TOOLS_MODE`
    - 不影响其他 Provider 配置键
- `oct-gateway/ai.js`
  - `fetchWithRetry` 增加 Google 域名的**请求级 dispatcher**：
    - 仅当目标为 `aiplatform.googleapis.com` / `generativelanguage.googleapis.com` 时使用 `GOOGLE_HTTPS_PROXY`
    - 其他 Provider 请求不受影响
- `oct-gateway/runtime/providerRouter.js`
  - 对 `google` Provider 增加工具能力策略：
    - `off`: 强制不启用工具
    - `on`: 强制启用工具
    - `auto`(默认): 从静态 `unsupported` 提升为 `unknown`，允许 runtime probe 自动判定
- `oct-gateway/gateway/slash.js`
  - `/status` 与 `/model` 的能力展示改为统一复用 `ProviderRouter` 结果
  - 修复 Google 在 `auto` 模式下状态仍显示 `provider_model_def + unsupported` 的错觉
  - 保持其他 Provider 原有行为不变（仅统一读取抽象层）
- `oct-gateway/ai.js`
  - 新增 Google 专用 diagram 输出护栏（仅 `provider=google`）
  - 在请求消息里追加约束：优先输出 JSON diagram spec，避免 Mermaid 里 `A — 标签 —> B` 这类易炸语法
  - 该护栏不作用于 MiniMax / DeepSeek / 其他 Provider

## 使用方式

可在 `oct-gateway/google.profile.json`（推荐）或用户配置文件（`%AppData%\openclaw-terminal\config.json`）添加：

```json
{
  "GOOGLE_HTTPS_PROXY": "http://127.0.0.1:10808",
  "GOOGLE_TOOLS_MODE": "auto"
}
```

## 结果

- Google 可以拥有独立“配置档”，不污染 MiniMax/DeepSeek 等其他 Provider 的网络与工具行为。
- 默认模式下不强行宣称 Google 工具能力，改为运行时探测，减少“输出伪 tool_code 但不执行”的体验问题。
