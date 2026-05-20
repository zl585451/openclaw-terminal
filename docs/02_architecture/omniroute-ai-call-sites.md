# OmniRoute AI 调用入口盘点 (Phase 1)

本文档根据 OmniRoute 第一阶段的执行原则，对 OpenClaw Terminal (OCT) 系统中所有直接或间接调用模型的入口、配置加载流和工具支持能力进行了系统盘点，以此定义合理的模型映射边界。

## 1. AI 调用入口盘点注册表

以下是 OCT 体系内所有涉及大语言模型（LLM）调用的入口位置：

| 模块 | 调用函数/位置 | 请求类型 | Key 来源 | Base URL 来源 | Model 来源 | 是否支持 tools | 是否主流程 | OmniRoute 第一阶段建议 |
|---|---|---|---|---|---|---|---|---|
| 主聊天流 | `oct-gateway/ai.js` 中的 `streamChat` | 流式 `fetch` / `google-native` | `providerRouter.resolve().apiKey` (源自 `config.getProviderConfig()`) | `providerRouter.resolve().baseUrl` (源自 `config.getProviderConfig()`) | `providerRouter.resolve().model` (源自 `config.getProviderConfig()`) | 是 (由 `toolLoader` 动态加载，受 `supportsTools` 控制) | 是 | `observe-only` |
| HTTP 剧本处理 | `oct-gateway/transport/httpRoutes.js` 中的 `runOneShotCompletion` | 非流式封装 `streamChat` | 同主聊天流 | 同主聊天流 | 同主聊天流 | 否 (强设 `toolChoice: 'none'`) | 否 | `observe-only` |
| 主工具循环 | `oct-gateway/runtime/toolLoop.js` 中的 `handleToolCalls` | 流式 `streamChat` | 同主聊天流 | 同主聊天流 | 同主聊天流 | 是 (带有 `preserveToolChain: true`) | 是 | `observe-only` |
| 独立 Agent | `oct-gateway/agents/agent_runner.js` 中的 `resolveProviderConfig` / `fetch` | 非流式 `fetch` | `config.getProviderConfig().apiKey` 或 `config.DASHSCOPE_API_KEY` | `config.getProviderConfig().baseUrl` 或 `config.DASHSCOPE_BASE_URL` | Agent 指定的 `modelId` 或 `config.DASHSCOPE_MODEL` / `config.OCT_MODEL` | 是 (根据 Agent 声明过滤) | 是 | `observe-only` |
| Script Adapter 各种 Agent | `oct-gateway/script_adapter/agents/*` / `businessAnalysisOrchestrator.js` 等 | 非流式 `chatCompletion` | `resolveProviderFor('script_adapter')` | `resolveProviderFor('script_adapter')` | `resolveProviderFor('script_adapter')` | 否 | 否 | `draft-alias-only` |
| 通用 LLM Client | `oct-gateway/services/llmClient.js` 中的 `chatCompletion` | 非流式 `fetch` | 传参 `provider.apiKey` | 传参 `provider.baseUrl` | 传参 `provider.model` | 否 | 是 | `observe-only` |
| 结果/文本摘要 | `oct-gateway/services/summarizer.js` 中的 `summarize` / `resolveSummarizerProvider` | 非流式 `chatCompletion` | `SUMMARIZER_API_KEY` / `memory.summarizer.api.apiKey` 或当前 provider 的 apiKey | `SUMMARIZER_BASE_URL` / `memory.summarizer.api.baseUrl` 或当前 provider 的 baseUrl | `SUMMARIZER_MODEL` / `memory.summarizer.api.model` 或通过 `chooseFastModel` 选择的快模型 | 否 | 是 | `observe-only` |
| 三级摘要客户端 | `oct-gateway/summarizer/client.js` 中的 `callSummarizer` | 非流式 `fetch` | `config.memory.summarizer.api.apiKey` (强要求) | `config.memory.summarizer.api.baseUrl` (强要求) | `config.memory.summarizer.api.model` (强要求) | 否 | 是 | `observe-only` |
| Embedding 向量客户端 | `oct-gateway/summarizer/embedding_client.js` 中的 `createEmbeddings` | 非流式 `fetch` | `config.memory.vectorRecall.embedding.apiKey` | `config.memory.vectorRecall.embedding.baseUrl` | `config.memory.vectorRecall.embedding.model` | 否 | 是 | `observe-only` |
| 图片分析理解 | `oct-gateway/image_analyzer.js` 中的云端和独立视觉 API | 非流式 `fetch` | 路径 1: `config.DASHSCOPE_API_KEY`；路径 2: `VISION_API_KEY` | 路径 1: `config.DASHSCOPE_BASE_URL`；路径 2: `VISION_BASE_URL` | 路径 1: `DASHSCOPE_MODEL` 或 `vision_model`；路径 2: `VISION_MODEL` | 否 | 否 | `do-not-touch-yet` |
| 生图接口 | `oct-gateway/image_gen.js` 中的 `generateImage` | 非流式 `fetch` / `generateNativeImage` | 独立的 `IMAGE_*_API_KEY` 族 或 `IMAGE_API_KEY` (legacy) | 独立的 `IMAGE_*_BASE_URL` 族 或 `IMAGE_BASE_URL` (legacy) | 独立配置的生图模型 | 否 | 否 | `do-not-touch-yet` |
| 通义万象生图工具 | `oct-gateway/tools/image_gen.js` 中的 `execute` | 异步 `fetch` (DashScope API) | 保险箱万象 Key 或 `WANX_API_KEY` / `DASHSCOPE_IMAGE_KEY` / `config.DASHSCOPE_API_KEY` | 固定 `dashscope.aliyuncs.com` | 固定 `wanx-v1` | 否 | 否 (被作为 tool 调用) | `do-not-touch-yet` |
| Slash 命令工具探测 | `oct-gateway/gateway/slash.js` 中的 `probeModelToolsSupport` | 非流式 `fetch` | 探测时传入的当前 provider `apiKey` | 探测时传入的当前 provider `baseUrl` | 探测时传入的当前 provider `model` | 是 (带强约束 tools 结构) | 否 | `do-not-touch-yet` |

## 2. 入口分类与决策说明

- **主聊天流 & 主工具循环 & 独立 Agent (`observe-only`)**:
  这些入口属于系统的核心生命线，控制着主界面用户的输入、工具的反复迭代以及 Agent 的任务执行。由于第一阶段禁止修改任何核心代码，所以这三者必须保持 `observe-only` 状态。后续阶段的 OmniRoute 会以极低侵入性的 Soft Integration 形式，主要提供参数级别的能力映射。
- **专职摘要、向量化与旁路调用 (`observe-only` / `do-not-touch-yet`)**:
  - 向量化 (Embedding) 与三级摘要客户端属于高度自治、协议差异明显的独立后端功能。这部分直接通过专有配置文件读取，不与主流程共享路由，因此在第一阶段及 Phase 2 均属于 `observe-only`。
  - 图片分析理解 (Vision)、生图等对多模态和生成类接口有极强绑定。第一阶段不作处理 (`do-not-touch-yet`)。
- **Script Adapter 与其他子 Agent (`draft-alias-only`)**:
  这些场景（包含在剧本自愈、重写和提取中的高密度推理）在调用 `llmClient` 时存在别名映射需求。我们可以优先针对这些外部引用较独立的子系统，建立一套基于 OmniRoute 能力定义的逻辑别名草案，并在后续二、三阶段探索软切换与自愈降级。
