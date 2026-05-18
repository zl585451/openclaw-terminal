# 1.5 配置系统

> **最后更新**：2026-05-18 | **状态**：✅ 正常

---

## 做什么
加载 API Key、Provider、模型、记忆配置、图片分析配置。支持多 AI 服务商市场化配置。

## 文件
- `oct-gateway/config.js` — 配置加载、getProviderConfig、MODEL_REGISTRY
- `oct-gateway/providers.js` — 服务商预设注册表
- `oct-gateway/config/fileSources.js` — runtime config、google scoped config、legacy openclaw config 读取与命中路径解析
- `oct-gateway/config/probeCache.js` — provider capability probe cache 读写
- `oct-gateway/config/memoryConfig.js` — memory/summarizer/vectorRecall 默认值与合并
- `oct-gateway/config/agentPermissions.js` — Agent 权限默认值与归一化
- `oct-gateway/config/providerRuntime.js` — provider 推断、配置读取器、getProviderConfig 解析

## 数据源
`OCT_CONFIG_FILE`（Electron userData/config.json）> `.env` / `.env.local` > `~/.openclaw/openclaw.json` > 仓库默认值

### 产品级配置分层

为兼顾**发布安全**和**本地持续开发**，建议按以下三层理解：

1. **仓库默认配置**
   - 文件：`oct-gateway/config.json`
   - 用途：产品默认值、可公开提交
   - 约束：不得包含真实 API Key、个人代理偏好、个人服务地址

2. **本地开发配置**
   - 文件：项目根目录 `.env.local` / `.env`
   - 用途：开发者自己的 API Key、本地联调覆盖项
   - 约束：不提交到仓库

3. **用户运行时配置**
   - 文件：Electron `userData/config.json`
   - 用途：安装包用户在设置页写入的 provider、model、API Key、个性化偏好
   - 约束：运行时生成，不放仓库

### 推荐实践

- **发版前**：只保留仓库默认值，确保 `config.json` 不含真实密钥
- **本地开发**：把 API Key 放进 `.env.local` 或设置页写入的 `userData/config.json`
- **不要**依赖仓库内硬编码密钥维持开发体验

### 示例文件

- 安全示例：`oct-gateway/config.example.json`
- 实际仓库默认值：`oct-gateway/config.json`

## 关键配置
| 配置项 | 说明 |
|--------|------|
| `OCT_SETTINGS_MODE` | 设置页展示模式：`beginner` / `advanced`，仅前端 UI 使用，Gateway 忽略 |
| `OCT_PROVIDER` | 当前服务商 ID（bailian-coding、deepseek、siliconflow 等） |
| `OCT_MODEL` | 当前模型 ID |
| `DASHSCOPE_API_KEY` | 百炼/Coding Plan 等使用 |
| `DEEPSEEK_API_KEY` | DeepSeek 使用 |
| `DASHSCOPE_BASE_URL` | 百炼 Base URL |
| `DEEPSEEK_BASE_URL` | DeepSeek Base URL |
| `memory.*` | 记忆配置 |
| `ai_library.*` | AI.library 知识库（enabled、url、timeout_ms、default_top_k） |

## Provider 系统
- **PROVIDERS**：预设服务商（bailian、bailian-coding、deepseek、siliconflow、moonshot、groq、openai、ollama、custom）
- **getProviderConfig()**：返回当前 provider 的 apiKey、baseUrl、models
- **MODEL_REGISTRY**：模型能力（supportsTools、supportsStreamOptions、maxTokens）

## 设置页分层

- 连接配置页从 2026-04-22 起支持 `beginner / advanced` 两层模式。
- `OCT_SETTINGS_MODE` 持久化到 Electron `userData/config.json`，用于记住用户上次看到的设置层级。
- 该字段不参与 Gateway 配置解析，也不会改变 `getProviderConfig()` 的加载优先级。

## 验证方法
终端看到 `[Config] Model: xxx`

## 状态
✅ 正常

---

## 更新日志
| 日期 | 内容 |
|------|------|
| 2026-05-18 | Phase 2 持续拆分：将 runtime config source、google scoped config、legacy openclaw config 读取，以及 probe cache、memory config、agent permissions、provider runtime 解析从 `config.js` 抽到 `oct-gateway/config/` 下独立模块，`config.js` 保持对外接口不变 |
| 2026-04-22 | 新增 `OCT_SETTINGS_MODE`：设置页支持 beginner / advanced 两层模式，字段仅供前端 UI 使用 |
| 2026-03-21 | 新增 ai_library 配置节（P1 集成） |
| 2026-03-20 | Provider 抽象、多服务商、OCT_PROVIDER/OCT_MODEL |
| 2026-03-20 | 初始拆分 |
