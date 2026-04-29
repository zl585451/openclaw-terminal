# 2026-04-26 Google 工具轮次回传 thinking 状态

## 现象

使用 `google/gemini-3.1-pro-preview` 触发 MCP 搜索工具后，工具结果返回后的续轮请求失败：

> The `reasoning_content` in the thinking mode must be passed back to the API.

或：

> Function call ... is missing a `thought_signature`.

日志里随后可能出现 fallback 到 `deepseek-v4-flash`，但 fallback 会继承同一条 Google 工具消息链，因此也可能继续报同类 `HTTP 400`。

## 原因

此前工具续轮只保留了 OpenAI 标准字段，容易丢掉 provider 私有状态：

- Google Gemini 3.x 预览模型可能在 `delta.reasoning_content` 中返回 thinking-mode 状态，工具续轮必须回传。
- Gemini 3 + function calling 还会在 `tool_calls[].extra_content.google.thought_signature` 中返回 `thought_signature`，OpenAI 兼容层要求在下一轮按原位置回传。
- 这类协议错误属于同一 provider 的工具续写链路问题，不能把不完整历史交给 DeepSeek fallback。
- `429` 属于配额/资源耗尽，不应在同一 turn 内反复重试并继续扩大请求量。

## 修复

- `oct-gateway/ai.js`：工具调用续轮不再限定 DeepSeek；只要本轮流式响应累计到了 `assistantReasoningContent`，就写入 `assistantResponseMessage.reasoning_content`。
- `oct-gateway/ai.js`：流式解析 `delta.tool_calls` 时保留并深合并 `extra_content`，避免丢失 Gemini `thought_signature`。
- `oct-gateway/ai.js`：HTTP 4xx 不再盲目重试；`429`、`thought_signature`、`reasoning_content`、工具续轮错误不再触发跨 provider fallback。
- `oct-gateway/ai.js`：Google 工具续轮从第 1 次工具结果后强制 `tool_choice: none`，让模型进入最终回答，避免同一 turn 连续搜索放大 Vertex 429。
- `oct-gateway/ai.js`：如果工具结果已取得但最终续写仍触发 429，返回已取得的工具摘要和配额说明，而不是只显示原始红色错误。
- `oct-gateway/runtime/toolLoop.js`：既有序列化逻辑保持不变，继续把非空 `assistantResponseMessage.reasoning_content` 和完整 `tool_calls` 写入追加的 assistant 工具消息。
- `oct-gateway/test/toolLoopReasoningContent.test.js`：新增离线单测，覆盖工具续轮保留 `reasoning_content`、Gemini `thought_signature`、协议/配额错误识别。

## 验证

```powershell
node oct-gateway/test/toolLoopReasoningContent.test.js
```
