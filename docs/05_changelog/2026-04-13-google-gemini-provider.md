# 2026-04-13 — Google Gemini 服务商接入

## 摘要
- 新增 `google` Provider：使用 Google **Generative Language API** 的 **OpenAI 兼容**端点（`generativelanguage.googleapis.com/v1beta/openai`），与现有 `chat/completions` 流式链路一致。
- API Key 对应 Google Cloud **Vertex AI Studio → 设置 → API 密钥**；配置写入 `config.json` 的 `GOOGLE_AI_API_KEY`、`GOOGLE_AI_BASE_URL`，环境变量可选用 `GOOGLE_AI_API_KEY` 或 `GEMINI_API_KEY`。
- 设置面板可选「Google Gemini（Vertex AI Studio API 密钥）」；预设 Gemini 模型当前声明 **不支持工具调用**（避免兼容层与 OCT 工具循环不稳定）。

## 后续修正（同日）
- 若出现 **400 Multiple authentication credentials**：多为 **`Authorization: Bearer` 与 `x-goog-api-key`（或其它重复鉴权）同时存在**。Electron 在拉起 oct-gateway 时 **删除 `NODE_USE_ENV_PROXY`**，避免与 `index.js` 中的 undici **`ProxyAgent`** 叠用。网关对 Google 主对话已改为 **仅 `x-goog-api-key`**，避免与运行时自动注入的 Bearer 叠用（见 `2026-04-14-google-gemini-x-goog-api-key-only.md`）。

## 涉及文件
- `oct-gateway/providers.js`、`oct-gateway/config.js`、`oct-gateway/ai.js`
- `src/hooks/settings/useApiKeys.ts`、`src/ui/settings/tabs/ConnectionTabView.tsx`、`src/utils/providerUtils.ts`
- `electron/main.ts`、`electron/preload.ts`、`src/vite-env.d.ts`、`src/App.tsx`
- `docs/02_architecture/provider-system.md`
