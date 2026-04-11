# Provider 系统 — AI 服务商市场化

> **最后更新**：2026-04-06 | **状态**：✅ 正常

---

## 做什么
抽象 AI 服务商为统一的 Provider 概念，让用户在 GUI 中选择服务商、填 Key、选模型，无需编辑 .env。

## 文件
- `oct-gateway/providers.js` — 服务商预设注册表
- `oct-gateway/config.js` — getProviderConfig、currentProvider
- `oct-gateway/ai.js` — 按 provider 能力组装请求
- `oct-gateway/index.js` — `/model`、`/provider` 命令
- `src/components/SettingsPanel.tsx` — 服务商选择器 UI

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

## 数据流
```
用户在 Settings 选择服务商/模型
    → save-api-keys 写入 config.json (OCT_PROVIDER, OCT_MODEL, DASHSCOPE_BASE_URL, ...)
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
- `OCT_PROVIDER=deepseek` / `custom` / 其他无云端语音能力的 Provider
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

## 更新日志
| 日期 | 内容 |
|------|------|
| 2026-03-20 | Phase 1 后端抽象、Phase 2 Settings UI |
| 2026-04-06 | 新增云端语音 capability routing：`auto` 跟随当前主 Provider，不再因残留 Key 乱触发 |
