# 2026-04-24 DeepSeek 工具轮次回传 `reasoning_content`

## 现象

使用 `deepseek-v4-flash` 等模型在首轮返回 `tool_calls`（如 `canvas`）后，下一轮 `chat/completions` 请求返回 **HTTP 400**：

> The `reasoning_content` in the thinking mode must be passed back to the API.

## 原因

流式响应中模型会在 `delta.reasoning_content` 中输出思考片段；工具循环里组装的 assistant 消息只包含 `content` 与 `tool_calls`，未带上 `reasoning_content`，违反 DeepSeek 官方多轮协议要求。

## 修复

- `oct-gateway/ai.js`：流式解析时累积 `assistantReasoning_content`，在调用 `handleToolCalls` 时（仅 `provider.id === 'deepseek'` 且非空）写入 `assistantResponseMessage`。
- `oct-gateway/runtime/toolLoop.js`：构造发往 API 的 assistant 消息时，若入参含非空 `reasoning_content` 则一并序列化。

## 无关日志说明

若日志中出现 `WebSocket 已断开 code=1005` 且紧接「保存配置 / 重启 Gateway」，属于客户端主动断开与网关重启，与 canvas 工具本身无直接关系。
