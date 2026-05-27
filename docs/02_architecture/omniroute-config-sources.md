# OmniRoute 配置来源盘点 (Phase 1)

本文档系统盘点并梳理了 OpenClaw Terminal (OCT) 中的 API Key、Base URL、模型名称的配置源、优先级顺序、复用规则、绕过逻辑以及风险点。

## 1. 配置加载源及优先级

OCT 的配置（通过 `config.js` 的 `getEnvOrConfig(key)` 获取）遵循以下严格的优先级级联顺序（优先级从高到低）：

1. **`_fileConfig` (文件配置，最高优先级)**:
   - 解析自 `loadConfigFile()`。会依次尝试：
     1. 环境变量指定的 `OCT_CONFIG_FILE`
     2. Electron 的 `userData` 目录下的 `config.json`（图形化设置面板保存路径，根据操作系统平台不同如 AppData/Roaming/openclaw-terminal/config.json 等）
     3. 系统 Home 目录下的 `.config/openclaw-terminal/config.json`
     4. 网关本地的 `oct-gateway/config.json`
2. **`process.env` (环境变量)**:
   - 包括系统原生环境变量，以及通过网关启动时由 `dotenv` 加载的：
     1. `.env.local`
     2. `.env` (主环境变量，通常包含用户直接配置的 API Key 和代理)
3. **`legacyConfig` (全局遗留配置，最低优先级)**:
   - 解析自 `~/.openclaw/openclaw.json` (对应 CLI 版 OpenClaw 遗留配置文件)

---

## 2. 字段注册表及属性关系

以下是 OCT 所有核心 AI 调用及链路配置项的属性注册表：

| 配置项 | 当前读取位置 | 优先级 | 使用模块 | 风险 | 迁移建议 |
|---|---|---|---|---|---|
| `OCT_PROVIDER` | `config.js` `_currentProvider` | 1. `_fileConfig` <br> 2. `process.env` <br> 3. `inferProviderFromBaseUrl` | 网关核心路由、设置面板渲染 | 修改可能导致前端设置面板或模型列表加载崩溃。 | 严禁删除或重命名。Phase 2 中可作为首选来源，决定默认 provider。 |
| `OCT_MODEL` | `config.js` `_currentModel` | 1. `_fileConfig` <br> 2. `process.env` <br> 3. `legacyConfig.DASHSCOPE_MODEL` | 核心聊天、Agent、能力探测 | 若缺失则默认降级为 `qwen-plus`，可能会造成高阶能力（如思考）失效。 | 第一阶段保持原样（绑定 getter/setter 代理到 `DASHSCOPE_MODEL`）。 |
| `DASHSCOPE_API_KEY` | `config.js` `getProviderConfig()` | 1. `_fileConfig` <br> 2. `process.env` <br> 3. `legacyConfig` | 百炼、百炼Coding、硅基、OpenAI、MiniMax、自定义服务、Wanx 生图工具、读图；Groq 仅作为旧配置 fallback | **混用度极高**。由于设置面板历史上默认将「连接」主 Key 写入该字段，多个 provider 和生图工具会默认将其作为兜底 fallback。直接修改会大面积致盲调用。 | 第一阶段及 Phase 2 必须完全保留。在 Phase 3 中通过 CredentialResolver 做规范化分离。 |
| `DASHSCOPE_BASE_URL` | `config.js` `getProviderConfig()` | 1. `_fileConfig` <br> 2. `process.env` <br> 3. `legacyConfig` | 百炼、百炼Coding、图片云端分析 | 第一阶段必须保留。 | 保持现有优先级，仅作为 `bailian` 族默认 URL 来源。 |
| `DEEPSEEK_API_KEY` / `_BASE_URL` | `config.js` `getProviderConfig()` | 1. `_fileConfig` <br> 2. `process.env` <br> 3. `legacyConfig` | DeepSeek 核心路由、百炼降级 fallback | DeepSeek 独立链路的账密保证。 | 保持不变。 |
| `GOOGLE_AI_API_KEY` / `_BASE_URL` / `GEMINI_API_KEY` | `config.js` `getProviderConfig()`, `googleNative.js` | 1. `_fileConfig` <br> 2. `process.env` <br> 3. `google.profile.json` | Google 原生 SDK 链路、生图 | 独立 Google Scoped 配置。Gemini 在原生与兼容模式间的账密。 | 保持不变。多模态链路在 Phase 2 之前不做软路由。 |
| `MOONSHOT_API_KEY` / `_BASE_URL` | `config.js` `getProviderConfig()` | 1. `_fileConfig` <br> 2. `process.env` | Kimi 开放平台直连 | 针对 `sk-sp-` Key 有前置警告和置空防错。 | 保持不变。 |
| `GROQ_API_KEY` / `_BASE_URL` | `config.js` `getProviderConfig()` | 1. `_fileConfig` <br> 2. `process.env` <br> 3. 旧 `DASHSCOPE_*` Groq 配置 fallback | Groq OpenAI-compatible 直连 | 独立字段匹配 Groq 官方 `GROQ_API_KEY` 接法。 | 保持不变，旧 `DASHSCOPE_*` 只做兼容读取。 |
| `MINIMAX_API_KEY` / `_BASE_URL` | `config.js` `getProviderConfig()` | 1. `_fileConfig` <br> 2. `process.env` <br> 3. `legacyConfig` | MiniMax 官方直连、百炼降级 fallback | MiniMax 官方直连。 | 保持不变。 |
| `CUSTOM_API_KEY` / `_BASE_URL` / `_MODEL` | `config.js` `getProviderConfig()` | 1. `_fileConfig` <br> 2. `process.env` | 自定义兼容 OpenAI 协议服务 | 自定义中转配置。 | 保持不变。 |
| `SILICONFLOW_API_KEY` | `config.js` `getProviderConfig()` | 1. `_fileConfig` <br> 2. `process.env` | 硅基流动服务 | 存在防止百炼 `sk-sp-` Key 混入的定制校验逻辑。 | 保持不变。 |
| `SUMMARIZER_API_KEY` / `_BASE_URL` / `_MODEL` | `services/summarizer.js`, `summarizer/client.js` | 1. `_fileConfig` <br> 2. `process.env` <br> 3. `config.memory.summarizer.api` | 工具返回压缩、系统级三级摘要 | 有两套实现。其中系统级摘要不走 `llmClient`，直接独立账密并发起 raw fetch 请求。 | 保持独立配置。在 Phase 2 中将 `services/summarizer` 纳入逻辑别名。 |
| `SCRIPT_ADAPTER_API_KEY` / `_BASE_URL` / `_MODEL` | `services/llmClient.js`, `script_adapter/**` | 1. `_fileConfig` <br> 2. `process.env` <br> 3. `config.scriptAdapter` | 剧本重写、分析、提取 Agent | 剧本系统高度自洽，若缺失会降级到当前 Active Provider 甚至 摘要配置。 | Phase 2 推荐软集成（Soft Integration）的首批候选者。 |
| `EMBEDDING_API_KEY` / `_BASE_URL` / `_MODEL` | `summarizer/embedding_client.js` | 1. `_fileConfig` <br> 2. `process.env` <br> 3. `config.memory.vectorRecall.embedding` | 向量化嵌入 | 绕过 `getProviderConfig()`，完全独立读取及发起 raw fetch 调用。 | 维持物理隔离。不应纳入普通的 OmniRoute 软集成范围。 |
| `VISION_API_KEY` / `_BASE_URL` / `_MODEL` | `image_analyzer.js` | 1. `_fileConfig` <br> 2. `process.env` | 独立视觉分析路径 2 | 独立视觉调用路径。 | 第一阶段不予改动 (`do-not-touch-yet`)。 |
| `IMAGE_*_API_KEY` / `_BASE_URL` | `image_gen.js` | 1. `_fileConfig` <br> 2. `process.env` | 独立生图处理器旁路 | 分服务商拥有各自的 Key，在解析中层层兜底。 | 第一阶段及二阶段不予改动 (`do-not-touch-yet`)。 |

---

## 3. 混用与绕过规则分析 (Important Findings)

### 3.1 哪些 Provider 当前会复用 `DASHSCOPE_API_KEY`？
当特定 API Key 缺失时，以下预设服务商在加载时，会将 `DASHSCOPE_API_KEY` 作为 fallback Key 加载：
- **硅基流动 (SiliconFlow)**: 复用 `DASHSCOPE_API_KEY`，但如果 Key 带有百炼 Coding Plan 的 `sk-sp-` 前缀，会打印报警并置空（防止 401 报错）。
- **Groq**: 主字段为 `GROQ_API_KEY` / `GROQ_BASE_URL`；仅在旧配置缺少 Groq 专属字段时读取 `DASHSCOPE_API_KEY` 或指向 Groq 的 `DASHSCOPE_BASE_URL` 作为兜底。
- **OpenAI**: 默认在其 `keyEnvVars` 中包含 `DASHSCOPE_API_KEY` 作为兜底。
- **MiniMax**: 默认在其 `keyEnvVars` 中包含 `DASHSCOPE_API_KEY` 作为兜底。
- **Custom (自定义服务)**: 默认在其 `keyEnvVars` 中包含 `DASHSCOPE_API_KEY` 作为兜底。

### 3.2 哪些链路绕过了 `getProviderConfig()`？
以下链路不通过 `config.getProviderConfig()` 进行服务商和账密的统一提取：
1. **三级摘要客户端 (`oct-gateway/summarizer/client.js`)**: 强绑定 `config.memory.summarizer.api`，发起直接的 raw fetch 请求。
2. **Embedding 向量客户端 (`oct-gateway/summarizer/embedding_client.js`)**: 强绑定 `config.memory.vectorRecall.embedding` 配置项，发起直接的 raw fetch 向量接口调用。
3. **生图接口 (`oct-gateway/image_gen.js`)**: 独立解析各自专属生图 Key / URL，不依赖当前聊天的 active provider。
4. **通义万象生图工具 (`oct-gateway/tools/image_gen.js`)**: 被模型调用时，直接解析 Vault 甚至 `WANX_API_KEY` 并直接对 DashScope 发起请求。
5. **图片分析理解路径 1 / 路径 2 (`oct-gateway/image_analyzer.js`)**: 直接硬编码读取 `config.DASHSCOPE_API_KEY` (路径 1) 和 `VISION_API_KEY` (路径 2)，绕过 provider 切换逻辑。
6. **Slash 能力探测 (`oct-gateway/gateway/slash.js`)**: 自行拼装 headers 和 body 发起 raw fetch 请求进行支持性测试。

### 3.3 哪些链路有独立 Key / Model / Base URL？
- **系统摘要**：`SUMMARIZER_API_KEY` / `SUMMARIZER_BASE_URL` / `SUMMARIZER_MODEL`
- **剧本处理**：`SCRIPT_ADAPTER_API_KEY` / `SCRIPT_ADAPTER_BASE_URL` / `SCRIPT_ADAPTER_MODEL`
- **向量检索**：`EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL`
- **视觉理解**：`VISION_API_KEY` / `VISION_BASE_URL` / `VISION_MODEL`
- **生图旁路**：`IMAGE_*_API_KEY` / `IMAGE_*_BASE_URL` (如 `IMAGE_OPENAI_API_KEY`、`IMAGE_SILICONFLOW_API_KEY`、`IMAGE_MINIMAX_API_KEY` 等)

### 3.4 哪些字段不能在第一阶段删除或改名？
- **UI 及基础会话绑定字段**: `OCT_PROVIDER`, `OCT_MODEL`, `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`, `DASHSCOPE_MODEL`
- **主流商户账密字段**: `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `GOOGLE_AI_API_KEY`, `GOOGLE_AI_BASE_URL`, `GEMINI_API_KEY`, `MOONSHOT_API_KEY`, `MINIMAX_API_KEY`, `SILICONFLOW_API_KEY`
- **各旁路专用字段**: `SUMMARIZER_*`, `SCRIPT_ADAPTER_*`, `EMBEDDING_*`, `VISION_*`, `IMAGE_*`

这些字段在第一阶段不应受到任何删除、迁移或改名的物理破坏，以确保系统 100% 的后向兼容与稳定性。
