# 2026-04-29 文本改编 Agent 超时加固

## 背景

工作台真实制作阶段失败，章节错误为 `TEXT_REWRITER_REAL_FAILED: LLM 请求超时:45000ms`。失败点发生在 `adapter.audiobook_text_rewriter@1.0` 文本改编 Agent。

## 根因

文本改编 Agent 仍使用硬编码 `timeoutMs: 45000`。这一步需要把 3000 字以上小说正文改成严格 JSON 台本，属于产物生成请求，不应沿用开工分析或工具类短超时。MiniMax 等 provider 在长 JSON 输出时 45 秒窗口不稳定。

## 修改

1. 文本改编 Agent 默认超时调整为 `120000ms`。
2. 支持 `SCRIPT_ADAPTER_TEXT_REWRITER_TIMEOUT_MS` 或 `scriptAdapter.textRewriterTimeoutMs` 覆盖。
3. 配置值限制在 `30000ms` 到 `300000ms`，避免误配成过短或无限等待。
4. 切片改编中只要存在失败切片，当前章节显式失败，不再把失败占位片段包装成成功台本。

## 验证

1. `node --check oct-gateway/script_adapter/agents/textRewriterAgent.js`
2. `npx tsc --noEmit`
3. `npx tsc -p tsconfig.electron.json --noEmit`

