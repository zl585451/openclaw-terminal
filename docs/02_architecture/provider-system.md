# Provider 系统 — AI 服务商市场化

> **最后更新**：2026-04-16（硅基流动设置页模型自由填写；原 2026-04-14 Gemini 400 说明仍有效） | **状态**：✅ 正常

---

## 做什么
抽象 AI 服务商为统一的 Provider 概念，让用户在 GUI 中选择服务商、填 Key、选模型，无需编辑 .env。

## 文件
- `oct-gateway/providers.js` — 服务商预设注册表
- `oct-gateway/config.js` — getProviderConfig、currentProvider
- `oct-gateway/ai.js` — 按 provider 能力组装请求
- `oct-gateway/index.js` — `/model`、`/provider` 命令
- `src/ui/settings/tabs/ConnectionTabView.tsx` — 连接页：服务商选择器、Key、Base URL、测试连接；**硅基流动**（`OCT_PROVIDER=siliconflow`）下「当前模型」为文本框，直接编辑 `OCT_MODEL`，并附带常用模型快捷填入

## 预设服务商
| ID | 名称 | Base URL |
|----|------|----------|
| bailian | 阿里云百炼 | dashscope.aliyuncs.com |
| bailian-coding | 阿里云百炼 Coding Plan | coding.dashscope.aliyuncs.com |
| deepseek | DeepSeek | api.deepseek.com |
| siliconflow | 硅基流动 | api.siliconflow.cn |
| moonshot | Moonshot (Kimi) | api.moonshot.cn |
| groq | Groq | api.groq.com |
| openai | OpenAI | api.openai.com |
| ollama | Ollama 本地 | localhost:11434 |
| custom | 自定义 | 用户填写 |
| google | Google Gemini（Vertex AI Studio API 密钥） | generativelanguage.googleapis.com/v1beta/openai |

### Google：`google` 与 Vertex 文档里的「推理 API」

- **OCT 使用**：`https://generativelanguage.googleapis.com/v1beta/openai`，请求头 **`x-goog-api-key: <API Key>`**（避免与部分环境下自动注入的 `Authorization: Bearer` 叠用导致 400 *Multiple authentication credentials*；官方 REST 示例亦常用 API Key 头）。模型名如 `gemini-2.5-flash`。说明见 [Gemini API OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)；密钥可在 Vertex AI Studio 的 API 密钥页创建。
- **不是**：Cloud 文档 [Vertex AI Generative AI inference](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference) 里常见的 `aiplatform.googleapis.com` 项目/区域路径、`generateContent` 原生 REST，或 Vertex 上 OpenAI 库的 **另一套 base URL**（常含区域与项目 ID）。
- 若在网页/控制台里能通而网关失败，先确认 **代理与计费** 已就绪，再对照网关日志中的 HTTP 状态与错误体；若你实际走的是 Vertex 专用端点，需在 OCT 中选「自定义」并填写对应 base URL（当前预设 `google` 不覆盖该路径）。
- 若日志为 **400 *Multiple authentication credentials***：勿在 Base URL 上带 `?key=`；网关对 Google 仅发 **`x-goog-api-key`**；启用 `HTTPS_PROXY` 时勿再依赖 **`NODE_USE_ENV_PROXY`**（网关在启用 undici 代理时会清除该变量）。

## 数据流
```
用户在 Settings 选择服务商/模型
    → save-api-keys 写入 config.json (OCT_PROVIDER, OCT_MODEL, 各服务商 Key/Base URL，可选 **HTTPS_PROXY** 供网关访问境外 API，...)
    → 重启 Gateway
    → config.loadConfigFile() 读取
    → getProviderConfig() 返回 apiKey/baseUrl/models
    → ai.js streamChat 按 provider 能力组装请求
```

## 多模态能力路由

OCT 的云端语音链不是“谁配置了 Key 就调用谁”，而是按**当前激活 Provider 的能力**启用。

- `OCT_PROVIDER=minimax`
  - `auto` 朗读会优先走 MiniMax WebSocket TTS
  - 可显示 MiniMax 云端音色配置
- `OCT_PROVIDER=bailian` 或 `bailian-coding`
  - `auto` 朗读会优先走 DashScope 云端 TTS
- `OCT_PROVIDER=deepseek` / `google` / `custom` / 其他无云端语音能力的 Provider
  - `auto` 不会偷偷调用 MiniMax 或 DashScope
  - 直接回退到本地浏览器朗读

这条规则的目标是：

- 发布版保持产品级行为，而不是某家模型商的硬编码特例
- 机器里即便残留其他 Provider 的 Key，也不会给当前对话链带来额外系统负担
- 未来继续接入图像、语音、视频等套餐能力时，可以复用同一套 capability routing 设计

## Slash 命令
- `/model` — 展示当前 provider 的模型列表（🔧 工具 🧠 思考），切换模型
- `/provider` — 展示可用服务商，切换服务商

## 能力声明
每个 provider 的 models 声明 `tools`、`thinking`。仅 `tools: true` 的模型才会传 `tools`/`tool_choice`，避免 deepseek-v3 等报错。

---

## MiniMax 温度参数

- MiniMax 文本对话默认以 `0.7` 发送 `temperature`
- 可通过 `MINIMAX_TEMPERATURE` 覆盖，支持放在 `.env`、`.env.local` 或用户运行时 `config.json`
- 合法范围按官方接口约束为 `0 < x <= 1`；超出范围时 Gateway 会回退到 `0.7`

## 更新日志
| 日期 | 内容 |
|------|------|
| 2026-04-14 | `google` 主对话改为仅 `x-goog-api-key`，避免与 Bearer 叠用导致 400；文档与测试连接 IPC 同步 |
| 2026-04-14 | 文档：`google` 出现 400 *Multiple authentication credentials* 时的排查（Base URL 勿带 `?key=`、`NODE_USE_ENV_PROXY` 与 undici 代理勿叠用）；网关侧已做 URL 净化与代理启动时清理 `NODE_USE_ENV_PROXY` |
| 2026-04-13 | 扩充 `google` 预设模型（2.5 / 3.x 预览），默认 `gemini-2.5-flash`；文档区分 Generative Language OpenAI 兼容层与 Vertex 原生推理 API |
| 2026-04-13 | 新增 `google` Provider（Vertex AI Studio API 密钥 + Gemini OpenAI 兼容端点）；配置键 `GOOGLE_AI_API_KEY` / `GOOGLE_AI_BASE_URL` |
| 2026-04-12 | MiniMax 文本对话新增 `MINIMAX_TEMPERATURE` 可配置项，默认保持 `0.7` |
| 2026-03-20 | Phase 1 后端抽象、Phase 2 Settings UI |
| 2026-04-06 | 新增云端语音 capability routing：`auto` 跟随当前主 Provider，不再因残留 Key 乱触发 |
