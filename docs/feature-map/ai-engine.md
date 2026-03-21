# 1.2 AI 对话引擎

> **最后更新**：2026-03-20 | **状态**：✅ 正常

---

## 做什么
调用 OpenAI 兼容 API，处理流式响应和工具调用。支持多服务商（百炼、DeepSeek、硅基流动、Groq、OpenAI、Ollama 等）。

## 文件
- `oct-gateway/ai.js` — streamChat、请求组装
- `oct-gateway/providers.js` — 服务商预设注册表（baseUrl、模型列表、能力声明）
- `oct-gateway/config.js` — getProviderConfig()、MODEL_REGISTRY

## 调用链
```
streamChat() → config.getProviderConfig() → 按 provider 能力组装请求
            → fetch {baseUrl}/chat/completions → 解析 SSE → onDelta/onDone
```

## 依赖
- `config.getProviderConfig()` — 返回 apiKey、baseUrl、models、supportsStreamOptions
- 各模型能力（tools/thinking）来自 provider.models 或 MODEL_REGISTRY

## 特性
- **Provider 抽象**：根据 `OCT_PROVIDER` / baseUrl 自动推断服务商
- **按模型能力动态组装**：仅支持 tools 的模型才传 `tools`，避免 API 报错
- **百炼失败时自动 fallback 到 DeepSeek**
- **API 返回 model 字段**：解析并传给 onDone，供前端展示

## 验证方法
终端看到 `[AI] model caps`、`[Gateway] Stream done`

## 状态
✅ 正常

---

## 更新日志
| 日期 | 内容 |
|------|------|
| 2026-03-20 | Provider 抽象、多服务商、按模型能力动态组装 |
| 2026-03-20 | 初始拆分 |
