# Provider 系统 — AI 服务商市场化

> **最后更新**：2026-04-30（新增 New API 外部分发网关 Provider） | **状态**：✅ 正常

---

## 做什么
抽象 AI 服务商为统一的 Provider 概念，让用户在 GUI 中选择服务商、填 Key、选模型，无需编辑 .env。

## 文件
- `src/ui/settings/providerViewHelpers.ts` — beginner/advanced 共用的主对话 API Key 字段映射与展示用取值（不含保存）
- `src/hooks/settings/recommendedModels.ts` — 新手模式推荐模型列表、`BEGINNER_PROVIDER_IDS`、卡片副标题文案映射、`getFirstRecommendedModel` 等（单一来源）
- `src/ui/settings/providerTypes.ts` — 前端设置与 `useApiKeys` 共用的 `ProviderEntry` / `ProvidersState` / `ProviderModelOption` 类型定义（单一来源）
- `oct-gateway/shared/googleBaseUrl.js` — `sanitizeGoogleOpenAiBaseUrl`（网关 `config.js` 与 Electron `main` 共用，避免 `?key=` 与头重复）
- `oct-gateway/providers.js` — 服务商预设注册表
- `oct-gateway/config.js` — getProviderConfig、currentProvider
- `oct-gateway/ai.js` — 按 provider 能力组装请求
- `oct-gateway/services/googleNative.js` — Google Vertex 原生 SDK 适配层（认证、消息转换、函数调用、生图）
- `oct-gateway/index.js` — `/model`、`/provider` 命令
- `src/ui/settings/tabs/ConnectionTabView.tsx` — 连接页：服务商选择器、Key、Base URL、测试连接；**硅基流动**（`OCT_PROVIDER=siliconflow`）下「当前模型」为文本框，直接编辑 `OCT_MODEL`，并附带常用模型快捷填入
- `src/ui/settings/providerConnectionSchema.ts` — provider 到 Base URL 字段、provider 切换回填、测试连接 payload 的映射层；用于减少 `ConnectionTabView.tsx` 中的 provider 条件分支

## 预设服务商
| ID | 名称 | Base URL |
|----|------|----------|
| bailian | 阿里云百炼 | dashscope.aliyuncs.com |
| bailian-coding | 阿里云百炼 Coding Plan | coding.dashscope.aliyuncs.com |
| deepseek | DeepSeek | api.deepseek.com |
| siliconflow | 硅基流动 | api.siliconflow.cn |
| moonshot | Kimi 开放平台 | api.moonshot.cn |
| groq | Groq | api.groq.com |
| openai | OpenAI | api.openai.com |
| newapi | New API 外部分发网关 | 127.0.0.1:3000/v1（可改） |
| ollama | Ollama 本地 | localhost:11434 |
| custom | 自定义 | 用户填写 |
| google | Google Gemini（Vertex AI API 密钥） | aiplatform.googleapis.com/.../endpoints/openapi（可改） |

### Google：`google` 默认改为 Vertex 原生 SDK

- **2026-04-28 起默认主通道**：`google` provider 优先走 `@google/genai` 的 **Vertex AI 原生 SDK**，不再把 Google 只当作 OpenAI 兼容分支特判。
- **Base URL 的新职责**：`GOOGLE_AI_BASE_URL` 仍保留，但主要用于从
  `https://aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/endpoints/openapi`
  里解析 `PROJECT_ID` 与 `LOCATION`，供原生 SDK 初始化 Vertex 客户端。
- **认证**：
  - 首选 `GOOGLE_AI_API_KEY` / Vertex API Key
  - 也可通过 `GOOGLE_CLOUD_PROJECT`、`GOOGLE_CLOUD_LOCATION` 配合标准 Vertex 认证使用
- **兼容开关**：
  - `GOOGLE_API_MODE=native`：默认，走原生 SDK
  - `GOOGLE_API_MODE=openai_compat`：显式回退旧的 OpenAI 兼容链路
- **Google 独立运行时开关**：
  - `GOOGLE_HTTPS_PROXY`：仅 Google 请求生效
  - `GOOGLE_TOOLS_MODE=off|auto|on`：仅影响旧兼容层工具策略；原生 SDK 路径下函数调用能力由模型原生声明处理
- **图像能力**：
  - Gemini 图像模型：`gemini-2.5-flash-image`、`gemini-3-pro-image-preview`
  - Imagen：`imagen-*`
  - `image.generate` 现在可通过 Google 原生服务层路由到 Gemini 图像模型或 Imagen

## 数据流
```
用户在 Settings 选择服务商/模型
    → save-api-keys 写入 config.json (OCT_PROVIDER, OCT_MODEL, 各服务商 Key/Base URL，可选 **HTTPS_PROXY** 供网关访问境外 API，...)
    → 重启 Gateway
    → config.loadConfigFile() 读取
    → getProviderConfig() 返回 apiKey/baseUrl/models
    → ai.js streamChat 按 provider 能力组装请求
```

### Beginner / Advanced 设置分层

- 2026-04-22 起，连接页支持 `beginner` / `advanced` 两层。
- `beginner` 模式只暴露 3 个默认 provider 卡片（`bailian-coding` / `deepseek` / `minimax`）、单一 API Key 输入框和推荐模型。
- `advanced` 模式保留完整 provider / key / model / baseUrl / proxy 表单。
- 分层只改变设置页入口，不改变 `PROVIDERS`、`MODEL_REGISTRY`、Gateway 请求拼装或后端 provider 能力声明。

### New API 外部分发网关

- `OCT_PROVIDER=newapi` 用于把 OCT 接到独立部署的 New API 服务，而不是把 New API 嵌入 OCT。
- 配置键：
  - `NEWAPI_API_KEY`：New API 后台创建的令牌。
  - `NEWAPI_BASE_URL`：New API 的 OpenAI 兼容入口，默认 `http://127.0.0.1:3000/v1`。
  - `OCT_MODEL` / `CUSTOM_MODEL`：填写 New API 后台渠道可识别的模型 ID。
- 运行时按 OpenAI 兼容 `/chat/completions` 调用；New API 自己负责上游渠道、额度、用量统计、限流与计费。
- 设计边界：OCT 只保存“连到哪个 New API 网关、使用哪个令牌和模型”；用户充值、渠道分发、余额扣费仍由 New API 后台负责。

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

### Thinking 模型 + 工具调用续轮

当 OpenAI 兼容流式响应在 `delta.reasoning_content` 中返回思考片段，并且同一轮触发 `tool_calls` 时，Gateway 会把该 `reasoning_content` 写回随后追加的 `assistant` 工具调用消息，再与 `tool` 结果一起发起续轮请求。

这条规则不限定 DeepSeek；Google Gemini 3.x 预览等 thinking-mode 模型也可能要求工具续轮原样回传该字段，否则会返回 `HTTP 400`：`The reasoning_content in the thinking mode must be passed back to the API.`。

从 2026-04-17 起，网关内部能力升级为三态：

- `supported`：允许工具执行（`supportsTools=true`）
- `unsupported`：明确不支持工具执行
- `unknown`：能力未知，默认按禁用执行处理，并在状态中显式透出

能力来源会标记在 `capabilitySource`（例如 `provider_model_def`、`registry_exact`、`registry_prefix`、`fallback_unknown`）。

## 多供应商模型 ID 抽象（2026-04-17）

为适配不同供应商的模型命名差异（如 `Pro/zai-org/GLM-5`、`Qwen/Qwen3.5-32B`），网关采用分层抽象：

1. `normalizeModelId(modelId)`：统一大小写、去常见前缀/后缀，提取尾段模型名。
2. `buildModelIdCandidates(modelId)`：生成候选 ID（原始、lowercase、尾段、归一化）。
3. 注册表匹配顺序：`registry_exact -> registry_prefix -> fallback_unknown`。
4. `fallback_unknown` 时执行运行时探测（`runtime_probe`）并写入缓存。
5. 下次同 `provider + baseUrl + normalizedModelId` 直接读 `runtime_probe_cache`，避免重复探测。

探测缓存默认 TTL：
- `supported`: 7 天
- `unsupported`: 7 天
- `unknown`: 1 天

## 自定义模型工具开关

- `OCT_PROVIDER=custom` 时，自定义模型默认 `tools=false`（安全默认）
- 可通过 `CUSTOM_MODEL_SUPPORTS_TOOLS=true` 显式开启
- `/status` 与连接握手 `hello-ok.capabilities` 会显示当前工具能力与来源

---

## MiniMax 温度参数

- MiniMax 文本对话默认以 `0.7` 发送 `temperature`
- 可通过 `MINIMAX_TEMPERATURE` 覆盖，支持放在 `.env`、`.env.local` 或用户运行时 `config.json`
- 合法范围按官方接口约束为 `0 < x <= 1`；超出范围时 Gateway 会回退到 `0.7`

## MiniMax 消息角色兼容

- MiniMax 独立接口不接受 `role=system`
- Gateway 在 `provider=minimax` 时，会在发送前把 system prompt 与澄清规则合并到第一条 `user` 消息前缀
- 该转换仅作用于 MiniMax，不改变 Google、DashScope、DeepSeek、自定义 OpenAI 兼容服务的消息结构

## 更新日志
| 日期 | 内容 |
|------|------|
| 2026-04-30 | 新增 `newapi` Provider：支持 `NEWAPI_API_KEY` / `NEWAPI_BASE_URL`，用于接入独立部署的 New API 外部分发网关 |
| 2026-04-26 | thinking-mode 工具续轮不再只对 DeepSeek 回传 `reasoning_content`；凡流式响应实际返回该字段，Gateway 都会在 assistant tool-call 消息中原样带回，修复 Google Gemini 3.x 预览工具调用后的 400 |
| 2026-04-23 | `moonshot` provider 对齐 Kimi 官方平台：控制台链接改为 `platform.kimi.com`，默认模型切到 `kimi-k2.6`，并补齐 `kimi-k2.5 / kimi-k2-turbo-preview` 等官方模型；`moonshot-v1-*` 仅作为兼容选项保留 |
| 2026-04-22 | 连接页新增 beginner / advanced 两层：新手模式只暴露 3 个默认 provider 卡片与单一 Key 入口；不改 Gateway provider 注册与能力声明 |
| 2026-04-21 | MiniMax 独立接口不接受 `role=system`，Gateway 改为仅对 `provider=minimax` 将 system 内容并入第一条 user 消息，避免 400 invalid params |
| 2026-04-17 | 新增模型 ID 归一化与动态能力探测缓存（runtime_probe/runtime_probe_cache），缓解跨供应商模型命名不一致问题 |
| 2026-04-17 | 能力协商升级为三态（supported/unknown/unsupported），并在 `/status` 与 `hello-ok.capabilities` 透出来源；`custom` 模型默认工具关闭，可由 `CUSTOM_MODEL_SUPPORTS_TOOLS=true` 显式开启 |
| 2026-04-14 | `google` 主对话改为仅 `x-goog-api-key`，避免与 Bearer 叠用导致 400；文档与测试连接 IPC 同步 |
| 2026-04-14 | 文档：`google` 出现 400 *Multiple authentication credentials* 时的排查（Base URL 勿带 `?key=`、`NODE_USE_ENV_PROXY` 与 undici 代理勿叠用）；网关侧已做 URL 净化与代理启动时清理 `NODE_USE_ENV_PROXY` |
| 2026-04-28 | Google 型号清单同步官方命名：保留 `gemini-3.1-pro-preview`，新增 `gemini-3.1-flash-lite-preview`，移除前端已停用的 `gemini-3-pro-preview` 展示，并修正历史错误降级映射 |
| 2026-04-13 | 扩充 `google` 预设模型（2.5 / 3.x 预览），默认 `gemini-2.5-flash`；文档区分 Generative Language OpenAI 兼容层与 Vertex 原生推理 API |
| 2026-04-13 | 新增 `google` Provider（Vertex AI Studio API 密钥 + Gemini OpenAI 兼容端点）；配置键 `GOOGLE_AI_API_KEY` / `GOOGLE_AI_BASE_URL` |
| 2026-04-19 | 新增 `GOOGLE_HTTPS_PROXY`（Google 独立代理）与 `GOOGLE_TOOLS_MODE`（`off/auto/on`）；默认 `auto` 下 Google 工具能力走 runtime probe，不影响其他 Provider |
| 2026-04-12 | MiniMax 文本对话新增 `MINIMAX_TEMPERATURE` 可配置项，默认保持 `0.7` |
| 2026-03-20 | Phase 1 后端抽象、Phase 2 Settings UI |
| 2026-04-06 | 新增云端语音 capability routing：`auto` 跟随当前主 Provider，不再因残留 Key 乱触发 |
