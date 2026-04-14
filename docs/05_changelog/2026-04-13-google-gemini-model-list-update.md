# 2026-04-13 — Google Gemini 预设模型列表与文档对齐

## 变更

- 默认模型由 `gemini-2.0-flash` 改为 **`gemini-2.5-flash`**（与 [Gemini 模型文档](https://ai.google.dev/gemini-api/docs/models/gemini) 中稳定版推荐一致；2.0 系列在文档中标记为弃用方向）。
- 预设列表增加：**2.5 Flash / Flash-Lite / Pro**、**3 Flash Preview**、**3.1 Pro Preview**；保留 2.0、1.5 系列供兼容。
- `oct-gateway/config.js` 的 `MODEL_REGISTRY` 为上述新 ID 补充能力（含 `supportsThinking`）。
- 在 `providers.js` 注释中明确：**Vertex AI 推理文档**（`aiplatform.googleapis.com` 等）与 OCT 使用的 **Generative Language OpenAI 兼容端点**（`generativelanguage.googleapis.com/v1beta/openai` + Bearer API Key）是不同接入方式；与 [OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai) 一致，并非接错 Cloud 上另一套 REST。

## 涉及文件

- `oct-gateway/providers.js`
- `oct-gateway/config.js`
- `electron/main.ts`（`getFallbackProviders`）
- `src/hooks/settings/useApiKeys.ts`
- `docs/02_architecture/provider-system.md`
