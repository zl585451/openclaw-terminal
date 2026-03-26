# 1.5 配置系统

> **最后更新**：2026-03-20 | **状态**：✅ 正常

---

## 做什么
加载 API Key、Provider、模型、记忆配置、图片分析配置。支持多 AI 服务商市场化配置。

## 文件
- `oct-gateway/config.js` — 配置加载、getProviderConfig、MODEL_REGISTRY
- `oct-gateway/providers.js` — 服务商预设注册表

## 数据源
`OCT_CONFIG_FILE`（Electron userData/config.json）> `.env` > `~/.openclaw/openclaw.json` > 默认值

## 关键配置
| 配置项 | 说明 |
|--------|------|
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

## 验证方法
终端看到 `[Config] Model: xxx`

## 状态
✅ 正常

---

## 更新日志
| 日期 | 内容 |
|------|------|
| 2026-03-21 | 新增 ai_library 配置节（P1 集成） |
| 2026-03-20 | Provider 抽象、多服务商、OCT_PROVIDER/OCT_MODEL |
| 2026-03-20 | 初始拆分 |
